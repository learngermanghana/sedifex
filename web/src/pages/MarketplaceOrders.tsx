import React, { useEffect, useMemo, useState } from 'react'
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type OnlineOrderTab = 'all' | 'pending' | 'cash-orders' | 'online-paid' | 'sedifex-market' | 'client-website' | 'service-bookings'
type OrderCollection = 'integrationOrders' | 'integrationBookings' | 'cashOrders'
type FulfillmentAction =
  | 'accept'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'confirm_service'
  | 'service_in_progress'
  | 'service_completed'
  | 'complete_manual'

type CashAction = 'confirm' | 'cancel'

type ActionConfig = { id: FulfillmentAction; label: string; hint?: string }

type OnlineOrderRecord = {
  id: string
  collectionName: OrderCollection
  storeOnly?: boolean
  recordType: string
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
  fulfillmentStatus: string
  deliveryStatus: string
  paymentCollectionMode: string
  paymentMethod: string
  paymentProvider: string
  cashConfirmed: boolean
  sourceChannel: string
  sourceLabel: string
  createdAt: Date | null
  notes: string
}

const PRODUCT_ACTIONS: ActionConfig[] = [
  { id: 'accept', label: 'Accept order' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
]

const SERVICE_ACTIONS: ActionConfig[] = [
  { id: 'confirm_service', label: 'Confirm booking' },
  { id: 'service_in_progress', label: 'Service started' },
  { id: 'service_completed', label: 'Service completed' },
]

const MANUAL_ACTIONS: ActionConfig[] = [
  { id: 'complete_manual', label: 'Mark completed', hint: 'Confirm cash first before completing.' },
]

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
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

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate()
  return null
}

function normalizeStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function formatMoney(amount: number, currency: string) {
  return `${currency || 'GHS'} ${amount.toFixed(2)}`
}

function readAmount(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')
  const directAmountMinor = asNumber(source.amountMinor, 0)
  const finalTotalMinor = asNumber(pricingSnapshot.final_total_minor ?? pricingSnapshot.finalTotalMinor ?? pricingSnapshotSnake.final_total_minor ?? pricingSnapshotSnake.finalTotalMinor, 0)
  return asNumber(
    payment.customerTotal ?? payment.amount ?? source.amountPaid ?? source.amount_paid ?? source.confirmedAmount ?? source.amount ?? source.total ?? source.grandTotal ?? pricingSnapshot.subtotal ?? pricingSnapshot.finalTotal ?? pricingSnapshot.final_total ?? pricingSnapshotSnake.subtotal ?? pricingSnapshotSnake.finalTotal ?? pricingSnapshotSnake.final_total,
    directAmountMinor > 0 ? directAmountMinor / 100 : finalTotalMinor > 0 ? finalTotalMinor / 100 : 0,
  )
}

function readCurrency(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')
  return asText(payment.currency ?? pricingSnapshot.currency ?? pricingSnapshotSnake.currency ?? source.currency, 'GHS')
}

function normalizeSourceChannel(raw: string) {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (!normalized) return 'sedifex_market'
  if (normalized.includes('quick_pay_cash')) return 'quick_pay_cash'
  if (normalized.includes('website') || normalized.includes('wordpress') || normalized.includes('client')) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  return normalized
}

function sourceLabel(channel: string) {
  if (channel === 'quick_pay_cash') return 'Store Cash / Manual'
  if (channel === 'client_website') return 'Client Website'
  if (channel === 'sedifex_market') return 'Sedifex Market'
  return normalizeStatus(channel)
}

function readSourceChannel(source: Record<string, unknown>) {
  const metadata = getNestedObject(source, 'metadata')
  const payment = getNestedObject(source, 'payment')
  const raw = asText(source.sourceChannel ?? source.source_channel ?? metadata.sourceChannel ?? payment.sourceChannel ?? source.source, 'sedifex_market')
  return normalizeSourceChannel(raw)
}

