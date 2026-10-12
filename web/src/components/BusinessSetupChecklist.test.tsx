import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import BusinessSetupChecklist from './BusinessSetupChecklist'

const state = vi.hoisted(() => ({ storeId: 's', role: 'owner', get: vi.fn(), update: vi.fn() }))
vi.mock('../firebase', () => ({ functions: {} }))
vi.mock('../hooks/useActiveStore', () => ({ useActiveStore: () => ({ storeId: state.storeId }) }))
vi.mock('../hooks/useAuthUser', () => ({ useAuthUser: () => ({ uid: 'owner' }) }))
vi.mock('../hooks/useMemberships', () => ({ useMemberships: () => ({ memberships: [{ uid: 'owner', storeId: state.storeId, role: state.role }] }) }))
vi.mock('firebase/functions', () => ({ httpsCallable: (_: unknown, name: string) => name === 'getBusinessSetupChecklist' ? state.get : state.update }))

const incomplete = { completion: { profile: false }, dismissed: false }
beforeEach(() => {
  state.storeId = 's'
  state.role = 'owner'
  state.get.mockReset().mockResolvedValue({ data: incomplete })
  state.update.mockReset().mockResolvedValue({ data: { ok: true } })
})
function mount() { return render(<MemoryRouter><BusinessSetupChecklist /></MemoryRouter>) }

it('only asks for a profile and persists a dismissal', async () => {
  const user = userEvent.setup()
  const view = mount()
  expect(await screen.findByRole('heading', { name: 'Complete your business profile' })).toBeVisible()
  expect(screen.queryByText('Payout account')).toBeNull()
  expect(screen.queryByText('Public page')).toBeNull()
  expect(screen.queryByText('First product or service')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Skip setup' }))
  expect(state.update).toHaveBeenCalledWith({ storeId: 's', step: 'profile', skipped: true })
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Complete your business profile' })).toBeNull())

  // Another page load or device sees the saved dismissal from the server.
  state.get.mockResolvedValue({ data: { ...incomplete, dismissed: true } })
  view.unmount()
  mount()
  await waitFor(() => expect(state.get).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('heading', { name: 'Complete your business profile' })).toBeNull()
})

it('never prompts for a completed profile', async () => {
  state.get.mockResolvedValue({ data: { completion: { profile: true }, dismissed: false } })
  mount()
  await waitFor(() => expect(state.get).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('heading', { name: 'Complete your business profile' })).toBeNull()
})

it('updates automatically after a profile is saved on Account', async () => {
  mount()
  expect(await screen.findByText('Complete your business profile')).toBeVisible()
  state.get.mockResolvedValue({ data: { completion: { profile: true }, dismissed: false } })
  act(() => window.dispatchEvent(new CustomEvent('sedifex:profile-saved', { detail: { storeId: 's' } })))
  await waitFor(() => expect(state.get).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Complete your business profile')).toBeNull()
})

it('does not hide a prompt when saving the skip fails', async () => {
  state.update.mockRejectedValue(new Error('network unavailable'))
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Skip setup' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your choice')
  expect(screen.getByRole('heading', { name: 'Complete your business profile' })).toBeVisible()
})

it('hides owner setup actions from staff', () => {
  state.role = 'staff'; mount()
  expect(screen.queryByText('Complete your business profile')).toBeNull()
  expect(state.get).not.toHaveBeenCalled()
})

it('ignores an old workspace response after changing stores', async () => {
  let resolveOld: (value: unknown) => void = () => {}
  state.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const view = mount()
  state.storeId = 'new-store'
  view.rerender(<MemoryRouter><BusinessSetupChecklist /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Complete your business profile' })).toBeVisible()
  await act(async () => { resolveOld({ data: { completion: { profile: true }, dismissed: true } }) })
  expect(screen.getByRole('heading', { name: 'Complete your business profile' })).toBeVisible()
})
