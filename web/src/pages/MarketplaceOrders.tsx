import React, { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type MarketplaceTab = 'all-orders' | 'bookings' | 'pay-on-delivery' | 'online-paid'

type MarketplaceRecord = {
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
  source: string
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
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = status.toLowerCase()
  if (['success', 'confirmed', 'paid', 'captured', 'completed', 'delivered', 'cash_collected'].some(token => normalized.includes(token))) return 'success'
  if (['failed', 'cancelled', 'canceled', 'rejected', 'abandoned'].some(token => normalized.includes(token))) return 'danger'
  if (['pending', 'manual', 'delivery', 'processing', 'cash'].some(token => normalized.includes(token))) return 'warning'
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

function mapMarketplaceRecord(
  id: string,
  collectionName: 'integrationOrders' | 'integrationBookings',
  data: Record<string, unknown>,
): MarketplaceRecord {
  const customer = getNestedObject(data, 'customer')
  const booking = getNestedObject(data, 'booking')
  const delivery = getNestedObject(data, 'delivery')
  const item = firstItem(data)
  const feePolicy = readFeePolicy(data)
  const payment = getNestedObject(data, 'payment')
  const amount = readAmount(data)
  const currency = readCurrency(data)
  const recordType = asText(data.recordType, collectionName === 'integrationBookings' ? 'service_booking' : 'product_order')

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
    source: asText(data.source, 'sedifex_market'),
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

function isOnlinePaid(record: MarketplaceRecord) {
  const paymentStatus = record.paymentStatus.toLowerCase()
  return (
    record.paymentCollectionMode !== 'pay_on_delivery' &&
    record.paymentCollectionMode !== 'manual' &&
    ['success', 'confirmed', 'paid', 'captured'].some(token => paymentStatus.includes(token))
  )
}

function filterRecords(records: MarketplaceRecord[], tab: MarketplaceTab) {
  if (tab === 'bookings') return records.filter(record => record.recordType === 'service_booking' || record.collectionName === 'integrationBookings')
  if (tab === 'pay-on-delivery') return records.filter(record => record.paymentCollectionMode === 'pay_on_delivery')
  if (tab === 'online-paid') return records.filter(isOnlinePaid)
  return records.filter(record => record.recordType !== 'service_booking')
}

function getPrimaryStatus(record: MarketplaceRecord) {
  return record.recordType === 'service_booking' ? record.bookingStatus || record.orderStatus : record.orderStatus
}

function buildCustomerContactHref(record: MarketplaceRecord) {
  const digits = record.customerPhone.replace(/[^\d]/g, '')
  if (digits) {
    const message = encodeURIComponent(`Hello ${record.customerName}, we are contacting you about your Sedifex Market request. Reference: ${record.reference}`)
    return `https://wa.me/${digits}?text=${message}`
  }
  if (record.customerEmail) {
    const subject = encodeURIComponent(`Sedifex Market request ${record.reference}`)
    const body = encodeURIComponent(`Hello ${record.customerName},\n\nWe are contacting you about your Sedifex Market request.\nReference: ${record.reference}`)
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
  const [orders, setOrders] = useState<MarketplaceRecord[]>([])
  const [bookings, setBookings] = useState<MarketplaceRecord[]>([])
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('all-orders')
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
        setOrders(snapshot.docs.map(docSnap => mapMarketplaceRecord(docSnap.id, 'integrationOrders', docSnap.data() as Record<string, unknown>)))
        setIsLoading(false)
      },
      err => {
        console.error('[marketplace-orders] Failed to load marketplace orders', err)
        setError('Unable to load marketplace orders right now.')
        setIsLoading(false)
      },
    )

    const unsubscribeBookings = onSnapshot(
      bookingQuery,
      snapshot => {
        setBookings(snapshot.docs.map(docSnap => mapMarketplaceRecord(docSnap.id, 'integrationBookings', docSnap.data() as Record<string, unknown>)))
        setIsLoading(false)
      },
      err => {
        console.error('[marketplace-orders] Failed to load marketplace bookings', err)
        setError('Unable to load marketplace bookings right now.')
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

  const filteredRecords = useMemo(() => {
    const tabRecords = filterRecords(allRecords, activeTab)
    const search = searchText.trim().toLowerCase()
    if (!search) return tabRecords
    return tabRecords.filter(record =>
      [record.reference, record.customerName, record.customerEmail, record.customerPhone, record.itemName, record.paymentStatus, record.orderStatus, record.bookingStatus]
        .join(' ')
        .toLowerCase()
        .includes(search),
    )
  }, [activeTab, allRecords, searchText])

  const stats = useMemo(() => {
    const productOrders = allRecords.filter(record => record.recordType !== 'service_booking')
    const serviceBookings = allRecords.filter(record => record.recordType === 'service_booking' || record.collectionName === 'integrationBookings')
    const payOnDelivery = allRecords.filter(record => record.paymentCollectionMode === 'pay_on_delivery')
    const onlinePaid = allRecords.filter(isOnlinePaid)
    return {
      productOrders,
      serviceBookings,
      payOnDelivery,
      onlinePaid,
      totalPaidValue: onlinePaid.reduce((sum, record) => sum + record.amount, 0),
      deliveryValue: payOnDelivery.reduce((sum, record) => sum + record.amount, 0),
    }
  }, [allRecords])

  const tabs: Array<{ id: MarketplaceTab; label: string; count: number }> = [
    { id: 'all-orders', label: 'Marketplace Orders', count: stats.productOrders.length },
    { id: 'bookings', label: 'Marketplace Bookings', count: stats.serviceBookings.length },
    { id: 'pay-on-delivery', label: 'Pay on Delivery Orders', count: stats.payOnDelivery.length },
    { id: 'online-paid', label: 'Online Paid Orders', count: stats.onlinePaid.length },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Sedifex Market</p>
        <h2 style={{ color: '#4338CA', margin: 0 }}>Marketplace orders</h2>
        <p style={{ color: '#475569', margin: '8px 0 0' }}>
          View Sedifex Market product orders, service bookings, online paid orders, and free launch pay-on-delivery requests for this workspace.
        </p>
      </div>

      <section style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 14, marginBottom: 20, color: '#92400E' }}>
        <strong>Launch follow-up:</strong> Sedifex controls marketplace confirmation and follow-up for now. Stores can view customer details and prepare, but order confirmation is handled by Sedifex support during launch.
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Product orders" value={String(stats.productOrders.length)} hint="Orders saved in integrationOrders" />
        <StatCard label="Service bookings" value={String(stats.serviceBookings.length)} hint="Bookings saved in integrationBookings" />
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
              placeholder="Reference, customer, status…"
              style={{ border: '1px solid #CBD5E1', borderRadius: 10, padding: '9px 10px' }}
            />
          </label>
        </div>

        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>{error}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading marketplace records…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view marketplace records.</p> : null}
        {!isLoading && storeId && filteredRecords.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No records found for this view yet.</p> : null}

        {filteredRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Customer</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Item</th>
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
                        <span style={{ color: '#64748B', fontSize: 13 }}>{record.recordType === 'service_booking' ? 'Service booking' : `Qty: ${record.quantity || 1}`}</span>
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
