import React, { useEffect, useMemo, useState } from 'react'
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type OnlineOrderTab =
  | 'product-orders'
  | 'service-bookings'
  | 'sedifex-market'
  | 'client-website'
  | 'pay-on-delivery'
  | 'cash-orders'
  | 'manual-payment'
  | 'online-paid'
  | 'pending'

type FulfillmentAction = 'accept' | 'preparing' | 'out_for_delivery' | 'delivered'
type CashAction = 'confirm' | 'cancel'

type OnlineOrderRecord = {
  id: string
  collectionName: 'integrationOrders' | 'integrationBookings'
  recordType: 'product_order' | 'service_booking' | string
  reference: string
  customerName: string
  customerEmail: string
  customerPhone: string
  itemName: string
  quantity: number
  amount: number
  currency: string
  paymentStatus: string
  orderStatus: string
  bookingStatus: string
  fulfillmentStatus: string
  deliveryStatus: string
  paymentCollectionMode: string
  paymentMethod: string
  paymentProvider: string
  cashConfirmed: boolean
  sourceChannel: string
  sourceLabel: string
  source: string
  clientOrderId: string
  sedifexOrderId: string
  createdAt: Date | null
  deliveredAt: Date | null
  deliveryLocation: string
  bookingDate: string
  bookingTime: string
  preferredBranch: string
  notes: string
  sedifexCommission: number
  merchantNet: number
  feePolicyKey: string
}

const FULFILLMENT_ACTIONS: Array<{ id: FulfillmentAction; label: string; hint: string }> = [
  { id: 'accept', label: 'Accept', hint: 'Store has accepted the order' },
  { id: 'preparing', label: 'Preparing', hint: 'Order is being prepared' },
  { id: 'out_for_delivery', label: 'Out for delivery', hint: 'Order is on the way' },
  { id: 'delivered', label: 'Delivered', hint: 'Order has reached the customer' },
]

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as any)?.toDate === 'function') {
    const parsed = (value as any).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

function normalizeStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = status.toLowerCase()
  if (['success', 'confirmed', 'paid', 'paid_cash', 'captured', 'completed', 'delivered', 'cash_collected'].some(token => normalized.includes(token))) return 'success'
  if (['failed', 'cancelled', 'canceled', 'rejected', 'abandoned'].some(token => normalized.includes(token))) return 'danger'
  if (['pending', 'manual', 'delivery', 'processing', 'cash', 'checkout', 'preparing', 'awaiting', 'out for delivery'].some(token => normalized.includes(token))) return 'warning'
  return 'neutral'
}

function formatMoney(amount: number, currency: string) {
  const normalizedCurrency = currency || 'GHS'
  return `${normalizedCurrency} ${amount.toFixed(2)}`
}

function getNestedObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstItem(source: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(source.items) ? source.items : Array.isArray(source.cart) ? source.cart : []
  const first = items[0]
  return first && typeof first === 'object' ? first as Record<string, unknown> : {}
}

function readAmount(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')

  const directAmountMinor = asNumber(source.amountMinor, 0)
  const finalTotalMinor = asNumber(
    pricingSnapshot.final_total_minor ??
      pricingSnapshot.finalTotalMinor ??
      pricingSnapshotSnake.final_total_minor ??
      pricingSnapshotSnake.finalTotalMinor,
    0,
  )

  return asNumber(
    payment.customerTotal ??
      payment.amount ??
      source.amountPaid ??
      source.amount_paid ??
      source.confirmedAmount ??
      source.amount ??
      source.total ??
      source.grandTotal ??
      pricingSnapshot.subtotal ??
      pricingSnapshot.finalTotal ??
      pricingSnapshot.final_total ??
      pricingSnapshotSnake.subtotal ??
      pricingSnapshotSnake.finalTotal ??
      pricingSnapshotSnake.final_total,
    directAmountMinor > 0
      ? directAmountMinor / 100
      : finalTotalMinor > 0
        ? finalTotalMinor / 100
        : 0,
  )
}

function readCurrency(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')
  return asText(payment.currency ?? pricingSnapshot.currency ?? pricingSnapshotSnake.currency ?? source.currency, 'GHS')
}