function mapOrderRecord(id: string, collectionName: OrderCollection, data: Record<string, unknown>): OnlineOrderRecord {
  const customer = getNestedObject(data, 'customer')
  const payment = getNestedObject(data, 'payment')
  const cashPayment = getNestedObject(data, 'cashPayment')
  const item = firstItem(data)
  const metadata = getNestedObject(data, 'metadata')
  const channel = collectionName === 'cashOrders' ? 'quick_pay_cash' : readSourceChannel(data)
  const recordType = asText(data.recordType ?? data.orderType, collectionName === 'integrationBookings' ? 'service_booking' : collectionName === 'cashOrders' ? 'manual_cash_sale' : 'product_order')

  return {
    id,
    collectionName,
    storeOnly: collectionName === 'cashOrders' || asBoolean(data.storeOnly, false),
    recordType,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, id),
    customerName: asText(customer.name ?? data.customerName, 'Customer'),
    customerEmail: asText(customer.email ?? data.customerEmail, ''),
    customerPhone: asText(customer.phone ?? data.customerPhone, ''),
    itemName: asText(data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName ?? item.productName, recordType === 'service_booking' ? 'Service booking' : 'Manual sale'),
    quantity: asNumber(item.quantity ?? item.qty, 1),
    amount: readAmount(data),
    currency: readCurrency(data),
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status, 'pending'),
    fulfillmentStatus: asText(data.fulfillmentStatus ?? data.fulfillment_status, ''),
    deliveryStatus: asText(data.deliveryStatus ?? data.delivery_status, ''),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? data.payment_collection_mode ?? payment.mode, collectionName === 'cashOrders' ? 'cash' : 'online_checkout'),
    paymentMethod: asText(data.paymentMethod ?? data.payment_method ?? metadata.paymentMethod, collectionName === 'cashOrders' ? 'CASH' : ''),
    paymentProvider: asText(data.paymentProvider ?? data.payment_provider ?? payment.provider, collectionName === 'cashOrders' ? 'cash' : ''),
    cashConfirmed: asBoolean(data.cashConfirmed ?? cashPayment.cashConfirmed, false),
    sourceChannel: channel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceLabel(channel)),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
    notes: asText(data.notes, ''),
  }
}

function isServiceBooking(record: OnlineOrderRecord) {
  return record.recordType === 'service_booking' || record.collectionName === 'integrationBookings' || record.recordType === 'service'
}

function isManualStoreOrder(record: OnlineOrderRecord) {
  return record.collectionName === 'cashOrders' || record.recordType === 'manual_cash_sale' || Boolean(record.storeOnly)
}

function isProductOrder(record: OnlineOrderRecord) {
  return !isServiceBooking(record) && !isManualStoreOrder(record)
}

function isCashOrder(record: OnlineOrderRecord) {
  const joined = `${record.collectionName} ${record.paymentCollectionMode} ${record.paymentMethod} ${record.paymentProvider} ${record.paymentStatus} ${record.sourceChannel}`.toLowerCase()
  return joined.includes('cash')
}

function isCashAwaitingConfirmation(record: OnlineOrderRecord) {
  if (!isCashOrder(record) || record.cashConfirmed) return false
  const joined = `${record.paymentStatus} ${record.orderStatus}`.toLowerCase()
  return !['paid_cash', 'paid cash', 'success', 'confirmed', 'completed', 'cancelled', 'canceled'].some(token => joined.includes(token))
}

function isCashConvertible(record: OnlineOrderRecord) {
  if (isCashOrder(record)) return false
  const joined = `${record.paymentStatus} ${record.orderStatus} ${record.paymentCollectionMode}`.toLowerCase()
  if (['paid', 'success', 'confirmed', 'completed', 'cancelled', 'canceled', 'failed'].some(token => joined.includes(token))) return false
  return joined.includes('pending') || joined.includes('checkout') || joined.includes('awaiting') || joined.includes('waiting')
}

function isOnlinePaid(record: OnlineOrderRecord) {
  const status = record.paymentStatus.toLowerCase()
  return !isCashOrder(record) && ['success', 'confirmed', 'paid', 'captured'].some(token => status.includes(token))
}

function isPending(record: OnlineOrderRecord) {
  const joined = `${record.paymentStatus} ${record.orderStatus} ${record.fulfillmentStatus} ${record.deliveryStatus}`.toLowerCase()
  return joined.includes('pending') || joined.includes('waiting') || joined.includes('manual') || joined.includes('awaiting')
}

