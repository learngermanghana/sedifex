import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import './PublicQuickPayCheckout.css'

type QuickPayItemType = 'PRODUCT' | 'SERVICE' | 'COURSE' | 'DONATION' | 'STUDENT_REGISTRATION' | 'BOOKING' | 'MANUAL'
type ManualPaymentType = Exclude<QuickPayItemType, 'MANUAL'>

type QuickPayItem = {
  id: string
  name: string
  type: QuickPayItemType
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
const TYPE_FILTERS: Array<'ALL' | QuickPayItemType> = ['ALL', 'PRODUCT', 'SERVICE', 'COURSE', 'BOOKING', 'STUDENT_REGISTRATION', 'DONATION']
const MANUAL_PAYMENT_TYPES: ManualPaymentType[] = ['SERVICE', 'PRODUCT', 'COURSE', 'BOOKING', 'STUDENT_REGISTRATION', 'DONATION']
const DEFAULT_VISIBLE_ITEMS = 4

const DEMO_ITEMS: QuickPayItem[] = [
  {
    id: 'manual-service',
    name: 'Manual payment request',
    type: 'MANUAL',
    price: 0,
    description: 'Use this only when you cannot find the exact product, service, booking, course, donation, or registration. The business will review it later.',
  },
]

function money(value: number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(value)
}

function normalizeCheckoutItemType(type: QuickPayItemType) {
  if (type === 'PRODUCT') return 'PRODUCT'
  return 'SERVICE'
}

function getAccountingType(type: QuickPayItemType) {
  if (type === 'DONATION') return 'donation'
  if (type === 'STUDENT_REGISTRATION') return 'student_registration'
  if (type === 'BOOKING') return 'booking'
  if (type === 'COURSE') return 'course'
  if (type === 'SERVICE') return 'service'
  if (type === 'PRODUCT') return 'product'
  return 'manual_quick_sale'
}

function getItemIcon(type: QuickPayItemType) {
  if (type === 'SERVICE') return 'S'
  if (type === 'COURSE') return 'C'
  if (type === 'DONATION') return 'D'
  if (type === 'STUDENT_REGISTRATION') return 'R'
  if (type === 'BOOKING') return 'B'
  if (type === 'MANUAL') return 'M'
  return 'P'
}

function getTypeLabel(type: QuickPayItemType) {
  if (type === 'STUDENT_REGISTRATION') return 'Student registration'
  if (type === 'MANUAL') return 'Manual payment'
  return type.toLowerCase()
}

function getManualPaymentName(type: ManualPaymentType) {
  return `Manual ${getTypeLabel(type)} payment`
}

export default function PublicQuickPayCheckout() {
  const { storeId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') || 'store'
  const paymentReturnStatus = searchParams.get('status')
  const paymentReference = searchParams.get('reference') || searchParams.get('trxref') || ''
  const shouldShowSuccess = paymentReturnStatus === 'success' || paymentReturnStatus === 'returning' || Boolean(paymentReference)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | QuickPayItemType>('ALL')
  const [items, setItems] = useState<QuickPayItem[]>([])
  const [selectedItem, setSelectedItem] = useState<QuickPayItem | null>(null)
  const [manualPaymentType, setManualPaymentType] = useState<ManualPaymentType>('SERVICE')
  const [manualPaymentName, setManualPaymentName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [customAmount, setCustomAmount] = useState('')
  const [customer, setCustomer] = useState<CustomerDetails>({ name: '', email: '', phone: '' })
  const [status, setStatus] = useState<string | null>('Loading available items…')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const catalogWithManual = useMemo(() => {
    return items.some(item => item.id === 'manual-service') ? items : [...items, ...DEMO_ITEMS]
  }, [items])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return catalogWithManual.filter(item => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false
      if (!normalized) return item.type !== 'MANUAL'
      const haystack = `${item.name} ${item.description ?? ''} ${item.category ?? ''} ${item.type}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [catalogWithManual, query, typeFilter])

  const hasSearch = query.trim().length > 0
  const visibleItems = hasSearch ? filteredItems : filteredItems.slice(0, DEFAULT_VISIBLE_ITEMS)
  const hiddenItemCount = Math.max(filteredItems.length - visibleItems.length, 0)

  const unitAmount = selectedItem?.price ?? 0
  const sanitizedManualPaymentName = manualPaymentName.trim()
  const effectiveQuickPayType: QuickPayItemType | null = selectedItem
    ? selectedItem.type === 'MANUAL'
      ? manualPaymentType
      : selectedItem.type
    : null
  const effectiveAccountingType = effectiveQuickPayType ? getAccountingType(effectiveQuickPayType) : 'manual_quick_sale'
  const effectiveItemName = selectedItem?.type === 'MANUAL' ? sanitizedManualPaymentName || getManualPaymentName(manualPaymentType) : selectedItem?.name ?? ''
  const effectiveQuantity = selectedItem?.type === 'MANUAL' ? 1 : quantity

  useEffect(() => {
    const existingViewport = document.querySelector('meta[name="viewport"]')
    if (existingViewport) {
      existingViewport.setAttribute('content', 'width=device-width, initial-scale=1.0')
      return
    }

    const meta = document.createElement('meta')
    meta.name = 'viewport'
    meta.content = 'width=device-width, initial-scale=1.0'
    document.head.appendChild(meta)

    return () => {
      meta.remove()
    }
  }, [])

  const finalAmount = selectedItem?.type === 'MANUAL' ? Number(customAmount || 0) : unitAmount * quantity

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
        setItems(loadedItems)
        setStatus(loadedItems.length ? null : 'No published items found yet. Use manual payment if needed.')
      } catch (catalogError) {
        if (!isMounted) return
        console.warn('[quick-pay] Catalog load failed', catalogError)
        setItems([])
        setStatus('Catalog is not available yet. Manual payment mode is available.')
      }
    }
    if (!shouldShowSuccess) void loadCatalog()
    return () => { isMounted = false }
  }, [storeId, shouldShowSuccess])

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!selectedItem || !effectiveQuickPayType) return setError('Select what you want to pay for.')
    if (selectedItem.type === 'MANUAL' && !sanitizedManualPaymentName) return setError('Enter the service or item name.')
    if (!customer.email.trim()) return setError('Enter your email so the payment can be processed.')
    if (!finalAmount || finalAmount <= 0) return setError('Enter a valid amount.')

    setIsSubmitting(true)
    setStatus('Preparing secure payment…')
    try {
      const reference = `qp_${storeId}_${Date.now()}`
      const returnUrl = `${window.location.origin}/s/${encodeURIComponent(storeId)}?mode=${encodeURIComponent(initialMode)}&status=success&reference=${encodeURIComponent(reference)}`
      const accountingType = effectiveAccountingType
      const manualPaymentCategory = selectedItem.type === 'MANUAL' ? getTypeLabel(manualPaymentType) : null
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
        quickPayType: effectiveQuickPayType,
        accountingType,
        orderType: accountingType,
        items: [{
          item_id: selectedItem.id,
          itemId: selectedItem.id,
          name: effectiveItemName,
          category: manualPaymentCategory || selectedItem.category || null,
          type: normalizeCheckoutItemType(effectiveQuickPayType),
          item_type: normalizeCheckoutItemType(effectiveQuickPayType),
          quickPayType: effectiveQuickPayType,
          originalQuickPayType: selectedItem.type,
          accountingType,
          qty: effectiveQuantity,
          quantity: effectiveQuantity,
        }],
        pricing_snapshot: {
          pricing_version: 'quick-pay-public-page-v2',
          currency: 'GHS',
          subtotal: Math.round(finalAmount * 100),
          tax_total: 0,
          final_total: Math.round(finalAmount * 100),
          items: [{
            item_id: selectedItem.id,
            name: effectiveItemName,
            category: manualPaymentCategory || selectedItem.category || null,
            qty: effectiveQuantity,
            unit_price: selectedItem.type === 'MANUAL' ? Math.round(finalAmount * 100) : Math.round(unitAmount * 100),
            line_total: Math.round(finalAmount * 100),
            type: normalizeCheckoutItemType(effectiveQuickPayType),
            quickPayType: effectiveQuickPayType,
            originalQuickPayType: selectedItem.type,
            accountingType,
          }],
        },
        metadata: {
          quickPay: true,
          storeId,
          itemId: selectedItem.id,
          itemName: effectiveItemName,
          originalItemName: selectedItem.name,
          itemType: effectiveQuickPayType,
          originalItemType: selectedItem.type,
          quickPayType: effectiveQuickPayType,
          originalQuickPayType: selectedItem.type,
          manualPayment: selectedItem.type === 'MANUAL',
          manualPaymentName: selectedItem.type === 'MANUAL' ? sanitizedManualPaymentName : undefined,
          manualPaymentCategory,
          accountingType,
          quantity: effectiveQuantity,
        },
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

  function scrollToCheckout() {
    document.getElementById('quick-pay-checkout-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          <p className="qp-copy">Search for the product, service, booking, registration, donation, or course you want. Pay securely and the business receives the order in Sedifex.</p>

          <div className="qp-pay-steps" aria-label="How to pay">
            <div className="qp-pay-step"><span>1</span><strong>Search</strong><small>Find product, service, booking, course, or donation.</small></div>
            <div className="qp-pay-step"><span>2</span><strong>Select</strong><small>Choose what you want and confirm the quantity.</small></div>
            <div className="qp-pay-step"><span>3</span><strong>Enter details</strong><small>Add your name, email, and phone for receipt.</small></div>
            <div className="qp-pay-step"><span>4</span><strong>Pay securely</strong><small>Complete payment by mobile money or card.</small></div>
          </div>

          <div className="qp-hero-search">
            <label className="qp-hero-label" htmlFor="quick-pay-search">What do you want to pay for?</label>
            <div className="qp-hero-input-shell">
              <span className="qp-hero-search-icon">⌕</span>
              <input
                id="quick-pay-search"
                type="search"
                placeholder="Search products, services, bookings, donations..."
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="qp-hero-input"
              />
              {query ? <button type="button" className="qp-clear-search" onClick={() => setQuery('')}>Clear</button> : null}
            </div>
            <p className="qp-hero-help">Showing a few popular items first. Search above to find more items quickly.</p>
          </div>

          <div className="qp-trust-row">
            <span>♢ Secure payments</span>
            <span>◇ Store recorded</span>
            <span>▯ Mobile money & cards</span>
          </div>
        </section>

        <div className="qp-grid">
          <section className="qp-panel qp-search-panel">
            <div className="qp-type-tabs">
              {TYPE_FILTERS.map(type => (
                <button key={type} type="button" className={`qp-type-tab ${typeFilter === type ? 'qp-type-tab-active' : ''}`} onClick={() => setTypeFilter(type)}>
                  {type === 'ALL' ? 'All' : getTypeLabel(type)}
                </button>
              ))}
            </div>
            {status ? <p className="qp-status">{status}</p> : null}
            {!hasSearch && hiddenItemCount > 0 ? <p className="qp-status">Showing {visibleItems.length} popular items. Search above to find from {filteredItems.length} available items.</p> : null}
            <div className="qp-items-grid">
              {visibleItems.map(item => {
                const isSelected = selectedItem?.id === item.id
                return (
                  <button key={item.id} type="button" className={`qp-item-card ${item.type === 'MANUAL' ? 'qp-item-card-manual' : ''} ${isSelected ? 'qp-item-card-selected' : ''}`} onClick={() => { setSelectedItem(item); window.setTimeout(scrollToCheckout, 100) }}>
                    <div className="qp-item-top">
                      <div className="qp-item-icon">{getItemIcon(item.type)}</div>
                      <div className="qp-item-main">
                        <h2 className="qp-item-name">{item.name}</h2>
                        <div className="qp-item-meta">
                          <span className="qp-badge">{getTypeLabel(item.type)}</span>
                          {item.category ? <span className="qp-badge">{item.category}</span> : null}
                        </div>
                      </div>
                      <strong className="qp-price">{item.price > 0 ? money(item.price) : 'Custom'}</strong>
                    </div>
                    {item.description ? <p className="qp-description">{item.description}</p> : null}
                  </button>
                )
              })}
              {visibleItems.length === 0 ? <div className="qp-empty">No item matched your search. Try another word or use manual payment.</div> : null}
            </div>
            <button type="button" className="qp-manual-link" onClick={() => { setSelectedItem(DEMO_ITEMS[0]); window.setTimeout(scrollToCheckout, 100) }}>
              Cannot find it? Use manual payment request
            </button>
          </section>

          <form id="quick-pay-checkout-panel" onSubmit={createCheckout} className="qp-panel qp-payment-panel">
            <div className="qp-checkout-marker">Step 2 of 2</div>
            <h2 className="qp-payment-title">Checkout</h2>
            <p className="qp-selected-name">{selectedItem ? effectiveItemName : 'Select an item above to continue.'}</p>
            {selectedItem?.type === 'MANUAL' ? <p className="qp-manual-note">Choose the category and type the exact service or item name so the business can record it correctly.</p> : null}
            {selectedItem ? (
              <div className="qp-summary">
                {selectedItem.type === 'MANUAL' ? (
                  <>
                    <label className="qp-field-label">
                      Payment type
                      <select value={manualPaymentType} onChange={event => setManualPaymentType(event.target.value as ManualPaymentType)} className="qp-field">
                        {MANUAL_PAYMENT_TYPES.map(type => (
                          <option key={type} value={type}>{getTypeLabel(type)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="qp-field-label">
                      Service / item name
                      <input type="text" value={manualPaymentName} onChange={event => setManualPaymentName(event.target.value)} className="qp-field" placeholder="E.g. Facial treatment, delivery fee, consultation" required />
                    </label>
                    <label className="qp-field-label">
                      Amount to pay
                      <input type="number" min="1" step="0.01" value={customAmount} onChange={event => setCustomAmount(event.target.value)} className="qp-field" placeholder="Enter amount" />
                    </label>
                  </>
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
            <button type="submit" disabled={isSubmitting || !selectedItem} className="qp-pay-button">{isSubmitting ? 'Opening payment…' : selectedItem ? `Pay ${money(finalAmount || 0)}` : 'Select item to pay'}</button>
            <p className="qp-powered">Powered by Sedifex. Payment is processed securely and recorded for the business.</p>
          </form>
        </div>
      </div>

      {selectedItem ? (
        <button type="button" className="qp-mobile-checkout-bar" onClick={scrollToCheckout}>
          <span>
            <strong>{effectiveItemName}</strong>
            <small>{selectedItem.type === 'MANUAL' ? getTypeLabel(manualPaymentType) : `${quantity} × ${money(unitAmount || finalAmount || 0)}`}</small>
          </span>
          <b>{finalAmount > 0 ? `Checkout ${money(finalAmount)}` : 'Checkout'}</b>
        </button>
      ) : null}
    </main>
  )
}
