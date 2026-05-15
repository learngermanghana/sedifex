import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace('Bearer ', '') : ''
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const firestore = db()
  const queueSnap = await firestore.collection('communications_queue').where('status', '==', 'queued').limit(25).get()
  let processed = 0

  for (const job of queueSnap.docs) {
    const data = job.data() as { storeId?: string; fundTransactionId?: string; event?: string }
    if (!data.storeId || !data.fundTransactionId) continue

    const txRef = firestore.collection('fund_transactions').doc(data.fundTransactionId)
    const txSnap = await txRef.get()
    if (!txSnap.exists) {
      await job.ref.set({ status: 'failed', failureReason: 'transaction_missing', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      continue
    }

    const tx = txSnap.data() as { donorId?: string; amount?: number; currency?: string; reference?: string }
    const receiptRef = await firestore.collection('donation_receipts').add({
      storeId: data.storeId,
      fundTransactionId: data.fundTransactionId,
      donorId: tx.donorId || null,
      amount: tx.amount || 0,
      currency: tx.currency || 'GHS',
      reference: tx.reference || null,
      event: data.event || 'donation.captured',
      generatedAt: FieldValue.serverTimestamp(),
      deliveryStatus: 'queued',
    })

    await firestore.collection('donor_comms').add({
      storeId: data.storeId,
      donorId: tx.donorId || null,
      channel: 'email',
      template: 'donation-receipt-v1',
      payload: {
        receiptId: receiptRef.id,
        amount: tx.amount || 0,
        currency: tx.currency || 'GHS',
        reference: tx.reference || null,
      },
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    })

    await job.ref.set({ status: 'processed', processedAt: FieldValue.serverTimestamp() }, { merge: true })
    processed += 1
  }

  return res.status(200).json({ ok: true, processed })
}
