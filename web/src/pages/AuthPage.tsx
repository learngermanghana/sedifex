import React, { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { Link } from 'react-router-dom'
import '../App.css'
import { useToast } from '../components/ToastProvider'
import { persistSession } from '../controllers/sessionController'
import {
  initializeStore,
  resolveStoreAccess,
  type ResolveStoreAccessResult,
  type SignupRoleOption,
  extractCallableErrorMessage,
  INACTIVE_WORKSPACE_MESSAGE,
} from '../controllers/accessController'
import { auth, db } from '../firebase'
import { setOnboardingStatus } from '../utils/onboarding'
import { normalizeGhanaPhoneE164 } from '../utils/phone'
import { INDUSTRY_ENABLED_MODULE_PRESETS, type Industry } from '../config/navigation'

const AUTH_VISUAL_IMAGE_URL = 'https://raw.githubusercontent.com/learngermanghana/sedifexbiz/main/photos/pexels-olly-3801439.jpg'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 8

type AuthMode = 'login' | 'signup'
type StatusTone = 'idle' | 'loading' | 'success' | 'error'
type AccountTypeOption = Industry

type StatusState = { tone: StatusTone; message: string }
type PasswordStrength = { isLongEnough: boolean; hasUppercase: boolean; hasLowercase: boolean; hasNumber: boolean; hasSymbol: boolean }

function sanitizePhone(value: string): string {
  return normalizeGhanaPhoneE164(value)
}

function evaluatePasswordStrength(password: string): PasswordStrength {
  return {
    isLongEnough: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  }
}

function getLoginValidationError(email: string, password: string): string | null {
  if (!email) return 'Enter your email.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Enter your password.'
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code || '') {
      case 'auth/invalid-login-credentials':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password.'
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support to restore access.'
      case 'auth/invalid-email':
        return 'Enter a valid email address.'
      case 'auth/missing-email':
        return 'Enter your email to continue.'
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.'
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.'
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.'
      case 'auth/operation-not-allowed':
        return 'Email and password sign-in is currently unavailable. Please contact support.'
      case 'auth/missing-password':
        return 'Enter your password to continue.'
      case 'auth/weak-password':
        return 'Please choose a stronger password.'
      case 'functions/permission-denied':
        return extractCallableErrorMessage(error) ?? INACTIVE_WORKSPACE_MESSAGE
      default:
        return (error as any).message || 'Something went wrong. Please try again.'
    }
  }
  if (error instanceof Error) return error.message || 'Something went wrong. Please try again.'
  if (typeof error === 'string') return error
  return 'Something went wrong. Please try again.'
}

