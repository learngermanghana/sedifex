import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-violet-700 text-lg font-black text-white shadow-sm">
      {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : store.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function StoreRow({ store, compact = false }: { store: PublicStore; compact?: boolean }) {
  const isDemo = store.storeId.startsWith('demo-')
  const content = (
    <>
      <StoreAvatar store={store} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-base font-black text-slate-950">{store.name}</p>
        <p className="mt-1 truncate text-sm text-slate-500">
          {store.category || [store.city, store.phone].filter(Boolean).join(' • ') || 'Sedifex business'}
        </p>
      </div>
      {!compact ? <span className="text-2xl text-slate-300">›</span> : null}
    </>
  )

  if (isDemo) {
    return <div className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">{content}</div>
  }

  return (
    <Link to={getStorePayUrl(store.storeId)} className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
    <main className="min-h-[100dvh] overflow-x-hidden bg-slate-50 text-slate-950">
      <section className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl sm:px-6">
        <header className="rounded-[2rem] bg-white px-5 py-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-violet-700 text-white shadow-lg">
            <span className="text-3xl">▭</span>
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-blue-700 sm:text-4xl">Sedifex Quick Pay</h1>
          <p className="mt-3 text-lg font-black text-slate-950">Choose a business and pay</p>
          <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate-600">
            Search the business you want to pay, choose the right store, then pay for products, services, or courses securely.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <label className="block text-xl font-black text-slate-950" htmlFor="store-search">
            Which business do you want to pay?
          </label>
          <div className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <span className="text-2xl text-slate-400">⌕</span>
            <input
              id="store-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Type the business name to find where you pay"
              className="min-w-0 flex-1 bg-transparent py-4 text-base font-medium text-slate-950 outline-none placeholder:text-slate-400"
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">{helperText}</p>
          {error ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p> : null}

          <button
            type="submit"
            className="mt-4 min-h-14 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-3 text-base font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={stores.length !== 1}
          >
            Continue
          </button>
          <button
            type="button"
            className="mt-3 min-h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-black text-slate-950"
            onClick={() => setError('Use your phone camera to scan the QR code displayed by the business.')}
          >
            ⌗ Scan QR Code
          </button>

          {stores.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {stores.map(store => <StoreRow key={store.storeId} store={store} />)}
            </div>
          ) : null}
        </form>

        <section className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="space-y-0">
            {[
              ['1', 'Find business', 'Search by business name or scan their QR code.'],
              ['2', 'Search item', 'Choose the product, service, or course you want.'],
              ['3', 'Pay securely', 'Your order is recorded for the business in Sedifex.'],
            ].map((step, index) => (
              <div key={step[0]} className="grid grid-cols-[3rem_1fr] gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-700 text-lg font-black text-white">
                    {step[0]}
                  </div>
                  {index < 2 ? <div className="h-14 w-px bg-slate-200" /> : null}
                </div>
                <div className="pb-6">
                  <h2 className="text-xl font-black text-slate-950">{step[1]}</h2>
                  <p className="mt-2 text-base leading-7 text-slate-600">{step[2]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {QUICK_CATEGORIES.map(category => (
              <button
                key={category}
                type="button"
                className={`shrink-0 rounded-2xl border px-5 py-3 text-sm font-bold ${category === 'All' ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 pb-8">
          <h2 className="text-2xl font-black text-slate-950">Popular on Sedifex</h2>
          <div className="mt-4 grid gap-3">
            {recentStores.map(store => <StoreRow key={store.storeId} store={store} compact />)}
          </div>
        </section>
      </section>
    </main>
  )
}
