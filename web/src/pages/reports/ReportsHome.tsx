import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { useStorePreferences } from '../../hooks/useStorePreferences'
import { asNumber, exportReportPdf, formatMoney, getNestedObject, toDate } from './reportUtils'

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
  const hiddenReports = reports.filter(report => !reportAllowed(report, enabledModules, preferences.navigation.industry))
  const hiddenCount = hiddenReports.length
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
      { id: 'today-sales', label: 'Today sales', value: formatMoney(todayPos), hint: 'POS sales recorded today', tone: '#4f46e5', href: '/reports/pos-sales' },
      { id: 'month-sales', label: 'This month value', value: formatMoney(monthPos + monthOnline), hint: 'POS + online order value', tone: '#4f46e5', href: '/reports/website-sales' },
      { id: 'pending-bookings', label: 'Pending bookings', value: pendingBookings, hint: 'Need confirmation or payment review', tone: '#f97316', href: '/reports/bookings' },
      { id: 'confirmed-bookings', label: 'Confirmed bookings', value: confirmedBookings, hint: 'Paid/confirmed booking records', tone: '#16a34a', href: '/reports/bookings' },
      { id: 'sync-pending', label: 'Sync pending', value: syncPending, hint: 'Bookings waiting for App Script sync', tone: '#a855f7', href: '/reports/bookings' },
      { id: 'stock-alerts', label: 'Stock alerts', value: lowStock, hint: 'Low or out-of-stock products', tone: '#ef4444', href: '/reports/inventory' },
    ] satisfies OverviewRow[]
  }, [bookings, orders, products, sales])

  const actionItems = overview.filter(item => {
    if (typeof item.value === 'number') return item.value > 0 && ['pending-bookings', 'sync-pending', 'stock-alerts'].includes(item.id)
    return false
  })

  function exportOverviewPdf() {
    exportReportPdf({
      title: 'Business reports overview',
      subtitle: `Visible reports: ${visibleReports.length} | Hidden: ${hiddenCount} | Industry: ${preferences.navigation.industry.toUpperCase()}`,
      summary: overview.map(item => ({ label: item.label, value: item.value })),
      rows: visibleReports.map(report => ({
        Report: report.title,
        Badge: report.badge,
        Focus: report.metricHint,
        Description: report.description,
        Link: report.href,
      })),
    })
  }

  return (
    <div className="workspace-page space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8 print:shadow-none">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Reports</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">Business reports</h1>
            <p className="mt-4 max-w-4xl text-lg leading-8 text-slate-600">Live business overview plus detailed reports for sales, bookings, settlement, inventory, customers, and exports.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700" to="/account">
              Manage account modules
            </Link>
            <button type="button" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-slate-50" onClick={exportOverviewPdf}>
              Export PDF
            </button>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap border-b border-slate-200 text-lg font-medium text-slate-500">
          <span className="border-b-2 border-indigo-600 px-2 pb-3 text-indigo-600">{visibleReports.length} visible</span>
          <span className="px-6 pb-3">{hiddenCount} hidden</span>
          <span className="px-2 pb-3 uppercase">{preferences.navigation.industry}</span>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        {overview.map(item => (
          <Link key={item.id} to={item.href} className="group rounded-3xl border border-slate-200 bg-white p-7 text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md" style={{ borderLeft: `7px solid ${item.tone}` }}>
            <span className="text-sm font-medium uppercase tracking-wide" style={{ color: item.tone }}>{item.label}</span>
            <strong className="mt-5 block text-4xl font-normal tracking-tight md:text-5xl">{item.value}</strong>
            <span className="mt-5 block text-lg leading-7 text-slate-600">{item.hint}</span>
          </Link>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Action needed</h2>
            <p className="mt-3 text-lg text-slate-600">Quick list of report signals that may need attention.</p>
            {!actionItems.length ? <p className="mt-7 text-xl text-slate-700">No urgent report alerts right now.</p> : null}
          </div>
          {actionItems.length ? <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">{actionItems.length} alert{actionItems.length === 1 ? '' : 's'}</span> : <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">Clear</span>}
        </div>

        {actionItems.length ? (
          <div className="mt-6 grid gap-3">
            {actionItems.map(item => (
              <Link key={item.id} to={item.href} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-950 transition hover:border-indigo-200 hover:bg-white hover:shadow-sm">
                <span>
                  <strong className="block text-lg">{item.label}</strong>
                  <small className="text-base text-slate-500">{item.hint}</small>
                </span>
                <strong className="text-2xl" style={{ color: item.tone }}>{item.value}</strong>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {visibleReports.length ? (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="grid divide-y divide-slate-200">
            {visibleReports.map(report => (
              <Link key={report.href} to={report.href} className="grid gap-4 py-6 text-slate-950 first:pt-0 last:pb-0 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: report.tone }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-medium tracking-tight">{report.title}</h3>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{report.badge}</span>
                    <span className="text-lg text-slate-500">{report.metricHint}</span>
                  </div>
                  <p className="mt-2 text-lg leading-7 text-slate-600">{report.description}</p>
                </div>
                <span className="inline-flex w-fit items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-lg font-medium text-slate-950 shadow-sm transition group-hover:border-indigo-200">
                  Open <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">No reports enabled yet</h2>
          <p className="mt-2 text-slate-600">Enable modules in Account settings to show the matching reports here.</p>
          <Link className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white" to="/account">Go to Account</Link>
        </section>
      )}
    </div>
  )
}
