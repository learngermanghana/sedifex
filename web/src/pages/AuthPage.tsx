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

const AUTH_VISUAL_IMAGE_URL = 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 8

type AuthMode = 'login' | 'signup'
type StatusTone = 'idle' | 'loading' | 'success' | 'error'
type AccountTypeOption = Industry

type StatusState = { tone: StatusTone; message: string }
type PasswordStrength = { isLongEnough: boolean; hasUppercase: boolean; hasLowercase: boolean; hasNumber: boolean; hasSymbol: boolean }

const PRICING_PLANS = [
  {
    name: 'Starter',
    badge: 'Start free',
    price: 'Free',
    billing: 'GHS 0 / month',
    bestFor: 'Testing Sedifex with a very small business.',
    highlight: false,
    includes: [
      '1 workspace',
      '1 staff/user',
      'Basic dashboard',
      'Basic items/products',
      'Basic customers',
      'Basic receipts/invoices',
      'Public Sedifex page',
      'QR code / public link',
      'Limited reports',
      'Sedifex branding',
      'Workspace switching when invited',
    ],
    limits: [
      'Up to 50 products/services',
      'Up to 30 receipts/invoices per month',
      'No custom domain',
      'No API keys',
      'No bulk email',
      'No advanced website builder templates',
      'No Sedifex Market product sync',
    ],
  },
  {
    name: 'Business',
    badge: 'Most popular',
    price: 'GHS 99',
    billing: 'per month · GHS 999 / year',
    bestFor: 'Sales, inventory, receipts, bookings, and marketplace visibility.',
    highlight: true,
    includes: [
      'Everything in Starter',
      'Inventory / items',
      'POS selling',
      'Receipts and invoices',
      'Customers and bookings',
      'Basic reports',
      'Basic website builder',
      'Quick Pay',
      'Sedifex Market listing',
      'Products/services sync to sedifexmarket.com',
      'Sedifex Market sales sync back into Sedifex',
      '2 staff/users',
      'Up to 300 products/services',
    ],
    limits: [
      '1 business workspace per subscription',
      'No custom domain',
      'No Products API or Bookings API',
      'Limited automation',
    ],
  },
  {
    name: 'Growth Website',
    badge: 'Best for online growth',
    price: 'GHS 199',
    billing: 'per month · GHS 1,999 / year',
    bestFor: 'A real business website connected to Sedifex and Sedifex Market.',
    highlight: false,
    includes: [
      'Everything in Business',
      'Full website builder',
      'Website template library',
      'Website preview with sample templates',
      'Custom domain setup',
      'SEO settings',
      'Social media links',
      'Gallery and promo content',
      'Website QR code and sharing tools',
      'Products API and Bookings API',
      'Website checkout setup',
      'Full sedifexmarket.com sales sync',
      'Website orders and marketplace orders sync into Sedifex',
      'Website sales report + marketplace sales report',
      '5 staff/users',
      'Up to 1,000 products/services',
    ],
    limits: [
      '1 business workspace per subscription',
      'Extra workspaces require their own plan',
      'Advanced custom integrations may require setup fee',
    ],
  },
] as const

