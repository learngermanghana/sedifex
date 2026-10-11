import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'
const state = vi.hoisted(() => ({ navigate: vi.fn(), get: vi.fn(), set: vi.fn(), finish: vi.fn(), preferences: vi.fn(), role: 'owner', storeId: 's', navigation: { industry: 'shop' } as Record<string, unknown> }))
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')), useNavigate: () => state.navigate }))
vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_: unknown, collection: string, id: string) => `${collection}/${id}`, getDoc: (...args: unknown[]) => state.get(...args), setDoc: (...args: unknown[]) => state.set(...args), serverTimestamp: () => 'server-time' }))
vi.mock('../hooks/useAuthUser', () => ({ useAuthUser: () => ({ uid: 'owner' }) }))
vi.mock('../hooks/useActiveStore', () => ({ useActiveStore: () => ({ storeId: state.storeId, isLoading: false }) }))
vi.mock('../hooks/useMemberships', () => ({ useMemberships: () => ({ loading: false, memberships: [{ uid: 'owner', storeId: state.storeId, role: state.role }] }) }))
vi.mock('../hooks/useStorePreferences', () => ({ useStorePreferences: () => ({ loading: false, preferences: { navigation: state.navigation }, updatePreferences: state.preferences }) }))
vi.mock('../utils/onboarding', () => ({ setOnboardingStatus: (...args: unknown[]) => state.finish(...args) }))
beforeEach(() => { state.role = 'owner'; state.storeId = 's'; state.navigation = { industry: 'shop' }; state.navigate.mockReset(); state.get.mockReset().mockResolvedValue({ exists: () => true, data: () => ({}) }); state.set.mockReset().mockResolvedValue(undefined); state.finish.mockReset().mockResolvedValue(undefined); state.preferences.mockReset().mockResolvedValue(undefined) })
function mount() { return render(<MemoryRouter><Onboarding /></MemoryRouter>) }
it('saves profile and automatic business-type defaults then opens the selected first task', async () => {
  mount(); const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Business name'), 'My Event Team')
  await user.click(screen.getByRole('radio', { name: /Event planning/ }))
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(await screen.findByRole('heading', { name: 'Choose where to begin' })).toBeVisible()
  expect(state.preferences.mock.calls[0][0].navigation.industry).toBe('event')
  expect(state.set.mock.calls.some(call => call[1].displayName === 'My Event Team')).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'You’re ready to start' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Plan your first event' }))
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/event-planning', { replace: true }))
  expect(state.finish).toHaveBeenCalledWith('owner', 'completed', { requireRemote: true })
})
it('saves unfinished details without pretending the profile is complete', async () => {
  mount(); const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Business name'), 'Work in progress')
  await user.click(screen.getByRole('button', { name: 'Finish later' }))
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/', { replace: true }))
  expect(state.set.mock.calls[0][1].onboardingGuide.draft.name).toBe('Work in progress')
  expect(state.preferences).not.toHaveBeenCalled()
})
it('resumes saved stage and reports completion failures without leaving', async () => {
  state.get.mockResolvedValue({ exists: () => true, data: () => ({ onboardingGuide: { step: 2, action: 'dashboard', draft: { name: 'Saved shop', industry: 'shop' } } }) })
  state.finish.mockRejectedValue(new Error('Offline'))
  mount(); const user = userEvent.setup()
  expect(await screen.findByRole('heading', { name: 'You’re ready to start' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Open dashboard' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
  expect(state.navigate).not.toHaveBeenCalled()
})
it('does not expose owner setup to staff', () => {
  state.role = 'staff'; mount()
  expect(screen.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible()
  expect(state.get).not.toHaveBeenCalled()
})
it('keeps the first step when profile or navigation persistence fails', async () => {
  state.preferences.mockRejectedValueOnce(new Error('Permission denied'))
  mount(); const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Business name'), 'My shop')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
  expect(screen.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible()
  expect(state.set.mock.calls.some(call => call[1].onboardingGuide?.step === 1)).toBe(false)
})
it('preserves existing navigation and dashboard customizations when saving the profile', async () => {
  const saved = { industry: 'shop', enabledModules: ['account', 'reports'], dashboardModules: ['sales'], primaryMetrics: ['revenue'], customLabels: { customers: 'Clients' }, customNavItems: [{ label: 'Help', href: 'https://example.com' }] }
  state.navigation = saved
  state.get.mockImplementation((path: string) => Promise.resolve({ exists: () => true, data: () => path.startsWith('storeSettings/') ? { navigation: saved } : { name: 'Existing shop' } }))
  mount(); const user = userEvent.setup()
  await screen.findByLabelText('Business name')
  await user.click(screen.getByRole('radio', { name: /Travel or bookings/ }))
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  await screen.findByRole('heading', { name: 'Choose where to begin' })
  expect(state.preferences).toHaveBeenCalledWith({ navigation: { ...saved, industry: 'travel' } })
})
it.each([['travel', 'service', 'Add your first service'], ['school', 'course', 'Add your first course']])('opens the correct first task for %s', async (industry, itemType, title) => {
  state.get.mockResolvedValue({ exists: () => true, data: () => ({ onboardingGuide: { step: 2, action: 'first-task', draft: { name: 'Saved business', industry } } }) })
  mount(); const button = await screen.findByRole('button', { name: title })
  await userEvent.click(button)
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith(`/products/new?itemType=${itemType}`, { replace: true }))
})
