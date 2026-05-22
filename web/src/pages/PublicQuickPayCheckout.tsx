import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import './PublicQuickPayCheckout.css'

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
const TYPE_FILTERS: Array<'ALL' | QuickPayItem['type']> = ['ALL', 'PRODUCT', 'SERVICE', 'COURSE']
const DEFAULT_VISIBLE_ITEMS = 6

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
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(value)
}

function normalizeCheckoutItemType(type: QuickPayItem['type']) {
  return type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'
}

function getItemIcon(type: QuickPayItem['type']) {
  if (type === 'SERVICE') return 'S'
  if (type === 'COURSE') return 'C'
  return 'P'
}

export default function PublicQuickPayCheckout() {
  const { storeId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') || 'store'
  const paymentReturnStatus = searchParams.get('status')
  const paymentReference = searchParams.get('reference') || searchParams.get('trxref') || ''
  const shouldShowSuccess = paymentReturnStatus === 'success' || paymentReturnStatus === 'returning' || Boolean(paymentReference)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | QuickPayItem['type']>('ALL')
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
    return items.filter(item => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false
      if (!normalized) return true
      const haystack = `${item.name} ${item.description ?? ''} ${item.category ?? ''} ${item.type}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [items, query, typeFilter])

  const hasSearch = query.trim().length > 0
  const visibleItems = hasSearch ? filteredItems : filteredItems.slice(0, DEFAULT_VISIBLE_ITEMS)
  const hiddenItemCount = Math.max(filteredItems.length - visibleItems.length, 0)

  const unitAmount = selectedItem?.price ?? 0
  const finalAmount = selectedItem?.id === 'manual-service' ? Number(customAmount || 0) : unitAmount * quantity

  useEffect(() => {
    let isMounted = true
    async function loadCatalog() {
      if (!storeId) {
        setError('Missing store ID.')
        setStatus(null)
        return
      }
      try {
        const response = await fetch(`${FUNCTION_BASE_URL}/publicQuickPayCatalog?storeId=${encodeURIComponent(storeId)}`)
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
    if (!shouldShowSuccess) void loadCatalog()
    return () => { isMounted = false }
  }, [storeId, shouldShowSuccess])

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!selectedItem) return setError('Select what you want to pay for.')
    if (!customer.email.trim()) return setError('Enter your email so the payment can be processed.')
    if (!finalAmount || finalAmount <= 0) return setError('Enter a valid amount.')

    setIsSubmitting(true)
    setStatus('Preparing secure payment…')
    try {
      const reference = `qp_${storeId}_${Date.now()}`
      const returnUrl = `${window.location.origin}/s/${encodeURIComponent(storeId)}?mode=${encodeURIComponent(initialMode)}&status=success&reference=${encodeURIComponent(reference)}`
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
        items: [{ item_id: selectedItem.id, itemId: selectedItem.id, name: selectedItem.name, type: normalizeCheckoutItemType(selectedItem.type), item_type: normalizeCheckoutItemType(selectedItem.type), qty: quantity, quantity }],
        pricing_snapshot: {
          pricing_version: 'quick-pay-public-page-v1',
          currency: 'GHS',
          subtotal: Math.round(finalAmount * 100),
          tax_total: 0,
          final_total: Math.round(finalAmount * 100),
          items: [{ item_id: selectedItem.id, name: selectedItem.name, qty: quantity, unit_price: Math.round(unitAmount * 100), line_total: Math.round(finalAmount * 100), type: normalizeCheckoutItemType(selectedItem.type) }],
        },
        metadata: { quickPay: true, storeId, itemId: selectedItem.id, itemName: selectedItem.name, itemType: selectedItem.type, quantity },
      }
      const response = await fetch(`${FUNCTION_BASE_URL}/integrationCheckoutCreate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sedifex-Contract-Version': CONTRACT_VERSION },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { authorizationUrl?: string; checkoutUrl?: string; error?: string } | null
      if (!response.ok || !payload) throw new Error(payload?.error || `Checkout failed (${response.status})`)
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

  if (shouldShowSuccess) {
    return (
      <main className="qp-checkout-root">
        <div className="qp-success-shell">
          <section className="qp-success-card">
            <div className="qp-success-icon">✓</div>
            <p className="qp-eyebrow qp-success-eyebrow">Sedifex Quick Pay</p>
            <h1 className="qp-success-title">Thank you for your payment</h1>
            <p className="qp-success-copy">Your payment has been received or is being confirmed. The business will receive your order in Sedifex.</p>
            {paymentReference ? (
              <div className="qp-success-reference">
                <span>Payment reference</span>
                <strong>{paymentReference}</strong>
              </div>
            ) : null}
            <div className="qp-success-actions">
              <Link className="qp-success-primary" to={`/s/${encodeURIComponent(storeId)}?mode=store`}>Pay for another item</Link>
              <Link className="qp-success-secondary" to="/">Find another business</Link>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="qp-checkout-root">
      <div className="qp-checkout-shell">
        <section className="qp-checkout-hero">
          <p className="qp-eyebrow">Sedifex Quick Pay</p>
          <h1 className="qp-title">Scan, search, pay</h1>
          <p className="qp-copy">Search for the product, service, or course you want. Pay securely and the business receives the order in Sedifex.</p>

          <div className="qp-hero-search">
            <label className="qp-hero-label" htmlFor="quick-pay-search">What do you want to buy or pay for?</label>
            <div className="qp-hero-input-shell">
              <span className="qp-hero-search-icon">⌕</span>
              <input
                id="quick-pay-search"
                type="search"
                placeholder="Search products, services, courses..."
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="qp-hero-input"
              />
              {query ? <button type="button" className="qp-clear-search" onClick={() => setQuery('')}>Clear</button> : null}
            </div>
            <p className="qp-hero-help">Showing a few popular items first. Search to find more items quickly.</p>
          </div>

          <div className="qp-trust-row">
            <span>♢ Secure payments</span>
            <span>◇ Best prices</span>
            <span>▯ Mobile money & cards</span>
          </div>
        </section>

        <div className="qp-grid">
          <section className="qp-panel qp-search-panel">
            <div className="qp-type-tabs">
              {TYPE_FILTERS.map(type => (
                <button key={type} type="button" className={`qp-type-tab ${typeFilter === type ? 'qp-type-tab-active' : ''}`} onClick={() => setTypeFilter(type)}>
                  {type === 'ALL' ? 'All' : type.toLowerCase()}
                </button>
              ))}
            </div>
            {status ? <p className="qp-status">{status}</p> : null}
            {!hasSearch && hiddenItemCount > 0 ? <p className="qp-status">Showing {visibleItems.length} popular items. Search above to find from {filteredItems.length} available items.</p> : null}
            <div className="qp-items-grid">
              {visibleItems.map(item => {
                const isSelected = selectedItem?.id === item.id
                return (
                  <button key={item.id} type="button" className={`qp-item-card ${isSelected ? 'qp-item-card-selected' : ''}`} onClick={() => setSelectedItem(item)}>
                    <div className="qp-item-top">
                      <div className="qp-item-icon">{getItemIcon(item.type)}</div>
                      <div className="qp-item-main">
                        <h2 className="qp-item-name">{item.name}</h2>
                        <div className="qp-item-meta">
                          <span className="qp-badge">{item.type}</span>
                          {item.category ? <span className="qp-badge">{item.category}</span> : null}
                        </div>
                      </div>
                      <strong className="qp-price">{item.price > 0 ? money(item.price) : 'Custom'}</strong>
                    </div>
                    {item.description ? <p className="qp-description">{item.description}</p> : null}
                  </button>
                )
              })}
              {visibleItems.length === 0 ? <div className="qp-empty">No item matched your search. Try another word or contact the business.</div> : null}
            </div>
          </section>

          <form onSubmit={createCheckout} className="qp-panel qp-payment-panel">
            <h2 className="qp-payment-title">Payment details</h2>
            <p className="qp-selected-name">{selectedItem ? selectedItem.name : 'Select an item to continue.'}</p>
            {selectedItem ? (
              <div className="qp-summary">
                {selectedItem.id === 'manual-service' ? (
                  <label className="qp-field-label">Amount to pay<input type="number" min="1" step="0.01" value={customAmount} onChange={event => setCustomAmount(event.target.value)} className="qp-field" placeholder="Enter amount" /></label>
                ) : (
                  <label className="qp-field-label">Quantity<input type="number" min="1" value={quantity} onChange={event => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="qp-field" /></label>
                )}
                <div className="qp-total-row"><span className="qp-total-label">Total</span><strong className="qp-total-value">{money(finalAmount || 0)}</strong></div>
              </div>
            ) : null}
            <div className="qp-form-fields">
              <input type="text" placeholder="Your name" value={customer.name} onChange={event => setCustomer(previous => ({ ...previous, name: event.target.value }))} className="qp-field" />
              <input type="email" placeholder="Email for receipt" value={customer.email} onChange={event => setCustomer(previous => ({ ...previous, email: event.target.value }))} className="qp-field" required />
              <input type="tel" placeholder="Phone / WhatsApp" value={customer.phone} onChange={event => setCustomer(previous => ({ ...previous, phone: event.target.value }))} className="qp-field" />
            </div>
            {error ? <p className="qp-error">{error}</p> : null}
            <button type="submit" disabled={isSubmitting || !selectedItem} className="qp-pay-button">{isSubmitting ? 'Opening payment…' : 'Pay now'}</button>
            <p className="qp-powered">Powered by Sedifex. Payment is processed securely and recorded for the business.</p>
          </form>
        </div>
      </div>
    </main>
  )
}
