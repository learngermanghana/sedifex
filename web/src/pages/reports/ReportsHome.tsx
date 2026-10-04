import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveStore } from '../../hooks/useActiveStore'
import { useStorePreferenceSync } from '../../hooks/useStorePreferenceSync'
import { useStorePreferences } from '../../hooks/useStorePreferences'
import EventPortfolioReport from './EventPortfolioReport'
import './reportsHome.css'

type ReportItem = { title: string; href: string; description: string; badge: string; inline?: boolean }
type ReportGroup = { title: string; reports: ReportItem[] }

const REPORT_SEARCH_KEY_PREFIX = 'sedifex-report-search-'

const REPORTS = {
  allSales: { title: 'Website and In App Sales', href: '/reports/sales-cash', description: 'All sales activity from Sedifex and connected websites.', badge: 'Main' },
  settlement: { title: 'Settlement Report', href: '/reports/settlement', description: 'Paystack/Sedifex settlements, commission, split status, and merchant net.', badge: 'Finance' },
  inventory: { title: 'Inventory Report', href: '/reports/inventory', description: 'Products, services, stock levels, low-stock alerts, and value history.', badge: 'Stock' },
  posSales: { title: 'In App Sales', href: '/reports/pos-sales', description: 'Sales recorded directly inside Sedifex through Sell/POS.', badge: 'POS' },
  websiteSales: { title: 'Website Sales Report', href: '/reports/website-sales', description: 'Online orders from connected websites and public storefront pages.', badge: 'Online' },
  bookings: { title: 'Bookings Report', href: '/reports/bookings', description: 'Service bookings, appointment status, payment status, and exports.', badge: 'Bookings' },
  students: { title: 'Student Registrations', href: '/reports/student-registrations', description: 'Admissions, enquiries, program interest, and payment progress.', badge: 'School' },
  donors: { title: 'Donors Report', href: '/reports/donors', description: 'Donor profiles, giving totals, and engagement history.', badge: 'Donors' },
  funds: { title: 'Funds Report', href: '/reports/funds', description: 'Fund ledger inflows, outflows, and balance tracking.', badge: 'Funds' },
  volunteers: { title: 'Volunteers Report', href: '/reports/volunteers', description: 'Volunteer applications, skills, availability, and follow-up status.', badge: 'NGO' },
  blog: { title: 'Blog Report', href: '/reports/blog', description: 'Published and draft post history with export-ready records.', badge: 'Content' },
} satisfies Record<string, ReportItem>

function reportGroupsForIndustry(industry: string): ReportGroup[] {
  if (industry === 'shop') {
    return [
      { title: 'Essentials', reports: [REPORTS.allSales, REPORTS.settlement, REPORTS.inventory] },
      { title: 'More reports', reports: [REPORTS.posSales, REPORTS.websiteSales, REPORTS.blog] },
    ]
  }
  if (industry === 'school') {
    return [
      { title: 'Essentials', reports: [REPORTS.allSales, REPORTS.settlement, REPORTS.students] },
      { title: 'More reports', reports: [REPORTS.bookings, REPORTS.posSales, REPORTS.websiteSales, REPORTS.blog] },
    ]
  }
  if (industry === 'ngo') {
    return [
      { title: 'Essentials', reports: [REPORTS.allSales, REPORTS.settlement, REPORTS.donors] },
      { title: 'More reports', reports: [REPORTS.funds, REPORTS.volunteers, REPORTS.bookings, REPORTS.blog] },
    ]
  }
  if (industry === 'event') {
    return [
      eventReportGroup,
      { title: 'Money', reports: [REPORTS.allSales, REPORTS.settlement] },
      { title: 'More reports', reports: [REPORTS.websiteSales, REPORTS.posSales] },
    ]
  }
  return [
    { title: 'Essentials', reports: [REPORTS.allSales, REPORTS.settlement, REPORTS.bookings] },
    { title: 'More reports', reports: [REPORTS.websiteSales, REPORTS.posSales, REPORTS.blog] },
  ]
}

const eventReportGroup: ReportGroup = {
  title: 'Event planning',
  reports: [{
    title: 'Event Performance & Financial Report',
    href: '#event-performance-report',
    description: 'Portfolio readiness, client balances, vendor commitments, expenses and expected profit using the same Event Management records.',
    badge: 'Events',
    inline: true,
  }],
}

export default function ReportsHome() {
  const { storeId } = useActiveStore()
  const { preferences } = useStorePreferences(storeId)
  const [search, setSearch] = useState('')
  const { clearPreference: clearSearchPreference } = useStorePreferenceSync<string>({
    storeId,
    keyPrefix: REPORT_SEARCH_KEY_PREFIX,
    value: search,
    defaultValue: '',
    apply: restored => setSearch(restored),
    serialize: current => current,
    deserialize: raw => raw,
    debugName: 'reports',
  })

  const visibleGroups = useMemo(
    () => reportGroupsForIndustry(preferences.navigation.industry),
    [preferences.navigation.industry],
  )
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return visibleGroups
    return visibleGroups
      .map(group => ({ ...group, reports: group.reports.filter(report => [report.title, report.badge, report.description].join(' ').toLowerCase().includes(term)) }))
      .filter(group => group.reports.length > 0)
  }, [search, visibleGroups])

  return (
    <div className="workspace-page reports-directory-page">
      <section className="reports-directory-header">
        <h1>Reports & data history</h1>
        <p className="workspace-muted">Start with the reports most useful for this workspace. Search when you need something more specific.</p>
      </section>
      <section className="reports-toolbar">
        <input className="reports-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reports..." />
        {search ? <button type="button" className="button button--secondary" onClick={clearSearchPreference}>Clear search</button> : null}
      </section>

      {filteredGroups.length === 0 ? <section className="reports-section reports-empty-state">No reports match your search.</section> : null}
      {filteredGroups.map(group => (
        <section className="reports-section" key={group.title}>
          <h2 className="reports-section-title">{group.title}</h2>
          <div className="reports-list">
            {group.reports.map(report => (
              <article className="reports-row" key={report.href}>
                <div className="reports-row-main">
                  <span className="reports-badge">{report.badge}</span>
                  <strong>{report.title}</strong>
                  <p className="workspace-muted">{report.description}</p>
                </div>
                <div className="reports-row-action">
                  {report.inline
                    ? <a href={report.href} className="button button--primary">Open report</a>
                    : <Link to={report.href} className="button button--primary">Open report</Link>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {preferences.navigation.industry === 'event' ? <EventPortfolioReport /> : null}
    </div>
  )
}
