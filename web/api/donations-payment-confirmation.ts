import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

function sanitizeString(value: unknown, max = 140) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  const storeId = sanitizeString(req.body?.storeId, 120)
  const reference = sanitizeString(req.body?.reference, 140)
  const provider = sanitizeString(req.body?.provider, 40) || 'paystack'
  const status = sanitizeString(req.body?.status, 40)
  const amount = Number(req.body?.amount)
  const transactionId = sanitizeString(req.body?.transactionId, 140)

  if (!storeId || !reference || !status) {
    return res.status(400).json({ error: 'storeId, reference and status are required.' })
  }

  const firestore = db()
  const txSnap = await firestore
    .collection('fund_transactions')
    .where('storeId', '==', storeId)
    .where('reference', '==', reference)
    .limit(1)
    .get()

  if (txSnap.empty) {
    return res.status(404).json({ error: 'Matching donation transaction not found.' })
  }

  const txDoc = txSnap.docs[0]
  const success = status === 'success' || status === 'captured' || status === 'paid'

  await txDoc.ref.set({
    status: success ? 'captured' : 'failed',
    provider,
    providerReference: reference,
    providerTransactionId: transactionId || null,
    confirmedAmount: Number.isFinite(amount) ? amount : null,
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  if (success) {
    await firestore.collection('communications_queue').add({
      storeId,
      event: 'donation.captured',
      fundTransactionId: txDoc.id,
      provider,
      reference,
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  return res.status(200).json({ ok: true, status: success ? 'captured' : 'failed', fundTransactionId: txDoc.id })
}
