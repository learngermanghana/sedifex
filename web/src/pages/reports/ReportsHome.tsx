import { Link } from 'react-router-dom'

type ReportCard = {
  title: string
  href: string
  description: string
  badge: string
  tone: string
  primary?: boolean
}

const mainReports: ReportCard[] = [
  {
    title: 'Sales & Cash Report',
    href: '/reports/sales-cash',
    description: 'Main business activity: POS sales, online orders, service bookings, and store-only manual cash records.',
    badge: 'Main',
    tone: '#16a34a',
    primary: true,
  },
  {
    title: 'Settlement Report',
    href: '/reports/settlement',
    description: 'Only Paystack/Sedifex settlement money: online payments, commission, split status, and merchant net.',
    badge: 'Finance',
    tone: '#0f766e',
  },
  {
    title: 'Orders & Bookings',
    href: '/marketplace-orders',
    description: 'Operational page for pending orders, cash confirmation, services, product delivery, and customer follow-up.',
    badge: 'Work',
    tone: '#2563eb',
  },
  {
    title: 'Inventory Report',
    href: '/reports/inventory',
    description: 'Products, services, stock units, categories, low-stock alerts, and inventory value.',
    badge: 'Stock',
    tone: '#4f46e5',
  },
]

const detailedReports: ReportCard[] = [
  { title: 'POS Sales Report', href: '/reports/pos-sales', description: 'Detailed internal sales from the Sell/POS page.', badge: 'POS', tone: '#059669' },
  { title: 'Website Sales Report', href: '/reports/website-sales', description: 'Online orders from Sedifex Market, client websites, and public pages.', badge: 'Online', tone: '#2563eb' },
  { title: 'Bookings Report', href: '/reports/bookings', description: 'Service bookings, appointments, booking status, payment status, and exports.', badge: 'Bookings', tone: '#d97706' },
  { title: 'Student Registrations', href: '/reports/student-registrations', description: 'Admissions data, course interest, start dates, and payment status.', badge: 'School', tone: '#db2777' },
  { title: 'Donors Report', href: '/reports/donors', description: 'Donor profiles, giving totals, contact details, and status.', badge: 'Donors', tone: '#16a34a' },
  { title: 'Funds Report', href: '/reports/funds', description: 'Manual fund buckets, inflows, outflows, and balances.', badge: 'Funds', tone: '#15803d' },
  { title: 'Volunteers Report', href: '/reports/volunteers', description: 'Volunteer applications, skills, availability, and follow-up status.', badge: 'NGO', tone: '#7c3aed' },
  { title: 'Blog Report', href: '/reports/blog', description: 'Published and draft posts with simple content metrics.', badge: 'Content', tone: '#0891b2' },
]

function ReportCardTile({ report }: { report: ReportCard }) {
  return (
    <Link
      to={report.href}
      className="workspace-card"
      style={{ textDecoration: 'none', color: 'inherit', borderLeft: `6px solid ${report.tone}`, display: 'block' }}
    >
      <div className="workspace-section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <span style={{ display: 'inline-flex', borderRadius: 999, background: `${report.tone}18`, color: report.tone, padding: '4px 10px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6 }}>{report.badge}</span>
          <h2 style={{ marginTop: 12 }}>{report.title}</h2>
          <p className="workspace-muted">{report.description}</p>
        </div>
        <span style={{ color: report.tone, fontWeight: 900 }}>Open →</span>
      </div>
    </Link>
  )
}

export default function ReportsHome() {
  return (
    <div className="workspace-page space-y-8">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports</p>
        <h1>Business reports</h1>
        <p className="workspace-muted">
          Reports are now grouped by what you need. Use Sales & Cash for store activity. Use Settlement only for Paystack/Sedifex commission and payouts.
        </p>
      </section>

      <section className="workspace-grid workspace-grid--two">
        {mainReports.map(report => <ReportCardTile key={report.href} report={report} />)}
      </section>

      <section className="workspace-card">
        <h2>How to choose</h2>
        <div className="workspace-grid workspace-grid--three" style={{ marginTop: 16 }}>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <strong>Store owner view</strong>
            <p className="workspace-muted" style={{ marginTop: 8 }}>Use Sales & Cash Report to see POS, online, service, and manual cash activity together.</p>
          </article>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <strong>Sedifex money view</strong>
            <p className="workspace-muted" style={{ marginTop: 8 }}>Use Settlement Report only for online payments, commission, splits, and payouts.</p>
          </article>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <strong>Daily work view</strong>
            <p className="workspace-muted" style={{ marginTop: 8 }}>Use Orders & Bookings to confirm cash, start services, deliver products, and contact customers.</p>
          </article>
        </div>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Detailed reports</h2>
            <p className="workspace-muted">Open these when you need a specific area instead of the main summary.</p>
          </div>
        </div>
        <div className="workspace-grid workspace-grid--three">
          {detailedReports.map(report => <ReportCardTile key={report.href} report={report} />)}
        </div>
      </section>
    </div>
  )
}
