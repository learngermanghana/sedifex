// web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './Dashboard.css'

type Metric = { id: string; label: string; value: string; hint: string; tone: string; group: 'sales' | 'inventory' | 'orders' | 'customers' | 'content' | 'ngo' | 'school' }

const DEFAULT_KPI_IDS = ['inventory', 'internal-sales', 'online-orders', 'online-value', 'bookings', 'stock-alerts']

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

function isToday(value: unknown) {
  const date = toDate(value)
  if (!date) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function formatMoney(value: number, currency = 'GHS') { return `${currency} ${value.toFixed(2)}` }

function normalizeSourceChannel(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') : ''
  if (normalized.includes('website') || normalized.includes('client') || normalized.includes('wordpress')) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  if (normalized.includes('custom') || normalized.includes('public')) return 'sedifex_custom_page'
  return normalized || 'sedifex_market'
}

function normalizeSelectedKpis(value: unknown, availableIds: string[]) {
  if (!Array.isArray(value)) return DEFAULT_KPI_IDS.filter(id => availableIds.includes(id))
  const cleaned = value.filter((item): item is string => typeof item === 'string' && availableIds.includes(item))
  return cleaned.length > 0 ? cleaned : DEFAULT_KPI_IDS.filter(id => availableIds.includes(id))
}

function groupLabel(group: Metric['group']) {
  const labels: Record<Metric['group'], string> = {
    sales: 'Sales',
    inventory: 'Inventory',
    orders: 'Orders',
    customers: 'Customers',
    content: 'Content',
    ngo: 'NGO',
    school: 'School',
  }
  return labels[group]
}

function kpiStyle(tone: string) {
  return { '--dashboard-kpi-tone': tone } as React.CSSProperties
}

export default function Dashboard() {
  const { storeId } = useActiveStore()
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([])
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([])
  const [volunteers, setVolunteers] = useState<Array<Record<string, unknown>>>([])
  const [donors, setDonors] = useState<Array<Record<string, unknown>>>([])
  const [registrations, setRegistrations] = useState<Array<Record<string, unknown>>>([])
  const [blogPosts, setBlogPosts] = useState<Array<Record<string, unknown>>>([])
  const [selectedKpiIds, setSelectedKpiIds] = useState<string[]>(DEFAULT_KPI_IDS)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [isSavingKpis, setIsSavingKpis] = useState(false)
  const [kpiMessage, setKpiMessage] = useState('')

  useEffect(() => {
    if (!storeId) {
      setProducts([]); setSales([]); setOrders([]); setBookings([]); setVolunteers([]); setDonors([]); setRegistrations([]); setBlogPosts([])
      return undefined
    }

    const unsubscribers = [
      onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), snapshot => setProducts(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'sales'), where('storeId', '==', storeId)), snapshot => setSales(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => setOrders(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => setBookings(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'volunteer_applications'), where('storeId', '==', storeId)), snapshot => setVolunteers(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'donor_profiles'), where('storeId', '==', storeId)), snapshot => setDonors(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'student_registrations'), where('storeId', '==', storeId)), snapshot => setRegistrations(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
      onSnapshot(query(collection(db, 'blogPosts'), where('storeId', '==', storeId)), snapshot => setBlogPosts(snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() })))),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [storeId])

  const todaySales = sales.filter(item => isToday(item.createdAt))
  const todayOrders = orders.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayBookings = bookings.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayVolunteers = volunteers.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayDonors = donors.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayRegistrations = registrations.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayBlogPosts = blogPosts.filter(item => isToday(item.createdAtServer ?? item.createdAt))

  const inventory = useMemo(() => {
    const inventoryItems = products.filter(item => item.itemType !== 'service')
    const totalStock = inventoryItems.reduce((sum, item) => sum + asNumber(item.stockCount, 0), 0)
    const stockValue = inventoryItems.reduce((sum, item) => sum + (asNumber(item.stockCount, 0) * asNumber(item.price, 0)), 0)
    const lowStock = inventoryItems.filter(item => {
      const stock = asNumber(item.stockCount, 0)
      const reorder = asNumber(item.reorderPoint, 0)
      return stock <= 0 || (reorder > 0 && stock <= reorder)
    }).length
    return { inventoryItems, totalStock, stockValue, lowStock }
  }, [products])

  const onlineRevenueToday = todayOrders.reduce((sum, item) => {
    const amountMinor = asNumber(item.amountMinor, 0)
    if (amountMinor > 0) return sum + amountMinor / 100
    return sum + asNumber(item.amount ?? item.total, 0)
  }, 0)
  const donorLifetimeGiving = donors.reduce((sum, item) => sum + asNumber(item.lifetimeGiving, 0), 0)
  const websiteOrdersToday = todayOrders.filter(item => normalizeSourceChannel(item.sourceChannel ?? item.source_channel ?? item.source) === 'client_website').length
  const marketOrdersToday = todayOrders.filter(item => normalizeSourceChannel(item.sourceChannel ?? item.source_channel ?? item.source) === 'sedifex_market').length
  const pendingDeliveryOrders = orders.filter(item => String(item.orderStatus ?? item.order_status ?? '').includes('delivery')).length
  const pendingManualPayments = [...orders, ...bookings].filter(item => String(item.paymentStatus ?? item.payment_status ?? '').includes('manual')).length

  const allMetrics: Metric[] = [
    { id: 'inventory', label: 'Total inventory', value: String(inventory.totalStock), hint: `${inventory.inventoryItems.length} stock-tracked items · ${formatMoney(inventory.stockValue)} estimated value`, tone: '#4f46e5', group: 'inventory' },
    { id: 'stock-alerts', label: 'Stock alerts', value: String(inventory.lowStock), hint: 'Low-stock or out-of-stock items', tone: '#dc2626', group: 'inventory' },
    { id: 'internal-sales', label: 'Internal sales today', value: String(todaySales.length), hint: 'Recorded in Sell (POS)', tone: '#059669', group: 'sales' },
    { id: 'online-orders', label: 'Online orders today', value: String(todayOrders.length), hint: `${websiteOrdersToday} website · ${marketOrdersToday} marketplace`, tone: '#2563eb', group: 'orders' },
    { id: 'online-value', label: 'Online order value today', value: formatMoney(onlineRevenueToday), hint: 'From integrationOrders', tone: '#0f766e', group: 'orders' },
    { id: 'pending-delivery', label: 'Pending delivery', value: String(pendingDeliveryOrders), hint: 'Orders waiting for delivery/action', tone: '#ea580c', group: 'orders' },
    { id: 'manual-payments', label: 'Manual payment pending', value: String(pendingManualPayments), hint: 'Orders/bookings waiting for manual verification', tone: '#ca8a04', group: 'orders' },
    { id: 'bookings', label: 'Bookings today', value: String(todayBookings.length), hint: 'New booking entries', tone: '#d97706', group: 'orders' },
    { id: 'all-orders', label: 'All online orders', value: String(orders.length), hint: 'Full history for this workspace', tone: '#1d4ed8', group: 'orders' },
    { id: 'all-products', label: 'Catalog records', value: String(products.length), hint: 'Products, services, and made-to-order records', tone: '#9333ea', group: 'inventory' },
    { id: 'donors', label: 'New donors today', value: String(todayDonors.length), hint: `${donors.length} donor profiles total`, tone: '#16a34a', group: 'ngo' },
    { id: 'donor-lifetime-giving', label: 'Donor lifetime giving', value: formatMoney(donorLifetimeGiving), hint: 'From donor profiles', tone: '#15803d', group: 'ngo' },
    { id: 'volunteers', label: 'Volunteers today', value: String(todayVolunteers.length), hint: 'New volunteer applications', tone: '#7c3aed', group: 'ngo' },
    { id: 'student-registrations', label: 'Student registrations today', value: String(todayRegistrations.length), hint: 'New student registration entries', tone: '#db2777', group: 'school' },
    { id: 'all-registrations', label: 'All student registrations', value: String(registrations.length), hint: 'Full registration history', tone: '#be123c', group: 'school' },
    { id: 'blog-posts', label: 'New blog posts today', value: String(todayBlogPosts.length), hint: 'Published or drafted today', tone: '#0891b2', group: 'content' },
  ]

  const availableMetricIds = allMetrics.map(metric => metric.id)

  useEffect(() => {
    if (!storeId) {
      setSelectedKpiIds(DEFAULT_KPI_IDS)
      return undefined
    }
    return onSnapshot(doc(db, 'dashboardPreferences', storeId), snapshot => {
      const data = snapshot.data() as { selectedKpiIds?: unknown } | undefined
      setSelectedKpiIds(normalizeSelectedKpis(data?.selectedKpiIds, availableMetricIds))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  const selectedMetrics = allMetrics.filter(metric => selectedKpiIds.includes(metric.id))
  const secondaryMetrics = allMetrics.filter(metric => !selectedKpiIds.includes(metric.id)).slice(0, 5)

  function toggleKpi(metricId: string) {
    setKpiMessage('')
    setSelectedKpiIds(current => {
      if (current.includes(metricId)) {
        const next = current.filter(id => id !== metricId)
        return next.length > 0 ? next : current
      }
      return [...current, metricId]
    })
  }

  async function saveKpiPreferences() {
    if (!storeId) return
    try {
      setIsSavingKpis(true)
      await setDoc(doc(db, 'dashboardPreferences', storeId), { storeId, selectedKpiIds, updatedAt: serverTimestamp() }, { merge: true })
      setKpiMessage('Dashboard KPIs saved for this store.')
      setIsCustomizing(false)
    } catch (error) {
      console.error('[dashboard] Failed to save KPI preferences', error)
      setKpiMessage('Unable to save KPI preferences right now.')
    } finally {
      setIsSavingKpis(false)
    }
  }

  function resetKpiPreferences() {
    setSelectedKpiIds(DEFAULT_KPI_IDS.filter(id => availableMetricIds.includes(id)))
    setKpiMessage('Default KPI selection restored. Save to keep it for this store.')
  }

  return (
    <div className="workspace-page">
      <section className="dashboard-hero">
        <div className="workspace-section-header">
          <div>
            <p className="workspace-eyebrow">Dashboard</p>
            <h1>Quick business overview</h1>
            <p className="workspace-muted">A cleaner KPI board for daily decisions. Pick the numbers this store wants to see first; deeper exports stay inside Reports.</p>
          </div>
          <button type="button" className="button button--primary" onClick={() => setIsCustomizing(value => !value)}>{isCustomizing ? 'Close KPI picker' : 'Customize KPIs'}</button>
        </div>
        {kpiMessage ? <p style={{ margin: '12px 0 0', color: kpiMessage.includes('Unable') ? '#b91c1c' : '#166534', fontWeight: 700 }}>{kpiMessage}</p> : null}
      </section>

      {isCustomizing ? (
        <section className="workspace-card" aria-label="Customize dashboard KPIs">
          <div className="workspace-section-header">
            <div><h2>Choose dashboard KPIs</h2><p className="workspace-muted">Selected KPIs show at the top of this store dashboard. At least one KPI must remain selected.</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="button button--secondary" onClick={resetKpiPreferences}>Reset default</button>
              <button type="button" className="button button--primary" disabled={isSavingKpis} onClick={() => void saveKpiPreferences()}>{isSavingKpis ? 'Saving…' : 'Save KPIs'}</button>
            </div>
          </div>
          <div className="dashboard-kpi-picker-grid">
            {allMetrics.map(metric => {
              const isChecked = selectedKpiIds.includes(metric.id)
              return (
                <label key={metric.id} className={`dashboard-kpi-picker-option${isChecked ? ' is-selected' : ''}`} style={kpiStyle(metric.tone)}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={isChecked} onChange={() => toggleKpi(metric.id)} /><strong>{metric.label}</strong></span>
                  <small style={{ color: '#64748b' }}>{groupLabel(metric.group)} · {metric.hint}</small>
                </label>
              )
            })}
          </div>
        </section>
      ) : null}

      <section aria-label="Selected dashboard metrics" className="dashboard-kpi-grid">
        {selectedMetrics.map(metric => (
          <article key={metric.id} className="dashboard-kpi-card" style={kpiStyle(metric.tone)}>
            <div className="dashboard-kpi-card__top"><span className="dashboard-kpi-card__badge">{groupLabel(metric.group)}</span></div>
            <h2 className="dashboard-kpi-card__value">{metric.value}</h2>
            <p className="dashboard-kpi-card__label">{metric.label}</p>
            <p className="dashboard-kpi-card__hint">{metric.hint}</p>
          </article>
        ))}
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Smart report direction</h2><p className="workspace-muted">Dashboard is now focused. Reports show only the modules enabled for this store.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link className="button button--secondary" to="/online-orders">Online Orders</Link><Link className="button button--primary" to="/reports">Reports</Link></div>
        </div>
        <div className="dashboard-report-strip">
          {secondaryMetrics.map(metric => (
            <article key={metric.id} className="dashboard-report-mini-card"><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.hint}</small></article>
          ))}
        </div>
      </section>
    </div>
  )
}
