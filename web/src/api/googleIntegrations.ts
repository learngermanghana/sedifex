import { auth } from '../firebase'

export type GoogleIntegrationKey = 'business' | 'ads' | 'merchant'
export type GoogleIntegrationStatus = 'Connected' | 'Needs permission' | 'Developer token required'

export type MerchantConnectionState =
  | 'google_not_connected'
  | 'merchant_scope_missing'
  | 'merchant_account_not_selected'
  | 'refresh_token_missing'
  | 'merchant_connected'
  | 'product_sync_blocked_validation'
  | 'sync_ready'

export type MerchantValidationSummary = {
  missingTitle: number
  missingDescription: number
  missingImage: number
  missingPrice: number
  missingBrand: number
  missingGtinOrMpnOrSku: number
  blockingCount: number
}

export type GoogleMerchantReadiness = {
  state: MerchantConnectionState
  googleConnected: boolean
  hasMerchantScope: boolean
  merchantAccountSelected: boolean
  merchantId: string
  refreshTokenPresent: boolean
  merchantConnected: boolean
  syncReady: boolean
  validationSummary: MerchantValidationSummary
}

export type GoogleIntegrationOverview = {
  connected: boolean
  integrations: Record<GoogleIntegrationKey, { connected: boolean; hasRequiredScope: boolean }>
  grantedScopes: string[]
  merchant: GoogleMerchantReadiness
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
  const rawMerchant = (payload.merchant ?? {}) as Record<string, unknown>
  const rawValidationSummary = (rawMerchant.validationSummary ?? {}) as Record<string, unknown>

  return {
    connected,
    integrations: integrationStates,
    grantedScopes,
    merchant: {
      state:
        rawMerchant.state === 'google_not_connected' ||
        rawMerchant.state === 'merchant_scope_missing' ||
        rawMerchant.state === 'merchant_account_not_selected' ||
        rawMerchant.state === 'refresh_token_missing' ||
        rawMerchant.state === 'merchant_connected' ||
        rawMerchant.state === 'product_sync_blocked_validation' ||
        rawMerchant.state === 'sync_ready'
          ? rawMerchant.state
          : 'google_not_connected',
      googleConnected: rawMerchant.googleConnected === true,
      hasMerchantScope: rawMerchant.hasMerchantScope === true,
      merchantAccountSelected: rawMerchant.merchantAccountSelected === true,
      merchantId: typeof rawMerchant.merchantId === 'string' ? rawMerchant.merchantId : '',
      refreshTokenPresent: rawMerchant.refreshTokenPresent === true,
      merchantConnected: rawMerchant.merchantConnected === true,
      syncReady: rawMerchant.syncReady === true,
      validationSummary: {
        missingTitle: typeof rawValidationSummary.missingTitle === 'number' ? rawValidationSummary.missingTitle : 0,
        missingDescription:
          typeof rawValidationSummary.missingDescription === 'number' ? rawValidationSummary.missingDescription : 0,
        missingImage: typeof rawValidationSummary.missingImage === 'number' ? rawValidationSummary.missingImage : 0,
        missingPrice: typeof rawValidationSummary.missingPrice === 'number' ? rawValidationSummary.missingPrice : 0,
        missingBrand: typeof rawValidationSummary.missingBrand === 'number' ? rawValidationSummary.missingBrand : 0,
        missingGtinOrMpnOrSku:
          typeof rawValidationSummary.missingGtinOrMpnOrSku === 'number'
            ? rawValidationSummary.missingGtinOrMpnOrSku
            : 0,
        blockingCount: typeof rawValidationSummary.blockingCount === 'number' ? rawValidationSummary.blockingCount : 0,
      },
    },
  }
}
