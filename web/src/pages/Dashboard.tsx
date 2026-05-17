// web/src/pages/Dashboard.tsx
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useStorePreferences } from '../hooks/useStorePreferences'
import { useMemberships } from '../hooks/useMemberships'
import type { Industry } from '../config/navigation'

type DashboardCard = {
  id: string
  title: string
  description: string
  href: string
  eyebrow: string
  action: string
}

type DashboardProfile = {
  eyebrow: string
  title: string
  subtitle: string
  defaultModules: string[]
}

type PrimaryMetric = {
  id: string
  label: string
  value: string
  hint: string
}

type PrimaryMetricValue = {
  id: string
  label: string
  value: number
  hint: string
}

const moduleRegistry: Record<string, DashboardCard> = {
  products: {
    id: 'products',
    title: 'Items',
    description: 'Manage inventory, products, services, prices, categories, and images.',
    href: '/products',
    eyebrow: 'Inventory',
    action: 'Manage items',
  },
  sell: {
    id: 'sell',
    title: 'Sell',
    description: 'Record sales, generate receipts, and keep daily store activity moving.',
    href: '/sell',
    eyebrow: 'POS',
    action: 'Start selling',
  },
  customers: {
    id: 'customers',
    title: 'Customers',
    description: 'Keep customer, donor, student, or traveler contacts and follow-up details organized.',
    href: '/customers',
    eyebrow: 'CRM',
    action: 'View records',
  },
  bookings: {
    id: 'bookings',
    title: 'Bookings',
    description: 'Manage appointment, service, trip, class, or booking requests in one place.',
    href: '/bookings',
    eyebrow: 'Bookings',
    action: 'Open bookings',
  },
  'student-registration': {
    id: 'student-registration',
    title: 'Student registrations',
    description: 'Review website registrations and add walk-in students manually.',
    href: '/student-registration',
    eyebrow: 'Admissions',
    action: 'Open registrations',
  },
  'upcoming-events': {
    id: 'upcoming-events',
    title: 'Upcoming events',
    description: 'Create public classes, campaigns, trips, sessions, capacity limits, and photos.',
    href: '/upcoming-events',
    eyebrow: 'Schedule',
    action: 'Manage events',
  },
  volunteers: {
    id: 'volunteers',
    title: 'Volunteers',
    description: 'Track volunteer applications, skills, availability, and follow-up status.',
    href: '/volunteers',
    eyebrow: 'People',
    action: 'Open volunteers',
  },
  'support-requests': {
    id: 'support-requests',
    title: 'Support requests',
    description: 'Review people asking for assistance and organize the response pipeline.',
    href: '/support-requests',
    eyebrow: 'Intake',
    action: 'View requests',
  },
  'funds-ledger': {
    id: 'funds-ledger',
    title: 'Funds ledger',
    description: 'Track donor funds, inflows, outflows, projects, and remaining balances.',
    href: '/funds-ledger',
    eyebrow: 'Finance',
    action: 'Open ledger',
  },
  settlement: {
    id: 'settlement',
    title: 'Payments / Settlement',
    description: 'Add account details for online checkout payment split and settlement.',
    href: '/settlement',
    eyebrow: 'Payments',
    action: 'Set up settlement',
  },
  blog: {
    id: 'blog',
    title: 'Blog',
    description: 'Create updates, announcements, and public posts for your audience.',
    href: '/blog',
    eyebrow: 'Content',
    action: 'Open blog',
  },
  'bulk-messaging': {
    id: 'bulk-messaging',
    title: 'SMS',
    description: 'Send SMS updates to customers, students, volunteers, or donors.',
    href: '/bulk-messaging',
    eyebrow: 'Messaging',
    action: 'Open SMS',
  },
  'bulk-email': {
    id: 'bulk-email',
    title: 'Bulk email',
    description: 'Send email campaigns and announcements from your workspace.',
    href: '/bulk-email',
    eyebrow: 'Email',
    action: 'Open email',
  },
  'donor-management': {
    id: 'donor-management',
    title: 'Donor management',
    description: 'Track donor or supporter activity and program expenses.',
    href: '/donor-management',
    eyebrow: 'Donors',
    action: 'Open donors',
  },
  'marketplace-orders': {
    id: 'marketplace-orders',
    title: 'Online orders',
    description: 'Track upcoming orders and website-received orders from Sedifex Market, public pages, and connected sites.',
    href: '/marketplace-orders',
    eyebrow: 'Orders',
    action: 'View online orders',
  },
  'public-page': {
    id: 'public-page',
    title: 'Public page',
    description: 'Manage your public Sedifex page, gallery, promo, and visibility content.',
    href: '/public-page',
    eyebrow: 'Public profile',
    action: 'Edit page',
  },
}

