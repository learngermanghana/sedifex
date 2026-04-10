export type GoogleOAuthQueryState = {
  status: 'success' | 'failed' | ''
  message: string
  integrations: string[]
  merchantId: string
  pendingSelectionId: string
  refreshTokenMissing: boolean
}

const CALLBACK_PARAMS = [
  'googleOAuth',
  'googleMerchantOAuth',
  'integrations',
  'message',
  'merchantId',
  'pendingSelectionId',
  'refreshTokenMissing',
  'storeId',
] as const

export function parseGoogleOAuthQueryState(search: string): GoogleOAuthQueryState {
  const params = new URLSearchParams(search)
  const integrations = (params.get('integrations') || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

  const sharedOAuth = params.get('googleOAuth')
  const legacyMerchantOAuth = params.get('googleMerchantOAuth')
  const status: GoogleOAuthQueryState['status'] =
    sharedOAuth === 'success' || legacyMerchantOAuth === 'success'
      ? 'success'
      : sharedOAuth === 'failed' || legacyMerchantOAuth === 'failed'
        ? 'failed'
        : ''

  return {
    status,
    message: params.get('message') || '',
    integrations,
    merchantId: params.get('merchantId') || '',
    pendingSelectionId: params.get('pendingSelectionId') || '',
    refreshTokenMissing: params.get('refreshTokenMissing') === '1',
  }
}

export function clearGoogleOAuthQueryState(currentUrl: string) {
  const url = new URL(currentUrl)
  CALLBACK_PARAMS.forEach(param => {
    url.searchParams.delete(param)
  })

  return url.toString()
}

export function isReconnectRequiredError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('refresh token') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('revoked') ||
    normalized.includes('reauth') ||
    normalized.includes('re-auth') ||
    normalized.includes('consent')
  )
}
