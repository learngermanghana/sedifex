import { createHash } from 'node:crypto'
import * as functions from 'firebase-functions/v1'
import { defaultDb } from './firestore'
import { admin } from './firestore'

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function text(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalEmail(value: unknown) {
  const cleaned = text(value, 180).toLowerCase()
  return cleaned || null
}

function optionalText(value: unknown, max = 500) {
  return text(value, max) || null
}

function getBody(req: functions.https.Request) {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

async function assertBasicStore(storeId: string) {
  if (!storeId) return false
  const store = await defaultDb.collection('stores').doc(storeId).get().catch(() => null)
  return Boolean(store?.exists)
}

function rejectSpam(body: Record<string, unknown>) {
  return Boolean(text(body.website) || text(body.company) || text(body.url))
}


async function protectIntake(req: functions.https.Request, res: functions.Response, body: Record<string, unknown>, storeId: string) {
  const phone = text(body.phone ?? body.telephone ?? body.whatsapp, 80)
  const email = optionalEmail(body.email)
  if (body.consent !== true) {
    res.status(400).json({ ok: false, error: 'consent-required' })
    return false
  }
  if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      (phone && !/^\+?[0-9 ()-]{8,25}$/.test(phone))) {
    res.status(400).json({ ok: false, error: 'invalid-contact' })
    return false
  }
  const now = Date.now()
  const ipHash = createHash('sha256').update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex')
  const key = createHash('sha256').update(storeId + ':' + ipHash + ':' + Math.floor(now / 600000)).digest('hex')
  const rateRef = defaultDb.collection('publicIntakeRateLimits').doc('ngo_' + key)
  try {
    await defaultDb.runTransaction(async tx => {
      const snapshot = await tx.get(rateRef)
      const count = Number(snapshot.data()?.count || 0)
      if (count >= 6) throw new Error('rate-limited')
      tx.set(rateRef, { count: count + 1, expiresAt: admin.firestore.Timestamp.fromMillis(now + 3600000) })
    })
    return true
  } catch (error) {
    if (error instanceof Error && error.message === 'rate-limited') {
      res.status(429).json({ ok: false, error: 'too-many-submissions' })
      return false
    }
    throw error
  }
}

export const volunteerIntake = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method-not-allowed' })
    return
  }

  try {
    const body = getBody(req)
    if (rejectSpam(body)) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const storeId = text(body.storeId, 180)
    const exists = await assertBasicStore(storeId)
    if (!exists) {
      res.status(400).json({ ok: false, error: 'invalid-store-id' })
      return
    }

    const name = text(body.name ?? body.fullName ?? body.volunteerName, 140)
    const phone = text(body.phone ?? body.telephone ?? body.whatsapp, 80)
    const email = optionalEmail(body.email)
    if (!name || (!phone && !email)) {
      res.status(400).json({ ok: false, error: 'missing-required-fields' })
      return
    }

    if (!await protectIntake(req, res, body, storeId)) return
    const now = admin.firestore.FieldValue.serverTimestamp()
    const doc = await defaultDb.collection('volunteer_applications').add({
      storeId,
      pageType: 'volunteer_application',
      source: 'website_intake',
      consent: { granted: true, purpose: 'application-follow-up', recordedAt: now },
      status: 'new',
      person: { name, phone: phone || null, email },
      data: {
        skill: optionalText(body.skill ?? body.skills ?? body.interest, 180),
        availability: optionalText(body.availability, 180),
        preferredProject: optionalText(body.preferredProject ?? body.project ?? body.campaign, 180),
        location: optionalText(body.location ?? body.city ?? body.town, 180),
        notes: optionalText(body.notes ?? body.message, 1000),
      },
      createdAt: now,
      updatedAt: now,
    })

    res.status(200).json({ ok: true, id: doc.id })
  } catch (error) {
    functions.logger.error('volunteerIntake failed', { error })
    res.status(500).json({ ok: false, error: 'volunteer-intake-failed' })
  }
})

export const supportRequestIntake = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method-not-allowed' })
    return
  }

  try {
    const body = getBody(req)
    if (rejectSpam(body)) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    const storeId = text(body.storeId, 180)
    const exists = await assertBasicStore(storeId)
    if (!exists) {
      res.status(400).json({ ok: false, error: 'invalid-store-id' })
      return
    }

    const name = text(body.name ?? body.fullName ?? body.requesterName, 140)
    const phone = text(body.phone ?? body.telephone ?? body.whatsapp, 80)
    const email = optionalEmail(body.email)
    const supportType = text(body.supportType ?? body.type ?? body.needType, 160)
    if (!name || !supportType || (!phone && !email)) {
      res.status(400).json({ ok: false, error: 'missing-required-fields' })
      return
    }

    const priority = text(body.priority ?? body.urgency, 80) || 'normal'
    if (!await protectIntake(req, res, body, storeId)) return
    const now = admin.firestore.FieldValue.serverTimestamp()
    const doc = await defaultDb.collection('support_requests').add({
      storeId,
      pageType: 'support_request',
      source: 'website_intake',
      consent: { granted: true, purpose: 'application-follow-up', recordedAt: now },
      status: 'new',
      priority,
      person: { name, phone: phone || null, email },
      data: {
        supportType,
        needSummary: optionalText(body.needSummary ?? body.message ?? body.description, 1000),
        location: optionalText(body.location ?? body.city ?? body.town, 180),
        householdSize: optionalText(body.householdSize ?? body.familySize, 80),
        urgency: optionalText(body.urgency ?? priority, 80),
        notes: optionalText(body.notes, 1000),
      },
      createdAt: now,
      updatedAt: now,
    })

    res.status(200).json({ ok: true, id: doc.id })
  } catch (error) {
    functions.logger.error('supportRequestIntake failed', { error })
    res.status(500).json({ ok: false, error: 'support-request-intake-failed' })
  }
})