const industryProfiles: Record<Industry, DashboardProfile> = {
  school: {
    eyebrow: 'School workspace',
    title: 'Run admissions, classes, bookings, and payment setup from one focused dashboard.',
    subtitle:
      'Your school home starts with student registrations, upcoming classes, bookings, and settlement. Add selling or inventory if your school also sells kits or products.',
    defaultModules: ['student-registration', 'upcoming-events', 'bookings', 'settlement'],
  },
  ngo: {
    eyebrow: 'NGO workspace',
    title: 'Manage volunteers, support requests, funds, and campaigns without the clutter.',
    subtitle:
      'Your NGO home prioritizes people, campaigns, and fund accountability. Add inventory, selling, or bookings when your NGO also sells items or takes appointments.',
    defaultModules: ['volunteers', 'support-requests', 'funds-ledger', 'upcoming-events'],
  },
  shop: {
    eyebrow: 'Shop workspace',
    title: 'Keep inventory, selling, customers, bookings, and settlement close to the front.',
    subtitle:
      'Your shop home focuses on daily work. You can add bookings when you also take appointments or service reservations.',
    defaultModules: ['products', 'sell', 'customers', 'marketplace-orders', 'settlement'],
  },
  travel: {
    eyebrow: 'Travel workspace',
    title: 'Organize trips, travelers, bookings, and payment setup from one place.',
    subtitle:
      'Your travel home keeps the booking flow simple: trips, traveler records, upcoming schedules, and settlement.',
    defaultModules: ['bookings', 'upcoming-events', 'customers', 'settlement'],
  },
}

const optionalModuleIds = [
  'products',
  'sell',
  'customers',
  'bookings',
  'student-registration',
  'upcoming-events',
  'volunteers',
  'support-requests',
  'funds-ledger',
  'settlement',
  'blog',
  'bulk-messaging',
  'bulk-email',
  'donor-management',
  'marketplace-orders',
  'public-page',
]

const primaryMetricOptions: Array<{ id: string; label: string }> = [
  { id: 'internal-sales', label: 'Internal sales today' },
  { id: 'online-orders', label: 'Online orders today' },
  { id: 'bookings', label: 'Bookings today' },
  { id: 'volunteers', label: 'Volunteers today' },
  { id: 'student-registrations', label: 'Student registrations today' },
  { id: 'blog-posts', label: 'New blog posts today' },
]

const defaultPrimaryMetricIds = primaryMetricOptions.map(option => option.id)

const pageStyle = { display: 'grid', gap: 20 }
const heroStyle = {
  borderRadius: 28,
  padding: '28px 30px',
  background: 'linear-gradient(135deg, #111827 0%, #312E81 52%, #2563EB 100%)',
  color: '#FFFFFF',
  boxShadow: '0 30px 80px -50px rgba(17, 24, 39, 0.9)',
}
const cardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 16,
}
const cardStyle = {
  display: 'grid',
  gap: 10,
  alignContent: 'space-between',
  minHeight: 220,
  borderRadius: 24,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  padding: 20,
  boxShadow: '0 24px 60px -46px rgba(15, 23, 42, 0.65)',
  textDecoration: 'none',
  color: '#0f172a',
}
const panelStyle = {
  borderRadius: 22,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  padding: 18,
  color: '#475569',
  lineHeight: 1.6,
}

function cardAccent(index: number) {
  const accents = ['#4f46e5', '#059669', '#d97706', '#7c3aed']
  return accents[index % accents.length]
}

function uniqueModules(moduleIds: string[]) {
  return [...new Set(moduleIds)].filter(id => moduleRegistry[id])
}

