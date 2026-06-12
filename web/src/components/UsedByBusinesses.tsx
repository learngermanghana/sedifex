import SafeFirebaseImage from './SafeFirebaseImage'
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

const usedByBusinessesStyles = `
  .used-businesses {
    position: relative;
    width: min(1280px, 100%);
    z-index: 1;
    display: grid;
    gap: clamp(24px, 4vw, 36px);
    overflow: hidden;
    padding: clamp(24px, 5vw, 46px);
    border-radius: 34px;
    color: #f8fafc;
    background:
      radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.22), transparent 30%),
      radial-gradient(circle at 90% 4%, rgba(168, 85, 247, 0.26), transparent 30%),
      linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(20, 30, 55, 0.94) 55%, rgba(45, 31, 83, 0.92));
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 34px 90px -52px rgba(2, 6, 23, 0.95);
  }

  .used-businesses::before {
    content: "";
    position: absolute;
    inset: 1px;
    border-radius: 32px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    pointer-events: none;
  }

  .used-businesses .app__pill {
    color: #e0f2fe;
    background: rgba(14, 165, 233, 0.16);
    border-color: rgba(125, 211, 252, 0.28);
  }

  .used-businesses__header {
    position: relative;
    display: grid;
    gap: 12px;
    max-width: 920px;
  }

  .used-businesses__header h2 {
    margin: 0;
    color: #f8fafc;
    font-size: clamp(28px, 4vw, 46px);
    line-height: 1.04;
    letter-spacing: -0.045em;
  }

  .used-businesses__header p {
    margin: 0;
    max-width: 780px;
    color: #cbd5e1;
    font-size: clamp(15px, 2vw, 17px);
    line-height: 1.75;
  }

  .used-businesses__showcase {
    position: relative;
    display: grid;
    gap: 18px;
    justify-items: center;
  }

  .used-businesses__grid {
    width: min(780px, 100%);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
  }

  .used-businesses__card {
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 22px;
    min-height: 280px;
    padding: clamp(24px, 4vw, 34px);
    border-radius: 30px;
    color: #f8fafc;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06)),
      linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.9));
    border: 1px solid rgba(226, 232, 240, 0.18);
    box-shadow: 0 28px 70px -45px rgba(0, 0, 0, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .used-businesses__card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 5px;
    background: linear-gradient(90deg, var(--color-accent-start), var(--color-accent-end));
  }

  .used-businesses__card::after {
    content: "";
    position: absolute;
    right: -80px;
    bottom: -100px;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.24), transparent 66%);
    pointer-events: none;
  }

  .used-businesses__card-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .used-businesses__logo {
    width: 82px;
    height: 82px;
    flex: 0 0 82px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 26px;
    background: rgba(248, 250, 252, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.58);
    box-shadow: 0 20px 40px -26px rgba(2, 6, 23, 0.9);
  }

  .used-businesses__logo img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    padding: 12px;
  }

  .used-businesses__logo--placeholder {
    color: #f8fafc;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.08em;
    background:
      radial-gradient(circle at 25% 18%, rgba(255, 255, 255, 0.3), transparent 32%),
      linear-gradient(135deg, var(--color-accent-start), var(--color-accent-solid) 58%, var(--color-accent-end));
  }

  .used-businesses__badge {
    display: inline-flex;
    align-items: center;
    width: max-content;
    border-radius: 999px;
    padding: 8px 12px;
    color: #bae6fd;
    background: rgba(14, 165, 233, 0.14);
    border: 1px solid rgba(125, 211, 252, 0.22);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .used-businesses__card-copy {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
  }

  .used-businesses__card-copy h3 {
    margin: 0;
    color: #f8fafc;
    font-size: clamp(28px, 5vw, 44px);
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .used-businesses__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    color: #cbd5e1;
    font-size: 14px;
    font-weight: 800;
  }

  .used-businesses__modules {
    width: fit-content;
    margin: 4px 0 0;
    padding: 10px 12px;
    border-radius: 16px;
    color: #e0f2fe;
    background: rgba(15, 23, 42, 0.58);
    border: 1px solid rgba(125, 211, 252, 0.18);
    font-size: 13px;
    font-weight: 900;
  }

  .used-businesses__story {
    max-width: 580px;
    margin: 0;
    color: #cbd5e1;
    font-size: 15px;
    line-height: 1.7;
  }

  .used-businesses__card-footer {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 6px;
  }

  .used-businesses__mini-stat {
    padding: 12px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #dbeafe;
    font-size: 12px;
    font-weight: 800;
  }

  .used-businesses__slider-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .used-businesses__nav-button {
    width: auto;
    min-width: 108px;
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.72);
    color: #f8fafc;
  }

  .used-businesses__counter {
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 900;
  }

  .used-businesses__dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
  }

  .used-businesses__dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: rgba(203, 213, 225, 0.34);
    cursor: pointer;
  }

  .used-businesses__dot.is-active {
    width: 24px;
    background: linear-gradient(90deg, var(--color-accent-start), var(--color-accent-end));
  }

  .used-businesses__cta {
    display: flex;
    justify-content: center;
  }

  .used-businesses__cta-button {
    width: auto;
    min-width: min(100%, 310px);
  }

  @media (max-width: 760px) {
    .used-businesses {
      border-radius: 26px;
      padding: 22px;
    }

    .used-businesses__card {
      min-height: 0;
    }

    .used-businesses__card-footer {
      grid-template-columns: 1fr;
    }

    .used-businesses__card-header {
      align-items: center;
    }
  }
`

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
      <SafeFirebaseImage
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
        <span className="used-businesses__badge">Active workspace</span>
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
        <p className="used-businesses__story">
          Part of the growing network of businesses using Sedifex to keep daily operations,
          payments, and customer activity connected.
        </p>
        <p className="used-businesses__modules">{business.modules.join(' • ')}</p>
      </div>
      <div className="used-businesses__card-footer" aria-hidden="true">
        <span className="used-businesses__mini-stat">Connected operations</span>
        <span className="used-businesses__mini-stat">Online payments</span>
        <span className="used-businesses__mini-stat">Business visibility</span>
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
          setError('We could not load the business showcase right now.')
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
      <style>{usedByBusinessesStyles}</style>
      <header className="used-businesses__header">
        <span className="app__pill">Business showcase</span>
        <h2 id="used-businesses-title">Businesses already running on Sedifex</h2>
        <p>
          From shops and spas to service brands, Sedifex helps businesses manage sales,
          bookings, payments, inventory, websites, and customer operations from one workspace.
        </p>
      </header>

      <div className="used-businesses__showcase">
        <div className="used-businesses__grid" aria-live="polite">
          {loading && <p className="used-businesses__modules">Loading business showcase…</p>}
          {!loading && error && <p className="used-businesses__modules">{error}</p>}
          {!loading && !error && !activeBusiness && (
            <p className="used-businesses__modules">More businesses will appear here soon.</p>
          )}
          {!loading && !error && activeBusiness && <BusinessCard key={activeBusiness.id} business={activeBusiness} />}
        </div>

        {businesses.length > 1 && (
          <div className="used-businesses__slider-controls" aria-label="Store slider controls">
            <button
              type="button"
              className="secondary-button used-businesses__nav-button"
              onClick={showPreviousStore}
              aria-label="Show previous store"
            >
              Previous
            </button>
            <span className="used-businesses__counter" aria-label={`Store ${activeIndex + 1} of ${businesses.length}`}>
              {activeIndex + 1} / {businesses.length}
            </span>
            <button
              type="button"
              className="secondary-button used-businesses__nav-button"
              onClick={showNextStore}
              aria-label="Show next store"
            >
              Next
            </button>
            <div className="used-businesses__dots" aria-label="Choose a store">
              {businesses.map((business, index) => (
                <button
                  key={business.id}
                  type="button"
                  className={`used-businesses__dot${index === activeIndex ? ' is-active' : ''}`}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show ${business.name}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="used-businesses__cta">
        <button type="button" className="primary-button used-businesses__cta-button" onClick={onCtaClick}>
          Join businesses using Sedifex
        </button>
      </div>
    </section>
  )
}
