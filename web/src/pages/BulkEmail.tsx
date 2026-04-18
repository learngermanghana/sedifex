import React from 'react'
import { Link } from 'react-router-dom'
import PageSection from '../layout/PageSection'

export default function BulkEmail() {
  return (
    <PageSection
      title="Bulk email"
      subtitle="Send campaigns from Sedifex while keeping customers in one place."
    >
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h3 className="card__title">Single source of truth</h3>
        <p>
          Sedifex is your customer source of truth. Stores should manage customers in Sedifex only,
          then Sedifex passes recipients to the connected Google Apps Script endpoint as JSON when
          sending.
        </p>
        <ul>
          <li>No duplicate customer entry in Google Sheets.</li>
          <li>Store-owned Google Sheet and Apps Script handle the send step.</li>
          <li>Sedifex controls audience selection, campaign payload, and send logs.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="button button--primary" to="/customers">
            Manage customers
          </Link>
          <Link className="button button--ghost" to="/account">
            Configure integrations
          </Link>
        </div>
      </div>
    </PageSection>
  )
}
