import { auth } from '../firebase'

export type GoogleIntegrationKey = 'business' | 'ads' | 'merchant'
export type GoogleIntegrationStatus = 'Connected' | 'Needs permission' | 'Developer token required'

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

export async function startGoogleOAuth(params: { storeId: string; integrations: GoogleIntegrationKey[] }) {
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
  const headers = await authHeaders()
  const response = await fetch('/api/google/status', {
    method: 'POST',
    headers,
    body: JSON.stringify({ storeId }),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load Google integration status.')
  }

  return {
    business: payload.business === 'Connected' ? 'Connected' : 'Needs permission',
    ads:
      payload.ads === 'Connected'
        ? 'Connected'
        : payload.ads === 'Developer token required'
          ? 'Developer token required'
          : 'Needs permission',
    merchant: payload.merchant === 'Connected' ? 'Connected' : 'Needs permission',
  }
}
