// web/src/pages/Dashboard.tsx
import { Link } from 'react-router-dom'
import MarketplaceOrders from './MarketplaceOrders'

function QuickActionCard({
  title,
  description,
  href,
  tone = 'indigo',
}: {
  title: string
  description: string
  href: string
  tone?: 'indigo' | 'emerald' | 'amber'
}) {
  const palette = {
    indigo: { bg: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' },
    emerald: { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' },
    amber: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  }[tone]

  return (
    <Link
      to={href}
      style={{
        display: 'grid',
        gap: 6,
        textDecoration: 'none',
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        borderRadius: 18,
        padding: '16px 18px',
        minHeight: 110,
      }}
    >
      <strong style={{ color: palette.text, fontSize: 16 }}>{title}</strong>
      <span style={{ color: '#475569', fontSize: 13, lineHeight: 1.45 }}>{description}</span>
    </Link>
  )
}

export default function Dashboard() {
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <section
        style={{
          borderRadius: 24,
          padding: '24px 26px',
          background: 'linear-gradient(135deg, #312E81 0%, #4338CA 52%, #2563EB 100%)',
          color: '#FFFFFF',
          boxShadow: '0 30px 80px -50px rgba(49, 46, 129, 0.85)',
        }}
      >
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
          Sales & Orders Command Center
        </p>
        <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05 }}>
          Manage selling, online orders, bookings, and customer follow-up from one place.
        </h1>
        <p style={{ margin: 0, maxWidth: 860, color: 'rgba(255,255,255,0.84)', lineHeight: 1.65 }}>
          The dashboard now starts with what store owners need most: orders from Sedifex Market, client websites, pay-on-delivery, manual payment, online paid checkout, and service bookings.
        </p>
      </section>

      <section
        aria-label="Quick selling actions"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <QuickActionCard
          title="Sell in store"
          description="Open POS for walk-in sales, invoices, and daily selling."
          href="/sell"
          tone="indigo"
        />
        <QuickActionCard
          title="Manage inventory"
          description="Update products, services, stock, prices, and website availability."
          href="/products"
          tone="emerald"
        />
        <QuickActionCard
          title="Payment settlement"
          description="Set the bank or mobile money account for online checkout payouts."
          href="/settlement"
          tone="amber"
        />
      </section>

      <MarketplaceOrders />
    </div>
  )
}
