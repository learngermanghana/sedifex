import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'

import {
  ensureGoogleShoppingSetupConfig,
  getGoogleMerchantPendingAccounts,
  selectGoogleMerchantAccount,
  triggerGoogleShoppingSync,
  type GoogleMerchantAccount,
  type GoogleShoppingSyncSummary,
} from '../api/googleShopping'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useGoogleIntegrationStatus } from '../hooks/useGoogleIntegrationStatus'
import { clearGoogleOAuthQueryState, parseGoogleOAuthQueryState } from '../utils/googleOAuthCallback'
import './GoogleShopping.css'

type WizardStep = 'connect' | 'account' | 'readiness' | 'sync'

type GoogleShoppingConnection = {
  connected: boolean
  merchantId: string
}

type GoogleShoppingStatusSnapshot = {
  state: 'idle' | 'running' | 'success' | 'error'
  message: string
  lastRunAt: string
  lastSuccessfulAt: string
  errorCount: number
}

type GoogleShoppingHistoryEntry = {
  runAt: string
  mode: 'full' | 'incremental'
  state: 'success' | 'error'
  createdOrUpdated: number
  removed: number
  disapproved: number
  errorCount: number
}

const STEP_LABELS: Record<WizardStep, string> = {
  connect: 'Step 1: Connect Google',
  account: 'Step 2: Choose Merchant account',
  readiness: 'Step 3: Check product readiness',
  sync: 'Step 4: Sync to Google',
}

