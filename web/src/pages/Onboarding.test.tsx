import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'

const mockNavigate = vi.fn()
const mockUpdatePreferences = vi.fn(() => Promise.resolve())
const mockSetOnboardingStatus = vi.fn((..._args: unknown[]) => Promise.resolve())

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => mockNavigate,
}))
vi.mock('../hooks/useAuthUser', () => ({ useAuthUser: () => ({ uid: 'user-123' }) }))
vi.mock('../hooks/useActiveStore', () => ({ useActiveStore: () => ({ storeId: 'store-123', isLoading: false, error: null }) }))
vi.mock('../hooks/useStorePreferences', () => ({
  useStorePreferences: () => ({
    preferences: { navigation: { industry: 'shop', labelPolicy: 'industry_aliases', enabledModules: ['dashboard'], dashboardModules: [], primaryMetrics: [], customLabels: {}, customNavItems: [] } },
    updatePreferences: mockUpdatePreferences,
  }),
}))
vi.mock('../utils/onboarding', () => ({
  getOnboardingStatus: () => 'pending',
  fetchOnboardingStatus: () => Promise.resolve('pending'),
  setOnboardingStatus: (...args: unknown[]) => mockSetOnboardingStatus(...args),
}))
vi.mock('../components/MarketplaceCatalogSyncCard', () => ({ default: () => null }))

beforeEach(() => {
  mockNavigate.mockReset()
  mockUpdatePreferences.mockClear()
  mockSetOnboardingStatus.mockClear()
})

describe('Onboarding page', () => {
  it('only asks the owner to choose navigation', () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /choose your navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /navigation settings/i })).toBeInTheDocument()
    expect(screen.queryByText(/contract/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/launch checklist/i)).not.toBeInTheDocument()
  })

  it('completes onboarding and opens the dashboard', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /save and open dashboard/i }))
    expect(mockSetOnboardingStatus).toHaveBeenCalledWith('user-123', 'completed')
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })
})
