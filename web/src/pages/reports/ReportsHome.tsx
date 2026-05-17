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

function cardStyle(tone: string) {
  return {
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid #e2e8f0',
    borderTop: `5px solid ${tone}`,
    borderRadius: 22,
    background: `linear-gradient(135deg, #ffffff 0%, #ffffff 62%, ${tone}10 100%)`,
    boxShadow: '0 26px 70px -55px rgba(15, 23, 42, 0.75)',
    minHeight: 210,
    display: 'grid',
    gap: 14,
  }
}

export default function ReportsHome() {
  const { storeId } = useActiveStore()
  const { preferences } = useStorePreferences(storeId)
  const enabledModules = preferences.navigation.enabledModules
  const visibleReports = reports.filter(report => reportAllowed(report, enabledModules, preferences.navigation.industry))
  const hiddenCount = Math.max(0, reports.length - visibleReports.length)

  return (
    <div className="workspace-page">
      <section className="workspace-card" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 48%, #ecfeff 100%)' }}>
        <div className="workspace-section-header">
          <div>
            <p className="workspace-eyebrow">Reports</p>
            <h1>Business reports</h1>
            <p className="workspace-muted">
              Showing only the reports enabled for this store from Account/navigation settings, so the list stays focused.
            </p>
          </div>
          <Link className="button button--secondary" to="/account">
            Manage account modules
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ borderRadius: 999, background: '#e0f2fe', color: '#075985', padding: '8px 12px', fontWeight: 800, fontSize: 13 }}>{visibleReports.length} reports visible</span>
          {hiddenCount > 0 ? <span style={{ borderRadius: 999, background: '#f1f5f9', color: '#475569', padding: '8px 12px', fontWeight: 800, fontSize: 13 }}>{hiddenCount} hidden by account setup</span> : null}
          <span style={{ borderRadius: 999, background: '#fef3c7', color: '#92400e', padding: '8px 12px', fontWeight: 800, fontSize: 13 }}>{preferences.navigation.industry.toUpperCase()} workspace</span>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
        {visibleReports.map(report => (
          <Link key={report.href} to={report.href} className="workspace-card" style={cardStyle(report.tone)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ borderRadius: 999, background: `${report.tone}18`, color: report.tone, padding: '7px 11px', fontWeight: 900, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {report.badge}
              </span>
              <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${report.tone}14`, color: report.tone, fontSize: 22, fontWeight: 900 }}>
                →
              </span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>{report.title}</h2>
              <p className="workspace-muted" style={{ marginTop: 8 }}>{report.description}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              <strong style={{ color: report.tone }}>{report.metricHint}</strong>
              <span style={{ color: '#334155', fontWeight: 800 }}>Open report</span>
            </div>
          </Link>
        ))}
      </section>

      {!visibleReports.length ? (
        <section className="workspace-card">
          <h2>No reports enabled yet</h2>
          <p className="workspace-muted">Enable modules in Account settings to show the matching reports here.</p>
          <Link className="button button--primary" to="/account">Go to Account</Link>
        </section>
      ) : null}
    </div>
  )
}