export default function GoogleShopping() {
  const { storeId } = useActiveStore()
  console.log("STORE ID:", storeId)
  const [step, setStep] = useState<WizardStep>('connect')
  const [integrationApiKey, setIntegrationApiKey] = useState('')
  const [integrationBaseUrl, setIntegrationBaseUrl] = useState(
    'https://us-central1-sedifex-web.cloudfunctions.net',
  )
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [setupConfigLoading, setSetupConfigLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [summary, setSummary] = useState<GoogleShoppingSyncSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingSelectionId, setPendingSelectionId] = useState('')
  const [pendingAccounts, setPendingAccounts] = useState<GoogleMerchantAccount[]>([])
  const [selectedMerchantId, setSelectedMerchantId] = useState('')
  const [connection, setConnection] = useState<GoogleShoppingConnection>({ connected: false, merchantId: '' })
  const [persistedStatus, setPersistedStatus] = useState<GoogleShoppingStatusSnapshot | null>(null)
  const [syncHistory, setSyncHistory] = useState<GoogleShoppingHistoryEntry[]>([])
  const {
    isLoading: oauthStatusLoading,
    isStartingOAuth,
    hasGoogleConnection,
    hasRequiredScope,
    stateTitle,
    merchant,
    error: oauthError,
    startOAuth,
  } = useGoogleIntegrationStatus({ integration: 'merchant', storeId })

  const hasBlockingValidation = merchant.validationSummary.blockingCount > 0

  useEffect(() => {
    const queryState = parseGoogleOAuthQueryState(window.location.search)
    const includesMerchant = queryState.integrations.length === 0 || queryState.integrations.includes('merchant')

    if (queryState.status === 'failed' && includesMerchant) {
      setStatus(queryState.message || 'We could not connect your Google Merchant account. Please try again.')
    }

    if (queryState.status === 'success' && includesMerchant) {
      if (queryState.pendingSelectionId) {
        setPendingSelectionId(queryState.pendingSelectionId)
        setStatus('We found multiple Merchant accounts. Choose your Merchant Center account to continue.')
      } else if (queryState.merchantId) {
        const message = queryState.refreshTokenMissing
          ? `Merchant ID ${queryState.merchantId} selected. Reconnect Google to finish Merchant setup.`
          : `Merchant ID ${queryState.merchantId} selected.`
        setStatus(message)
      } else {
        setStatus(queryState.message || 'Google Merchant connected successfully.')
      }
    }

    if (queryState.status) {
      const nextUrl = clearGoogleOAuthQueryState(window.location.href)
      window.history.replaceState({}, '', nextUrl)
    }
  }, [])

  useEffect(() => {
    if (!storeId) return

    const unsubscribe = onSnapshot(doc(db, 'storeSettings', storeId), (snap) => {
      const data = snap.data() as Record<string, any> | undefined
      const googleShopping = (data?.googleShopping ?? {}) as Record<string, any>
      const connectionRecord = (googleShopping.connection ?? {}) as Record<string, any>
      const catalogSync = (googleShopping.catalogSync ?? {}) as Record<string, any>
      const statusSnapshot = (googleShopping.status ?? {}) as Record<string, any>
      const history = Array.isArray(googleShopping.syncHistory) ? googleShopping.syncHistory : []

      setConnection({
        connected: connectionRecord.connected === true,
        merchantId: typeof connectionRecord.merchantId === 'string' ? connectionRecord.merchantId : '',
      })

      setPersistedStatus({
        state:
          statusSnapshot.state === 'running' ||
          statusSnapshot.state === 'success' ||
          statusSnapshot.state === 'error'
            ? statusSnapshot.state
            : 'idle',
        message: typeof statusSnapshot.message === 'string' ? statusSnapshot.message : '',
        lastRunAt: typeof statusSnapshot.lastRunAt?.toDate === 'function' ? statusSnapshot.lastRunAt.toDate().toISOString() : '',
        lastSuccessfulAt:
          typeof statusSnapshot.lastSuccessfulAt?.toDate === 'function'
            ? statusSnapshot.lastSuccessfulAt.toDate().toISOString()
            : '',
        errorCount: typeof statusSnapshot.errorCount === 'number' ? statusSnapshot.errorCount : 0,
      })

      const mappedHistory = history
        .map((entry) => {
          const item = entry as Record<string, any>
          return {
            runAt: typeof item.runAt === 'string' ? item.runAt : '',
            mode: item.mode === 'incremental' ? 'incremental' : 'full',
            state: item.state === 'error' ? 'error' : 'success',
            createdOrUpdated: typeof item.createdOrUpdated === 'number' ? item.createdOrUpdated : 0,
            removed: typeof item.removed === 'number' ? item.removed : 0,
            disapproved: typeof item.disapproved === 'number' ? item.disapproved : 0,
            errorCount: typeof item.errorCount === 'number' ? item.errorCount : 0,
          } as GoogleShoppingHistoryEntry
        })
        .filter((entry) => entry.runAt)
      setSyncHistory(mappedHistory)

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
          setStatus('Reconnect Google to finish Merchant setup.')
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

  useEffect(() => {
    if (!oauthError) return
    setStatus(oauthError)
  }, [oauthError])

  useEffect(() => {
    if (!storeId) return

    let cancelled = false
    setSetupConfigLoading(true)

    ensureGoogleShoppingSetupConfig({ storeId })
      .then((config) => {
        if (cancelled) return
        setIntegrationApiKey(config.integrationApiKey)
        setIntegrationBaseUrl(config.integrationBaseUrl)
        setAutoSyncEnabled(config.autoSyncEnabled)
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Unable to prepare store sync settings.'
        setStatus((current) => current || message)
      })
      .finally(() => {
        if (!cancelled) setSetupConfigLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [storeId])

  async function connectGoogleMerchant() {
    if (!storeId) {
      setStatus('Please select a store before connecting Google Merchant.')
      return
    }

    setStatus(null)
    await startOAuth()
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
        ? `Merchant ID ${payload.merchantId} selected. Reconnect Google to finish Merchant setup.`
        : `Merchant ID ${payload.merchantId} selected.`
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

  const nextIncompleteStep: WizardStep = useMemo(() => {
    if (!hasGoogleConnection) return 'connect'
    if (!hasRequiredScope || !merchant.hasMerchantScope) return 'connect'
    if (!merchant.merchantAccountSelected) return 'account'
    if (!merchant.refreshTokenPresent) return 'connect'
    if (hasBlockingValidation) return 'readiness'
    return 'sync'
  }, [hasGoogleConnection, hasRequiredScope, merchant, hasBlockingValidation])

  useEffect(() => {
    setStep(nextIncompleteStep)
  }, [nextIncompleteStep])

  const actionConfig = useMemo(() => {
    if (merchant.state === 'google_not_connected') {
      return {
        title: 'Connect your Google account',
        helper: 'Step 1: Connect Google so Sedifex can request Merchant permissions.',
        cta: 'Connect Google',
        onClick: connectGoogleMerchant,
      }
    }
    if (merchant.state === 'merchant_scope_missing') {
      return {
        title: 'Grant Google Merchant access',
        helper: 'Google is connected, but Merchant scope is missing. Grant Google Merchant access to continue.',
        cta: 'Grant Google Merchant access',
        onClick: connectGoogleMerchant,
      }
    }
    if (merchant.state === 'merchant_account_not_selected') {
      return {
        title: 'Choose your Merchant Center account',
        helper: 'Step 2: choose the Merchant Center account that Sedifex should sync to.',
        // Always present a consistent call‑to‑action label. Even when there is only
        // one pending account, the user should be able to explicitly confirm
        // selection in the account step rather than being sent through OAuth again.
        cta: 'Choose Merchant account',
        // Instead of re‑initiating the OAuth flow when there is a single pending
        // account, always take the user to the account selection step. The UI
        // will display the available account(s) and allow confirmation.
        onClick: () => setStep('account'),
      }
    }
    if (merchant.state === 'refresh_token_missing') {
      return {
        title: 'Reconnect Google to finish Merchant setup',
        helper:
          'Google did not provide a long-term connection token, so Sedifex cannot keep your Merchant connection active.',
        cta: 'Reconnect Google',
        onClick: connectGoogleMerchant,
      }
    }
    if (merchant.state === 'product_sync_blocked_validation') {
      return {
        title: 'Products need more details before they can sync',
        helper: 'Fix product data issues first. This is not a Google connection problem.',
        cta: 'Review product issues',
        onClick: () => setStep('readiness'),
      }
    }

    return {
      title: 'Your Merchant connection is ready',
      helper: 'Google OAuth, Merchant account selection, and long-term token are all in place.',
      cta: 'Sync products',
      onClick: () => setStep('sync'),
    }
  }, [merchant.state, pendingAccounts.length])

  const currentSummary = summary
  const hasPersistedStatus = Boolean(persistedStatus?.lastRunAt)

  async function runSync(mode: 'full' | 'incremental') {
    if (!storeId) return
    setSaving(true)
    setStatus(null)
    try {
      const nextSummary = await triggerGoogleShoppingSync({ storeId, mode })
      setSummary(nextSummary)
      setStatus(
        nextSummary.errors.length > 0
          ? `Sync finished with ${nextSummary.errors.length} issue(s). Review product issues before the next sync.`
          : 'Sync completed successfully.',
      )
      setStep(nextSummary.errors.length > 0 ? 'readiness' : 'sync')
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
        <p className="google-shopping-page__eyebrow">Google onboarding · Step 2 of 3</p>
        <h1>Google Shopping</h1>
        <p>
          This setup makes the connection state explicit so you always know what is connected, what is missing,
          and what to do next.
        </p>
        <Link className="google-shopping-page__back-link" to="/google-connect">
          ← Back to Google Connect
        </Link>
      </header>

      <nav className="google-shopping-page__steps" aria-label="Google Shopping setup steps">
        {(Object.keys(STEP_LABELS) as WizardStep[]).map((stepKey) => (
          <button
            key={stepKey}
            type="button"
            className={`google-shopping-page__step ${step === stepKey ? 'is-active' : ''} ${nextIncompleteStep === stepKey ? 'is-next' : ''}`}
            onClick={() => setStep(stepKey)}
          >
            {STEP_LABELS[stepKey]}
          </button>
        ))}
      </nav>

      <section className="google-shopping-panel">
        <h2>{actionConfig.title}</h2>
        <p>{actionConfig.helper}</p>
        {oauthStatusLoading ? <p className="google-shopping-panel__hint">Checking Google connection…</p> : null}
        <button type="button" disabled={isStartingOAuth || saving} onClick={actionConfig.onClick}>
          {isStartingOAuth ? 'Connecting…' : actionConfig.cta}
        </button>
      </section>

      <section className="google-shopping-panel google-shopping-panel__status-list">
        <h2>Merchant connection status</h2>
        <p><strong>Google OAuth connected:</strong> {merchant.googleConnected ? 'Yes' : 'No'}</p>
        <p><strong>Merchant scope granted:</strong> {merchant.hasMerchantScope ? 'Yes' : 'No'}</p>
        <p><strong>Merchant account selected:</strong> {merchant.merchantAccountSelected ? 'Yes' : 'No'}</p>
        <p><strong>Refresh token available:</strong> {merchant.refreshTokenPresent ? 'Yes' : 'No'}</p>
        <p><strong>Backend Merchant connection:</strong> {merchant.merchantConnected ? 'Connected' : 'Action needed'}</p>
        <p><strong>Product sync ready:</strong> {merchant.syncReady ? 'Ready' : 'Not ready yet'}</p>
        {(merchant.merchantId || connection.merchantId) && (
          <p>
            <strong>Merchant ID:</strong> {merchant.merchantId || connection.merchantId}
          </p>
        )}
      </section>

      {step === 'account' && pendingAccounts.length > 0 && (
        <section className="google-shopping-panel google-shopping-panel__picker">
          <h2>Choose your Merchant Center account</h2>
          <label>
            Merchant account
            <select value={selectedMerchantId} onChange={(event) => setSelectedMerchantId(event.target.value)}>
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
        </section>
      )}

      {step === 'readiness' && (
        <section className="google-shopping-panel">
          <h2>Products that need attention before Google can accept them</h2>
          <ul>
            <li>Missing title: {merchant.validationSummary.missingTitle}</li>
            <li>Missing description: {merchant.validationSummary.missingDescription}</li>
            <li>Missing image: {merchant.validationSummary.missingImage}</li>
            <li>Missing price: {merchant.validationSummary.missingPrice}</li>
            <li>Missing brand: {merchant.validationSummary.missingBrand}</li>
            <li>Missing GTIN/MPN or SKU: {merchant.validationSummary.missingGtinOrMpnOrSku}</li>
          </ul>
          {summary?.errors?.length ? (
            <ul className="google-shopping-errors">
              {summary.errors.slice(0, 20).map((error) => (
                <li key={`${error.productId}-${error.reason}`} className="google-shopping-errors__item">
                  <div>
                    <strong>{error.productId}</strong>: {error.reason}
                  </div>
                  <div className="google-shopping-errors__actions">
                    <Link to={`/products?search=${encodeURIComponent(error.productId)}`}>Open product</Link>
                    <Link to={`/products?edit=${encodeURIComponent(error.productId)}`}>Edit missing fields</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="google-shopping-panel__hint">
              Run a sync to generate a fresh product issue list for this store.
            </p>
          )}
        </section>
      )}

      {step === 'sync' && (
        <section className="google-shopping-panel">
          <h2>Sync to Google</h2>
          <div className="google-shopping-panel__actions">
            <button type="button" disabled={saving || !merchant.syncReady} onClick={() => runSync('full')}>
              {saving ? 'Syncing…' : 'Sync products'}
            </button>
            <button type="button" disabled={saving || !merchant.syncReady} onClick={() => runSync('incremental')}>
              {saving ? 'Syncing…' : 'Run incremental sync'}
            </button>
          </div>
          {!merchant.syncReady ? (
            <p className="google-shopping-panel__hint">Complete earlier setup steps before syncing products.</p>
          ) : null}
          {currentSummary ? (
            <dl className="google-shopping-panel__status-grid">
              <div><dt>Total products</dt><dd>{currentSummary.totalProducts}</dd></div>
              <div><dt>Eligible</dt><dd>{currentSummary.eligibleProducts}</dd></div>
              <div><dt>Created/Updated</dt><dd>{currentSummary.createdOrUpdated}</dd></div>
              <div><dt>Removed</dt><dd>{currentSummary.removed}</dd></div>
              <div><dt>Disapproved</dt><dd>{currentSummary.disapproved}</dd></div>
              <div><dt>Errors</dt><dd>{currentSummary.errors.length}</dd></div>
            </dl>
          ) : (
            <p className="google-shopping-panel__hint">
              {hasPersistedStatus
                ? `Last sync: ${new Date(persistedStatus!.lastRunAt).toLocaleString()} (${persistedStatus!.state}).`
                : 'No sync has run yet for this store.'}
            </p>
          )}

          <h3>Sync history</h3>
          {syncHistory.length > 0 ? (
            <ul className="google-shopping-history">
              {syncHistory.map((entry) => (
                <li key={`${entry.runAt}-${entry.mode}`}>
                  <strong>{new Date(entry.runAt).toLocaleString()}</strong> — {entry.mode} · {entry.state} · updated {entry.createdOrUpdated}, errors {entry.errorCount}
                </li>
              ))}
            </ul>
          ) : (
            <p className="google-shopping-panel__hint">History will appear here after your first sync.</p>
          )}
        </section>
      )}

      <details className="google-shopping-panel__advanced">
        <summary>Advanced settings</summary>
        <label>
          Store API key
          <input value={setupConfigLoading && !integrationApiKey ? 'Creating key…' : integrationApiKey} readOnly />
        </label>
        <label>
          Integration feed base URL
          <input value={integrationBaseUrl} readOnly />
        </label>
        <label className="google-shopping-panel__checkbox">
          <input type="checkbox" checked={autoSyncEnabled} readOnly />
          Scheduled incremental sync is enabled
        </label>
      </details>

      {status && <p className="google-shopping-page__status">{status}</p>}
      {!status && merchant.state === 'refresh_token_missing' ? (
        <p className="google-shopping-page__status">
          Reconnect Google to finish Merchant setup. Google did not provide a long-term connection token, so Sedifex cannot keep your Merchant connection active.
        </p>
      ) : null}
      <p className="google-shopping-panel__hint">{stateTitle}</p>
    </main>
  )
}
