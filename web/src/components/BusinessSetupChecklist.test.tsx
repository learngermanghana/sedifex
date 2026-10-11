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
const progress = { completion: { profile: true, catalog: false, payout: false, 'public-page': false }, skipped: ['catalog'], publicUrl: null }
beforeEach(() => { state.storeId = 's'; state.role = 'owner'; state.get.mockReset().mockResolvedValue({ data: progress }); state.update.mockReset().mockResolvedValue({ data: { ok: true } }) })
function mount() { return render(<MemoryRouter><BusinessSetupChecklist /></MemoryRouter>) }
it('shows saved completion separately from skips and refreshes after setup changes', async () => {
  mount()
  expect(await screen.findByText('1 of 4 steps complete · 1 skipped')).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Include step' }))
  expect(state.update).toHaveBeenCalledWith({ storeId: 's', step: 'catalog', skipped: false })
  await waitFor(() => expect(state.get).toHaveBeenCalledTimes(2))
  state.get.mockResolvedValue({ data: { ...progress, completion: { ...progress.completion, catalog: true }, skipped: [] } })
  await user.click(screen.getByRole('button', { name: 'Refresh progress' }))
  expect(await screen.findByText('2 of 4 steps complete')).toBeVisible()
})
it('hides owner setup actions from staff', () => {
  state.role = 'staff'; mount()
  expect(screen.queryByText('Get your business ready')).toBeNull()
  expect(state.get).not.toHaveBeenCalled()
})
it('ignores a previous workspace response after switching stores', async () => {
  let resolveOld: (value: unknown) => void = () => {}
  state.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const view = mount()
  state.storeId = 'new-store'
  view.rerender(<MemoryRouter><BusinessSetupChecklist /></MemoryRouter>)
  expect(await screen.findByText('1 of 4 steps complete · 1 skipped')).toBeVisible()
  await act(async () => { resolveOld({ data: { ...progress, completion: { profile: true, catalog: true, payout: true, 'public-page': true }, skipped: [] } }) })
  await waitFor(() => expect(screen.queryByText('4 of 4 steps complete')).toBeNull())
})
