import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'
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
    provider?: string | null
    checkoutUrl?: string | null
    authorizationUrl?: string | null
    accessCode?: string | null
    error?: string | null
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

type CheckoutResult = {
  checkoutUrl: string
  authorizationUrl?: string | null
  accessCode?: string | null
  reference: string
  raw: Record<string, unknown>
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

const pageStyles: Record<string, CSSProperties> = {
  page: { display: 'grid', gap: 22, color: '#0f172a' },
  hero: {
    borderRadius: 26,
    padding: '28px 30px',
    background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 52%, #7c3aed 100%)',
    color: '#fff',
    boxShadow: '0 28px 70px -42px rgba(49, 46, 129, 0.8)',
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.74)',
  },
  title: { margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 780, color: 'rgba(255,255,255,0.82)', fontSize: 16, lineHeight: 1.65 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 },
  statCard: { borderRadius: 22, border: '1px solid #e2e8f0', background: '#ffffff', padding: 18, boxShadow: '0 20px 50px -38px rgba(15, 23, 42, 0.55)' },
  statLabel: { margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 13 },
  statValue: { margin: 0, fontSize: 34, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.05em' },
  card: { borderRadius: 24, border: '1px solid #e2e8f0', background: '#ffffff', padding: 22, boxShadow: '0 24px 60px -42px rgba(15, 23, 42, 0.5)' },
  cardHeader: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardTitle: { margin: 0, fontSize: 21, letterSpacing: '-0.02em' },
  muted: { color: '#64748b', margin: '5px 0 0', lineHeight: 1.6 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 },
  label: { display: 'grid', gap: 7, color: '#334155', fontSize: 13, fontWeight: 800 },
  input: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', fontSize: 14, background: '#ffffff', color: '#0f172a', outline: 'none' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 14, padding: '12px 18px', background: 'linear-gradient(135deg, #4338ca, #4f46e5)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(67, 56, 202, 0.85)' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 14, padding: '11px 16px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  tableWrap: { overflowX: 'auto', borderRadius: 18, border: '1px solid #e2e8f0' },
  table: { width: '100%', minWidth: 980, borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '13px 14px', fontSize: 12, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.08em' },
  td: { padding: '14px 14px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top', color: '#334155', fontSize: 14 },
  alert: { borderRadius: 16, padding: '12px 14px', fontWeight: 800 },
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

function phoneFallbackEmail(phone: string) {
  const digits = phone.replace(/[^\d]/g, '')
  return `${digits || 'student'}@sedifex.local`
}

function normalizePaymentStatus(mode: ManualForm['paymentMode'], status: string) {
  const normalized = cleanText(status, 80)
  if (mode === 'online') return normalized && normalized !== 'pending' ? normalized : 'checkout_created'
  if (normalized) return normalized
  if (mode === 'manual') return 'pending_manual_review'
  return 'not_required'
}

function buildManualReference(storeId: string) {
  return `REG-${storeId.slice(0, 6).toUpperCase()}-${Date.now()}`
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'student-registration'
}

function getCheckoutCreateUrl() {
  const configured = import.meta.env.VITE_SEDIFEX_CHECKOUT_CREATE_URL
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  return `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/integrationCheckoutCreate`
}

function getReturnUrl(reference: string) {
  if (typeof window === 'undefined') return undefined
  const url = new URL(window.location.href)
  url.searchParams.set('checkoutReference', reference)
  return url.toString()
}

function statusLabel(value?: string) {
  const text = value || 'not_required'
  return text.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusStyle(value?: string) {
  const normalized = (value || '').toLowerCase()
  if (['paid', 'success', 'captured', 'confirmed'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }
  if (['pending', 'checkout_created', 'pending_manual_review'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }
  if (['checkout_failed', 'failed'].includes(normalized)) return { background: '#fee2e2', color: '#991b1b' }
  return { background: '#e0e7ff', color: '#3730a3' }
}

async function createRegistrationCheckout(input: {
  storeId: string
  studentRegistrationId: string
  reference: string
  amount: number
  studentName: string
  phone: string
  email: string
  course: string
  preferredClassTime: string
  branch: string
  notes: string
}): Promise<CheckoutResult> {
  const courseLabel = input.course || 'Student Registration'
  const itemName = `Student Registration - ${courseLabel}`
  const checkoutEmail = input.email || phoneFallbackEmail(input.phone)
  const response = await fetch(getCheckoutCreateUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Sedifex-Contract-Version': '2026-04-13',
    },
    body: JSON.stringify({
      storeId: input.storeId,
      store_id: input.storeId,
      merchantId: input.storeId,
      merchant_id: input.storeId,
      payment_reference: input.reference,
      reference: input.reference,
      client_order_id: input.reference,
      clientOrderId: input.reference,
      amount: input.amount,
      currency: 'GHS',
      sourceChannel: 'student_registration',
      source_channel: 'student_registration',
      sourceLabel: 'Student Registration',
      source_label: 'Student Registration',
      returnUrl: getReturnUrl(input.reference),
      customer: {
        name: input.studentName,
        email: checkoutEmail,
        phone: input.phone || undefined,
      },
      items: [
        {
          type: 'SERVICE',
          item_type: 'service',
          item_id: `student-registration-${slugify(courseLabel)}`,
          qty: 1,
          name: itemName,
          serviceName: itemName,
          itemName,
        },
      ],
      metadata: {
        storeId: input.storeId,
        studentRegistrationId: input.studentRegistrationId,
        pageId: 'student-registration',
        pageType: 'student_registration',
        source: 'sedifex_student_registration',
        registrationData: {
          course: input.course || null,
          preferredClassTime: input.preferredClassTime || null,
          branch: input.branch || null,
          notes: input.notes || null,
        },
        customer: {
          name: input.studentName,
          phone: input.phone || null,
          email: input.email || null,
        },
      },
    }),
  })

  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !raw) {
    throw new Error((raw?.error as string | undefined) || `Checkout create failed (${response.status}).`)
  }

  const checkoutUrl = String(raw.checkoutUrl || raw.authorizationUrl || '')
  if (!checkoutUrl) throw new Error('Checkout created but no payment URL was returned.')

  return {
    checkoutUrl,
    authorizationUrl: typeof raw.authorizationUrl === 'string' ? raw.authorizationUrl : null,
    accessCode: typeof raw.accessCode === 'string' ? raw.accessCode : null,
    reference: typeof raw.reference === 'string' ? raw.reference : input.reference,
    raw,
  }
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <article style={{ ...pageStyles.statCard, borderTop: `4px solid ${accent}` }}>
      <p style={{ ...pageStyles.statValue, color: accent }}>{value}</p>
      <p style={pageStyles.statLabel}>{label}</p>
    </article>
  )
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null)
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
        query(collection(db, 'student_registrations'), where('storeId', '==', storeId), limit(200)),
      )
      if (!active) return
      const rows = snapshot.docs
        .map(item => ({ id: item.id, ...(item.data() as Omit<RegistrationDoc, 'id'>) }))
        .sort((left, right) => {
          const leftTime = toDate(left.createdAt)?.getTime() ?? 0
          const rightTime = toDate(right.createdAt)?.getTime() ?? 0
          return rightTime - leftTime
        })
      setRegistrations(rows)
    } catch (loadError) {
      console.error(loadError)
      if (!active) return
      setError('Unable to load student registrations. Check Firestore rules and try again.')
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
    const online = registrations.filter(item => ['pending', 'checkout_created'].includes(item.payment?.status ?? '')).length
    const manual = registrations.filter(item => item.payment?.status === 'pending_manual_review').length
    return { total, paid, online, manual }
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
    const preferredClassTime = cleanText(manualForm.preferredClassTime, 120)
    const branch = cleanText(manualForm.branch, 120)
    const notes = cleanText(manualForm.notes, 1000)
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

    if (manualForm.paymentMode === 'online' && !hasAmount) {
      setSaveMessage(null)
      setError('Enter the amount to charge before creating an online checkout.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)
      setLastCheckoutUrl(null)

      const reference = cleanText(manualForm.reference, 140) || buildManualReference(storeId)
      const paymentStatus = normalizePaymentStatus(manualForm.paymentMode, manualForm.paymentStatus)
      const now = serverTimestamp()
      const payment = {
        mode: manualForm.paymentMode,
        status: manualForm.paymentMode === 'online' ? 'checkout_pending' : paymentStatus,
        amount: hasAmount ? amount : null,
        currency: 'GHS',
        reference,
        provider: manualForm.paymentMode === 'online' ? 'paystack' : null,
      }
      const payload = {
        storeId,
        pageId: 'student-registration',
        pageType: 'student_registration',
        source: manualForm.paymentMode === 'online' ? 'online_checkout_dashboard' : 'manual_dashboard',
        status: 'new',
        customer: { name: studentName, email: email || null, phone: phone || null },
        data: { course: course || null, preferredClassTime: preferredClassTime || null, branch: branch || null, notes: notes || null },
        payment,
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
        source: manualForm.paymentMode === 'online' ? 'student-registration-online-checkout' : 'student-registration-manual',
        tags: ['Student', course].filter(Boolean),
        studentRegistrationId: docRef.id,
        paymentReference: reference,
        createdAt: now,
        updatedAt: now,
      })

      if (manualForm.paymentMode === 'online') {
        try {
          const checkout = await createRegistrationCheckout({
            storeId,
            studentRegistrationId: docRef.id,
            reference,
            amount,
            studentName,
            phone,
            email,
            course,
            preferredClassTime,
            branch,
            notes,
          })

          await updateDoc(doc(db, 'student_registrations', docRef.id), {
            payment: {
              ...payment,
              status: 'checkout_created',
              reference: checkout.reference,
              checkoutUrl: checkout.checkoutUrl,
              authorizationUrl: checkout.authorizationUrl ?? checkout.checkoutUrl,
              accessCode: checkout.accessCode ?? null,
            },
            checkout: checkout.raw,
            updatedAt: serverTimestamp(),
          })

          setLastCheckoutUrl(checkout.checkoutUrl)
          setSaveMessage('Student registration saved and online checkout link created.')
          window.open(checkout.checkoutUrl, '_blank', 'noopener,noreferrer')
        } catch (checkoutError) {
          const checkoutMessage = checkoutError instanceof Error ? checkoutError.message : 'Unable to create checkout.'
          await updateDoc(doc(db, 'student_registrations', docRef.id), {
            payment: { ...payment, status: 'checkout_failed', error: checkoutMessage },
            updatedAt: serverTimestamp(),
          })
          setError(`Registration was saved, but checkout failed: ${checkoutMessage}`)
        }
      } else {
        setSaveMessage('Student registration added.')
      }

      setManualForm(initialManualForm)
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
                  ? 'checkout_created'
                  : 'not_required',
          }
        : {}),
    }))
  }

  return (
    <div style={pageStyles.page}>
      <section style={pageStyles.hero}>
        <p style={pageStyles.eyebrow}>Admissions workspace</p>
        <h1 style={pageStyles.title}>Student registration</h1>
        <p style={pageStyles.subtitle}>
          Capture student intake data, map it to Sedifex records, and create Paystack-powered checkout links for course payments.
        </p>
      </section>

      <section style={pageStyles.statsGrid} aria-label="Registration summary">
        <StatCard label="Total registrations" value={totals.total} accent="#4f46e5" />
        <StatCard label="Paid or confirmed" value={totals.paid} accent="#059669" />
        <StatCard label="Online checkout" value={totals.online} accent="#d97706" />
        <StatCard label="Manual review" value={totals.manual} accent="#7c3aed" />
      </section>

      <section style={pageStyles.card}>
        <div style={pageStyles.cardHeader}>
          <div>
            <h2 style={pageStyles.cardTitle}>Add student / create checkout</h2>
            <p style={pageStyles.muted}>
              Mapping: student details go to <strong>student_registrations</strong> and <strong>customers</strong>. When payment mode is online, the course becomes a Sedifex service checkout item.
            </p>
          </div>
        </div>

        <form onSubmit={handleManualSubmit}>
          <div style={pageStyles.formGrid}>
            <label style={pageStyles.label}>
              Student name *
              <input style={pageStyles.input} value={manualForm.name} onChange={event => updateManualForm('name', event.target.value)} placeholder="Student full name" />
            </label>
            <label style={pageStyles.label}>
              Phone
              <input style={pageStyles.input} value={manualForm.phone} onChange={event => updateManualForm('phone', event.target.value)} placeholder="+233..." />
            </label>
            <label style={pageStyles.label}>
              Email
              <input style={pageStyles.input} type="email" value={manualForm.email} onChange={event => updateManualForm('email', event.target.value)} placeholder="student@example.com" />
            </label>
            <label style={pageStyles.label}>
              Course / program
              <input style={pageStyles.input} value={manualForm.course} onChange={event => updateManualForm('course', event.target.value)} placeholder="Hair Braiding" />
            </label>
            <label style={pageStyles.label}>
              Preferred class time
              <input style={pageStyles.input} value={manualForm.preferredClassTime} onChange={event => updateManualForm('preferredClassTime', event.target.value)} placeholder="14 July 2026, Morning" />
            </label>
            <label style={pageStyles.label}>
              Branch
              <input style={pageStyles.input} value={manualForm.branch} onChange={event => updateManualForm('branch', event.target.value)} placeholder="Tema" />
            </label>
            <label style={pageStyles.label}>
              Payment mode
              <select style={pageStyles.input} value={manualForm.paymentMode} onChange={event => updateManualForm('paymentMode', event.target.value as ManualForm['paymentMode'])}>
                <option value="none">No payment required</option>
                <option value="manual">Manual payment</option>
                <option value="online">Create online checkout</option>
              </select>
            </label>
            <label style={pageStyles.label}>
              Payment status
              <input style={pageStyles.input} value={manualForm.paymentStatus} onChange={event => updateManualForm('paymentStatus', event.target.value)} />
            </label>
            <label style={pageStyles.label}>
              Amount
              <input style={pageStyles.input} inputMode="decimal" value={manualForm.amount} onChange={event => updateManualForm('amount', event.target.value)} placeholder="0.00" />
            </label>
            <label style={pageStyles.label}>
              Reference
              <input style={pageStyles.input} value={manualForm.reference} onChange={event => updateManualForm('reference', event.target.value)} placeholder="Optional; auto-generated if empty" />
            </label>
          </div>
          <label style={{ ...pageStyles.label, marginTop: 14 }}>
            Notes
            <textarea style={{ ...pageStyles.input, minHeight: 90, resize: 'vertical' }} rows={3} value={manualForm.notes} onChange={event => updateManualForm('notes', event.target.value)} placeholder="Student goals, parent contact, payment note, etc." />
          </label>
          <div style={pageStyles.actions}>
            <button type="submit" style={{ ...pageStyles.primaryButton, opacity: saving ? 0.65 : 1 }} disabled={saving}>
              {saving ? 'Saving…' : manualForm.paymentMode === 'online' ? 'Save + create checkout' : 'Add student'}
            </button>
            <button type="button" style={pageStyles.secondaryButton} onClick={() => setManualForm(initialManualForm)} disabled={saving}>Clear form</button>
            {lastCheckoutUrl ? <a href={lastCheckoutUrl} target="_blank" rel="noreferrer" style={pageStyles.secondaryButton}>Open latest checkout</a> : null}
          </div>
          {saveMessage ? <p style={{ ...pageStyles.alert, background: '#dcfce7', color: '#166534' }}>{saveMessage}</p> : null}
          {error ? <p style={{ ...pageStyles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}
        </form>
      </section>

      <section style={pageStyles.card}>
        <div style={pageStyles.cardHeader}>
          <div>
            <h2 style={pageStyles.cardTitle}>Latest registrations</h2>
            <p style={pageStyles.muted}>Website submissions, manual entries, and online checkout registrations appear here.</p>
          </div>
          <button type="button" style={pageStyles.secondaryButton} onClick={() => void loadRegistrations(true)} disabled={loading}>Refresh</button>
        </div>
        {loading ? <p style={pageStyles.muted}>Loading registrations…</p> : null}
        {!loading && !error && registrations.length === 0 ? (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}>
            <strong style={{ color: '#334155' }}>No student registrations yet.</strong>
            <p style={{ margin: '6px 0 0' }}>Add one manually or create an online checkout registration.</p>
          </div>
        ) : null}
        {registrations.length > 0 ? (
          <div style={pageStyles.tableWrap}>
            <table style={pageStyles.table}>
              <thead>
                <tr>
                  <th style={pageStyles.th}>Student</th>
                  <th style={pageStyles.th}>Course</th>
                  <th style={pageStyles.th}>Class time</th>
                  <th style={pageStyles.th}>Source</th>
                  <th style={pageStyles.th}>Payment</th>
                  <th style={pageStyles.th}>Reference</th>
                  <th style={pageStyles.th}>Checkout</th>
                  <th style={pageStyles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map(item => (
                  <tr key={item.id}>
                    <td style={pageStyles.td}>
                      <strong style={{ color: '#0f172a' }}>{item.customer?.name ?? 'Unnamed student'}</strong><br />
                      <small>{item.customer?.phone ?? item.customer?.email ?? 'No contact'}</small>
                    </td>
                    <td style={pageStyles.td}>{item.data?.course ?? '—'}</td>
                    <td style={pageStyles.td}>{item.data?.preferredClassTime ?? '—'}</td>
                    <td style={pageStyles.td}>{statusLabel(item.source)}</td>
                    <td style={pageStyles.td}>
                      <span style={{ ...statusStyle(item.payment?.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>
                        {statusLabel(item.payment?.status)}
                      </span>
                      <br />
                      <small>{formatAmount(item.payment)}</small>
                    </td>
                    <td style={pageStyles.td}>{item.payment?.reference ?? '—'}</td>
                    <td style={pageStyles.td}>
                      {item.payment?.checkoutUrl ? (
                        <a href={item.payment.checkoutUrl} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', fontWeight: 900 }}>Open checkout</a>
                      ) : '—'}
                    </td>
                    <td style={pageStyles.td}>{formatDate(item.createdAt)}</td>
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
