import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })
const BOOKING_DEFAULT_SERVICE_ID = defineString('BOOKING_DEFAULT_SERVICE_ID', { default: '' })

type BookingRequestBody = {
  serviceId?: unknown
  slotId?: unknown
  slotID?: unknown
  slot_id?: unknown
  customer?: unknown
  customerName?: unknown
  customerPhone?: unknown
  customerEmail?: unknown
  quantity?: unknown
  notes?: unknown
  bookingDate?: unknown
  date?: unknown
  bookingTime?: unknown
  time?: unknown
  branchLocationId?: unknown
  branchId?: unknown
  locationId?: unknown
  storeBranchId?: unknown
  branchLocationName?: unknown
  branchName?: unknown
  storeBranch?: unknown
  locationName?: unknown
  preferredBranch?: unknown
  eventLocation?: unknown
  eventVenue?: unknown
  venue?: unknown
  eventAddress?: unknown
  customerStayLocation?: unknown
  stayLocation?: unknown
  hotelLocation?: unknown
  guestLocation?: unknown
  paymentMethod?: unknown
  payment_method?: unknown
  paymentType?: unknown
  paymentAmount?: unknown
  amount?: unknown
  total?: unknown
  price?: unknown
  depositAmount?: unknown
  paymentStatus?: unknown
  payment_status?: unknown
  serviceName?: unknown
  productName?: unknown
  service_note_name?: unknown
  attributes?: unknown
  status?: unknown
  bookingStatus?: unknown
  source?: unknown
  sourceChannel?: unknown
  source_channel?: unknown
  sourceLabel?: unknown
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = clean(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  if (received && received !== expected) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return false
  }
  return true
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstClean(values: unknown[], max = 500) {
  for (const value of values) {
    const cleaned = clean(value, max)
    if (cleaned) return cleaned
  }
  return ''
}

async function queryHasMatch(collectionPath: FirebaseFirestore.CollectionReference, field: string, apiKey: string) {
  const snapshot = await collectionPath.where(field, '==', apiKey).limit(1).get()
  return !snapshot.empty
}

function recordContainsKey(record: Record<string, unknown>, apiKey: string) {
  const candidates = [record.integrationApiKey, record.integrationKey, record.integrationToken, record.apiKey, record.token, record.key]
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

    for (const field of ['token', 'key', 'apiKey', 'value']) {
      const snapshot = await defaultDb
        .collection('integrationApiKeys')
        .where('storeId', '==', storeId)
        .where(field, '==', apiKey)
        .limit(1)
        .get()
      if (!snapshot.empty) return true
    }
  } catch (error) {
    functions.logger.warn('integration bookings auth lookup failed', { storeId, error })
  }

  return false
}

function asObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function normalizeSourceChannel(value: string) {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')
  if (['website_booking_form', 'website', 'clientwebsite', 'client_website'].includes(normalized)) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  if (normalized.includes('custom') || normalized.includes('public')) return 'sedifex_custom_page'
  if (normalized.includes('manual')) return 'manual_admin'
  return normalized || 'client_website'
}

function sourceLabelFor(sourceChannel: string, suppliedLabel: string) {
  if (suppliedLabel) return suppliedLabel
  if (sourceChannel === 'client_website') return 'Client website'
  if (sourceChannel === 'sedifex_market') return 'Sedifex Market'
  if (sourceChannel === 'sedifex_custom_page') return 'Sedifex public page'
  if (sourceChannel === 'manual_admin') return 'Manual/admin'
  return sourceChannel.replace(/_/g, ' ')
}

async function findCustomerDoc(storeId: string, phone: string, email: string) {
  const customersRef = defaultDb.collection('stores').doc(storeId).collection('customers')
  if (phone) {
    const byPhone = await customersRef.where('phone', '==', phone).limit(1).get()
    if (!byPhone.empty) return byPhone.docs[0]
  }
  if (email) {
    const byEmail = await customersRef.where('email', '==', email).limit(1).get()
    if (!byEmail.empty) return byEmail.docs[0]
  }
  return null
}

