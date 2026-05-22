import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './QuickPayLanding.css'

type PublicStore = {
  storeId: string
  name: string
  logoUrl?: string | null
  city?: string | null
  phone?: string | null
  category?: string | null
}

const FUNCTION_BASE_URL =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  import.meta.env.VITE_SEDIFEX_FUNCTIONS_BASE_URL ||
  'https://us-central1-sedifex-web.cloudfunctions.net'

const QUICK_CATEGORIES = ['All', 'Products', 'Beauty', 'Food', 'Electronics', 'Fashion', 'Home']

const SAMPLE_STORES: PublicStore[] = [
  { storeId: 'demo-kwaku-lottery', name: 'Kwaku Lottery', category: 'Beauty & Wellness' },
  { storeId: 'demo-grace-bakery', name: 'Grace Bakery', category: 'Food & Beverages' },
]

function getStorePayUrl(storeId: string) {
  return `/s/${encodeURIComponent(storeId)}?mode=store`
}

function StoreAvatar({ store }: { store: PublicStore }) {
  return (
    <div className="quickpay-avatar">
      {store.logoUrl ? <img src={store.logoUrl} alt="" /> : store.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function StoreRow({ store, compact = false }: { store: PublicStore; compact?: boolean }) {
  const isDemo = store.storeId.startsWith('demo-')
  const content = (
    <>
      <StoreAvatar store={store} />
      <div className="quickpay-store-meta">
        <p className="quickpay-store-name">{store.name}</p>
        <p className="quickpay-store-category">
          {store.category || [store.city, store.phone].filter(Boolean).join(' • ') || 'Sedifex business'}
        </p>
      </div>
      {!compact ? <span className="quickpay-chevron">›</span> : null}
    </>
  )

  if (isDemo) {
    return <div className="quickpay-store-row">{content}</div>
  }

  return (
    <Link to={getStorePayUrl(store.storeId)} className="quickpay-store-row">
      {content}
    </Link>
  )
}

export default function QuickPayLanding() {
  const [query, setQuery] = useState('')
  const [stores, setStores] = useState<PublicStore[]>([])
  const [recentStores, setRecentStores] = useState<PublicStore[]>(SAMPLE_STORES)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSearch = query.trim().length >= 2

  const helperText = useMemo(() => {
    if (!query.trim()) return 'Search by store name or scan their QR code.'
    if (!canSearch) return 'Type at least 2 letters to search.'
    return status ?? 'Choose the correct business from the results.'
  }, [canSearch, query, status])

  useEffect(() => {
    if (!canSearch) {
      setStores([])
      setStatus(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStatus('Searching businesses…')
      setError(null)

      try {
        const response = await fetch(
          `${FUNCTION_BASE_URL}/publicQuickPayStores?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error(`Search failed (${response.status})`)
        const payload = await response.json() as { stores?: PublicStore[]; count?: number }
        const nextStores = Array.isArray(payload.stores) ? payload.stores : []
        setStores(nextStores)
        if (nextStores.length) setRecentStores(nextStores.slice(0, 4))
        setStatus(nextStores.length ? null : 'No business matched that name yet.')
      } catch (searchError) {
        if (controller.signal.aborted) return
        console.warn('[quick-pay] Store search failed', searchError)
        setStores([])
        setStatus(null)
        setError('Store search is not available yet. Please scan the business QR code or use their payment link.')
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canSearch, query])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stores.length === 1) window.location.href = getStorePayUrl(stores[0].storeId)
  }

  return (
    <main className="quickpay-root">
      <section className="quickpay-shell">
        <header className="quickpay-card quickpay-hero">
          <div className="quickpay-logo">
            <span>▭</span>
          </div>
          <h1 className="quickpay-title">Sedifex Quick Pay</h1>
          <p className="quickpay-subtitle">Choose a business and pay</p>
          <p className="quickpay-copy">
            Search the business you want to pay, choose the right store, then pay for products, services, or courses securely.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="quickpay-card quickpay-search-card">
          <label className="quickpay-label" htmlFor="store-search">
            Which business do you want to pay?
          </label>
          <div className="quickpay-input-shell">
            <span className="quickpay-search-icon">⌕</span>
            <input
              id="store-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Type the business name to find where you pay"
              className="quickpay-input"
            />
          </div>
          <p className="quickpay-helper">{helperText}</p>
          {error ? <p className="quickpay-error">{error}</p> : null}

          <button
            type="submit"
            className="quickpay-primary"
            disabled={stores.length !== 1}
          >
            Continue
          </button>
          <button
            type="button"
            className="quickpay-secondary"
            onClick={() => setError('Use your phone camera to scan the QR code displayed by the business.')}
          >
            ⌗ Scan QR Code
          </button>

          {stores.length > 0 ? (
            <div className="quickpay-results">
              {stores.map(store => <StoreRow key={store.storeId} store={store} />)}
            </div>
          ) : null}
        </form>

        <section className="quickpay-card quickpay-steps">
          <div>
            {[
              ['1', 'Find business', 'Search by business name or scan their QR code.'],
              ['2', 'Search item', 'Choose the product, service, or course you want.'],
              ['3', 'Pay securely', 'Your order is recorded for the business in Sedifex.'],
            ].map((step, index) => (
              <div key={step[0]} className="quickpay-step">
                <div className="quickpay-step-number-wrap">
                  <div className="quickpay-step-number">{step[0]}</div>
                  {index < 2 ? <div className="quickpay-step-line" /> : null}
                </div>
                <div className="quickpay-step-body">
                  <h2 className="quickpay-step-title">{step[1]}</h2>
                  <p className="quickpay-step-copy">{step[2]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="quickpay-chip-row">
          {QUICK_CATEGORIES.map(category => (
            <button
              key={category}
              type="button"
              className={`quickpay-chip ${category === 'All' ? 'quickpay-chip-active' : ''}`}
            >
              {category}
            </button>
          ))}
        </section>

        <section className="quickpay-popular">
          <h2 className="quickpay-section-title">Popular on Sedifex</h2>
          <div className="quickpay-popular-list">
            {recentStores.map(store => <StoreRow key={store.storeId} store={store} compact />)}
          </div>
        </section>
      </section>
    </main>
  )
}
