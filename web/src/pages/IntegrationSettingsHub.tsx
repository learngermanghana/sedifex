import React, { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type IntegrationTab = 'website' | 'api' | 'booking' | 'email' | 'keys'
type Props = { defaultTab?: IntegrationTab }
type KeyRow = {
  id: string
  name: string
  purpose: string
  status: string
  keyPreview: string
  createdAt: Timestamp | null
}

type Draft = {
  websiteDomain: string
  checkoutReturnUrl: string
  checkoutCancelUrl: string
  apiBaseUrl: string
  checkoutCreateUrl: string
  contractVersion: string
  bookingWebAppUrl: string
  bookingSecret: string
  bookingFromName: string
  bookingRequireSecret: boolean
  emailWebAppUrl: string
  emailSharedToken: string
  emailFromName: string
}

const DEFAULT_BASE_URL = 'https://us-central1-sedifex-web.cloudfunctions.net'
const DEFAULT_CHECKOUT_CREATE_URL = 'https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate'
const DEFAULT_CONTRACT_VERSION = '2026-04-13'
const WEBSITE_KEY_NAME = 'Website Integration API key'
const WEBSITE_KEY_PURPOSE = 'website'

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function normalize(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function formatDate(value: Timestamp | null) {
  if (!value || typeof value.toDate !== 'function') return 'Date not available'
  return value.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function IntegrationSettingsHub({ defaultTab = 'website' }: Props) {
  const { storeId, isLoading, error } = useActiveStore()
  const user = useAuthUser()
  const { publish } = useToast()
  const [tab, setTab] = useState<IntegrationTab>(defaultTab)
  const [draft, setDraft] = useState<Draft>({
    websiteDomain: '',
    checkoutReturnUrl: '',
    checkoutCancelUrl: '',
    apiBaseUrl: DEFAULT_BASE_URL,
    checkoutCreateUrl: DEFAULT_CHECKOUT_CREATE_URL,
    contractVersion: DEFAULT_CONTRACT_VERSION,
    bookingWebAppUrl: '',
    bookingSecret: '',
    bookingFromName: '',
    bookingRequireSecret: false,
    emailWebAppUrl: '',
    emailSharedToken: '',
    emailFromName: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingKey, setIsCreatingKey] = useState(false)
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [latestToken, setLatestToken] = useState('')

  const canSave = Boolean(storeId && user)
  const apiBaseUrl = trimTrailingSlash(draft.apiBaseUrl || DEFAULT_BASE_URL)
  const contractVersion = draft.contractVersion || DEFAULT_CONTRACT_VERSION

  function endpoint(path: string) {
    if (!storeId) return ''
    return `${apiBaseUrl}${path}?storeId=${storeId}`
  }

  function update(key: keyof Draft, value: string | boolean) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    publish({ message: `${label} copied.`, tone: 'success' })
  }

  async function refreshKeys() {
    if (!storeId) return
    try {
      setKeysLoading(true)
      const callable = httpsCallable(functions, 'listIntegrationApiKeys')
      const response = await callable({ storeId })
      const data = (response.data ?? {}) as { keys?: Array<Record<string, unknown>> }
      setKeys((data.keys ?? []).map(item => ({
        id: text(item.id),
        name: text(item.name) || 'Website integration key',
        purpose: text(item.purpose) || 'website',
        status: text(item.status) || 'active',
        keyPreview: text(item.keyPreview) || 'sedx••••',
        createdAt: item.createdAt && typeof item.createdAt === 'object' && typeof (item.createdAt as Timestamp).toDate === 'function' ? item.createdAt as Timestamp : null,
      })).filter(item => item.id))
    } catch (err) {
      console.error('[integrations] failed to load keys', err)
      publish({ message: 'Unable to load integration keys.', tone: 'error' })
      setKeys([])
    } finally {
      setKeysLoading(false)
    }
  }

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    async function load() {
      try {
        const [storeSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, 'stores', storeId)),
          getDoc(doc(db, 'storeSettings', storeId)),
        ])
        if (cancelled) return
        const store = asRecord(storeSnap.data())
        const settings = asRecord(settingsSnap.data())
        const website = { ...asRecord(store.websiteIntegration), ...asRecord(settings.websiteIntegration) }
        const api = { ...asRecord(store.integrationApi), ...asRecord(settings.integrationApi) }
        const booking = { ...asRecord(store.bookingSync), ...asRecord(settings.bookingSync), ...asRecord(store.appsScriptBookingSync), ...asRecord(settings.appsScriptBookingSync) }
        const email = { ...asRecord(store.bulkEmailIntegration), ...asRecord(settings.bulkEmailIntegration) }
        setDraft(current => ({
          ...current,
          websiteDomain: text(website.domain),
          checkoutReturnUrl: text(website.checkoutReturnUrl),
          checkoutCancelUrl: text(website.checkoutCancelUrl),
          apiBaseUrl: text(api.baseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: text(api.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: text(api.contractVersion) || DEFAULT_CONTRACT_VERSION,
          bookingWebAppUrl: text(booking.webAppUrl || booking.appsScriptUrl || booking.url),
          bookingSecret: text(booking.secret || booking.sharedSecret || booking.webhookSecret),
          bookingFromName: text(booking.fromName),
          bookingRequireSecret: booking.requireSecret === true,
          emailWebAppUrl: text(email.webAppUrl),
          emailSharedToken: text(email.sharedToken),
          emailFromName: text(email.fromName),
        }))
      } catch (err) {
        console.error('[integrations] failed to load settings', err)
        publish({ message: 'Unable to load integration settings.', tone: 'error' })
      }
    }
    void load()
    void refreshKeys()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  async function saveWebsite() {
    if (!storeId || !canSave) return
    try {
      setIsSaving(true)
      const payload = {
        websiteIntegration: {
          enabled: true,
          domain: normalize(draft.websiteDomain),
          checkoutReturnUrl: normalize(draft.checkoutReturnUrl),
          checkoutCancelUrl: normalize(draft.checkoutCancelUrl),
          updatedAt: serverTimestamp(),
        },
        integrationApi: {
          enabled: true,
          baseUrl: normalize(draft.apiBaseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: normalize(draft.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: normalize(draft.contractVersion) || DEFAULT_CONTRACT_VERSION,
          updatedAt: serverTimestamp(),
        },
        integrationApiEnabled: true,
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), payload, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), payload, { merge: true }),
      ])
      publish({ message: 'Website integration settings saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save website settings', err)
      publish({ message: 'Unable to save website integration settings.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function saveApiBaseSettings() {
    if (!storeId || !canSave) return
    try {
      setIsSaving(true)
      const payload = {
        integrationApi: {
          enabled: true,
          baseUrl: normalize(draft.apiBaseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: normalize(draft.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: normalize(draft.contractVersion) || DEFAULT_CONTRACT_VERSION,
          updatedAt: serverTimestamp(),
        },
        integrationApiEnabled: true,
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), payload, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), payload, { merge: true }),
      ])
      publish({ message: 'Integration API settings saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save API settings', err)
      publish({ message: 'Unable to save integration API settings.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function saveBooking() {
    if (!storeId || !canSave) return
    if (!draft.bookingWebAppUrl.trim()) {
      publish({ message: 'Paste the Google Apps Script Web App URL first.', tone: 'error' })
      return
    }
    try {
      setIsSaving(true)
      const bookingSync = {
        enabled: true,
        webAppUrl: draft.bookingWebAppUrl.trim(),
        appsScriptUrl: draft.bookingWebAppUrl.trim(),
        url: draft.bookingWebAppUrl.trim(),
        secret: normalize(draft.bookingSecret),
        sharedSecret: normalize(draft.bookingSecret),
        webhookSecret: normalize(draft.bookingSecret),
        fromName: normalize(draft.bookingFromName),
        requireSecret: draft.bookingRequireSecret,
        updatedAt: serverTimestamp(),
      }
      const payload = {
        bookingSync,
        appsScriptBookingSync: bookingSync,
        integrationBookingConfig: bookingSync,
        appScriptBookingSyncEnabled: true,
        bookingSyncEnabled: true,
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), payload, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), payload, { merge: true }),
      ])
      publish({ message: 'Booking/App Script sync saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save booking sync', err)
      publish({ message: 'Unable to save booking sync.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function saveEmail() {
    if (!storeId || !canSave) return
    if (!draft.emailWebAppUrl.trim()) {
      publish({ message: 'Paste the email Apps Script Web App URL first.', tone: 'error' })
      return
    }
    try {
      setIsSaving(true)
      const bulkEmailIntegration = {
        webAppUrl: draft.emailWebAppUrl.trim(),
        sharedToken: normalize(draft.emailSharedToken),
        fromName: normalize(draft.emailFromName),
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), { bulkEmailIntegration, updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), { bulkEmailIntegration, updatedAt: serverTimestamp() }, { merge: true }),
      ])
      publish({ message: 'Email integration saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save email integration', err)
      publish({ message: 'Unable to save email integration.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function createWebsiteKey() {
    if (!storeId || !canSave) return
    try {
      setIsCreatingKey(true)
      setIsSaving(true)
      const callable = httpsCallable(functions, 'createIntegrationApiKey')
      const response = await callable({ name: WEBSITE_KEY_NAME, storeId, purpose: WEBSITE_KEY_PURPOSE })
      const token = text((response.data as Record<string, unknown> | undefined)?.token)
      const keyPreview = text((response.data as Record<string, unknown> | undefined)?.keyHint) || 'masked preview only'
      const integrationApiPayload = {
        integrationApi: {
          enabled: true,
          baseUrl: normalize(draft.apiBaseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: normalize(draft.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: normalize(draft.contractVersion) || DEFAULT_CONTRACT_VERSION,
          websiteApiKeyName: WEBSITE_KEY_NAME,
          websiteApiKeyPreview: keyPreview,
          latestPurpose: WEBSITE_KEY_PURPOSE,
          updatedAt: serverTimestamp(),
        },
        integrationApiEnabled: true,
        latestIntegrationApiKeyPreview: keyPreview,
        latestIntegrationApiKeyPurpose: WEBSITE_KEY_PURPOSE,
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), integrationApiPayload, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), integrationApiPayload, { merge: true }),
      ])
      if (token) {
        setLatestToken(token)
        await copy(token, 'Website integration key')
        publish({ message: 'Website integration key copied. Save it now; it is shown once.', tone: 'success' })
      }
      await refreshKeys()
    } catch (err) {
      console.error('[integrations] failed to create website key', err)
      publish({ message: 'Unable to create website integration key.', tone: 'error' })
    } finally {
      setIsSaving(false)
      setIsCreatingKey(false)
    }
  }

  if (error) return <div role="alert">{error}</div>
  if (isLoading) return <p role="status">Loading integrations…</p>
  if (!storeId) return <p>Select a workspace to manage integrations.</p>

  const envTemplate = [
    `SEDIFEX_API_BASE_URL=${apiBaseUrl}`,
    `SEDIFEX_INTEGRATION_API_BASE_URL=${apiBaseUrl}`,
    `SEDIFEX_STORE_ID=${storeId}`,
    `NEXT_PUBLIC_SEDIFEX_STORE_ID=${storeId}`,
    `SEDIFEX_BOOKING_TARGET_STORE_ID=${storeId}`,
    'SEDIFEX_INTEGRATION_API_KEY=PASTE_WEBSITE_KEY_HERE',
    'SEDIFEX_PRODUCTS_API_KEY=PASTE_WEBSITE_KEY_HERE',
    'SEDIFEX_BOOKING_API_KEY=PASTE_WEBSITE_KEY_HERE',
    `SEDIFEX_CONTRACT_VERSION=${contractVersion}`,
  ].join('\n')

  return (
    <section className="account-overview" aria-labelledby="integrations-title">
      <h1 id="integrations-title">Integrations</h1>
      <p className="account-overview__subtitle">Connect websites, checkout, bookings, sheets, and Apps Script tools without editing Firestore.</p>

      <nav className="account-overview__tabs" aria-label="Integration sections">
        {([
          ['website', 'Website + checkout'],
          ['api', 'API endpoints'],
          ['booking', 'Booking sheet sync'],
          ['email', 'Email Apps Script'],
          ['keys', 'Website API key'],
        ] as Array<[IntegrationTab, string]>).map(([id, label]) => (
          <button key={id} type="button" className={`account-overview__tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'website' && (
        <div className="account-overview__website-sync">
          <h2>Website + checkout setup</h2>
          <p className="account-overview__hint">Save the website URLs and checkout configuration. Use one Website API key for products, bookings, availability, and checkout.</p>
          <div className="account-overview__form-grid">
            <label><span>Website domain</span><input value={draft.websiteDomain} onChange={event => update('websiteDomain', event.target.value)} placeholder="https://www.example.com" /></label>
            <label><span>Checkout return URL</span><input value={draft.checkoutReturnUrl} onChange={event => update('checkoutReturnUrl', event.target.value)} placeholder="https://www.example.com/payment/return" /></label>
            <label><span>Checkout cancel URL</span><input value={draft.checkoutCancelUrl} onChange={event => update('checkoutCancelUrl', event.target.value)} placeholder="https://www.example.com/payment/return?status=cancelled" /></label>
            <label><span>Sedifex API base URL</span><input value={draft.apiBaseUrl} onChange={event => update('apiBaseUrl', event.target.value)} /></label>
            <label><span>Checkout create URL</span><input value={draft.checkoutCreateUrl} onChange={event => update('checkoutCreateUrl', event.target.value)} /></label>
            <label><span>Contract version</span><input value={draft.contractVersion} onChange={event => update('contractVersion', event.target.value)} /></label>
          </div>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(storeId, 'Store ID')}>Copy Store ID</button>
            <button type="button" className="button button--secondary" onClick={() => copy(draft.checkoutCreateUrl || DEFAULT_CHECKOUT_CREATE_URL, 'Checkout create URL')}>Copy checkout URL</button>
            <button type="button" className="button" onClick={saveWebsite} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save website setup'}</button>
          </div>
        </div>
      )}

      {tab === 'api' && (
        <div className="account-overview__website-sync">
          <h2>API endpoints</h2>
          <p className="account-overview__hint">These endpoints all use the same Website API key. No separate Product key and Booking key are needed.</p>
          <div className="account-overview__form-grid">
            <label><span>Sedifex API base URL</span><input value={draft.apiBaseUrl} onChange={event => update('apiBaseUrl', event.target.value)} /></label>
            <label><span>Contract version</span><input value={draft.contractVersion} onChange={event => update('contractVersion', event.target.value)} /></label>
          </div>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/v1IntegrationProducts'), 'Products/services endpoint')}>Copy products/services endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/v1IntegrationBookings'), 'Bookings endpoint')}>Copy bookings endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(`${endpoint('/v1IntegrationAvailability')}&serviceId=SERVICE_ID&from=FROM_ISO&to=TO_ISO`, 'Availability endpoint')}>Copy availability endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/integrationGallery'), 'Gallery endpoint')}>Copy gallery endpoint</button>
            <button type="button" className="button" onClick={saveApiBaseSettings} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save API settings'}</button>
          </div>
        </div>
      )}

      {tab === 'booking' && (
        <div className="account-overview__website-sync">
          <h2>Booking sheet sync</h2>
          <p className="account-overview__hint">This is only for sending Sedifex booking records into a Google Sheet through Apps Script. Website booking forms use the Website API key.</p>
          <div className="account-overview__form-grid">
            <label><span>Booking Apps Script Web App URL</span><input value={draft.bookingWebAppUrl} onChange={event => update('bookingWebAppUrl', event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></label>
            <label><span>Booking webhook secret (optional)</span><input type="password" value={draft.bookingSecret} onChange={event => update('bookingSecret', event.target.value)} placeholder="Optional shared secret" /></label>
            <label><span>From name</span><input value={draft.bookingFromName} onChange={event => update('bookingFromName', event.target.value)} placeholder="Kwaku Lotteryy" /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.bookingRequireSecret} onChange={event => update('bookingRequireSecret', event.target.checked)} />Require secret in Apps Script</label>
          </div>
          <button type="button" className="button" onClick={saveBooking} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save booking sync'}</button>
        </div>
      )}

      {tab === 'email' && (
        <div className="account-overview__website-sync">
          <h2>Email Apps Script</h2>
          <div className="account-overview__form-grid">
            <label><span>Email Apps Script Web App URL</span><input value={draft.emailWebAppUrl} onChange={event => update('emailWebAppUrl', event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></label>
            <label><span>Shared token</span><input type="password" value={draft.emailSharedToken} onChange={event => update('emailSharedToken', event.target.value)} /></label>
            <label><span>From name</span><input value={draft.emailFromName} onChange={event => update('emailFromName', event.target.value)} /></label>
          </div>
          <button type="button" className="button" onClick={saveEmail} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save email integration'}</button>
        </div>
      )}

      {tab === 'keys' && (
        <div className="account-overview__website-sync">
          <h2>Website API key</h2>
          <p className="account-overview__hint">Create one key and use it for products/services, gallery, bookings, availability, and checkout. Creating a new key is a rotation action; save it immediately because it is shown once.</p>

          <section className="account-overview__card" style={{ margin: 0 }}>
            <h3>One key for this website</h3>
            <p className="account-overview__hint">Use this same key in Vercel as SEDIFEX_INTEGRATION_API_KEY, SEDIFEX_PRODUCTS_API_KEY, and SEDIFEX_BOOKING_API_KEY.</p>
            <button type="button" className="button" onClick={createWebsiteKey} disabled={isSaving}>
              {isCreatingKey ? 'Creating…' : keys.length ? 'Rotate / create new website key' : 'Create website API key'}
            </button>
          </section>

          {latestToken ? (
            <div className="account-overview__integration-token-notice">
              <p><strong>Save this key now. It is shown once.</strong></p>
              <p className="account-overview__hint">Paste this same key into all three Vercel key variables.</p>
              <code className="account-overview__integration-token-value">{latestToken}</code>
              <div className="account-overview__website-sync-actions">
                <button type="button" className="button button--secondary" onClick={() => copy(latestToken, 'Website API key')}>Copy key again</button>
                <button type="button" className="button button--secondary" onClick={() => copy(envTemplate, 'Vercel env template')}>Copy Vercel env template</button>
              </div>
            </div>
          ) : null}

          <div className="account-overview__integration-token-notice">
            <p><strong>Vercel values to use</strong></p>
            <code className="account-overview__integration-token-value" style={{ whiteSpace: 'pre-wrap' }}>{envTemplate}</code>
            <div className="account-overview__website-sync-actions">
              <button type="button" className="button button--secondary" onClick={() => copy(envTemplate, 'Vercel env template')}>Copy env template</button>
            </div>
          </div>

          {keysLoading ? <p>Loading keys…</p> : keys.length ? (
            <div className="account-overview__card" style={{ marginTop: 16 }}>
              <h3>Saved keys in this workspace</h3>
              <p className="account-overview__hint">Use the latest active website key. Old product/booking keys are kept for compatibility, but new websites only need one key.</p>
              <div className="account-overview__form-grid">
                {keys.map(key => (
                  <div key={key.id} className="account-overview__card" style={{ margin: 0 }}>
                    <strong>{key.name}</strong>
                    <p className="account-overview__hint">Purpose: {key.purpose} · Status: {key.status}</p>
                    <code>{key.keyPreview}</code>
                    <p className="account-overview__hint">Created: {formatDate(key.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="account-overview__hint">No saved API keys yet.</p>}
        </div>
      )}
    </section>
  )
}
