export type CanonicalBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type CanonicalPaymentStatus = 'pending' | 'partial' | 'paid' | 'awaiting_verification'
export type CanonicalOrderStatus = 'pending_store_confirmation' | 'booking_confirmed' | 'completed' | 'cancelled'

export type BookingStatusSource = Record<string, unknown>

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function normalizePaymentStatus(value: unknown, fallback: CanonicalPaymentStatus = 'pending'): CanonicalPaymentStatus {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (!raw) return fallback
  if (['paid', 'payment_paid', 'paid_cash', 'confirmed', 'success', 'succeeded', 'captured', 'complete', 'completed'].includes(raw)) return 'paid'
  if (['partially_paid', 'partial', 'payment_partial', 'deposit_paid', 'part_paid'].includes(raw)) return 'partial'
  if (['awaiting_verification', 'manual_review', 'payment_awaiting_verification', 'pending_verification'].includes(raw)) return 'awaiting_verification'
  if (['pending', 'payment_pending', 'unpaid', 'pending_payment', 'pending_cash'].includes(raw)) return 'pending'
  return fallback
}

export function normalizePaymentStatusFromRecord(source: BookingStatusSource, fallback: CanonicalPaymentStatus = 'pending'): CanonicalPaymentStatus {
  const payment = objectValue(source.payment)
  const explicitStatus = source.paymentStatus ?? source.payment_status ?? payment.paymentStatus ?? payment.payment_status ?? payment.status
  if (explicitStatus) return normalizePaymentStatus(explicitStatus, fallback)
  if (payment.confirmed === true) return 'paid'
  return fallback
}

export function normalizeBookingStatus(value: unknown, fallback: CanonicalBookingStatus = 'pending'): CanonicalBookingStatus {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (!raw) return fallback
  if (['pending', 'pending_approval', 'pending_store_confirmation', 'new'].includes(raw)) return 'pending'
  if (['confirmed', 'approved', 'booking_confirmed'].includes(raw)) return 'confirmed'
  if (['completed', 'complete', 'service_completed', 'delivered'].includes(raw)) return 'completed'
  if (['cancelled', 'canceled', 'cancelled_by_store', 'cancelled_by_customer'].includes(raw)) return 'cancelled'
  return fallback
}

export function normalizeBookingStatusFromRecord(source: BookingStatusSource, fallback: CanonicalBookingStatus = 'pending'): CanonicalBookingStatus {
  const booking = objectValue(source.booking)
  return normalizeBookingStatus(source.bookingStatus ?? source.booking_status ?? booking.status ?? source.status, fallback)
}

export function deriveOnlineOrderStatusFromBooking(bookingStatus: unknown): CanonicalOrderStatus {
  const normalized = normalizeBookingStatus(bookingStatus)
  if (normalized === 'confirmed') return 'booking_confirmed'
  if (normalized === 'completed') return 'completed'
  if (normalized === 'cancelled') return 'cancelled'
  return 'pending_store_confirmation'
}

export function canonicalBookingOrderKey(source: BookingStatusSource, fallbackId = ''): string {
  const payment = objectValue(source.payment)
  const metadata = objectValue(source.metadata)
  const key = text(
    source.booking_id
      ?? source.bookingId
      ?? metadata.booking_id
      ?? metadata.bookingId
      ?? source.payment_reference
      ?? source.paymentReference
      ?? payment.reference
      ?? source.reference
      ?? fallbackId,
  )
  return key || fallbackId
}

export function deriveCanonicalOrderStatus(source: BookingStatusSource, fallback: CanonicalOrderStatus | string = 'pending_store_confirmation'): CanonicalOrderStatus | string {
  const bookingStatus = normalizeBookingStatusFromRecord(source)
  const paymentStatus = normalizePaymentStatusFromRecord(source)
  const rawOrderStatus = text(source.orderStatus ?? source.order_status, '')
  if (bookingStatus === 'confirmed' && (paymentStatus === 'paid' || paymentStatus === 'partial')) return 'booking_confirmed'
  if ((paymentStatus === 'paid' || paymentStatus === 'partial') && bookingStatus === 'pending') return 'pending_store_confirmation'
  if (rawOrderStatus) return rawOrderStatus
  if (bookingStatus !== 'pending') return deriveOnlineOrderStatusFromBooking(bookingStatus)
  return fallback
}

