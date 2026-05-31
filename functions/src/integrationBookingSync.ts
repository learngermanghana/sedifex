import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'

type PlainRecord = Record<string, unknown>

type BookingSyncConfig = {
  enabled: boolean
  url: string
  secret: string
}

const PAID_STATUSES = new Set(['paid', 'confirmed', 'success', 'succeeded', 'complete', 'completed', 'captured'])

function text(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asRecord(value: unknown): PlainRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PlainRecord : {}
}

function firstText(values: unknown[], max = 1000) {
  for (const value of values) {
    const candidate = text(value, max)
    if (candidate) return candidate
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function normalizeStatus(value: unknown, fallback = '') {
  const normalized = text(value, 100).toLowerCase().replace(/[\s-]+/g, '_')
  return normalized || fallback
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function timestampIso(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'object') {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number }
    if (typeof maybeTimestamp.toDate === 'function') {
      const date = maybeTimestamp.toDate()
      return Number.isNaN(date.getTime()) ? '' : date.toISOString()
    }
    const seconds = typeof maybeTimestamp.seconds === 'number'
      ? maybeTimestamp.seconds
      : typeof maybeTimestamp._seconds === 'number'
        ? maybeTimestamp._seconds
        : null
    if (seconds !== null) return new Date(seconds * 1000).toISOString()
  }
  return ''
}

function isExplicitlyDisabled(value: unknown) {
  if (value === false) return true
  const normalized = normalizeStatus(value)
  return normalized === 'false' || normalized === 'disabled' || normalized === 'off'
}

function mergeBookingSyncConfig(storeData: PlainRecord, settingsData: PlainRecord): PlainRecord {
  return Object.assign(
    {},
    asRecord(storeData.bookingSync),
    asRecord(settingsData.bookingSync),
    asRecord(storeData.appsScriptBookingSync),
    asRecord(settingsData.appsScriptBookingSync),
    asRecord(storeData.integrationBookingConfig),
    asRecord(settingsData.integrationBookingConfig),
  )
}

async function loadBookingSyncConfig(storeId: string): Promise<BookingSyncConfig> {
  const [storeSnap, settingsSnap] = await Promise.all([
    defaultDb.collection('stores').doc(storeId).get(),
    defaultDb.collection('storeSettings').doc(storeId).get(),
  ])
  const storeData = asRecord(storeSnap.data())
  const settingsData = asRecord(settingsSnap.data())
  const config = mergeBookingSyncConfig(storeData, settingsData)
  const url = firstText([config.webAppUrl, config.appsScriptUrl, config.url], 2000)
  const secret = firstText([config.secret, config.sharedSecret, config.webhookSecret], 1000)
  const disabled = [
    config.enabled,
    storeData.bookingSyncEnabled,
    settingsData.bookingSyncEnabled,
    storeData.appScriptBookingSyncEnabled,
    settingsData.appScriptBookingSyncEnabled,
  ].some(isExplicitlyDisabled)

  return { enabled: Boolean(url) && !disabled, url, secret }
}

function buildBookingSyncPayload(bookingId: string, storeId: string, data: PlainRecord, config: BookingSyncConfig): PlainRecord {
  const customer = asRecord(data.customer)
  const booking = asRecord(data.booking)
  const payment = asRecord(data.payment)
  const attributes = asRecord(data.attributes)
  const metadata = asRecord(data.metadata)
  const paymentStatus = firstText([data.paymentStatus, data.payment_status, payment.status], 100)
  const paymentConfirmed = data.paymentConfirmed === true
    || data.payment_confirmed === true
    || payment.confirmed === true
    || PAID_STATUSES.has(normalizeStatus(paymentStatus))
  const normalizedBookingStatus = normalizeStatus(data.bookingStatus ?? data.booking_status ?? data.status ?? booking.status, 'booked')
  const sourceChannel = firstText([data.sourceChannel, data.source_channel, data.source, attributes.sourceChannel, metadata.sourceChannel], 160) || 'sedifex_admin'
  const serviceId = firstText([data.serviceId, data.service_id, booking.serviceId, booking.service_id, metadata.serviceId], 240)
  const serviceName = firstText([data.serviceName, data.service_name, data.internalServiceName, booking.serviceName, booking.service_name, data.itemName, data.productName, metadata.serviceName], 240)
  const bookingDate = firstText([data.bookingDate, data.booking_date, data.date, booking.preferredDate, booking.preferred_date, booking.date], 100)
  const bookingTime = firstText([data.bookingTime, data.booking_time, data.time, booking.preferredTime, booking.preferred_time, booking.time], 100)
  const paymentAmount = numberValue(data.paymentAmount ?? data.payment_amount ?? data.amount ?? data.total ?? payment.amount)
  const depositAmount = numberValue(data.depositAmount ?? data.deposit_amount ?? payment.depositAmount ?? payment.deposit_amount)
  const paymentReference = firstText([data.paymentReference, data.payment_reference, data.reference, payment.reference], 260)
  const syncReason = firstText([data.syncReason, data.sync_reason], 120) || normalizedBookingStatus
  const paymentConfirmedAt = timestampIso(data.paymentConfirmedAt ?? data.payment_confirmed_at ?? payment.confirmedAt ?? payment.confirmed_at)
    || (paymentConfirmed ? new Date().toISOString() : '')

  return {
    bookingId,
    booking_id: bookingId,
    storeId,
    store_id: storeId,
    serviceId,
    service_id: serviceId,
    serviceName,
    service_name: serviceName,
    customerName: firstText([data.customerName, data.customer_name, data.fullName, data.name, customer.name], 240),
    customerPhone: firstText([data.customerPhone, data.customer_phone, data.phone, customer.phone], 100),
    customerEmail: firstText([data.customerEmail, data.customer_email, data.email, customer.email], 260).toLowerCase(),
    customer: {
      name: firstText([data.customerName, data.customer_name, data.fullName, data.name, customer.name], 240),
      phone: firstText([data.customerPhone, data.customer_phone, data.phone, customer.phone], 100),
      email: firstText([data.customerEmail, data.customer_email, data.email, customer.email], 260).toLowerCase(),
    },
    quantity: numberValue(data.quantity ?? booking.quantity) ?? 1,
    notes: firstText([data.notes, data.message, data.details, booking.notes], 2000),
    bookingDate,
    booking_date: bookingDate,
    bookingTime,
    booking_time: bookingTime,
    booking: {
      serviceId,
      serviceName,
      preferredDate: bookingDate,
      preferredTime: bookingTime,
      date: bookingDate,
      time: bookingTime,
    },
    preferredBranch: firstText([data.preferredBranch, data.branchName, data.branch, data.location, data.branchLocationName], 260),
    branchLocationName: firstText([data.branchLocationName, data.preferredBranch, data.branchName, data.branch, data.location], 260),
    paymentMethod: firstText([data.paymentMethod, data.payment_method, payment.method], 120),
    paymentAmount,
    payment_amount: paymentAmount,
    depositAmount,
    deposit_amount: depositAmount,
    paymentReference,
    payment_reference: paymentReference,
    reference: firstText([data.reference, paymentReference, payment.reference], 260) || bookingId,
    paymentStatus,
    payment_status: paymentStatus,
    paymentConfirmed,
    payment_confirmed: paymentConfirmed,
    paymentConfirmedAt,
    payment_confirmed_at: paymentConfirmedAt,
    paymentVerifiedAt: timestampIso(data.paymentVerifiedAt ?? data.payment_verified_at ?? payment.verifiedAt ?? payment.verified_at),
    payment_verified_at: timestampIso(data.paymentVerifiedAt ?? data.payment_verified_at ?? payment.verifiedAt ?? payment.verified_at),
    payment: {
      amount: paymentAmount,
      depositAmount,
      method: firstText([data.paymentMethod, data.payment_method, payment.method], 120),
      reference: paymentReference,
      status: paymentStatus,
      confirmed: paymentConfirmed,
      confirmedAt: paymentConfirmedAt,
      verifiedAt: timestampIso(data.paymentVerifiedAt ?? data.payment_verified_at ?? payment.verifiedAt ?? payment.verified_at),
    },
    bookingStatus: normalizedBookingStatus,
    booking_status: normalizedBookingStatus,
    status: normalizedBookingStatus,
    source: firstText([data.source, data.sourceChannel, data.source_channel, attributes.source, metadata.source], 160) || sourceChannel,
    sourceChannel,
    source_channel: sourceChannel,
    sourceLabel: firstText([data.sourceLabel, data.source_label, attributes.sourceLabel, metadata.sourceLabel], 180),
    syncReason,
    sync_reason: syncReason,
    eventType: syncReason,
    confirmedAt: timestampIso(data.confirmedAt),
    confirmed_at: timestampIso(data.confirmedAt),
    cancelledAt: timestampIso(data.cancelledAt ?? data.cancelled_at),
    cancelled_at: timestampIso(data.cancelledAt ?? data.cancelled_at),
    completedAt: timestampIso(data.completedAt ?? data.completed_at),
    completed_at: timestampIso(data.completedAt ?? data.completed_at),
    updatedAt: timestampIso(data.updatedAt) || new Date().toISOString(),
    createdAt: timestampIso(data.createdAt),
    secret: config.secret || undefined,
  }
}

async function postToAppsScript(url: string, payload: PlainRecord, secret: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? {
          'x-sedifex-booking-secret': secret,
          'x-sedifex-webhook-secret': secret,
        } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(`booking-app-script-http-${response.status}: ${bodyText.slice(0, 700)}`)
    }

    let body: unknown = bodyText.slice(0, 1000)
    try {
      body = JSON.parse(bodyText)
    } catch (_error) {
      // Apps Script may return text if a deployment is customized.
    }

    return { status: response.status, body }
  } finally {
    clearTimeout(timeout)
  }
}

