import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_firebase-admin.js'
import { requireApiUser, requireStoreMembership } from '../_api-auth.js'
import {
  GOOGLE_REQUIRED_SCOPE,
  getGoogleOAuthStateForStore,
  hasScope,
  type GoogleIntegration,
} from '../_google-oauth.js'

function requireStoreId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid-store-id')
  return raw.trim()
}

const ALL_INTEGRATIONS: GoogleIntegration[] = ['ads', 'business', 'merchant']

type ValidationSummary = {
  missingTitle: number
  missingDescription: number
  missingImage: number
  missingPrice: number
  missingBrand: number
  missingGtinOrMpnOrSku: number
  blockingCount: number
}

function parseRequestedIntegrations(rawIntegration: unknown, rawIntegrations: unknown): GoogleIntegration[] {
  const requested = Array.isArray(rawIntegrations) ? rawIntegrations : [rawIntegration]
  const unique = new Set<GoogleIntegration>()
  for (const entry of requested) {
    if (entry === 'ads' || entry === 'business' || entry === 'merchant') unique.add(entry)
  }
  return unique.size ? Array.from(unique) : ALL_INTEGRATIONS
}

function toValidationSummary(raw: unknown): ValidationSummary {
  const summary = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    missingTitle: typeof summary.missingTitle === 'number' ? summary.missingTitle : 0,
    missingDescription: typeof summary.missingDescription === 'number' ? summary.missingDescription : 0,
    missingImage: typeof summary.missingImage === 'number' ? summary.missingImage : 0,
    missingPrice: typeof summary.missingPrice === 'number' ? summary.missingPrice : 0,
    missingBrand: typeof summary.missingBrand === 'number' ? summary.missingBrand : 0,
    missingGtinOrMpnOrSku: typeof summary.missingGtinOrMpnOrSku === 'number' ? summary.missingGtinOrMpnOrSku : 0,
    blockingCount: typeof summary.blockingCount === 'number' ? summary.blockingCount : 0,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })

  try {
    const user = await requireApiUser(req)
    const storeId = requireStoreId(req.body?.storeId)
    const requestedIntegrations = parseRequestedIntegrations(req.body?.integration, req.body?.integrations)
    await requireStoreMembership(user.uid, storeId)

    const oauthState = await getGoogleOAuthStateForStore(storeId)
    const granted = oauthState.grantedScopes
    const grantedScopes = Array.from(granted)
    const connected = oauthState.connected
    const integrations = requestedIntegrations.reduce(
      (acc, integration) => {
        const hasRequiredScope = hasScope(granted, GOOGLE_REQUIRED_SCOPE[integration])
        acc[integration] = {
          connected: connected && hasRequiredScope,
          hasRequiredScope,
        }
        return acc
      },
      {} as Partial<Record<GoogleIntegration, { connected: boolean; hasRequiredScope: boolean }>>,
    )

    const merchantHasScope = hasScope(granted, GOOGLE_REQUIRED_SCOPE.merchant)
    const settingsSnap = await db().collection('storeSettings').doc(storeId).get()
    const settings = (settingsSnap.data() ?? {}) as Record<string, unknown>
    const googleShopping = (settings.googleShopping ?? {}) as Record<string, unknown>
    const connection = (googleShopping.connection ?? {}) as Record<string, unknown>
    const catalogSync = (googleShopping.catalogSync ?? {}) as Record<string, unknown>
    const shoppingStatus = (googleShopping.status ?? {}) as Record<string, unknown>

    const merchantId = typeof connection.merchantId === 'string' ? connection.merchantId.trim() : ''
    const merchantAccountSelected = merchantId.length > 0
    const refreshTokenPresent = typeof catalogSync.refreshToken === 'string' && catalogSync.refreshToken.trim().length > 0
    const merchantConnected = connection.connected === true && merchantAccountSelected
    const validationSummary = toValidationSummary(shoppingStatus.validationSummary)

    let merchantState:
      | 'google_not_connected'
      | 'merchant_scope_missing'
      | 'merchant_account_not_selected'
      | 'refresh_token_missing'
      | 'merchant_connected'
      | 'product_sync_blocked_validation'
      | 'sync_ready'

    if (!connected) {
      merchantState = 'google_not_connected'
    } else if (!merchantHasScope) {
      merchantState = 'merchant_scope_missing'
    } else if (!merchantAccountSelected) {
      merchantState = 'merchant_account_not_selected'
    } else if (!refreshTokenPresent) {
      merchantState = 'refresh_token_missing'
    } else if (!merchantConnected) {
      merchantState = 'merchant_connected'
    } else if (validationSummary.blockingCount > 0) {
      merchantState = 'product_sync_blocked_validation'
    } else {
      merchantState = 'sync_ready'
    }

    const syncReady = merchantState === 'sync_ready'

    return res.status(200).json({
      connected,
      grantedScopes,
      integrations,
      merchant: {
        state: merchantState,
        googleConnected: connected,
        hasMerchantScope: merchantHasScope,
        merchantAccountSelected,
        merchantId,
        refreshTokenPresent,
        merchantConnected,
        syncReady,
        validationSummary,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'status-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') return res.status(401).json({ error: 'Unauthorized' })
    if (message === 'store-access-denied') return res.status(403).json({ error: 'Forbidden' })
    return res.status(400).json({ error: message })
  }
}