function filterRecords(records: OnlineOrderRecord[], tab: OnlineOrderTab) {
  if (tab === 'service-bookings') return records.filter(isServiceBooking)
  if (tab === 'cash-orders') return records.filter(isCashOrder)
  if (tab === 'online-paid') return records.filter(isOnlinePaid)
  if (tab === 'pending') return records.filter(isPending)
  if (tab === 'sedifex-market') return records.filter(record => record.sourceChannel === 'sedifex_market')
  if (tab === 'client-website') return records.filter(record => record.sourceChannel === 'client_website')
  return records
}

function getPrimaryStatus(record: OnlineOrderRecord) {
  return record.fulfillmentStatus || record.orderStatus || record.deliveryStatus || record.paymentStatus
}

function statusColor(status: string) {
  const normalized = status.toLowerCase()
  if (['success', 'confirmed', 'paid', 'paid_cash', 'completed', 'delivered', 'service_completed', 'manual_completed'].some(token => normalized.includes(token))) return { background: '#DCFCE7', color: '#166534' }
  if (['failed', 'cancelled', 'canceled'].some(token => normalized.includes(token))) return { background: '#FEE2E2', color: '#991B1B' }
  return { background: '#FEF3C7', color: '#92400E' }
}

function contactHref(record: OnlineOrderRecord) {
  const digits = record.customerPhone.replace(/[^\d]/g, '')
  if (digits) return `https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${record.customerName}, we are contacting you about your Sedifex order. Reference: ${record.reference}`)}`
  if (record.customerEmail) return `mailto:${record.customerEmail}?subject=${encodeURIComponent(`Sedifex order ${record.reference}`)}`
  return ''
}

function getDocumentRef(storeId: string, record: OnlineOrderRecord) {
  if (record.collectionName === 'cashOrders') return doc(db, 'stores', storeId, 'cashOrders', record.id)
  return doc(db, record.collectionName, record.id)
}

function getOrderActionType(record: OnlineOrderRecord) {
  if (isManualStoreOrder(record)) return 'manual'
  if (isServiceBooking(record)) return 'service'
  return 'product'
}

function getFulfillmentActions(record: OnlineOrderRecord): ActionConfig[] {
  const type = getOrderActionType(record)
  if (type === 'manual') return MANUAL_ACTIONS
  if (type === 'service') return SERVICE_ACTIONS
  return PRODUCT_ACTIONS
}

function actionIsBlocked(record: OnlineOrderRecord, action: FulfillmentAction) {
  if (action === 'complete_manual' && isCashAwaitingConfirmation(record)) return true
  return false
}

function actionBlockedMessage(record: OnlineOrderRecord, action: FulfillmentAction) {
  if (action === 'complete_manual' && isCashAwaitingConfirmation(record)) return 'Confirm cash first.'
  return ''
}

function cashPaymentPatch(record: OnlineOrderRecord, action: CashAction, storeId: string) {
  const nowIso = new Date().toISOString()
  const wasConvertedFromOnline = !isCashOrder(record)
  if (action === 'confirm') {
    return {
      paymentStatus: 'paid_cash',
      payment_status: 'paid_cash',
      orderStatus: 'completed',
      order_status: 'completed',
      fulfillmentStatus: isManualStoreOrder(record) ? 'manual_paid' : record.fulfillmentStatus || 'confirmed_by_store',
      fulfillment_status: isManualStoreOrder(record) ? 'manual_paid' : record.fulfillmentStatus || 'confirmed_by_store',
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
      storeOnly: record.collectionName === 'cashOrders' || record.storeOnly,
      excludedFromSedifexSettlement: record.collectionName === 'cashOrders' || record.storeOnly,
      inventoryDeductionStatus: 'cash_confirmed',
      convertedToCash: wasConvertedFromOnline,
      convertedToCashAt: wasConvertedFromOnline ? serverTimestamp() : null,
      previousPaymentCollectionMode: wasConvertedFromOnline ? record.paymentCollectionMode : null,
      previousPaymentStatus: wasConvertedFromOnline ? record.paymentStatus : null,
      cashPayment: { cashConfirmed: true, status: 'paid_cash', confirmedAmount: record.amount, currency: record.currency, confirmedAt: nowIso, confirmedBy: 'store', convertedFromOnlineCheckout: wasConvertedFromOnline },
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion({ status: 'paid_cash', orderStatus: 'completed', paymentStatus: 'paid_cash', action: wasConvertedFromOnline ? 'convert_pending_checkout_to_cash' : 'confirm_cash_received', actor: 'store', storeId, createdAt: nowIso, note: wasConvertedFromOnline ? 'Store converted pending online checkout to physical cash received.' : 'Store confirmed physical cash received.' }),
    }
  }

  return {
    paymentStatus: 'cancelled_cash',
    payment_status: 'cancelled_cash',
    orderStatus: 'cancelled',
    order_status: 'cancelled',
    fulfillmentStatus: 'cancelled',
    fulfillment_status: 'cancelled',
    cashConfirmed: false,
    cashCancelledAt: serverTimestamp(),
    cashCancelledBy: 'store',
    inventoryDeductionStatus: 'cash_cancelled',
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status: 'cancelled_cash', orderStatus: 'cancelled', paymentStatus: 'cancelled_cash', action: 'cancel_cash_order', actor: 'store', storeId, createdAt: nowIso, note: 'Store cancelled cash order.' }),
  }
}

function fulfillmentPatch(record: OnlineOrderRecord, action: FulfillmentAction, storeId: string) {
  const nowIso = new Date().toISOString()
  const map: Record<FulfillmentAction, { orderStatus: string; fulfillmentStatus: string; deliveryStatus: string; note: string }> = {
    accept: { orderStatus: 'confirmed_by_store', fulfillmentStatus: 'confirmed_by_store', deliveryStatus: 'not_started', note: 'Store accepted product order.' },
    preparing: { orderStatus: 'preparing', fulfillmentStatus: 'preparing', deliveryStatus: 'not_started', note: 'Product order is being prepared.' },
    out_for_delivery: { orderStatus: 'out_for_delivery', fulfillmentStatus: 'out_for_delivery', deliveryStatus: 'out_for_delivery', note: 'Product order is out for delivery.' },
    delivered: { orderStatus: 'delivered', fulfillmentStatus: 'completed', deliveryStatus: 'delivered', note: 'Product order delivered.' },
    confirm_service: { orderStatus: 'booking_confirmed', fulfillmentStatus: 'booking_confirmed', deliveryStatus: 'not_applicable', note: 'Service booking confirmed.' },
    service_in_progress: { orderStatus: 'service_in_progress', fulfillmentStatus: 'service_in_progress', deliveryStatus: 'not_applicable', note: 'Service has started.' },
    service_completed: { orderStatus: 'service_completed', fulfillmentStatus: 'completed', deliveryStatus: 'not_applicable', note: 'Service completed.' },
    complete_manual: { orderStatus: 'manual_completed', fulfillmentStatus: 'completed', deliveryStatus: 'not_applicable', note: 'Manual/store-only sale completed.' },
  }
  const next = map[action]
  return {
    orderStatus: next.orderStatus,
    order_status: next.orderStatus,
    fulfillmentStatus: next.fulfillmentStatus,
    fulfillment_status: next.fulfillmentStatus,
    deliveryStatus: next.deliveryStatus,
    delivery_status: next.deliveryStatus,
    updatedAt: serverTimestamp(),
    ...(action === 'delivered' || action === 'service_completed' || action === 'complete_manual' ? { completedAt: serverTimestamp(), deliveredAt: action === 'delivered' ? serverTimestamp() : null, completedBy: 'store' } : {}),
    statusHistory: arrayUnion({ status: next.orderStatus, fulfillmentStatus: next.fulfillmentStatus, deliveryStatus: next.deliveryStatus, action, actor: 'store', storeId, createdAt: nowIso, note: next.note }),
  }
}

function StatCard({ label, value, hint, active, onClick }: { label: string; value: string; hint: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: 'left', background: active ? '#EEF2FF' : '#F8FAFC', border: active ? '1px solid #4338CA' : '1px solid #E2E8F0', borderRadius: 18, padding: 16, cursor: 'pointer' }}>
      <p style={{ margin: 0, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>{label}</p>
      <p style={{ margin: '7px 0 3px', color: '#0F172A', fontSize: 27, fontWeight: 900 }}>{value}</p>
      <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>{hint}</p>
    </button>
  )
}

function PillButton({ children, onClick, disabled, tone = 'neutral', title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'confirm' | 'danger' | 'neutral'; title?: string }) {
  const colors = tone === 'confirm' ? { border: '#16A34A', background: '#DCFCE7', color: '#166534' } : tone === 'danger' ? { border: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' } : { border: '#CBD5E1', background: '#FFFFFF', color: '#334155' }
  return <button type="button" disabled={disabled} title={title} onClick={onClick} style={{ border: `1px solid ${colors.border}`, background: colors.background, color: colors.color, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap' }}>{children}</button>
}

export default function MarketplaceOrders({ compactHeader = false }: { compactHeader?: boolean }) {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OnlineOrderRecord[]>([])
  const [bookings, setBookings] = useState<OnlineOrderRecord[]>([])
  const [cashOrders, setCashOrders] = useState<OnlineOrderRecord[]>([])
  const [activeTab, setActiveTab] = useState<OnlineOrderTab>('all')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      setBookings([])
      setCashOrders([])
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    setError(null)
    const orderQuery = query(collection(db, 'integrationOrders'), where('storeId', '==', storeId))
    const bookingQuery = query(collection(db, 'integrationBookings'), where('storeId', '==', storeId))
    const cashQuery = collection(db, 'stores', storeId, 'cashOrders')

    const unsubscribeOrders = onSnapshot(orderQuery, snapshot => {
      setOrders(snapshot.docs.map(docSnap => mapOrderRecord(docSnap.id, 'integrationOrders', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders] Failed to load online orders', err)
      setError('Unable to load online orders right now.')
      setIsLoading(false)
    })

    const unsubscribeBookings = onSnapshot(bookingQuery, snapshot => {
      setBookings(snapshot.docs.map(docSnap => mapOrderRecord(docSnap.id, 'integrationBookings', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders] Failed to load bookings', err)
      setIsLoading(false)
    })

    const unsubscribeCashOrders = onSnapshot(cashQuery, snapshot => {
      setCashOrders(snapshot.docs.map(docSnap => mapOrderRecord(docSnap.id, 'cashOrders', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders] Failed to load store cash orders', err)
      setIsLoading(false)
    })

    return () => {
      unsubscribeOrders()
      unsubscribeBookings()
      unsubscribeCashOrders()
    }
  }, [storeId])

  async function mirrorStoreIntegrationOrder(record: OnlineOrderRecord, patch: Record<string, unknown>) {
    if (!storeId || record.collectionName !== 'integrationOrders') return
    try {
      await updateDoc(doc(db, 'stores', storeId, 'integrationOrders', record.id), patch)
    } catch (err) {
      console.warn('[market-orders] Store integration mirror update failed', err)
    }
  }

  async function updateRecord(record: OnlineOrderRecord, patch: Record<string, unknown>) {
    if (!storeId) return
    await updateDoc(getDocumentRef(storeId, record), patch)
    await mirrorStoreIntegrationOrder(record, patch)
  }

  async function updateCashPayment(record: OnlineOrderRecord, action: CashAction) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-cash-${action}`
    const label = action === 'confirm' ? (isCashOrder(record) ? 'confirm cash received' : 'confirm this pending checkout as cash received') : 'cancel this cash order'
    if (!window.confirm(`Are you sure you want to ${label}?`)) return
    setActionError(null)
    setPendingActionKey(key)
    try {
      await updateRecord(record, cashPaymentPatch(record, action, storeId))
    } catch (err) {
      console.error('[market-orders] Failed to update cash payment status', err)
      setActionError(err instanceof Error ? err.message : 'Unable to update cash payment status.')
    } finally {
      setPendingActionKey(null)
    }
  }

  async function updateFulfillment(record: OnlineOrderRecord, action: FulfillmentAction) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-${action}`
    setActionError(null)
    setPendingActionKey(key)
    try {
      await updateRecord(record, fulfillmentPatch(record, action, storeId))
    } catch (err) {
      console.error('[market-orders] Failed to update order action', err)
      setActionError(err instanceof Error ? err.message : 'Unable to update order status.')
    } finally {
      setPendingActionKey(null)
    }
  }

  const allRecords = useMemo(() => [...orders, ...bookings, ...cashOrders].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)), [bookings, cashOrders, orders])

  const stats = useMemo(() => {
    const cash = allRecords.filter(isCashOrder)
    const pendingCash = cash.filter(isCashAwaitingConfirmation)
    const onlinePaid = allRecords.filter(isOnlinePaid)
    const pending = allRecords.filter(isPending)
    return {
      all: allRecords,
      cash,
      pendingCash,
      onlinePaid,
      pending,
      serviceBookings: allRecords.filter(isServiceBooking),
      sedifexMarket: allRecords.filter(record => record.sourceChannel === 'sedifex_market'),
      clientWebsite: allRecords.filter(record => record.sourceChannel === 'client_website'),
      cashPendingValue: pendingCash.reduce((sum, record) => sum + record.amount, 0),
      totalPaidValue: onlinePaid.reduce((sum, record) => sum + record.amount, 0),
    }
  }, [allRecords])

  const tabs: Array<{ id: OnlineOrderTab; label: string; count: number }> = [
    { id: 'all', label: 'All Orders', count: stats.all.length },
    { id: 'pending', label: 'Pending', count: stats.pending.length },
    { id: 'cash-orders', label: 'Store Cash Orders', count: stats.cash.length },
    { id: 'online-paid', label: 'Online Paid', count: stats.onlinePaid.length },
    { id: 'service-bookings', label: 'Service Bookings', count: stats.serviceBookings.length },
    { id: 'sedifex-market', label: 'Sedifex Market', count: stats.sedifexMarket.length },
    { id: 'client-website', label: 'Client Website', count: stats.clientWebsite.length },
  ]

  const filteredRecords = useMemo(() => {
    const tabRecords = filterRecords(allRecords, activeTab)
    const search = searchText.trim().toLowerCase()
    if (!search) return tabRecords
    return tabRecords.filter(record => [record.reference, record.customerName, record.customerEmail, record.customerPhone, record.itemName, record.sourceLabel, record.paymentStatus, record.orderStatus, record.paymentCollectionMode, record.paymentMethod].join(' ').toLowerCase().includes(search))
  }, [activeTab, allRecords, searchText])

  return (
    <div>
      {!compactHeader ? (
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Store order workspace</p>
          <h1 style={{ color: '#111827', margin: 0 }}>Sales & Market Orders</h1>
          <p style={{ color: '#475569', margin: '8px 0 0' }}>Products, services, and manual cash entries now use different action buttons.</p>
        </div>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="All orders" value={String(stats.all.length)} hint="Online + store-only cash" active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
        <StatCard label="Pending" value={String(stats.pending.length)} hint="Needs follow-up" active={activeTab === 'pending'} onClick={() => setActiveTab('pending')} />
        <StatCard label="Store cash" value={String(stats.cash.length)} hint={`${formatMoney(stats.cashPendingValue, 'GHS')} pending cash`} active={activeTab === 'cash-orders'} onClick={() => setActiveTab('cash-orders')} />
        <StatCard label="Online paid" value={String(stats.onlinePaid.length)} hint={`${formatMoney(stats.totalPaidValue, 'GHS')} confirmed`} active={activeTab === 'online-paid'} onClick={() => setActiveTab('online-paid')} />
        <StatCard label="Service bookings" value={String(stats.serviceBookings.length)} hint="Appointments and classes" active={activeTab === 'service-bookings'} onClick={() => setActiveTab('service-bookings')} />
      </section>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 22, padding: 18, display: 'grid', gap: 16, boxShadow: '0 24px 60px -48px rgba(15, 23, 42, 0.7)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111827' }}>Orders workspace</h2>
            <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 14 }}>Product rows use delivery buttons. Service rows use booking/service buttons. Manual cash rows use completion only after cash is confirmed.</p>
          </div>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, minWidth: 250 }}>
            Search
            <input type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Reference, customer, item, status…" style={{ border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 11px' }} />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tabs.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ border: activeTab === tab.id ? '1px solid #4338CA' : '1px solid #CBD5E1', background: activeTab === tab.id ? '#EEF2FF' : '#FFFFFF', color: activeTab === tab.id ? '#3730A3' : '#334155', borderRadius: 999, padding: '8px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>{tab.label} ({tab.count})</button>
          ))}
        </div>

        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>{error}</p> : null}
        {actionError ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>Status update failed: {actionError}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading order records…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view orders.</p> : null}
        {!isLoading && storeId && filteredRecords.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No records found for this view yet.</p> : null}

        {filteredRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1250 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Customer</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Item</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Source</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Amount</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Payment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Cash Action</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Order Action</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(record => {
                  const primaryStatus = getPrimaryStatus(record)
                  const colors = statusColor(primaryStatus || record.paymentStatus)
                  const href = contactHref(record)
                  const cashOrder = isCashOrder(record)
                  const cashPending = isCashAwaitingConfirmation(record)
                  const cashConvertible = isCashConvertible(record)
                  const showCashAction = cashOrder || cashConvertible
                  const confirmKey = `${record.collectionName}-${record.id}-cash-confirm`
                  const cancelKey = `${record.collectionName}-${record.id}-cash-cancel`
                  const actionGroup = getOrderActionType(record)
                  const orderActions = getFulfillmentActions(record)

                  return (
                    <tr key={`${record.collectionName}-${record.id}`} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.customerName}</strong><br /><span style={{ color: '#64748B', fontSize: 13 }}>{record.customerPhone || record.customerEmail || 'No contact'}</span></td>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.itemName}</strong><br /><span style={{ color: '#64748B', fontSize: 13 }}>{actionGroup === 'product' ? `Qty: ${record.quantity || 1}` : actionGroup === 'service' ? 'Service booking' : 'Manual entry'}</span></td>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.sourceLabel}</strong><br /><span style={{ color: record.storeOnly ? '#92400E' : '#64748B', fontSize: 12, fontWeight: 800 }}>{record.storeOnly ? 'Store-only data' : record.collectionName}</span></td>
                      <td style={{ padding: '12px 8px', color: '#0F172A', fontWeight: 800 }}>{formatMoney(record.amount, record.currency)}</td>
                      <td style={{ padding: '12px 8px' }}><strong>{normalizeStatus(record.paymentCollectionMode)}</strong><br /><span style={{ color: '#64748B', fontSize: 13 }}>{normalizeStatus(record.paymentStatus)}</span>{cashOrder ? <><br /><span style={{ color: record.cashConfirmed ? '#16A34A' : '#92400E', fontSize: 12, fontWeight: 900 }}>{record.cashConfirmed ? 'Cash confirmed' : 'Awaiting cash'}</span></> : null}</td>
                      <td style={{ padding: '12px 8px' }}>
                        {showCashAction ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 155 }}>
                            <PillButton tone="confirm" disabled={!storeId || pendingActionKey === confirmKey || (!cashPending && !cashConvertible)} onClick={() => updateCashPayment(record, 'confirm')}>{pendingActionKey === confirmKey ? 'Saving…' : cashOrder ? 'Confirm Cash Received' : 'Confirm as Cash Received'}</PillButton>
                            {cashOrder ? <PillButton tone="danger" disabled={!storeId || pendingActionKey === cancelKey || !cashPending} onClick={() => updateCashPayment(record, 'cancel')}>{pendingActionKey === cancelKey ? 'Saving…' : 'Cancel Cash Order'}</PillButton> : <span style={{ color: '#64748B', fontSize: 12 }}>Use only if customer paid physically.</span>}
                          </div>
                        ) : <span style={{ color: '#94A3B8', fontSize: 13 }}>No cash action</span>}
                      </td>
                      <td style={{ padding: '12px 8px' }}><span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900, ...colors }}>{normalizeStatus(primaryStatus || record.paymentStatus)}</span><br /><span style={{ color: '#64748B', fontSize: 12 }}>{record.reference}</span></td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 280 }}>
                          {orderActions.map(action => {
                            const actionKey = `${record.collectionName}-${record.id}-${action.id}`
                            const blocked = actionIsBlocked(record, action.id)
                            return (
                              <PillButton key={action.id} disabled={!storeId || blocked || pendingActionKey === actionKey} title={actionBlockedMessage(record, action.id) || action.hint} onClick={() => updateFulfillment(record, action.id)}>
                                {pendingActionKey === actionKey ? 'Saving…' : action.label}
                              </PillButton>
                            )
                          })}
                          {actionGroup === 'manual' && cashPending ? <span style={{ color: '#92400E', fontSize: 12, fontWeight: 700 }}>Confirm cash first.</span> : null}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{href ? <a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel={href.startsWith('mailto:') ? undefined : 'noreferrer'} style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, textDecoration: 'none', display: 'inline-flex' }}>Contact</a> : <span style={{ color: '#94A3B8', fontSize: 13 }}>No contact</span>}</td>
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