function readFeePolicy(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')
  const directFeePolicy = getNestedObject(source, 'feePolicy')
  const paymentFeePolicy = getNestedObject(payment, 'feePolicy')
  const marketFees = getNestedObject(pricingSnapshot, 'marketplaceFees')
  const marketFeesSnake = getNestedObject(pricingSnapshotSnake, 'marketplace_fees')
  return Object.keys(paymentFeePolicy).length
    ? paymentFeePolicy
    : Object.keys(marketFees).length
      ? marketFees
      : Object.keys(marketFeesSnake).length
        ? marketFeesSnake
        : directFeePolicy
}

function normalizeSourceChannel(raw: string) {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (!normalized) return 'sedifex_market'
  if (['client_website', 'website', 'client_site', 'wordpress', 'shopify', 'external_website'].includes(normalized)) return 'client_website'
  if (normalized.includes('website') || normalized.includes('wordpress') || normalized.includes('client')) return 'client_website'
  if (normalized.includes('custom_page') || normalized.includes('public_page') || normalized.includes('sedifex_custom')) return 'sedifex_custom_page'
  if (normalized.includes('quick_pay_cash')) return 'quick_pay_cash'
  if (normalized.includes('market')) return 'sedifex_market'
  return normalized
}

function sourceLabel(channel: string) {
  if (channel === 'client_website') return 'Client Website'
  if (channel === 'sedifex_custom_page') return 'Sedifex Public Page'
  if (channel === 'quick_pay_cash') return 'Quick Pay Cash'
  if (channel === 'sedifex_market') return 'Sedifex Market'
  return normalizeStatus(channel)
}

function readSourceChannel(source: Record<string, unknown>) {
  const metadata = getNestedObject(source, 'metadata')
  const attributes = getNestedObject(source, 'attributes')
  const payment = getNestedObject(source, 'payment')
  const raw = asText(
    source.sourceChannel ??
      source.source_channel ??
      source.channel ??
      metadata.sourceChannel ??
      metadata.channel ??
      attributes.sourceChannel ??
      attributes.source ??
      payment.sourceChannel ??
      source.source,
    'sedifex_market',
  )
  return normalizeSourceChannel(raw)
}

function mapOnlineOrderRecord(
  id: string,
  collectionName: 'integrationOrders' | 'integrationBookings',
  data: Record<string, unknown>,
): OnlineOrderRecord {
  const customer = getNestedObject(data, 'customer')
  const booking = getNestedObject(data, 'booking')
  const delivery = getNestedObject(data, 'delivery')
  const metadata = getNestedObject(data, 'metadata')
  const item = firstItem(data)
  const feePolicy = readFeePolicy(data)
  const payment = getNestedObject(data, 'payment')
  const cashPayment = getNestedObject(data, 'cashPayment')
  const amount = readAmount(data)
  const currency = readCurrency(data)
  const recordType = asText(data.recordType ?? data.orderType, collectionName === 'integrationBookings' ? 'service_booking' : 'product_order')
  const channel = readSourceChannel(data)

  return {
    id,
    collectionName,
    recordType,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, 'No reference'),
    customerName: asText(customer.name ?? data.customerName, 'Customer'),
    customerEmail: asText(customer.email ?? data.customerEmail, ''),
    customerPhone: asText(customer.phone ?? data.customerPhone, ''),
    itemName: asText(data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName ?? item.productName, recordType === 'service_booking' ? 'Service booking' : 'Product order'),
    quantity: asNumber(item.quantity ?? item.qty, recordType === 'service_booking' ? 1 : 0),
    amount,
    currency,
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status, 'pending'),
    bookingStatus: asText(data.bookingStatus, ''),
    fulfillmentStatus: asText(data.fulfillmentStatus ?? data.fulfillment_status, ''),
    deliveryStatus: asText(data.deliveryStatus ?? data.delivery_status, ''),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? data.payment_collection_mode ?? payment.mode, 'online_checkout'),
    paymentMethod: asText(data.paymentMethod ?? data.payment_method ?? metadata.paymentMethod, ''),
    paymentProvider: asText(data.paymentProvider ?? data.payment_provider ?? payment.provider, ''),
    cashConfirmed: asBoolean(data.cashConfirmed ?? cashPayment.cashConfirmed, false),
    sourceChannel: channel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceLabel(channel)),
    source: asText(data.source, channel),
    clientOrderId: asText(data.clientOrderId ?? data.client_order_id ?? metadata.clientOrderId, ''),
    sedifexOrderId: asText(data.sedifexOrderId ?? data.sedifex_order_id ?? metadata.sedifexOrderId, ''),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
    deliveredAt: toDate(data.deliveredAt ?? data.delivered_at),
    deliveryLocation: asText(data.deliveryLocation ?? delivery.location, ''),
    bookingDate: asText(data.bookingDate ?? booking.preferredDate, ''),
    bookingTime: asText(data.bookingTime ?? booking.preferredTime, ''),
    preferredBranch: asText(data.preferredBranch ?? booking.preferredBranch, ''),
    notes: asText(data.notes ?? booking.notes ?? delivery.notes, ''),
    sedifexCommission: asNumber(payment.sedifexCommission ?? feePolicy.sedifexCommissionMajor ?? feePolicy.sedifexCommissionMinor, 0),
    merchantNet: asNumber(payment.merchantNet ?? feePolicy.merchantNetMajor ?? feePolicy.estimatedMerchantNetMinor, amount),
    feePolicyKey: asText(feePolicy.policyKey, ''),
  }
}

