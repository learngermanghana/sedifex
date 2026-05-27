import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import './PublicQuickPayCheckout.css'

type ReceiptData = {
  ok: boolean
  reference: string
  storeId: string
  title: string
  receiptType: 'paid_receipt' | 'activity_slip'
  statusLabel: string
  paid: boolean
  paymentStatus: string
  orderStatus: string
  paymentMethod: string
  paymentProvider: string
  paymentCollectionMode: string
  currency: string
  amount: number
  customer: { name: string; phone?: string; email?: string }
  item: { name: string; category?: string; quantity?: number; type?: string }
  sourceLabel?: string
  createdAt?: string | null
  confirmedAt?: string | null
  note?: string
}

const FUNCTION_BASE_URL =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  import.meta.env.VITE_SEDIFEX_FUNCTIONS_BASE_URL ||
  'https://us-central1-sedifex-web.cloudfunctions.net'

function money(value: number, currency = 'GHS') {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: currency || 'GHS' }).format(Number(value || 0))
}

function niceDate(value?: string | null) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function normalizeStatus(value: string) {
  return (value || 'pending').replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export default function PublicQuickPayReceipt() {
  const { storeId = '', reference = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const receiptReference = reference || searchParams.get('reference') || ''

  useEffect(() => {
    let mounted = true
    async function loadReceipt() {
      if (!storeId || !receiptReference) {
        setError('Missing receipt reference.')
        setIsLoading(false)
        return
      }
      try {
        const url = `${FUNCTION_BASE_URL}/publicQuickPayReceipt?storeId=${encodeURIComponent(storeId)}&reference=${encodeURIComponent(receiptReference)}`
        const response = await fetch(url, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!mounted) return
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Receipt failed (${response.status})`)
        setReceipt(payload as ReceiptData)
        setError(null)
      } catch (receiptError) {
        if (!mounted) return
        setError(receiptError instanceof Error ? receiptError.message : 'Unable to load receipt.')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadReceipt()
    return () => { mounted = false }
  }, [storeId, receiptReference])

  const whatsappLink = useMemo(() => {
    if (!receipt?.customer?.phone) return ''
    const digits = receipt.customer.phone.replace(/[^\d]/g, '')
    if (!digits) return ''
    const message = [
      `Hello ${receipt.customer.name || 'Customer'}, your ${receipt.paid ? 'receipt' : 'activity slip'} is ready.`,
      `Reference: ${receipt.reference}`,
      `Item: ${receipt.item.name}`,
      `Amount: ${money(receipt.amount, receipt.currency)}`,
      `Status: ${receipt.statusLabel}`,
      window.location.href,
    ].join('\n')
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
  }, [receipt])

  return (
    <main className="qp-checkout-root">
      <div className="qp-checkout-shell">
        <section className="qp-success-card" style={{ maxWidth: 820, margin: '0 auto' }}>
          {isLoading ? <p className="qp-status">Loading receipt…</p> : null}
          {error ? (
            <>
              <div className="qp-success-icon">!</div>
              <h1 className="qp-success-title">Receipt not available</h1>
              <p className="qp-success-copy">{error}</p>
              <Link className="qp-success-secondary" to={`/s/${encodeURIComponent(storeId)}`}>Back to Quick Pay</Link>
            </>
          ) : null}
          {receipt ? (
            <div id="quick-pay-receipt">
              <div className="qp-success-icon">{receipt.paid ? '✓' : '•'}</div>
              <p className="qp-eyebrow qp-success-eyebrow">Sedifex Quick Pay</p>
              <h1 className="qp-success-title">{receipt.title}</h1>
              <p className="qp-success-copy">{receipt.note}</p>

              <div className="qp-success-reference">
                <span>Reference</span>
                <strong>{receipt.reference}</strong>
              </div>

              <div className="qp-summary" style={{ textAlign: 'left', marginTop: 20 }}>
                <div className="qp-total-row"><span className="qp-total-label">Status</span><strong className="qp-total-value">{receipt.statusLabel}</strong></div>
                <div className="qp-total-row"><span className="qp-total-label">Item / Service</span><strong className="qp-total-value">{receipt.item.name}</strong></div>
                <div className="qp-total-row"><span className="qp-total-label">Amount</span><strong className="qp-total-value">{money(receipt.amount, receipt.currency)}</strong></div>
                <div className="qp-total-row"><span className="qp-total-label">Payment method</span><strong className="qp-total-value">{normalizeStatus(receipt.paymentMethod || receipt.paymentCollectionMode)}</strong></div>
                <div className="qp-total-row"><span className="qp-total-label">Customer</span><strong className="qp-total-value">{receipt.customer.name}</strong></div>
                {receipt.customer.phone ? <div className="qp-total-row"><span className="qp-total-label">Phone</span><strong className="qp-total-value">{receipt.customer.phone}</strong></div> : null}
                {receipt.customer.email ? <div className="qp-total-row"><span className="qp-total-label">Email</span><strong className="qp-total-value">{receipt.customer.email}</strong></div> : null}
                <div className="qp-total-row"><span className="qp-total-label">Recorded</span><strong className="qp-total-value">{niceDate(receipt.createdAt)}</strong></div>
                {receipt.confirmedAt ? <div className="qp-total-row"><span className="qp-total-label">Confirmed</span><strong className="qp-total-value">{niceDate(receipt.confirmedAt)}</strong></div> : null}
              </div>

              <p className="qp-powered" style={{ marginTop: 18 }}>
                {receipt.paid
                  ? 'This receipt confirms a payment/activity recorded in Sedifex.'
                  : 'This is an activity slip. It becomes a paid receipt after payment confirmation.'}
              </p>

              <div className="qp-success-actions" style={{ marginTop: 18 }}>
                <button type="button" className="qp-success-primary" onClick={() => window.print()}>Download / Print</button>
                {whatsappLink ? <a className="qp-success-secondary" href={whatsappLink} target="_blank" rel="noreferrer">Share on WhatsApp</a> : null}
                <Link className="qp-success-secondary" to={`/s/${encodeURIComponent(storeId)}`}>New payment</Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
