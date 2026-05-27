import { useEffect, useMemo, useState } from 'react'
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { downloadCsv, exportReportPdf, formatDate, formatMoney, toDate } from './reportUtils'
import {
  type BusinessActivityRow,
  isSettlementRecord,
  normalizeCashOrder,
  normalizeIntegrationBooking,
  normalizeIntegrationOrder,
  normalizePosSale,
} from '../../lib/businessActivity'

type StoreInfo = {
  id: string
  name: string
  phone?: string
  email?: string
}

type StoreSummary = {
  storeId: string
  storeName: string
  activityCount: number
  activityValue: number
  settlementValue: number
  storeOnlyValue: number
  posValue: number
  customersCaptured: number
  productsCount: number
  lastActivityAt: Date | null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getStoreName(storeId: string, stores: Record<string, StoreInfo>) {
  return stores[storeId]?.name || storeId || 'Unknown store'
}

function readStoreInfo(id: string, data: Record<string, unknown>): StoreInfo {
  const business = asRecord(data.business)
  const profile = asRecord(data.profile)
  return {
    id,
    name: asText(data.name ?? data.storeName ?? data.businessName ?? business.name ?? profile.name, id),
    phone: asText(data.phone ?? data.storePhone ?? business.phone ?? profile.phone),
    email: asText(data.email ?? data.storeEmail ?? business.email ?? profile.email),
  }
}

function rangeStart(range: string) {
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  if (range === '7d') start.setDate(now.getDate() - 7)
  if (range === '30d') start.setDate(now.getDate() - 30)
  if (range === '90d') start.setDate(now.getDate() - 90)
  if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }
  return start
}

function inRange(date: Date | null, range: string) {
  if (range === 'all') return true
  if (!date) return false
  return date >= rangeStart(range)
}

function isActivePaid(row: BusinessActivityRow) {
  return row.canonicalPaymentStatus === 'paid_online' || row.canonicalPaymentStatus === 'paid_cash' || row.canonicalOrderStatus === 'completed' || row.canonicalOrderStatus === 'delivered' || row.canonicalOrderStatus === 'service_completed' || row.canonicalOrderStatus === 'manual_completed'
}

