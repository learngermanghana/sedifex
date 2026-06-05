import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'

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

const STORE_SLIDE_LIMIT = 12
const SLIDE_INTERVAL_MS = 5000

function cleanText(value: unknown, max = 220) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function getNestedRecord(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function getFirstText(source: Record<string, unknown>, keys: string[], max = 220) {
  for (const key of keys) {
    const value = cleanText(source[key], max)
    if (value) return value
  }

  return ''
}

function getFirstNestedText(source: Record<string, unknown>, containers: string[], keys: string[], max = 220) {
  for (const containerKey of containers) {
    const container = getNestedRecord(source, containerKey)
    if (!container) continue
    const value = getFirstText(container, keys, max)
    if (value) return value
  }

  return ''
}

function normalizeModuleLabel(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
    .slice(0, 40)
}

function getModuleLabels(source: Record<string, unknown>) {
  const moduleKeys = ['modules', 'selectedModules', 'enabledModules', 'features', 'selectedSections']
  const labels: string[] = []

  for (const key of moduleKeys) {
    const value = source[key]
    if (!Array.isArray(value)) continue
    value.forEach(item => {
      const label = normalizeModuleLabel(item)
      if (label && !labels.includes(label)) labels.push(label)
    })
  }

  if (labels.length) return labels.slice(0, 3)

  const businessType = getFirstText(source, ['businessType', 'category', 'industry', 'type'], 80).toLowerCase()
  if (/beauty|spa|salon|barber|appointment|booking/.test(businessType)) {
    return ['Bookings', 'Services', 'Payments']
  }
  if (/school|academy|course|training|education/.test(businessType)) {
    return ['Courses', 'Students', 'Payments']
  }
  if (/travel|visa|consult/.test(businessType)) {
    return ['Bookings', 'Invoices', 'Customers']
  }

  return ['Sales', 'Inventory', 'Payments']
}

function mapStoreSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): BusinessCardData | null {
  const source = snapshot.data() || {}

  if (source.hiddenOnLanding === true || source.showOnLanding === false || source.status === 'deleted') {
    return null
  }

  const nestedContainers = ['profile', 'businessProfile', 'storeProfile', 'publicProfile', 'websiteSettings']
  const name =
    getFirstText(source, ['name', 'storeName', 'businessName', 'companyName', 'company', 'displayName']) ||
    getFirstNestedText(source, nestedContainers, ['name', 'storeName', 'businessName', 'companyName', 'company', 'displayName'])

  if (!name) return null

  const category =
    getFirstText(source, ['businessType', 'category', 'industry', 'storeType', 'type'], 100) ||
    getFirstNestedText(source, nestedContainers, ['businessType', 'category', 'industry', 'storeType', 'type'], 100) ||
    undefined

  const location =
    getFirstText(source, ['location', 'city', 'area', 'address', 'branchName'], 140) ||
    getFirstNestedText(source, nestedContainers, ['location', 'city', 'area', 'address', 'branchName'], 140) ||
    undefined

  const logoUrl =
    getFirstText(source, ['logoUrl', 'logoURL', 'logo', 'photoUrl', 'imageUrl', 'brandLogoUrl'], 900) ||
    getFirstNestedText(source, nestedContainers, ['logoUrl', 'logoURL', 'logo', 'photoUrl', 'imageUrl', 'brandLogoUrl'], 900) ||
    undefined

  return {
    id: snapshot.id,
    name,
    category,
    location,
    modules: getModuleLabels(source),
    logoUrl,
  }
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'S'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function BusinessLogo({ business }: { business: BusinessCardData }) {
  const [shouldUsePlaceholder, setShouldUsePlaceholder] = useState(!business.logoUrl)
  const initials = getInitials(business.name)

  useEffect(() => {
    setShouldUsePlaceholder(!business.logoUrl)
  }, [business.logoUrl])

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
    <article className="used-businesses__card" aria-label={`Sedifex store: ${business.name}`}>
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
  const [businesses, setBusinesses] = useState<BusinessCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadBusinesses() {
      setLoading(true)
      setError(null)

      try {
        const storesQuery = query(collection(db, 'stores'), limit(STORE_SLIDE_LIMIT))
        const snapshot = await getDocs(storesQuery)
        if (cancelled) return

        const rows = snapshot.docs
          .map(mapStoreSnapshot)
          .filter((business): business is BusinessCardData => Boolean(business))

        setBusinesses(rows)
        setActiveIndex(0)
      } catch (err) {
        if (!cancelled) {
          console.error('[UsedByBusinesses] Failed to load stores', err)
          setError('Store list could not load right now.')
          setBusinesses([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadBusinesses()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (businesses.length < 2) return undefined

    const interval = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % businesses.length)
    }, SLIDE_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [businesses.length])

  const activeBusiness = useMemo(() => {
    if (businesses.length === 0) return null
    return businesses[activeIndex % businesses.length]
  }, [activeIndex, businesses])

  function showPreviousStore() {
    setActiveIndex(current => (current - 1 + businesses.length) % businesses.length)
  }

  function showNextStore() {
    setActiveIndex(current => (current + 1) % businesses.length)
  }

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
          This section now uses real store records from Firestore and shows one business at a time,
          so every signed-up business looks organized even when their logo is missing or inconsistent.
        </p>
      </header>

      <div className="used-businesses__grid" aria-live="polite">
        {loading && <p className="used-businesses__modules">Loading signed-up stores…</p>}
        {!loading && error && <p className="used-businesses__modules">{error}</p>}
        {!loading && !error && !activeBusiness && (
          <p className="used-businesses__modules">No signed-up stores are ready to show yet.</p>
        )}
        {!loading && !error && activeBusiness && <BusinessCard key={activeBusiness.id} business={activeBusiness} />}
      </div>

      {businesses.length > 1 && (
        <div
          aria-label="Store slider controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={showPreviousStore}
            aria-label="Show previous store"
            style={{ width: 'auto', minWidth: 118 }}
          >
            Previous
          </button>
          <span className="used-businesses__meta" aria-label={`Store ${activeIndex + 1} of ${businesses.length}`}>
            {activeIndex + 1} / {businesses.length}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={showNextStore}
            aria-label="Show next store"
            style={{ width: 'auto', minWidth: 118 }}
          >
            Next
          </button>
        </div>
      )}

      <div className="used-businesses__cta">
        <button type="button" className="primary-button used-businesses__cta-button" onClick={onCtaClick}>
          Join businesses using Sedifex
        </button>
      </div>
    </section>
  )
}
