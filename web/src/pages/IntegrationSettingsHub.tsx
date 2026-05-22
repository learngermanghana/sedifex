import React, { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type IntegrationTab = 'website' | 'products' | 'bookingsApi' | 'booking' | 'email' | 'keys'
type Props = { defaultTab?: IntegrationTab }
type KeyRow = { id: string; name: string; status: string; keyPreview: string; createdAt: Timestamp | null }

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
const API_KEY_PLACEHOLDER = 'PASTE_CREATED_SEDIFEX_API_KEY_HERE'

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function formatTimestamp(timestamp: Timestamp | null) {
  if (!timestamp) return '—'
  try {
    return timestamp.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function normalize(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
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
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [keyName, setKeyName] = useState('Website production key')
  const [latestToken, setLatestToken] = useState('')

  const canSave = Boolean(storeId && user)
  const apiBaseUrl = trimTrailingSlash(draft.apiBaseUrl || DEFAULT_BASE_URL)
  const apiKeyValue = latestToken || API_KEY_PLACEHOLDER
  const contractVersion = draft.contractVersion || DEFAULT_CONTRACT_VERSION

  function endpoint(path: string) {
    if (!storeId) return ''
    return `${apiBaseUrl}${path}?storeId=${storeId}`
  }

  const envBlock = useMemo(() => {
    if (!storeId) return ''
    const checkoutCreateUrl = draft.checkoutCreateUrl || DEFAULT_CHECKOUT_CREATE_URL
    const returnUrl = draft.checkoutReturnUrl || 'https://yourwebsite.com/payment/return'
    return [
      `SEDIFEX_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL=${checkoutCreateUrl}`,
      `SEDIFEX_BOOKING_TARGET_STORE_ID=${storeId}`,
      `SEDIFEX_STORE_ID=${storeId}`,
      `SEDIFEX_BOOKING_API_KEY=${apiKeyValue}`,
      `SEDIFEX_CHECKOUT_API_KEY=${apiKeyValue}`,
      `SEDIFEX_CONTRACT_VERSION=${contractVersion}`,
      `SEDIFEX_CHECKOUT_RETURN_URL=${returnUrl}`,
      `NEXT_PUBLIC_SEDIFEX_STORE_ID=${storeId}`,
    ].join('\n')
  }, [apiBaseUrl, apiKeyValue, contractVersion, draft.checkoutCreateUrl, draft.checkoutReturnUrl, storeId])

  const productsEnvBlock = useMemo(() => {
    if (!storeId) return ''
    return [
      `SEDIFEX_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_STORE_ID=${storeId}`,
      `NEXT_PUBLIC_SEDIFEX_STORE_ID=${storeId}`,
      `SEDIFEX_INTEGRATION_API_KEY=${apiKeyValue}`,
      `SEDIFEX_CONTRACT_VERSION=${contractVersion}`,
      '',
      `# Products and content feeds`,
      `SEDIFEX_PRODUCTS_ENDPOINT=${endpoint('/v1IntegrationProducts')}`,
      `SEDIFEX_PROMO_ENDPOINT=${endpoint('/v1IntegrationPromo')}`,
      `SEDIFEX_GALLERY_ENDPOINT=${endpoint('/integrationGallery')}`,
      `SEDIFEX_TOP_SELLING_ENDPOINT=${endpoint('/integrationTopSelling')}&days=30&limit=10`,
    ].join('\n')
  }, [apiBaseUrl, apiKeyValue, contractVersion, storeId])

  const bookingsEnvBlock = useMemo(() => {
    if (!storeId) return ''
    return [
      `SEDIFEX_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_STORE_ID=${storeId}`,
      `SEDIFEX_BOOKING_TARGET_STORE_ID=${storeId}`,
      `SEDIFEX_BOOKING_API_KEY=${apiKeyValue}`,
      `SEDIFEX_CONTRACT_VERSION=${contractVersion}`,
      '',
      `# Booking and availability API`,
      `SEDIFEX_AVAILABILITY_ENDPOINT=${endpoint('/v1IntegrationAvailability')}&serviceId=SERVICE_ID&from=FROM_ISO&to=TO_ISO`,
      `SEDIFEX_BOOKINGS_ENDPOINT=${endpoint('/v1IntegrationBookings')}`,
    ].join('\n')
  }, [apiBaseUrl, apiKeyValue, contractVersion, storeId])

  function update(key: keyof Draft, value: string | boolean) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    publish({ message: `${label} copied.`, tone: 'success' })
  }

  async function refreshKeys() {
    try {
      setKeysLoading(true)
      const callable = httpsCallable(functions, 'listIntegrationApiKeys')
      const response = await callable({})
      const data = (response.data ?? {}) as { keys?: Array<Record<string, unknown>> }
      setKeys((data.keys ?? []).map(item => ({
        id: text(item.id),
        name: text(item.name) || 'Unnamed key',
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
          baseUrl: normalize(draft.apiBaseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: normalize(draft.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: normalize(draft.contractVersion) || DEFAULT_CONTRACT_VERSION,
          updatedAt: serverTimestamp(),
        },
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

  async function createKey() {
    if (!keyName.trim()) {
      publish({ message: 'Enter a key name first.', tone: 'error' })
      return
    }
    try {
      setIsSaving(true)
      const callable = httpsCallable(functions, 'createIntegrationApiKey')
      const response = await callable({
        name: keyName.trim(),
        storeId,
      })
      const token = text((response.data as Record<string, unknown> | undefined)?.token)
      const keyPreview = 'masked preview only'
      const integrationApiPayload = {
        integrationApi: {
          enabled: true,
          baseUrl: normalize(draft.apiBaseUrl) || DEFAULT_BASE_URL,
          checkoutCreateUrl: normalize(draft.checkoutCreateUrl) || DEFAULT_CHECKOUT_CREATE_URL,
          contractVersion: normalize(draft.contractVersion) || DEFAULT_CONTRACT_VERSION,
          keyName: keyName.trim(),
          keyPreview,
          updatedAt: serverTimestamp(),
        },
        integrationApiEnabled: true,
        latestIntegrationApiKeyPreview: keyPreview,
        updatedAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId), integrationApiPayload, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), integrationApiPayload, { merge: true }),
      ])
      if (token) {
        setLatestToken(token)
        await copy(token, 'New API key')
        publish({ message: 'New API key copied. The developer env block now includes it.', tone: 'success' })
      }
      await refreshKeys()
    } catch (err) {
      console.error('[integrations] failed to create key', err)
      publish({ message: 'Unable to create API key.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  if (error) return <div role="alert">{error}</div>
  if (isLoading) return <p role="status">Loading integrations…</p>
  if (!storeId) return <p>Select a workspace to manage integrations.</p>

  return (
    <section className="account-overview" aria-labelledby="integrations-title">
      <h1 id="integrations-title">Integrations</h1>
      <p className="account-overview__subtitle">
        Save website, product feed, checkout, booking, sheet, and API settings here. No Firestore editing needed.
      </p>

      <nav className="account-overview__tabs" aria-label="Integration sections">
        {([
          ['website', 'Website + checkout'],
          ['products', 'Products API'],
          ['bookingsApi', 'Bookings API'],
          ['booking', 'Booking sheet sync'],
          ['email', 'Email Apps Script'],
          ['keys', 'API keys'],
        ] as Array<[IntegrationTab, string]>).map(([id, label]) => (
          <button key={id} type="button" className={`account-overview__tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'website' && (
        <div className="account-overview__website-sync">
          <h2>Website + checkout setup</h2>
          <p className="account-overview__hint">Use these values on Glittering, Kwaku, Pirus, or any client website that connects to Sedifex. Create an API key in the API keys tab first if you want this block to include the actual key.</p>
          <div className="account-overview__form-grid">
            <label><span>Website domain</span><input value={draft.websiteDomain} onChange={event => update('websiteDomain', event.target.value)} placeholder="https://www.example.com" /></label>
            <label><span>Checkout return URL</span><input value={draft.checkoutReturnUrl} onChange={event => update('checkoutReturnUrl', event.target.value)} placeholder="https://www.example.com/payment/return" /></label>
            <label><span>Checkout cancel URL</span><input value={draft.checkoutCancelUrl} onChange={event => update('checkoutCancelUrl', event.target.value)} placeholder="https://www.example.com/payment/return?status=cancelled" /></label>
            <label><span>Sedifex API base URL</span><input value={draft.apiBaseUrl} onChange={event => update('apiBaseUrl', event.target.value)} /></label>
            <label><span>Checkout create URL</span><input value={draft.checkoutCreateUrl} onChange={event => update('checkoutCreateUrl', event.target.value)} /></label>
            <label><span>Contract version</span><input value={draft.contractVersion} onChange={event => update('contractVersion', event.target.value)} /></label>
          </div>
          <div className="account-overview__integration-token-notice">
            <p><strong>Developer env block</strong></p>
            <p className="account-overview__hint">Give this to the website developer. API keys must stay server-side in Vercel or the website backend.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{envBlock}</pre>
          </div>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(storeId, 'Store ID')}>Copy Store ID</button>
            <button type="button" className="button button--secondary" onClick={() => copy(envBlock, latestToken ? 'Developer env block with key' : 'Developer env block')}>Copy developer env block</button>
            <button type="button" className="button" onClick={saveWebsite} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save website setup'}</button>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="account-overview__website-sync">
          <h2>Products API</h2>
          <p className="account-overview__hint">Use this tab when a client website needs to pull Sedifex products, services, promo content, gallery images, or top-selling items. This is different from checkout setup.</p>
          <div className="account-overview__form-grid">
            <label><span>Sedifex API base URL</span><input value={draft.apiBaseUrl} onChange={event => update('apiBaseUrl', event.target.value)} /></label>
            <label><span>Contract version</span><input value={draft.contractVersion} onChange={event => update('contractVersion', event.target.value)} /></label>
          </div>
          <div className="account-overview__integration-token-notice">
            <p><strong>Product/content endpoints</strong></p>
            <ul className="account-overview__hint">
              <li><code>GET /v1IntegrationProducts?storeId={storeId}</code> — products and services</li>
              <li><code>GET /v1IntegrationPromo?storeId={storeId}</code> — promo content</li>
              <li><code>GET /integrationGallery?storeId={storeId}</code> — gallery images</li>
              <li><code>GET /integrationTopSelling?storeId={storeId}&days=30&limit=10</code> — top selling items</li>
            </ul>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{productsEnvBlock}</pre>
          </div>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/v1IntegrationProducts'), 'Products endpoint')}>Copy products endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/v1IntegrationPromo'), 'Promo endpoint')}>Copy promo endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/integrationGallery'), 'Gallery endpoint')}>Copy gallery endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(productsEnvBlock, latestToken ? 'Products API env block with key' : 'Products API env block')}>Copy products env block</button>
            <button type="button" className="button" onClick={saveApiBaseSettings} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save API settings'}</button>
          </div>
        </div>
      )}

      {tab === 'bookingsApi' && (
        <div className="account-overview__website-sync">
          <h2>Bookings API</h2>
          <p className="account-overview__hint">Use this tab when a client website needs to check availability or submit bookings directly to Sedifex. Keep the API key server-side in the website backend.</p>
          <div className="account-overview__form-grid">
            <label><span>Sedifex API base URL</span><input value={draft.apiBaseUrl} onChange={event => update('apiBaseUrl', event.target.value)} /></label>
            <label><span>Contract version</span><input value={draft.contractVersion} onChange={event => update('contractVersion', event.target.value)} /></label>
          </div>
          <div className="account-overview__integration-token-notice">
            <p><strong>Booking endpoints</strong></p>
            <ul className="account-overview__hint">
              <li><code>GET /v1IntegrationAvailability?storeId={storeId}&serviceId=SERVICE_ID&from=FROM_ISO&to=TO_ISO</code> — check available slots</li>
              <li><code>GET /v1IntegrationBookings?storeId={storeId}</code> — list bookings for integration use</li>
              <li><code>POST /v1IntegrationBookings?storeId={storeId}</code> — submit a website booking</li>
            </ul>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{bookingsEnvBlock}</pre>
          </div>
          <div className="account-overview__integration-token-notice">
            <p><strong>Booking payload starter</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{`{
  "customerName": "Customer name",
  "customerEmail": "customer@example.com",
  "customerPhone": "+233240000000",
  "serviceId": "SERVICE_ID",
  "serviceName": "Service name",
  "bookingDate": "2026-05-22",
  "bookingTime": "10:00",
  "notes": "Optional notes",
  "source": "client_website",
  "attributes": {}
}`}</pre>
          </div>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(endpoint('/v1IntegrationBookings'), 'Bookings endpoint')}>Copy bookings endpoint</button>
            <button type="button" className="button button--secondary" onClick={() => copy(bookingsEnvBlock, latestToken ? 'Bookings API env block with key' : 'Bookings API env block')}>Copy bookings env block</button>
            <button type="button" className="button" onClick={saveApiBaseSettings} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save API settings'}</button>
          </div>
        </div>
      )}

      {tab === 'booking' && (
        <div className="account-overview__website-sync">
          <h2>Booking sheet sync</h2>
          <p className="account-overview__hint">This is only for syncing Sedifex bookings into a Google Sheet through Apps Script. For client website booking forms, use the Bookings API tab.</p>
          <div className="account-overview__form-grid">
            <label><span>Booking Apps Script Web App URL</span><input value={draft.bookingWebAppUrl} onChange={event => update('bookingWebAppUrl', event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></label>
            <label><span>Booking webhook secret (optional)</span><input type="password" value={draft.bookingSecret} onChange={event => update('bookingSecret', event.target.value)} placeholder="Optional shared secret" /></label>
            <label><span>From name</span><input value={draft.bookingFromName} onChange={event => update('bookingFromName', event.target.value)} placeholder="Glittering Med Spa" /></label>
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
          <h2>Website API keys</h2>
          <p className="account-overview__hint">Create a key, copy it once, and put it in the website environment as SEDIFEX_INTEGRATION_API_KEY, SEDIFEX_BOOKING_API_KEY, and SEDIFEX_CHECKOUT_API_KEY. The full key is shown once only.</p>
          <div className="account-overview__website-sync-test">
            <label><span>New key name</span><input value={keyName} onChange={event => setKeyName(event.target.value)} placeholder="Website production key" /></label>
            <button type="button" className="button" onClick={createKey} disabled={isSaving}>{isSaving ? 'Creating…' : 'Create and copy key'}</button>
          </div>
          {latestToken ? <div className="account-overview__integration-token-notice"><p><strong>Save this key now. It is shown once.</strong></p><code className="account-overview__integration-token-value">{latestToken}</code><div className="account-overview__website-sync-actions"><button type="button" className="button button--secondary" onClick={() => copy(envBlock, 'Developer env block with new key')}>Copy full developer env block with key</button></div></div> : null}
          {keysLoading ? <p>Loading keys…</p> : <ul className="account-overview__integration-key-list">{keys.map(item => <li key={item.id} className="account-overview__integration-key-item"><div><strong>{item.name}</strong><p className="account-overview__hint">{item.keyPreview} · {item.status} · Created {formatTimestamp(item.createdAt)}</p></div></li>)}</ul>}
        </div>
      )}
    </section>
  )
}
