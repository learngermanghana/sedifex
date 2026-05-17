import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, timingSafeEqual } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

type IntakeMode = 'lead' | 'donation'

function sanitizeString(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizePhone(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return raw.startsWith('+') ? `+${digits}` : `+${digits}`
}

function isValidEmail(value: string) {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function verifyApiKey(req: VercelRequest, expected: string) {
  const supplied = sanitizeString(req.headers['x-api-key'], 200)
  if (!supplied || !expected) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  const storeId = sanitizeString(req.headers['x-store-id'], 120)
  const apiKey = process.env.DONATIONS_INTAKE_API_KEY || ''
  if (!storeId) return res.status(400).json({ error: 'Missing x-store-id header.' })
  if (!verifyApiKey(req, apiKey)) return res.status(401).json({ error: 'Unauthorized.' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const donorInput = (body.donor ?? {}) as Record<string, unknown>

  const mode = sanitizeString(body.mode, 20) === 'donation' ? 'donation' : 'lead'
  const donorName = sanitizeString(donorInput.name, 120)
  const email = normalizeEmail(sanitizeString(donorInput.email, 120))
  const phone = normalizePhone(sanitizeString(donorInput.phone, 40))
  const amount = Number(body.amount)
  const currency = sanitizeString(body.currency, 12) || 'GHS'
  const fundId = sanitizeString(body.fundId, 120)
  const project = sanitizeString(body.project, 160)
  const message = sanitizeString(body.message, 500)
  const reference = sanitizeString(body.reference, 140)
  const idempotencyKey = sanitizeString(req.headers['idempotency-key'], 140)

  if (!donorName) return res.status(400).json({ error: 'Donor name is required.' })
  if (!email && !phone) return res.status(400).json({ error: 'Provide donor email or phone.' })
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid donor email.' })
  if (mode === 'donation' && (!Number.isFinite(amount) || amount <= 0 || !fundId)) {
    return res.status(400).json({ error: 'For donation mode, amount and fundId are required.' })
  }
  if (!idempotencyKey) return res.status(400).json({ error: 'Missing idempotency-key header.' })

  const firestore = db()
  const dedupeRef = firestore.collection('integration_idempotency').doc(`${storeId}_${idempotencyKey}`)
  const dedupeSnap = await dedupeRef.get()
  if (dedupeSnap.exists) return res.status(200).json({ ok: true, duplicate: true })

  const donorLookup = email
    ? await firestore.collection('customers').where('storeId', '==', storeId).where('email', '==', email).limit(1).get()
    : phone
      ? await firestore.collection('customers').where('storeId', '==', storeId).where('phone', '==', phone).limit(1).get()
      : null

  let donorId: string
  let donorProfileId: string
  if (donorLookup && !donorLookup.empty) {
    donorId = donorLookup.docs[0].id
    await donorLookup.docs[0].ref.set({
      name: donorName,
      displayName: donorName,
      email: email || null,
      phone: phone || null,
      source: 'website-donation-intake',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  } else {
    const donorRef = await firestore.collection('customers').add({
      storeId,
      name: donorName,
      displayName: donorName,
      email: email || null,
      phone: phone || null,
      source: 'website-donation-intake',
      tags: ['Donor'],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    donorId = donorRef.id
  }

  const donorProfileLookup = email
    ? await firestore.collection('donor_profiles').where('storeId', '==', storeId).where('email', '==', email).limit(1).get()
    : phone
      ? await firestore.collection('donor_profiles').where('storeId', '==', storeId).where('phone', '==', phone).limit(1).get()
      : null

  if (donorProfileLookup && !donorProfileLookup.empty) {
    donorProfileId = donorProfileLookup.docs[0].id
    await donorProfileLookup.docs[0].ref.set({
      name: donorName,
      email: email || null,
      phone: phone || null,
      source: 'website-donation-intake',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  } else {
    const donorProfileRef = await firestore.collection('donor_profiles').add({
      storeId,
      name: donorName,
      email: email || null,
      phone: phone || null,
      source: 'website-donation-intake',
      status: 'active',
      lifetimeGiving: 0,
      lastGiftAmount: 0,
      lastGiftDate: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    donorProfileId = donorProfileRef.id
  }

  if (mode === 'donation') {
    const today = new Date().toISOString().slice(0, 10)
    await firestore.collection('fund_transactions').add({
      storeId,
      fundId,
      donorId: donorProfileId,
      direction: 'inflow',
      amount,
      currency,
      project,
      description: message,
      date: today,
      source: 'api',
      status: 'pending_confirmation',
      reference: reference || null,
      createdAt: FieldValue.serverTimestamp(),
    })

    await firestore.collection('donor_profiles').doc(donorProfileId).set({
      lifetimeGiving: FieldValue.increment(amount),
      lastGiftAmount: amount,
      lastGiftDate: today,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  await dedupeRef.set({
    storeId,
    idempotencyKey,
    donorId,
    mode: mode as IntakeMode,
    bodyHash: hash(JSON.stringify(body)),
    createdAt: FieldValue.serverTimestamp(),
  })

  return res.status(200).json({ ok: true, donorId, mode })
}
