import { auth } from '../firebase'

export type GoogleIntegrationKey = 'business' | 'ads' | 'merchant'
export type GoogleIntegrationStatus = 'Connected' | 'Needs permission' | 'Developer token required'
export type GoogleIntegrationOverview = {
  connected: boolean
  integrations: Record<GoogleIntegrationKey, { connected: boolean; hasRequiredScope: boolean }>
  grantedScopes: string[]
}

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

export async function startGoogleOAuth(params: {
  storeId: string
  integrations: GoogleIntegrationKey[]
  customerId?: string
  managerId?: string
  accountEmail?: string
}) {
  const headers = await authHeaders()
  const response = await fetch('/api/google/oauth-start', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || typeof payload.url !== 'string') {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to start Google OAuth.')
  }

  return payload.url
}

export async function fetchGoogleIntegrationStatus(storeId: string): Promise<Record<GoogleIntegrationKey, GoogleIntegrationStatus>> {
  const overview = await fetchGoogleIntegrationOverview(storeId)
  return {
    business: overview.integrations.business.hasRequiredScope ? 'Connected' : 'Needs permission',
    ads: overview.integrations.ads.hasRequiredScope ? 'Connected' : 'Needs permission',
    merchant: overview.integrations.merchant.hasRequiredScope ? 'Connected' : 'Needs permission',
  }
}

export async function fetchGoogleIntegrationOverview(
  storeId: string,
  requestedIntegrations?: GoogleIntegrationKey[],
): Promise<GoogleIntegrationOverview> {
  const headers = await authHeaders()
  const response = await fetch('/api/google/status', {
    method: 'POST',
    headers,
    body: JSON.stringify({ storeId, integrations: requestedIntegrations }),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load Google integration status.')
  }

  const rawIntegrations = (payload.integrations ?? {}) as Record<string, unknown>
  const integrationStates: Record<GoogleIntegrationKey, { connected: boolean; hasRequiredScope: boolean }> = {
    business: {
      connected: Boolean((rawIntegrations.business as Record<string, unknown> | undefined)?.connected),
      hasRequiredScope: Boolean(
        (rawIntegrations.business as Record<string, unknown> | undefined)?.hasRequiredScope,
      ),
    },
    ads: {
      connected: Boolean((rawIntegrations.ads as Record<string, unknown> | undefined)?.connected),
      hasRequiredScope: Boolean((rawIntegrations.ads as Record<string, unknown> | undefined)?.hasRequiredScope),
    },
    merchant: {
      connected: Boolean((rawIntegrations.merchant as Record<string, unknown> | undefined)?.connected),
      hasRequiredScope: Boolean(
        (rawIntegrations.merchant as Record<string, unknown> | undefined)?.hasRequiredScope,
      ),
    },
  }
  const grantedScopes = Array.isArray(payload.grantedScopes)
    ? payload.grantedScopes.filter((scope): scope is string => typeof scope === 'string')
    : []
  const connected = payload.connected === true || grantedScopes.length > 0

  return {
    connected,
    integrations: integrationStates,
    grantedScopes,
  }
}
