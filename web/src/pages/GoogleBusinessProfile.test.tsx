import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import GoogleBusinessProfile from './GoogleBusinessProfile'

const mockUseActiveStore = vi.fn()
const mockUseGoogleIntegrationStatus = vi.fn()
const mockListGoogleBusinessLocations = vi.fn()
const mockUploadGoogleBusinessLocationMedia = vi.fn()

vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => mockUseActiveStore(),
}))

vi.mock('../hooks/useGoogleIntegrationStatus', () => ({
  useGoogleIntegrationStatus: (...args: unknown[]) => mockUseGoogleIntegrationStatus(...args),
}))

vi.mock('../api/googleBusinessProfile', () => ({
  listGoogleBusinessLocations: (...args: unknown[]) => mockListGoogleBusinessLocations(...args),
  uploadGoogleBusinessLocationMedia: (...args: unknown[]) => mockUploadGoogleBusinessLocationMedia(...args),
  parseGoogleBusinessApiError: (error: unknown) => ({
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'Request failed.',
    code: '',
    status: 0,
  }),
}))

describe('GoogleBusinessProfile', () => {
  beforeEach(() => {
    mockUseActiveStore.mockReset()
    mockUseGoogleIntegrationStatus.mockReset()
    mockListGoogleBusinessLocations.mockReset()
    mockUploadGoogleBusinessLocationMedia.mockReset()

    mockUseActiveStore.mockReturnValue({ storeId: 'store-1' })
    mockListGoogleBusinessLocations.mockResolvedValue([
      {
        accountId: 'acc-1',
        accountName: 'Main Account',
        locationId: 'loc-1',
        locationName: 'Main Shop',
      },
    ])
  })

  it('starts OAuth connection when not yet connected', async () => {
    const startOAuth = vi.fn()
    mockUseGoogleIntegrationStatus.mockReturnValue({
      isLoading: false,
      isStartingOAuth: false,
      isConnected: false,
      hasGoogleConnection: false,
      buttonLabel: 'Connect Google',
      stateTitle: '1) Connect Google',
      startOAuth,
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GoogleBusinessProfile />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /connect google/i }))
    expect(startOAuth).toHaveBeenCalledTimes(1)
  })

  it('uploads a photo to Google Business when connected', async () => {
    mockUseGoogleIntegrationStatus.mockReturnValue({
      isLoading: false,
      isStartingOAuth: false,
      isConnected: true,
      hasGoogleConnection: true,
      buttonLabel: 'Connected',
      stateTitle: '3) Connected',
      startOAuth: vi.fn(),
    })

    mockUploadGoogleBusinessLocationMedia.mockResolvedValue({
      media: {
        thumbnailUrl: 'https://img.example/thumb.jpg',
        googleUrl: 'https://business.google.com/media/1',
      },
    })

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GoogleBusinessProfile />
      </MemoryRouter>,
    )

    const fileInput = await screen.findByLabelText(/choose photo/i)
    const file = new File(['image'], 'store.jpg', { type: 'image/jpeg' })
    await user.upload(fileInput, file)
    await user.click(screen.getByRole('button', { name: /upload photo to google/i }))

    await waitFor(() => {
      expect(mockUploadGoogleBusinessLocationMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-1',
          accountId: 'acc-1',
          locationId: 'loc-1',
          category: 'ADDITIONAL',
          file,
        }),
      )
    })

    expect(screen.getByText(/your photo was uploaded to google business profile/i)).toBeInTheDocument()

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })
})
