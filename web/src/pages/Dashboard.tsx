// web/src/pages/Dashboard.tsx
import { Link } from 'react-router-dom'
import { useActiveStore } from '../hooks/useActiveStore'
import { useStorePreferences } from '../hooks/useStorePreferences'
import type { Industry } from '../config/navigation'

type DashboardCard = {
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
  cards: DashboardCard[]
}

const industryProfiles: Record<Industry, DashboardProfile> = {
  school: {
    eyebrow: 'School workspace',
    title: 'Run admissions, classes, and payment setup from one focused dashboard.',
    subtitle:
      'Your school home highlights the tools you need most: student registrations, upcoming classes, and settlement setup.',
    cards: [
      {
        title: 'Student registrations',
        description: 'Review website registrations and add walk-in students manually.',
        href: '/student-registration',
        eyebrow: 'Admissions',
        action: 'Open registrations',
      },
      {
        title: 'Upcoming classes',
        description: 'Create public class dates, intakes, capacity limits, and photos for your website.',
        href: '/upcoming-events',
        eyebrow: 'Schedule',
        action: 'Manage classes',
      },
      {
        title: 'Payments',
        description: 'Add settlement details so online payments can split correctly to your account.',
        href: '/settlement',
        eyebrow: 'Settlement',
        action: 'Set up payments',
      },
    ],
  },
  ngo: {
    eyebrow: 'NGO workspace',
    title: 'Manage volunteers, support requests, funds, and campaigns without the clutter.',
    subtitle:
      'Your NGO home prioritizes people, campaigns, and fund accountability instead of shop-first screens.',
    cards: [
      {
        title: 'Volunteers',
        description: 'Track volunteer applications, skills, availability, and follow-up status.',
        href: '/volunteers',
        eyebrow: 'People',
        action: 'Open volunteers',
      },
      {
        title: 'Support requests',
        description: 'Review people asking for assistance and organize the response pipeline.',
        href: '/support-requests',
        eyebrow: 'Intake',
        action: 'View requests',
      },
      {
        title: 'Funds ledger',
        description: 'Track donor funds, inflows, outflows, projects, and remaining balances.',
        href: '/funds-ledger',
        eyebrow: 'Finance',
        action: 'Open ledger',
      },
      {
        title: 'Campaigns',
        description: 'Create upcoming campaigns or public events that your website can display.',
        href: '/upcoming-events',
        eyebrow: 'Programs',
        action: 'Manage campaigns',
      },
    ],
  },
  shop: {
    eyebrow: 'Shop workspace',
    title: 'Keep inventory, selling, customers, and settlement close to the front.',
    subtitle:
      'Your shop home focuses on the daily flow: manage items, sell quickly, follow customers, and set up payment settlement.',
    cards: [
      {
        title: 'Items',
        description: 'Manage store inventory, products, services, prices, categories, and images.',
        href: '/products',
        eyebrow: 'Inventory',
        action: 'Manage items',
      },
      {
        title: 'Sell',
        description: 'Record sales, generate receipts, and keep the store moving.',
        href: '/sell',
        eyebrow: 'POS',
        action: 'Start selling',
      },
      {
        title: 'Customers',
        description: 'Keep customer records, contacts, and follow-up information organized.',
        href: '/customers',
        eyebrow: 'CRM',
        action: 'View customers',
      },
      {
        title: 'Settlement',
        description: 'Add account details for online checkout payment split and settlement.',
        href: '/settlement',
        eyebrow: 'Payments',
        action: 'Set up settlement',
      },
    ],
  },
  travel: {
    eyebrow: 'Travel workspace',
    title: 'Organize trips, travelers, bookings, and payment setup from one place.',
    subtitle:
      'Your travel home keeps the booking flow simple: trips, traveler records, upcoming schedules, and settlement.',
    cards: [
      {
        title: 'Trips',
        description: 'Manage bookings, trip requests, and travel service records.',
        href: '/bookings',
        eyebrow: 'Bookings',
        action: 'Open trips',
      },
      {
        title: 'Upcoming trips',
        description: 'Create public trip dates, seats, availability, and photos for your website.',
        href: '/upcoming-events',
        eyebrow: 'Schedule',
        action: 'Manage trips',
      },
      {
        title: 'Travelers',
        description: 'Keep traveler contacts and customer follow-up details organized.',
        href: '/customers',
        eyebrow: 'Customers',
        action: 'View travelers',
      },
      {
        title: 'Settlement',
        description: 'Add account details for online checkout payment split and settlement.',
        href: '/settlement',
        eyebrow: 'Payments',
        action: 'Set up settlement',
      },
    ],
  },
}

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

function cardAccent(index: number) {
  const accents = ['#4f46e5', '#059669', '#d97706', '#7c3aed']
  return accents[index % accents.length]
}

export default function Dashboard() {
  const { storeId } = useActiveStore()
  const { preferences, loading } = useStorePreferences(storeId ?? null)
  const industry = preferences.navigation.industry
  const profile = industryProfiles[industry] ?? industryProfiles.shop

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
      </section>

      <section aria-label="Recommended workspace actions" style={cardGridStyle}>
        {profile.cards.map((card, index) => (
          <Link key={card.href} to={card.href} style={{ ...cardStyle, borderTop: `5px solid ${cardAccent(index)}` }}>
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

      <section
        style={{
          borderRadius: 22,
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          padding: 18,
          color: '#475569',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: '#0f172a' }}>Workspace type:</strong> {industry}. You can adjust this from Account → Workspace navigation settings.
      </section>
    </div>
  )
}
