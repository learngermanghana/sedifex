import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })

type SlotResponse = {
  id: string
  storeId: string
  serviceId: string
  serviceName?: string
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

function toDate(value: unknown): Date | null {
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
  return toDate(value)?.toISOString() ?? null
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

async function isAuthorized(req: functions.https.Request) {
  const bearer = clean(req.get('authorization'), 500).replace(/^Bearer\s+/i, '')
  const apiKey = clean(req.get('x-api-key'), 500) || bearer
  if (!apiKey) return false

  const master = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() || process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() || ''
  if (master && apiKey === master) return true

  // Store-specific keys are currently used by some websites. Support common document shapes.
  const keyQueries = [
    defaultDb.collection('integrationApiKeys').where('token', '==', apiKey).where('status', '==', 'active').limit(1).get(),
    defaultDb.collection('integrationApiKeys').where('key', '==', apiKey).where('status', '==', 'active').limit(1).get(),
  ]

  try {
    const snapshots = await Promise.all(keyQueries)
    return snapshots.some(snapshot => !snapshot.empty)
  } catch {
    return false
  }
}

function slotMatchesFilters(slot: SlotResponse, fromDate: Date | null, toDate: Date | null, serviceId: string) {
  const start = toDate(slot.startAt)
  if (!start) return false
  if (serviceId && slot.serviceId !== serviceId) return false
  if (fromDate && start < fromDate) return false
  if (toDate && start > toDate) return false
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
    const serviceId = clean(req.query.serviceId, 220)
    const fromDate = toDate(clean(req.query.from, 100))
    const toDateFilter = toDate(clean(req.query.to, 100))

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    const authorized = await isAuthorized(req)
    if (!authorized) {
      res.status(401).json({ error: 'unauthorized' })
      return
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
      const resolvedServiceId = clean(data.serviceId, 220)
      const resolvedServiceName = clean(data.serviceName, 240)
      const slot: SlotResponse = {
        id: slotDoc.id,
        storeId,
        serviceId: resolvedServiceId,
        serviceName: resolvedServiceName || undefined,
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
      storeId,
      serviceId: serviceId || null,
      from: fromDate?.toISOString() ?? null,
      to: toDateFilter?.toISOString() ?? null,
      slots,
    })
  } catch (error) {
    functions.logger.error('v1IntegrationAvailability failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'availability-load-failed' })
  }
})