function uniquePrimaryMetrics(metricIds: string[]) {
  const allowed = new Set(primaryMetricOptions.map(option => option.id))
  return [...new Set(metricIds)].filter(id => allowed.has(id))
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function Dashboard() {
  const { storeId } = useActiveStore()
  const { memberships } = useMemberships()
  const { preferences, loading, updatePreferences } = useStorePreferences(storeId ?? null)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const industry = preferences.navigation.industry
  const profile = industryProfiles[industry] ?? industryProfiles.shop
  const currentMembership = useMemo(
    () => memberships.find(membership => membership.storeId === storeId) ?? null,
    [memberships, storeId],
  )
  const canCustomize = currentMembership?.role === 'owner'
  const selectedModuleIds = uniqueModules(
    preferences.navigation.dashboardModules.length > 0
      ? preferences.navigation.dashboardModules
      : profile.defaultModules,
  )
  const selectedPrimaryMetricIds = uniquePrimaryMetrics(
    preferences.navigation.primaryMetrics.length > 0
      ? preferences.navigation.primaryMetrics
      : defaultPrimaryMetricIds,
  )
  const cards = selectedModuleIds.map(id => moduleRegistry[id])
  const [primaryMetricMap, setPrimaryMetricMap] = useState<Record<string, PrimaryMetricValue>>({})

  useEffect(() => {
    if (!storeId) {
      setPrimaryMetricMap({})
      return undefined
    }

    const createdAtCutoff = startOfToday()
    const unsubscribers = [
      onSnapshot(query(collection(db, 'sales'), where('storeId', '==', storeId), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          'internal-sales': { id: 'internal-sales', label: 'Internal sales today', value: snapshot.size, hint: 'Recorded in Sell (POS)' },
        }))
      }),
      onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          'online-orders': { id: 'online-orders', label: 'Online orders today', value: snapshot.size, hint: 'From Sedifex Market and websites' },
        }))
      }),
      onSnapshot(query(collection(db, 'stores', storeId, 'integrationBookings'), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          bookings: { id: 'bookings', label: 'Bookings today', value: snapshot.size, hint: 'New booking entries' },
        }))
      }),
      onSnapshot(query(collection(db, 'volunteer_applications'), where('storeId', '==', storeId), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          volunteers: { id: 'volunteers', label: 'Volunteers today', value: snapshot.size, hint: 'New volunteer applications' },
        }))
      }),
      onSnapshot(query(collection(db, 'student_registrations'), where('storeId', '==', storeId), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          'student-registrations': { id: 'student-registrations', label: 'Student registrations today', value: snapshot.size, hint: 'New registrations submitted' },
        }))
      }),
      onSnapshot(query(collection(db, 'blogPosts'), where('storeId', '==', storeId), where('createdAt', '>=', createdAtCutoff)), snapshot => {
        setPrimaryMetricMap(current => ({
          ...current,
          'blog-posts': { id: 'blog-posts', label: 'New blog posts today', value: snapshot.size, hint: 'Published or drafted today' },
        }))
      }),
    ]

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [storeId])

  const primaryMetrics: PrimaryMetric[] = selectedPrimaryMetricIds.map(metricId => {
    const metric = primaryMetricMap[metricId]
    return {
      id: metricId,
      label: metric?.label ?? primaryMetricOptions.find(option => option.id === metricId)?.label ?? metricId,
      value: String(metric?.value ?? 0),
      hint: metric?.hint ?? 'Daily primary metric',
    }
  })

  async function saveDashboardModules(nextModules: string[]) {
    setIsSaving(true)
    try {
      await updatePreferences({
        navigation: {
          ...preferences.navigation,
          dashboardModules: uniqueModules(nextModules),
        },
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleModule(moduleId: string) {
    const nextModules = selectedModuleIds.includes(moduleId)
      ? selectedModuleIds.filter(id => id !== moduleId)
      : [...selectedModuleIds, moduleId]
    await saveDashboardModules(nextModules)
  }

  async function resetDashboardModules() {
    await saveDashboardModules([])
  }

  async function savePrimaryMetrics(nextMetrics: string[]) {
    setIsSaving(true)
    try {
      await updatePreferences({
        navigation: {
          ...preferences.navigation,
          primaryMetrics: uniquePrimaryMetrics(nextMetrics),
        },
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function togglePrimaryMetric(metricId: string) {
    const nextMetrics = selectedPrimaryMetricIds.includes(metricId)
      ? selectedPrimaryMetricIds.filter(id => id !== metricId)
      : [...selectedPrimaryMetricIds, metricId]
    await savePrimaryMetrics(nextMetrics)
  }

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.78)',
            fontWeight: 800,
          }}
        >
          Dashboard · {loading ? 'Loading workspace' : profile.eyebrow}
        </p>
        <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05 }}>
          {profile.title}
        </h1>
        <p style={{ margin: 0, maxWidth: 920, color: 'rgba(255,255,255,0.84)', lineHeight: 1.65 }}>
          {profile.subtitle}
        </p>
        {canCustomize ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setIsCustomizing(current => !current)}
            style={{ marginTop: 18, background: 'rgba(255,255,255,0.14)', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
          >
            {isCustomizing ? 'Close customization' : 'Customize dashboard'}
          </button>
        ) : null}
      </section>

      {isCustomizing && canCustomize ? (
        <section style={panelStyle} aria-label="Customize dashboard modules">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', color: '#0f172a' }}>Choose what appears on your dashboard</h2>
              <p style={{ margin: 0 }}>Your business can mix modules. For example, a school can also show Items, Sell, Customers, and Bookings.</p>
            </div>
            <button type="button" className="button button--secondary" disabled={isSaving} onClick={() => void resetDashboardModules()}>
              Reset to {industry} default
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 16 }}>
            {optionalModuleIds.map(moduleId => {
              const card = moduleRegistry[moduleId]
              const checked = selectedModuleIds.includes(moduleId)
              return (
                <label
                  key={moduleId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    border: checked ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                    borderRadius: 16,
                    background: checked ? '#eef2ff' : '#fff',
                    padding: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isSaving}
                    onChange={() => void toggleModule(moduleId)}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong style={{ display: 'block', color: '#0f172a' }}>{card.title}</strong>
                    <span style={{ display: 'block', fontSize: 13, color: '#64748b' }}>{card.eyebrow}</span>
                  </span>
                </label>
              )
            })}
          </div>

          <h3 style={{ margin: '18px 0 8px', color: '#0f172a' }}>Primary metrics on top</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {primaryMetricOptions.map(metric => {
              const checked = selectedPrimaryMetricIds.includes(metric.id)
              return (
                <label
                  key={metric.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    border: checked ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                    borderRadius: 16,
                    background: checked ? '#eef2ff' : '#fff',
                    padding: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={checked} disabled={isSaving} onChange={() => void togglePrimaryMetric(metric.id)} style={{ marginTop: 4 }} />
                  <span>
                    <strong style={{ display: 'block', color: '#0f172a' }}>{metric.label}</strong>
                    <span style={{ display: 'block', fontSize: 13, color: '#64748b' }}>Primary KPI card</span>
                  </span>
                </label>
              )
            })}
          </div>
        </section>
      ) : null}

      <section aria-label="Primary metrics" style={cardGridStyle}>
        {primaryMetrics.map((metric, index) => (
          <article key={metric.id} style={{ ...cardStyle, minHeight: 140, borderTop: `5px solid ${cardAccent(index)}` }}>
            <p style={{ margin: 0, color: cardAccent(index), fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Primary metric
            </p>
            <h2 style={{ margin: '8px 0 4px', fontSize: 30, letterSpacing: '-0.03em' }}>{metric.value}</h2>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#0f172a' }}>{metric.label}</p>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>{metric.hint}</p>
          </article>
        ))}
      </section>

      <section aria-label="Recommended workspace actions" style={cardGridStyle}>
        {cards.map((card, index) => (
          <Link key={card.id} to={card.href} style={{ ...cardStyle, borderTop: `5px solid ${cardAccent(index)}` }}>
            <div>
              <p
                style={{
                  margin: 0,
                  color: cardAccent(index),
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {card.eyebrow}
              </p>
              <h2 style={{ margin: '8px 0 6px', fontSize: 22, letterSpacing: '-0.03em' }}>{card.title}</h2>
              <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6 }}>{card.description}</p>
            </div>
            <span style={{ fontWeight: 900, color: cardAccent(index) }}>{card.action} →</span>
          </Link>
        ))}
      </section>

      <section style={panelStyle}>
        <strong style={{ color: '#0f172a' }}>Workspace type:</strong> {industry}. Your dashboard can still show other modules, including Bookings, Items, Sell, and Customers.
      </section>
    </div>
  )
}
