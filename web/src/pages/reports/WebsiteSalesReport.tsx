import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, normalizeSourceChannel, toDate } from './reportUtils'

type OrderRow = {
  id: string
  reference: string
  sourceChannel: string
  sourceLabel: string
  customerName: string
  customerPhone: string
  amount: number
  currency: string
  paymentStatus: string
  orderStatus: string
  paymentCollectionMode: string
  itemName: string
  itemType: 'product' | 'service' | 'course' | 'manual'
  createdAt: Date | null
}


function firstItem(source: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(source.items) ? source.items : Array.isArray(source.cart) ? source.cart : []
  const first = items[0]
  return first && typeof first === 'object' ? first as Record<string, unknown> : {}
}

function normalizeItemType(value: unknown): 'product' | 'service' | 'course' | '' {
  const normalized = asText(value).toLowerCase().replace(/[\s_-]+/g, '_')
  if (normalized === 'service' || normalized === 'service_booking' || normalized === 'booking') return 'service'
  if (normalized === 'course' || normalized === 'class' || normalized === 'training') return 'course'
  if (normalized === 'product' || normalized === 'product_order' || normalized === 'physical_product') return 'product'
  return ''
}

function readItemType(data: Record<string, unknown>): 'product' | 'service' | 'course' | 'manual' {
  const item = firstItem(data)
  const metadata = getNestedObject(data, 'metadata')
  const nestedData = getNestedObject(data, 'data')
  const pricingSnapshot = getNestedObject(data, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(data, 'pricing_snapshot')
  const snapshotItems = Array.isArray(pricingSnapshot.items) ? pricingSnapshot.items : Array.isArray(pricingSnapshotSnake.items) ? pricingSnapshotSnake.items : []
  const snapshotFirst = snapshotItems[0] && typeof snapshotItems[0] === 'object' ? snapshotItems[0] as Record<string, unknown> : {}
  const explicitType = normalizeItemType(
    data.itemType ?? data.item_type ?? data.listingType ?? data.listing_type ?? data.type ?? data.recordType ?? data.orderType
    ?? item.itemType ?? item.item_type ?? item.listingType ?? item.listing_type ?? item.type
    ?? snapshotFirst.itemType ?? snapshotFirst.item_type ?? snapshotFirst.listingType ?? snapshotFirst.listing_type ?? snapshotFirst.type
    ?? metadata.itemType ?? metadata.item_type ?? metadata.listingType ?? metadata.listing_type ?? metadata.type
    ?? nestedData.itemType ?? nestedData.item_type ?? nestedData.listingType ?? nestedData.listing_type ?? nestedData.type,
  )
  if (explicitType) return explicitType
  if (data.paymentCollectionMode === 'cash' || data.payment_collection_mode === 'cash') return 'manual'
  if (
    data.serviceName || data.serviceId || data.service_id
    || item.serviceName || item.serviceId || item.service_id
    || snapshotFirst.serviceName || snapshotFirst.serviceId || snapshotFirst.service_id
    || metadata.serviceName || metadata.serviceId || metadata.service_id
    || nestedData.serviceName || nestedData.serviceId || nestedData.service_id
  ) return 'service'
  return 'product'
}

function itemTypeLabel(type: OrderRow['itemType']) {
  if (type === 'service') return 'Service'
  if (type === 'course') return 'Course'
  if (type === 'manual') return 'Manual'
  return 'Product'
}

function readAmount(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const amountMinor = asNumber(data.amountMinor, 0)
  if (amountMinor > 0) return amountMinor / 100
  return asNumber(payment.amount ?? payment.customerTotal ?? data.amount ?? data.total ?? data.grandTotal ?? pricing.final_total ?? pricingSnake.final_total ?? pricing.subtotal ?? pricingSnake.subtotal, 0)
}

function sourceLabel(sourceChannel: string) {
  if (sourceChannel === 'client_website') return 'Client Website'
  if (sourceChannel === 'sedifex_market') return 'Sedifex Market'
  if (sourceChannel === 'sedifex_custom_page') return 'Sedifex Public Page'
  return sourceChannel.replace(/_/g, ' ')
}

function mapOrder(id: string, data: Record<string, unknown>): OrderRow {
  const customer = getNestedObject(data, 'customer')
  const payment = getNestedObject(data, 'payment')
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? data.source)
  const item = firstItem(data)
  const itemType = readItemType(data)
  return {
    id,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference ?? payment.reference, id),
    sourceChannel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceLabel(sourceChannel)),
    customerName: asText(customer.name ?? data.customerName ?? data.name, 'Customer'),
    customerPhone: asText(customer.phone ?? customer.email ?? data.customerPhone ?? data.phone ?? data.email, ''),
    amount: readAmount(data),
    currency: asText(payment.currency ?? data.currency, 'GHS'),
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status ?? data.status, 'pending'),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? data.payment_collection_mode ?? payment.mode, 'online_checkout'),
    itemName: asText(data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName ?? item.productName ?? item.serviceName, itemType === 'service' || itemType === 'course' ? 'Service booking' : 'Product order'),
    itemType,
    createdAt: toDate(data.createdAtServer ?? data.createdAt ?? data.updatedAt),
  }
}

