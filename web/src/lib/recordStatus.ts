/** Display contract shared with Sedifex Admin. Keep these independent states separate. */
export type RecordSource = Record<string, unknown>
export type StatusTone = 'neutral' | 'warning' | 'success' | 'danger'
export type StatusPresentation = { state: string; label: string; tone: StatusTone }

function record(value: unknown): RecordSource {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordSource : {}
}
function first(...values: unknown[]) {
  return values.find(value => typeof value === 'string' && value.trim())
}
function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
}
function presentation(state: string, label: string, tone: StatusTone): StatusPresentation {
  return { state, label, tone }
}

export function paymentPresentation(source: RecordSource): StatusPresentation {
  const payment = record(source.payment)
  const raw = normalized(first(source.paymentStatus, source.payment_status, source.statusPayment, payment.paymentStatus, payment.payment_status, payment.status))
  if (['paid', 'payment_paid', 'paid_cash', 'settled', 'confirmed', 'success', 'successful', 'succeeded', 'captured', 'complete', 'completed'].includes(raw)) return presentation('paid', 'Paid', 'success')
  if (['partial', 'partially_paid', 'payment_partial', 'deposit_paid', 'part_paid'].includes(raw)) return presentation('partial', 'Partially paid', 'warning')
  if (['awaiting_verification', 'manual_review', 'pending_verification', 'payment_awaiting_verification', 'review'].includes(raw)) return presentation('awaiting_verification', 'Awaiting verification', 'warning')
  if (['checkout_created', 'checkout', 'initiated'].includes(raw)) return presentation('checkout_created', 'Checkout created', 'warning')
  if (['failed', 'declined', 'payment_failed'].includes(raw)) return presentation('failed', 'Payment failed', 'danger')
  if (['refunded', 'refund', 'fully_refunded'].includes(raw)) return presentation('refunded', 'Refunded', 'danger')
  if (['cancelled', 'canceled'].includes(raw)) return presentation('cancelled', 'Payment cancelled', 'danger')
  // A stale confirmation flag must never override an explicit later failure or refund.
  if (!raw && (payment.confirmed === true || source.cashConfirmed === true || source.cash_confirmed === true)) return presentation('paid', 'Paid', 'success')
  if (!raw) return presentation('unknown', 'Payment not recorded', 'neutral')
  if (['pending', 'payment_pending', 'unpaid', 'pending_payment', 'pending_cash', 'awaiting'].includes(raw)) return presentation('pending', 'Payment pending', 'warning')
  return presentation('unknown', 'Payment needs review', 'warning')
}

export function bookingPresentation(source: RecordSource): StatusPresentation {
  const booking = record(source.booking)
  const raw = normalized(first(source.bookingStatus, source.booking_status, booking.status, source.status, source.orderStatus, source.order_status))
  if (!raw) return presentation('unknown', 'Not recorded', 'neutral')
  if (['pending', 'pending_approval', 'pending_store_confirmation', 'new', 'manual_review', 'review', 'needs_approval'].includes(raw)) return presentation('pending', 'Needs confirmation', 'warning')
  if (['confirmed', 'approved', 'booking_confirmed', 'confirmed_by_store'].includes(raw)) return presentation('confirmed', 'Confirmed', 'success')
  if (['completed', 'complete', 'service_completed', 'delivered'].includes(raw)) return presentation('completed', 'Completed', 'success')
  if (['cancelled', 'canceled', 'cancelled_by_store', 'cancelled_by_customer', 'deleted', 'void', 'voided', 'rejected'].includes(raw)) return presentation('cancelled', 'Cancelled', 'danger')
  return presentation('unknown', 'Booking needs review', 'warning')
}

export function payoutPresentation(source: RecordSource): StatusPresentation {
  const raw = normalized(first(source.settlementStatus, source.settlement_status, source.payoutStatus, source.payout_status))
  if (['paid', 'settled', 'completed', 'complete', 'succeeded'].includes(raw)) return presentation('paid', 'Store paid', 'success')
  if (['excluded_cash', 'store_direct', 'not_applicable', 'excluded'].includes(raw) || source.storeOnly === true || source.store_only === true) return presentation('not_applicable', 'No platform payout', 'neutral')
  if (!raw && (source.cashConfirmed === true || source.cash_confirmed === true || normalized(source.paymentStatus ?? source.payment_status) === 'paid_cash' || ['store', 'store_direct', 'direct', 'store_payment', 'offline', 'offline_payment'].includes(normalized(source.paymentCollectionMode ?? source.payment_collection_mode)))) return presentation('not_applicable', 'No platform payout', 'neutral')
  if (['failed', 'payout_failed'].includes(raw)) return presentation('failed', 'Payout failed', 'danger')
  if (['pending', 'pending_settlement', 'awaiting_settlement', 'processing'].includes(raw)) return presentation('pending', 'Payout pending', 'warning')
  if (!raw) return presentation('not_recorded', 'Payout not recorded', 'neutral')
  return presentation('unknown', 'Payout needs review', 'warning')
}

function amount(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

export function recordAmounts(source: RecordSource) {
  const payment = record(source.payment)
  const total = amount(source.finalTotal, source.final_total, source.paymentAmount, source.totalAmount, source.grandTotal, source.total, source.amount, payment.customerTotal, payment.amount, typeof source.amountMinor === 'number' ? source.amountMinor / 100 : undefined)
  const explicitReceived = amount(source.amountPaid, source.amount_paid, source.confirmedAmount, source.confirmed_amount, payment.amountPaid, payment.amount_paid)
  const deposit = amount(source.depositAmount, source.deposit_amount, source.depositPaid, source.deposit_paid, payment.depositAmount)
  const state = paymentPresentation(source).state
  const received = explicitReceived ?? (state === 'paid' ? total : state === 'partial' ? deposit : null)
  const outstanding = total !== null && received !== null ? Math.max(total - received, 0) : null
  const currency = normalized(first(source.currency, source.paymentCurrency, source.payment_currency, payment.currency)).toUpperCase() || 'GHS'
  return { total, received, outstanding, currency }
}

export function formatRecordAmount(value: number | null, currency: string) {
  return value === null ? 'Not recorded' : `${currency} ${value.toFixed(2)}`
}
