import { Timestamp, serverTimestamp } from 'firebase/firestore'

export type BookingActionType = 'confirm' | 'cancel' | 'complete'

export function hasAppScriptBookingSyncConfigured(storeData: Record<string, unknown> | null | undefined): boolean {
  if (!storeData) return false

  const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0
  const hasEnabledFlag = (value: unknown) => value === true || value === 'enabled' || value === 'active'
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

  const configCandidates = [
    storeData.integrationBookingConfig,
    storeData.bookingSync,
    storeData.bookingAppsScript,
    storeData.appsScriptBookingSync,
    storeData.websiteBookingSync,
    asRecord(storeData.integrations)?.bookingSync,
    asRecord(storeData.integrations)?.bookingAppsScript,
    asRecord(storeData.integrations)?.appsScriptBookingSync,
  ]

  for (const candidate of configCandidates) {
    const config = asRecord(candidate)
    if (!config) continue

    if (
      hasText(config.webAppUrl) ||
      hasText(config.appsScriptUrl) ||
      hasText(config.appScriptUrl) ||
      hasText(config.scriptUrl) ||
      hasText(config.webhookUrl) ||
      hasText(config.endpointUrl) ||
      hasText(config.url)
    ) {
      return config.enabled !== false && config.status !== 'disabled'
    }

    if (hasEnabledFlag(config.enabled) || hasEnabledFlag(config.status)) return true
  }

  if (hasEnabledFlag(storeData.bookingSyncEnabled) || hasEnabledFlag(storeData.appScriptBookingSyncEnabled)) return true

  const endpoints = Array.isArray(storeData.webhookEndpoints) ? storeData.webhookEndpoints : []
  return endpoints.some(endpoint => {
    const config = asRecord(endpoint)
    if (!config || config.status === 'revoked' || config.enabled === false) return false
    const events = Array.isArray(config.events) ? config.events : []
    const acceptsBookingEvents = events.length === 0 || events.some(event => typeof event === 'string' && event.startsWith('booking.'))
    return acceptsBookingEvents && (hasText(config.url) || hasText(config.webAppUrl) || hasText(config.endpointUrl))
  })
}

function syncPayload(syncReason: string, now: Timestamp, shouldQueueSync: boolean) {
  return {
    syncStatus: 'pending',
    syncReason,
    syncRequestedAt: now,
    syncConfigDetected: shouldQueueSync,
  }
}

export function buildConfirmBookingPayload(existingPayment: Record<string, unknown>, shouldQueueSync: boolean) {
  const now = Timestamp.now()
  return {
    bookingStatus: 'confirmed',
    status: 'confirmed',
    paymentStatus: 'paid',
    confirmedAt: now,
    confirmedBy: 'staff_admin',
    paymentConfirmedAt: now,
    paymentVerifiedAt: now,
    paymentVerifiedBy: 'staff_admin',
    payment: {
      ...existingPayment,
      status: 'paid',
      confirmed: true,
    },
    ...syncPayload('booking_confirmed', now, shouldQueueSync),
    updatedAt: serverTimestamp(),
  }
}

export function buildCancelBookingPayload(shouldQueueSync: boolean) {
  const now = Timestamp.now()
  return {
    bookingStatus: 'cancelled',
    status: 'cancelled',
    cancelledAt: now,
    ...syncPayload('booking_cancelled', now, shouldQueueSync),
    updatedAt: serverTimestamp(),
  }
}

export function buildCompleteBookingPayload(shouldQueueSync: boolean) {
  const now = Timestamp.now()
  return {
    bookingStatus: 'completed',
    status: 'completed',
    completedAt: now,
    ...syncPayload('booking_completed', now, shouldQueueSync),
    updatedAt: serverTimestamp(),
  }
}