function isServiceBooking(record: OnlineOrderRecord) {
  return record.recordType === 'service_booking' || record.collectionName === 'integrationBookings' || record.recordType === 'service'
}

function isPayOnDelivery(record: OnlineOrderRecord) {
  return record.paymentCollectionMode === 'pay_on_delivery'
}

function isCashOrder(record: OnlineOrderRecord) {
  const joined = `${record.paymentCollectionMode} ${record.paymentMethod} ${record.paymentProvider} ${record.paymentStatus} ${record.orderStatus} ${record.sourceChannel}`.toLowerCase()
  return joined.includes('cash')
}

function isCashAwaitingConfirmation(record: OnlineOrderRecord) {
  if (!isCashOrder(record)) return false
  const joined = `${record.paymentStatus} ${record.orderStatus}`.toLowerCase()
  if (record.cashConfirmed) return false
  if (['paid_cash', 'paid cash', 'success', 'confirmed', 'completed', 'cancelled', 'canceled'].some(token => joined.includes(token))) return false
  return true
}

function isManualPayment(record: OnlineOrderRecord) {
  return ['manual', 'manual_transfer', 'momo_manual', 'cash', 'bank_transfer'].includes(record.paymentCollectionMode) || isCashOrder(record)
}

function isOnlinePaid(record: OnlineOrderRecord) {
  const paymentStatus = record.paymentStatus.toLowerCase()
  return (
    !isPayOnDelivery(record) &&
    !isManualPayment(record) &&
    ['success', 'confirmed', 'paid', 'captured'].some(token => paymentStatus.includes(token))
  )
}

function isPending(record: OnlineOrderRecord) {
  const joined = `${record.paymentStatus} ${record.orderStatus} ${record.bookingStatus} ${record.fulfillmentStatus} ${record.deliveryStatus}`.toLowerCase()
  return joined.includes('pending') || joined.includes('waiting') || joined.includes('manual') || joined.includes('awaiting')
}

function filterRecords(records: OnlineOrderRecord[], tab: OnlineOrderTab) {
  if (tab === 'service-bookings') return records.filter(isServiceBooking)
  if (tab === 'sedifex-market') return records.filter(record => record.sourceChannel === 'sedifex_market')
  if (tab === 'client-website') return records.filter(record => record.sourceChannel === 'client_website')
  if (tab === 'pay-on-delivery') return records.filter(isPayOnDelivery)
  if (tab === 'cash-orders') return records.filter(isCashOrder)
  if (tab === 'manual-payment') return records.filter(isManualPayment)
  if (tab === 'online-paid') return records.filter(isOnlinePaid)
  if (tab === 'pending') return records.filter(isPending)
  return records.filter(record => !isServiceBooking(record))
}

function getPrimaryStatus(record: OnlineOrderRecord) {
  const deliveryStatus = record.deliveryStatus.toLowerCase()
  const shouldUseDeliveryFirst = ['out_for_delivery', 'delivered', 'completed'].some(token => deliveryStatus.includes(token))
  if (shouldUseDeliveryFirst) return record.deliveryStatus
  return record.fulfillmentStatus || (isServiceBooking(record) ? record.bookingStatus || record.orderStatus : record.orderStatus) || record.deliveryStatus
}

