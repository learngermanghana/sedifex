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
    <main className="min-h-[100dvh] overflow-x-hidden bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center justify-start text-center sm:min-h-[calc(100vh-3rem)] sm:justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-cyan-300 text-xl font-black text-white shadow-2xl sm:h-20 sm:w-20 sm:rounded-3xl sm:text-3xl">
          Sx
        </div>
        <p className="mt-5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-cyan-200 sm:mt-8 sm:text-sm sm:tracking-[0.3em]">
          Sedifex Quick Pay
        </p>
        <h1 className="mt-3 max-w-[18rem] text-3xl font-black leading-tight tracking-tight sm:mt-4 sm:max-w-3xl sm:text-6xl">
          Choose a business and pay
        </h1>
        <p className="mt-4 max-w-[22rem] text-sm leading-6 text-slate-300 sm:mt-5 sm:max-w-2xl sm:text-lg sm:leading-8">
          Search the business you want to pay, choose the right store, then pay for products, services, or courses securely.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 w-full max-w-2xl rounded-3xl border border-white/10 bg-white/10 p-4 text-left shadow-2xl backdrop-blur sm:mt-8 sm:rounded-[2rem] sm:p-6">
          <label className="block text-sm font-semibold text-cyan-100" htmlFor="store-search">
            Which business do you want to pay?
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              id="store-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Example: Glittering Med Spa"
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200"
            />
            <button
              type="submit"
              className="min-h-12 w-full rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={stores.length !== 1}
            >
              Continue
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{helperText}</p>
          {error ? <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm leading-6 text-red-100">{error}</p> : null}

          {stores.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {stores.map(store => (
                <Link
                  key={store.storeId}
                  to={getStorePayUrl(store.storeId)}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white p-3 text-slate-950 transition hover:-translate-y-0.5 hover:shadow-xl sm:gap-4 sm:p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-base font-black text-white sm:h-14 sm:w-14 sm:text-lg">
                    {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : store.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black sm:text-base">{store.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">
                      {[store.city, store.phone].filter(Boolean).join(' • ') || 'Sedifex business'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">Pay</span>
                </Link>
              ))}
            </div>
          ) : null}
        </form>

        <div className="mt-6 grid w-full gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 text-left shadow-2xl sm:mt-8 sm:grid-cols-3 sm:gap-4 sm:p-6">
          <div className="rounded-2xl bg-white/5 p-4 sm:bg-transparent sm:p-0">
            <p className="text-lg font-black text-cyan-200 sm:text-2xl">1</p>
            <h2 className="mt-1 text-base font-bold sm:mt-2">Find business</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">Search by business name or scan their QR code.</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4 sm:bg-transparent sm:p-0">
            <p className="text-lg font-black text-cyan-200 sm:text-2xl">2</p>
            <h2 className="mt-1 text-base font-bold sm:mt-2">Search item</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">Choose the product, service, or course you want.</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4 sm:bg-transparent sm:p-0">
            <p className="text-lg font-black text-cyan-200 sm:text-2xl">3</p>
            <h2 className="mt-1 text-base font-bold sm:mt-2">Pay securely</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">Your order is recorded for the business in Sedifex.</p>
          </div>
        </div>

        <div className="mt-6 grid w-full max-w-2xl gap-3 pb-4 sm:mt-8 sm:flex sm:flex-wrap sm:justify-center">
          <Link className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 sm:px-6" to="https://www.sedifex.com">
            Visit Sedifex
          </Link>
          <Link className="rounded-2xl border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white sm:px-6" to="https://www.sedifex.com/pricing">
            Create a business account
          </Link>
        </div>
      </section>
    </main>
  )
}