export default function AdminPlatformActivity() {
  const [stores, setStores] = useState<Record<string, StoreInfo>>({})
  const [sales, setSales] = useState<BusinessActivityRow[]>([])
  const [online, setOnline] = useState<BusinessActivityRow[]>([])
  const [bookings, setBookings] = useState<BusinessActivityRow[]>([])
  const [cashOrders, setCashOrders] = useState<BusinessActivityRow[]>([])
  const [customerStoreCounts, setCustomerStoreCounts] = useState<Record<string, number>>({})
  const [productStoreCounts, setProductStoreCounts] = useState<Record<string, number>>({})
  const [range, setRange] = useState('30d')
  const [scope, setScope] = useState('all')

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'publicStores'), snapshot => {
        const next: Record<string, StoreInfo> = {}
        snapshot.docs.forEach(docSnap => {
          next[docSnap.id] = readStoreInfo(docSnap.id, docSnap.data() as Record<string, unknown>)
        })
        setStores(previous => ({ ...previous, ...next }))
      }, error => console.warn('[admin-platform-activity] publicStores failed', error)),
      onSnapshot(collection(db, 'storeSettings'), snapshot => {
        const next: Record<string, StoreInfo> = {}
        snapshot.docs.forEach(docSnap => {
          next[docSnap.id] = readStoreInfo(docSnap.id, docSnap.data() as Record<string, unknown>)
        })
        setStores(previous => ({ ...previous, ...next }))
      }, error => console.warn('[admin-platform-activity] storeSettings failed', error)),
      onSnapshot(collection(db, 'sales'), snapshot => {
        setSales(snapshot.docs.map(docSnap => normalizePosSale(docSnap.id, docSnap.data() as Record<string, unknown>)))
      }, error => console.warn('[admin-platform-activity] sales failed', error)),
      onSnapshot(collection(db, 'integrationOrders'), snapshot => {
        setOnline(snapshot.docs.map(docSnap => normalizeIntegrationOrder(docSnap.id, docSnap.data() as Record<string, unknown>)))
      }, error => console.warn('[admin-platform-activity] integrationOrders failed', error)),
      onSnapshot(collection(db, 'integrationBookings'), snapshot => {
        setBookings(snapshot.docs.map(docSnap => normalizeIntegrationBooking(docSnap.id, docSnap.data() as Record<string, unknown>)))
      }, error => console.warn('[admin-platform-activity] integrationBookings failed', error)),
      onSnapshot(collectionGroup(db, 'cashOrders'), snapshot => {
        setCashOrders(snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, unknown>
          const storeId = asText(data.storeId ?? data.merchantId, docSnap.ref.parent.parent?.id || '')
          return normalizeCashOrder(docSnap.id, { ...data, storeId })
        }))
      }, error => console.warn('[admin-platform-activity] cashOrders failed', error)),
      onSnapshot(collection(db, 'customers'), snapshot => {
        const counts: Record<string, number> = {}
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data() as Record<string, unknown>
          const storeId = asText(data.storeId)
          if (storeId) counts[storeId] = (counts[storeId] || 0) + 1
        })
        setCustomerStoreCounts(counts)
      }, error => console.warn('[admin-platform-activity] customers failed', error)),
      onSnapshot(collection(db, 'products'), snapshot => {
        const counts: Record<string, number> = {}
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data() as Record<string, unknown>
          const storeId = asText(data.storeId)
          if (storeId) counts[storeId] = (counts[storeId] || 0) + 1
        })
        setProductStoreCounts(counts)
      }, error => console.warn('[admin-platform-activity] products failed', error)),
    ]

    return () => unsubs.forEach(unsub => unsub())
  }, [])

  const allRows = useMemo(() => [...sales, ...online, ...bookings, ...cashOrders]
    .filter(row => inRange(row.createdAt, range))
    .filter(row => {
      if (scope === 'all') return true
      if (scope === 'settlement') return row.settlementScope === 'sedifex_settlement'
      if (scope === 'store_only') return row.settlementScope === 'store_only'
      if (scope === 'pos') return row.settlementScope === 'pos'
      if (scope === 'paid') return isActivePaid(row)
      return row.type === scope
    })
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)), [bookings, cashOrders, online, range, sales, scope])

  const storeSummaries = useMemo(() => {
    const grouped: Record<string, StoreSummary> = {}
    const allStoreIds = new Set<string>([
      ...Object.keys(stores),
      ...Object.keys(customerStoreCounts),
      ...Object.keys(productStoreCounts),
      ...allRows.map(row => row.storeId).filter(Boolean),
    ])

    allStoreIds.forEach(storeId => {
      grouped[storeId] = {
        storeId,
        storeName: getStoreName(storeId, stores),
        activityCount: 0,
        activityValue: 0,
        settlementValue: 0,
        storeOnlyValue: 0,
        posValue: 0,
        customersCaptured: customerStoreCounts[storeId] || 0,
        productsCount: productStoreCounts[storeId] || 0,
        lastActivityAt: null,
      }
    })

    allRows.forEach(row => {
      if (!row.storeId) return
      const summary = grouped[row.storeId] || {
        storeId: row.storeId,
        storeName: getStoreName(row.storeId, stores),
        activityCount: 0,
        activityValue: 0,
        settlementValue: 0,
        storeOnlyValue: 0,
        posValue: 0,
        customersCaptured: customerStoreCounts[row.storeId] || 0,
        productsCount: productStoreCounts[row.storeId] || 0,
        lastActivityAt: null,
      }
      summary.activityCount += 1
      summary.activityValue += row.amount
      if (row.settlementScope === 'sedifex_settlement') summary.settlementValue += row.amount
      if (row.settlementScope === 'store_only') summary.storeOnlyValue += row.amount
      if (row.settlementScope === 'pos') summary.posValue += row.amount
      if (!summary.lastActivityAt || (row.createdAt && row.createdAt > summary.lastActivityAt)) summary.lastActivityAt = row.createdAt
      grouped[row.storeId] = summary
    })

    return Object.values(grouped).sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0))
  }, [allRows, customerStoreCounts, productStoreCounts, stores])

  const totals = useMemo(() => {
    return {
      stores: storeSummaries.length,
      activeStores: storeSummaries.filter(store => store.activityCount > 0).length,
      activityCount: allRows.length,
      activityValue: allRows.reduce((sum, row) => sum + row.amount, 0),
      settlementValue: allRows.filter(isSettlementRecord).reduce((sum, row) => sum + row.amount, 0),
      storeOnlyValue: allRows.filter(row => row.settlementScope === 'store_only').reduce((sum, row) => sum + row.amount, 0),
      posValue: allRows.filter(row => row.settlementScope === 'pos').reduce((sum, row) => sum + row.amount, 0),
      customers: Object.values(customerStoreCounts).reduce((sum, count) => sum + count, 0),
      products: Object.values(productStoreCounts).reduce((sum, count) => sum + count, 0),
    }
  }, [allRows, customerStoreCounts, productStoreCounts, storeSummaries])

  const storeColumns: ReportColumn<StoreSummary>[] = [
    { key: 'store', label: 'Store', sortable: true, value: row => row.storeName, render: row => <><strong>{row.storeName}</strong><br /><small>{row.storeId}</small></> },
    { key: 'activity', label: 'Activities', sortable: true, align: 'right', value: row => row.activityCount },
    { key: 'value', label: 'Activity value', sortable: true, align: 'right', value: row => row.activityValue, render: row => formatMoney(row.activityValue) },
    { key: 'settlement', label: 'Settlement value', sortable: true, align: 'right', value: row => row.settlementValue, render: row => formatMoney(row.settlementValue) },
    { key: 'cash', label: 'Store-only cash', sortable: true, align: 'right', value: row => row.storeOnlyValue, render: row => formatMoney(row.storeOnlyValue) },
    { key: 'customers', label: 'Customers', sortable: true, align: 'right', value: row => row.customersCaptured },
    { key: 'products', label: 'Products', sortable: true, align: 'right', value: row => row.productsCount },
    { key: 'last', label: 'Last activity', sortable: true, value: row => row.lastActivityAt ?? undefined, render: row => formatDate(row.lastActivityAt) },
  ]

  const activityColumns: ReportColumn<BusinessActivityRow>[] = [
    { key: 'date', label: 'Date', sortable: true, value: row => row.createdAt ?? undefined, render: row => formatDate(row.createdAt) },
    { key: 'store', label: 'Store', sortable: true, value: row => getStoreName(row.storeId, stores), render: row => <><strong>{getStoreName(row.storeId, stores)}</strong><br /><small>{row.storeId}</small></> },
    { key: 'type', label: 'Type', sortable: true, value: row => row.label, render: row => <><strong>{row.label}</strong><br /><small>{row.settlementScope === 'sedifex_settlement' ? 'Sedifex settlement' : row.settlementScope === 'store_only' ? 'Store-only activity' : 'POS activity'}</small></> },
    { key: 'reference', label: 'Reference', sortable: true, value: row => row.reference },
    { key: 'customer', label: 'Customer', sortable: true, value: row => `${row.customerName} ${row.customerContact}`, render: row => <><strong>{row.customerName}</strong><br /><small>{row.customerContact || 'No contact'}</small></> },
    { key: 'item', label: 'Item / Activity', sortable: true, value: row => row.itemName },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', value: row => row.amount, render: row => formatMoney(row.amount, row.currency) },
    { key: 'status', label: 'Status', sortable: true, value: row => `${row.canonicalPaymentStatus} ${row.canonicalOrderStatus}`, render: row => <>{row.canonicalPaymentStatus}<br /><small>{row.canonicalOrderStatus}</small></> },
  ]

  function exportStores() {
    downloadCsv('sedifex-admin-platform-store-activity.csv', storeSummaries.map(row => ({
      storeId: row.storeId,
      storeName: row.storeName,
      activities: row.activityCount,
      activityValue: row.activityValue,
      settlementValue: row.settlementValue,
      storeOnlyCashValue: row.storeOnlyValue,
      posValue: row.posValue,
      customersCaptured: row.customersCaptured,
      productsCount: row.productsCount,
      lastActivityAt: formatDate(row.lastActivityAt),
    })))
  }

  function exportActivitiesPdf() {
    exportReportPdf({
      title: 'Sedifex Admin Platform Activity',
      subtitle: 'All store usage separated from Sedifex settlement money.',
      summary: [
        { label: 'Active stores', value: totals.activeStores },
        { label: 'Activities', value: totals.activityCount },
        { label: 'Activity value', value: formatMoney(totals.activityValue) },
        { label: 'Settlement value', value: formatMoney(totals.settlementValue) },
        { label: 'Store-only cash', value: formatMoney(totals.storeOnlyValue) },
      ],
      rows: allRows.slice(0, 500).map(row => ({
        date: formatDate(row.createdAt),
        store: getStoreName(row.storeId, stores),
        type: row.label,
        scope: row.settlementScope,
        reference: row.reference,
        customer: row.customerName,
        item: row.itemName,
        amount: row.amount,
        paymentStatus: row.canonicalPaymentStatus,
        orderStatus: row.canonicalOrderStatus,
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Sedifex Admin / Platform Activity</p>
        <h1>All Store Activity</h1>
        <p className="workspace-muted">Track every store’s usage without mixing store-only cash with Sedifex settlement money. This is platform usage, not only revenue.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.activeStores}/{totals.stores}</strong><span>Active stores</span></article>
        <article className="workspace-card"><strong>{totals.activityCount}</strong><span>Total activities</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.activityValue)}</strong><span>All activity value</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.settlementValue)}</strong><span>Sedifex settlement value</span></article>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{formatMoney(totals.storeOnlyValue)}</strong><span>Store-only cash/manual</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.posValue)}</strong><span>POS activity value</span></article>
        <article className="workspace-card"><strong>{totals.customers}</strong><span>Customers captured</span></article>
        <article className="workspace-card"><strong>{totals.products}</strong><span>Products/services</span></article>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Filters</h2>
            <p className="workspace-muted">Activity tracking includes everything. Settlement value includes only money handled through Sedifex/Paystack.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="button button--secondary" onClick={exportActivitiesPdf} disabled={!allRows.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportStores} disabled={!storeSummaries.length}>Export stores CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>
          <select value={scope} onChange={event => setScope(event.target.value)}>
            <option value="all">All activity</option>
            <option value="settlement">Sedifex settlement only</option>
            <option value="store_only">Store-only cash/manual</option>
            <option value="pos">POS only</option>
            <option value="online">Online orders</option>
            <option value="booking">Bookings/services</option>
            <option value="cash">Manual cash</option>
            <option value="paid">Paid/completed only</option>
          </select>
        </div>
      </section>

      <section className="workspace-card">
        <h2>Store usage summary</h2>
        <p className="workspace-muted">Shows which stores are active, how much activity they record, how much is settlement money, and how much is store-only cash.</p>
      </section>
      <ReportDataTable rows={storeSummaries} columns={storeColumns} getRowKey={row => row.storeId} searchPlaceholder="Search store name or store ID…" />

      <section className="workspace-card">
        <h2>Recent platform activities</h2>
        <p className="workspace-muted">Detailed activities across stores. Store-only activity is tracked for usage but not counted as Sedifex settlement.</p>
      </section>
      <ReportDataTable rows={allRows} columns={activityColumns} getRowKey={row => row.id} searchPlaceholder="Search store, customer, reference, item, status…" />
    </div>
  )
}
