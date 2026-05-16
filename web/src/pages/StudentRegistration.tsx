import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type RegistrationDoc = {
  id: string
  storeId?: string
  source?: string
  status?: string
  customer?: { name?: string; email?: string | null; phone?: string | null }
  data?: {
    course?: string | null
    preferredClassTime?: string | null
    branch?: string | null
    notes?: string | null
  }
  payment?: {
    mode?: string
    status?: string
    amount?: number | null
    currency?: string
    reference?: string
  }
  createdAt?: Timestamp | string | null
}

type ManualForm = {
  name: string
  phone: string
  email: string
  course: string
  preferredClassTime: string
  branch: string
  notes: string
  paymentMode: 'none' | 'manual' | 'online'
  paymentStatus: string
  amount: string
  reference: string
}

const initialManualForm: ManualForm = {
  name: '',
  phone: '',
  email: '',
  course: '',
  preferredClassTime: '',
  branch: '',
  notes: '',
  paymentMode: 'none',
  paymentStatus: 'not_required',
  amount: '',
  reference: '',
}

function toDate(value?: Timestamp | string | null) {
  if (!value) return null
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const date = value?.toDate?.()
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function formatDate(value?: Timestamp | string | null) {
  const date = toDate(value)
  return date ? date.toLocaleString() : '—'
}

function formatAmount(payment?: RegistrationDoc['payment']) {
  if (!payment || typeof payment.amount !== 'number') return '—'
  return `${payment.currency ?? 'GHS'} ${payment.amount.toFixed(2)}`
}

function cleanText(value: string, max = 200) {
  return value.trim().slice(0, max)
}

function normalizeEmail(value: string) {
  return cleanText(value, 160).toLowerCase()
}

function normalizePaymentStatus(mode: ManualForm['paymentMode'], status: string) {
  const normalized = cleanText(status, 80)
  if (normalized) return normalized
  if (mode === 'manual') return 'pending_manual_review'
  if (mode === 'online') return 'pending'
  return 'not_required'
}

function buildManualReference(storeId: string) {
  return `REG-${storeId.slice(0, 6).toUpperCase()}-${Date.now()}`
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState<ManualForm>(initialManualForm)

  async function loadRegistrations(active = true) {
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
          limit(200),
        ),
      )
      if (!active) return
      const rows = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Omit<RegistrationDoc, 'id'>) }))
        .sort((left, right) => {
          const leftTime = toDate(left.createdAt)?.getTime() ?? 0
          const rightTime = toDate(right.createdAt)?.getTime() ?? 0
          return rightTime - leftTime
        })
      setRegistrations(rows)
    } catch (loadError) {
      console.error(loadError)
      if (!active) return
      setError('Unable to load student registrations. Check Firestore rules or refresh after deployment.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadRegistrations(active)
    return () => {
      active = false
    }
  }, [storeId])

  const totals = useMemo(() => {
    const total = registrations.length
    const paid = registrations.filter(item => ['paid', 'success', 'captured', 'confirmed'].includes(item.payment?.status ?? '')).length
    const manual = registrations.filter(item => item.payment?.status === 'pending_manual_review').length
    const pending = registrations.filter(item => ['pending', 'checkout_created'].includes(item.payment?.status ?? '')).length
    return { total, paid, manual, pending }
  }, [registrations])

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId) {
      setError('Select a workspace before adding a student.')
      return
    }

    const studentName = cleanText(manualForm.name, 140)
    const phone = cleanText(manualForm.phone, 60)
    const email = normalizeEmail(manualForm.email)
    const course = cleanText(manualForm.course, 160)
    const amount = Number(manualForm.amount)
    const hasAmount = Number.isFinite(amount) && amount > 0

    if (!studentName) {
      setSaveMessage(null)
      setError('Student name is required.')
      return
    }

    if (!phone && !email) {
      setSaveMessage(null)
      setError('Enter at least one contact: phone or email.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)
      const reference = cleanText(manualForm.reference, 140) || buildManualReference(storeId)
      const paymentStatus = normalizePaymentStatus(manualForm.paymentMode, manualForm.paymentStatus)
      const now = serverTimestamp()
      const payload = {
        storeId,
        pageId: 'student-registration',
        pageType: 'student_registration',
        source: 'manual_dashboard',
        status: 'new',
        customer: {
          name: studentName,
          email: email || null,
          phone: phone || null,
        },
        data: {
          course: course || null,
          preferredClassTime: cleanText(manualForm.preferredClassTime, 120) || null,
          branch: cleanText(manualForm.branch, 120) || null,
          notes: cleanText(manualForm.notes, 1000) || null,
        },
        payment: {
          mode: manualForm.paymentMode,
          status: paymentStatus,
          amount: hasAmount ? amount : null,
          currency: 'GHS',
          reference,
        },
        createdAt: now,
        updatedAt: now,
      }

      const docRef = await addDoc(collection(db, 'student_registrations'), payload)
      await addDoc(collection(db, 'customers'), {
        storeId,
        name: studentName,
        displayName: studentName,
        email: email || null,
        phone: phone || null,
        source: 'student-registration-manual',
        tags: ['Student', course].filter(Boolean),
        studentRegistrationId: docRef.id,
        createdAt: now,
        updatedAt: now,
      })

      setManualForm(initialManualForm)
      setSaveMessage('Student registration added.')
      await loadRegistrations(true)
    } catch (saveError) {
      console.error(saveError)
      setError('Unable to save student registration. Check Firestore rules or try again.')
    } finally {
      setSaving(false)
    }
  }

  function updateManualForm<K extends keyof ManualForm>(key: K, value: ManualForm[K]) {
    setManualForm(current => ({
      ...current,
      [key]: value,
      ...(key === 'paymentMode'
        ? {
            paymentStatus:
              value === 'manual'
                ? 'pending_manual_review'
                : value === 'online'
                  ? 'pending'
                  : 'not_required',
          }
        : {}),
    }))
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Custom page</p>
        <h1>Student registration</h1>
        <p className="workspace-muted">
          Collect school admissions from a client website, sync registrations into Sedifex, or add students manually from the dashboard.
        </p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.total}</strong><span>Total registrations</span></article>
        <article className="workspace-card"><strong>{totals.paid}</strong><span>Paid or confirmed</span></article>
        <article className="workspace-card"><strong>{totals.pending}</strong><span>Online pending</span></article>
        <article className="workspace-card"><strong>{totals.manual}</strong><span>Manual review</span></article>
      </section>

      <section className="workspace-card">
        <h2>Website sync</h2>
        <p className="workspace-muted">Use this endpoint from school websites to sync registrations into this page:</p>
        <pre className="workspace-code">POST https://www.sedifex.com/api/student-registration-intake</pre>
        <p className="workspace-muted">Accepted payment modes: online, manual, none. Required data: storeId, customer name, and at least one customer contact.</p>
      </section>

      <section className="workspace-card">
        <h2>Add student manually</h2>
        <form className="form" onSubmit={handleManualSubmit}>
          <div className="workspace-grid workspace-grid--two">
            <label>
              <span>Student name *</span>
              <input value={manualForm.name} onChange={event => updateManualForm('name', event.target.value)} placeholder="Student full name" />
            </label>
            <label>
              <span>Phone</span>
              <input value={manualForm.phone} onChange={event => updateManualForm('phone', event.target.value)} placeholder="+233..." />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={manualForm.email} onChange={event => updateManualForm('email', event.target.value)} placeholder="student@example.com" />
            </label>
            <label>
              <span>Course / program</span>
              <input value={manualForm.course} onChange={event => updateManualForm('course', event.target.value)} placeholder="Hair Braiding" />
            </label>
            <label>
              <span>Preferred class time</span>
              <input value={manualForm.preferredClassTime} onChange={event => updateManualForm('preferredClassTime', event.target.value)} placeholder="14 July 2026, Morning" />
            </label>
            <label>
              <span>Branch</span>
              <input value={manualForm.branch} onChange={event => updateManualForm('branch', event.target.value)} placeholder="Tema" />
            </label>
            <label>
              <span>Payment mode</span>
              <select value={manualForm.paymentMode} onChange={event => updateManualForm('paymentMode', event.target.value as ManualForm['paymentMode'])}>
                <option value="none">No payment required</option>
                <option value="manual">Manual payment</option>
                <option value="online">Online payment</option>
              </select>
            </label>
            <label>
              <span>Payment status</span>
              <input value={manualForm.paymentStatus} onChange={event => updateManualForm('paymentStatus', event.target.value)} />
            </label>
            <label>
              <span>Amount</span>
              <input inputMode="decimal" value={manualForm.amount} onChange={event => updateManualForm('amount', event.target.value)} placeholder="0.00" />
            </label>
            <label>
              <span>Reference</span>
              <input value={manualForm.reference} onChange={event => updateManualForm('reference', event.target.value)} placeholder="Optional" />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea rows={3} value={manualForm.notes} onChange={event => updateManualForm('notes', event.target.value)} placeholder="Student goals, parent contact, payment note, etc." />
          </label>
          <div className="form__actions">
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Add student'}</button>
            <button type="button" className="button button--secondary" onClick={() => setManualForm(initialManualForm)} disabled={saving}>Clear</button>
          </div>
          {saveMessage ? <p className="form__success">{saveMessage}</p> : null}
        </form>
      </section>

      <section className="workspace-card">
        <div className="workspace-card__header">
          <div>
            <h2>Latest registrations</h2>
            <p className="workspace-muted">Website sync and manual entries appear here.</p>
          </div>
          <button type="button" className="button button--secondary" onClick={() => void loadRegistrations(true)} disabled={loading}>Refresh</button>
        </div>
        {loading ? <p>Loading registrations…</p> : null}
        {error ? <p className="form__error">{error}</p> : null}
        {!loading && !error && registrations.length === 0 ? <p className="workspace-muted">No student registrations yet.</p> : null}
        {registrations.length > 0 ? (
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr><th>Student</th><th>Course</th><th>Class time</th><th>Source</th><th>Payment</th><th>Reference</th><th>Date</th></tr>
              </thead>
              <tbody>
                {registrations.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.customer?.name ?? 'Unnamed student'}</strong><br /><small>{item.customer?.phone ?? item.customer?.email ?? 'No contact'}</small></td>
                    <td>{item.data?.course ?? '—'}</td>
                    <td>{item.data?.preferredClassTime ?? '—'}</td>
                    <td>{item.source ?? '—'}</td>
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