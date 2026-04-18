import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

type StoreRecord = {
  storeName?: unknown
  businessName?: unknown
  companyName?: unknown
  name?: unknown
  customerIntakeTagline?: unknown
}

function sanitizeString(value: unknown, max = 200): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function getStoreName(raw: StoreRecord | undefined): string | null {
  if (!raw) return null
  const candidates = [raw.storeName, raw.businessName, raw.companyName, raw.name]
  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 80)
    if (value) return value
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const firestore = db()
  if (req.method === 'GET') {
    const storeId = sanitizeString(req.query.storeId, 100)
    if (!storeId) return res.status(400).json({ error: 'Missing storeId.' })

    const snapshot = await firestore.collection('stores').doc(storeId).get()
    if (!snapshot.exists) return res.status(404).json({ error: 'Store not found.' })
    const raw = snapshot.data() as StoreRecord | undefined

    return res.status(200).json({
      storeName: getStoreName(raw),
      tagline: sanitizeString(raw?.customerIntakeTagline, 180) || 'Share your details so we can serve you better.',
    })
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
    const storeId = sanitizeString(body.storeId, 100)
    const name = sanitizeString(body.name, 120)
    const phone = sanitizeString(body.phone, 40)
    const email = sanitizeString(body.email, 120).toLowerCase()
    const notes = sanitizeString(body.notes, 500)
    const source = 'public-intake-link'

    if (!storeId) return res.status(400).json({ error: 'Missing storeId.' })
    if (!name) return res.status(400).json({ error: 'Name is required.' })
    if (!phone && !email) {
      return res.status(400).json({ error: 'Provide at least a phone number or email.' })
    }

    const storeSnapshot = await firestore.collection('stores').doc(storeId).get()
    if (!storeSnapshot.exists) {
      return res.status(404).json({ error: 'This link is no longer valid.' })
    }

    await firestore.collection('customers').add({
      storeId,
      name,
      displayName: name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      source,
      tags: ['Public Invite'],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed.' })
}
