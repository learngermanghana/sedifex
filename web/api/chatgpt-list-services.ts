import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { db, getAdmin } from './_firebase-admin.js'

// Owner-scoped read-only catalog API for future OAuth-backed ChatGPT tools.
// Firebase ID tokens are only for internal authenticated Sedifex clients.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))
  if (!bearer) return res.status(401).json({ error: 'Authentication required' })

  let uid: string
  try {
    uid = (await getAuth(getAdmin()).verifyIdToken(bearer[1], true)).uid
  } catch {
    return res.status(401).json({ error: 'Invalid authentication' })
  }
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : ''
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storeId)) {
    return res.status(400).json({ error: 'Invalid storeId' })
  }
  try {
    const firestore = db()
    const store = await firestore.collection('stores').doc(storeId).get()
    if (!store.exists) return res.status(404).json({ error: 'Store not found' })
    const data = store.data() || {}
    if (data.ownerUid !== uid && data.ownerId !== uid && storeId !== uid) {
      return res.status(403).json({ error: 'Store owner access required' })
    }
    const snapshot = await firestore.collection('products')
      .where('storeId', '==', storeId).limit(250).get()
    const services = snapshot.docs.filter(doc => {
      const item = doc.data()
      return item.itemType === 'service' || item.type === 'SERVICE'
    }).map(doc => {
      const item = doc.data()
      return {
        id: doc.id, name: item.name ?? '', description: item.description ?? '',
        price: item.price ?? null, currency: item.currency ?? 'GHS',
        durationMinutes: item.durationMinutes ?? null,
        isPublished: item.isPublished === true,
        isWebsiteVisible: item.isWebsiteVisible === true,
      }
    })
    return res.status(200).json({ ok: true, storeId, services })
  } catch {
    return res.status(503).json({ error: 'Service list temporarily unavailable' })
  }
}
