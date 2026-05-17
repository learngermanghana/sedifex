import { Link } from 'react-router-dom'

const reports = [
  {
    title: 'Inventory report',
    href: '/reports/inventory',
    description: 'Stock units, services, categories, low-stock alerts, inventory value, and CSV export.',
  },
  {
    title: 'Website sales report',
    href: '/reports/website-sales',
    description: 'Sedifex Market, client website orders, public page orders, payment modes, and CSV export.',
  },
]

export default function ReportsHome() {
  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports</p>
        <h1>Business reports</h1>
        <p className="workspace-muted">The dashboard should stay simple. Use reports for rich data, exports, and future PDF generation.</p>
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
