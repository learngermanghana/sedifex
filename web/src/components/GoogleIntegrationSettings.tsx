import React, { useEffect, useState } from 'react'
import {
  fetchGoogleIntegrationStatus,
  startGoogleOAuth,
  type GoogleIntegrationKey,
  type GoogleIntegrationStatus,
} from '../api/googleIntegrations'

type Props = { storeId: string }

const ROWS: Array<{ key: GoogleIntegrationKey; label: string }> = [
  { key: 'business', label: 'Google Business Profile' },
  { key: 'ads', label: 'Google Ads' },
  { key: 'merchant', label: 'Google Merchant Center' },
]

export default function GoogleIntegrationSettings({ storeId }: Props) {
  const [statuses, setStatuses] = useState<Record<GoogleIntegrationKey, GoogleIntegrationStatus>>({
    business: 'Needs permission',
    ads: 'Needs permission',
    merchant: 'Needs permission',
  })
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<GoogleIntegrationKey | ''>('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthState = params.get('googleOAuth')
    if (oauthState === 'success') {
      setMessage(params.get('message') || 'Google OAuth connected.')
    } else if (oauthState === 'failed') {
      setMessage(params.get('message') || 'Google OAuth failed.')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchGoogleIntegrationStatus(storeId)
      .then(next => {
        if (mounted) setStatuses(next)
      })
      .catch(error => {
        if (mounted) setMessage(error instanceof Error ? error.message : 'Unable to load Google status.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [storeId])

  async function connect(integration: GoogleIntegrationKey) {
    setConnecting(integration)
    setMessage('')
    try {
      const url = await startGoogleOAuth({ storeId, integrations: [integration] })
      window.location.assign(url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start Google connection.')
      setConnecting('')
    }
  }

  return (
    <section className="account-overview__website-sync" aria-label="Google integrations">
      <p className="account-overview__website-sync-title">Google integrations</p>
      {loading ? <p className="account-overview__hint">Loading statuses…</p> : null}
      <ul className="account-overview__integration-key-list">
        {ROWS.map(row => (
          <li key={row.key} className="account-overview__integration-key-item">
            <div>
              <strong>{row.label}</strong>
              <p className="account-overview__hint">{statuses[row.key]}</p>
            </div>
            <button
              type="button"
              className="button button--secondary"
              disabled={connecting === row.key}
              onClick={() => connect(row.key)}
            >
              {connecting === row.key ? 'Connecting…' : statuses[row.key] === 'Connected' ? 'Upgrade/refresh permission' : 'Connect'}
            </button>
          </li>
        ))}
      </ul>
      {message ? <p className="account-overview__hint">{message}</p> : null}
    </section>
  )
}
