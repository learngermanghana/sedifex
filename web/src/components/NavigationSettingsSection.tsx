import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { INDUSTRY_ENABLED_MODULE_PRESETS, NAV_ITEMS, type Industry } from '../config/navigation'
import type { StorePreferences } from '../hooks/useStorePreferences'

type Props = {
  preferences: StorePreferences['navigation']
  onSave: (navigation: StorePreferences['navigation']) => Promise<void>
  canEdit: boolean
}

type ValidationError = string | null

type PageGroup = {
  title: string
  helper: string
  ids: string[]
}

type QuickOpenPage = {
  id: string
  label: string
  target: string
  description: string
  category: string
}

const INDUSTRY_OPTIONS: Array<{ value: Industry; label: string; helper: string }> = [
  { value: 'shop', label: 'Retail / Shop', helper: 'Starts with selling, products, customers, bookings, reports, settlement, promo, gallery, and marketing pages.' },
  { value: 'travel', label: 'Travel', helper: 'Starts with trips, bookings, upcoming trips, travelers, invoices, blog, promos, gallery, and customer follow-up.' },
  { value: 'ngo', label: 'NGO', helper: 'Starts with donors, volunteers, campaigns, support requests, funds, reports, blog, and communication tools.' },
  { value: 'school', label: 'School', helper: 'Starts with students, registrations, upcoming classes, bookings, payments, blog, admissions promo, and communication tools.' },
]

const PAGE_DESCRIPTIONS: Record<string, string> = {
  dashboard: 'Main overview for daily activity, alerts, and business health.',
  reports: 'Performance reports for sales, inventory, bookings, donations, students, and growth.',
  products: 'Manage products, services, packages, courses, trips, or donation items.',
  sell: 'Sell quickly through POS-style checkout.',
  invoices: 'Create and manage invoices for clients or partners.',
  receipts: 'Create and manage receipts for payments received.',
  customers: 'Manage customers, travelers, students, donors, or contacts.',
  bookings: 'Manage service bookings, trips, classes, appointments, or campaigns.',
  'upcoming-events': 'Manage upcoming trips, seminars, classes, workshops, or events.',
  'student-registration': 'Collect and manage student or training registrations.',
  volunteers: 'Collect and manage volunteer applications.',
  'support-requests': 'Collect and manage support requests, cases, or applications.',
  settlement: 'Track online payments and settlement records.',
  integrations: 'Connect websites, bookings, checkout, email, and API settings.',
  blog: 'Publish updates, travel guides, school news, campaign stories, or SEO posts.',
  promo: 'Manage public offers, campaigns, and website promo sections.',
  gallery: 'Manage public images for websites, campaigns, trips, or school pages.',
  'social-links': 'Manage WhatsApp, Instagram, Facebook, TikTok, and other public links.',
  'bulk-messaging': 'Send SMS updates and announcements.',
  'bulk-email': 'Send bulk emails for customers, students, donors, or travelers.',
  'donor-management': 'Track donors, expenses, contributions, and NGO/customer finance records.',
  'funds-ledger': 'Track fund movement, donor money, campaign balances, and ledger activity.',
  account: 'Manage workspace, billing, team, navigation, and setup settings.',
}

const QUICK_OPEN_PAGES: QuickOpenPage[] = [
  {
    id: 'integration-website',
    label: 'Website + checkout integration',
    target: '/settings/integrations/website',
    category: 'Integrations',
    description: 'Save website domain, checkout URLs, Sedifex API base URL, and checkout create URL.',
  },
  {
    id: 'integration-bookings',
    label: 'Booking sheet sync',
    target: '/settings/integrations/bookings',
    category: 'Integrations',
    description: 'Save Google Apps Script Web App URL for booking and sheet sync.',
  },
  {
    id: 'integration-email',
    label: 'Email Apps Script integration',
    target: '/settings/integrations/email',
    category: 'Integrations',
    description: 'Save bulk email Apps Script URL, token, and sender name.',
  },
  {
    id: 'booking-mapping',
    label: 'Booking mapping',
    target: '/settings/integrations/booking-mapping',
    category: 'Integrations',
    description: 'Map booking form fields and incoming website payloads.',
  },
  {
    id: 'online-orders',
    label: 'Online / marketplace orders',
    target: '/online-orders',
    category: 'Sales',
    description: 'Open orders created from websites, marketplace, and online checkout flows.',
  },
  {
    id: 'documents-generator',
    label: 'Quick document generator',
    target: '/sell/invoice',
    category: 'Finance',
    description: 'Quickly build invoices, receipts, and sales documents.',
  },
  {
    id: 'close-day',
    label: 'Close day',
    target: '/sell/close-day',
    category: 'Sales',
    description: 'Close daily sales and review end-of-day records.',
  },
  {
    id: 'public-page',
    label: 'Public promo page settings',
    target: '/promo',
    category: 'Marketing',
    description: 'Manage the public Sedifex page, promo details, and campaign content.',
  },
]

