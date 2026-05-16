// web/src/pages/Dashboard.tsx
import MarketplaceOrders from './MarketplaceOrders'

export default function Dashboard() {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section
        style={{
          borderRadius: 24,
          padding: '24px 26px',
          background: 'linear-gradient(135deg, #111827 0%, #312E81 52%, #2563EB 100%)',
          color: '#FFFFFF',
          boxShadow: '0 30px 80px -50px rgba(17, 24, 39, 0.9)',
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
          Dashboard · Sales & online orders
        </p>
        <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05 }}>
          Your orders, payments, bookings, and customer follow-up in one place.
        </h1>
        <p style={{ margin: 0, maxWidth: 920, color: 'rgba(255,255,255,0.84)', lineHeight: 1.65 }}>
          This dashboard now works as the command center for Sedifex Market orders, client website orders,
          pay-on-delivery requests, online paid checkout, manual payment, and service bookings.
        </p>
      </section>

      <MarketplaceOrders compactHeader />
    </div>
  )
}
