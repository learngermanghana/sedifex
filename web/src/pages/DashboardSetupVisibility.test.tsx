import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import CleanAccountOverview from './CleanAccountOverview'

vi.mock('../components/CompactBusinessDashboard', () => ({ default: () => <h1>Your dashboard</h1> }))
vi.mock('./AccountOverview', () => ({ default: () => <h1>Business account</h1> }))

it('shows dashboard without a second profile setup prompt', () => {
  render(<Dashboard />)
  expect(screen.getByRole('heading', { name: 'Your dashboard' })).toBeInTheDocument()
  expect(screen.queryByText(/complete your business profile/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /skip setup/i })).not.toBeInTheDocument()
})

it('shows account settings without a second profile setup prompt', () => {
  render(<CleanAccountOverview />)
  expect(screen.getByRole('heading', { name: 'Business account' })).toBeInTheDocument()
  expect(screen.queryByText(/complete your business profile/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /skip setup/i })).not.toBeInTheDocument()
})
