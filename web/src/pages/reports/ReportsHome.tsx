import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { useStorePreferences } from '../../hooks/useStorePreferences'
import { asNumber, formatMoney, getNestedObject, toDate } from './reportUtils'

type ReportCard = {
  title: string
  href: string
  description: string
  moduleIds: string[]
  industryOnly?: Array<'shop' | 'travel' | 'ngo' | 'school'>
  badge: string
  tone: string
  metricHint: string
}

type OverviewRow = {
  id: string
  label: string
  value: string | number
  hint: string
  tone: string
  href: string
}

const reports: ReportCard[] = [
  {
    title: 'Inventory report',
    href: '/reports/inventory',
    description: 'Stock units, services, categories, low-stock alerts, inventory value, CSV export, and PDF export.',
    moduleIds: ['products'],
    badge: 'Stock',
    tone: '#4f46e5',
    metricHint: 'Products + services',
  },
  {
    title: 'POS sales report',
    href: '/reports/pos-sales',
    description: 'Internal sales from Sell, receipts, payment splits, units sold, and exports.',
    moduleIds: ['sell'],
    badge: 'POS',
    tone: '#059669',
    metricHint: 'In-store sales',
  },
  {
    title: 'Website sales report',
    href: '/reports/website-sales',
    description: 'Sedifex Market, client website orders, public page orders, payment modes, and exports.',
    moduleIds: ['integrations', 'settlement', 'reports'],
    badge: 'Online',
    tone: '#2563eb',
    metricHint: 'Marketplace + websites',
  },
  {
    title: 'Settlement report',
    href: '/reports/settlement',
    description: 'Online gross payments, customer processing fees, Sedifex commission, Paystack split status, and expected merchant net.',
    moduleIds: ['settlement'],
    badge: 'Finance',
    tone: '#0f766e',
    metricHint: 'Commission + net',
  },
  {
    title: 'Bookings report',
    href: '/reports/bookings',
    description: 'Service bookings, class sessions, appointments, booking status, payment status, sync status, and exports.',
    moduleIds: ['bookings', 'upcoming-events'],
    badge: 'Bookings',
    tone: '#d97706',
    metricHint: 'Appointments + classes',
  },
  {
    title: 'Student registrations report',
    href: '/reports/student-registrations',
    description: 'Admissions data, course interest, start dates, payment status, and exports.',
    moduleIds: ['student-registration'],
    industryOnly: ['school'],
    badge: 'School',
    tone: '#db2777',
    metricHint: 'Admissions pipeline',
  },
  {
    title: 'Volunteers report',
    href: '/reports/volunteers',
    description: 'Volunteer applications, skills, availability, follow-up status, and exports.',
    moduleIds: ['volunteers'],
    industryOnly: ['ngo'],
    badge: 'NGO',
    tone: '#7c3aed',
    metricHint: 'Volunteer pipeline',
  },
  {
    title: 'Donors report',
    href: '/reports/donors',
    description: 'Donor profiles, giving totals, contact details, status, and exports.',
    moduleIds: ['donor-management'],
    badge: 'Donors',
    tone: '#16a34a',
    metricHint: 'Donor CRM',
  },
  {
    title: 'Funds report',
    href: '/reports/funds',
    description: 'Manual fund buckets, inflows, outflows, balances, and exports.',
    moduleIds: ['funds-ledger', 'donor-management'],
    badge: 'Funds',
    tone: '#15803d',
    metricHint: 'Fund balances',
  },
  {
    title: 'Blog report',
    href: '/reports/blog',
    description: 'Published and draft posts, simple content metrics, and exports.',
    moduleIds: ['blog'],
    badge: 'Content',
    tone: '#0891b2',
    metricHint: 'Publishing',
  },
]

function reportAllowed(report: ReportCard, enabledModules: string[], industry: string) {
  if (report.industryOnly && !report.industryOnly.includes(industry as 'shop' | 'travel' | 'ngo' | 'school')) return false
  if (!enabledModules.length) return true
  return report.moduleIds.some(moduleId => enabledModules.includes(moduleId))
}

function isSameDay(value: Date | null) {
  if (!value) return false
  const now = new Date()
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate()
}

function isThisMonth(value: Date | null) {
  if (!value) return false
  const now = new Date()
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth()
}

