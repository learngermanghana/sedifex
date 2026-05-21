import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type PublicStore = {
  storeId: string
  name: string
  logoUrl?: string | null
  city?: string | null
  phone?: string | null
}

const FUNCTION_BASE_URL =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  import.meta.env.VITE_SEDIFEX_FUNCTIONS_BASE_URL ||
  'https://us-central1-sedifex-web.cloudfunctions.net'

function getStorePayUrl(storeId: string) {
  return `/s/${encodeURIComponent(storeId)}?mode=store`
}

export default function QuickPayLanding() {
  const [query, setQuery] = useState('')
  const [stores, setStores] = useState<PublicStore[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSearch = query.trim().length >= 2

  const helperText = useMemo(() => {
    if (!query.trim()) return 'Type the business name to find where you want to pay.'
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
      setStatus('Searching Sedifex businesses…')
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
    if (stores.length === 1) {
      window.location.href = getStorePayUrl(stores[0].storeId)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 to-cyan-300 text-3xl font-black text-white shadow-2xl">
          Sx
        </div>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Sedifex Quick Pay</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Choose a business and pay</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          Search the business you want to pay, choose the right store, then pay for products, services, or courses securely.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/10 p-4 text-left shadow-2xl backdrop-blur sm:p-6">
          <label className="block text-sm font-semibold text-cyan-100" htmlFor="store-search">
            Which business do you want to pay?
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="store-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Example: Glittering Med Spa"
              className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200"
            />
            <button
              type="submit"
              className="rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={stores.length !== 1}
            >
              Continue
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-300">{helperText}</p>
          {error ? <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}

          {stores.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {stores.map(store => (
                <Link
                  key={store.storeId}
                  to={getStorePayUrl(store.storeId)}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white p-4 text-slate-950 transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-lg font-black text-white">
                    {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : store.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black">{store.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {[store.city, store.phone].filter(Boolean).join(' • ') || 'Sedifex business'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">Pay</span>
                </Link>
              ))}
            </div>
          ) : null}
        </form>

        <div className="mt-8 grid gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-left shadow-2xl sm:grid-cols-3">
          <div>
            <p className="text-2xl font-black text-cyan-200">1</p>
            <h2 className="mt-2 font-bold">Find business</h2>
            <p className="mt-1 text-sm text-slate-300">Search by business name or scan their QR code.</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-200">2</p>
            <h2 className="mt-2 font-bold">Search item</h2>
            <p className="mt-1 text-sm text-slate-300">Choose the product, service, or course you want.</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-200">3</p>
            <h2 className="mt-2 font-bold">Pay securely</h2>
            <p className="mt-1 text-sm text-slate-300">Your order is recorded for the business in Sedifex.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link className="rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950" to="https://www.sedifex.com">
            Visit Sedifex
          </Link>
          <Link className="rounded-2xl border border-white/20 px-6 py-3 font-semibold text-white" to="https://www.sedifex.com/pricing">
            Create a business account
          </Link>
        </div>
      </section>
    </main>
  )
}
