import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

type QuickPayItem = {
  id: string
  name: string
  type: 'PRODUCT' | 'SERVICE' | 'COURSE'
  price: number
  priceMinor?: number
  description?: string | null
  imageUrl?: string | null
  category?: string | null
}

type CustomerDetails = {
  name: string
  email: string
  phone: string
}

const FUNCTION_BASE_URL =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  import.meta.env.VITE_SEDIFEX_FUNCTIONS_BASE_URL ||
  'https://us-central1-sedifex-web.cloudfunctions.net'

const CONTRACT_VERSION = import.meta.env.VITE_SEDIFEX_INTEGRATION_CONTRACT_VERSION || '2026-04-13'

const DEMO_ITEMS: QuickPayItem[] = [
  {
    id: 'manual-service',
    name: 'Manual service payment',
    type: 'SERVICE',
    price: 0,
    description: 'Use this when the customer cannot find the exact item. The store can review it later.',
  },
]

function money(value: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
  }).format(value)
}

function normalizeCheckoutItemType(type: QuickPayItem['type']) {
  return type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'
}

export default function PublicQuickPayCheckout() {
  const { storeId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') || 'store'
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<QuickPayItem[]>([])
  const [selectedItem, setSelectedItem] = useState<QuickPayItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [customAmount, setCustomAmount] = useState('')
  const [customer, setCustomer] = useState<CustomerDetails>({ name: '', email: '', phone: '' })
  const [status, setStatus] = useState<string | null>('Loading available items…')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter(item => {
      const haystack = `${item.name} ${item.description ?? ''} ${item.category ?? ''} ${item.type}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [items, query])

  const unitAmount = selectedItem?.price ?? 0
  const finalAmount = selectedItem?.id === 'manual-service'
    ? Number(customAmount || 0)
    : unitAmount * quantity

  useEffect(() => {
    let isMounted = true

    async function loadCatalog() {
      if (!storeId) {
        setError('Missing store ID.')
        setStatus(null)
        return
      }

      try {
        const response = await fetch(
          `${FUNCTION_BASE_URL}/publicQuickPayCatalog?storeId=${encodeURIComponent(storeId)}`,
        )
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`)
        const payload = await response.json() as { items?: QuickPayItem[] }
        if (!isMounted) return
        const loadedItems = Array.isArray(payload.items) ? payload.items : []
        setItems(loadedItems.length ? loadedItems : DEMO_ITEMS)
        setStatus(loadedItems.length ? null : 'No published items found yet. Use manual service payment.')
      } catch (catalogError) {
        if (!isMounted) return
        console.warn('[quick-pay] Catalog load failed', catalogError)
        setItems(DEMO_ITEMS)
        setStatus('Catalog is not available yet. Manual payment mode is available.')
      }
    }

    void loadCatalog()
    return () => {
      isMounted = false
    }
  }, [storeId])

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!selectedItem) {
      setError('Select what you want to pay for.')
      return
    }
    if (!customer.email.trim()) {
      setError('Enter your email so the payment can be processed.')
      return
    }
    if (!finalAmount || finalAmount <= 0) {
      setError('Enter a valid amount.')
      return
    }

    setIsSubmitting(true)
    setStatus('Preparing secure payment…')

    try {
      const reference = `qp_${storeId}_${Date.now()}`
      const returnUrl = `${window.location.origin}/s/${encodeURIComponent(storeId)}?mode=${encodeURIComponent(initialMode)}&status=returning`
      const body = {
        storeId,
        merchantId: storeId,
        reference,
        clientOrderId: reference,
        amount: finalAmount,
        currency: 'GHS',
        customer,
        customerEmail: customer.email,
        customerName: customer.name,
        customerPhone: customer.phone,
        returnUrl,
        sourceChannel: 'quick_pay_qr',
        sourceLabel: 'Sedifex Quick Pay',
        items: [
          {
            item_id: selectedItem.id,
            itemId: selectedItem.id,
            name: selectedItem.name,
            type: normalizeCheckoutItemType(selectedItem.type),
            item_type: normalizeCheckoutItemType(selectedItem.type),
            qty: quantity,
            quantity,
          },
        ],
        pricing_snapshot: {
          pricing_version: 'quick-pay-public-page-v1',
          currency: 'GHS',
          subtotal: Math.round(finalAmount * 100),
          tax_total: 0,
          final_total: Math.round(finalAmount * 100),
          items: [
            {
              item_id: selectedItem.id,
              name: selectedItem.name,
              qty: quantity,
              unit_price: Math.round(unitAmount * 100),
              line_total: Math.round(finalAmount * 100),
              type: normalizeCheckoutItemType(selectedItem.type),
            },
          ],
        },
        metadata: {
          quickPay: true,
          storeId,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          itemType: selectedItem.type,
          quantity,
        },
      }

      const response = await fetch(`${FUNCTION_BASE_URL}/integrationCheckoutCreate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sedifex-Contract-Version': CONTRACT_VERSION,
        },
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => null) as {
        authorizationUrl?: string
        checkoutUrl?: string
        error?: string
      } | null

      if (!response.ok || !payload) {
        throw new Error(payload?.error || `Checkout failed (${response.status})`)
      }

      const checkoutUrl = payload.authorizationUrl || payload.checkoutUrl
      if (!checkoutUrl) throw new Error('Checkout URL was not returned.')
      window.location.href = checkoutUrl
    } catch (checkoutError) {
      console.error('[quick-pay] Checkout failed', checkoutError)
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to create checkout.')
      setStatus(null)
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 py-8 text-white sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-200">Sedifex Quick Pay</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Scan, search, pay</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">
              Search for the product, service, or course you want. Pay securely and the business receives the order in Sedifex.
            </p>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <div className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r sm:p-8">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="quick-pay-search">
                What do you want to buy or pay for?
              </label>
              <input
                id="quick-pay-search"
                type="search"
                placeholder="Example: hair braiding, massage, A1 German class…"
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />

              {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}

              <div className="mt-6 grid gap-3">
                {filteredItems.map(item => {
                  const isSelected = selectedItem?.id === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-950">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">{item.type}</p>
                          {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                        </div>
                        <p className="shrink-0 font-semibold text-slate-950">
                          {item.price > 0 ? money(item.price) : 'Custom'}
                        </p>
                      </div>
                    </button>
                  )
                })}

                {filteredItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
                    No item matched your search. Use manual service payment or contact the business.
                  </div>
                ) : null}
              </div>
            </div>

            <form onSubmit={createCheckout} className="bg-slate-50 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-slate-950">Payment details</h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedItem ? selectedItem.name : 'Select an item to continue.'}
              </p>

              {selectedItem ? (
                <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
                  {selectedItem.id === 'manual-service' ? (
                    <label className="block text-sm font-semibold text-slate-700">
                      Amount to pay
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={customAmount}
                        onChange={event => setCustomAmount(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                        placeholder="Enter amount"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm font-semibold text-slate-700">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={event => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                      />
                    </label>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                    <span className="text-sm font-medium text-slate-600">Total</span>
                    <strong className="text-2xl text-slate-950">{money(finalAmount || 0)}</strong>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <input
                  type="text"
                  placeholder="Your name"
                  value={customer.name}
                  onChange={event => setCustomer(previous => ({ ...previous, name: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Email for receipt"
                  value={customer.email}
                  onChange={event => setCustomer(previous => ({ ...previous, email: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone / WhatsApp"
                  value={customer.phone}
                  onChange={event => setCustomer(previous => ({ ...previous, phone: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                />
              </div>

              {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting || !selectedItem}
                className="mt-5 w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? 'Opening payment…' : 'Pay now'}
              </button>

              <p className="mt-4 text-center text-xs text-slate-500">
                Powered by Sedifex. Payment is processed securely and recorded for the business.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