function buildCustomerContactHref(record: OnlineOrderRecord) {
  const digits = record.customerPhone.replace(/[^\d]/g, '')
  if (digits) {
    const message = encodeURIComponent(`Hello ${record.customerName}, we are contacting you about your Sedifex order. Reference: ${record.reference}`)
    return `https://wa.me/${digits}?text=${message}`
  }
  if (record.customerEmail) {
    const subject = encodeURIComponent(`Sedifex order ${record.reference}`)
    const body = encodeURIComponent(`Hello ${record.customerName},\n\nWe are contacting you about your Sedifex order.\nReference: ${record.reference}`)
    return `mailto:${record.customerEmail}?subject=${subject}&body=${body}`
  }
  return ''
}

function fulfillmentPatch(record: OnlineOrderRecord, action: FulfillmentAction, storeId: string) {
  const nowIso = new Date().toISOString()
  const actionMap: Record<FulfillmentAction, { orderStatus: string; fulfillmentStatus: string; deliveryStatus: string; bookingStatus?: string }> = {
    accept: { orderStatus: 'confirmed_by_store', fulfillmentStatus: 'confirmed_by_store', deliveryStatus: 'not_started', bookingStatus: 'confirmed' },
    preparing: { orderStatus: 'preparing', fulfillmentStatus: 'preparing', deliveryStatus: 'not_started', bookingStatus: 'preparing' },
    out_for_delivery: { orderStatus: 'out_for_delivery', fulfillmentStatus: 'out_for_delivery', deliveryStatus: 'out_for_delivery', bookingStatus: 'in_progress' },
    delivered: { orderStatus: 'delivered', fulfillmentStatus: 'completed', deliveryStatus: 'delivered', bookingStatus: 'completed' },
  }
  const next = actionMap[action]
  const patch: Record<string, unknown> = {
    orderStatus: next.orderStatus,
    order_status: next.orderStatus,
    fulfillmentStatus: next.fulfillmentStatus,
    fulfillment_status: next.fulfillmentStatus,
    deliveryStatus: next.deliveryStatus,
    delivery_status: next.deliveryStatus,
    storeFulfillmentUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({
      status: next.orderStatus,
      fulfillmentStatus: next.fulfillmentStatus,
      deliveryStatus: next.deliveryStatus,
      action,
      actor: 'store',
      storeId,
      createdAt: nowIso,
      note: FULFILLMENT_ACTIONS.find(item => item.id === action)?.hint || '',
    }),
  }

  if (isServiceBooking(record) && next.bookingStatus) {
    patch.bookingStatus = next.bookingStatus
  }

  if (action === 'delivered') {
    patch.deliveredAt = serverTimestamp()
    patch.deliveredBy = 'store'
    patch.customerDeliveredEmailSent = false
    patch.customerDeliveredNotificationQueued = false
  }

  return patch
}

function cashPaymentPatch(record: OnlineOrderRecord, action: CashAction, storeId: string) {
  const nowIso = new Date().toISOString()
  if (action === 'confirm') {
    return {
      paymentStatus: 'paid_cash',
      payment_status: 'paid_cash',
      orderStatus: 'completed',
      order_status: 'completed',
      fulfillmentStatus: record.fulfillmentStatus || 'confirmed_by_store',
      fulfillment_status: record.fulfillmentStatus || 'confirmed_by_store',
      paymentCollectionMode: 'cash',
      payment_collection_mode: 'cash',
      paymentMethod: 'CASH',
      payment_method: 'CASH',
      paymentProvider: 'cash',
      payment_provider: 'cash',
      amountPaid: record.amount,
      amount_paid: record.amount,
      cashConfirmed: true,
      cashConfirmedAt: serverTimestamp(),
      cashConfirmedBy: 'store',
      inventoryDeductionStatus: 'cash_confirmed',
      cashPayment: {
        cashConfirmed: true,
        status: 'paid_cash',
        confirmedAmount: record.amount,
        currency: record.currency,
        confirmedAt: nowIso,
        confirmedBy: 'store',
      },
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion({
        status: 'paid_cash',
        orderStatus: 'completed',
        paymentStatus: 'paid_cash',
        action: 'confirm_cash_received',
        actor: 'store',
        storeId,
        createdAt: nowIso,
        note: 'Store confirmed physical cash received.',
      }),
    }
  }

  return {
    paymentStatus: 'cancelled_cash',
    payment_status: 'cancelled_cash',
    orderStatus: 'cancelled',
    order_status: 'cancelled',
    paymentCollectionMode: 'cash',
    payment_collection_mode: 'cash',
    paymentMethod: 'CASH',
    payment_method: 'CASH',
    paymentProvider: 'cash',
    payment_provider: 'cash',
    cashConfirmed: false,
    cashCancelledAt: serverTimestamp(),
    cashCancelledBy: 'store',
    inventoryDeductionStatus: 'cash_cancelled',
    cashPayment: {
      cashConfirmed: false,
      status: 'cancelled',
      expectedAmount: record.amount,
      currency: record.currency,
      cancelledAt: nowIso,
      cancelledBy: 'store',
    },
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({
      status: 'cancelled_cash',
      orderStatus: 'cancelled',
      paymentStatus: 'cancelled_cash',
      action: 'cancel_cash_order',
      actor: 'store',
      storeId,
      createdAt: nowIso,
      note: 'Store cancelled cash order.',
    }),
  }
}