function completenessScore(source: object): number {
  return Object.values(source).reduce((score, value) => {
    if (value === null || value === undefined || value === '') return score
    if (Array.isArray(value)) return score + value.length
    if (typeof value === 'object') return score + Object.keys(value as Record<string, unknown>).length
    return score + 1
  }, 0)
}

export function chooseMoreCompleteRecord<T extends object & { createdAt?: Date | null; updatedAt?: Date | null }>(current: T, candidate: T): T {
  const candidateScore = completenessScore(candidate)
  const currentScore = completenessScore(current)
  const candidateTime = (candidate.updatedAt ?? candidate.createdAt)?.getTime?.() ?? 0
  const currentTime = (current.updatedAt ?? current.createdAt)?.getTime?.() ?? 0
  if (candidateScore > currentScore) return candidate
  if (candidateScore === currentScore && candidateTime >= currentTime) return candidate
  return current
}

export function deriveLastEventType(bookingStatus: unknown, paymentStatus: unknown): string {
  const booking = normalizeBookingStatus(bookingStatus)
  const payment = normalizePaymentStatus(paymentStatus)
  if (booking === 'completed') return 'booking_completed'
  if (booking === 'cancelled') return 'booking_cancelled'
  if (booking === 'confirmed' && payment === 'paid') return 'confirmed_paid'
  if (booking === 'confirmed' && payment === 'partial') return 'partial_payment'
  if (payment === 'awaiting_verification') return 'payment_awaiting_verification'
  return 'booking_updated'
}

export function deriveReportPaymentFields(source: BookingStatusSource) {
  const payment = objectValue(source.payment)
  const totalAmount = numberValue(
    source.paymentAmount ?? source.totalAmount ?? source.grandTotal ?? source.total ?? source.amount ?? payment.customerTotal ?? payment.amount,
    0,
  )
  const explicitDeposit = numberValue(source.depositAmount ?? source.deposit_amount ?? source.depositPaid ?? source.deposit_paid ?? payment.depositAmount ?? payment.deposit_amount, 0)
  const explicitPaid = numberValue(source.amountPaid ?? source.amount_paid ?? source.confirmedAmount ?? source.confirmed_amount ?? payment.amountPaid ?? payment.amount_paid, 0)
  const paymentStatus = normalizePaymentStatusFromRecord(source)
  const amountReceived = paymentStatus === 'paid'
    ? (explicitPaid > 0 ? explicitPaid : totalAmount)
    : paymentStatus === 'partial'
      ? (explicitDeposit > 0 ? explicitDeposit : explicitPaid)
      : Math.max(explicitDeposit, explicitPaid)
  const amountOutstanding = Math.max(totalAmount - amountReceived, 0)
  return { paymentStatus, totalAmount, amountReceived, amountOutstanding, depositAmount: explicitDeposit || (paymentStatus === 'partial' ? amountReceived : 0) }
}

export function paymentStatusLabel(status: unknown) {
  const normalized = normalizePaymentStatus(status)
  if (normalized === 'paid') return 'Paid'
  if (normalized === 'partial') return 'Partially Paid'
  if (normalized === 'awaiting_verification') return 'Awaiting Verification'
  return 'Pending'
}

export function orderStatusLabel(status: unknown) {
  const raw = text(status).toLowerCase().replace(/[\s-]+/g, '_')
  if (raw === 'booking_confirmed') return 'Booking Confirmed'
  if (raw === 'confirmed') return 'Confirmed'
  if (raw === 'completed' || raw === 'service_completed' || raw === 'delivered') return 'Completed'
  if (raw === 'cancelled' || raw === 'canceled') return 'Cancelled'
  return 'Pending Store Confirmation'
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
