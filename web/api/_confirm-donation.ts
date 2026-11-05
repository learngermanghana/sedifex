import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

export async function confirmDonation(reference: string, expectedStoreId?: string) {
  const secret = (process.env.PAYSTACK_SECRET || process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY_LIVE || '').trim()
  if (!secret) throw new Error('Payment verification is not configured.')
  const response = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
    headers: { Authorization: 'Bearer ' + secret },
  })
  const result = await response.json()
  const payment = result?.data
  if (!response.ok || !result?.status || payment?.status !== 'success' || payment.reference !== reference) {
    throw new Error('Payment has not been verified as successful.')
  }
  const firestore = db()
  const matches = await firestore.collection('fund_transactions').where('reference', '==', reference).limit(2).get()
  if (matches.size !== 1) throw new Error('A unique donation transaction was not found.')
  const ref = matches.docs[0].ref
  return firestore.runTransaction(async tx => {
    const snapshot = await tx.get(ref)
    const donation = snapshot.data()!
    if (expectedStoreId && donation.storeId !== expectedStoreId) throw new Error('Donation workspace mismatch.')
    const expectedMajor = Number(donation.payment?.customerTotal ?? donation.amount)
    if (!Number.isFinite(expectedMajor) || Math.round(expectedMajor * 100) !== Number(payment.amount) ||
        donation.currency !== payment.currency ||
        (payment.metadata?.storeId && payment.metadata.storeId !== donation.storeId) ||
        (payment.metadata?.fundTransactionId && payment.metadata.fundTransactionId !== ref.id)) {
      throw new Error('Donation amount, currency or workspace mismatch.')
    }
    const donorRef = donation.donorId ? firestore.collection('donor_profiles').doc(donation.donorId) : null
    const donor = donorRef ? await tx.get(donorRef) : null
    if (donor?.exists && donor.data()?.storeId !== donation.storeId) throw new Error('Donor workspace mismatch.')
    const firstConfirmation = donation.accountingConfirmed !== true
    tx.set(ref, {
      status: 'captured', provider: 'paystack', providerReference: reference,
      confirmedAmount: Number(donation.amount), providerAmountPaid: Number(payment.amount) / 100,
      accountingConfirmed: true,
      confirmedAt: donation.confirmedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      payment: { ...donation.payment, status: 'captured', reference, amountPaid: Number(payment.amount) / 100 },
    }, { merge: true })
    if (firstConfirmation && donorRef && donor?.exists) {
      tx.set(donorRef, {
        lifetimeGiving: FieldValue.increment(Number(donation.amount)),
        lastGiftAmount: Number(donation.amount),
        lastGiftDate: donation.date,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    if (firstConfirmation) {
      tx.set(firestore.collection('communications_queue').doc('donation_' + ref.id), {
        storeId: donation.storeId, event: 'donation.captured', fundTransactionId: ref.id,
        provider: 'paystack', reference, status: 'queued', createdAt: FieldValue.serverTimestamp(),
      })
    }
    return { fundTransactionId: ref.id, status: 'captured' }
  })
}
