import React, { useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { serverTimestamp, type Timestamp } from 'firebase/firestore'
import { functions } from '../firebase'
import { useToast } from './ToastProvider'

type KeyPurpose = 'product' | 'booking'
type KeyRow = { id: string; name: string; status: string; keyPreview: string; createdAt: Timestamp | null; purpose?: KeyPurpose }

type Props = {
  storeId: string
  keys: KeyRow[]
  keysLoading: boolean
  isSaving: boolean
  setIsSaving: (value: boolean) => void
  refreshKeys: () => Promise<void>
  saveKeyPreview: (payload: Record<string, unknown>) => Promise<void>
  envBlock: string
}

const DEFAULT_NAMES: Record<KeyPurpose, string> = {
  product: 'Website product/integration key',
  booking: 'Website booking/checkout key',
}

function labelFor(purpose: KeyPurpose) {
  return purpose === 'product' ? 'Product / Integration key' : 'Booking / Checkout key'
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function formatTimestamp(timestamp: Timestamp | null) {
  if (!timestamp) return '—'
  try {
    return timestamp.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function inferPurpose(key: KeyRow): KeyPurpose {
  if (key.purpose) return key.purpose
  const name = key.name.toLowerCase()
  if (name.includes('booking') || name.includes('checkout') || name.includes('payment')) return 'booking'
  return 'product'
}

export function WebsiteApiKeysPanel({ storeId, keys, keysLoading, isSaving, setIsSaving, refreshKeys, saveKeyPreview, envBlock }: Props) {
  const { publish } = useToast()
  const [purpose, setPurpose] = useState<KeyPurpose>('product')
  const [keyName, setKeyName] = useState(DEFAULT_NAMES.product)
  const [latestProductToken, setLatestProductToken] = useState('')
  const [latestBookingToken, setLatestBookingToken] = useState('')

  const currentToken = purpose === 'product' ? latestProductToken : latestBookingToken
  const visibleKeys = useMemo(() => keys.filter(key => inferPurpose(key) === purpose), [keys, purpose])

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    publish({ message: `${label} copied.`, tone: 'success' })
  }

  function selectPurpose(nextPurpose: KeyPurpose) {
    setPurpose(nextPurpose)
    setKeyName(DEFAULT_NAMES[nextPurpose])
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
        purpose,
        keyPurpose: purpose,
        keyType: purpose === 'product' ? 'product_read' : 'booking_checkout',
        scopes: purpose === 'product'
          ? ['products:read', 'services:read', 'promo:read', 'gallery:read']
          : ['bookings:write', 'checkout:create'],
      })
      const token = text((response.data as Record<string, unknown> | undefined)?.token)
      const keyPreview = token ? `${token.slice(0, 4)}••••${token.slice(-4)}` : 'masked preview only'

      await saveKeyPreview({
        integrationApi: {
          keyName: keyName.trim(),
          keyPreview,
          latestProductKeyPreview: purpose === 'product' ? keyPreview : undefined,
          latestBookingKeyPreview: purpose === 'booking' ? keyPreview : undefined,
          updatedAt: serverTimestamp(),
        },
        latestIntegrationApiKeyPreview: keyPreview,
        latestProductIntegrationKeyPreview: purpose === 'product' ? keyPreview : undefined,
        latestBookingCheckoutKeyPreview: purpose === 'booking' ? keyPreview : undefined,
        updatedAt: serverTimestamp(),
      })

      if (token) {
        if (purpose === 'product') setLatestProductToken(token)
        else setLatestBookingToken(token)
        await copy(token, labelFor(purpose))
        publish({ message: `${labelFor(purpose)} copied.`, tone: 'success' })
      }

      await refreshKeys()
    } catch (err) {
      console.error('[integrations] failed to create key', err)
      publish({ message: 'Unable to create API key.', tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="account-overview__website-sync">
      <h2>Website API keys</h2>
      <p className="account-overview__hint">Create two separate website keys. Use the product key for product/service/promo/gallery reads, and the booking key for bookings and checkout.</p>

      <nav className="account-overview__tabs" aria-label="Website API key types">
        {(['product', 'booking'] as KeyPurpose[]).map(item => (
          <button key={item} type="button" className={`account-overview__tab ${purpose === item ? 'is-active' : ''}`} onClick={() => selectPurpose(item)}>
            {labelFor(item)}
          </button>
        ))}
      </nav>

      <div className="account-overview__integration-token-notice">
        <p><strong>{labelFor(purpose)}</strong></p>
        {purpose === 'product' ? (
          <p className="account-overview__hint">Put this key on the client website as <code>SEDIFEX_INTEGRATION_API_KEY</code>. It pulls products, services, courses, promo, and gallery.</p>
        ) : (
          <p className="account-overview__hint">Put this key on the client website as <code>SEDIFEX_BOOKING_API_KEY</code> and <code>SEDIFEX_CHECKOUT_API_KEY</code>. It creates bookings and checkout links.</p>
        )}
      </div>

      <div className="account-overview__website-sync-test">
        <label><span>New key name</span><input value={keyName} onChange={event => setKeyName(event.target.value)} placeholder={DEFAULT_NAMES[purpose]} /></label>
        <button type="button" className="button" onClick={createKey} disabled={isSaving}>{isSaving ? 'Creating…' : 'Create and copy key'}</button>
      </div>

      {currentToken ? (
        <div className="account-overview__integration-token-notice">
          <p><strong>Save this key now. It is shown once.</strong></p>
          <code className="account-overview__integration-token-value">{currentToken}</code>
          <div className="account-overview__website-sync-actions">
            <button type="button" className="button button--secondary" onClick={() => copy(currentToken, labelFor(purpose))}>Copy this key</button>
            <button type="button" className="button button--secondary" onClick={() => copy(envBlock, 'Developer env block')}>Copy developer env block</button>
          </div>
        </div>
      ) : null}

      {keysLoading ? <p>Loading keys…</p> : (
        <ul className="account-overview__integration-key-list">
          {visibleKeys.map(item => (
            <li key={item.id} className="account-overview__integration-key-item">
              <div>
                <strong>{item.name}</strong>
                <p className="account-overview__hint">{labelFor(inferPurpose(item))} · {item.keyPreview} · {item.status} · Created {formatTimestamp(item.createdAt)}</p>
              </div>
            </li>
          ))}
          {!visibleKeys.length ? <li className="account-overview__integration-key-item"><p className="account-overview__hint">No {purpose === 'product' ? 'product/integration' : 'booking/checkout'} keys yet.</p></li> : null}
        </ul>
      )}
    </div>
  )
}