async function mirrorSyncState(storeId: string, bookingId: string, update: PlainRecord, rootRef: FirebaseFirestore.DocumentReference) {
  const storeRef = defaultDb.collection('stores').doc(storeId).collection('integrationBookings').doc(bookingId)
  await Promise.allSettled([
    rootRef.set(update, { merge: true }),
    storeRef.set(update, { merge: true }),
  ])
}

function syncUpdateBase() {
  return {
    syncAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    sync_attempted_at: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

export const syncIntegrationBookingToAppsScript = functions.firestore
  .document('integrationBookings/{bookingId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null

    const data = change.after.data() as PlainRecord
    const syncStatus = normalizeStatus(data.syncStatus ?? data.sync_status)
    if (syncStatus !== 'pending') return null

    const bookingId = text(context.params.bookingId, 260)
    const storeId = firstText([data.storeId, data.store_id], 180)
    if (!storeId || !bookingId) {
      await change.after.ref.set({
        ...syncUpdateBase(),
        syncStatus: 'failed',
        sync_status: 'failed',
        lastSyncError: 'missing-store-id-or-booking-id',
        syncError: 'missing-store-id-or-booking-id',
      }, { merge: true })
      return null
    }

    const config = await loadBookingSyncConfig(storeId)
    if (!config.enabled) {
      await mirrorSyncState(storeId, bookingId, {
        ...syncUpdateBase(),
        syncStatus: 'not_ready',
        sync_status: 'not_ready',
        syncConfigDetected: false,
        lastSyncError: 'booking-sync-not-configured',
        syncError: 'booking-sync-not-configured',
      }, change.after.ref)
      return null
    }

    const payload = buildBookingSyncPayload(bookingId, storeId, data, config)

    try {
      const result = await postToAppsScript(config.url, payload, config.secret)
      await mirrorSyncState(storeId, bookingId, {
        ...syncUpdateBase(),
        syncStatus: 'synced',
        sync_status: 'synced',
        syncConfigDetected: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        synced_at: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncError: null,
        syncError: null,
        syncResult: result,
      }, change.after.ref)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'booking-sync-failed'
      functions.logger.error('booking Apps Script sync failed', { storeId, bookingId, error: message })
      await mirrorSyncState(storeId, bookingId, {
        ...syncUpdateBase(),
        syncStatus: 'failed',
        sync_status: 'failed',
        syncConfigDetected: true,
        syncFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        sync_failed_at: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncError: message,
        syncError: message,
      }, change.after.ref)
    }

    return null
  })
