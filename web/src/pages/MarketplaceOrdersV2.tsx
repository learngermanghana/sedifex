import React, { useEffect, useMemo, useState } from 'react'
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { canonicalBookingOrderKey, chooseMoreCompleteRecord, deriveCanonicalOrderStatus, deriveOnlineOrderStatusFromBooking, normalizeBookingStatusFromRecord, normalizePaymentStatusFromRecord, orderStatusLabel, paymentStatusLabel } from '../lib/bookingStatus'

type OrderTab = 'all' | 'pending' | 'cash' | 'online-paid' | 'services' | 'bookings' | 'products'
type OrderCollection = 'integrationOrders' | 'integrationBookings' | 'cashOrders'
type OrderGroup = 'product' | 'service' | 'booking' | 'manual'

type OrderRecord = {
  id: string
  collectionName: OrderCollection
  reference: string
  bookingId: string
  itemId: string
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
  sourceLabel: string
  createdAt: Date | null
  updatedAt: Date | null
  recordType: string
  itemType: 'product' | 'service' | 'course' | 'manual'
  storeOnly: boolean
}

type CatalogLookup = {
  serviceIds: Set<string>
  serviceNames: Set<string>
  bookingIds: Set<string>
  bookingNames: Set<string>
}

type ActionConfig = {
  status: string
  label: string
  fulfillmentStatus?: string
  deliveryStatus?: string
  bookingStatus?: string
  note: string
}

const PRODUCT_ACTIONS: ActionConfig[] = [
  { status: 'confirmed_by_store', label: 'Accept order', fulfillmentStatus: 'confirmed_by_store', deliveryStatus: 'not_started', note: 'Store accepted product order.' },
  { status: 'preparing', label: 'Preparing', fulfillmentStatus: 'preparing', deliveryStatus: 'not_started', note: 'Product order is being prepared.' },
  { status: 'out_for_delivery', label: 'Out for delivery', fulfillmentStatus: 'out_for_delivery', deliveryStatus: 'out_for_delivery', note: 'Product order is out for delivery.' },
  { status: 'delivered', label: 'Delivered', fulfillmentStatus: 'completed', deliveryStatus: 'delivered', note: 'Product order delivered.' },
]

const SERVICE_ACTIONS: ActionConfig[] = [
  { status: 'service_confirmed', label: 'Confirm service', fulfillmentStatus: 'service_confirmed', deliveryStatus: 'not_applicable', note: 'Service payment confirmed by store.' },
  { status: 'service_in_progress', label: 'Service started', fulfillmentStatus: 'service_in_progress', deliveryStatus: 'not_applicable', note: 'Service has started.' },
  { status: 'service_completed', label: 'Service completed', fulfillmentStatus: 'completed', deliveryStatus: 'not_applicable', note: 'Service completed.' },
]

const BOOKING_ACTIONS: ActionConfig[] = [
  { status: 'booking_confirmed', label: 'Confirm booking', fulfillmentStatus: 'booking_confirmed', deliveryStatus: 'not_applicable', bookingStatus: 'confirmed', note: 'Booking confirmed by store.' },
  { status: 'service_in_progress', label: 'Service started', fulfillmentStatus: 'service_in_progress', deliveryStatus: 'not_applicable', bookingStatus: 'confirmed', note: 'Booked service has started.' },
  { status: 'service_completed', label: 'Complete booking', fulfillmentStatus: 'completed', deliveryStatus: 'not_applicable', bookingStatus: 'completed', note: 'Booking completed.' },
]

const MANUAL_ACTIONS: ActionConfig[] = [
  { status: 'manual_completed', label: 'Mark completed', fulfillmentStatus: 'completed', deliveryStatus: 'not_applicable', note: 'Manual/store-only sale completed.' },
]

