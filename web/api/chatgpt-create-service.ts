import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { db, getAdmin } from './_firebase-admin.js'

/**
 * Authenticated merchant service API. This is NOT an OAuth endpoint:
 * a ChatGPT app must first implement OAuth account linking and exchange
 * its user access token for a server-verified Sedifex identity.
 * Never expose Firebase ID tokens or website integration keys to a model.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const match = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))
  if (!match) return res.status(401).json({ error: 'Authentication required' })

  try {
    const identity = await getAuth(getAdmin()).verifyIdToken(match[1], true)
    const input = req.body as Record<string, unknown> | null
    const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : ''
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    const description = typeof input?.description === 'string' ? input.description.trim() : ''
    const price = input?.price
    const durationMinutes = input?.durationMinutes
    const currency = input?.currency === 'USD' ? 'USD' : 'GHS'
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storeId) || !name || name.length > 120 ||
        description.length > 2000 || typeof price !== 'number' || !Number.isFinite(price) ||
        price < 0 || price > 100000000 || typeof durationMinutes !== 'number' ||
        !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) {
      return res.status(400).json({ error: 'Invalid service details' })
    }

    const firestore = db()
    const storeRef = firestore.collection('stores').doc(storeId)
    const store = await storeRef.get()
    if (!store.exists) return res.status(404).json({ error: 'Store not found' })
    const data = store.data() || {}
    // Fail closed: only the actual owner may create services in this initial version.
    // Team roles and linked stores require a separately reviewed authorization policy.
    const owner = data.ownerUid === identity.uid || data.ownerId === identity.uid ||
      (storeId === identity.uid)
    if (!owner) return res.status(403).json({ error: 'Store owner access required' })

    const serviceRef = storeRef.collection('services').doc()
    await serviceRef.create({
      storeId, name, description, price, currency,
      durationMinutes, itemType: 'service', type: 'SERVICE',
      createdBy: identity.uid, source: 'chatgpt-integration',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return res.status(201).json({ ok: true, id: serviceRef.id, storeId, name, price, currency, durationMinutes })
  } catch {
    return res.status(401).json({ error: 'Invalid authentication or unavailable service' })
  }
}