function actionIsActive(record: OnlineOrderRecord, action: FulfillmentAction) {
  const status = getPrimaryStatus(record).toLowerCase()
  if (action === 'accept') return ['confirmed_by_store', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'completed'].some(token => status.includes(token))
  if (action === 'preparing') return ['preparing', 'out_for_delivery', 'delivered', 'completed'].some(token => status.includes(token))
  if (action === 'out_for_delivery') return ['out_for_delivery', 'delivered', 'completed'].some(token => status.includes(token))
  if (action === 'delivered') return ['delivered', 'completed'].some(token => status.includes(token))
  return false
}

function StatCard({ label, value, hint, active, onClick }: { label: string; value: string; hint: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: active ? '#EEF2FF' : '#F8FAFC',
        border: active ? '1px solid #4338CA' : '1px solid #E2E8F0',
        borderRadius: 18,
        padding: 16,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: active ? '0 18px 42px -30px rgba(67, 56, 202, 0.75)' : 'none',
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>{label}</p>
      <p style={{ margin: '7px 0 3px', color: '#0F172A', fontSize: 27, fontWeight: 900 }}>{value}</p>
      <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>{hint}</p>
    </button>
  )
}

function FulfillmentButton({ active, disabled, loading, children, onClick }: { active?: boolean; disabled?: boolean; loading?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        border: active ? '1px solid #16A34A' : '1px solid #CBD5E1',
        background: active ? '#DCFCE7' : '#FFFFFF',
        color: active ? '#166534' : '#334155',
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.65 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? 'Saving…' : children}
    </button>
  )
}

function CashActionButton({ tone, disabled, loading, children, onClick }: { tone: 'confirm' | 'cancel'; disabled?: boolean; loading?: boolean; children: React.ReactNode; onClick: () => void }) {
  const isConfirm = tone === 'confirm'
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        border: isConfirm ? '1px solid #16A34A' : '1px solid #FCA5A5',
        background: isConfirm ? '#DCFCE7' : '#FEF2F2',
        color: isConfirm ? '#166534' : '#991B1B',
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 900,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? 'Saving…' : children}
    </button>
  )
}