function sanitizePhone(value: string): string { return normalizeGhanaPhoneE164(value) }
function toTitleCase(value: string): string { return value.trim().toLowerCase().replace(/\b([a-z])/g, match => match.toUpperCase()) }
function evaluatePasswordStrength(password: string): PasswordStrength { return { isLongEnough: password.length >= PASSWORD_MIN_LENGTH, hasUppercase: /[A-Z]/.test(password), hasLowercase: /[a-z]/.test(password), hasNumber: /\d/.test(password), hasSymbol: /[^A-Za-z0-9]/.test(password) } }
function getLoginValidationError(email: string, password: string): string | null { if (!email) return 'Enter your email.'; if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.'; if (!password) return 'Enter your password.'; return null }
function navigationTemplateForIndustry(industry: Industry) {
  const enabledModules = INDUSTRY_ENABLED_MODULE_PRESETS[industry] ?? INDUSTRY_ENABLED_MODULE_PRESETS.shop
  return {
    industry,
    labelPolicy: 'industry_aliases',
    enabledModules,
    enabled_modules: enabledModules,
    visible_modules: enabledModules,
    dashboardModules: [],
    dashboard_modules: [],
    primaryMetrics: [],
    primary_metrics: [],
    customLabels: {},
    customNavItems: [],
    custom_nav_items: [],
    showCustomizationBanner: false,
    requiresIndustryReview: false,
    templateAppliedAt: serverTimestamp(),
  }
}
function getErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code || '') {
      case 'auth/invalid-login-credentials': case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Incorrect email or password.'
      case 'auth/user-disabled': return 'This account has been disabled. Please contact support to restore access.'
      case 'auth/invalid-email': return 'Enter a valid email address.'
      case 'auth/missing-email': return 'Enter your email to continue.'
      case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.'
      case 'auth/network-request-failed': return 'Network error. Please check your connection and try again.'
      case 'auth/email-already-in-use': return 'An account already exists with this email.'
      case 'auth/operation-not-allowed': return 'Email and password sign-in is currently unavailable. Please contact support.'
      case 'auth/missing-password': return 'Enter your password to continue.'
      case 'auth/weak-password': return 'Please choose a stronger password.'
      case 'functions/permission-denied': return extractCallableErrorMessage(error) ?? INACTIVE_WORKSPACE_MESSAGE
      default: return (error as any).message || 'Something went wrong. Please try again.'
    }
  }
  if (error instanceof Error) return error.message || 'Something went wrong. Please try again.'
  if (typeof error === 'string') return error
  return 'Something went wrong. Please try again.'
}
function getAuthErrorMessage(error: unknown, mode: AuthMode): string { const message = getErrorMessage(error); if (mode === 'signup' && message === 'An account already exists with this email.') return 'An account already exists with this email. Try logging in instead or use another email to sign up.'; return message }

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
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
  const isSignupFormValid = EMAIL_PATTERN.test(normalizedEmail) && normalizedPassword.length > 0 && doesPasswordMeetAllChecks && normalizedPassword === normalizedConfirmPassword && fullName.trim().length > 0 && businessName.trim().length > 0 && normalizedPhone.length > 0 && country.trim().length > 0 && town.trim().length > 0 && address.trim().length > 0
  const isLoginFormValid = EMAIL_PATTERN.test(normalizedEmail) && normalizedPassword.length > 0
  const isSubmitDisabled = isLoading || (mode === 'login' ? !isLoginFormValid : !isSignupFormValid)

  useEffect(() => { document.title = mode === 'login' ? 'Sedifex — Log in' : 'Sedifex — Sign up free' }, [mode])
  useEffect(() => { if (status.message && (status.tone === 'success' || status.tone === 'error')) publish({ tone: status.tone, message: status.message }) }, [publish, status.message, status.tone])

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

  function startSignup() {
    handleModeChange('signup')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const completeLogin = async (nextUser: User) => {
    await persistSession(nextUser)
    try { const resolution = await resolveStoreAccess(); await persistSession(nextUser, { storeId: resolution.storeId, workspaceSlug: resolution.workspaceSlug, role: resolution.role }) } catch (error) { setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'login') }); return false }
    return true
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const sanitizedEmail = email.trim()
    const sanitizedPassword = password.trim()
    const sanitizedConfirmPassword = confirmPassword.trim()
    const sanitizedPhone = sanitizePhone(phone)
    const sanitizedFullName = toTitleCase(fullName)
    const sanitizedBusinessName = toTitleCase(businessName)
    const sanitizedCountry = country.trim()
    const sanitizedTown = town.trim()
    const sanitizedAddress = address.trim()

    const validationError = mode === 'login' ? getLoginValidationError(sanitizedEmail, sanitizedPassword) : null
    if (validationError) { setStatus({ tone: 'error', message: validationError }); return }
    if (mode === 'signup') {
      if (!doesPasswordMeetAllChecks) { setStatus({ tone: 'error', message: 'Use a stronger password with uppercase, lowercase, number, and symbol.' }); return }
      if (sanitizedPassword !== sanitizedConfirmPassword) { setStatus({ tone: 'error', message: 'Passwords do not match. Please re-enter them.' }); return }
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
          const initialization = await initializeStore({ phone: sanitizedPhone || null, firstSignupEmail: sanitizedEmail ? sanitizedEmail.toLowerCase() : null, ownerName: sanitizedFullName || null, businessName: sanitizedBusinessName || null, country: sanitizedCountry || null, town: sanitizedTown || null, address: sanitizedAddress || null, signupRole: signupRoleForWorkspace }, null)
          initializedStoreId = initialization.storeId
        } catch (error) { setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'signup') }); await cleanupFailedSignup(); return }

        let resolution: ResolveStoreAccessResult
        try { resolution = await resolveStoreAccess(initializedStoreId) } catch (error) { setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'signup') }); await cleanupFailedSignup(); return }
        await persistSession(user, { storeId: resolution.storeId, workspaceSlug: resolution.workspaceSlug, role: resolution.role })

        const navigationTemplate = navigationTemplateForIndustry(accountType)
        await setDoc(doc(db, 'customers', user.uid), { storeId: resolution.storeId, name: sanitizedBusinessName || sanitizedFullName, displayName: sanitizedFullName, email: sanitizedEmail, phone: sanitizedPhone, businessName: sanitizedBusinessName || null, ownerName: sanitizedFullName, country: sanitizedCountry || null, town: sanitizedTown || null, address: sanitizedAddress || null, status: 'active', role: 'owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
        await Promise.all([
          setDoc(doc(db, 'storeSettings', resolution.storeId), { navigation: navigationTemplate }, { merge: true }),
          setDoc(doc(db, 'stores', resolution.storeId), { navigation: navigationTemplate, industry: accountType, updatedAt: serverTimestamp() }, { merge: true }),
        ])

        try { await user.getIdToken(true); await sendEmailVerification(user, { url: `${window.location.origin}/verify-email`, handleCodeInApp: true }) } catch (error) { console.warn('[auth] Verification setup failed', error) }
        setOnboardingStatus(user.uid, 'pending')
        setMode('login')
      }

      setStatus({ tone: 'success', message: mode === 'login' ? 'Welcome back! Redirecting…' : 'Free account created. Confirm your email, then sign in.' })
      setPassword(''); setConfirmPassword(''); setFullName(''); setBusinessName(''); setPhone(''); setCountry(''); setTown(''); setAddress(''); setAccountType('shop')
    } catch (error) { setStatus({ tone: 'error', message: getAuthErrorMessage(error, mode) }) }
  }

  async function handleGoogleSignIn() {
    if (mode !== 'login' || isLoading) return
    setStatus({ tone: 'loading', message: 'Connecting to Google…' })
    try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); const { user } = await signInWithPopup(auth, provider); const didCompleteLogin = await completeLogin(user); if (!didCompleteLogin) return; setStatus({ tone: 'success', message: 'Welcome back! Redirecting…' }) } catch (error) { setStatus({ tone: 'error', message: getAuthErrorMessage(error, 'login') }) }
  }

  const formTitle = mode === 'login' ? 'Log in to your workspace' : 'Create your free workspace'
  const formSubtitle = mode === 'login'
    ? 'Access your Sedifex dashboard, sales, customers, bookings, reports, and website tools.'
    : 'Start free with your business details. Upgrade later only when you need more power.'

  return (
    <main className="app" style={{ minHeight: '100dvh' }}>
      <div className="app__layout">
        <div className="app__card">
          <div className="app__brand"><span className="app__logo">Sx</span><div><h1 className="app__title">Sedifex</h1><p className="app__tagline">Run your business from one <span className="app__highlight">free Sedifex account.</span></p><p className="app__trial-note">No trial pressure. Start free and upgrade only when you need more uploads, automation, integrations, or growth tools.</p></div></div>
          <div className="app__auth-heading"><h2>{formTitle}</h2><p>{formSubtitle}</p></div>
          <div className="app__mode-toggle" role="tablist" aria-label="Authentication mode"><button className={`app__mode-button${mode === 'login' ? ' is-active' : ''}`} role="tab" aria-selected={mode === 'login'} onClick={() => handleModeChange('login')} type="button" disabled={isLoading}>Log in</button><button className={`app__mode-button${mode === 'signup' ? ' is-active' : ''}`} role="tab" aria-selected={mode === 'signup'} onClick={() => handleModeChange('signup')} type="button" disabled={isLoading}>Sign up free</button></div>
          <p className="app__auth-switch">{mode === 'login' ? 'New to Sedifex?' : 'Already have an account?'} <button type="button" onClick={() => handleModeChange(mode === 'login' ? 'signup' : 'login')} disabled={isLoading}>{mode === 'login' ? 'Create a free account' : 'Log in instead'}</button></p>
          <form className="form" onSubmit={handleSubmit} aria-label={mode === 'login' ? 'Log in form' : 'Sign up form'}>
            <div className="form__field"><label htmlFor="email">Email</label><input id="email" value={email} onChange={event => setEmail(event.target.value)} onBlur={() => setEmail(current => current.trim())} type="email" autoComplete="email" placeholder="you@company.com" required disabled={isLoading} /><p className="form__hint">{mode === 'signup' ? 'We will send a verification link to this address.' : 'Enter the email you use for work.'}</p></div>
            {mode === 'signup' && <><div className="form__field"><label htmlFor="full-name">Full name</label><input id="full-name" value={fullName} onChange={event => setFullName(event.target.value)} type="text" autoComplete="name" placeholder="Your name" required disabled={isLoading} /></div><div className="form__field"><label htmlFor="business-name">Business name</label><input id="business-name" value={businessName} onChange={event => setBusinessName(event.target.value)} type="text" autoComplete="organization" placeholder="Your business or school name" required disabled={isLoading} /></div><div className="form__field"><label htmlFor="account-type">Account type</label><select id="account-type" value={accountType} onChange={event => setAccountType(event.target.value as AccountTypeOption)} required disabled={isLoading}><option value="shop">Shop / Retail</option><option value="travel">Travel / Booking business</option><option value="ngo">NGO / Church / Foundation</option><option value="school">School / Training center</option></select><p className="form__hint">Sedifex will set up the right navigation for your business type.</p></div><div className="form__field"><label htmlFor="phone">Phone number</label><input id="phone" value={phone} onChange={event => setPhone(event.target.value)} onBlur={() => setPhone(current => sanitizePhone(current))} type="tel" autoComplete="tel" placeholder="024 000 0000" required disabled={isLoading} /></div><div className="form__field"><label htmlFor="country">Country</label><input id="country" value={country} onChange={event => setCountry(event.target.value)} type="text" autoComplete="country-name" placeholder="Ghana" required disabled={isLoading} /></div><div className="form__field"><label htmlFor="town">Town or city</label><input id="town" value={town} onChange={event => setTown(event.target.value)} type="text" autoComplete="address-level2" placeholder="Accra" required disabled={isLoading} /></div><div className="form__field"><label htmlFor="address">Business address</label><textarea id="address" value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" placeholder="Your business location" required disabled={isLoading} rows={3} /></div></>}
            <div className="form__field"><label htmlFor="password">Password</label><input id="password" value={password} onChange={event => setPassword(event.target.value)} type={mode === 'login' && isPasswordVisible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Use a strong password" required disabled={isLoading} />{mode === 'login' && <label className="form__hint" style={{ display: 'inline-flex', gap: 8 }}><input type="checkbox" checked={isPasswordVisible} onChange={event => setIsPasswordVisible(event.target.checked)} disabled={isLoading} />Show password</label>}{mode === 'signup' && <ul className="form__hint-list">{passwordChecklist.map(item => <li key={item.id} data-complete={item.passed}><span className={`form__hint-indicator${item.passed ? ' is-valid' : ''}`}>{item.passed ? '✓' : '•'}</span>{item.label}</li>)}</ul>}{mode === 'login' && <p className="form__hint">Forgot your password? <Link to="/reset-password" className="form__link">Reset it.</Link></p>}</div>
            {mode === 'signup' && <div className="form__field"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Re-enter your password" required disabled={isLoading} /></div>}
            {mode === 'signup' && <p className="form__hint" style={{ marginTop: 8 }}>You are creating a free Sedifex workspace and will be the owner.</p>}
            <button className="primary-button" type="submit" disabled={isSubmitDisabled}>{isLoading ? (mode === 'login' ? 'Signing in…' : 'Creating free account…') : mode === 'login' ? 'Log in' : 'Create free account'}</button>
            {mode === 'login' && <button className="secondary-button" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>Continue with Google</button>}
          </form>
          {status.tone !== 'idle' && status.message && <p className={`status status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        </div>
        <aside className="app__visual" aria-label="Sedifex business operating system"><div className="app__visual-media" role="presentation"><img src={AUTH_VISUAL_IMAGE_URL} alt="Business team using a laptop" loading="lazy" /></div><div className="app__visual-overlay" /><div className="app__visual-dashboard" aria-hidden="true"><div><span>Today sales</span><strong>GHS 2,450</strong></div><div><span>Bookings</span><strong>18</strong></div><div><span>Website</span><strong>Published</strong></div></div><div className="app__visual-caption"><span className="app__visual-pill">Free business operating system</span><h2>Run sales, customers, bookings, websites, payments, and reports from one place.</h2><p>Log in to continue, or create a free workspace when you are ready to start with Sedifex.</p></div></aside>
      </div>
      <section className="app__promo-strategy" aria-label="Why businesses choose Sedifex"><header className="app__promo-strategy-header"><span className="app__pill">What Sedifex does</span><h2>One dashboard for daily operations and business growth.</h2><p>Sedifex helps shops, schools, NGOs, service businesses, and booking businesses manage work, customers, payments, and visibility without too many tools.</p></header><div className="app__promo-pillars"><h3>What you can run</h3><ul><li><strong>Sell:</strong> products, services, invoices, receipts, POS, and customer display.</li><li><strong>Manage:</strong> inventory, customers, bookings, students, donors, and funds.</li><li><strong>Grow:</strong> Sedifex Market, websites, Google integrations, SMS/email, and social content.</li><li><strong>Connect:</strong> client websites can send bookings, donations, registrations, and checkout data to Sedifex.</li></ul></div></section>
      <section className="app__pricing" aria-label="Sedifex pricing plans">
        <header className="app__pricing-header"><span className="app__pill">Simple pricing</span><h2>Start free. Upgrade when you need marketplace sync, websites, bookings, payments, and growth tools.</h2><p>These prices are shown on the landing page first. Backend plan enforcement can be connected after the pricing is approved.</p></header>
        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING_PLANS.map(plan => (
            <article key={plan.name} className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-2xl ${plan.highlight ? 'border-cyan-300 bg-white text-slate-950 shadow-cyan-950/30' : 'border-white/15 bg-white/10 text-white shadow-slate-950/30 backdrop-blur'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${plan.highlight ? 'bg-cyan-100 text-cyan-900' : 'bg-white/10 text-cyan-100'}`}>{plan.badge}</p>
                  <h3 className="text-2xl font-black tracking-tight">{plan.name}</h3>
                </div>
              </div>
              <div className="mt-5">
                <p className="text-4xl font-black tracking-tight">{plan.price}</p>
                <p className={`mt-1 text-sm font-semibold ${plan.highlight ? 'text-slate-500' : 'text-slate-300'}`}>{plan.billing}</p>
                <p className={`mt-4 text-sm leading-6 ${plan.highlight ? 'text-slate-600' : 'text-slate-300'}`}>{plan.bestFor}</p>
              </div>
              <div className="mt-6 grid gap-4">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-[0.14em]">Includes</h4>
                  <ul className="mt-3 grid gap-2 text-sm leading-6">
                    {plan.includes.map(item => <li key={item} className="flex gap-2"><span className={plan.highlight ? 'text-cyan-600' : 'text-cyan-300'}>✓</span><span>{item}</span></li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-[0.14em]">Limits</h4>
                  <ul className={`mt-3 grid gap-2 text-sm leading-6 ${plan.highlight ? 'text-slate-600' : 'text-slate-300'}`}>
                    {plan.limits.map(item => <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>)}
                  </ul>
                </div>
              </div>
              <button type="button" onClick={startSignup} className={`mt-7 w-full rounded-2xl px-5 py-4 text-sm font-black transition hover:-translate-y-0.5 ${plan.highlight ? 'bg-slate-950 text-white' : 'bg-white text-slate-950'}`}>{plan.name === 'Starter' ? 'Start free' : 'Create account'}</button>
            </article>
          ))}
        </div>
        <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 text-slate-200 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <h3 className="text-2xl font-black text-white">Workspace rule</h3>
          <p className="mt-3 leading-7">One subscription equals one business workspace. A user can log in once and switch between workspaces they own or have been invited to, but each business workspace has its own plan, data, staff, website, reports, and Sedifex Market sync.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <p className="rounded-2xl bg-slate-950/50 p-4"><strong>1 shop</strong><br />1 workspace, 1 plan</p>
            <p className="rounded-2xl bg-slate-950/50 p-4"><strong>2 shops</strong><br />2 workspaces, 2 plans</p>
            <p className="rounded-2xl bg-slate-950/50 p-4"><strong>Invited staff</strong><br />Can switch between assigned workspaces</p>
          </div>
        </div>
      </section>
    </main>
  )
}

async function cleanupFailedSignup() { try { await auth.signOut() } catch (error) { console.warn('[signup] Unable to sign out after rejected signup', error) } }
