import React from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import './PublicQuickPayCheckout.css'

export default function QuickPaySuccess() {
  const { storeId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('reference') || searchParams.get('trxref') || ''

  return (
    <main className="qp-checkout-root">
      <div className="qp-success-shell">
        <section className="qp-success-card">
          <div className="qp-success-icon">✓</div>
          <p className="qp-eyebrow qp-success-eyebrow">Sedifex Quick Pay</p>
          <h1 className="qp-success-title">Thank you for your payment</h1>
          <p className="qp-success-copy">
            Your payment has been received or is being confirmed. The business will receive your order in Sedifex.
          </p>
          {reference ? (
            <div className="qp-success-reference">
              <span>Payment reference</span>
              <strong>{reference}</strong>
            </div>
          ) : null}
          <div className="qp-success-actions">
            <Link className="qp-success-primary" to={`/s/${encodeURIComponent(storeId)}?mode=store`}>
              Pay for another item
            </Link>
            <Link className="qp-success-secondary" to="/">
              Find another business
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
