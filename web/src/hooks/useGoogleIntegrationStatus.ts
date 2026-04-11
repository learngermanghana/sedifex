import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchGoogleIntegrationOverview,
  startGoogleOAuth,
  type GoogleIntegrationKey,
  type GoogleMerchantReadiness,
} from '../api/googleIntegrations'

const REQUIRED_SCOPE_BY_INTEGRATION: Record<GoogleIntegrationKey, string> = {
  ads: 'https://www.googleapis.com/auth/adwords',
  business: 'https://www.googleapis.com/auth/business.manage',
  merchant: 'https://www.googleapis.com/auth/content',
}

function getStateTitle(hasGoogleConnection: boolean, hasRequiredScope: boolean) {
  if (!hasGoogleConnection) return '1) Connect Google'
  if (!hasRequiredScope) return '2) Grant required access'
  return '3) Connected'
}

function getButtonLabel(params: {
  integration: GoogleIntegrationKey
  hasGoogleConnection: boolean
  hasRequiredScope: boolean
}) {
  if (params.hasRequiredScope) return 'Connected'
  if (!params.hasGoogleConnection) return 'Connect Google'

  if (params.integration === 'ads') return 'Grant Google Ads access'
  if (params.integration === 'business') return 'Grant Google Business access'
  return 'Grant Google Merchant access'
}

type UseGoogleIntegrationStatusInput = {
  integration: GoogleIntegrationKey
  storeId: string | null
}

type StartGoogleOAuthInput = {
  customerId?: string
  managerId?: string
  accountEmail?: string
}

export function useGoogleIntegrationStatus(input: UseGoogleIntegrationStatusInput) {
  const { integration, storeId } = input
  const requiredScope = REQUIRED_SCOPE_BY_INTEGRATION[integration]

  const [isLoading, setIsLoading] = useState(false)
  const [isStartingOAuth, setIsStartingOAuth] = useState(false)
  const [hasGoogleConnection, setHasGoogleConnection] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [grantedScopes, setGrantedScopes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<GoogleMerchantReadiness>({
    state: 'google_not_connected',
    googleConnected: false,
    hasMerchantScope: false,
    merchantAccountSelected: false,
    merchantId: '',
    refreshTokenPresent: false,
    merchantConnected: false,
    syncReady: false,
    validationSummary: {
      missingTitle: 0,
      missingDescription: 0,
      missingImage: 0,
      missingPrice: 0,
      missingBrand: 0,
      missingGtinOrMpnOrSku: 0,
      blockingCount: 0,
    },
  })

  useEffect(() => {
    if (!storeId) {
      setHasGoogleConnection(false)
      setIsConnected(false)
      setGrantedScopes([])
      setMerchant({
        state: 'google_not_connected',
        googleConnected: false,
        hasMerchantScope: false,
        merchantAccountSelected: false,
        merchantId: '',
        refreshTokenPresent: false,
        merchantConnected: false,
        syncReady: false,
        validationSummary: {
          missingTitle: 0,
          missingDescription: 0,
          missingImage: 0,
          missingPrice: 0,
          missingBrand: 0,
          missingGtinOrMpnOrSku: 0,
          blockingCount: 0,
        },
      })
      return
    }

    let mounted = true
    setIsLoading(true)
    setError(null)

    fetchGoogleIntegrationOverview(storeId)
      .then((overview) => {
        if (!mounted) return
        setHasGoogleConnection(overview.connected)
        setIsConnected(overview.integrations[integration].connected)
        setGrantedScopes(overview.grantedScopes)
        setMerchant(overview.merchant)
      })
      .catch((nextError) => {
        if (!mounted) return
        setError(nextError instanceof Error ? nextError.message : 'Unable to load Google integration status.')
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [integration, storeId])

  const hasRequiredScope = useMemo(
    () => grantedScopes.includes(requiredScope),
    [grantedScopes, requiredScope],
  )

  const buttonLabel = useMemo(
    () => getButtonLabel({ integration, hasGoogleConnection, hasRequiredScope }),
    [hasGoogleConnection, hasRequiredScope, integration],
  )

  const stateTitle = useMemo(
    () => getStateTitle(hasGoogleConnection, hasRequiredScope),
    [hasGoogleConnection, hasRequiredScope],
  )

  const startOAuth = useCallback(
    async (oauthInput: StartGoogleOAuthInput = {}) => {
      if (!storeId || isStartingOAuth) return
      setIsStartingOAuth(true)
      setError(null)
      try {
        const url = await startGoogleOAuth({
          storeId,
          integrations: [integration],
          customerId: oauthInput.customerId,
          managerId: oauthInput.managerId,
          accountEmail: oauthInput.accountEmail,
        })
        window.location.assign(url)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to start Google OAuth.')
        setIsStartingOAuth(false)
      }
    },
    [integration, isStartingOAuth, storeId],
  )

  return {
    isLoading,
    isStartingOAuth,
    isConnected,
    hasRequiredScope,
    hasGoogleConnection,
    stateTitle,
    buttonLabel,
    requiredScope,
    error,
    merchant,
    startOAuth,
  }
}
