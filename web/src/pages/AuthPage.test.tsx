import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from './AuthPage'
const state = vi.hoisted(() => ({ create: vi.fn(), login: vi.fn(), popup: vi.fn(), verify: vi.fn(), token: vi.fn(), initialize: vi.fn(), resolve: vi.fn(), persist: vi.fn(), onboarding: vi.fn(), publish: vi.fn() }))
vi.mock('../firebase', () => ({ auth: { signOut: vi.fn() }, db: {} }))
vi.mock('firebase/auth', () => ({ createUserWithEmailAndPassword: state.create, signInWithEmailAndPassword: state.login, signInWithPopup: state.popup, sendEmailVerification: state.verify, GoogleAuthProvider: class { setCustomParameters() {} } }))
vi.mock('../controllers/sessionController', () => ({ persistSession: state.persist }))
vi.mock('../controllers/accessController', () => ({ initializeStore: state.initialize, resolveStoreAccess: state.resolve, extractCallableErrorMessage: () => null, INACTIVE_WORKSPACE_MESSAGE: 'Workspace inactive' }))
vi.mock('../components/ToastProvider', () => ({ useToast: () => ({ publish: state.publish }) }))
vi.mock('../utils/onboarding', () => ({ setOnboardingStatus: state.onboarding }))
vi.mock('../components/UsedByBusinesses', () => ({ default: () => null }))
vi.mock('../components/SafeFirebaseImage', () => ({ default: () => null }))
beforeEach(() => {
  Object.values(state).forEach(mock => mock.mockReset())
  const user = { uid: 'owner', getIdToken: state.token }
  state.create.mockResolvedValue({ user }); state.login.mockResolvedValue({ user }); state.popup.mockResolvedValue({ user })
  state.initialize.mockResolvedValue({ storeId: 'owner' }); state.resolve.mockResolvedValue({ storeId: 'owner', role: 'owner' })
})
function mount() { render(<MemoryRouter><AuthPage /></MemoryRouter>) }
it('creates an account with only personal credentials and preserves verification', async () => {
  mount(); const user = userEvent.setup()
  await user.click(screen.getByRole('tab', { name: 'Sign up free' }))
  const form = within(screen.getByRole('form', { name: 'Sign up form' }))
  expect(form.queryByLabelText('Business name')).toBeNull()
  expect(form.queryByLabelText('Phone number')).toBeNull()
  await user.type(form.getByLabelText('Full name'), 'Felix Asadu')
  await user.type(form.getByLabelText('Email'), 'felix@example.com')
  await user.type(form.getByLabelText('Password'), 'Password1!')
  await user.type(form.getByLabelText('Confirm password'), 'Password1!')
  await user.click(form.getByRole('button', { name: 'Create free account' }))
  await waitFor(() => expect(state.verify).toHaveBeenCalledTimes(1))
  expect(state.create).toHaveBeenCalledWith(expect.anything(), 'felix@example.com', 'Password1!')
  expect(state.initialize).toHaveBeenCalledWith({ firstSignupEmail: 'felix@example.com', ownerName: 'Felix Asadu', signupRole: 'owner' }, null)
  expect(state.onboarding).toHaveBeenCalledWith('owner', 'pending')
})
it('keeps login and workspace resolution working', async () => {
  mount(); const user = userEvent.setup(); const form = within(screen.getByRole('form', { name: 'Log in form' }))
  await user.type(form.getByLabelText('Email'), 'felix@example.com')
  await user.type(form.getByLabelText('Password'), 'Password1!')
  await user.click(form.getByRole('button', { name: 'Log in' }))
  await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2))
  expect(state.resolve).toHaveBeenCalledTimes(1)
})
it('keeps Google login available', async () => {
  mount(); await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2))
})
