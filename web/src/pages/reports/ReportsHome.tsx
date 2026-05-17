import { Link } from 'react-router-dom'

const reports = [
  { title: 'Inventory report', href: '/reports/inventory', description: 'Stock units, services, categories, low-stock alerts, inventory value, CSV export, and PDF export.' },
  { title: 'POS sales report', href: '/reports/pos-sales', description: 'Internal sales from Sell, receipts, payment splits, units sold, and exports.' },
  { title: 'Website sales report', href: '/reports/website-sales', description: 'Sedifex Market, client website orders, public page orders, payment modes, and exports.' },
  { title: 'Bookings report', href: '/reports/bookings', description: 'Service bookings, class sessions, appointments, booking status, payment status, and exports.' },
  { title: 'Student registrations report', href: '/reports/student-registrations', description: 'Admissions data, course interest, start dates, payment status, and exports.' },
  { title: 'Volunteers report', href: '/reports/volunteers', description: 'Volunteer applications, skills, availability, follow-up status, and exports.' },
  { title: 'Donors report', href: '/reports/donors', description: 'Donor profiles, giving totals, contact details, status, and exports.' },
  { title: 'Funds report', href: '/reports/funds', description: 'Manual fund buckets, inflows, outflows, balances, and exports.' },
  { title: 'Blog report', href: '/reports/blog', description: 'Published and draft posts, simple content metrics, and exports.' },
]

export default function ReportsHome() {
  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports</p>
        <h1>Business reports</h1>
        <p className="workspace-muted">The dashboard stays simple. Use reports for rich data, CSV exports, and PDF print/download reports.</p>
      </section>
      <section className="workspace-grid">
        {reports.map(report => (
          <Link key={report.href} to={report.href} className="workspace-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>{report.title}</h2>
            <p className="workspace-muted">{report.description}</p>
            <strong>Open report →</strong>
          </Link>
        ))}
      </section>
    </div>
  )
}
