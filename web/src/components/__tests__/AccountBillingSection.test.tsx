import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountBillingSection } from '../AccountBillingSection'

const mockStartPaystackCheckout = vi.fn()
const mockCancelPaystackSubscription = vi.fn()
const originalLocation = window.location

function mockWindowAssign() {
  const assignSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, assign: assignSpy },
  })
  return assignSpy
}

vi.mock('../../lib/paystackClient', () => ({
  startPaystackCheckout: (...args: Parameters<typeof mockStartPaystackCheckout>) =>
    mockStartPaystackCheckout(...args),
  cancelPaystackSubscription: (
    ...args: Parameters<typeof mockCancelPaystackSubscription>
  ) => mockCancelPaystackSubscription(...args),
}))

describe('AccountBillingSection', () => {
  beforeEach(() => {
    mockStartPaystackCheckout.mockReset()
    mockCancelPaystackSubscription.mockReset()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('shows a message when the user is not the owner', () => {
    render(<AccountBillingSection storeId="store-123" ownerEmail="owner@example.com" isOwner={false} />)

    expect(screen.getByText(/only the workspace owner/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay with paystack/i })).not.toBeInTheDocument()
  })

  it('shows an error if the store id is missing', async () => {
    const user = userEvent.setup()
    render(<AccountBillingSection storeId={null} ownerEmail="owner@example.com" isOwner />)

    await user.click(screen.getByRole('button', { name: /pay with paystack/i }))

    expect(await screen.findByText(/missing store id/i)).toBeInTheDocument()
    expect(mockStartPaystackCheckout).not.toHaveBeenCalled()
  })

  it('starts the Paystack checkout when everything is valid', async () => {
    const assignSpy = mockWindowAssign()

    mockStartPaystackCheckout.mockResolvedValue({
      ok: true,
      authorizationUrl: 'https://paystack.example/checkout',
      reference: 'ref-123',
      publicKey: 'pk_test',
    })

    const user = userEvent.setup()
    render(<AccountBillingSection storeId="store-123" ownerEmail="owner@example.com" isOwner />)

    await user.selectOptions(screen.getByRole('combobox'), 'growth')
    await user.click(screen.getByRole('button', { name: /pay with paystack/i }))

    await waitFor(() => {
      expect(mockStartPaystackCheckout).toHaveBeenCalledWith({
        email: 'owner@example.com',
        storeId: 'store-123',
        amount: 600,
        plan: 'growth',
        contractMonths: 12,
        redirectUrl: expect.stringContaining('/billing/verify'),
        metadata: { source: 'account-contract-billing' },
      })
    })

    expect(assignSpy).toHaveBeenCalledWith('https://paystack.example/checkout')
  })

  it('shows tier limits in the plan summary', () => {
    render(<AccountBillingSection storeId="store-123" ownerEmail="owner@example.com" isOwner />)

    expect(screen.getByText(/up to 100 products and 100 sales\/day/i)).toBeInTheDocument()
    expect(screen.getByText(/12 months \(yearly payment\)/i)).toBeInTheDocument()
  })

  it('surfaces backend errors when checkout fails', async () => {
    mockStartPaystackCheckout.mockResolvedValue({ ok: false, authorizationUrl: null, reference: null })

    const user = userEvent.setup()
    render(<AccountBillingSection storeId="store-123" ownerEmail="owner@example.com" isOwner />)

    await user.click(screen.getByRole('button', { name: /pay with paystack/i }))

    expect(await screen.findByText(/unable to start checkout/i)).toBeInTheDocument()
  })

  it('shows a paid contract summary and still allows renewal checkout', () => {
    render(
      <AccountBillingSection
        storeId="store-123"
        ownerEmail="owner@example.com"
        isOwner
        contractStatus="active"
        billingPlan="growth"
        contractEndDate="Dec 31, 2026, 10:00 AM"
      />,
    )

    expect(screen.getByText(/contract is active on the growth plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Dec 31, 2026, 10:00 AM/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pay with paystack/i })).toBeInTheDocument()
  })
})
