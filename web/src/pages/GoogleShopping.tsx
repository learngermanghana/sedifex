import React, { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import {
  getGoogleMerchantPendingAccounts,
  selectGoogleMerchantAccount,
  startGoogleMerchantOAuth,
  triggerGoogleShoppingSync,
  type GoogleMerchantAccount,
  type GoogleShoppingSyncSummary,
} from '../api/googleShopping'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './GoogleShopping.css'

type WizardStep = 'connect' | 'map' | 'fix' | 'status'

type OAuthQueryState = {
  oauthStatus: 'success' | 'failed' | ''
  oauthMessage: string
  oauthMerchantId: string
  pendingSelectionId: string
  refreshTokenMissing: boolean
}

type GoogleShoppingConnection = {
  connected: boolean
  merchantId: string
}

const STEP_LABELS: Record<WizardStep, string> = {
  connect: '1. Connect account',
  map: '2. Map fields',
  fix: '3. Fix errors',
  status: '4. View sync status',
}

function parseOAuthQueryState(): OAuthQueryState {
  const params = new URLSearchParams(window.location.search)
  return {
    oauthStatus:
      params.get('googleMerchantOAuth') === 'success'
        ? 'success'
        : params.get('googleMerchantOAuth') === 'failed'
          ? 'failed'
          : '',
    oauthMessage: params.get('message') || '',
    oauthMerchantId: params.get('merchantId') || '',
    pendingSelectionId: params.get('pendingSelectionId') || '',
    refreshTokenMissing: params.get('refreshTokenMissing') === '1',
  }
}

function clearOAuthQueryState() {
  const url = new URL(window.location.href)
  url.searchParams.delete('googleMerchantOAuth')
  url.searchParams.delete('message')
  url.searchParams.delete('merchantId')
  url.searchParams.delete('pendingSelectionId')
  url.searchParams.delete('refreshTokenMissing')
  url.searchParams.delete('storeId')
  window.history.replaceState({}, '', url.toString())
}

export default function GoogleShopping() {
  const { storeId } = useActiveStore()
  const [step, setStep] = useState<WizardStep>('connect')
  const [integrationApiKey, setIntegrationApiKey] = useState('')
  const [integrationBaseUrl, setIntegrationBaseUrl] = useState(
    'https://us-central1-sedifex-web.cloudfunctions.net',
  )
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [summary, setSummary] = useState<GoogleShoppingSyncSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [oauthConnecting, setOauthConnecting] = useState(false)
  const [pendingSelectionId, setPendingSelectionId] = useState('')
  const [pendingAccounts, setPendingAccounts] = useState<GoogleMerchantAccount[]>([])
  const [selectedMerchantId, setSelectedMerchantId] = useState('')
  const [connection, setConnection] = useState<GoogleShoppingConnection>({ connected: false, merchantId: '' })

  const checklist = useMemo(
    () => [
      'Business information complete in Merchant Center',
      'Website claimed and verified in Merchant Center',
      'Shipping settings configured',
      'Tax settings configured for target markets',
      'Google Merchant Center account is active and approved',
    ],
    [],
  )

  useEffect(() => {
    const queryState = parseOAuthQueryState()
    if (queryState.oauthStatus === 'failed') {
      setStatus(queryState.oauthMessage || 'We could not connect your Google Merchant account. Please try again.')
    }

    if (queryState.oauthStatus === 'success') {
      if (queryState.pendingSelectionId) {
        setPendingSelectionId(queryState.pendingSelectionId)
        setStatus('We found multiple Merchant accounts. Please choose the one you want to connect.')
      } else if (queryState.oauthMerchantId) {
        const message = queryState.refreshTokenMissing
          ? `Connected to Merchant ID ${queryState.oauthMerchantId}. Note: Google did not return a refresh token, so reconnect may be required later.`
          : `Connected to Merchant ID ${queryState.oauthMerchantId}.`
        setStatus(message)
      } else {
        setStatus(queryState.oauthMessage || 'Google Merchant connected successfully.')
      }
      setStep('connect')
    }

    if (queryState.oauthStatus) {
      clearOAuthQueryState()
    }
  }, [])

  useEffect(() => {
    if (!storeId) return

    const unsubscribe = onSnapshot(doc(db, 'storeSettings', storeId), (snap) => {
      const data = snap.data() as Record<string, any> | undefined
      const googleShopping = (data?.googleShopping ?? {}) as Record<string, any>
      const connectionRecord = (googleShopping.connection ?? {}) as Record<string, any>
      const catalogSync = (googleShopping.catalogSync ?? {}) as Record<string, any>

      setConnection({
        connected: connectionRecord.connected === true,
        merchantId: typeof connectionRecord.merchantId === 'string' ? connectionRecord.merchantId : '',
      })

      setIntegrationApiKey(typeof catalogSync.integrationApiKey === 'string' ? catalogSync.integrationApiKey : '')
      setIntegrationBaseUrl(
        typeof catalogSync.integrationBaseUrl === 'string'
          ? catalogSync.integrationBaseUrl
          : 'https://us-central1-sedifex-web.cloudfunctions.net',
      )
      setAutoSyncEnabled(catalogSync.autoSyncEnabled !== false)
    })

    return () => unsubscribe()
  }, [storeId])

  useEffect(() => {
    if (!pendingSelectionId) return

    let mounted = true
    setSaving(true)

    getGoogleMerchantPendingAccounts({ pendingSelectionId })
      .then((payload) => {
        if (!mounted) return
        setPendingAccounts(payload.accounts)
        setSelectedMerchantId(payload.accounts[0]?.id || '')
        if (payload.refreshTokenMissing) {
          setStatus('Google did not return a refresh token in this connection. You can still connect now.')
        }
      })
      .catch((error) => {
        if (!mounted) return
        const message = error instanceof Error ? error.message : 'Unable to load Merchant accounts for selection.'
        setStatus(message)
        setPendingSelectionId('')
      })
      .finally(() => {
        if (mounted) setSaving(false)
      })

    return () => {
      mounted = false
    }
  }, [pendingSelectionId])

  async function connectGoogleMerchant() {
    if (!storeId) {
      setStatus('Please select a store before connecting Google Merchant.')
      return
    }

    setOauthConnecting(true)
    setStatus(null)

    try {
      const url = await startGoogleMerchantOAuth({ storeId })
      window.location.assign(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start Google Merchant connection.'
      setStatus(message)
      setOauthConnecting(false)
    }
  }

  async function confirmMerchantSelection() {
    if (!pendingSelectionId || !selectedMerchantId) {
      setStatus('Please select a Merchant account to continue.')
      return
    }

    setSaving(true)
    setStatus(null)

    try {
      const payload = await selectGoogleMerchantAccount({
        pendingSelectionId,
        merchantId: selectedMerchantId,
      })

      const message = payload.refreshTokenMissing
        ? `Connected to Merchant ID ${payload.merchantId}. Note: Google did not return a refresh token, so reconnect may be required later.`
        : `Connected to Merchant ID ${payload.merchantId}.`
      setStatus(message)
      setPendingSelectionId('')
      setPendingAccounts([])
      setSelectedMerchantId('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save selected Merchant account.'
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
          Connect your Merchant account once, then Sedifex can sync your catalog automatically. No
          manual Merchant ID entry required.
        </p>
      </header>

      <nav className="google-shopping-page__steps" aria-label="Google Shopping setup steps">
        {(Object.keys(STEP_LABELS) as WizardStep[]).map((stepKey) => (
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
          <p>
            Click below to sign in with Google. Sedifex will discover your Merchant accounts and
            connect automatically when possible.
          </p>

          <button type="button" disabled={oauthConnecting || saving} onClick={connectGoogleMerchant}>
            {oauthConnecting ? 'Connecting…' : connection.connected ? 'Reconnect Google Merchant' : 'Connect Google Merchant'}
          </button>

          {connection.connected && (
            <p className="google-shopping-panel__connected">Connected Merchant ID: <strong>{connection.merchantId}</strong></p>
          )}

          {pendingAccounts.length > 1 && (
            <div className="google-shopping-panel__picker">
              <h3>Choose your Merchant account</h3>
              <label>
                Merchant account
                <select
                  value={selectedMerchantId}
                  onChange={(event) => setSelectedMerchantId(event.target.value)}
                >
                  {pendingAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({account.id})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={saving} onClick={confirmMerchantSelection}>
                {saving ? 'Saving…' : 'Use this Merchant account'}
              </button>
            </div>
          )}

          <label>
            Sedifex Integration API key
            <input value={integrationApiKey} readOnly />
          </label>
          <label>
            Integration feed base URL
            <input value={integrationBaseUrl} readOnly />
          </label>
          <label className="google-shopping-panel__checkbox">
            <input type="checkbox" checked={autoSyncEnabled} readOnly />
            Scheduled incremental sync is enabled
          </label>
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
            <button type="button" disabled={saving || !connection.connected} onClick={() => runSync('full')}>
              {saving ? 'Syncing…' : 'Run initial full catalog upload'}
            </button>
            <button
              type="button"
              disabled={saving || !connection.connected}
              onClick={() => runSync('incremental')}
            >
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
            {summary?.errors?.slice(0, 20).map((error) => (
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
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {status && <p className="google-shopping-page__status">{status}</p>}
    </main>
  )
}
