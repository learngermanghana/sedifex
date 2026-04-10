import { auth } from '../firebase'
import { getCallableEndpoint } from '../utils/offlineQueue'

export type GoogleShoppingSyncMode = 'full' | 'incremental'

export type GoogleShoppingSyncSummary = {
  mode: GoogleShoppingSyncMode
  totalProducts: number
  eligibleProducts: number
  invalidProducts: number
  createdOrUpdated: number
  removed: number
  disapproved: number
  errors: Array<{ productId: string; reason: string }>
}

async function getToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required.')
  return user.getIdToken()
}

export async function triggerGoogleShoppingSync(params: {
  storeId: string
  mode: GoogleShoppingSyncMode
}): Promise<GoogleShoppingSyncSummary> {
  const token = await getToken()
  const response = await fetch(getCallableEndpoint('googleShoppingSync'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    summary?: GoogleShoppingSyncSummary
  }

  if (!response.ok || !payload.summary) {
    throw new Error(payload.error || 'Unable to sync Google Shopping catalog right now.')
  }

  return payload.summary
}
