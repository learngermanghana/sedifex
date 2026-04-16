import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Shell from './Shell'
import { ToastProvider } from '../components/ToastProvider'

const mockUseAuthUser = vi.fn()
const mockUseConnectivityStatus = vi.fn()
const mockUseStoreBilling = vi.fn()
const mockUseActiveStore = vi.fn()
const mockUseWorkspaceIdentity = vi.fn()
const mockUseMemberships = vi.fn()
const mockSetActiveStoreId = vi.fn()

vi.mock('../hooks/useAuthUser', () => ({
  useAuthUser: () => mockUseAuthUser(),
}))

vi.mock('../hooks/useConnectivityStatus', () => ({
  useConnectivityStatus: () => mockUseConnectivityStatus(),
}))

vi.mock('../hooks/useStoreBilling', () => ({
  useStoreBilling: () => mockUseStoreBilling(),
}))

vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => mockUseActiveStore(),
}))

vi.mock('../hooks/useWorkspaceIdentity', () => ({
  useWorkspaceIdentity: () => mockUseWorkspaceIdentity(),
}))

vi.mock('../hooks/useMemberships', () => ({
  useMemberships: () => mockUseMemberships(),
}))

vi.mock('../firebase', () => ({
  auth: {},
}))

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}))

function renderShell(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <Shell>
          <div>Content</div>
        </Shell>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear()

    mockUseAuthUser.mockReset()
    mockUseConnectivityStatus.mockReset()
    mockUseStoreBilling.mockReset()
    mockUseActiveStore.mockReset()
    mockUseWorkspaceIdentity.mockReset()
    mockUseMemberships.mockReset()
    mockSetActiveStoreId.mockReset()

    mockUseAuthUser.mockReturnValue({ uid: 'user-123', email: 'owner@example.com' })
    mockUseActiveStore.mockReturnValue({
      storeId: 'store-123',
      isLoading: false,
      error: null,
      setActiveStoreId: mockSetActiveStoreId,
    })
    mockUseWorkspaceIdentity.mockReturnValue({ name: 'Demo Store', loading: false })
    mockUseMemberships.mockReturnValue({ memberships: [], loading: false, error: null })
    mockUseConnectivityStatus.mockReturnValue({
      isOnline: true,
      isReachable: true,
      isChecking: false,
      lastHeartbeatAt: null,
      heartbeatError: null,
      queue: { status: 'idle', pending: 0, lastError: null, updatedAt: null },
    })
    mockUseStoreBilling.mockReturnValue({
      loading: false,
      error: null,
      billing: {
        status: 'active',
        planKey: 'Standard',
        trialEndsAt: null,
        paymentStatus: 'active',
        contractEnd: null,
      },
    })
  })

  it('renders the workspace status', () => {
    renderShell()

    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(
      screen.getByText(/to link more stores, ask each workspace owner to add/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/workspace switch appears when this account is linked to 2\+ workspaces/i),
    ).toBeInTheDocument()
  })

  it('switches workspaces when the account has multiple memberships', async () => {
    mockUseMemberships.mockReturnValue({
      memberships: [
        { id: 'member-1', uid: 'user-123', storeId: 'store-123', role: 'owner' },
        { id: 'member-2', uid: 'user-123', storeId: 'store-456', role: 'staff' },
      ],
      loading: false,
      error: null,
    })

    renderShell()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText(/select workspace/i), 'store-456')

    expect(mockSetActiveStoreId).toHaveBeenCalledWith('store-456')
    expect(
      screen.queryByText(/to link more stores, ask each workspace owner to add/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/workspace switch appears when this account is linked to 2\+ workspaces/i),
    ).not.toBeInTheDocument()
  })

  it('shows only connected workspaces for the signed-in user', () => {
    mockUseMemberships.mockReturnValue({
      memberships: [
        { id: 'member-1', uid: 'user-123', storeId: 'store-123', role: 'staff' },
        { id: 'member-2', uid: 'other-user', storeId: 'store-456', role: 'owner' },
      ],
      loading: false,
      error: null,
    })

    renderShell()

    expect(screen.queryByLabelText(/select workspace/i)).not.toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
  })

  it('explains why switcher is hidden when multiple rows map to one store id', () => {
    mockUseMemberships.mockReturnValue({
      memberships: [
        { id: 'member-1', uid: 'user-123', storeId: 'same-store', role: 'owner' },
        { id: 'member-2', uid: 'user-123', storeId: 'same-store', role: 'staff' },
      ],
      loading: false,
      error: null,
    })

    renderShell()

    expect(screen.queryByLabelText(/select workspace/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/multiple team rows, but they all point to the same workspace id/i),
    ).toBeInTheDocument()
  })

  it('shows a billing reminder when payment is past due', () => {
    mockUseStoreBilling.mockReturnValue({
      loading: false,
      error: null,
      billing: {
        status: 'active',
        planKey: 'Standard',
        trialEndsAt: null,
        paymentStatus: 'past_due',
        contractEnd: null,
      },
    })

    renderShell()

    expect(screen.getByText('Billing past due')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /update payment/i })).toHaveAttribute('href', '/account')
  })

  it('allows dismissing the billing notice for the current day', async () => {
    mockUseStoreBilling.mockReturnValue({
      loading: false,
      error: null,
      billing: {
        status: 'active',
        planKey: 'Standard',
        trialEndsAt: null,
        paymentStatus: 'past_due',
        contractEnd: null,
      },
    })

    renderShell()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /dismiss reminder/i }))
    expect(screen.queryByText('Billing past due')).not.toBeInTheDocument()
  })

  it('locks navigation and surfaces a notice when the trial has ended', () => {
    mockUseStoreBilling.mockReturnValue({
      loading: false,
      error: null,
      billing: {
        status: 'trial',
        planKey: 'Trial',
        trialEndsAt: { toDate: () => new Date('2024-01-01T00:00:00Z') } as any,
        paymentStatus: 'trial',
        contractEnd: null,
      },
    })

    renderShell()

    expect(
      screen.getByText(
        'Your Sedifex trial has ended. Update payment to continue using the app.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('filters navigation links using page search', async () => {
    renderShell(['/dashboard'])
    const user = userEvent.setup()

    await user.type(screen.getByRole('searchbox', { name: /search pages/i }), 'cust')

    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('offers return-to-last-page action when a previous path exists', async () => {
    localStorage.setItem('sedifex-last-path-user-123', '/customers')
    renderShell(['/dashboard'])

    expect(screen.getByText('Return to where you left off?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return' })).toBeInTheDocument()
  })

  it('allows dismissing the return-to-last-page prompt', async () => {
    localStorage.setItem('sedifex-last-path-user-123', '/customers')
    renderShell(['/dashboard'])
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Return to where you left off?')).not.toBeInTheDocument()
  })
})
