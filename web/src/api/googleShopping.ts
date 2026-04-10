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

export type GoogleMerchantAccount = {
  id: string
  displayName: string
  accountName: string
}

type JsonResponse<T> = T & { error?: string }

async function getToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required.')
  return user.getIdToken()
}

async function authedPost<T>(functionName: string, payload: unknown): Promise<T> {
  const token = await getToken()
  const response = await fetch(getCallableEndpoint(functionName), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = (await response.json().catch(() => ({}))) as JsonResponse<T>
  if (!response.ok) {
    throw new Error(body.error || 'Request failed.')
  }

  return body as T
}


export async function getGoogleMerchantPendingAccounts(params: {
  pendingSelectionId: string
}): Promise<{ storeId: string; accounts: GoogleMerchantAccount[]; refreshTokenMissing: boolean }> {
  const payload = await authedPost<{
    storeId?: string
    accounts?: GoogleMerchantAccount[]
    refreshTokenMissing?: boolean
  }>('googleMerchantPendingAccounts', params)

  return {
    storeId: payload.storeId || '',
    accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
    refreshTokenMissing: payload.refreshTokenMissing === true,
  }
}

export async function selectGoogleMerchantAccount(params: {
  pendingSelectionId: string
  merchantId: string
}): Promise<{ merchantId: string; refreshTokenMissing: boolean }> {
  const payload = await authedPost<{ merchantId?: string; refreshTokenMissing?: boolean }>(
    'googleMerchantSelectAccount',
    params,
  )

  if (!payload.merchantId) throw new Error('Unable to save your Merchant account selection.')

  return {
    merchantId: payload.merchantId,
    refreshTokenMissing: payload.refreshTokenMissing === true,
  }
}

export async function triggerGoogleShoppingSync(params: {
  storeId: string
  mode: GoogleShoppingSyncMode
}): Promise<GoogleShoppingSyncSummary> {
  const payload = await authedPost<{ summary?: GoogleShoppingSyncSummary }>('googleShoppingSync', params)

  if (!payload.summary) {
    throw new Error('Unable to sync Google Shopping catalog right now.')
  }

  return payload.summary
}

export async function ensureGoogleShoppingSetupConfig(params: {
  storeId: string
}): Promise<{
  integrationApiKey: string
  integrationBaseUrl: string
  autoSyncEnabled: boolean
  generated: boolean
}> {
  const payload = await authedPost<{
    integrationApiKey?: string
    integrationBaseUrl?: string
    autoSyncEnabled?: boolean
    generated?: boolean
  }>('googleShoppingSetupConfig', params)

  return {
    integrationApiKey: typeof payload.integrationApiKey === 'string' ? payload.integrationApiKey : '',
    integrationBaseUrl:
      typeof payload.integrationBaseUrl === 'string'
        ? payload.integrationBaseUrl
        : 'https://us-central1-sedifex-web.cloudfunctions.net',
    autoSyncEnabled: payload.autoSyncEnabled !== false,
    generated: payload.generated === true,
  }
}