const PAGE_GROUPS: PageGroup[] = [
  {
    title: 'Core work',
    helper: 'Pages most businesses use every day.',
    ids: ['dashboard', 'reports', 'products', 'sell', 'customers'],
  },
  {
    title: 'Bookings, registrations & cases',
    helper: 'Pages for appointment, trip, class, student, volunteer, or support workflows.',
    ids: ['bookings', 'upcoming-events', 'student-registration', 'volunteers', 'support-requests'],
  },
  {
    title: 'Finance & documents',
    helper: 'Pages for payment records, invoices, receipts, and ledgers.',
    ids: ['invoices', 'receipts', 'settlement', 'donor-management', 'funds-ledger'],
  },
  {
    title: 'Marketing & communication',
    helper: 'Pages that help the business publish, promote, and contact people.',
    ids: ['blog', 'promo', 'gallery', 'social-links', 'bulk-messaging', 'bulk-email'],
  },
  {
    title: 'Settings',
    helper: 'Workspace setup and connections.',
    ids: ['integrations', 'account'],
  },
]

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function moduleIsEnabled(enabledModules: string[], id: string) {
  return enabledModules.length === 0 || enabledModules.includes(id)
}

function moduleSummary(enabledModules: string[]) {
  if (enabledModules.length === 0) return `${NAV_ITEMS.length} pages active`
  const count = NAV_ITEMS.filter(item => enabledModules.includes(item.id)).length
  return `${count} ${count === 1 ? 'page' : 'pages'} active`
}

function findNavItem(id: string) {
  return NAV_ITEMS.find(item => item.id === id)
}

