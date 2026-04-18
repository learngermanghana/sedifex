import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

type StoreRecord = {
  storeName?: unknown
  businessName?: unknown
  companyName?: unknown
  name?: unknown
  customerIntakeTagline?: unknown
  customerIntakeHeadline?: unknown
  customerIntakeCta?: unknown
  customerIntakeAccentColor?: unknown
  customerIntakeLogoUrl?: unknown
  customerIntakeInviteId?: unknown
  customerIntakeInviteStatus?: unknown
  customerIntakeVanityPath?: unknown
}

function sanitizeString(value: unknown, max = 200): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function normalizeColorInput(value: unknown): string {
  const color = sanitizeString(value, 12)
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#4f46e5'
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

function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  if (trimmed.startsWith('+')) return `+${digits}`
  if (trimmed.startsWith('00')) return `+${digits.replace(/^00/, '')}`
  if (trimmed.startsWith('0')) return `+233${digits.replace(/^0/, '')}`
  return `+${digits}`
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPhone(value: string): boolean {
  if (!value) return true
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function resolveClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    const [first] = forwarded.split(',')
    const trimmed = first?.trim()
    if (trimmed) return trimmed
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0] ?? 'unknown'
  }
  return req.socket.remoteAddress || 'unknown'
}

async function resolveStoreByInvite(firestore: ReturnType<typeof db>, inviteId: string) {
  const snapshot = await firestore
    .collection('stores')
    .where('customerIntakeInviteId', '==', inviteId)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  const storeDoc = snapshot.docs[0]
  const data = (storeDoc.data() ?? {}) as StoreRecord
  const status = sanitizeString(data.customerIntakeInviteStatus, 20) || 'active'
  if (status !== 'active') return null

  return {
    storeId: storeDoc.id,
    data,
  }
}

