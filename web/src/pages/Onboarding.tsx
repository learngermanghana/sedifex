import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useMemberships } from '../hooks/useMemberships'
import { useStorePreferences } from '../hooks/useStorePreferences'
import { INDUSTRY_ENABLED_MODULE_PRESETS, type Industry } from '../config/navigation'
import { setOnboardingStatus } from '../utils/onboarding'
import './Onboarding.css'

type Draft = { name: string; industry: Industry; phone: string; country: string; city: string; address: string }
const TYPES: { id: Industry; title: string; description: string; action: string; target: string }[] = [
  { id: 'shop', title: 'Shop or retail', description: 'Products, sales and stock', action: 'Add your first product', target: '/products/new' },
  { id: 'travel', title: 'Travel or bookings', description: 'Services and appointments', action: 'Add your first service', target: '/products/new' },
  { id: 'ngo', title: 'NGO, church or foundation', description: 'Supporters and activities', action: 'Add your first customer or supporter', target: '/customers' },
  { id: 'school', title: 'School or training centre', description: 'Courses and registrations', action: 'Add your first course', target: '/products/new' },
  { id: 'event', title: 'Event planning', description: 'Events, clients and coordination', action: 'Plan your first event', target: '/event-planning' },
]
const empty: Draft = { name: '', industry: 'shop', phone: '', country: '', city: '', address: '' }
export default function Onboarding() {
  const user = useAuthUser()
  const navigate = useNavigate()
  const { storeId, isLoading, error: storeError } = useActiveStore()
  const { memberships, loading: membersLoading } = useMemberships()
  const { preferences, loading: preferencesLoading, updatePreferences } = useStorePreferences(storeId)
  const owner = memberships.some(member => member.uid === user?.uid && member.storeId === storeId && member.role === 'owner') || user?.uid === storeId
  const [draft, setDraft] = useState<Draft>(empty)
  const [step, setStep] = useState(0)
  const [action, setAction] = useState<'first-task' | 'dashboard'>('first-task')
  const [loadedStore, setLoadedStore] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    setLoadedStore(''); setError(''); setStep(0); setDraft(empty)
    if (!storeId || !owner) return
    void getDoc(doc(db, 'stores', storeId)).then(snapshot => {
      if (!active) return
      if (!snapshot.exists()) throw new Error('Workspace not found.')
      const data = snapshot.data()
      const saved = data.onboardingGuide || {}
      const fields = saved.draft || {}
      const industry = fields.industry || data.industry || 'shop'
      const value = (key: keyof Draft, fallback: unknown) => typeof fields[key] === 'string' ? fields[key] : typeof fallback === 'string' ? fallback : ''
      setDraft({ name: value('name', data.displayName || data.businessName || data.name), industry: TYPES.some(type => type.id === industry) ? industry : 'shop', phone: value('phone', data.phone), country: value('country', data.country), city: value('city', data.city || data.town), address: value('address', data.addressLine1 || data.address) })
      setStep([0, 1, 2].includes(saved.step) ? saved.step : 0)
      setAction(saved.action === 'dashboard' ? 'dashboard' : 'first-task')
      setLoadedStore(storeId)
    }).catch(() => { if (active) setError('Your saved setup could not be loaded. Please try again.') })
    return () => { active = false }
  }, [storeId, owner, reload])
  const ready = Boolean(storeId && loadedStore === storeId && !isLoading && !preferencesLoading && !membersLoading)
  const type = TYPES.find(type => type.id === draft.industry) || TYPES[0]
  const identity = `${user?.uid || ''}:${storeId || ''}`
  const activeIdentity = useRef(identity)
  activeIdentity.current = identity
  async function save(nextStep: number, destination?: string, requireProfile = false) {
    if (!ready || !user || !storeId || !owner || inFlight.current) return
    if (requireProfile && !draft.name.trim()) { setError('Enter your business name to continue.'); return }
    const requestIdentity = identity
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (requireProfile) {
        const navigation = { ...preferences.navigation, industry: draft.industry, enabledModules: INDUSTRY_ENABLED_MODULE_PRESETS[draft.industry], dashboardModules: [], primaryMetrics: [], customLabels: {}, customNavItems: [] }
        await Promise.all([
          updatePreferences({ navigation }),
          setDoc(doc(db, 'stores', storeId), { displayName: draft.name.trim(), name: draft.name.trim(), industry: draft.industry, phone: draft.phone.trim(), country: draft.country.trim(), city: draft.city.trim(), addressLine1: draft.address.trim(), updatedAt: serverTimestamp() }, { merge: true }),
        ])
      }
      await setDoc(doc(db, 'stores', storeId), { onboardingGuide: { draft, step: nextStep, action, status: destination ? nextStep === 2 ? 'completed' : 'paused' : 'in_progress', updatedAt: serverTimestamp() } }, { merge: true })
      if (activeIdentity.current !== requestIdentity) return
      if (destination) {
        await setOnboardingStatus(user.uid, 'completed', { requireRemote: true })
        if (activeIdentity.current === requestIdentity) navigate(destination, { replace: true })
      } else setStep(nextStep)
    } catch { if (activeIdentity.current === requestIdentity) setError('Your setup could not be saved. Please retry before leaving.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (!owner && !membersLoading && !isLoading) return <main className="page onboarding-page"><h1>Your workspace is ready</h1><p>Your business owner manages setup. You can start with the pages available to your role.</p><button type="button" onClick={() => navigate('/', { replace: true })}>Open dashboard</button></main>
  return <main className="page onboarding-page" aria-labelledby="onboarding-title">
    <header className="onboarding-header"><span className="onboarding-eyebrow">Welcome to Sedifex</span><h1 id="onboarding-title">Let’s get your business ready</h1><p>A few simple steps to make this workspace yours. Your progress is saved when you continue or finish later.</p></header>
    <ol className="onboarding-steps" aria-label="Setup steps">{['Your business', 'First task', 'Ready to start'].map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined}><span>{index < step ? '✓' : index + 1}</span>{title}</li>)}</ol>
    {(error || storeError) && <p className="onboarding-error" role="alert">{error || storeError}{!loadedStore && <button type="button" onClick={() => setReload(value => value + 1)}>Try again</button>}</p>}
    {!ready ? <p role="status">Loading your workspace…</p> : <div className="onboarding-layout"><section className="onboarding-panel">
      {step === 0 ? <form onSubmit={event => { event.preventDefault(); void save(1, undefined, true) }}>
        <span className="onboarding-eyebrow">Step 1 of 3</span><h2>Tell us about your business</h2><p>We’ll recommend the pages that fit your work. You can customise them later in Account.</p>
        <label className="onboarding-field">Business name<input autoComplete="organization" value={draft.name} required disabled={busy} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
        <fieldset disabled={busy}><legend>Business type</legend><div className="onboarding-types">{TYPES.map(option => <label key={option.id} className={draft.industry === option.id ? 'is-selected' : ''}><input type="radio" name="business-type" value={option.id} checked={draft.industry === option.id} onChange={() => setDraft(current => ({ ...current, industry: option.id }))} /><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></fieldset>
        <details className="onboarding-contact"><summary>Contact and location <span>Optional for now</span></summary>{([{ key: 'phone', title: 'Business phone', autoComplete: 'tel', type: 'tel' }, { key: 'country', title: 'Country', autoComplete: 'country-name' }, { key: 'city', title: 'Town or city', autoComplete: 'address-level2' }, { key: 'address', title: 'Business address', autoComplete: 'street-address' }] as const).map(field => <label className="onboarding-field" key={field.key}>{field.title}<input autoComplete={field.autoComplete} type={'type' in field ? field.type : 'text'} value={draft[field.key]} disabled={busy} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} /></label>)}</details>
        <div className="onboarding-actions"><button className="onboarding-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button><button type="button" disabled={busy} onClick={() => void save(step, '/')}>Finish later</button></div>
      </form> : step === 1 ? <><span className="onboarding-eyebrow">Step 2 of 3</span><h2>Choose where to begin</h2><p>You can add your first item or start by exploring your workspace. Payouts and your public page can wait.</p><div className="onboarding-task-options">{([{ id: 'first-task', title: type.action, detail: 'We’ll open this task after setup.' }, { id: 'dashboard', title: 'Explore the dashboard', detail: 'Add products, services or other details later.' }] as const).map(option => <label key={option.id} className={action === option.id ? 'is-selected' : ''}><input type="radio" name="first-action" disabled={busy} checked={action === option.id} onChange={() => setAction(option.id)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</div><div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => setStep(0)}>Back</button><button className="onboarding-primary" type="button" disabled={busy} onClick={() => void save(2)}>{busy ? 'Saving…' : 'Continue'}</button><button type="button" disabled={busy} onClick={() => void save(step, '/')}>Finish later</button></div></> : <><span className="onboarding-eyebrow">Step 3 of 3</span><h2>You’re ready to start</h2><p><strong>{draft.name || 'Your business'}</strong> has its recommended pages. Your dashboard checklist will guide you through products, payouts and your public page whenever you need them.</p><p className="onboarding-saved">Business details saved · {type.title}</p><div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => setStep(1)}>Back</button><button className="onboarding-primary" type="button" disabled={busy} onClick={() => void save(2, action === 'dashboard' ? '/' : type.target)}>{busy ? 'Opening…' : action === 'dashboard' ? 'Open dashboard' : type.action}</button></div></>}
    </section><aside className="onboarding-preview" aria-label="Business preview"><span className="onboarding-eyebrow">Your workspace</span><div className="onboarding-avatar" aria-hidden="true">{draft.name.trim().slice(0, 1).toUpperCase() || 'S'}</div><h2>{draft.name || 'Your business name'}</h2><p>{type.title}</p><ul><li>Recommended pages selected for you</li><li>Your setup can grow with your business</li><li>Payout account and public page are optional</li></ul><small>Nothing is published publicly during this setup.</small></aside></div>}
  </main>
}
