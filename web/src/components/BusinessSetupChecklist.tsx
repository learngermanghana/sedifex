import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useAuthUser } from '../hooks/useAuthUser'
import './BusinessSetupChecklist.css'

type Checklist = { completion: { profile: boolean }; dismissed?: boolean }

export default function BusinessSetupChecklist() {
  const { storeId } = useActiveStore()
  const { pathname } = useLocation()
  const { memberships } = useMemberships()
  const user = useAuthUser()
  const isOwner = memberships.some(member => member.uid === user?.uid && member.storeId === storeId && member.role === 'owner') || user?.uid === storeId
  const [loaded, setLoaded] = useState<{ storeId: string; data: Checklist } | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const activeStore = useRef(storeId)
  activeStore.current = storeId

  useEffect(() => {
    let active = true
    setError('')
    setBusy(false)
    setLoaded(null)
    if (!storeId || !isOwner) return
    const get = httpsCallable<{ storeId: string }, Checklist>(functions, 'getBusinessSetupChecklist')
    void get({ storeId })
      .then(result => { if (active) setLoaded({ storeId, data: result.data }) })
      .catch(() => { if (active) setError('Could not check your profile. Try again.') })
    return () => { active = false }
  }, [storeId, isOwner, reload, pathname])

  useEffect(() => {
    const onProfileSaved = (event: Event) => {
      if ((event as CustomEvent<{ storeId: string }>).detail?.storeId === storeId) {
        setReload(value => value + 1)
      }
    }
    window.addEventListener('sedifex:profile-saved', onProfileSaved)
    return () => window.removeEventListener('sedifex:profile-saved', onProfileSaved)
  }, [storeId])

  if (!storeId || !isOwner) return null
  const data = loaded?.storeId === storeId ? loaded.data : null
  // Completed and dismissed prompts never reappear, including after sign-out or on another device.
  if (data?.completion.profile || data?.dismissed) return null

  async function dismiss() {
    const requestStore = storeId
    setBusy(true)
    setError('')
    try {
      const update = httpsCallable(functions, 'setBusinessSetupStepSkipped')
      await update({ storeId: requestStore, step: 'profile', skipped: true })
      if (activeStore.current === requestStore) {
        setLoaded({ storeId: requestStore, data: { completion: { profile: false }, dismissed: true } })
      }
    } catch {
      if (activeStore.current === requestStore) setError('Could not save your choice. Please try again.')
    } finally {
      if (activeStore.current === requestStore) setBusy(false)
    }
  }

  return <section className="business-setup" aria-label="Finish business profile">
    <div className="business-setup__body">
      <div>
        <h2>Complete your business profile</h2>
        <p>Add your business name and contact details. You only need to do this once.</p>
        {error ? <p role="alert" className="business-setup__error">{error}</p> : null}
      </div>
      {data ? <div className="business-setup__actions">
        <Link to="/account?section=workspace">Complete profile</Link>
        <button type="button" disabled={busy} onClick={() => void dismiss()}>{busy ? 'Saving…' : 'Skip setup'}</button>
      </div> : <div className="business-setup__actions">
        {error ? <button type="button" onClick={() => setReload(value => value + 1)}>Try again</button> : <span role="status">Checking your profile…</span>}
      </div>}
    </div>
  </section>
}