function startForRange(range: string) {
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  if (range === 'yesterday') {
    start.setDate(now.getDate() - 1)
    start.setHours(0, 0, 0, 0)
  }
  if (range === '7d') start.setDate(now.getDate() - 7)
  if (range === '30d') start.setDate(now.getDate() - 30)
  if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }
  if (range === 'last_month') {
    start.setMonth(now.getMonth() - 1, 1)
    start.setHours(0, 0, 0, 0)
  }
  return start
}

function endForRange(range: string) {
  const now = new Date()
  if (range === 'yesterday') {
    const end = new Date(now)
    end.setHours(0, 0, 0, 0)
    return end
  }
  if (range === 'last_month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return now
}

function inDateRange(date: Date | null, range: string) {
  if (range === 'all') return true
  if (!date) return false
  return date >= startForRange(range) && date <= endForRange(range)
}

function isPaidLike(value: string) {
  const normalized = value.toLowerCase()
  return ['paid', 'success', 'confirmed', 'captured', 'completed'].some(token => normalized.includes(token))
}

export default function WebsiteSalesReport() {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [channel, setChannel] = useState('all')
  const [paymentMode, setPaymentMode] = useState('all')
  const [range, setRange] = useState('30d')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [itemType, setItemType] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => {
      setOrders(snapshot.docs.map(docSnap => mapOrder(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const filtered = useMemo(() => orders.filter(order => {
    const channelOk = channel === 'all' || order.sourceChannel === channel
    const modeOk = paymentMode === 'all' || order.paymentCollectionMode === paymentMode
    const dateOk = inDateRange(order.createdAt, range)
    const statusOk = paymentStatus === 'all' || (paymentStatus === 'paid' ? isPaidLike(order.paymentStatus) : order.paymentStatus.toLowerCase().includes(paymentStatus))
    const typeOk = itemType === 'all' || order.itemType === itemType
    return channelOk && modeOk && dateOk && statusOk && typeOk
  }), [channel, itemType, orders, paymentMode, paymentStatus, range])

  const totals = useMemo(() => ({
    count: filtered.length,
    revenue: filtered.reduce((sum, order) => sum + order.amount, 0),
    website: filtered.filter(order => order.sourceChannel === 'client_website').length,
    market: filtered.filter(order => order.sourceChannel === 'sedifex_market').length,
    publicPage: filtered.filter(order => order.sourceChannel === 'sedifex_custom_page').length,
    paid: filtered.filter(order => isPaidLike(order.paymentStatus)).length,
    pending: filtered.filter(order => order.paymentStatus.toLowerCase().includes('pending')).length,
    cancelled: filtered.filter(order => order.orderStatus.toLowerCase().includes('cancel')).length,
    payOnDelivery: filtered.filter(order => order.paymentCollectionMode === 'pay_on_delivery').length,
    products: filtered.filter(order => order.itemType === 'product').length,
    services: filtered.filter(order => order.itemType === 'service' || order.itemType === 'course').length,
    websiteValue: filtered.filter(order => order.sourceChannel === 'client_website').reduce((sum, order) => sum + order.amount, 0),
    marketValue: filtered.filter(order => order.sourceChannel === 'sedifex_market').reduce((sum, order) => sum + order.amount, 0),
    publicValue: filtered.filter(order => order.sourceChannel === 'sedifex_custom_page').reduce((sum, order) => sum + order.amount, 0),
    currency: filtered[0]?.currency ?? 'GHS',
  }), [filtered])

  const columns: ReportColumn<OrderRow>[] = [
    { key: 'reference', label: 'Reference', sortable: true, value: row => row.reference },
    { key: 'source', label: 'Source', sortable: true, value: row => row.sourceLabel },
    { key: 'customer', label: 'Customer', sortable: true, value: row => row.customerName, render: row => <><strong>{row.customerName}</strong><br /><small>{row.customerPhone || 'No contact'}</small></> },
    { key: 'item', label: 'Item', sortable: true, value: row => row.itemName, render: row => <><strong>{row.itemName}</strong><br /><small>{itemTypeLabel(row.itemType)}</small></> },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', value: row => row.amount, render: row => formatMoney(row.amount, row.currency) },
    { key: 'payment', label: 'Payment', sortable: true, value: row => row.paymentStatus, render: row => <>{row.paymentStatus}<br /><small>{row.paymentCollectionMode}</small></> },
    { key: 'order', label: 'Order', sortable: true, value: row => row.orderStatus },
    { key: 'date', label: 'Date', sortable: true, value: row => row.createdAt ?? undefined, render: row => formatDate(row.createdAt) },
  ]

  function exportRows() {
    downloadCsv('sedifex-website-sales-report.csv', filtered.map(order => ({
      reference: order.reference,
      source: order.sourceLabel,
      customer: order.customerName,
      contact: order.customerPhone,
      amount: order.amount,
      currency: order.currency,
      itemName: order.itemName,
      itemType: itemTypeLabel(order.itemType),
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      paymentCollectionMode: order.paymentCollectionMode,
      createdAt: formatDate(order.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Website sales report',
      subtitle: 'Online and website sales from Sedifex Market, client websites, and public pages.',
      summary: [
        { label: 'Orders', value: totals.count },
        { label: 'Order value', value: formatMoney(totals.revenue, totals.currency) },
        { label: 'Paid orders', value: totals.paid },
        { label: 'Services/courses', value: totals.services },
        { label: 'Pay on delivery', value: totals.payOnDelivery },
      ],
      rows: filtered.map(order => ({
        reference: order.reference,
        source: order.sourceLabel,
        customer: order.customerName,
        contact: order.customerPhone,
        amount: order.amount,
        currency: order.currency,
        itemName: order.itemName,
        itemType: itemTypeLabel(order.itemType),
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        paymentCollectionMode: order.paymentCollectionMode,
        createdAt: formatDate(order.createdAt),
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Website sales</p>
        <h1>Online and website sales report</h1>
        <p className="workspace-muted">Detailed sales from Sedifex Market, client websites, public pages, online payment, manual payment, and pay on delivery.</p>
      </section>
      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.count}</strong><span>Orders</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.revenue, totals.currency)}</strong><span>Order value</span></article>
        <article className="workspace-card"><strong>{totals.paid}</strong><span>Paid orders</span></article>
        <article className="workspace-card"><strong>{totals.pending}</strong><span>Pending payment</span></article>
        <article className="workspace-card"><strong>{totals.services}</strong><span>Services / courses</span></article>
      </section>
      <section className="workspace-grid workspace-grid--three">
        <article className="workspace-card"><strong>{formatMoney(totals.marketValue, totals.currency)}</strong><span>Sedifex Market · {totals.market} orders</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.websiteValue, totals.currency)}</strong><span>Client website · {totals.website} orders</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.publicValue, totals.currency)}</strong><span>Public page · {totals.publicPage} orders</span></article>
      </section>
      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Order details</h2><p className="workspace-muted">Filter by date, source, payment mode, and status, then export CSV/PDF.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="last_month">Last month</option>
            <option value="all">All time</option>
          </select>
          <select value={channel} onChange={event => setChannel(event.target.value)}>
            <option value="all">All sources</option>
            <option value="client_website">Client website</option>
            <option value="sedifex_market">Sedifex Market</option>
            <option value="sedifex_custom_page">Sedifex public page</option>
          </select>
          <select value={itemType} onChange={event => setItemType(event.target.value)}>
            <option value="all">All item types</option>
            <option value="product">Products only</option>
            <option value="service">Services only</option>
            <option value="course">Courses only</option>
          </select>
          <select value={paymentMode} onChange={event => setPaymentMode(event.target.value)}>
            <option value="all">All payment modes</option>
            <option value="online_checkout">Online checkout</option>
            <option value="pay_on_delivery">Pay on delivery</option>
            <option value="manual">Manual</option>
          </select>
          <select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}>
            <option value="all">All payment statuses</option>
            <option value="paid">Paid/successful</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <ReportDataTable rows={filtered} columns={columns} getRowKey={row => row.id} searchPlaceholder="Search reference, source, customer…" />
      </section>
    </div>
  )
}
