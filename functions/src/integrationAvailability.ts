import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })

type SlotResponse = {
  id: string
  storeId: string
  serviceId: string
  serviceName?: string
  linkedCourseId?: string | null
  eventKind?: 'intake' | 'class' | 'workshop' | 'event' | 'trip'
  registrationMode?: 'free' | 'paid' | 'deposit' | 'enquiry'
  price?: number | null
  depositAmount?: number | null
  currency?: string | null
  location?: string | null
  description?: string | null
  registrationDeadline?: string | null
  marketplaceEnabled?: boolean | null
  category?: string | null
  tags?: string[]
  startAt: string
  endAt: string
  timezone: string
  capacity: number
  seatsBooked: number
  seatsRemaining: number
  status: 'open' | 'closed'
  attributes: Record<string, unknown>
  updatedAt?: string | null
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

function toIso(value: unknown) {
  return parseDate(value)?.toISOString() ?? null
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = clean(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  if (received && received !== expected) {
    res.status(400).json({
      error: 'contract-version-mismatch',
      expectedVersion: expected,
      receivedVersion: received,
    })
    return false
  }
  return true
}

async function queryHasMatch(collectionPath: FirebaseFirestore.CollectionReference, field: string, apiKey: string) {
  const snapshot = await collectionPath.where(field, '==', apiKey).limit(1).get()
  return !snapshot.empty
}

function recordContainsKey(record: Record<string, unknown>, apiKey: string) {
  const candidates = [
    record.integrationApiKey,
    record.integrationKey,
    record.integrationToken,
    record.apiKey,
    record.token,
    record.key,
  ]
  return candidates.some(value => clean(value, 1000) === apiKey)
}

async function isAuthorized(req: functions.https.Request, storeId: string) {
  const bearer = clean(req.get('authorization'), 1000).replace(/^Bearer\s+/i, '')
  const apiKey = clean(req.get('x-api-key'), 1000) || bearer
  if (!apiKey) return false

  const master = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() || process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() || ''
  if (master && apiKey === master) return true

  try {
    const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
    const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(storeData, apiKey)) return true

    const settingsSnap = await defaultDb.collection('storeSettings').doc(storeId).get()
    const settingsData = (settingsSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(settingsData, apiKey)) return true

    const storeKeyCollections = [
      defaultDb.collection('stores').doc(storeId).collection('integrationApiKeys'),
      defaultDb.collection('storeSettings').doc(storeId).collection('integrationApiKeys'),
    ]

    for (const keyCollection of storeKeyCollections) {
      for (const field of ['token', 'key', 'apiKey', 'value']) {
        if (await queryHasMatch(keyCollection, field, apiKey)) return true
      }
    }

    const globalKeyCollections = [defaultDb.collection('integrationApiKeys')]
    for (const keyCollection of globalKeyCollections) {
      for (const field of ['token', 'key', 'apiKey', 'value']) {
        const snapshot = await keyCollection
          .where('storeId', '==', storeId)
          .where(field, '==', apiKey)
          .limit(1)
          .get()
        if (!snapshot.empty) return true
      }
    }
  } catch (error) {
    functions.logger.warn('availability auth lookup failed', { storeId, error })
  }

  return false
}

function normalizeServiceId(rawValue: unknown) {
  const value = clean(rawValue, 220)
  if (!value) return ''
  return value.toLowerCase().startsWith('draft-') ? value.slice(6).trim() : value
}

function slotMatchesFilters(slot: SlotResponse, fromDate: Date | null, toDateFilter: Date | null, serviceId: string) {
  const start = parseDate(slot.startAt)
  if (!start) return false
  if (serviceId && slot.serviceId !== serviceId) return false
  if (fromDate && start < fromDate) return false
  if (toDateFilter && start > toDateFilter) return false
  return true
}

export const v1IntegrationAvailability = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }
  if (!assertContract(req, res)) return

  try {
    const storeId = clean(req.query.storeId, 180)
    const serviceId = normalizeServiceId(req.query.serviceId)
    const fromDate = parseDate(clean(req.query.from, 100))
    const toDateFilter = parseDate(clean(req.query.to, 100))

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    const authorized = await isAuthorized(req, storeId)
    if (!authorized) {
      functions.logger.info('Availability request using public open-slot fallback', { storeId, serviceId })
    }

    const snapshot = await defaultDb
      .collection('stores')
      .doc(storeId)
      .collection('integrationAvailabilitySlots')
      .orderBy('startAt', 'asc')
      .get()

    const slots: SlotResponse[] = snapshot.docs.flatMap(slotDoc => {
      const data = slotDoc.data() as Record<string, unknown>
      const startAt = toIso(data.startAt)
      const endAt = toIso(data.endAt)
      if (!startAt || !endAt) return []

      const capacity = Math.max(0, Math.floor(toNumber(data.capacity, 0)))
      const seatsBooked = Math.max(0, Math.floor(toNumber(data.seatsBooked, 0)))
      const resolvedServiceId = normalizeServiceId(data.serviceId)
      const resolvedServiceName = clean(data.serviceName, 240)
      if (!authorized) {
        const isClosed = data.status === 'closed'
        const isPublicBlocked = data.public === false || data.isPublic === false || data.visibleOnWebsite === false
        if (isClosed || isPublicBlocked) return []
      }

      const rawEventKind = clean(data.eventKind, 40).toLowerCase()
      const eventKind = ['intake', 'class', 'workshop', 'event', 'trip'].includes(rawEventKind)
        ? (rawEventKind as SlotResponse['eventKind'])
        : undefined
      const rawRegistrationMode = clean(data.registrationMode, 40).toLowerCase()
      const registrationMode = ['free', 'paid', 'deposit', 'enquiry'].includes(rawRegistrationMode)
        ? (rawRegistrationMode as SlotResponse['registrationMode'])
        : undefined

      const slot: SlotResponse = {
        id: slotDoc.id,
        storeId,
        serviceId: resolvedServiceId,
        serviceName: resolvedServiceName || undefined,
        linkedCourseId: clean(data.linkedCourseId, 220) || null,
        eventKind,
        registrationMode,
        price: data.price == null ? null : toNumber(data.price, 0),
        depositAmount: data.depositAmount == null ? null : toNumber(data.depositAmount, 0),
        currency: clean(data.currency, 20) || null,
        location: clean(data.location, 240) || null,
        description: clean(data.description, 1200) || null,
        registrationDeadline: toIso(data.registrationDeadline),
        marketplaceEnabled: typeof data.marketplaceEnabled === 'boolean' ? data.marketplaceEnabled : null,
        category: clean(data.category, 120) || null,
        tags: Array.isArray(data.tags) ? data.tags.map(tag => clean(tag, 80)).filter(Boolean) : [],
        startAt,
        endAt,
        timezone: clean(data.timezone, 80) || 'Africa/Accra',
        capacity,
        seatsBooked,
        seatsRemaining: Math.max(0, capacity - seatsBooked),
        status: data.status === 'closed' ? 'closed' : 'open',
        attributes: data.attributes && typeof data.attributes === 'object' ? data.attributes as Record<string, unknown> : {},
        updatedAt: toIso(data.updatedAt),
      }
      return slotMatchesFilters(slot, fromDate, toDateFilter, serviceId) ? [slot] : []
    })

    res.status(200).json({
      ok: true,
      storeId,
      serviceId: serviceId || null,
      from: fromDate?.toISOString() ?? null,
      to: toDateFilter?.toISOString() ?? null,
      authenticated: authorized,
      slots,
    })
  } catch (error) {
    functions.logger.error('v1IntegrationAvailability failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'availability-load-failed' })
  }
})