function getAuthErrorMessage(error: unknown, mode: AuthMode): string {
  const message = getErrorMessage(error)
  if (mode === 'signup' && message === 'An account already exists with this email.') {
    return 'An account already exists with this email. Try logging in instead or use another email to sign up.'
  }
  return message
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [town, setTown] = useState('')
  const [address, setAddress] = useState('')
  const [accountType, setAccountType] = useState<AccountTypeOption>('shop')
  const [status, setStatus] = useState<StatusState>({ tone: 'idle', message: '' })
  const { publish } = useToast()

  const isLoading = status.tone === 'loading'
  const normalizedEmail = email.trim()
  const normalizedPassword = password.trim()
  const normalizedConfirmPassword = confirmPassword.trim()
  const normalizedPhone = sanitizePhone(phone)

  const passwordStrength = evaluatePasswordStrength(normalizedPassword)
  const passwordChecklist = useMemo(() => [
    { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, passed: passwordStrength.isLongEnough },
    { id: 'uppercase', label: 'Includes an uppercase letter', passed: passwordStrength.hasUppercase },
    { id: 'lowercase', label: 'Includes a lowercase letter', passed: passwordStrength.hasLowercase },
    { id: 'number', label: 'Includes a number', passed: passwordStrength.hasNumber },
    { id: 'symbol', label: 'Includes a symbol', passed: passwordStrength.hasSymbol },
  ] as const, [passwordStrength])

  const doesPasswordMeetAllChecks = passwordChecklist.every(item => item.passed)
  const isSignupFormValid =
    EMAIL_PATTERN.test(normalizedEmail) &&
    normalizedPassword.length > 0 &&
    doesPasswordMeetAllChecks &&
    normalizedPassword === normalizedConfirmPassword &&
    fullName.trim().length > 0 &&
    businessName.trim().length > 0 &&
    normalizedPhone.length > 0 &&
    country.trim().length > 0 &&
    town.trim().length > 0 &&
    address.trim().length > 0
  const isLoginFormValid = EMAIL_PATTERN.test(normalizedEmail) && normalizedPassword.length > 0
  const isSubmitDisabled = isLoading || (mode === 'login' ? !isLoginFormValid : !isSignupFormValid)

  useEffect(() => {
    document.title = mode === 'login' ? 'Sedifex — Log in' : 'Sedifex — Sign up free'
  }, [mode])

  useEffect(() => {
    if (status.message && (status.tone === 'success' || status.tone === 'error')) {
      publish({ tone: status.tone, message: status.message })
    }
  }, [publish, status.message, status.tone])

  function handleModeChange(nextMode: AuthMode) {
    setMode(nextMode)
    setStatus({ tone: 'idle', message: '' })
    setConfirmPassword('')
    setFullName('')
    setBusinessName('')
    setPhone('')
    setCountry('')
    setTown('')
    setAddress('')
  }

  const completeLogin = async (nextUser: User) => {
    await persistSession(nextUser)
    try {
      const resolution = await resolveStoreAccess()
      await persistSession(nextUser, { storeId: resolution.storeId, workspaceSlug: resolution.workspaceSlug, role: resolution.role })
    } catch (error) {
      setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'login') })
      return false
    }
    return true
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const sanitizedEmail = email.trim()
    const sanitizedPassword = password.trim()
    const sanitizedConfirmPassword = confirmPassword.trim()
    const sanitizedPhone = sanitizePhone(phone)
    const sanitizedFullName = fullName.trim()
    const sanitizedBusinessName = businessName.trim()
    const sanitizedCountry = country.trim()
    const sanitizedTown = town.trim()
    const sanitizedAddress = address.trim()

    const validationError = mode === 'login' ? getLoginValidationError(sanitizedEmail, sanitizedPassword) : null
    if (validationError) {
      setStatus({ tone: 'error', message: validationError })
      return
    }

    if (mode === 'signup') {
      if (!doesPasswordMeetAllChecks) {
        setStatus({ tone: 'error', message: 'Use a stronger password with uppercase, lowercase, number, and symbol.' })
        return
      }
      if (sanitizedPassword !== sanitizedConfirmPassword) {
        setStatus({ tone: 'error', message: 'Passwords do not match. Please re-enter them.' })
        return
      }
    }

    setStatus({ tone: 'loading', message: mode === 'login' ? 'Signing you in…' : 'Creating your free account…' })

    try {
      if (mode === 'login') {
        const { user } = await signInWithEmailAndPassword(auth, sanitizedEmail, sanitizedPassword)
        const didCompleteLogin = await completeLogin(user)
        if (!didCompleteLogin) return
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, sanitizedEmail, sanitizedPassword)
        await persistSession(user)

        let initializedStoreId: string | undefined
        const signupRoleForWorkspace: SignupRoleOption = 'owner'

        try {
          const initialization = await initializeStore({
            phone: sanitizedPhone || null,
            firstSignupEmail: sanitizedEmail ? sanitizedEmail.toLowerCase() : null,
            ownerName: sanitizedFullName || null,
            businessName: sanitizedBusinessName || null,
            country: sanitizedCountry || null,
            town: sanitizedTown || null,
            address: sanitizedAddress || null,
            signupRole: signupRoleForWorkspace,
          }, null)
          initializedStoreId = initialization.storeId
        } catch (error) {
          setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'signup') })
          await cleanupFailedSignup()
          return
        }

        let resolution: ResolveStoreAccessResult
        try {
          resolution = await resolveStoreAccess(initializedStoreId)
        } catch (error) {
          setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'signup') })
          await cleanupFailedSignup()
          return
        }

        await persistSession(user, { storeId: resolution.storeId, workspaceSlug: resolution.workspaceSlug, role: resolution.role })

        await setDoc(doc(db, 'customers', user.uid), {
          storeId: resolution.storeId,
          name: sanitizedBusinessName || sanitizedFullName,
          displayName: sanitizedFullName,
          email: sanitizedEmail,
          phone: sanitizedPhone,
          businessName: sanitizedBusinessName || null,
          ownerName: sanitizedFullName,
          country: sanitizedCountry || null,
          town: sanitizedTown || null,
          address: sanitizedAddress || null,
          status: 'active',
          role: 'owner',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })

        await setDoc(doc(db, 'storeSettings', resolution.storeId), {
          navigation: {
            industry: accountType,
            labelPolicy: 'shared',
            enabled_modules: INDUSTRY_ENABLED_MODULE_PRESETS[accountType],
            showCustomizationBanner: false,
            requiresIndustryReview: false,
          },
        }, { merge: true })

        try {
          await user.getIdToken(true)
          await sendEmailVerification(user, { url: `${window.location.origin}/verify-email`, handleCodeInApp: true })
        } catch (error) {
          console.warn('[auth] Verification setup failed', error)
        }

        setOnboardingStatus(user.uid, 'pending')
        setMode('login')
      }

      setStatus({
        tone: 'success',
        message: mode === 'login' ? 'Welcome back! Redirecting…' : 'Free account created. Confirm your email, then sign in.',
      })
      setPassword('')
      setConfirmPassword('')
      setFullName('')
      setBusinessName('')
      setPhone('')
      setCountry('')
      setTown('')
      setAddress('')
      setAccountType('shop')
    } catch (error) {
      setStatus({ tone: 'error', message: getAuthErrorMessage(error, mode) })
    }
  }

  async function handleGoogleSignIn() {
    if (mode !== 'login' || isLoading) return
    setStatus({ tone: 'loading', message: 'Connecting to Google…' })
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const { user } = await signInWithPopup(auth, provider)
      const didCompleteLogin = await completeLogin(user)
      if (!didCompleteLogin) return
      setStatus({ tone: 'success', message: 'Welcome back! Redirecting…' })
    } catch (error) {
      setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'login') })
    }
  }

  return (
    <main className="app" style={{ minHeight: '100dvh' }}>
      <div className="app__layout">
        <div className="app__card">
          <div className="app__brand">
            <span className="app__logo">Sx</span>
            <div>
              <h1 className="app__title">Sedifex</h1>
              <p className="app__tagline">Run your business from one <span className="app__highlight">free Sedifex account.</span></p>
              <p className="app__trial-note">No trial pressure. Start free and upgrade only when you need more uploads, automation, integrations, or growth tools.</p>
            </div>
          </div>

          <div className="app__mode-toggle" role="tablist" aria-label="Authentication mode">
            <button className={`app__mode-button${mode === 'login' ? ' is-active' : ''}`} role="tab" aria-selected={mode === 'login'} onClick={() => handleModeChange('login')} type="button" disabled={isLoading}>Log in</button>
            <button className={`app__mode-button${mode === 'signup' ? ' is-active' : ''}`} role="tab" aria-selected={mode === 'signup'} onClick={() => handleModeChange('signup')} type="button" disabled={isLoading}>Sign up free</button>
          </div>

          <form className="form" onSubmit={handleSubmit} aria-label={mode === 'login' ? 'Log in form' : 'Sign up form'}>
            <div className="form__field">
              <label htmlFor="email">Email</label>
              <input id="email" value={email} onChange={event => setEmail(event.target.value)} onBlur={() => setEmail(current => current.trim())} type="email" autoComplete="email" placeholder="you@company.com" required disabled={isLoading} />
              <p className="form__hint">{mode === 'signup' ? 'We will send a verification link to this address.' : 'Enter the email you use for work.'}</p>
            </div>

            {mode === 'signup' && <>
              <div className="form__field"><label htmlFor="full-name">Full name</label><input id="full-name" value={fullName} onChange={event => setFullName(event.target.value)} type="text" autoComplete="name" placeholder="Your name" required disabled={isLoading} /></div>
              <div className="form__field"><label htmlFor="business-name">Business name</label><input id="business-name" value={businessName} onChange={event => setBusinessName(event.target.value)} type="text" autoComplete="organization" placeholder="Your business or school name" required disabled={isLoading} /></div>
              <div className="form__field"><label htmlFor="account-type">Account type</label><select id="account-type" value={accountType} onChange={event => setAccountType(event.target.value as AccountTypeOption)} required disabled={isLoading}><option value="shop">Shop / Retail</option><option value="travel">Travel / Booking business</option><option value="ngo">NGO / Church / Foundation</option><option value="school">School / Training center</option></select><p className="form__hint">Sedifex will set up the right navigation for your business type.</p></div>
              <div className="form__field"><label htmlFor="phone">Phone number</label><input id="phone" value={phone} onChange={event => setPhone(event.target.value)} onBlur={() => setPhone(current => sanitizePhone(current))} type="tel" autoComplete="tel" placeholder="024 000 0000" required disabled={isLoading} /></div>
              <div className="form__field"><label htmlFor="country">Country</label><input id="country" value={country} onChange={event => setCountry(event.target.value)} type="text" autoComplete="country-name" placeholder="Ghana" required disabled={isLoading} /></div>
              <div className="form__field"><label htmlFor="town">Town or city</label><input id="town" value={town} onChange={event => setTown(event.target.value)} type="text" autoComplete="address-level2" placeholder="Accra" required disabled={isLoading} /></div>
              <div className="form__field"><label htmlFor="address">Business address</label><textarea id="address" value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" placeholder="Your business location" required disabled={isLoading} rows={3} /></div>
            </>}

            <div className="form__field">
              <label htmlFor="password">Password</label>
              <input id="password" value={password} onChange={event => setPassword(event.target.value)} type={mode === 'login' && isPasswordVisible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Use a strong password" required disabled={isLoading} />
              {mode === 'login' && <label className="form__hint" style={{ display: 'inline-flex', gap: 8 }}><input type="checkbox" checked={isPasswordVisible} onChange={event => setIsPasswordVisible(event.target.checked)} disabled={isLoading} />Show password</label>}
              {mode === 'signup' && <ul className="form__hint-list">{passwordChecklist.map(item => <li key={item.id} data-complete={item.passed}><span className={`form__hint-indicator${item.passed ? ' is-valid' : ''}`}>{item.passed ? '✓' : '•'}</span>{item.label}</li>)}</ul>}
              {mode === 'login' && <p className="form__hint">Forgot your password? <Link to="/reset-password" className="form__link">Reset it.</Link></p>}
            </div>

            {mode === 'signup' && <div className="form__field"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Re-enter your password" required disabled={isLoading} /></div>}
            {mode === 'signup' && <p className="form__hint" style={{ marginTop: 8 }}>You are creating a free Sedifex workspace and will be the owner.</p>}

            <button className="primary-button" type="submit" disabled={isSubmitDisabled}>{isLoading ? (mode === 'login' ? 'Signing in…' : 'Creating free account…') : mode === 'login' ? 'Log in' : 'Create free account'}</button>
            {mode === 'login' && <button className="secondary-button" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>Continue with Google</button>}
          </form>

          {status.tone !== 'idle' && status.message && <p className={`status status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        </div>

        <aside className="app__visual" aria-label="Sedifex business operating system">
          <div className="app__visual-media" role="presentation"><img src={AUTH_VISUAL_IMAGE_URL} alt="Business owner using Sedifex on a laptop" loading="lazy" /></div>
          <div className="app__visual-overlay" />
          <div className="app__visual-caption"><span className="app__visual-pill">Free business operating system</span><h2>Sales, customers, bookings, registrations, payments, and growth tools in one place.</h2><p>Start with the free plan. Add paid power only when your business needs more capacity, automation, marketplace visibility, or integrations.</p></div>
        </aside>
      </div>

      <section className="app__promo-strategy" aria-label="Why businesses choose Sedifex">
        <header className="app__promo-strategy-header"><span className="app__pill">What Sedifex does</span><h2>One dashboard for daily operations and business growth.</h2><p>Sedifex helps shops, schools, NGOs, service businesses, and booking businesses manage work, customers, payments, and visibility without too many tools.</p></header>
        <div className="app__promo-pillars"><h3>What you can run</h3><ul><li><strong>Sell:</strong> products, services, invoices, receipts, POS, and customer display.</li><li><strong>Manage:</strong> inventory, customers, bookings, students, donors, and funds.</li><li><strong>Grow:</strong> Sedifex Market, websites, Google integrations, SMS/email, and social content.</li><li><strong>Connect:</strong> client websites can send bookings, donations, registrations, and checkout data to Sedifex.</li></ul></div>
      </section>

      <section className="app__pricing" aria-label="Sedifex pricing plans"><header className="app__pricing-header"><span className="app__pill">Start free</span><h2>Use Sedifex free, then upgrade when you need more power.</h2><p>The free plan is not a trial. It lets you start running your business with limits. Paid plans unlock higher capacity, automation, integrations, and growth tools.</p></header></section>
    </main>
  )
}

async function cleanupFailedSignup() {
  try {
    await auth.signOut()
  } catch (error) {
    console.warn('[signup] Unable to sign out after rejected signup', error)
  }
}
