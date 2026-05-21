import React, { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useToast } from '../components/ToastProvider'
import { WebsiteApiKeysPanel } from '../components/WebsiteApiKeysPanel'
import './AccountOverview.css'

type IntegrationTab = 'website' | 'booking' | 'email' | 'keys'
type KeyPurpose = 'product' | 'booking'
type Props = { defaultTab?: IntegrationTab }
type KeyRow = { id: string; name: string; status: string; keyPreview: string; createdAt: Timestamp | null; purpose?: KeyPurpose }

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
const PRODUCT_KEY_PLACEHOLDER = 'PASTE_PRODUCT_INTEGRATION_KEY_HERE'
const BOOKING_KEY_PLACEHOLDER = 'PASTE_BOOKING_CHECKOUT_KEY_HERE'

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

function deriveKeyPurpose(item: Record<string, unknown>): KeyPurpose {
  const combined = `${text(item.purpose)} ${text(item.keyPurpose)} ${text(item.keyType)} ${text(item.type)} ${text(item.name)}`.toLowerCase()
  if (combined.includes('booking') || combined.includes('checkout') || combined.includes('payment')) return 'booking'
  return 'product'
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

  const canSave = Boolean(storeId && user)

  const envBlock = useMemo(() => {
    if (!storeId) return ''
    const apiBaseUrl = draft.apiBaseUrl || DEFAULT_BASE_URL
    const checkoutCreateUrl = draft.checkoutCreateUrl || DEFAULT_CHECKOUT_CREATE_URL
    const returnUrl = draft.checkoutReturnUrl || 'https://yourwebsite.com/payment/return'
    return [
      `SEDIFEX_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_API_BASE_URL=${apiBaseUrl}`,
      `SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL=${checkoutCreateUrl}`,
      `SEDIFEX_BOOKING_TARGET_STORE_ID=${storeId}`,
      `SEDIFEX_STORE_ID=${storeId}`,
      `SEDIFEX_INTEGRATION_API_KEY=${PRODUCT_KEY_PLACEHOLDER}`,
      `SEDIFEX_BOOKING_API_KEY=${BOOKING_KEY_PLACEHOLDER}`,
      `SEDIFEX_CHECKOUT_API_KEY=${BOOKING_KEY_PLACEHOLDER}`,
      `SEDIFEX_CONTRACT_VERSION=${draft.contractVersion || DEFAULT_CONTRACT_VERSION}`,
      `SEDIFEX_CHECKOUT_RETURN_URL=${returnUrl}`,
      `NEXT_PUBLIC_SEDIFEX_STORE_ID=${storeId}`,
    ].join('\n')
  }, [draft.apiBaseUrl, draft.checkoutCreateUrl, draft.checkoutReturnUrl, draft.contractVersion, storeId])

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
        purpose: deriveKeyPurpose(item),
      })).filter(item => item.id))
    } catch (err) {
      console.error('[integrations] failed to load keys', err)
      publish({ message: 'Unable to load integration keys.', tone: 'error' })
      setKeys([])
    } finally {
      setKeysLoading(false)
    }
  }

  async function saveDocs(payload: Record<string, unknown>) {
    if (!storeId) return
    await Promise.all([
      setDoc(doc(db, 'stores', storeId), payload, { merge: true }),
      setDoc(doc(db, 'storeSettings', storeId), payload, { merge: true }),
    ])
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
      await saveDocs(payload)
      publish({ message: 'Website integration settings saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save website settings', err)
      publish({ message: 'Unable to save website integration settings.', tone: 'error' })
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
      await saveDocs(payload)
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
      await saveDocs({ bulkEmailIntegration, updatedAt: serverTimestamp() })
      publish({ message: 'Email integration saved.', tone: 'success' })
    } catch (err) {
      console.error('[integrations] failed to save email integration', err)
      publish({ message: 'Unable to save email integration.', tone: 'error' })
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
        Save all website, checkout, booking, sheet, and API settings here. No Firestore editing needed.
      </p>

      <nav className="account-overview__tabs" aria-label="Integration sections">
        {([
          ['website', 'Website + checkout'],
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
          <p className="account-overview__hint">Use these values on Glittering, Kwaku, Pirus, or any client website that connects to Sedifex. Create separate product/integration and booking/checkout keys in the API keys tab.</p>
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
            <button type="button" className="button button--secondary" onClick={() => copy(envBlock, 'Developer env block')}>Copy developer env block</button>
            <button type="button" className="button" onClick={saveWebsite} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save website setup'}</button>
          </div>
        </div>
      )}

      {tab === 'booking' && (
        <div className="account-overview__website-sync">
          <h2>Booking sheet sync</h2>
          <p className="account-overview__hint">Paste the Google Apps Script Web App URL used by the booking sheet. Sedifex will store it on the store and storeSettings docs.</p>
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
        <WebsiteApiKeysPanel
          storeId={storeId}
          keys={keys}
          keysLoading={keysLoading}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          refreshKeys={refreshKeys}
          saveKeyPreview={saveDocs}
          envBlock={envBlock}
        />
      )}
    </section>
  )
}