export default function NavigationSettingsSection({ preferences, onSave, canEdit }: Props) {
  const [draft, setDraft] = useState({
    ...preferences,
    enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
    customNavItems: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ValidationError>(null)

  useEffect(() => {
    setDraft({
      ...preferences,
      enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
      customNavItems: [],
    })
  }, [preferences])

  const selectedIndustry = INDUSTRY_OPTIONS.find(option => option.value === draft.industry) ?? INDUSTRY_OPTIONS[0]

  const enabledModuleIds = useMemo(() => {
    if (draft.enabledModules.length === 0) return NAV_ITEMS.map(item => item.id)
    return uniqueList(draft.enabledModules)
  }, [draft.enabledModules])

  const enabledModulesByIndustry = useMemo(() => new Set(INDUSTRY_ENABLED_MODULE_PRESETS[draft.industry] ?? []), [draft.industry])

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      await onSave({
        ...draft,
        enabledModules: uniqueList(draft.enabledModules),
        customNavItems: [],
      })
    } finally {
      setSaving(false)
    }
  }

  const applyIndustryTemplate = (industry: Industry) => {
    setDraft(current => ({
      ...current,
      industry,
      enabledModules: uniqueList(INDUSTRY_ENABLED_MODULE_PRESETS[industry] ?? []),
      customNavItems: [],
    }))
    setError(null)
  }

  const toggleModule = (id: string) => {
    setDraft(current => {
      const currentEnabled = current.enabledModules.length === 0 ? NAV_ITEMS.map(item => item.id) : current.enabledModules
      const enabled = currentEnabled.includes(id) ? currentEnabled.filter(item => item !== id) : [...currentEnabled, id]
      return { ...current, enabledModules: uniqueList(enabled), customNavItems: [] }
    })
  }

  const resetToTemplate = () => {
    setDraft(current => ({ ...current, enabledModules: uniqueList(INDUSTRY_ENABLED_MODULE_PRESETS[current.industry] ?? []), customNavItems: [] }))
    setError(null)
  }

  const showAllPages = () => {
    setDraft(current => ({ ...current, enabledModules: NAV_ITEMS.map(item => item.id), customNavItems: [] }))
    setError(null)
  }

  const hideAllPages = () => {
    setDraft(current => ({ ...current, enabledModules: [], customNavItems: [] }))
    setError('All pages are currently hidden. You can still re-add any page from this list before saving.')
  }

  return <section aria-labelledby="account-nav-settings" className="account-overview__nav-settings">
    <div className="account-overview__section-header">
      <h2 id="account-nav-settings">Navigation settings</h2>
      <p className="account-overview__subtitle">
        Choose what appears in the sidebar, and use this page as a quick directory for tools you only need sometimes.
      </p>
    </div>

    <div className="account-overview__banner" role="note">
      <p><strong>Main sidebar stays clean.</strong> Use the checkbox to show a page in the sidebar. Use <strong>Open</strong> to launch a page quickly without adding it to the navigation.</p>
    </div>

    <div className="account-overview__form-grid">
      <label><span>Business template</span>
        <select value={draft.industry} disabled={!canEdit} onChange={event => applyIndustryTemplate(event.target.value as Industry)}>
          {INDUSTRY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="account-overview__card" role="status">
        <strong>{selectedIndustry.label}</strong>
        <p className="account-overview__hint">{selectedIndustry.helper}</p>
        <p className="account-overview__hint"><strong>{moduleSummary(enabledModuleIds)}</strong></p>
      </div>
    </div>

    <div className="account-overview__website-sync-actions">
      <button type="button" className="button button--secondary" disabled={!canEdit} onClick={resetToTemplate}>Use recommended pages</button>
      <button type="button" className="button button--secondary" disabled={!canEdit} onClick={showAllPages}>Show all pages</button>
      <button type="button" className="button button--ghost" disabled={!canEdit} onClick={hideAllPages}>Hide all pages</button>
    </div>

    <h3>Quick open</h3>
    <p className="account-overview__help-text">
      These pages are useful but do not need to sit in the sidebar every day. Open them here anytime.
    </p>
    <div className="account-overview__toggle-list">
      {QUICK_OPEN_PAGES.map(page => (
        <div key={page.id} className="account-overview__integration-key-item">
          <div>
            <strong>{page.label}</strong>
            <p className="account-overview__hint">{page.category} · {page.description}</p>
          </div>
          <Link className="button button--secondary" to={page.target}>Open</Link>
        </div>
      ))}
    </div>

    <h3>Pages in the main menu</h3>
    <p className="account-overview__help-text">
      Tick the pages this workspace should show in the sidebar. You can still open unticked pages from this directory.
    </p>

    <div className="account-overview__nav-groups">
      {PAGE_GROUPS.map(group => {
        const groupItems = group.ids.map(findNavItem).filter(Boolean) as typeof NAV_ITEMS
        if (groupItems.length === 0) return null
        return <div className="account-overview__card" key={group.title}>
          <h4>{group.title}</h4>
          <p className="account-overview__help-text">{group.helper}</p>
          <div className="account-overview__toggle-list">
            {groupItems.map(item => {
              const checked = moduleIsEnabled(draft.enabledModules, item.id)
              const recommended = enabledModulesByIndustry.has(item.id)
              return (
                <div key={item.id} className="account-overview__integration-key-item">
                  <label style={{ margin: 0, flex: 1 }}>
                    <input type="checkbox" disabled={!canEdit} checked={checked} onChange={() => toggleModule(item.id)} />
                    <span><strong>{item.label}</strong><br /><small>{PAGE_DESCRIPTIONS[item.id] ?? 'Show or hide this Sedifex page.'}</small></span>
                    {recommended ? <span className="account-overview__hint"> Recommended</span> : null}
                  </label>
                  <Link className="button button--secondary" to={item.target}>Open</Link>
                </div>
              )
            })}
          </div>
        </div>
      })}
    </div>

    {error && <p className="account-overview__error-text">{error}</p>}
    {canEdit && <button type="button" className="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save navigation settings'}</button>}
  </section>
}
