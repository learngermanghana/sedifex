import React, { useMemo, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

import { triggerGoogleShoppingSync, type GoogleShoppingSyncSummary } from '../api/googleShopping'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './GoogleShopping.css'

type WizardStep = 'connect' | 'map' | 'fix' | 'status'

const STEP_LABELS: Record<WizardStep, string> = {
  connect: '1. Connect account',
  map: '2. Map fields',
  fix: '3. Fix errors',
  status: '4. View sync status',
}

export default function GoogleShopping() {
  const { storeId } = useActiveStore()
  const [step, setStep] = useState<WizardStep>('connect')
  const [merchantId, setMerchantId] = useState('')
  const [adsCustomerId, setAdsCustomerId] = useState('')
  const [integrationApiKey, setIntegrationApiKey] = useState('')
  const [merchantAccessToken, setMerchantAccessToken] = useState('')
  const [integrationBaseUrl, setIntegrationBaseUrl] = useState(
    'https://us-central1-sedifex-web.cloudfunctions.net',
  )
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [summary, setSummary] = useState<GoogleShoppingSyncSummary | null>(null)
  const [saving, setSaving] = useState(false)

  const checklist = useMemo(
    () => [
      'Business information complete in Merchant Center',
      'Website claimed and verified in Merchant Center',
      'Shipping settings configured',
      'Tax settings configured for target markets',
      'Google Merchant Center and Google Ads accounts linked',
    ],
    [],
  )

  async function saveConnectionSettings() {
    if (!storeId) return
    setSaving(true)
    setStatus(null)
    try {
      await setDoc(
        doc(db, 'storeSettings', storeId),
        {
          googleShopping: {
            connection: {
              connected: true,
              merchantId: merchantId.trim(),
              adsCustomerId: adsCustomerId.trim(),
            },
            catalogSync: {
              integrationApiKey: integrationApiKey.trim(),
              integrationBaseUrl: integrationBaseUrl.trim(),
              accessToken: merchantAccessToken.trim(),
              autoSyncEnabled,
            },
            status: {
              state: 'idle',
              message: 'Ready for initial full sync.',
              updatedAt: serverTimestamp(),
            },
          },
        },
        { merge: true },
      )
      setStatus('Connection saved. Continue to field mapping.')
      setStep('map')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save Google Shopping settings.'
      setStatus(message)
    } finally {
      setSaving(false)
    }
  }

  async function runSync(mode: 'full' | 'incremental') {
    if (!storeId) return
    setSaving(true)
    setStatus(null)
    try {
      const nextSummary = await triggerGoogleShoppingSync({ storeId, mode })
      setSummary(nextSummary)
      setStatus(
        nextSummary.errors.length > 0
          ? `Sync finished with ${nextSummary.errors.length} issue(s). Open “Fix errors” for product-level tasks.`
          : 'Sync completed successfully.',
      )
      setStep(nextSummary.errors.length > 0 ? 'fix' : 'status')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.'
      setStatus(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="google-shopping-page">
      <header className="google-shopping-page__header">
        <h1>Google Shopping</h1>
        <p>
          Setup wizard for Merchant sync, validation, and ongoing catalog updates (runs on Firebase
          Cloud Functions, not Vercel).
        </p>
      </header>

      <nav className="google-shopping-page__steps" aria-label="Google Shopping setup steps">
        {(Object.keys(STEP_LABELS) as WizardStep[]).map(stepKey => (
          <button
            key={stepKey}
            type="button"
            className={`google-shopping-page__step ${step === stepKey ? 'is-active' : ''}`}
            onClick={() => setStep(stepKey)}
          >
            {STEP_LABELS[stepKey]}
          </button>
        ))}
      </nav>

      {step === 'connect' && (
        <section className="google-shopping-panel">
          <h2>Connect account</h2>
          <label>
            Merchant Center ID
            <input value={merchantId} onChange={event => setMerchantId(event.target.value)} />
          </label>
          <label>
            Google Ads Customer ID (linked)
            <input value={adsCustomerId} onChange={event => setAdsCustomerId(event.target.value)} />
          </label>
          <label>
            Sedifex Integration API key
            <input value={integrationApiKey} onChange={event => setIntegrationApiKey(event.target.value)} />
          </label>
          <label>
            Merchant OAuth access token
            <input
              value={merchantAccessToken}
              onChange={event => setMerchantAccessToken(event.target.value)}
            />
          </label>
          <label>
            Integration feed base URL
            <input value={integrationBaseUrl} onChange={event => setIntegrationBaseUrl(event.target.value)} />
          </label>
          <label className="google-shopping-panel__checkbox">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={event => setAutoSyncEnabled(event.target.checked)}
            />
            Enable scheduled incremental sync (every 30 minutes via Firebase Function)
          </label>
          <button type="button" disabled={saving} onClick={saveConnectionSettings}>
            {saving ? 'Saving…' : 'Save connection'}
          </button>
        </section>
      )}

      {step === 'map' && (
        <section className="google-shopping-panel">
          <h2>Map fields</h2>
          <ul>
            <li>title ← name</li>
            <li>description ← description</li>
            <li>price ← price</li>
            <li>availability ← stockCount</li>
            <li>image_link ← imageUrl</li>
            <li>brand ← manufacturerName</li>
            <li>gtin/mpn ← barcode / sku</li>
            <li>google_product_category ← category</li>
          </ul>
          <p className="google-shopping-panel__hint">
            Sedifex uses <code>integrationProducts</code> as the source feed for full and incremental sync.
          </p>
          <div className="google-shopping-panel__actions">
            <button type="button" disabled={saving} onClick={() => runSync('full')}>
              {saving ? 'Syncing…' : 'Run initial full catalog upload'}
            </button>
            <button type="button" disabled={saving} onClick={() => runSync('incremental')}>
              {saving ? 'Syncing…' : 'Run incremental sync'}
            </button>
          </div>
        </section>
      )}

      {step === 'fix' && (
        <section className="google-shopping-panel">
          <h2>Fix errors</h2>
          <p>Products with missing fields or Merchant disapprovals are listed after each sync.</p>
          <ul>
            {summary?.errors?.slice(0, 20).map(error => (
              <li key={`${error.productId}-${error.reason}`}>
                <strong>{error.productId}</strong>: {error.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 'status' && (
        <section className="google-shopping-panel">
          <h2>View sync status</h2>
          {summary ? (
            <dl className="google-shopping-panel__status-grid">
              <div>
                <dt>Total products</dt>
                <dd>{summary.totalProducts}</dd>
              </div>
              <div>
                <dt>Eligible</dt>
                <dd>{summary.eligibleProducts}</dd>
              </div>
              <div>
                <dt>Created/Updated</dt>
                <dd>{summary.createdOrUpdated}</dd>
              </div>
              <div>
                <dt>Removed</dt>
                <dd>{summary.removed}</dd>
              </div>
              <div>
                <dt>Disapproved</dt>
                <dd>{summary.disapproved}</dd>
              </div>
              <div>
                <dt>Errors</dt>
                <dd>{summary.errors.length}</dd>
              </div>
            </dl>
          ) : (
            <p>No sync has run yet.</p>
          )}

          <h3>Merchant checklist</h3>
          <ul>
            {checklist.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {status && <p className="google-shopping-page__status">{status}</p>}
    </main>
  )
}
