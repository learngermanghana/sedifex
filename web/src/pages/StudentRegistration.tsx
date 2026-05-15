import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type RegistrationDoc = {
  id: string
  customer?: { name?: string; email?: string | null; phone?: string | null }
  data?: { course?: string | null; preferredClassTime?: string | null; branch?: string | null }
  payment?: { mode?: string; status?: string; amount?: number | null; currency?: string; reference?: string }
  createdAt?: Timestamp
}

function formatDate(value?: Timestamp) {
  const date = value?.toDate?.()
  return date ? date.toLocaleString() : '—'
}

function formatAmount(payment?: RegistrationDoc['payment']) {
  if (!payment || typeof payment.amount !== 'number') return '—'
  return `${payment.currency ?? 'GHS'} ${payment.amount.toFixed(2)}`
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadRegistrations() {
      if (!storeId) {
        setRegistrations([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const snapshot = await getDocs(
          query(
            collection(db, 'student_registrations'),
            where('storeId', '==', storeId),
            orderBy('createdAt', 'desc'),
            limit(100),
          ),
        )
        if (!active) return
        setRegistrations(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<RegistrationDoc, 'id'>) })))
      } catch (loadError) {
        console.error(loadError)
        if (!active) return
        setError('Unable to load student registrations. A Firestore index may be needed for storeId and createdAt.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRegistrations()
    return () => {
      active = false
    }
  }, [storeId])

  const totals = useMemo(() => {
    const total = registrations.length
    const paid = registrations.filter(item => ['paid', 'success', 'captured', 'confirmed'].includes(item.payment?.status ?? '')).length
    const manual = registrations.filter(item => item.payment?.status === 'pending_manual_review').length
    const pending = registrations.filter(item => item.payment?.status === 'pending').length
    return { total, paid, manual, pending }
  }, [registrations])

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Custom page</p>
        <h1>Student registration</h1>
        <p className="workspace-muted">
          Collect school admissions from a client website and manage online, manual, or no-payment registrations in Sedifex.
        </p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.total}</strong><span>Total registrations</span></article>
        <article className="workspace-card"><strong>{totals.paid}</strong><span>Paid or confirmed</span></article>
        <article className="workspace-card"><strong>{totals.pending}</strong><span>Online pending</span></article>
        <article className="workspace-card"><strong>{totals.manual}</strong><span>Manual review</span></article>
      </section>

      <section className="workspace-card">
        <h2>Website integration</h2>
        <p className="workspace-muted">Endpoint: POST /api/student-registration-intake</p>
        <p className="workspace-muted">Accepted payment modes: online, manual, none.</p>
        <p className="workspace-muted">Required data: storeId, customer name, and at least one customer contact.</p>
      </section>

      <section className="workspace-card">
        <h2>Latest registrations</h2>
        {loading ? <p>Loading registrations…</p> : null}
        {error ? <p className="form__error">{error}</p> : null}
        {!loading && !error && registrations.length === 0 ? <p className="workspace-muted">No student registrations yet.</p> : null}
        {registrations.length > 0 ? (
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr><th>Student</th><th>Course</th><th>Class time</th><th>Payment</th><th>Reference</th><th>Date</th></tr>
              </thead>
              <tbody>
                {registrations.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.customer?.name ?? 'Unnamed student'}</strong><br /><small>{item.customer?.phone ?? item.customer?.email ?? 'No contact'}</small></td>
                    <td>{item.data?.course ?? '—'}</td>
                    <td>{item.data?.preferredClassTime ?? '—'}</td>
                    <td>{item.payment?.status ?? '—'}<br /><small>{formatAmount(item.payment)}</small></td>
                    <td>{item.payment?.reference ?? '—'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
