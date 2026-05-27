import { asNumber, asText, getNestedObject, toDate } from '../pages/reports/reportUtils'

export type BusinessActivityType = 'pos' | 'online' | 'booking' | 'cash'
export type SettlementScope = 'store_only' | 'sedifex_settlement' | 'pos'
export type CanonicalPaymentStatus = 'pending_payment' | 'pending_cash' | 'paid_online' | 'paid_cash' | 'cancelled' | 'failed' | 'unknown'
export type CanonicalOrderStatus = 'pending' | 'completed' | 'delivered' | 'service_completed' | 'manual_completed' | 'cancelled' | 'unknown'

export type BusinessActivityRow = {
  id: string
  rawId: string
  storeId: string
  type: BusinessActivityType
  label: string
  reference: string
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerContact: string
  itemName: string
  quantity: number
  amount: number
  currency: string
  paymentMethod: string
  paymentProvider: string
  paymentStatus: string
  orderStatus: string
  canonicalPaymentStatus: CanonicalPaymentStatus
  canonicalOrderStatus: CanonicalOrderStatus
  settlementScope: SettlementScope
  sourceChannel: string
  sourceLabel: string
  createdAt: Date | null
  updatedAt: Date | null
  storeOnly: boolean
  excludedFromSedifexSettlement: boolean
}

function firstItem(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.cart) ? data.cart : []
  const first = items[0]
  return first && typeof first === 'object' ? first as Record<string, unknown> : {}
}

export function normalizeSourceChannel(value: unknown, fallback = 'sedifex_market') {
  const normalized = asText(value, fallback).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (!normalized) return fallback
  if (normalized.includes('quick_pay_cash')) return 'quick_pay_cash'
  if (normalized.includes('quick_pay')) return 'quick_pay_online'
  if (normalized.includes('website') || normalized.includes('wordpress') || normalized.includes('client')) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  if (normalized.includes('custom') || normalized.includes('public')) return 'sedifex_custom_page'
  return normalized
}

export function normalizePaymentStatus(status: unknown, method?: unknown): CanonicalPaymentStatus {
  const joined = `${asText(status)} ${asText(method)}`.toLowerCase()
  if (joined.includes('cancelled') || joined.includes('canceled')) return 'cancelled'
  if (joined.includes('failed') || joined.includes('abandoned') || joined.includes('rejected')) return 'failed'
  if (joined.includes('paid_cash') || (joined.includes('cash') && (joined.includes('paid') || joined.includes('confirmed') || joined.includes('completed')))) return 'paid_cash'
  if (['success', 'paid', 'confirmed', 'captured', 'completed'].some(token => joined.includes(token))) return 'paid_online'
  if (joined.includes('cash')) return 'pending_cash'
  if (joined.includes('pending') || joined.includes('awaiting') || joined.includes('checkout') || joined.includes('syncing')) return 'pending_payment'
  return 'unknown'
}

export function normalizeOrderStatus(status: unknown, fallback?: unknown): CanonicalOrderStatus {
  const joined = `${asText(status)} ${asText(fallback)}`.toLowerCase()
  if (joined.includes('cancelled') || joined.includes('canceled')) return 'cancelled'
  if (joined.includes('manual_completed')) return 'manual_completed'
  if (joined.includes('service_completed')) return 'service_completed'
  if (joined.includes('delivered')) return 'delivered'
  if (joined.includes('completed') || joined.includes('complete')) return 'completed'
  if (joined.includes('pending') || joined.includes('awaiting') || joined.includes('preparing') || joined.includes('confirmed') || joined.includes('progress')) return 'pending'
  return 'unknown'
}

export function isPaidLike(status: unknown) {
  return ['paid_online', 'paid_cash'].includes(normalizePaymentStatus(status)) || normalizeOrderStatus(status) === 'completed'
}

export function isPendingLike(status: unknown) {
  const payment = normalizePaymentStatus(status)
  const order = normalizeOrderStatus(status)
  return payment === 'pending_payment' || payment === 'pending_cash' || order === 'pending'
}

export function isStoreOnlyCashRecord(data: Record<string, unknown>) {
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? getNestedObject(data, 'metadata').sourceChannel, '')
  const collectionHint = asText(data.collectionName)
  const paymentMode = asText(data.paymentCollectionMode ?? data.payment_collection_mode ?? getNestedObject(data, 'payment').mode).toLowerCase()
  const method = asText(data.paymentMethod ?? data.payment_method).toLowerCase()
  const provider = asText(data.paymentProvider ?? data.payment_provider).toLowerCase()
  return data.storeOnly === true || data.excludedFromSedifexSettlement === true || sourceChannel === 'quick_pay_cash' || collectionHint === 'cashOrders' || paymentMode === 'cash' || method === 'cash' || provider === 'cash'
}

export function isSettlementRecord(rowOrData: BusinessActivityRow | Record<string, unknown>) {
  if ('settlementScope' in rowOrData) return rowOrData.settlementScope === 'sedifex_settlement'
  return !isStoreOnlyCashRecord(rowOrData)
}

