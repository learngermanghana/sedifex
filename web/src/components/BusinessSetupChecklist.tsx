import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useAuthUser } from '../hooks/useAuthUser'
import './BusinessSetupChecklist.css'

type StepId = 'profile' | 'catalog' | 'payout' | 'public-page'
type Checklist = { completion: Record<StepId, boolean>; skipped: StepId[]; publicUrl: string | null }
const STEPS: { id: StepId; title: string; detail: string; target: string; optional: boolean }[] = [
  { id: 'profile', title: 'Business profile', detail: 'Add your business name and contact details. A logo is optional.', target: '/account?section=workspace', optional: false },
  { id: 'catalog', title: 'First product or service', detail: 'Add an item customers can buy or book.', target: '/products/new', optional: true },
  { id: 'payout', title: 'Payout account', detail: 'Choose a bank account or mobile money wallet for online payments.', target: '/settlement/setup', optional: true },
  { id: 'public-page', title: 'Public page', detail: 'Save your public page details, then preview the customer view.', target: '/promo', optional: true },
]
export default function BusinessSetupChecklist() {
  const { storeId } = useActiveStore()
  const { memberships } = useMemberships()
  const user = useAuthUser()
  const isOwner = memberships.some(member => member.uid === user?.uid && member.storeId === storeId && member.role === 'owner') || user?.uid === storeId
  const [loaded, setLoaded] = useState<{ storeId: string; data: Checklist } | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const activeStore = useRef(storeId)
  activeStore.current = storeId
  useEffect(() => {
    let active = true
    setError('')
    setBusy('')
    setLoaded(null)
    if (!storeId || !isOwner) return
    const get = httpsCallable<{ storeId: string }, Checklist>(functions, 'getBusinessSetupChecklist')
    void get({ storeId }).then(result => { if (active) setLoaded({ storeId, data: result.data }) }).catch(() => { if (active) setError('Setup progress could not be loaded. Try again.') })
    return () => { active = false }
  }, [storeId, isOwner, reload])
  if (!storeId || !isOwner) return null
  const data = loaded?.storeId === storeId ? loaded.data : null
  const done = data ? STEPS.filter(step => data.completion[step.id]).length : 0
  async function skip(step: StepId, skipped: boolean) {
    const requestStore = storeId
    setBusy(step)
    setError('')
    try {
      const update = httpsCallable(functions, 'setBusinessSetupStepSkipped')
      await update({ storeId: requestStore, step, skipped })
      if (activeStore.current === requestStore) setReload(value => value + 1)
    } catch { if (activeStore.current === requestStore) setError('This step could not be updated. Try again.') }
    finally { if (activeStore.current === requestStore) setBusy('') }
  }
  return <details className="business-setup" open={done < STEPS.length}>
    <summary><span><strong>Get your business ready</strong><small>{data ? `${done} of ${STEPS.length} steps complete${data.skipped.length ? ` · ${data.skipped.length} skipped` : ''}` : 'Checking saved setup progress…'}</small></span><span aria-hidden="true">⌄</span></summary>
    <div className="business-setup__body">
      <p>Complete the essentials, or skip optional steps and return whenever you need them.</p>
      <progress aria-label="Business setup progress" value={done} max={STEPS.length} />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading setup…</p>}
      {data && <ol>{STEPS.map(step => {
        const complete = data.completion[step.id]
        const skipped = !complete && data.skipped.includes(step.id)
        return <li key={step.id}><span className={`business-setup__status ${complete ? 'is-complete' : ''}`}>{complete ? 'Complete' : skipped ? 'Skipped' : 'To do'}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div><div className="business-setup__actions"><Link to={step.target}>{complete ? 'Review' : 'Open'}</Link>{step.id === 'public-page' && data.publicUrl && <a href={data.publicUrl} target="_blank" rel="noreferrer">Preview page</a>}{step.optional && !complete && <button type="button" disabled={Boolean(busy)} onClick={() => void skip(step.id, !skipped)}>{busy === step.id ? 'Saving…' : skipped ? 'Include step' : 'Skip for now'}</button>}</div></li>
      })}</ol>}
      <button type="button" className="business-setup__refresh" disabled={Boolean(busy)} onClick={() => setReload(value => value + 1)}>Refresh progress</button>
    </div>
  </details>
}
