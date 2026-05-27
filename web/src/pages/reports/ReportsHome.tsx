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

const salesDetailReports: ReportCard[] = [
  { title: 'POS Sales Report', href: '/reports/pos-sales', description: 'Detailed internal sales from the Sell/POS page.', badge: 'POS', tone: '#059669' },
  { title: 'Website Sales Report', href: '/reports/website-sales', description: 'Online orders from Sedifex Market, client websites, and public pages.', badge: 'Online', tone: '#2563eb' },
  { title: 'Bookings Report', href: '/reports/bookings', description: 'Service bookings, appointments, booking status, payment status, and exports.', badge: 'Bookings', tone: '#d97706' },
]

const schoolReports: ReportCard[] = [
  { title: 'Student Registrations', href: '/reports/student-registrations', description: 'Admissions data, student enquiries, course interest, start dates, and payment status.', badge: 'School', tone: '#db2777' },
]

const ngoReports: ReportCard[] = [
  { title: 'Donors Report', href: '/reports/donors', description: 'Donor profiles, giving totals, contact details, and status.', badge: 'Donors', tone: '#16a34a' },
  { title: 'Funds Report', href: '/reports/funds', description: 'Fund ledger view: money buckets, inflows, outflows, and balances.', badge: 'Funds', tone: '#15803d' },
  { title: 'Volunteers Report', href: '/reports/volunteers', description: 'Volunteer applications, skills, availability, and follow-up status.', badge: 'NGO', tone: '#7c3aed' },
]

const contentReports: ReportCard[] = [
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

function ReportSection({ title, subtitle, reports, columns = 'three' }: { title: string; subtitle: string; reports: ReportCard[]; columns?: 'two' | 'three' }) {
  return (
    <section className="workspace-card">
      <div className="workspace-section-header">
        <div>
          <h2>{title}</h2>
          <p className="workspace-muted">{subtitle}</p>
        </div>
      </div>
      <div className={`workspace-grid workspace-grid--${columns}`}>
        {reports.map(report => <ReportCardTile key={report.href} report={report} />)}
      </div>
    </section>
  )
}

export default function ReportsHome() {
  return (
    <div className="workspace-page space-y-8">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports</p>
        <h1>Business reports</h1>
        <p className="workspace-muted">
          Reports are grouped by purpose. Use Sales & Cash for store activity, Settlement for Paystack/Sedifex payouts, School reports for student data, and NGO reports for donors/funds/volunteers.
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
            <strong>School / NGO view</strong>
            <p className="workspace-muted" style={{ marginTop: 8 }}>Use the separate School & NGO sections for student registration, donor, fund ledger, and volunteer records.</p>
          </article>
        </div>
      </section>

      <ReportSection
        title="Sales detail reports"
        subtitle="Open these when you need a specific sales, online order, or booking breakdown."
        reports={salesDetailReports}
      />

      <ReportSection
        title="School reports"
        subtitle="Student and admission data for schools, academies, and training businesses."
        reports={schoolReports}
        columns="two"
      />

      <ReportSection
        title="NGO reports"
        subtitle="Donor, fund ledger, and volunteer reports for NGOs and community projects."
        reports={ngoReports}
      />

      <ReportSection
        title="Content reports"
        subtitle="Website and content performance reports."
        reports={contentReports}
        columns="two"
      />
    </div>
  )
}