export function readActivityAmount(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const amountMinor = asNumber(data.amountMinor, 0)
  if (amountMinor > 0) return amountMinor / 100
  const finalTotalMinor = asNumber(pricing.final_total_minor ?? pricing.finalTotalMinor ?? pricingSnake.final_total_minor ?? pricingSnake.finalTotalMinor, 0)
  if (finalTotalMinor > 0) return finalTotalMinor / 100
  const raw = asNumber(
    data.total ??
      data.grandTotal ??
      data.amountPaid ??
      data.amount_paid ??
      data.confirmedAmount ??
      data.amount ??
      payment.customerTotal ??
      payment.amount ??
      pricing.finalTotal ??
      pricing.final_total ??
      pricingSnake.finalTotal ??
      pricingSnake.final_total ??
      pricing.subtotal ??
      pricingSnake.subtotal,
    0,
  )
  return raw > 999 && (pricing.final_total || pricingSnake.final_total) ? raw / 100 : raw
}

function baseCustomer(data: Record<string, unknown>) {
  const customer = getNestedObject(data, 'customer')
  const metadata = getNestedObject(data, 'metadata')
  return {
    customerId: asText(data.customerId ?? metadata.customerId),
    customerName: asText(customer.name ?? data.customerName ?? metadata.customerName ?? data.name, 'Customer'),
    customerPhone: asText(customer.phone ?? data.customerPhone ?? metadata.customerPhone ?? data.phone),
    customerEmail: asText(customer.email ?? data.customerEmail ?? metadata.customerEmail ?? data.email),
  }
}

function buildRow(id: string, data: Record<string, unknown>, type: BusinessActivityType, overrides: Partial<BusinessActivityRow> = {}): BusinessActivityRow {
  const payment = getNestedObject(data, 'payment')
  const metadata = getNestedObject(data, 'metadata')
  const item = firstItem(data)
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? metadata.sourceChannel ?? payment.sourceChannel, type === 'cash' ? 'quick_pay_cash' : type === 'pos' ? 'pos' : 'sedifex_market')
  const paymentMethod = asText(data.paymentCollectionMode ?? data.paymentMethod ?? data.payment_method ?? payment.mode, type === 'cash' ? 'cash' : type === 'pos' ? 'pos' : 'online_checkout')
  const paymentStatus = asText(data.paymentStatus ?? data.payment_status ?? payment.status ?? data.status, type === 'cash' ? 'pending_cash' : type === 'pos' ? 'completed' : 'pending')
  const orderStatus = asText(data.orderStatus ?? data.order_status ?? data.bookingStatus ?? data.status, type === 'pos' ? 'completed' : 'pending')
  const customer = baseCustomer(data)
  const storeOnly = type === 'cash' || isStoreOnlyCashRecord({ ...data, collectionName: type === 'cash' ? 'cashOrders' : '' })
  const settlementScope: SettlementScope = type === 'pos' ? 'pos' : storeOnly ? 'store_only' : 'sedifex_settlement'
  const itemName = asText(
    data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName ?? item.productName ?? item.serviceName ?? metadata.itemName ?? metadata.manualPaymentName,
    type === 'booking' ? 'Service booking' : type === 'cash' ? 'Manual cash sale' : type === 'pos' ? 'POS sale' : 'Online order',
  )

  return {
    id: `${type}-${id}`,
    rawId: id,
    storeId: asText(data.storeId ?? data.merchantId ?? metadata.storeId),
    type,
    label: type === 'pos' ? 'POS / Sell' : type === 'online' ? 'Online order' : type === 'booking' ? 'Booking / Service' : 'Store cash / Manual',
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference ?? payment.reference ?? data.receiptNumber ?? data.saleId, id),
    ...customer,
    customerContact: customer.customerPhone || customer.customerEmail,
    itemName,
    quantity: asNumber(item.quantity ?? item.qty, 1) || 1,
    amount: readActivityAmount(data),
    currency: asText(payment.currency ?? data.currency, 'GHS'),
    paymentMethod,
    paymentProvider: asText(data.paymentProvider ?? data.payment_provider ?? payment.provider, type === 'cash' ? 'cash' : ''),
    paymentStatus,
    orderStatus,
    canonicalPaymentStatus: normalizePaymentStatus(paymentStatus, paymentMethod),
    canonicalOrderStatus: normalizeOrderStatus(orderStatus, paymentStatus),
    settlementScope,
    sourceChannel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label ?? metadata.sourceLabel, sourceChannel === 'quick_pay_cash' ? 'Store Cash / Manual' : sourceChannel === 'client_website' ? 'Client Website' : sourceChannel === 'sedifex_market' ? 'Sedifex Market' : sourceChannel),
    createdAt: toDate(data.createdAtServer ?? data.createdAt ?? data.saleDate ?? data.updatedAt),
    updatedAt: toDate(data.updatedAt),
    storeOnly,
    excludedFromSedifexSettlement: data.excludedFromSedifexSettlement === true || storeOnly,
    ...overrides,
  }
}

export function normalizePosSale(id: string, data: Record<string, unknown>): BusinessActivityRow {
  return buildRow(id, data, 'pos', {
    customerName: asText(getNestedObject(data, 'customer').name ?? data.customerName, 'Walk-in customer'),
    settlementScope: 'pos',
    storeOnly: false,
    excludedFromSedifexSettlement: false,
  })
}

export function normalizeIntegrationOrder(id: string, data: Record<string, unknown>): BusinessActivityRow {
  return buildRow(id, data, 'online')
}

export function normalizeIntegrationBooking(id: string, data: Record<string, unknown>): BusinessActivityRow {
  return buildRow(id, data, 'booking')
}

export function normalizeCashOrder(id: string, data: Record<string, unknown>): BusinessActivityRow {
  return buildRow(id, data, 'cash', {
    settlementScope: 'store_only',
    storeOnly: true,
    excludedFromSedifexSettlement: true,
  })
}
