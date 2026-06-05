import { useState } from 'react'

type BusinessCardData = {
  id: string
  name: string
  category?: string
  location?: string
  modules: string[]
  logoUrl?: string
}

type UsedByBusinessesProps = {
  onCtaClick: () => void
}

function svgLogoDataUrl(label: string, accent: string, background: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="38" fill="${background}"/><circle cx="118" cy="42" r="24" fill="${accent}" opacity="0.18"/><path d="M36 102c18-38 42-58 72-60 11-.8 19 7 17 18-4 28-26 50-63 64-18 7-34-5-26-22Z" fill="${accent}" opacity="0.92"/><text x="80" y="92" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="900" fill="white">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const sampleBusinesses: BusinessCardData[] = [
  {
    id: 'ama-fresh-mart',
    name: 'Ama Fresh Mart',
    category: 'Grocery & provisions',
    location: 'Kumasi, Ghana',
    modules: ['Inventory', 'Sales', 'Payments'],
    logoUrl: svgLogoDataUrl('AF', '#06b6d4', '#0f172a'),
  },
  {
    id: 'northstar-beauty-studio',
    name: 'Northstar Beauty Studio',
    category: 'Salon & appointments',
    location: 'Accra, Ghana',
    modules: ['Bookings', 'Customers', 'Payments'],
  },
  {
    id: 'kente-lane-boutique',
    name: 'Kente Lane Boutique',
    category: 'Fashion retail',
    location: 'East Legon',
    modules: ['Inventory', 'Website', 'Sales'],
    logoUrl: svgLogoDataUrl('KL', '#8b5cf6', '#1e1b4b'),
  },
  {
    id: 'cedar-scholars-academy',
    name: 'Cedar Scholars Academy',
    category: 'Training school',
    location: 'Tema, Ghana',
    modules: ['Students', 'Registrations', 'Payments'],
  },
  {
    id: 'urbanbite-kitchen',
    name: 'UrbanBite Kitchen',
    category: 'Food service',
    location: 'Osu, Accra',
    modules: ['Sales', 'Quick Pay', 'Customers'],
    logoUrl: '/missing-urbanbite-logo.png',
  },
  {
    id: 'noble-care-pharmacy',
    name: 'Noble Care Pharmacy',
    category: 'Health retail',
    location: 'Takoradi',
    modules: ['Inventory', 'Receipts', 'Reports'],
  },
  {
    id: 'bluepath-travel',
    name: 'BluePath Travel',
    category: 'Travel services',
    location: 'Spintex, Accra',
    modules: ['Bookings', 'Invoices', 'Customers'],
    logoUrl: svgLogoDataUrl('BP', '#0ea5e9', '#172554'),
  },
  {
    id: 'hopebridge-foundation',
    name: 'HopeBridge Foundation',
    category: 'Nonprofit operations',
    location: 'Cape Coast',
    modules: ['Donors', 'Funds', 'Reports'],
  },
]

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'S'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function BusinessLogo({ business }: { business: BusinessCardData }) {
  const [shouldUsePlaceholder, setShouldUsePlaceholder] = useState(!business.logoUrl)
  const initials = getInitials(business.name)

  if (shouldUsePlaceholder || !business.logoUrl) {
    return (
      <div className="used-businesses__logo used-businesses__logo--placeholder" aria-hidden="true">
        {initials}
      </div>
    )
  }

  return (
    <div className="used-businesses__logo" aria-hidden="true">
      <img
        src={business.logoUrl}
        alt=""
        loading="lazy"
        onError={() => setShouldUsePlaceholder(true)}
        onLoad={event => {
          const image = event.currentTarget
          if (image.naturalWidth < 56 || image.naturalHeight < 56) {
            setShouldUsePlaceholder(true)
          }
        }}
      />
    </div>
  )
}

function BusinessCard({ business }: { business: BusinessCardData }) {
  return (
    <article className="used-businesses__card">
      <div className="used-businesses__card-header">
        <BusinessLogo business={business} />
        <span className="used-businesses__badge">Sedifex Store</span>
      </div>
      <div className="used-businesses__card-copy">
        <h3>{business.name}</h3>
        {(business.category || business.location) && (
          <p className="used-businesses__meta">
            {business.category && <span>{business.category}</span>}
            {business.category && business.location && <span aria-hidden="true">•</span>}
            {business.location && <span>{business.location}</span>}
          </p>
        )}
        <p className="used-businesses__modules">{business.modules.join(' • ')}</p>
      </div>
    </article>
  )
}

export default function UsedByBusinesses({ onCtaClick }: UsedByBusinessesProps) {
  return (
    <section className="used-businesses" aria-labelledby="used-businesses-title">
      <header className="used-businesses__header">
        <span className="app__pill">Trusted by stores</span>
        <h2 id="used-businesses-title">Used by growing businesses</h2>
        <p>
          Stores, service providers, and brands are already using Sedifex to manage sales,
          inventory, bookings, payments, and customer operations.
        </p>
        <p className="used-businesses__purpose">
          This section is designed to make every signed-up business look organized and professional,
          even when their uploaded logo is missing, inconsistent, or not homepage-ready.
        </p>
      </header>

      <div className="used-businesses__grid">
        {sampleBusinesses.map(business => (
          <BusinessCard key={business.id} business={business} />
        ))}
      </div>

      <div className="used-businesses__cta">
        <button type="button" className="primary-button used-businesses__cta-button" onClick={onCtaClick}>
          Join businesses using Sedifex
        </button>
      </div>
    </section>
  )
}
