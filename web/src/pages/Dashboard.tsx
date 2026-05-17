// web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type Metric = {
  id: string
  label: string
  value: string
  hint: string
  tone: string
}

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

function formatMoney(value: number, currency = 'GHS') {
  return `${currency} ${value.toFixed(2)}`
}

function normalizeSourceChannel(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') : ''
  if (normalized.includes('website') || normalized.includes('client') || normalized.includes('wordpress')) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  if (normalized.includes('custom') || normalized.includes('public')) return 'sedifex_custom_page'
  return normalized || 'sedifex_market'
}

function cardStyle(tone: string) {
  return {
    borderRadius: 22,
    border: '1px solid #e2e8f0',
    borderTop: `5px solid ${tone}`,
    background: '#fff',
    padding: 18,
    boxShadow: '0 24px 60px -48px rgba(15, 23, 42, 0.65)',
    minHeight: 132,
  }
}

export default function Dashboard() {
  const { storeId } = useActiveStore()
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([])
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([])
  const [volunteers, setVolunteers] = useState<Array<Record<string, unknown>>>([])
  const [registrations, setRegistrations] = useState<Array<Record<string, unknown>>>([])
  const [blogPosts, setBlogPosts] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      setSales([])
      setOrders([])
      setBookings([])
      setVolunteers([])
      setRegistrations([])
      setBlogPosts([])
      return undefined
    }

    const unsubscribers = [
      onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), snapshot => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'sales'), where('storeId', '==', storeId)), snapshot => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => {
        setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'volunteer_applications'), where('storeId', '==', storeId)), snapshot => {
        setVolunteers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'student_registrations'), where('storeId', '==', storeId)), snapshot => {
        setRegistrations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
      onSnapshot(query(collection(db, 'blogPosts'), where('storeId', '==', storeId)), snapshot => {
        setBlogPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      }),
    ]

    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [storeId])

  const todaySales = sales.filter(item => isToday(item.createdAt))
  const todayOrders = orders.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayBookings = bookings.filter(item => isToday(item.createdAtServer ?? item.createdAt))
  const todayVolunteers = volunteers.filter(item => isToday(item.createdAt))
  const todayRegistrations = registrations.filter(item => isToday(item.createdAt))
  const todayBlogPosts = blogPosts.filter(item => isToday(item.createdAt))

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

  const websiteOrdersToday = todayOrders.filter(item => normalizeSourceChannel(item.sourceChannel ?? item.source_channel ?? item.source) === 'client_website').length
  const marketOrdersToday = todayOrders.filter(item => normalizeSourceChannel(item.sourceChannel ?? item.source_channel ?? item.source) === 'sedifex_market').length

  const primaryMetrics: Metric[] = [
    { id: 'inventory', label: 'Total inventory', value: String(inventory.totalStock), hint: `${inventory.inventoryItems.length} stock-tracked items · ${formatMoney(inventory.stockValue)} estimated value`, tone: '#4f46e5' },
    { id: 'internal-sales', label: 'Internal sales today', value: String(todaySales.length), hint: 'Recorded in Sell (POS)', tone: '#059669' },
    { id: 'online-orders', label: 'Online orders today', value: String(todayOrders.length), hint: `${websiteOrdersToday} website · ${marketOrdersToday} marketplace`, tone: '#2563eb' },
    { id: 'bookings', label: 'Bookings today', value: String(todayBookings.length), hint: 'New booking entries', tone: '#d97706' },
    { id: 'volunteers', label: 'Volunteers today', value: String(todayVolunteers.length), hint: 'New volunteer applications', tone: '#7c3aed' },
    { id: 'student-registrations', label: 'Student registrations today', value: String(todayRegistrations.length), hint: 'New student registration entries', tone: '#db2777' },
    { id: 'blog-posts', label: 'New blog posts today', value: String(todayBlogPosts.length), hint: 'Published or drafted today', tone: '#0891b2' },
    { id: 'stock-alerts', label: 'Stock alerts', value: String(inventory.lowStock), hint: 'Low-stock or out-of-stock items', tone: '#dc2626' },
  ]

  const secondaryMetrics: Metric[] = [
    { id: 'online-value', label: 'Online order value today', value: formatMoney(onlineRevenueToday), hint: 'From integrationOrders', tone: '#0f766e' },
    { id: 'all-products', label: 'Catalog records', value: String(products.length), hint: 'Products, services, and made-to-order records', tone: '#9333ea' },
    { id: 'all-orders', label: 'All online orders', value: String(orders.length), hint: 'Full history for this workspace', tone: '#1d4ed8' },
    { id: 'all-registrations', label: 'All student registrations', value: String(registrations.length), hint: 'Full registration history', tone: '#be123c' },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Dashboard</p>
        <h1>Quick business overview</h1>
        <p className="workspace-muted">
          This dashboard now shows only quick KPIs. Detailed inventory, website sales, exports, and future PDF reports live under Reports.
        </p>
      </section>

      <section aria-label="Primary metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
        {primaryMetrics.map(metric => (
          <article key={metric.id} style={cardStyle(metric.tone)}>
            <p style={{ margin: 0, color: metric.tone, fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Primary metric</p>
            <h2 style={{ margin: '8px 0 4px', fontSize: 32, letterSpacing: '-0.03em' }}>{metric.value}</h2>
            <p style={{ margin: '0 0 4px', fontWeight: 800, color: '#0f172a' }}>{metric.label}</p>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>{metric.hint}</p>
          </article>
        ))}
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Smart report direction</h2>
            <p className="workspace-muted">Use Reports for rich data. Dashboard stays fast and clean for daily decisions.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {secondaryMetrics.map(metric => (
            <article key={metric.id} style={{ border: '1px solid #e2e8f0', borderRadius: 18, padding: 16, background: '#f8fafc' }}>
              <strong style={{ display: 'block', fontSize: 22, color: '#0f172a' }}>{metric.value}</strong>
              <span style={{ display: 'block', fontWeight: 800, color: '#334155' }}>{metric.label}</span>
              <small style={{ color: '#64748b' }}>{metric.hint}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