async function enforceRateLimit(params: {
  firestore: ReturnType<typeof db>
  inviteId: string
  ipHash: string
}) {
  const { firestore, inviteId, ipHash } = params
  const now = Date.now()
  const tenMinuteBucket = Math.floor(now / (10 * 60_000))
  const hourBucket = Math.floor(now / (60 * 60_000))

  const perIpRef = firestore
    .collection('publicIntakeRateLimits')
    .doc(`ip_${inviteId}_${ipHash}_${String(tenMinuteBucket)}`)
  const perInviteRef = firestore
    .collection('publicIntakeRateLimits')
    .doc(`invite_${inviteId}_${String(hourBucket)}`)

  await firestore.runTransaction(async tx => {
    const [perIpSnap, perInviteSnap] = await Promise.all([tx.get(perIpRef), tx.get(perInviteRef)])

    const ipCount = Number(perIpSnap.data()?.count ?? 0)
    const inviteCount = Number(perInviteSnap.data()?.count ?? 0)

    if (ipCount >= 6) {
      throw new Error('too-many-per-ip')
    }
    if (inviteCount >= 80) {
      throw new Error('too-many-per-invite')
    }

    tx.set(
      perIpRef,
      {
        inviteId,
        ipHash,
        bucket: tenMinuteBucket,
        count: ipCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + 2 * 60 * 60_000),
      },
      { merge: true },
    )

    tx.set(
      perInviteRef,
      {
        inviteId,
        bucket: hourBucket,
        count: inviteCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + 6 * 60 * 60_000),
      },
      { merge: true },
    )
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const firestore = db()
  if (req.method === 'GET') {
    const inviteId = sanitizeString(req.query.inviteId, 120)
    if (!inviteId) return res.status(400).json({ error: 'Missing inviteId.' })

    const resolved = await resolveStoreByInvite(firestore, inviteId)
    if (!resolved) return res.status(404).json({ error: 'Invite link not found or inactive.' })

    const raw = resolved.data
    return res.status(200).json({
      storeName: getStoreName(raw),
      tagline: sanitizeString(raw.customerIntakeTagline, 180) || 'Share your details so we can serve you better.',
      headline: sanitizeString(raw.customerIntakeHeadline, 180) || 'Hello, kindly scan to join our customer list.',
      cta: sanitizeString(raw.customerIntakeCta, 180) || 'Join now for updates and priority support.',
      accentColor: normalizeColorInput(raw.customerIntakeAccentColor),
      logoUrl: sanitizeString(raw.customerIntakeLogoUrl, 300) || null,
      vanityPath: sanitizeString(raw.customerIntakeVanityPath, 120) || '',
    })
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
    const inviteId = sanitizeString(body.inviteId, 120)
    const name = sanitizeString(body.name, 120)
    const phone = normalizePhone(sanitizeString(body.phone, 40))
    const email = normalizeEmail(sanitizeString(body.email, 120))
    const notes = sanitizeString(body.notes, 500)
    const consent = body.consent === true
    const consentSource = sanitizeString(body.consentSource, 120) || 'public-customer-intake'
    const submittedFrom = sanitizeString(body.submittedFrom, 40) || 'link'
    const utmSource = sanitizeString(body.utmSource, 80) || null
    const websiteTrap = sanitizeString(body.website, 160)
    const formStartedAt = Number(body.formStartedAt)

    if (!inviteId) return res.status(400).json({ error: 'Missing inviteId.' })
    if (!name) return res.status(400).json({ error: 'Name is required.' })
    if (!phone && !email) {
      return res.status(400).json({ error: 'Provide at least a phone number or email.' })
    }
    if (!consent) {
      return res.status(400).json({ error: 'Consent is required before submission.' })
    }
    if (websiteTrap) {
      return res.status(400).json({ error: 'Submission blocked.' })
    }
    if (!Number.isFinite(formStartedAt) || Date.now() - formStartedAt < 1500) {
      return res.status(400).json({ error: 'Please take a moment before submitting.' })
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Phone number format is invalid.' })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email format is invalid.' })
    }

    const resolved = await resolveStoreByInvite(firestore, inviteId)
    if (!resolved) {
      return res.status(404).json({ error: 'This link is no longer valid.' })
    }

    const clientIp = resolveClientIp(req)
    const ipHash = hashValue(clientIp)
    try {
      await enforceRateLimit({ firestore, inviteId, ipHash })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('too-many')) {
        return res.status(429).json({ error: 'Too many submissions. Please try again later.' })
      }
      throw error
    }

    const source = 'public-intake-link'
    const emailKey = email || null
    const phoneKey = phone ? phone.replace(/\D/g, '') : null

    const existingByEmailSnap = emailKey
      ? await firestore
          .collection('customers')
          .where('storeId', '==', resolved.storeId)
          .where('email', '==', emailKey)
          .limit(1)
          .get()
      : null

    const existingByPhoneSnap = !existingByEmailSnap?.empty && phone
      ? null
      : phone
      ? await firestore
          .collection('customers')
          .where('storeId', '==', resolved.storeId)
          .where('phone', '==', phone)
          .limit(1)
          .get()
      : null

    const existingDoc =
      existingByEmailSnap && !existingByEmailSnap.empty
        ? existingByEmailSnap.docs[0]
        : existingByPhoneSnap && !existingByPhoneSnap.empty
        ? existingByPhoneSnap.docs[0]
        : null

    const intakePayload = {
      storeId: resolved.storeId,
      name,
      displayName: name,
      phone: phone || null,
      phoneKey,
      email: email || null,
      emailKey,
      notes: notes || null,
      source,
      submittedFrom,
      inviteId,
      utmSource,
      tags: ['Public Invite'],
      consent: {
        granted: true,
        timestamp: FieldValue.serverTimestamp(),
        source: consentSource,
      },
      lastSubmissionAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      metadata: {
        inviteId,
        submittedFrom,
        utmSource,
        ipHash,
      },
    }

    if (existingDoc) {
      const existingData = existingDoc.data() as { tags?: unknown; notes?: unknown }
      const existingTags = Array.isArray(existingData.tags)
        ? existingData.tags.filter(tag => typeof tag === 'string')
        : []
      const mergedTags = Array.from(new Set([...existingTags, 'Public Invite']))
      const existingNotes = typeof existingData.notes === 'string' ? existingData.notes.trim() : ''
      const mergedNotes = notes ? Array.from(new Set([existingNotes, notes].filter(Boolean))).join(' | ') : existingNotes

      await existingDoc.ref.set(
        {
          ...intakePayload,
          tags: mergedTags,
          notes: mergedNotes || null,
        },
        { merge: true },
      )
    } else {
      await firestore.collection('customers').add({
        ...intakePayload,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return res.status(200).json({
      ok: true,
      whatsappLink: phone ? `https://wa.me/${phone.replace(/^\+/, '')}` : null,
    })
  }

  return res.status(405).json({ error: 'Method not allowed.' })
}