function readOrderAmount(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const amountMinor = asNumber(data.amountMinor, 0)
  if (amountMinor > 0) return amountMinor / 100
  return asNumber(payment.amount ?? payment.customerTotal ?? data.amount ?? data.total ?? data.grandTotal ?? pricing.final_total ?? pricingSnake.final_total, 0)
}

function isPaidLike(value: unknown) {
  const status = String(value ?? '').toLowerCase()
  return ['paid', 'success', 'confirmed', 'completed', 'captured'].some(token => status.includes(token))
}

export default function ReportsHome() {
  const { storeId } = useActiveStore()
  const { preferences } = useStorePreferences(storeId)
  const enabledModules = preferences.navigation.enabledModules
  const visibleReports = reports.filter(report => reportAllowed(report, enabledModules, preferences.navigation.industry))
  const hiddenCount = Math.max(0, reports.length - visibleReports.length)
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([])
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      setSales([])
      setOrders([])
      setBookings([])
      return undefined
    }

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), snapshot => {
      setProducts(snapshot.docs.map(docSnap => docSnap.data() as Record<string, unknown>))
    })
    const unsubSales = onSnapshot(query(collection(db, 'sales'), where('storeId', '==', storeId)), snapshot => {
      setSales(snapshot.docs.map(docSnap => docSnap.data() as Record<string, unknown>))
    })
    const unsubOrders = onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => {
      setOrders(snapshot.docs.map(docSnap => docSnap.data() as Record<string, unknown>))
    })
    const unsubBookings = onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => {
      setBookings(snapshot.docs.map(docSnap => docSnap.data() as Record<string, unknown>))
    })

    return () => {
      unsubProducts()
      unsubSales()
      unsubOrders()
      unsubBookings()
    }
  }, [storeId])

  const overview = useMemo(() => {
    const todayPos = sales
      .filter(sale => isSameDay(toDate(sale.createdAt)))
      .reduce((sum, sale) => sum + asNumber(sale.total ?? sale.grandTotal ?? sale.amount, 0), 0)
    const monthPos = sales
      .filter(sale => isThisMonth(toDate(sale.createdAt)))
      .reduce((sum, sale) => sum + asNumber(sale.total ?? sale.grandTotal ?? sale.amount, 0), 0)
    const monthOnline = orders
      .filter(order => isThisMonth(toDate(order.createdAtServer ?? order.createdAt)))
      .reduce((sum, order) => sum + readOrderAmount(order), 0)
    const pendingBookings = bookings.filter(booking => {
      const bookingStatus = String(booking.bookingStatus ?? booking.status ?? '').toLowerCase()
      const paymentStatus = String(booking.paymentStatus ?? booking.payment_status ?? getNestedObject(booking, 'payment').status ?? '').toLowerCase()
      return bookingStatus.includes('pending') || paymentStatus.includes('pending') || !bookingStatus
    }).length
    const confirmedBookings = bookings.filter(booking => {
      const bookingStatus = String(booking.bookingStatus ?? booking.status ?? '').toLowerCase()
      const paymentStatus = String(booking.paymentStatus ?? booking.payment_status ?? getNestedObject(booking, 'payment').status ?? '').toLowerCase()
      return bookingStatus.includes('confirmed') || isPaidLike(paymentStatus)
    }).length
    const syncPending = bookings.filter(booking => String(booking.syncStatus ?? booking.sync_status ?? '').toLowerCase() === 'pending').length
    const lowStock = products.filter(product => {
      const itemType = String(product.itemType ?? '').toLowerCase()
      if (itemType === 'service') return false
      const stock = asNumber(product.stockCount, 0)
      const reorderPoint = asNumber(product.reorderPoint, 0)
      return stock <= 0 || (reorderPoint > 0 && stock <= reorderPoint)
    }).length

    return [
      { id: 'today-sales', label: 'Today sales', value: formatMoney(todayPos), hint: 'POS sales recorded today', tone: '#059669', href: '/reports/pos-sales' },
      { id: 'month-sales', label: 'This month value', value: formatMoney(monthPos + monthOnline), hint: 'POS + online order value', tone: '#2563eb', href: '/reports/website-sales' },
      { id: 'pending-bookings', label: 'Pending bookings', value: pendingBookings, hint: 'Need confirmation or payment review', tone: '#d97706', href: '/reports/bookings' },
      { id: 'confirmed-bookings', label: 'Confirmed bookings', value: confirmedBookings, hint: 'Paid/confirmed booking records', tone: '#16a34a', href: '/reports/bookings' },
      { id: 'sync-pending', label: 'Sync pending', value: syncPending, hint: 'Bookings waiting for App Script sync', tone: '#7c3aed', href: '/reports/bookings' },
      { id: 'stock-alerts', label: 'Stock alerts', value: lowStock, hint: 'Low or out-of-stock products', tone: '#dc2626', href: '/reports/inventory' },
    ] satisfies OverviewRow[]
  }, [bookings, orders, products, sales])

  const actionItems = overview.filter(item => {
    if (typeof item.value === 'number') return item.value > 0 && ['pending-bookings', 'sync-pending', 'stock-alerts'].includes(item.id)
    return false
  })

  return (
    <div className="workspace-page">
      <section className="workspace-card" style={{ background: '#ffffff' }}>
        <div className="workspace-section-header">
          <div>
            <p className="workspace-eyebrow">Reports</p>
            <h1>Business reports</h1>
            <p className="workspace-muted">Live business overview plus detailed reports for sales, bookings, settlement, inventory, customers, and exports.</p>
          </div>
          <Link className="button button--secondary" to="/account">
            Manage account modules
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ borderRadius: 999, background: '#e0f2fe', color: '#075985', padding: '7px 12px', fontWeight: 800, fontSize: 12 }}>{visibleReports.length} visible</span>
          {hiddenCount > 0 ? <span style={{ borderRadius: 999, background: '#f1f5f9', color: '#475569', padding: '7px 12px', fontWeight: 800, fontSize: 12 }}>{hiddenCount} hidden</span> : null}
          <span style={{ borderRadius: 999, background: '#f8fafc', color: '#334155', padding: '7px 12px', fontWeight: 800, fontSize: 12 }}>{preferences.navigation.industry.toUpperCase()}</span>
        </div>
      </section>

      <section className="workspace-grid workspace-grid--three">
        {overview.map(item => (
          <Link key={item.id} to={item.href} className="workspace-card" style={{ textDecoration: 'none', color: 'inherit', borderLeft: `5px solid ${item.tone}` }}>
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{item.label}</span>
            <strong style={{ display: 'block', fontSize: 26, marginTop: 8 }}>{item.value}</strong>
            <span className="workspace-muted" style={{ display: 'block', marginTop: 6 }}>{item.hint}</span>
          </Link>
        ))}
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Action needed</h2>
            <p className="workspace-muted">Quick list of report signals that may need attention.</p>
          </div>
        </div>
        {actionItems.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {actionItems.map(item => (
              <Link key={item.id} to={item.href} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
                <span><strong>{item.label}</strong><br /><small className="workspace-muted">{item.hint}</small></span>
                <strong style={{ color: item.tone }}>{item.value}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <p className="workspace-muted">No urgent report alerts right now.</p>
        )}
      </section>

      {visibleReports.length ? (
        <section className="workspace-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid' }}>
            {visibleReports.map((report, index) => (
              <Link
                key={report.href}
                to={report.href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  gap: 14,
                  alignItems: 'center',
                  padding: '14px 18px',
                  borderTop: index === 0 ? 'none' : '1px solid #e2e8f0',
                  background: '#ffffff',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: report.tone }} aria-hidden="true" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{report.title}</strong>
                    <span style={{ borderRadius: 999, background: `${report.tone}16`, color: report.tone, padding: '3px 9px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>
                      {report.badge}
                    </span>
                    <span style={{ color: '#64748b', fontSize: 12 }}>{report.metricHint}</span>
                  </div>
                  <p className="workspace-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{report.description}</p>
                </div>
                <span style={{ color: '#334155', fontWeight: 800 }}>Open →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="workspace-card">
          <h2>No reports enabled yet</h2>
          <p className="workspace-muted">Enable modules in Account settings to show the matching reports here.</p>
          <Link className="button button--primary" to="/account">Go to Account</Link>
        </section>
      )}
    </div>
  )
}
