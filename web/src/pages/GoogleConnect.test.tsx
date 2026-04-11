import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'

import GoogleConnect from './GoogleConnect'

const mockUseActiveStore = vi.fn()
const mockFetchGoogleIntegrationOverview = vi.fn()
const mockOnSnapshot = vi.fn()
const mockDoc = vi.fn()

vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => mockUseActiveStore(),
}))

vi.mock('../api/googleIntegrations', () => ({
  fetchGoogleIntegrationOverview: (...args: unknown[]) => mockFetchGoogleIntegrationOverview(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}))

vi.mock('../firebase', () => ({
  db: {},
}))

vi.mock('../components/GoogleConnectionStatusCard', () => ({
  default: ({ storeId }: { storeId: string }) => <div data-testid="google-status-card">{storeId}</div>,
}))

describe('GoogleConnect', () => {
  beforeEach(() => {
    mockUseActiveStore.mockReset()
    mockFetchGoogleIntegrationOverview.mockReset()
    mockOnSnapshot.mockReset()
    mockDoc.mockReset()

    mockUseActiveStore.mockReturnValue({ storeId: 'store-1' })
    mockFetchGoogleIntegrationOverview.mockResolvedValue({
      connected: true,
      integrations: {
        ads: { connected: true, hasRequiredScope: true },
        business: { connected: true, hasRequiredScope: true },
        merchant: { connected: true, hasRequiredScope: true },
      },
      grantedScopes: [],
    })

    mockDoc.mockReturnValue('store-settings-doc')
    mockOnSnapshot.mockImplementation((_docRef, callback) => {
      callback({
        data: () => ({
          googleShopping: { connection: { connected: false } },
        }),
      })
      return vi.fn()
    })
  })

  it('loads integration statuses and marks shopping as action required when merchant store is not linked', async () => {
    render(
      <MemoryRouter initialEntries={['/google-shopping']}>
        <GoogleConnect />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockFetchGoogleIntegrationOverview).toHaveBeenCalledWith('store-1')
    })

    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    expect(screen.getByText('Google Business Profile')).toBeInTheDocument()
    expect(screen.getByText('Google Shopping')).toBeInTheDocument()
    expect(screen.getByText('Action required')).toBeInTheDocument()
    expect(screen.getByTestId('google-status-card')).toHaveTextContent('store-1')
  })
})