export const v1IntegrationBookings = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (!assertContract(req, res)) return
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const storeId = clean(req.query.storeId, 180)
  if (!storeId) {
    res.status(400).json({ error: 'missing-store-id' })
    return
  }

  if (!(await isAuthorized(req, storeId))) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  try {
    if (req.method === 'GET') {
      const status = clean(req.query.status, 80).toLowerCase()
      const serviceId = clean(req.query.serviceId, 220)

      let query: FirebaseFirestore.Query = defaultDb
        .collection('stores')
        .doc(storeId)
        .collection('integrationBookings')
        .orderBy('createdAt', 'desc')

      if (status) query = query.where('status', '==', status)
      if (serviceId) query = query.where('serviceId', '==', serviceId)

      const snapshot = await query.limit(200).get()
      const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      res.status(200).json({ ok: true, storeId, status: status || null, serviceId: serviceId || null, bookings })
      return
    }

    const body = asObject(req.body) as BookingRequestBody
    const attributes = asObject(body.attributes)
    const customer = asObject(body.customer)
    const defaultServiceId = BOOKING_DEFAULT_SERVICE_ID.value()?.trim() || process.env.BOOKING_DEFAULT_SERVICE_ID?.trim() || ''

    let resolvedServiceId = firstClean([body.serviceId], 220)
    const slotId = firstClean([body.slotId, body.slotID, body.slot_id], 220)
    const quantity = Math.max(1, Math.floor(toNumber(body.quantity, 1)))
    const notes = clean(body.notes, 2000)
    const bookingDate = firstClean([body.bookingDate, body.date], 80)
    const bookingTime = firstClean([body.bookingTime, body.time], 80)
    const branchLocationId = firstClean([body.branchLocationId, body.branchId, body.locationId, body.storeBranchId], 220)
    const branchLocationName = firstClean([body.branchLocationName, body.branchName, body.storeBranch, body.locationName, body.preferredBranch], 240)
    const eventLocation = firstClean([body.eventLocation, body.eventVenue, body.venue, body.eventAddress], 500)
    const customerStayLocation = firstClean([body.customerStayLocation, body.stayLocation, body.hotelLocation, body.guestLocation], 500)
    const paymentMethod = firstClean([body.paymentMethod, body.payment_method, body.paymentType], 120)
    const serviceName = firstClean([body.serviceName, body.productName, body.service_note_name], 240)
    const requestedStatus = clean(body.status, 80).toLowerCase()
    const status = requestedStatus || 'pending'
    const requestedBookingStatus = clean(body.bookingStatus, 80).toLowerCase()
    const bookingStatus = requestedBookingStatus || 'pending_approval'
    const paymentAmount = toNumber(body.paymentAmount ?? body.amount ?? body.total ?? body.price ?? body.depositAmount, 0)
    const paymentStatus = firstClean([body.paymentStatus, body.payment_status], 80) || 'pending'
    const customerName = firstClean([customer.name, body.customerName], 240)
    const customerPhone = firstClean([customer.phone, body.customerPhone], 80)
    const customerEmail = firstClean([customer.email, body.customerEmail], 240).toLowerCase()

    const rawSourceChannel = firstClean([body.sourceChannel, body.source_channel, attributes.sourceChannel, attributes.source_channel, body.source, attributes.source], 120) || 'client_website'
    const sourceChannel = normalizeSourceChannel(rawSourceChannel)
    const source = firstClean([body.source, attributes.source], 120) || 'website_booking_form'
    const sourceLabel = sourceLabelFor(sourceChannel, firstClean([body.sourceLabel, attributes.sourceLabel], 160))

    const now = admin.firestore.FieldValue.serverTimestamp()
    const storeRef = defaultDb.collection('stores').doc(storeId)

    let resolvedServiceName = serviceName
    if (slotId) {
      const slotRef = storeRef.collection('integrationAvailabilitySlots').doc(slotId)
      await defaultDb.runTransaction(async tx => {
        const slotSnap = await tx.get(slotRef)
        if (!slotSnap.exists) throw new Error('slot-not-found')
        const slot = slotSnap.data() as Record<string, unknown>
        const slotStatus = clean(slot.status, 40).toLowerCase() || 'open'
        if (slotStatus !== 'open') throw new Error('slot-not-open')

        const capacity = Math.max(0, Math.floor(toNumber(slot.capacity, 0)))
        const seatsBooked = Math.max(0, Math.floor(toNumber(slot.seatsBooked, 0)))
        const seatsRemaining = Math.max(0, capacity - seatsBooked)
        if (capacity > 0 && seatsRemaining < quantity) throw new Error('slot-capacity-exceeded')

        resolvedServiceId = resolvedServiceId || clean(slot.serviceId, 220)
        resolvedServiceName = resolvedServiceName || clean(slot.serviceName, 240)
        tx.update(slotRef, { seatsBooked: seatsBooked + quantity, updatedAt: now })
      })
    }

    resolvedServiceId = resolvedServiceId || defaultServiceId
    if (!resolvedServiceId) {
      res.status(400).json({
        error: 'service-not-resolved',
        message: 'Service could not be resolved. Configure BOOKING_DEFAULT_SERVICE_ID or provide serviceId.',
      })
      return
    }

    if (!customerName && !customerPhone && !customerEmail) {
      res.status(400).json({ error: 'missing-customer', message: 'Provide at least one customer name, phone, or email.' })
      return
    }

    const customerDoc = await findCustomerDoc(storeId, customerPhone, customerEmail)
    const customerRef = customerDoc ? customerDoc.ref : storeRef.collection('customers').doc()
    await customerRef.set(
      {
        name: customerName || null,
        phone: customerPhone || null,
        email: customerEmail || null,
        updatedAt: now,
        createdAt: customerDoc ? customerDoc.get('createdAt') || now : now,
        source: customerDoc ? customerDoc.get('source') || 'integrationBooking' : 'integrationBooking',
        sourceChannel,
        sourceLabel,
      },
      { merge: true },
    )

    const bookingRef = storeRef.collection('integrationBookings').doc()
    const reference = `IB-${bookingRef.id.slice(0, 8).toUpperCase()}`
    const bookingRecord: Record<string, unknown> = {
      bookingId: bookingRef.id,
      reference,
      storeId,
      customerId: customerRef.id,
      serviceId: resolvedServiceId,
      serviceName: resolvedServiceName || null,
      slotId: slotId || null,
      customer: { name: customerName || null, phone: customerPhone || null, email: customerEmail || null },
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerEmail: customerEmail || null,
      quantity,
      notes: notes || null,
      bookingDate: bookingDate || null,
      bookingTime: bookingTime || null,
      branchLocationId: branchLocationId || null,
      branchLocationName: branchLocationName || null,
      preferredBranch: branchLocationName || null,
      eventLocation: eventLocation || null,
      customerStayLocation: customerStayLocation || null,
      paymentMethod: paymentMethod || null,
      paymentAmount,
      depositAmount: paymentAmount,
      paymentStatus,
      payment: {
        method: paymentMethod || null,
        amount: paymentAmount,
        status: paymentStatus,
        confirmed: false,
      },
      attributes: {
        ...attributes,
        source,
        sourceChannel,
        sourceLabel,
      },
      bookingStatus,
      status,
      syncStatus: 'not_ready',
      syncReason: null,
      syncRequestedAt: null,
      confirmedAt: null,
      confirmedBy: null,
      rescheduledAt: null,
      cancelledAt: null,
      completedAt: null,
      source,
      sourceChannel,
      source_channel: sourceChannel,
      sourceLabel,
      channel: sourceLabel,
      recordType: 'service_booking',
      createdAt: now,
      updatedAt: now,
    }

    await bookingRef.set(bookingRecord, { merge: true })
    await defaultDb.collection('integrationBookings').doc(bookingRef.id).set(bookingRecord, { merge: true })

    res.status(200).json({ ok: true, bookingId: bookingRef.id, reference, booking: bookingRecord })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'integration-booking-failed'
    const known = new Set(['slot-not-found', 'slot-not-open', 'slot-capacity-exceeded'])
    res.status(known.has(message) ? 400 : 500).json({ error: message })
  }
})
