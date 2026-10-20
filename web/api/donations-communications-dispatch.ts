import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace('Bearer ', '') : ''
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  const firestore = db()
  const queue = await firestore.collection('communications_queue').where('status', '==', 'queued').limit(25).get()
  let processed = 0
  for (const job of queue.docs) {
    const didProcess = await firestore.runTransaction(async transaction => {
      const current = await transaction.get(job.ref)
      const data = current.data()
      if (data?.status !== 'queued' || !data.storeId || !data.fundTransactionId) return false
      const donation = await transaction.get(firestore.collection('fund_transactions').doc(data.fundTransactionId))
      const gift = donation.data()
      if (!gift || gift.storeId !== data.storeId || gift.status !== 'captured') {
        transaction.set(job.ref, { status: 'failed', failureReason: 'donation_not_verified' }, { merge: true })
        return false
      }
      const receiptId = 'donation_' + donation.id
      transaction.set(firestore.collection('donation_receipts').doc(receiptId), {
        storeId: data.storeId, fundTransactionId: donation.id, donorId: gift.donorId || null,
        amount: gift.amount, currency: gift.currency || 'GHS', reference: gift.reference || null,
        generatedAt: FieldValue.serverTimestamp(), deliveryStatus: 'queued',
      })
      transaction.set(firestore.collection('donor_comms').doc(receiptId), {
        storeId: data.storeId, donorId: gift.donorId || null, channel: 'email',
        template: 'donation-receipt-v1', status: 'queued',
        payload: { receiptId, amount: gift.amount, currency: gift.currency || 'GHS', reference: gift.reference || null },
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.set(job.ref, { status: 'processed', processedAt: FieldValue.serverTimestamp() }, { merge: true })
      return true
    })
    if (didProcess) processed += 1
  }
  return res.status(200).json({ ok: true, processed })
}