function asText(value: unknown, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function getObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstItem(source: Record<string, unknown>) {
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

function normalizeKey(value: unknown) {
  return asText(value, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function displayPaymentStatus(value: string) {
  return paymentStatusLabel(value)
}

function displayOrderStatus(value: string) {
  const raw = value.toLowerCase().replace(/[\s-]+/g, '_')
  const canonical = orderStatusLabel(value)
  if (canonical === 'Pending Store Confirmation' && raw && raw !== 'pending' && raw !== 'pending_store_confirmation') return normalizeStatus(value)
  return canonical
}

function formatMoney(amount: number, currency: string) {
  return `${currency || 'GHS'} ${amount.toFixed(2)}`
}

function formatDate(value: Date | null) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

function normalizeItemType(value: unknown): 'product' | 'service' | 'course' | '' {
  const normalized = asText(value).toLowerCase().replace(/[\s_-]+/g, '_')
  if (['service', 'service_booking', 'booking', 'service_purchase', 'service_payment', 'appointment'].includes(normalized)) return 'service'
  if (['course', 'class', 'training', 'course_payment', 'student_registration', 'donation'].includes(normalized)) return 'course'
  if (['product', 'product_order', 'physical_product'].includes(normalized)) return 'product'
  return ''
}

function readItemId(source: Record<string, unknown>) {
  const item = firstItem(source)
  const metadata = getObject(source, 'metadata')
  const data = getObject(source, 'data')
  return asText(
    source.itemId ?? source.item_id ?? source.productId ?? source.product_id ?? source.serviceId ?? source.service_id
      ?? item.itemId ?? item.item_id ?? item.productId ?? item.product_id ?? item.serviceId ?? item.service_id ?? item.slotId
      ?? metadata.itemId ?? metadata.item_id ?? metadata.productId ?? metadata.product_id ?? metadata.serviceId ?? metadata.service_id ?? metadata.slotId
      ?? data.itemId ?? data.item_id ?? data.productId ?? data.product_id ?? data.serviceId ?? data.service_id,
    '',
  )
}

function readItemType(source: Record<string, unknown>, collectionName: OrderCollection, recordType: string): OrderRecord['itemType'] {
  if (collectionName === 'cashOrders' || recordType === 'manual_cash_sale' || recordType === 'manual_quick_sale') return 'manual'

  const item = firstItem(source)
  const metadata = getObject(source, 'metadata')
  const data = getObject(source, 'data')
  const pricingSnapshot = getObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getObject(source, 'pricing_snapshot')
  const snapshotItems = Array.isArray(pricingSnapshot.items) ? pricingSnapshot.items : Array.isArray(pricingSnapshotSnake.items) ? pricingSnapshotSnake.items : []
  const snapshotFirst = snapshotItems[0] && typeof snapshotItems[0] === 'object' ? snapshotItems[0] as Record<string, unknown> : {}

  const candidates = [
    metadata.quickPayType,
    metadata.originalQuickPayType,
    metadata.accountingType,
    metadata.originalItemType,
    metadata.itemType,
    metadata.item_type,
    data.accountingType,
    data.recordType,
    data.itemType,
    data.item_type,
    item.quickPayType,
    item.originalQuickPayType,
    item.accountingType,
    item.orderType,
    item.itemType,
    item.item_type,
    item.listingType,
    item.listing_type,
    item.type,
    snapshotFirst.quickPayType,
    snapshotFirst.originalQuickPayType,
    snapshotFirst.accountingType,
    snapshotFirst.itemType,
    snapshotFirst.item_type,
    snapshotFirst.listingType,
    snapshotFirst.listing_type,
    snapshotFirst.type,
    source.quickPayType,
    source.accountingType,
    source.accounting_type,
    source.recordType,
    source.orderType,
    source.order_type,
    source.itemType,
    source.item_type,
    source.listingType,
    source.listing_type,
    source.type,
    recordType,
  ].map(normalizeItemType)

  if (candidates.includes('course')) return 'course'
  if (candidates.includes('service')) return 'service'
  if (collectionName === 'integrationBookings') return 'service'
  if (`${recordType}`.toLowerCase().includes('service') || `${recordType}`.toLowerCase().includes('booking')) return 'service'
  if (candidates.includes('product')) return 'product'
  return 'product'
}

function readAmount(source: Record<string, unknown>) {
  const payment = getObject(source, 'payment')
  const pricingSnapshot = getObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getObject(source, 'pricing_snapshot')
  const directAmountMinor = asNumber(source.amountMinor ?? source.amount_minor, 0)
  const finalTotalMinor = asNumber(pricingSnapshot.final_total_minor ?? pricingSnapshot.finalTotalMinor ?? pricingSnapshotSnake.final_total_minor ?? pricingSnapshotSnake.finalTotalMinor, 0)
  return asNumber(
    payment.customerTotal
      ?? payment.amount
      ?? source.amountPaid
      ?? source.amount_paid
      ?? source.confirmedAmount
      ?? source.amount
      ?? source.total
      ?? source.grandTotal
      ?? pricingSnapshot.subtotal
      ?? pricingSnapshot.finalTotal
      ?? pricingSnapshot.final_total
      ?? pricingSnapshotSnake.subtotal
      ?? pricingSnapshotSnake.finalTotal
      ?? pricingSnapshotSnake.final_total,
    directAmountMinor > 0 ? directAmountMinor / 100 : finalTotalMinor > 0 ? finalTotalMinor / 100 : 0,
  )
}

function readSourceLabel(source: Record<string, unknown>, collectionName: OrderCollection) {
  const metadata = getObject(source, 'metadata')
  const raw = asText(source.sourceLabel ?? source.source_label ?? metadata.sourceLabel ?? metadata.sourceChannel ?? source.sourceChannel ?? source.source_channel, '')
  if (raw) return raw
  if (collectionName === 'cashOrders') return 'Store Cash / Manual'
  return 'Sedifex Market'
}

function mapOrder(id: string, collectionName: OrderCollection, source: Record<string, unknown>): OrderRecord {
  const customer = getObject(source, 'customer')
  const payment = getObject(source, 'payment')
  const cashPayment = getObject(source, 'cashPayment')
  const item = firstItem(source)
  const metadata = getObject(source, 'metadata')
  const recordType = asText(
    source.recordType
      ?? source.orderType
      ?? source.order_type
      ?? metadata.recordType
      ?? metadata.orderType
      ?? metadata.accountingType
      ?? source.accountingType
      ?? source.accounting_type
      ?? source.itemType
      ?? source.item_type,
    collectionName === 'integrationBookings' ? 'service_booking' : collectionName === 'cashOrders' ? 'manual_cash_sale' : 'product_order',
  )
  const itemType = readItemType(source, collectionName, recordType)

  const createdAt = toDate(source.createdAtServer ?? source.createdAt ?? source.created_at ?? source.orderDate ?? source.order_date ?? source.createdAtIso)
  const updatedAt = toDate(source.updatedAt ?? source.updated_at ?? source.paymentUpdatedAt ?? source.payment_updated_at)
  const bookingId = asText(source.booking_id ?? source.bookingId ?? source.booking_id_ref ?? metadata.booking_id ?? metadata.bookingId, collectionName === 'integrationBookings' ? id : '')
  const bookingStatus = normalizeBookingStatusFromRecord(source)
  const paymentStatus = normalizePaymentStatusFromRecord(source)
  const orderStatus = String(deriveCanonicalOrderStatus(source, bookingId ? deriveOnlineOrderStatusFromBooking(bookingStatus) : 'pending_store_confirmation'))

  return {
    id,
    collectionName,
    reference: asText(source.reference ?? source.paymentReference ?? source.payment_reference, id),
    bookingId,
    itemId: readItemId(source),
    customerName: asText(customer.name ?? source.customerName ?? source.customer_name ?? metadata.customerName, 'Customer'),
    customerEmail: asText(customer.email ?? source.customerEmail ?? source.customer_email ?? metadata.customerEmail, ''),
    customerPhone: asText(customer.phone ?? source.customerPhone ?? source.customer_phone ?? metadata.customerPhone, ''),
    itemName: asText(source.itemName ?? source.productName ?? source.serviceName ?? item.name ?? item.itemName ?? item.productName ?? item.serviceName ?? metadata.itemName, itemType === 'product' ? 'Product order' : itemType === 'manual' ? 'Manual sale' : 'Service payment'),
    quantity: asNumber(item.quantity ?? item.qty, 1),
    amount: readAmount(source),
    currency: asText(payment.currency ?? source.currency, 'GHS'),
    paymentStatus,
    orderStatus,
    fulfillmentStatus: asText(source.fulfillmentStatus ?? source.fulfillment_status, ''),
    deliveryStatus: asText(source.deliveryStatus ?? source.delivery_status, ''),
    paymentCollectionMode: asText(source.paymentCollectionMode ?? source.payment_collection_mode ?? payment.mode, collectionName === 'cashOrders' ? 'cash' : 'online_checkout'),
    paymentMethod: asText(source.paymentMethod ?? source.payment_method ?? metadata.paymentMethod, collectionName === 'cashOrders' ? 'CASH' : ''),
    paymentProvider: asText(source.paymentProvider ?? source.payment_provider ?? payment.provider, collectionName === 'cashOrders' ? 'cash' : ''),
    cashConfirmed: asBoolean(source.cashConfirmed ?? cashPayment.cashConfirmed, false),
    sourceLabel: readSourceLabel(source, collectionName),
    createdAt,
    updatedAt,
    recordType,
    itemType,
    storeOnly: collectionName === 'cashOrders' || asBoolean(source.storeOnly, false),
  }
}

function emptyCatalogLookup(): CatalogLookup {
  return { serviceIds: new Set(), serviceNames: new Set(), bookingIds: new Set(), bookingNames: new Set() }
}

function readCatalogName(record: Record<string, unknown>) {
  return asText(record.name ?? record.serviceName ?? record.productName ?? record.courseName ?? record.title, '')
}

function catalogLookupFromDocs(docs: Array<{ id: string; data: () => Record<string, unknown> }>, kind: 'service' | 'booking') {
  const ids = new Set<string>()
  const names = new Set<string>()
  docs.forEach(docSnap => {
    const data = docSnap.data()
    const id = normalizeKey(data.itemId ?? data.item_id ?? data.serviceId ?? data.service_id ?? data.slotId ?? docSnap.id)
    const name = normalizeKey(readCatalogName(data))
    if (id) ids.add(id)
    if (name) names.add(name)
  })
  return kind === 'service'
    ? { serviceIds: ids, serviceNames: names, bookingIds: new Set<string>(), bookingNames: new Set<string>() }
    : { serviceIds: new Set<string>(), serviceNames: new Set<string>(), bookingIds: ids, bookingNames: names }
}

function hasCatalogMatch(record: OrderRecord, ids: Set<string>, names: Set<string>) {
  const itemId = normalizeKey(record.itemId)
  const itemName = normalizeKey(record.itemName)
  return Boolean((itemId && ids.has(itemId)) || (itemName && names.has(itemName)))
}

function withCatalogClassification(record: OrderRecord, catalog: CatalogLookup): OrderRecord {
  if (record.itemType === 'manual') return record
  const bookingMatch = hasCatalogMatch(record, catalog.bookingIds, catalog.bookingNames)
  if (bookingMatch) {
    return {
      ...record,
      itemType: 'service',
      recordType: record.recordType === 'product_order' ? 'service_booking' : record.recordType,
      bookingId: record.bookingId || record.itemId,
    }
  }

  const serviceMatch = hasCatalogMatch(record, catalog.serviceIds, catalog.serviceNames)
  if (serviceMatch) {
    return {
      ...record,
      itemType: 'service',
      recordType: record.recordType === 'product_order' ? 'service_purchase' : record.recordType,
    }
  }

  return record
}

function orderGroup(record: OrderRecord): OrderGroup {
  const type = record.recordType.toLowerCase().replace(/[\s-]+/g, '_')
  if (record.itemType === 'manual' || record.collectionName === 'cashOrders') return 'manual'
  if (record.collectionName === 'integrationBookings' || type.includes('booking') || Boolean(record.bookingId && !type.includes('service_purchase'))) return 'booking'
  if (record.itemType === 'service' || record.itemType === 'course' || type.includes('service') || type.includes('course') || type.includes('student_registration') || type.includes('donation')) return 'service'
  return 'product'
}

function isBooking(record: OrderRecord) {
  return orderGroup(record) === 'booking'
}

function isService(record: OrderRecord) {
  const group = orderGroup(record)
  return group === 'service' || group === 'booking'
}

function isProduct(record: OrderRecord) {
  return orderGroup(record) === 'product'
}

function isCash(record: OrderRecord) {
  const text = `${record.collectionName} ${record.paymentCollectionMode} ${record.paymentMethod} ${record.paymentProvider} ${record.paymentStatus}`.toLowerCase()
  return text.includes('cash')
}

function isOnlinePaid(record: OrderRecord) {
  const status = record.paymentStatus.toLowerCase()
  return !isCash(record) && ['success', 'confirmed', 'paid', 'captured'].some(token => status.includes(token))
}

function isPending(record: OrderRecord) {
  const text = `${record.paymentStatus} ${record.orderStatus} ${record.fulfillmentStatus}`.toLowerCase()
  return ['pending', 'waiting', 'manual', 'awaiting'].some(token => text.includes(token))
}

function serviceLabel(record: OrderRecord) {
  const type = record.recordType.toLowerCase()
  if (isBooking(record)) return 'Service booking'
  if (type.includes('course')) return 'Course payment'
  if (type.includes('student_registration')) return 'Student registration'
  if (type.includes('donation')) return 'Donation'
  return 'Service payment'
}

function rowTypeLabel(record: OrderRecord) {
  const group = orderGroup(record)
  if (group === 'product') return `Product · Qty: ${record.quantity || 1}`
  if (group === 'booking') return 'Booking / appointment'
  if (group === 'service') return serviceLabel(record)
  return 'Manual entry'
}

function primaryStatus(record: OrderRecord) {
  const orderStatusKey = record.orderStatus.toLowerCase().replace(/[\s-]+/g, '_')
  const fulfillmentStatusKey = record.fulfillmentStatus.toLowerCase().replace(/[\s-]+/g, '_')
  if (['paid', 'success', 'captured'].includes(orderStatusKey) && fulfillmentStatusKey === 'pending_store_confirmation') return record.fulfillmentStatus
  return record.orderStatus || record.fulfillmentStatus || record.paymentStatus
}

function mergeBookingStatusIntoOrder(order: OrderRecord, booking: OrderRecord): OrderRecord {
  return {
    ...order,
    bookingId: order.bookingId || booking.bookingId || booking.id,
    paymentStatus: booking.paymentStatus || order.paymentStatus,
    orderStatus: String(deriveCanonicalOrderStatus({ bookingStatus: booking.orderStatus, paymentStatus: booking.paymentStatus, orderStatus: order.orderStatus }, order.orderStatus)),
    fulfillmentStatus: booking.fulfillmentStatus || order.fulfillmentStatus,
    amount: booking.amount || order.amount,
    itemName: booking.itemName || order.itemName,
    itemType: booking.itemType === 'manual' ? order.itemType : booking.itemType,
    recordType: booking.recordType || order.recordType,
  }
}

function statusStyle(status: string): React.CSSProperties {
  const normalized = status.toLowerCase()
  if (['success', 'confirmed', 'paid', 'paid_cash', 'completed', 'delivered', 'service_completed', 'manual_completed'].some(token => normalized.includes(token))) {
    return { background: '#DCFCE7', color: '#166534' }
  }
  if (['failed', 'cancelled', 'canceled'].some(token => normalized.includes(token))) {
    return { background: '#FEE2E2', color: '#991B1B' }
  }
  return { background: '#FEF3C7', color: '#92400E' }
}

function filterRecords(records: OrderRecord[], tab: OrderTab) {
  if (tab === 'pending') return records.filter(isPending)
  if (tab === 'cash') return records.filter(isCash)
  if (tab === 'online-paid') return records.filter(isOnlinePaid)
  if (tab === 'services') return records.filter(isService)
  if (tab === 'bookings') return records.filter(isBooking)
  if (tab === 'products') return records.filter(isProduct)
  return records
}

function contactHref(record: OrderRecord) {
  const digits = record.customerPhone.replace(/[^\d]/g, '')
  if (digits) return `https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${record.customerName}, we are contacting you about your Sedifex order. Reference: ${record.reference}`)}`
  if (record.customerEmail) return `mailto:${record.customerEmail}?subject=${encodeURIComponent(`Sedifex order ${record.reference}`)}`
  return ''
}

function getDocumentRef(storeId: string, record: OrderRecord) {
  if (record.collectionName === 'cashOrders') return doc(db, 'stores', storeId, 'cashOrders', record.id)
  return doc(db, record.collectionName, record.id)
}

function actionsForRecord(record: OrderRecord) {
  const group = orderGroup(record)
  if (group === 'product') return PRODUCT_ACTIONS
  if (group === 'booking') return BOOKING_ACTIONS
  if (group === 'service') return SERVICE_ACTIONS
  return MANUAL_ACTIONS
}

function actionPatch(record: OrderRecord, action: ActionConfig, storeId: string) {
  const nowIso = new Date().toISOString()
  const completed = ['delivered', 'service_completed', 'manual_completed'].includes(action.status)
  return {
    orderStatus: action.status,
    order_status: action.status,
    fulfillmentStatus: action.fulfillmentStatus ?? action.status,
    fulfillment_status: action.fulfillmentStatus ?? action.status,
    deliveryStatus: action.deliveryStatus ?? record.deliveryStatus,
    delivery_status: action.deliveryStatus ?? record.deliveryStatus,
    ...(action.bookingStatus ? { bookingStatus: action.bookingStatus, booking_status: action.bookingStatus } : {}),
    ...(completed ? { completedAt: serverTimestamp(), completedBy: 'store' } : {}),
    ...(action.status === 'delivered' ? { deliveredAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({
      status: action.status,
      fulfillmentStatus: action.fulfillmentStatus ?? action.status,
      deliveryStatus: action.deliveryStatus ?? record.deliveryStatus,
      action: action.status,
      actor: 'store',
      storeId,
      createdAt: nowIso,
      note: action.note,
    }),
  }
}

export default function MarketplaceOrdersV2({ compactHeader = false }: { compactHeader?: boolean }) {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [bookings, setBookings] = useState<OrderRecord[]>([])
  const [cashOrders, setCashOrders] = useState<OrderRecord[]>([])
  const [serviceCatalog, setServiceCatalog] = useState<CatalogLookup>(() => emptyCatalogLookup())
  const [bookingCatalog, setBookingCatalog] = useState<CatalogLookup>(() => emptyCatalogLookup())
  const [activeTab, setActiveTab] = useState<OrderTab>('all')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      setBookings([])
      setCashOrders([])
      setServiceCatalog(emptyCatalogLookup())
      setBookingCatalog(emptyCatalogLookup())
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    setError(null)
    const orderQuery = query(collection(db, 'integrationOrders'), where('storeId', '==', storeId))
    const bookingQuery = query(collection(db, 'integrationBookings'), where('storeId', '==', storeId))
    const cashQuery = collection(db, 'stores', storeId, 'cashOrders')
    const servicesQuery = collection(db, 'stores', storeId, 'services')
    const bookingSlotsQuery = collection(db, 'stores', storeId, 'integrationAvailabilitySlots')

    const unsubscribeOrders = onSnapshot(orderQuery, snapshot => {
      setOrders(snapshot.docs.map(docSnap => mapOrder(docSnap.id, 'integrationOrders', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders-v2] Failed to load orders', err)
      setError('Unable to load online orders right now.')
      setIsLoading(false)
    })

    const unsubscribeBookings = onSnapshot(bookingQuery, snapshot => {
      setBookings(snapshot.docs.map(docSnap => mapOrder(docSnap.id, 'integrationBookings', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders-v2] Failed to load bookings', err)
      setIsLoading(false)
    })

    const unsubscribeCash = onSnapshot(cashQuery, snapshot => {
      setCashOrders(snapshot.docs.map(docSnap => mapOrder(docSnap.id, 'cashOrders', docSnap.data() as Record<string, unknown>)))
      setIsLoading(false)
    }, err => {
      console.error('[market-orders-v2] Failed to load cash orders', err)
      setIsLoading(false)
    })

    const unsubscribeServices = onSnapshot(servicesQuery, snapshot => {
      setServiceCatalog(catalogLookupFromDocs(snapshot.docs.map(docSnap => ({ id: docSnap.id, data: () => docSnap.data() as Record<string, unknown> })), 'service'))
    }, err => {
      console.warn('[market-orders-v2] Failed to load service catalog', err)
    })

    const unsubscribeBookingSlots = onSnapshot(bookingSlotsQuery, snapshot => {
      setBookingCatalog(catalogLookupFromDocs(snapshot.docs.map(docSnap => ({ id: docSnap.id, data: () => docSnap.data() as Record<string, unknown> })), 'booking'))
    }, err => {
      console.warn('[market-orders-v2] Failed to load booking catalog', err)
    })

    return () => {
      unsubscribeOrders()
      unsubscribeBookings()
      unsubscribeCash()
      unsubscribeServices()
      unsubscribeBookingSlots()
    }
  }, [storeId])

  async function updateStatus(record: OrderRecord, action: ActionConfig) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-${action.status}`
    setPendingActionKey(key)
    try {
      const patch = actionPatch(record, action, storeId)
      await updateDoc(getDocumentRef(storeId, record), patch)
      if (record.collectionName === 'integrationOrders') {
        await updateDoc(doc(db, 'stores', storeId, 'integrationOrders', record.id), patch).catch(() => null)
      }
    } catch (err) {
      console.error('[market-orders-v2] Failed to update status', err)
      setError(err instanceof Error ? err.message : 'Unable to update order status.')
    } finally {
      setPendingActionKey(null)
    }
  }

  async function confirmCash(record: OrderRecord) {
    if (!storeId) return
    const key = `${record.collectionName}-${record.id}-cash-confirm`
    if (!window.confirm('Confirm that cash was received for this order?')) return
    setPendingActionKey(key)
    try {
      const group = orderGroup(record)
      const nextFulfillment = group === 'manual' ? 'manual_paid' : group === 'booking' ? 'booking_confirmed' : group === 'service' ? 'service_confirmed' : 'confirmed_by_store'
      const patch = {
        paymentStatus: 'paid_cash',
        payment_status: 'paid_cash',
        orderStatus: group === 'manual' ? 'completed' : nextFulfillment,
        order_status: group === 'manual' ? 'completed' : nextFulfillment,
        fulfillmentStatus: nextFulfillment,
        fulfillment_status: nextFulfillment,
        paymentCollectionMode: 'cash',
        payment_collection_mode: 'cash',
        paymentMethod: 'CASH',
        payment_method: 'CASH',
        paymentProvider: 'cash',
        payment_provider: 'cash',
        cashConfirmed: true,
        cashConfirmedAt: serverTimestamp(),
        amountPaid: record.amount,
        amount_paid: record.amount,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(getDocumentRef(storeId, record), patch)
      if (record.collectionName === 'integrationOrders') {
        await updateDoc(doc(db, 'stores', storeId, 'integrationOrders', record.id), patch).catch(() => null)
      }
    } catch (err) {
      console.error('[market-orders-v2] Failed to confirm cash', err)
      setError(err instanceof Error ? err.message : 'Unable to confirm cash received.')
    } finally {
      setPendingActionKey(null)
    }
  }

  const allRecords = useMemo(() => {
    const catalog: CatalogLookup = {
      serviceIds: new Set([...serviceCatalog.serviceIds]),
      serviceNames: new Set([...serviceCatalog.serviceNames]),
      bookingIds: new Set([...bookingCatalog.bookingIds]),
      bookingNames: new Set([...bookingCatalog.bookingNames]),
    }
    const bookingById = new Map<string, OrderRecord>()
    bookings.map(record => withCatalogClassification(record, catalog)).forEach(booking => bookingById.set(booking.bookingId || booking.id, booking))
    const deduped = new Map<string, OrderRecord>()
    const addRecord = (input: OrderRecord) => {
      const record = withCatalogClassification(input, catalog)
      const key = record.collectionName === 'cashOrders'
        ? `cash-${record.id}`
        : canonicalBookingOrderKey({ booking_id: record.bookingId, payment_reference: record.reference }, record.id)
      const existing = deduped.get(key)
      deduped.set(key, existing ? chooseMoreCompleteRecord(existing, record) : record)
    }
    orders.forEach(order => {
      const classifiedOrder = withCatalogClassification(order, catalog)
      const matchingBooking = classifiedOrder.bookingId ? bookingById.get(classifiedOrder.bookingId) : undefined
      addRecord(matchingBooking ? mergeBookingStatusIntoOrder(classifiedOrder, matchingBooking) : classifiedOrder)
    })
    bookings.forEach(addRecord)
    cashOrders.forEach(addRecord)
    return Array.from(deduped.values()).sort((a, b) => ((b.updatedAt ?? b.createdAt)?.getTime() ?? 0) - ((a.updatedAt ?? a.createdAt)?.getTime() ?? 0))
  }, [bookingCatalog, bookings, cashOrders, orders, serviceCatalog])

  const stats = useMemo(() => ({
    all: allRecords,
    pending: allRecords.filter(isPending),
    cash: allRecords.filter(isCash),
    onlinePaid: allRecords.filter(isOnlinePaid),
    services: allRecords.filter(isService),
    bookings: allRecords.filter(isBooking),
    products: allRecords.filter(isProduct),
  }), [allRecords])

  const filteredRecords = useMemo(() => {
    const tabRecords = filterRecords(allRecords, activeTab)
    const search = searchText.trim().toLowerCase()
    if (!search) return tabRecords
    return tabRecords.filter(record => [
      record.reference,
      record.customerName,
      record.customerEmail,
      record.customerPhone,
      record.itemName,
      record.sourceLabel,
      record.paymentStatus,
      record.orderStatus,
      record.bookingId,
      record.recordType,
      record.paymentMethod,
      rowTypeLabel(record),
    ].join(' ').toLowerCase().includes(search))
  }, [activeTab, allRecords, searchText])

  const tabs: Array<{ id: OrderTab; label: string; count: number }> = [
    { id: 'all', label: 'All Orders', count: stats.all.length },
    { id: 'pending', label: 'Pending', count: stats.pending.length },
    { id: 'cash', label: 'Store Cash', count: stats.cash.length },
    { id: 'online-paid', label: 'Online Paid', count: stats.onlinePaid.length },
    { id: 'services', label: 'Services', count: stats.services.length },
    { id: 'bookings', label: 'Bookings', count: stats.bookings.length },
    { id: 'products', label: 'Products', count: stats.products.length },
  ]

  return (
    <div>
      {!compactHeader ? (
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Store order workspace</p>
          <h1 style={{ color: '#111827', margin: 0 }}>Sales & Market Orders</h1>
          <p style={{ color: '#475569', margin: '8px 0 0' }}>Product, service payment, booking, and manual cash records now use separate action buttons.</p>
        </div>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        {tabs.slice(0, 5).map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ textAlign: 'left', background: activeTab === tab.id ? '#EEF2FF' : '#F8FAFC', border: activeTab === tab.id ? '1px solid #4338CA' : '1px solid #E2E8F0', borderRadius: 18, padding: 16, cursor: 'pointer' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>{tab.label}</p>
            <p style={{ margin: '7px 0 3px', color: '#0F172A', fontSize: 27, fontWeight: 900 }}>{tab.count}</p>
          </button>
        ))}
      </section>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 22, padding: 18, display: 'grid', gap: 16, boxShadow: '0 24px 60px -48px rgba(15, 23, 42, 0.7)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111827' }}>Orders workspace</h2>
            <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 14 }}>Services paid through Quick Pay are treated as service payments. Bookings appear only for booking/appointment records.</p>
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
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading order records…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view orders.</p> : null}
        {!isLoading && storeId && filteredRecords.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No records found for this view yet.</p> : null}

        {filteredRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1250 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Date</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Customer</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Item</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Source</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Amount</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Payment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Action</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(record => {
                  const status = primaryStatus(record)
                  const colors = statusStyle(status || record.paymentStatus)
                  const href = contactHref(record)
                  const pendingCash = isCash(record) && !record.cashConfirmed
                  const cashKey = `${record.collectionName}-${record.id}-cash-confirm`
                  const group = orderGroup(record)
                  const orderActions = actionsForRecord(record)

                  return (
                    <tr key={`${record.collectionName}-${record.id}`} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 8px', color: '#475569', fontSize: 13 }}>{formatDate(record.createdAt)}</td>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.customerName}</strong><br /><span style={{ color: '#64748B', fontSize: 13 }}>{record.customerPhone || record.customerEmail || 'No contact'}</span></td>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.itemName}</strong><br /><span style={{ color: group === 'product' ? '#64748B' : group === 'booking' ? '#3730A3' : group === 'service' ? '#166534' : '#92400E', fontSize: 13, fontWeight: 800 }}>{rowTypeLabel(record)}</span><br /><span style={{ color: '#94A3B8', fontSize: 12 }}>{record.recordType}</span></td>
                      <td style={{ padding: '12px 8px' }}><strong style={{ color: '#0F172A' }}>{record.sourceLabel}</strong><br /><span style={{ color: record.storeOnly ? '#92400E' : '#64748B', fontSize: 12, fontWeight: 800 }}>{record.storeOnly ? 'Store-only data' : record.collectionName}</span></td>
                      <td style={{ padding: '12px 8px', color: '#0F172A', fontWeight: 800 }}>{formatMoney(record.amount, record.currency)}</td>
                      <td style={{ padding: '12px 8px' }}><strong>Payment</strong><br /><span style={{ color: '#64748B', fontSize: 13 }}>{displayPaymentStatus(record.paymentStatus)}</span>{isCash(record) ? <><br /><span style={{ color: record.cashConfirmed ? '#16A34A' : '#92400E', fontSize: 12, fontWeight: 900 }}>{record.cashConfirmed ? 'Cash confirmed' : 'Awaiting cash'}</span></> : null}</td>
                      <td style={{ padding: '12px 8px' }}><span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900, ...colors }}>{displayOrderStatus(status || record.paymentStatus)}</span><br /><span style={{ color: '#64748B', fontSize: 12 }}>{record.bookingId || record.reference}</span></td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 165 }}>
                          {pendingCash ? (
                            <button type="button" disabled={pendingActionKey === cashKey} onClick={() => confirmCash(record)} style={{ border: '1px solid #16A34A', background: '#DCFCE7', color: '#166534', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>{pendingActionKey === cashKey ? 'Saving…' : 'Confirm Cash'}</button>
                          ) : null}
                          {orderActions.map(action => {
                            const actionKey = `${record.collectionName}-${record.id}-${action.status}`
                            const disabled = pendingActionKey === actionKey || (pendingCash && group === 'manual')
                            return (
                              <button key={action.status} type="button" disabled={disabled} onClick={() => updateStatus(record, action)} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
                                {pendingActionKey === actionKey ? 'Saving…' : action.label}
                              </button>
                            )
                          })}
                          {pendingCash && group === 'manual' ? <span style={{ color: '#92400E', fontSize: 12, fontWeight: 700 }}>Confirm cash first.</span> : null}
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
