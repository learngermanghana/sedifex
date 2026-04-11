import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import GoogleShopping from './GoogleShopping'

const mockUseActiveStore = vi.fn()
const mockUseGoogleIntegrationStatus = vi.fn()
const mockEnsureGoogleShoppingSetupConfig = vi.fn()
const mockTriggerGoogleShoppingSync = vi.fn()
const mockOnSnapshot = vi.fn()
const mockDoc = vi.fn()
const mockParseOAuthState = vi.fn()
const mockClearOAuthState = vi.fn()

vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => mockUseActiveStore(),
}))

vi.mock('../hooks/useGoogleIntegrationStatus', () => ({
  useGoogleIntegrationStatus: (...args: unknown[]) => mockUseGoogleIntegrationStatus(...args),
}))

vi.mock('../api/googleShopping', () => ({
  ensureGoogleShoppingSetupConfig: (...args: unknown[]) => mockEnsureGoogleShoppingSetupConfig(...args),
  triggerGoogleShoppingSync: (...args: unknown[]) => mockTriggerGoogleShoppingSync(...args),
  getGoogleMerchantPendingAccounts: vi.fn(),
  selectGoogleMerchantAccount: vi.fn(),
}))

vi.mock('../utils/googleOAuthCallback', () => ({
  parseGoogleOAuthQueryState: (...args: unknown[]) => mockParseOAuthState(...args),
  clearGoogleOAuthQueryState: (...args: unknown[]) => mockClearOAuthState(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}))

vi.mock('../firebase', () => ({ db: {} }))

const baseMerchant = {
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
}

describe('GoogleShopping', () => {
  beforeEach(() => {
    mockUseActiveStore.mockReset()
    mockUseGoogleIntegrationStatus.mockReset()
    mockEnsureGoogleShoppingSetupConfig.mockReset()
    mockTriggerGoogleShoppingSync.mockReset()
    mockOnSnapshot.mockReset()
    mockDoc.mockReset()
    mockParseOAuthState.mockReset()
    mockClearOAuthState.mockReset()

    mockUseActiveStore.mockReturnValue({ storeId: 'store-1' })
    mockParseOAuthState.mockReturnValue({ status: null, integrations: [] })
    mockClearOAuthState.mockReturnValue('http://localhost/google-shopping')
    mockEnsureGoogleShoppingSetupConfig.mockResolvedValue({
      integrationApiKey: 'api-key',
      integrationBaseUrl: 'https://example.com',
      autoSyncEnabled: true,
      generated: true,
    })
    mockDoc.mockReturnValue('store-settings-doc')
  })

  it('starts OAuth when connect button is clicked', async () => {
    const startOAuth = vi.fn()
    mockUseGoogleIntegrationStatus.mockReturnValue({
      isLoading: false,
      isStartingOAuth: false,
      hasGoogleConnection: false,
      hasRequiredScope: false,
      stateTitle: '1) Connect Google',
      merchant: baseMerchant,
      error: null,
      startOAuth,
    })

    mockOnSnapshot.mockImplementation((_docRef, callback) => {
      callback({ data: () => ({ googleShopping: { connection: { connected: false } } }) })
      return vi.fn()
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GoogleShopping />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /connect google/i }))
    expect(startOAuth).toHaveBeenCalledTimes(1)
  })

  it('restarts merchant OAuth when no pending account list is available', async () => {
    const startOAuth = vi.fn()
    mockUseGoogleIntegrationStatus.mockReturnValue({
      isLoading: false,
      isStartingOAuth: false,
      hasGoogleConnection: true,
      hasRequiredScope: true,
      stateTitle: '2) Choose merchant account',
      merchant: {
        ...baseMerchant,
        state: 'merchant_account_not_selected',
        googleConnected: true,
        hasMerchantScope: true,
      },
      error: null,
      startOAuth,
    })

    mockOnSnapshot.mockImplementation((_docRef, callback) => {
      callback({ data: () => ({ googleShopping: { connection: { connected: false } } }) })
      return vi.fn()
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GoogleShopping />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /choose merchant account/i }))

    expect(startOAuth).toHaveBeenCalledTimes(1)
  })


  it('runs a full catalog sync from the sync step', async () => {
    mockUseGoogleIntegrationStatus.mockReturnValue({
      isLoading: false,
      isStartingOAuth: false,
      hasGoogleConnection: true,
      hasRequiredScope: true,
      stateTitle: '3) Connected',
      merchant: { ...baseMerchant, state: 'sync_ready', googleConnected: true, hasMerchantScope: true, merchantConnected: true, merchantAccountSelected: true, merchantId: 'mc-1', refreshTokenPresent: true, syncReady: true },
      error: null,
      startOAuth: vi.fn(),
    })

    mockOnSnapshot.mockImplementation((_docRef, callback) => {
      callback({ data: () => ({ googleShopping: { connection: { connected: true, merchantId: 'mc-1' } } }) })
      return vi.fn()
    })

    mockTriggerGoogleShoppingSync.mockResolvedValue({
      mode: 'full',
      totalProducts: 2,
      eligibleProducts: 2,
      invalidProducts: 0,
      createdOrUpdated: 2,
      removed: 0,
      disapproved: 0,
      errors: [],
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GoogleShopping />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /sync products/i }))

    await waitFor(() => {
      expect(mockTriggerGoogleShoppingSync).toHaveBeenCalledWith({ storeId: 'store-1', mode: 'full' })
    })
    expect(screen.getByText(/sync completed successfully/i)).toBeInTheDocument()
  })
})
