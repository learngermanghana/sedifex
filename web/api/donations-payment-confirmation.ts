import type { VercelRequest, VercelResponse } from '@vercel/node'
import { confirmDonation } from './_confirm-donation.js'

// Public callbacks may request verification; only Paystack's authenticated API
// determines status and amount. Never accept a caller-supplied payment status.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : ''
  const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : ''
  if (!reference || reference.length > 140 || !storeId) return res.status(400).json({ error: 'storeId and reference are required.' })
  try {
    const result = await confirmDonation(reference, storeId)
    return res.status(200).json({ ok: true, ...result })
  } catch {
    return res.status(409).json({ error: 'Unable to verify this donation. Please retry after payment completes.' })
  }
}