export default function MarketplaceOrders({ compactHeader = false }: { compactHeader?: boolean }) {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OnlineOrderRecord[]>([])
  const [bookings, setBookings] = useState<OnlineOrderRecord[]>([])
  const [activeTab, setActiveTab] = useState<OnlineOrderTab>('product-orders')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      setBookings([])
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    setError(null)

    const orderQuery = query(collection(db, 'integrationOrders'), where('storeId', '==', storeId))
    const bookingQuery = query(collection(db, 'integrationBookings'), where('storeId', '==', storeId))

    const unsubscribeOrders = onSnapshot(
      orderQuery,
      snapshot => {
        setOrders(snapshot.docs.map(docSnap => mapOnlineOrderRecord(docSnap.id, 'integrationOrders', docSnap.data() as Record<string, unknown>)))
        setIsLoading(false)
      },
      err => {
        console.error('[online-orders] Failed to load product orders', err)
        setError('Unable to load online orders right now.')
        setIsLoading(false)
      },
    )

    const unsubscribeBookings = onSnapshot(
      bookingQuery,
      snapshot => {
        setBookings(snapshot.docs.map(docSnap => mapOnlineOrderRecord(docSnap.id, 'integrationBookings', docSnap.data() as Record<string, unknown>)))
        setIsLoading(false)
      },
      err => {
        console.error('[online-orders] Failed to load service bookings', err)
        setError('Unable to load online bookings right now.')
        setIsLoading(false)
      },
    )

    return () => {
      unsubscribeOrders()
      unsubscribeBookings()
    }
  }, [storeId])

  async function mirrorStoreIntegrationOrder(record: OnlineOrderRecord, patch: Record<string, unknown>) {
    if (!storeId || record.collectionName !== 'integrationOrders') return
    try {
      await updateDoc(doc(db, 'stores', storeId, 'integrationOrders', record.id), patch)
    } catch (err) {
      console.warn('[online-orders] Store subcollection mirror update failed', err)
    }
  }

  async function updateFulfillment(record: OnlineOrderRecord, action: FulfillmentAction) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-${action}`
    const patch = fulfillmentPatch(record, action, storeId)
    setActionError(null)
    setPendingActionKey(key)
    try {
      await updateDoc(doc(db, record.collectionName, record.id), patch)
      await mirrorStoreIntegrationOrder(record, patch)
    } catch (err) {
      console.error('[online-orders] Failed to update fulfillment status', err)
      setActionError(err instanceof Error ? err.message : 'Unable to update order status.')
    } finally {
      setPendingActionKey(null)
    }
  }

  async function updateCashPayment(record: OnlineOrderRecord, action: CashAction) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-cash-${action}`
    const label = action === 'confirm' ? 'confirm cash received' : 'cancel this cash order'
    if (!window.confirm(`Are you sure you want to ${label}?`)) return

    const patch = cashPaymentPatch(record, action, storeId)
    setActionError(null)
    setPendingActionKey(key)
    try {
      await updateDoc(doc(db, record.collectionName, record.id), patch)
      await mirrorStoreIntegrationOrder(record, patch)
    } catch (err) {
      console.error('[online-orders] Failed to update cash payment status', err)
      setActionError(err instanceof Error ? err.message : 'Unable to update cash payment status.')
    } finally {
      setPendingActionKey(null)
    }
  }

  const allRecords = useMemo(
    () => [...orders, ...bookings].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
    [bookings, orders],
  )

  const stats = useMemo(() => {
    const productOrders = allRecords.filter(record => !isServiceBooking(record))
    const serviceBookings = allRecords.filter(isServiceBooking)
    const sedifexMarket = allRecords.filter(record => record.sourceChannel === 'sedifex_market')
    const clientWebsite = allRecords.filter(record => record.sourceChannel === 'client_website')
    const payOnDelivery = allRecords.filter(isPayOnDelivery)
    const cashOrders = allRecords.filter(isCashOrder)
    const pendingCashOrders = cashOrders.filter(isCashAwaitingConfirmation)
    const manualPayment = allRecords.filter(isManualPayment)
    const onlinePaid = allRecords.filter(isOnlinePaid)
    const pending = allRecords.filter(isPending)
    return {
      productOrders,
      serviceBookings,
      sedifexMarket,
      clientWebsite,
      payOnDelivery,
      cashOrders,
      pendingCashOrders,
      manualPayment,
      onlinePaid,
      pending,
      totalPaidValue: onlinePaid.reduce((sum, record) => sum + record.amount, 0),
      deliveryValue: payOnDelivery.reduce((sum, record) => sum + record.amount, 0),
      cashPendingValue: pendingCashOrders.reduce((sum, record) => sum + record.amount, 0),
    }
  }, [allRecords])

  const tabs: Array<{ id: OnlineOrderTab; label: string; count: number }> = [
    { id: 'product-orders', label: 'Product Orders', count: stats.productOrders.length },
    { id: 'pending', label: 'Pending', count: stats.pending.length },
    { id: 'cash-orders', label: 'Cash Orders', count: stats.cashOrders.length },
    { id: 'service-bookings', label: 'Service Bookings', count: stats.serviceBookings.length },
    { id: 'sedifex-market', label: 'Sedifex Market', count: stats.sedifexMarket.length },
    { id: 'client-website', label: 'Client Website', count: stats.clientWebsite.length },
    { id: 'pay-on-delivery', label: 'Pay on Delivery', count: stats.payOnDelivery.length },
    { id: 'manual-payment', label: 'Manual Payment', count: stats.manualPayment.length },
    { id: 'online-paid', label: 'Online Paid', count: stats.onlinePaid.length },
  ]

  const filteredRecords = useMemo(() => {
    const tabRecords = filterRecords(allRecords, activeTab)
    const search = searchText.trim().toLowerCase()
    if (!search) return tabRecords
    return tabRecords.filter(record =>
      [
        record.reference,
        record.clientOrderId,
        record.sedifexOrderId,
        record.customerName,
        record.customerEmail,
        record.customerPhone,
        record.itemName,
        record.sourceLabel,
        record.paymentStatus,
        record.orderStatus,
        record.bookingStatus,
        record.fulfillmentStatus,
        record.deliveryStatus,
        record.paymentCollectionMode,
        record.paymentMethod,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    )
  }, [activeTab, allRecords, searchText])

  return (
    <div>
      {!compactHeader ? (
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Sedifex source of truth</p>
          <h1 style={{ color: '#111827', margin: 0 }}>Sales & Online Orders</h1>
          <p style={{ color: '#475569', margin: '8px 0 0' }}>
            View product orders and service bookings from Sedifex Market, client websites, public pages, online checkout, manual payment, pay-on-delivery, and cash channels.
          </p>
        </div>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Product orders" value={String(stats.productOrders.length)} hint="All product sales requests" active={activeTab === 'product-orders'} onClick={() => setActiveTab('product-orders')} />
        <StatCard label="Pending" value={String(stats.pending.length)} hint="Needs follow-up" active={activeTab === 'pending'} onClick={() => setActiveTab('pending')} />
        <StatCard label="Cash orders" value={String(stats.cashOrders.length)} hint={`${formatMoney(stats.cashPendingValue, 'GHS')} pending cash`} active={activeTab === 'cash-orders'} onClick={() => setActiveTab('cash-orders')} />
        <StatCard label="Online paid" value={String(stats.onlinePaid.length)} hint={`${formatMoney(stats.totalPaidValue, 'GHS')} confirmed`} active={activeTab === 'online-paid'} onClick={() => setActiveTab('online-paid')} />
        <StatCard label="Pay on delivery" value={String(stats.payOnDelivery.length)} hint={`${formatMoney(stats.deliveryValue, 'GHS')} to collect`} active={activeTab === 'pay-on-delivery'} onClick={() => setActiveTab('pay-on-delivery')} />
        <StatCard label="Service bookings" value={String(stats.serviceBookings.length)} hint="Appointments and classes" active={activeTab === 'service-bookings'} onClick={() => setActiveTab('service-bookings')} />
        <StatCard label="Client website" value={String(stats.clientWebsite.length)} hint="Website checkout requests" active={activeTab === 'client-website'} onClick={() => setActiveTab('client-website')} />
      </section>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 22, padding: 18, display: 'grid', gap: 16, boxShadow: '0 24px 60px -48px rgba(15, 23, 42, 0.7)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111827' }}>Orders workspace</h2>
            <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 14 }}>Confirm cash received, contact customers, and move each order from accepted to delivered.</p>
          </div>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, minWidth: 250 }}>
            Search
            <input
              type="search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Reference, customer, channel, status…"
              style={{ border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 11px' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: activeTab === tab.id ? '1px solid #4338CA' : '1px solid #CBD5E1',
                background: activeTab === tab.id ? '#EEF2FF' : '#FFFFFF',
                color: activeTab === tab.id ? '#3730A3' : '#334155',
                borderRadius: 999,
                padding: '8px 12px',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>{error}</p> : null}
        {actionError ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>Status update failed: {actionError}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading online order records…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view online orders.</p> : null}
        {!isLoading && storeId && filteredRecords.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No records found for this view yet.</p> : null}

        {filteredRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1450 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Customer</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Item</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Channel</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Amount</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Payment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Cash Action</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Fulfilment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Details</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Contact</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(record => {
                  const primaryStatus = getPrimaryStatus(record)
                  const tone = statusTone(primaryStatus || record.paymentStatus)
                  const contactHref = buildCustomerContactHref(record)
                  const cashOrder = isCashOrder(record)
                  const cashPending = isCashAwaitingConfirmation(record)
                  const confirmKey = `${record.collectionName}-${record.id}-cash-confirm`
                  const cancelKey = `${record.collectionName}-${record.id}-cash-cancel`

                  return (
                    <tr key={`${record.collectionName}-${record.id}`} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#0F172A' }}>{record.customerName}</strong>
                        <br />
                        <span style={{ color: '#64748B', fontSize: 13 }}>{record.customerPhone || record.customerEmail || 'No contact'}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#0F172A' }}>{record.itemName}</strong>
                        <br />
                        <span style={{ color: '#64748B', fontSize: 13 }}>{isServiceBooking(record) ? 'Service booking' : `Qty: ${record.quantity || 1}`}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#0F172A' }}>{record.sourceLabel}</strong>
                        <br />
                        <span style={{ color: '#64748B', fontSize: 13 }}>{record.collectionName}</span>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#0F172A', fontWeight: 700 }}>
                        {formatMoney(record.amount, record.currency)}
                        {record.feePolicyKey === 'sedifex_free_pay_on_delivery_v1' ? (
                          <><br /><span style={{ color: '#16A34A', fontSize: 12 }}>Free launch: no Sedifex fee</span></>
                        ) : null}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ color: '#0F172A', fontWeight: 700 }}>{normalizeStatus(record.paymentCollectionMode)}</span>
                        <br />
                        <span style={{ color: '#64748B', fontSize: 13 }}>{normalizeStatus(record.paymentStatus)}</span>
                        {cashOrder ? <><br /><span style={{ color: record.cashConfirmed ? '#16A34A' : '#92400E', fontSize: 12, fontWeight: 800 }}>{record.cashConfirmed ? 'Cash confirmed' : 'Awaiting cash'}</span></> : null}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {cashOrder ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                            <CashActionButton
                              tone="confirm"
                              loading={pendingActionKey === confirmKey}
                              disabled={!storeId || !cashPending}
                              onClick={() => updateCashPayment(record, 'confirm')}
                            >
                              Confirm Cash Received
                            </CashActionButton>
                            <CashActionButton
                              tone="cancel"
                              loading={pendingActionKey === cancelKey}
                              disabled={!storeId || !cashPending}
                              onClick={() => updateCashPayment(record, 'cancel')}
                            >
                              Cancel Cash Order
                            </CashActionButton>
                          </div>
                        ) : <span style={{ color: '#94A3B8', fontSize: 13 }}>Not cash</span>}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            borderRadius: 999,
                            padding: '4px 9px',
                            fontSize: 12,
                            fontWeight: 800,
                            background: tone === 'success' ? '#DCFCE7' : tone === 'danger' ? '#FEE2E2' : tone === 'warning' ? '#FEF3C7' : '#E2E8F0',
                            color: tone === 'success' ? '#166534' : tone === 'danger' ? '#991B1B' : tone === 'warning' ? '#92400E' : '#334155',
                          }}
                        >
                          {normalizeStatus(primaryStatus || record.paymentStatus)}
                        </span>
                        {record.deliveredAt ? <><br /><span style={{ color: '#64748B', fontSize: 12 }}>Delivered: {record.deliveredAt.toLocaleString()}</span></> : null}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 320 }}>
                          {FULFILLMENT_ACTIONS.map(action => {
                            const actionKey = `${record.collectionName}-${record.id}-${action.id}`
                            return (
                              <FulfillmentButton
                                key={action.id}
                                active={actionIsActive(record, action.id)}
                                loading={pendingActionKey === actionKey}
                                disabled={!storeId}
                                onClick={() => updateFulfillment(record, action.id)}
                              >
                                {action.label}
                              </FulfillmentButton>
                            )
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#475569', fontSize: 13 }}>
                        <strong>Ref:</strong> {record.reference}
                        {record.clientOrderId ? <><br /><strong>Client:</strong> {record.clientOrderId}</> : null}
                        {record.sedifexOrderId ? <><br /><strong>Sedifex:</strong> {record.sedifexOrderId}</> : null}
                        {record.deliveryLocation ? <><br /><strong>Delivery:</strong> {record.deliveryLocation}</> : null}
                        {record.bookingDate || record.bookingTime ? <><br /><strong>Booking:</strong> {[record.bookingDate, record.bookingTime, record.preferredBranch].filter(Boolean).join(' · ')}</> : null}
                        {record.notes ? <><br /><strong>Notes:</strong> {record.notes}</> : null}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {contactHref ? (
                          <a
                            href={contactHref}
                            target={contactHref.startsWith('mailto:') ? undefined : '_blank'}
                            rel={contactHref.startsWith('mailto:') ? undefined : 'noreferrer'}
                            style={{
                              border: '1px solid #BBF7D0',
                              background: '#F0FDF4',
                              color: '#166534',
                              borderRadius: 999,
                              padding: '6px 10px',
                              fontSize: 12,
                              fontWeight: 800,
                              textDecoration: 'none',
                              display: 'inline-flex',
                            }}
                          >
                            Contact customer
                          </a>
                        ) : <span style={{ color: '#94A3B8', fontSize: 13 }}>No contact</span>}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#64748B', fontSize: 13 }}>
                        {record.createdAt ? record.createdAt.toLocaleString() : 'Unknown'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
