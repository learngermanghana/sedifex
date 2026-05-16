import React, { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type OnlineOrderTab =
  | 'product-orders'
  | 'service-bookings'
  | 'sedifex-market'
  | 'client-website'
  | 'pay-on-delivery'
  | 'manual-payment'
  | 'online-paid'

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
  paymentCollectionMode: string
  sourceChannel: string
  sourceLabel: string
  source: string
  clientOrderId: string
  sedifexOrderId: string
  createdAt: Date | null
  deliveryLocation: string
  bookingDate: string
  bookingTime: string
  preferredBranch: string
  notes: string
  sedifexCommission: number
  merchantNet: number
  feePolicyKey: string
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
  if (['success', 'confirmed', 'paid', 'captured', 'completed', 'delivered', 'cash_collected'].some(token => normalized.includes(token))) return 'success'
  if (['failed', 'cancelled', 'canceled', 'rejected', 'abandoned'].some(token => normalized.includes(token))) return 'danger'
  if (['pending', 'manual', 'delivery', 'processing', 'cash', 'checkout'].some(token => normalized.includes(token))) return 'warning'
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
  return asNumber(
    payment.customerTotal ?? payment.amount ?? pricingSnapshot.subtotal ?? pricingSnapshot.final_total ?? pricingSnapshotSnake.subtotal ?? pricingSnapshotSnake.final_total,
    0,
  )
}

function readCurrency(source: Record<string, unknown>) {
  const payment = getNestedObject(source, 'payment')
  const pricingSnapshot = getNestedObject(source, 'pricingSnapshot')
  const pricingSnapshotSnake = getNestedObject(source, 'pricing_snapshot')
  return asText(payment.currency ?? pricingSnapshot.currency ?? pricingSnapshotSnake.currency, 'GHS')
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
  if (normalized.includes('market')) return 'sedifex_market'
  return normalized
}

function sourceLabel(channel: string) {
  if (channel === 'client_website') return 'Client Website'
  if (channel === 'sedifex_custom_page') return 'Sedifex Public Page'
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
  const amount = readAmount(data)
  const currency = readCurrency(data)
  const recordType = asText(data.recordType ?? data.orderType, collectionName === 'integrationBookings' ? 'service_booking' : 'product_order')
  const channel = readSourceChannel(data)

  return {
    id,
    collectionName,
    recordType,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, 'No reference'),
    customerName: asText(customer.name, 'Customer'),
    customerEmail: asText(customer.email, ''),
    customerPhone: asText(customer.phone, ''),
    itemName: asText(data.productName ?? data.serviceName ?? item.name ?? item.productName, recordType === 'service_booking' ? 'Service booking' : 'Product order'),
    quantity: asNumber(item.quantity ?? item.qty, recordType === 'service_booking' ? 1 : 0),
    amount,
    currency,
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status, 'pending'),
    bookingStatus: asText(data.bookingStatus, ''),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? payment.mode, 'online_checkout'),
    sourceChannel: channel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceLabel(channel)),
    source: asText(data.source, channel),
    clientOrderId: asText(data.clientOrderId ?? data.client_order_id ?? metadata.clientOrderId, ''),
    sedifexOrderId: asText(data.sedifexOrderId ?? data.sedifex_order_id ?? metadata.sedifexOrderId, ''),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
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

function isManualPayment(record: OnlineOrderRecord) {
  return ['manual', 'manual_transfer', 'momo_manual', 'cash', 'bank_transfer'].includes(record.paymentCollectionMode)
}

function isOnlinePaid(record: OnlineOrderRecord) {
  const paymentStatus = record.paymentStatus.toLowerCase()
  return (
    !isPayOnDelivery(record) &&
    !isManualPayment(record) &&
    ['success', 'confirmed', 'paid', 'captured'].some(token => paymentStatus.includes(token))
  )
}

function filterRecords(records: OnlineOrderRecord[], tab: OnlineOrderTab) {
  if (tab === 'service-bookings') return records.filter(isServiceBooking)
  if (tab === 'sedifex-market') return records.filter(record => record.sourceChannel === 'sedifex_market')
  if (tab === 'client-website') return records.filter(record => record.sourceChannel === 'client_website')
  if (tab === 'pay-on-delivery') return records.filter(isPayOnDelivery)
  if (tab === 'manual-payment') return records.filter(isManualPayment)
  if (tab === 'online-paid') return records.filter(isOnlinePaid)
  return records.filter(record => !isServiceBooking(record))
}

function getPrimaryStatus(record: OnlineOrderRecord) {
  return isServiceBooking(record) ? record.bookingStatus || record.orderStatus : record.orderStatus
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

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '6px 0 2px', color: '#0F172A', fontSize: 24, fontWeight: 800 }}>{value}</p>
      <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>{hint}</p>
    </article>
  )
}

export default function MarketplaceOrders() {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OnlineOrderRecord[]>([])
  const [bookings, setBookings] = useState<OnlineOrderRecord[]>([])
  const [activeTab, setActiveTab] = useState<OnlineOrderTab>('product-orders')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    const manualPayment = allRecords.filter(isManualPayment)
    const onlinePaid = allRecords.filter(isOnlinePaid)
    return {
      productOrders,
      serviceBookings,
      sedifexMarket,
      clientWebsite,
      payOnDelivery,
      manualPayment,
      onlinePaid,
      totalPaidValue: onlinePaid.reduce((sum, record) => sum + record.amount, 0),
      deliveryValue: payOnDelivery.reduce((sum, record) => sum + record.amount, 0),
    }
  }, [allRecords])

  const tabs: Array<{ id: OnlineOrderTab; label: string; count: number }> = [
    { id: 'product-orders', label: 'All Product Orders', count: stats.productOrders.length },
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
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    )
  }, [activeTab, allRecords, searchText])

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Sedifex source of truth</p>
        <h2 style={{ color: '#4338CA', margin: 0 }}>Online Orders</h2>
        <p style={{ color: '#475569', margin: '8px 0 0' }}>
          View product orders and service bookings from Sedifex Market, client websites, public pages, online checkout, manual payment, and pay-on-delivery channels.
        </p>
      </div>

      <section style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 14, marginBottom: 20, color: '#92400E' }}>
        <strong>Launch follow-up:</strong> Sedifex controls external checkout confirmation and follow-up for now. Stores can view customer details and prepare, while Sedifex support manages confirmation during launch.
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Product orders" value={String(stats.productOrders.length)} hint="Saved in integrationOrders" />
        <StatCard label="Service bookings" value={String(stats.serviceBookings.length)} hint="Saved in integrationBookings" />
        <StatCard label="Sedifex Market" value={String(stats.sedifexMarket.length)} hint="Marketplace-originated requests" />
        <StatCard label="Client website" value={String(stats.clientWebsite.length)} hint="Website integration requests" />
        <StatCard label="Pay on delivery" value={String(stats.payOnDelivery.length)} hint={`${formatMoney(stats.deliveryValue, 'GHS')} free launch value`} />
        <StatCard label="Online paid" value={String(stats.onlinePaid.length)} hint={`${formatMoney(stats.totalPaidValue, 'GHS')} confirmed value`} />
      </section>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 20, padding: 18, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
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
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, minWidth: 220 }}>
            Search
            <input
              type="search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Reference, customer, channel, status…"
              style={{ border: '1px solid #CBD5E1', borderRadius: 10, padding: '9px 10px' }}
            />
          </label>
        </div>

        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>{error}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading online order records…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view online orders.</p> : null}
        {!isLoading && storeId && filteredRecords.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No records found for this view yet.</p> : null}

        {filteredRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Customer</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Item</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Channel</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Amount</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Payment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
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
