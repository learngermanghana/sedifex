import { Link } from 'react-router-dom'
import { useActiveStore } from '../../hooks/useActiveStore'
import { useStorePreferences } from '../../hooks/useStorePreferences'

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
    description: 'Service bookings, class sessions, appointments, booking status, payment status, and exports.',
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

export default function ReportsHome() {
  const { storeId } = useActiveStore()
  const { preferences } = useStorePreferences(storeId)
  const enabledModules = preferences.navigation.enabledModules
  const visibleReports = reports.filter(report => reportAllowed(report, enabledModules, preferences.navigation.industry))
  const hiddenCount = Math.max(0, reports.length - visibleReports.length)

  return (
    <div className="workspace-page">
      <section className="workspace-card" style={{ background: '#ffffff' }}>
        <div className="workspace-section-header">
          <div>
            <p className="workspace-eyebrow">Reports</p>
            <h1>Business reports</h1>
            <p className="workspace-muted">Simple report list for quick selection.</p>
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
