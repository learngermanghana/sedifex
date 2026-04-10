import React, { useEffect, useState } from 'react'

import {
  fetchGoogleIntegrationStatus,
  startGoogleOAuth,
  type GoogleIntegrationKey,
  type GoogleIntegrationStatus,
} from '../api/googleIntegrations'
import { isReconnectRequiredError } from '../utils/googleOAuthCallback'

type Props = {
  storeId: string
  currentIntegration?: GoogleIntegrationKey
  message?: string | null
}

const ROWS: Array<{ key: GoogleIntegrationKey; label: string }> = [
  { key: 'ads', label: 'Ads status' },
  { key: 'business', label: 'Business status' },
  { key: 'merchant', label: 'Merchant status' },
]

export default function GoogleConnectionStatusCard({ storeId, currentIntegration, message }: Props) {
  const [statuses, setStatuses] = useState<Record<GoogleIntegrationKey, GoogleIntegrationStatus>>({
    business: 'Needs permission',
    ads: 'Needs permission',
    merchant: 'Needs permission',
  })
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<GoogleIntegrationKey | ''>('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchGoogleIntegrationStatus(storeId)
      .then(next => {
        if (mounted) setStatuses(next)
      })
      .catch(nextError => {
        if (mounted) setError(nextError instanceof Error ? nextError.message : 'Unable to load Google status.')
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
    setError('')
    try {
      const url = await startGoogleOAuth({ storeId, integrations: [integration] })
      window.location.assign(url)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start Google connection.')
      setConnecting('')
    }
  }

  const reconnectMessage = message && isReconnectRequiredError(message) ? 'Reconnect Google' : null

  return (
    <section className="google-shopping-panel" aria-label="Google connection status">
      <h2>Google connection status</h2>
      {loading ? <p className="google-shopping-panel__hint">Loading statuses…</p> : null}
      <ul className="account-overview__integration-key-list">
        {ROWS.map(row => {
          const actionable = currentIntegration === row.key
          const status = statuses[row.key]
          const needsReconnect = actionable && reconnectMessage

          return (
            <li key={row.key} className="account-overview__integration-key-item">
              <div>
                <strong>{row.label}</strong>
                <p className="account-overview__hint">{status}</p>
              </div>
              {actionable ? (
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={connecting === row.key}
                  onClick={() => connect(row.key)}
                >
                  {connecting === row.key
                    ? 'Connecting…'
                    : needsReconnect || (status === 'Connected' ? 'Upgrade/refresh permission' : 'Connect')}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {message ? <p className="google-shopping-panel__hint">{message}</p> : null}
      {!message && error ? <p className="google-shopping-panel__hint">{error}</p> : null}
    </section>
  )
}
