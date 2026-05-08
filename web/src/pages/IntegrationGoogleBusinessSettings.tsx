import { useMemo, useState } from 'react'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useToast } from '../components/ToastProvider'

type GoogleBusinessStatus = {
  connected: boolean
  hasRequiredScope: boolean
}

async function postJson<T>(url: string, token: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `request-failed:${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export default function IntegrationGoogleBusinessSettings() {
  const user = useAuthUser()
  const { storeId, isLoading: isStoreLoading } = useActiveStore()
  const { publish } = useToast()

  const [status, setStatus] = useState<GoogleBusinessStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const connectionLabel = useMemo(() => {
    if (!status) return 'Unknown'
    if (status.connected && status.hasRequiredScope) return 'Connected'
    if (status.connected && !status.hasRequiredScope) return 'Connected (scope missing)'
    return 'Not connected'
  }, [status])

  async function handleCheckStatus() {
    if (!user || !storeId) return
    try {
      setChecking(true)
      const token = await user.getIdToken()
      const response = await postJson<{ integrations?: { business?: GoogleBusinessStatus } }>('/api/google/status', token, {
        storeId,
        integrations: ['business'],
      })
      const business = response.integrations?.business
      setStatus(business ?? { connected: false, hasRequiredScope: false })
    } catch (error) {
      console.error('[google-business] status check failed', error)
      publish({ tone: 'error', message: 'Unable to check Google Business connection.' })
    } finally {
      setChecking(false)
    }
  }

  async function handleConnectGoogleBusiness() {
    if (!user || !storeId) return
    try {
      setConnecting(true)
      const token = await user.getIdToken()
      const response = await postJson<{ url: string }>('/api/google/oauth-start', token, {
        storeId,
        integrations: ['business'],
      })
      if (!response.url) throw new Error('missing-oauth-url')
      window.location.assign(response.url)
    } catch (error) {
      console.error('[google-business] oauth start failed', error)
      publish({ tone: 'error', message: 'Unable to start Google Business connection.' })
      setConnecting(false)
    }
  }

  return (
    <PageSection
      title="Google Business Profile"
      subtitle="Connect your Sedifex workspace to Google so you can upload photos directly to your Business Profile locations."
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0 }}>
          <strong>Workspace:</strong> {storeId || 'No active workspace'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Connection status:</strong> {connectionLabel}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="button button--secondary" onClick={() => void handleCheckStatus()} disabled={!user || !storeId || isStoreLoading || checking || connecting}>
            {checking ? 'Checking…' : 'Check connection'}
          </button>
          <button type="button" className="button" onClick={() => void handleConnectGoogleBusiness()} disabled={!user || !storeId || isStoreLoading || connecting}>
            {connecting ? 'Redirecting…' : 'Connect Google Business'}
          </button>
        </div>
      </div>
    </PageSection>
  )
}
