import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AuthScreen from './AuthScreen'

type MockToastOptions = { message: string; tone?: 'success' | 'error' | 'info'; duration?: number }

const mockAuth = vi.hoisted(() => ({} as unknown as Record<string, unknown>))

const mockCreateUserWithEmailAndPassword = vi.fn()
const mockSignInWithEmailAndPassword = vi.fn()
const mockPersistSession = vi.fn(async (..._args: unknown[]) => {})
const mockEnsureStoreDocument = vi.fn(async (..._args: unknown[]) => {})
const mockEnsureTeamMemberDocument = vi.fn(async (..._args: unknown[]) => {})
const mockSetOnboardingStatus = vi.fn()
const mockPublish = vi.fn<(options: MockToastOptions) => void>()
const mockNavigate = vi.fn()
const mockAfterSignupBootstrap = vi.fn()
const mockUploadProductImage = vi.fn()
const mockSetDoc = vi.fn()
const mockDoc = vi.fn()

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) =>
    mockCreateUserWithEmailAndPassword(...args),
  signInWithEmailAndPassword: (...args: unknown[]) =>
    mockSignInWithEmailAndPassword(...args),
}))

vi.mock('../firebase', () => ({
  auth: mockAuth,
  db: { app: 'db' },
}))

vi.mock('../controllers/sessionController', () => ({
  persistSession: (...args: unknown[]) => mockPersistSession(...args),
  ensureStoreDocument: (...args: unknown[]) => mockEnsureStoreDocument(...args),
  ensureTeamMemberDocument: (...args: unknown[]) => mockEnsureTeamMemberDocument(...args),
}))

vi.mock('../api/productImageUpload', () => ({
  uploadProductImage: (...args: unknown[]) => mockUploadProductImage(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

vi.mock('../utils/onboarding', () => ({
  setOnboardingStatus: (...args: unknown[]) => mockSetOnboardingStatus(...args),
}))

vi.mock('../components/ToastProvider', () => ({
  useToast: () => ({ publish: mockPublish }),
}))

vi.mock('../controllers/accessController', () => ({
  afterSignupBootstrap: (...args: unknown[]) => mockAfterSignupBootstrap(...args),
}))

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/', state: null }),
  }
})

describe('AuthScreen', () => {
  beforeEach(() => {
    mockCreateUserWithEmailAndPassword.mockReset()
    mockSignInWithEmailAndPassword.mockReset()
    mockPersistSession.mockClear()
    mockEnsureStoreDocument.mockClear()
    mockEnsureTeamMemberDocument.mockClear()
    mockSetOnboardingStatus.mockReset()
    mockPublish.mockReset()
    mockNavigate.mockReset()
    mockAfterSignupBootstrap.mockReset()
    mockUploadProductImage.mockReset()
    mockSetDoc.mockReset()
    mockDoc.mockReset()

    mockAfterSignupBootstrap.mockResolvedValue({ storeId: 'new-user', role: 'owner' })
  })

  it('signs in with Firebase auth and persists the session', async () => {
    const mockUser = { uid: 'user-123' }
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUser })

    render(<AuthScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/email/i), '  user@example.com  ')
    await user.type(screen.getByLabelText(/password/i), 'password123')

    const submitButton = screen
      .getAllByRole('button', { name: /sign in/i })
      .find(button => button.getAttribute('type') === 'submit')

    if (!submitButton) {
      throw new Error('Could not find submit button')
    }

    await user.click(submitButton)

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'user@example.com',
        'password123',
      )
    })

    expect(mockEnsureStoreDocument).toHaveBeenCalledWith(mockUser)
    expect(mockPersistSession).toHaveBeenCalledWith(mockUser)
    expect(mockPublish).toHaveBeenCalledWith({ message: 'Welcome back!', tone: 'success' })
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    expect(mockEnsureTeamMemberDocument).not.toHaveBeenCalled()
  })

  it('creates an account and triggers onboarding helpers', async () => {
    const mockUser = { uid: 'new-user' }
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser })

    render(<AuthScreen />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /create one/i }))
    await user.type(screen.getByLabelText(/email/i), 'new.user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')

    const submitButton = screen
      .getAllByRole('button', { name: /create account/i })
      .find(button => button.getAttribute('type') === 'submit')

    if (!submitButton) {
      throw new Error('Could not find submit button')
    }

    await user.click(submitButton)

    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'new.user@example.com',
        'password123',
      )
    })

    expect(mockEnsureStoreDocument).toHaveBeenCalledWith(mockUser)
    expect(mockEnsureTeamMemberDocument).not.toHaveBeenCalled()
    expect(mockPersistSession).toHaveBeenCalledWith(mockUser, {
      storeId: 'new-user',
      role: 'owner',
    })
    expect(mockSetOnboardingStatus).toHaveBeenCalledWith('new-user', 'pending')
    expect(mockAfterSignupBootstrap).toHaveBeenCalled()

    const successToastCall = mockPublish.mock.calls.find(([options]) => options.tone === 'success')
    expect(successToastCall?.[0].message).toBe('Account created! Setting your workspace up now…')
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('surfaces bootstrap errors after signup', async () => {
    const mockUser = { uid: 'new-user' }
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser })
    mockAfterSignupBootstrap.mockRejectedValueOnce(new Error('sync failed'))

    render(<AuthScreen />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /create one/i }))
    await user.type(screen.getByLabelText(/email/i), 'new.user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')

    const submitButton = screen
      .getAllByRole('button', { name: /create account/i })
      .find(button => button.getAttribute('type') === 'submit')

    if (!submitButton) {
      throw new Error('Could not find submit button')
    }

    await user.click(submitButton)

    await waitFor(() => {
      expect(mockAfterSignupBootstrap).toHaveBeenCalled()
    })

    const errorToastCall = mockPublish.mock.calls.find(([options]) => options.tone === 'error')
    expect(errorToastCall?.[0].message).toContain('We created your account but hit a snag syncing workspace data')
  })

  it('keeps logo upload optional on signup', async () => {
    const mockUser = { uid: 'new-user' }
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser })

    render(<AuthScreen />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /create one/i }))
    await user.type(screen.getByLabelText(/email/i), 'new.user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getAllByRole('button', { name: /create account/i }).find(button => button.getAttribute('type') === 'submit')!)

    await waitFor(() => {
      expect(mockAfterSignupBootstrap).toHaveBeenCalled()
    })

    expect(mockUploadProductImage).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('uploads logo when provided during signup and saves it to the store profile', async () => {
    const mockUser = { uid: 'new-user' }
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser })
    mockUploadProductImage.mockResolvedValue('https://cdn.example.com/logo.png')
    mockDoc.mockReturnValue('stores/new-user')

    render(<AuthScreen />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /create one/i }))
    await user.type(screen.getByLabelText(/email/i), 'new.user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')

    const fileInput = screen.getByLabelText(/store logo \(optional\)/i)
    const file = new File(['logo-content'], 'logo.png', { type: 'image/png' })
    await user.upload(fileInput, file)

    await user.click(screen.getAllByRole('button', { name: /create account/i }).find(button => button.getAttribute('type') === 'submit')!)

    await waitFor(() => {
      expect(mockUploadProductImage).toHaveBeenCalledTimes(1)
    })
    expect(mockUploadProductImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ storagePath: 'stores/new-user/assets/logo-new-user' }),
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      'stores/new-user',
      { logoUrl: 'https://cdn.example.com/logo.png', logoAlt: 'Store logo' },
      { merge: true },
    )
  })
})
