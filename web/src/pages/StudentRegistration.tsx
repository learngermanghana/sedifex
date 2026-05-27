import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type RegistrationData = Record<string, unknown> & {
  course?: string | null
  program?: string | null
  duration?: string | null
  preferredClassTime?: string | null
  branch?: string | null
  location?: string | null
  notes?: string | null
  studentCode?: string | null
  studentStatus?: string | null
  studentPhotoUrl?: string | null
  guardian?: Record<string, unknown> | null
  guarantor?: Record<string, unknown> | null
  classSlotId?: string | null
  classSchedule?: string | null
  classLocation?: string | null
  noUpcomingClassSelected?: boolean | null
  schedulingStatus?: string | null
}

type RegistrationDoc = {
  id: string
  storeId?: string
  source?: string
  status?: string
  movedToStudents?: boolean
  archivedFromRegistrationInbox?: boolean
  studentCode?: string | null
  studentStatus?: string | null
  studentPhotoUrl?: string | null
  customer?: { name?: string | null; email?: string | null; phone?: string | null }
  data?: RegistrationData
  payment?: { mode?: string; status?: string; amount?: number | null; totalFee?: number | null; amountPaid?: number | null; balance?: number | null; currency?: string; reference?: string }
  createdAt?: Timestamp | string | null
  updatedAt?: Timestamp | string | null
}

type StudentRecord = {
  id: string
  storeId?: string
  name?: string | null
  displayName?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
  studentRegistrationId?: string | null
  studentCode?: string | null
  studentStatus?: string | null
  course?: string | null
  preferredClassTime?: string | null
  branch?: string | null
  guardianName?: string | null
  guardianPhone?: string | null
  guardianEmail?: string | null
  guardianRelationship?: string | null
  payment?: RegistrationDoc['payment']
  createdAt?: Timestamp | string | null
  updatedAt?: Timestamp | string | null
}

type ManualForm = {
  name: string
  phone: string
  email: string
  course: string
  preferredClassTime: string
  branch: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  guardianRelationship: string
  totalFee: string
  amountPaid: string
  paymentStatus: string
  reference: string
  notes: string
}

type RegistrationTab = 'website_applications' | 'manual_student'

const initialManualForm: ManualForm = {
  name: '',
  phone: '',
  email: '',
  course: '',
  preferredClassTime: '',
  branch: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  guardianRelationship: '',
  totalFee: '',
  amountPaid: '',
  paymentStatus: 'not_required',
  reference: '',
  notes: '',
}

const styles = {
  page: { display: 'grid', gap: 18, color: '#0f172a', width: '100%', maxWidth: 'min(100%, 1440px)', margin: '0 auto', padding: '12px clamp(10px, 1.5vw, 18px) 32px', boxSizing: 'border-box' as const, overflowX: 'hidden' as const },
  hero: { borderRadius: 22, padding: '22px clamp(18px, 3vw, 28px)', background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 52%, #7c3aed 100%)', color: '#fff', boxShadow: '0 24px 60px -42px rgba(49, 46, 129, 0.8)' },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.74)' },
  title: { margin: '8px 0 0', fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 900, color: 'rgba(255,255,255,0.84)', fontSize: 15, lineHeight: 1.65 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12, minWidth: 0 },
  statCard: { borderRadius: 18, border: '1px solid #e2e8f0', background: '#ffffff', padding: 15, boxShadow: '0 18px 42px -36px rgba(15, 23, 42, 0.55)' },
  statLabel: { margin: '6px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 },
  statValue: { margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 950, letterSpacing: '-0.05em' },
  card: { borderRadius: 22, border: '1px solid #e2e8f0', background: '#ffffff', padding: 'clamp(15px, 2vw, 22px)', boxShadow: '0 22px 52px -42px rgba(15, 23, 42, 0.5)', width: '100%', minWidth: 0, boxSizing: 'border-box' as const, overflow: 'hidden' as const },
  cardHeader: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 20, letterSpacing: '-0.02em' },
  muted: { color: '#64748b', margin: '5px 0 0', lineHeight: 1.6 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, minWidth: 0 },
  label: { display: 'grid', gap: 7, color: '#334155', fontSize: 13, fontWeight: 800, minWidth: 0 },
  input: { width: '100%', maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 13, padding: '11px 12px', fontSize: 14, background: '#ffffff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const },
  actions: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 13, padding: '11px 17px', background: 'linear-gradient(135deg, #4338ca, #4f46e5)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(67, 56, 202, 0.85)' },
  successButton: { border: 0, borderRadius: 13, padding: '9px 12px', background: '#059669', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  dangerButton: { border: 0, borderRadius: 13, padding: '9px 12px', background: '#dc2626', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 13, padding: '9px 12px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  tabButton: { flex: '0 0 auto', border: '1px solid #cbd5e1', borderRadius: 999, padding: '8px 13px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  activeTabButton: { background: '#312e81', borderColor: '#312e81', color: '#fff' },
  disabledButton: { opacity: 0.48, cursor: 'not-allowed' },
  tableWrap: { width: '100%', maxWidth: '100%', overflowX: 'auto' as const, borderRadius: 16, border: '1px solid #e2e8f0' },
  table: { width: '100%', minWidth: 1140, borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '12px 12px', fontSize: 11, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' as const },
  td: { padding: '12px 12px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top' as const, color: '#334155', fontSize: 13, overflowWrap: 'anywhere' as const },
  alert: { borderRadius: 16, padding: '12px 14px', fontWeight: 800 },
}

const textFrom = (...values: unknown[]) => values.find((value) => typeof value === 'string' && value.trim()) as string | undefined
function recordFrom(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function toDate(value?: Timestamp | string | null) { if (!value) return null; if (typeof value === 'string') { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed } const parsed = value?.toDate?.(); return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null }
function formatDate(value?: Timestamp | string | null) { const date = toDate(value); return date ? date.toLocaleString() : '—' }
function cleanText(value: string, max = 200) { return value.trim().slice(0, max) }
function normalizeEmail(value: string) { return cleanText(value, 160).toLowerCase() }
function parseMoney(value: string) { const amount = Number(value); return Number.isFinite(amount) && amount >= 0 ? amount : null }
function safeDocId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) }
function buildStudentCode(storeId: string, id: string) { return `${storeId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'STU'}-${new Date().getFullYear()}-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}` }
function buildManualReference(storeId: string) { return `REG-${storeId.slice(0, 6).toUpperCase()}-${Date.now()}` }
function statusLabel(value?: string | null) { const text = value || 'not_required'; return text.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function statusStyle(value?: string | null) { const normalized = (value || '').toLowerCase(); if (['paid', 'success', 'captured', 'confirmed', 'active', 'approved'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }; if (['part_paid', 'partial', 'pending_manual_review'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }; if (['unpaid', 'rejected', 'cancelled', 'canceled'].includes(normalized)) return { background: '#fee2e2', color: '#991b1b' }; if (['pending', 'checkout_created', 'new'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }; return { background: '#e0e7ff', color: '#3730a3' } }
function studentNameOf(item: RegistrationDoc) { const apprentice = recordFrom(item.data?.apprentice); return textFrom(item.customer?.name, item.data?.studentName, item.data?.fullName, item.data?.name, item.data?.customerName, apprentice.full_name) || 'Unnamed student' }
function studentPhoneOf(item: RegistrationDoc) { const apprentice = recordFrom(item.data?.apprentice); return textFrom(item.customer?.phone, item.data?.phone, item.data?.studentPhone, item.data?.customerPhone, apprentice.contact) || '' }
function studentEmailOf(item: RegistrationDoc) { const apprentice = recordFrom(item.data?.apprentice); return textFrom(item.customer?.email, item.data?.email, item.data?.studentEmail, item.data?.customerEmail, apprentice.email) || '' }
function studentCodeOf(item: RegistrationDoc) { return item.studentCode || item.data?.studentCode || buildStudentCode(item.storeId || 'STU', item.id) }
function studentStatusOf(item: RegistrationDoc) { return item.studentStatus || item.data?.studentStatus || item.status || 'pending' }
function paymentCurrency(item: RegistrationDoc) { return item.payment?.currency || 'GHS' }
function paymentTotal(item: RegistrationDoc) { return typeof item.payment?.totalFee === 'number' ? item.payment.totalFee : (typeof item.payment?.amount === 'number' ? item.payment.amount : null) }
function paymentPaid(item: RegistrationDoc) { if (typeof item.payment?.amountPaid === 'number') return item.payment.amountPaid; if (['paid', 'success', 'captured', 'confirmed'].includes((item.payment?.status || '').toLowerCase())) return paymentTotal(item); return null }
function paymentBalance(item: RegistrationDoc) { if (typeof item.payment?.balance === 'number') return item.payment.balance; const total = paymentTotal(item); const paid = paymentPaid(item); return typeof total === 'number' ? Math.max(total - (paid ?? 0), 0) : null }
function money(value?: number | null, currency = 'GHS') { return typeof value === 'number' && Number.isFinite(value) ? `${currency} ${value.toFixed(2)}` : '—' }
function guardianOf(item: RegistrationDoc) { const guardian = recordFrom(item.data?.guardian); const guarantor = recordFrom(item.data?.guarantor); return { name: textFrom(item.data?.guardianName, guardian.name, guarantor.guardianName, guarantor.guarantor_full_name) || '', phone: textFrom(item.data?.guardianPhone, guardian.phone, guarantor.guardianPhone, guarantor.guarantor_contact) || '', email: textFrom(item.data?.guardianEmail, guardian.email) || '', relationship: textFrom(item.data?.guardianRelationship, guardian.relationship, guarantor.guardianRelationship, guarantor.guarantor_relationship) || '' } }
function isApproved(item: RegistrationDoc) { return item.movedToStudents === true || item.archivedFromRegistrationInbox === true || ['approved', 'active', 'confirmed'].includes((item.status || '').toLowerCase()) || ['active', 'confirmed', 'approved'].includes((item.studentStatus || item.data?.studentStatus || '').toLowerCase()) }
function incomingSourceLabel(item: RegistrationDoc) { const source = item.source || 'website'; if (source === 'manual_dashboard') return 'Manual'; if (source.includes('website') || source.includes('registration_page') || source.includes('makeupschool')) return 'Website'; if (source.includes('integration')) return 'Website'; return 'Website' }
function paymentPayload(form: ManualForm, storeId: string) { const totalFee = parseMoney(form.totalFee); const amountPaid = parseMoney(form.amountPaid); const balance = totalFee !== null ? Math.max(totalFee - (amountPaid ?? 0), 0) : null; return { mode: 'manual', status: form.paymentStatus || (amountPaid ? 'part_paid' : 'not_required'), amount: amountPaid ?? totalFee, totalFee, amountPaid, balance, currency: 'GHS', reference: cleanText(form.reference, 140) || buildManualReference(storeId) } }
function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) { return <article style={{ ...styles.statCard, borderTop: `4px solid ${accent}` }}><p style={{ ...styles.statValue, color: accent }}>{value}</p><p style={styles.statLabel}>{label}</p></article> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={styles.label}><span>{label}</span>{children}</label> }

function studentDocFromRegistration(item: RegistrationDoc, storeId: string) {
  const guardian = guardianOf(item)
  const studentCode = studentCodeOf({ ...item, storeId })
  const currency = paymentCurrency(item)
  return {
    storeId,
    name: studentNameOf(item),
    displayName: studentNameOf(item),
    email: studentEmailOf(item) || null,
    phone: studentPhoneOf(item) || null,
    source: 'student_registration_approved',
    studentRegistrationId: item.id,
    studentCode,
    studentStatus: 'active',
    studentPhotoUrl: item.studentPhotoUrl || item.data?.studentPhotoUrl || null,
    course: textFrom(item.data?.course, item.data?.program) || null,
    preferredClassTime: textFrom(item.data?.preferredClassTime, item.data?.classSchedule) || null,
    branch: textFrom(item.data?.branch, item.data?.location, item.data?.classLocation) || null,
    guardianName: guardian.name || null,
    guardianPhone: guardian.phone || null,
    guardianEmail: guardian.email || null,
    guardianRelationship: guardian.relationship || null,
    payment: { ...(item.payment || {}), currency },
    updatedAt: serverTimestamp(),
  }
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [activeTab, setActiveTab] = useState<RegistrationTab>('website_applications')
  const [manualForm, setManualForm] = useState<ManualForm>(initialManualForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload(active = true) {
    if (!storeId) {
      setRegistrations([])
      setStudents([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const [registrationSnapshot, studentSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'studentRegistrations'), where('storeId', '==', storeId), limit(500))),
        getDocs(query(collection(db, 'students'), where('storeId', '==', storeId), limit(500))),
      ])
      if (!active) return
      setRegistrations(registrationSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...(snapshot.data() as Omit<RegistrationDoc, 'id'>) })).sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)))
      setStudents(studentSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...(snapshot.data() as Omit<StudentRecord, 'id'>) })).sort((a, b) => (toDate(b.updatedAt || b.createdAt)?.getTime() ?? 0) - (toDate(a.updatedAt || a.createdAt)?.getTime() ?? 0)))
    } catch (loadError) {
      console.error('[student-registration] load failed', loadError)
      if (active) setError('Unable to load student registration data. Check Firestore rules and try again.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void reload(active)
    return () => { active = false }
  }, [storeId])

  const incomingRegistrations = useMemo(() => registrations.filter(item => !isApproved(item) && item.source !== 'manual_dashboard'), [registrations])
  const approvedFromRegistrations = useMemo(() => registrations.filter(isApproved), [registrations])

  const filteredIncoming = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return incomingRegistrations
    return incomingRegistrations.filter(item => [studentNameOf(item), studentPhoneOf(item), studentEmailOf(item), item.data?.course, item.data?.program, item.payment?.status, item.payment?.reference, guardianOf(item).name, guardianOf(item).phone].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [incomingRegistrations, search])

  const stats = useMemo(() => ({ incoming: incomingRegistrations.length, approved: students.length, pendingPayment: incomingRegistrations.filter(item => ['pending', 'checkout_created', 'unpaid'].includes((item.payment?.status || '').toLowerCase())).length, needsScheduling: incomingRegistrations.filter(item => Boolean(item.data?.noUpcomingClassSelected) || item.data?.schedulingStatus === 'needs_admissions_scheduling').length }), [incomingRegistrations, students.length])

  async function approveRegistration(item: RegistrationDoc) {
    if (!storeId || saving) return
    const name = studentNameOf(item)
    if (!window.confirm(`Approve ${name} and move to Students? This will remove the application from the website applications inbox.`)) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const studentCode = studentCodeOf({ ...item, storeId })
      const studentId = safeDocId(`${storeId}_${studentCode || item.id}`)
      await setDoc(doc(db, 'students', studentId), {
        ...studentDocFromRegistration(item, storeId),
        createdAt: serverTimestamp(),
      }, { merge: true })
      await updateDoc(doc(db, 'studentRegistrations', item.id), {
        status: 'approved',
        studentStatus: 'active',
        studentCode,
        movedToStudents: true,
        archivedFromRegistrationInbox: true,
        approvedAt: serverTimestamp(),
        approvedStudentId: studentId,
        updatedAt: serverTimestamp(),
      })
      setMessage(`${name} has been approved and moved to Students.`)
      await reload(true)
    } catch (approveError) {
      console.error('[student-registration] approve failed', approveError)
      setError(approveError instanceof Error ? approveError.message : 'Unable to approve student.')
    } finally {
      setSaving(false)
    }
  }

  async function rejectRegistration(item: RegistrationDoc) {
    if (!storeId || saving) return
    if (!window.confirm(`Remove ${studentNameOf(item)} from the incoming website applications inbox?`)) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await updateDoc(doc(db, 'studentRegistrations', item.id), { status: 'rejected', studentStatus: 'rejected', archivedFromRegistrationInbox: true, rejectedAt: serverTimestamp(), updatedAt: serverTimestamp() })
      setMessage('Application removed from incoming website applications.')
      await reload(true)
    } catch (rejectError) {
      console.error('[student-registration] reject failed', rejectError)
      setError('Unable to update application.')
    } finally {
      setSaving(false)
    }
  }

  async function addManualStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId || saving) return
    if (!manualForm.name.trim() || !manualForm.phone.trim() || !manualForm.course.trim()) {
      setError('Enter student name, phone, and course before saving.')
      return
    }
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const registrationRef = await addDoc(collection(db, 'studentRegistrations'), {
        storeId,
        source: 'manual_dashboard',
        status: 'approved',
        studentStatus: 'active',
        movedToStudents: true,
        archivedFromRegistrationInbox: true,
        customer: { name: cleanText(manualForm.name, 140), phone: cleanText(manualForm.phone, 60), email: normalizeEmail(manualForm.email) || null },
        data: {
          course: cleanText(manualForm.course, 160),
          preferredClassTime: cleanText(manualForm.preferredClassTime, 140) || null,
          branch: cleanText(manualForm.branch, 120) || null,
          notes: cleanText(manualForm.notes, 800) || null,
          guardian: {
            name: cleanText(manualForm.guardianName, 140),
            phone: cleanText(manualForm.guardianPhone, 80),
            email: normalizeEmail(manualForm.guardianEmail),
            relationship: cleanText(manualForm.guardianRelationship, 100),
          },
        },
        payment: paymentPayload(manualForm, storeId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const registrationItem: RegistrationDoc = {
        id: registrationRef.id,
        storeId,
        source: 'manual_dashboard',
        status: 'approved',
        studentStatus: 'active',
        customer: { name: manualForm.name, phone: manualForm.phone, email: manualForm.email },
        data: { course: manualForm.course, preferredClassTime: manualForm.preferredClassTime, branch: manualForm.branch, notes: manualForm.notes, guardian: { name: manualForm.guardianName, phone: manualForm.guardianPhone, email: manualForm.guardianEmail, relationship: manualForm.guardianRelationship } },
        payment: paymentPayload(manualForm, storeId),
      }
      const studentCode = studentCodeOf(registrationItem)
      await setDoc(doc(db, 'students', safeDocId(`${storeId}_${studentCode}`)), {
        ...studentDocFromRegistration({ ...registrationItem, studentCode }, storeId),
        createdAt: serverTimestamp(),
      }, { merge: true })
      await updateDoc(registrationRef, { studentCode, approvedStudentId: safeDocId(`${storeId}_${studentCode}`), updatedAt: serverTimestamp() })
      setManualForm(initialManualForm)
      setMessage('Manual student saved directly to Students.')
      await reload(true)
    } catch (manualError) {
      console.error('[student-registration] manual save failed', manualError)
      setError(manualError instanceof Error ? manualError.message : 'Unable to save student.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>Admissions inbox</p>
        <h1 style={styles.title}>Student Applications</h1>
        <p style={styles.subtitle}>Website applications land here for review. After approval, Sedifex creates the approved student profile and removes the application from this inbox. Use the Students page for the clean student list; Customers is for general buyers/contacts.</p>
      </section>

      <section style={styles.statsGrid} aria-label="Student registration summary">
        <StatCard label="Website applications" value={stats.incoming} accent="#4f46e5" />
        <StatCard label="Approved students" value={stats.approved} accent="#059669" />
        <StatCard label="Payment follow-up" value={stats.pendingPayment} accent="#d97706" />
        <StatCard label="Need scheduling" value={stats.needsScheduling} accent="#7c3aed" />
      </section>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>How these pages work</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}><strong>Student Applications</strong><p style={styles.muted}>Incoming website forms and manual admissions review.</p></div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}><strong>Students</strong><p style={styles.muted}>Approved/enrolled students only.</p></div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}><strong>Customers</strong><p style={styles.muted}>All contacts: shoppers, students, service clients, donors, and leads.</p></div>
        </div>
      </section>

      <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...styles.tabButton, ...(activeTab === 'website_applications' ? styles.activeTabButton : {}) }} onClick={() => setActiveTab('website_applications')}>Website applications ({incomingRegistrations.length})</button>
        <button type="button" style={{ ...styles.tabButton, ...(activeTab === 'manual_student' ? styles.activeTabButton : {}) }} onClick={() => setActiveTab('manual_student')}>Add approved student</button>
      </section>

      {message ? <p style={{ ...styles.alert, background: '#ecfdf5', color: '#047857' }}>{message}</p> : null}
      {error ? <p style={{ ...styles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}

      {activeTab === 'website_applications' ? (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Incoming through website</h2>
              <p style={styles.muted}>This replaces technical wording like “integration”. New website registrations stay here until admissions approves or rejects them.</p>
            </div>
            <button type="button" style={styles.secondaryButton} onClick={() => void reload(true)} disabled={loading}>Refresh</button>
          </div>
          <div style={{ marginBottom: 14 }}><input style={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, course, guardian, reference…" /></div>
          {loading ? <p style={styles.muted}>Loading applications…</p> : null}
          {!loading && filteredIncoming.length === 0 ? <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}><strong style={{ color: '#334155' }}>No new website applications.</strong><p style={{ margin: '8px 0 0' }}>Approved students have moved to the Students page, keeping this inbox clean.</p></div> : null}
          {filteredIncoming.length > 0 ? <div style={styles.tableWrap}><table style={styles.table}><thead><tr><th style={styles.th}>Student</th><th style={styles.th}>Course / class</th><th style={styles.th}>Guardian</th><th style={styles.th}>Payment</th><th style={styles.th}>Source</th><th style={styles.th}>Date</th><th style={styles.th}>Actions</th></tr></thead><tbody>{filteredIncoming.map(item => { const guardian = guardianOf(item); const needsScheduling = Boolean(item.data?.noUpcomingClassSelected) || item.data?.schedulingStatus === 'needs_admissions_scheduling'; return <tr key={item.id}><td style={styles.td}><strong style={{ color: '#0f172a' }}>{studentNameOf(item)}</strong><br /><small>{studentPhoneOf(item) || studentEmailOf(item) || 'No contact'}</small></td><td style={styles.td}><strong>{textFrom(item.data?.course, item.data?.program) || '—'}</strong><br /><small>{needsScheduling ? 'Needs admissions scheduling' : textFrom(item.data?.preferredClassTime, item.data?.classSchedule) || 'No class selected'}</small></td><td style={styles.td}>{guardian.name ? <><strong>{guardian.name}</strong><br /><small>{guardian.relationship || 'Guardian'} • {guardian.phone || guardian.email || 'No contact'}</small></> : '—'}</td><td style={styles.td}><span style={{ ...statusStyle(item.payment?.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(item.payment?.status)}</span><br /><small>{money(paymentTotal(item), paymentCurrency(item))} • Bal: {money(paymentBalance(item), paymentCurrency(item))}</small></td><td style={styles.td}>{incomingSourceLabel(item)}</td><td style={styles.td}>{formatDate(item.createdAt)}</td><td style={styles.td}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}><button type="button" style={{ ...styles.successButton, ...(saving ? styles.disabledButton : {}) }} disabled={saving} onClick={() => void approveRegistration(item)}>Approve → Students</button><button type="button" style={{ ...styles.dangerButton, ...(saving ? styles.disabledButton : {}) }} disabled={saving} onClick={() => void rejectRegistration(item)}>Reject</button></div></td></tr> })}</tbody></table></div> : null}
        </section>
      ) : null}

      {activeTab === 'manual_student' ? (
        <section style={styles.card}>
          <div style={styles.cardHeader}><div><h2 style={styles.cardTitle}>Add approved student</h2><p style={styles.muted}>Use this for walk-in students who are already approved. They will be saved directly to Students.</p></div></div>
          <form onSubmit={addManualStudent}>
            <div style={styles.formGrid}>
              <Field label="Student name"><input style={styles.input} value={manualForm.name} onChange={event => setManualForm({ ...manualForm, name: event.target.value })} /></Field>
              <Field label="Phone"><input style={styles.input} value={manualForm.phone} onChange={event => setManualForm({ ...manualForm, phone: event.target.value })} /></Field>
              <Field label="Email"><input style={styles.input} value={manualForm.email} onChange={event => setManualForm({ ...manualForm, email: event.target.value })} /></Field>
              <Field label="Course"><input style={styles.input} value={manualForm.course} onChange={event => setManualForm({ ...manualForm, course: event.target.value })} /></Field>
              <Field label="Preferred class / schedule"><input style={styles.input} value={manualForm.preferredClassTime} onChange={event => setManualForm({ ...manualForm, preferredClassTime: event.target.value })} /></Field>
              <Field label="Branch / location"><input style={styles.input} value={manualForm.branch} onChange={event => setManualForm({ ...manualForm, branch: event.target.value })} /></Field>
              <Field label="Guardian name"><input style={styles.input} value={manualForm.guardianName} onChange={event => setManualForm({ ...manualForm, guardianName: event.target.value })} /></Field>
              <Field label="Guardian phone"><input style={styles.input} value={manualForm.guardianPhone} onChange={event => setManualForm({ ...manualForm, guardianPhone: event.target.value })} /></Field>
              <Field label="Guardian email"><input style={styles.input} value={manualForm.guardianEmail} onChange={event => setManualForm({ ...manualForm, guardianEmail: event.target.value })} /></Field>
              <Field label="Relationship"><input style={styles.input} value={manualForm.guardianRelationship} onChange={event => setManualForm({ ...manualForm, guardianRelationship: event.target.value })} /></Field>
              <Field label="Total fee"><input style={styles.input} type="number" min="0" step="0.01" value={manualForm.totalFee} onChange={event => setManualForm({ ...manualForm, totalFee: event.target.value })} /></Field>
              <Field label="Amount paid"><input style={styles.input} type="number" min="0" step="0.01" value={manualForm.amountPaid} onChange={event => setManualForm({ ...manualForm, amountPaid: event.target.value })} /></Field>
              <Field label="Payment status"><select style={styles.input} value={manualForm.paymentStatus} onChange={event => setManualForm({ ...manualForm, paymentStatus: event.target.value })}><option value="not_required">Not required</option><option value="unpaid">Unpaid</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="pending_manual_review">Pending review</option></select></Field>
              <Field label="Payment reference"><input style={styles.input} value={manualForm.reference} onChange={event => setManualForm({ ...manualForm, reference: event.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 12 }}><Field label="Notes"><textarea style={{ ...styles.input, minHeight: 90 }} value={manualForm.notes} onChange={event => setManualForm({ ...manualForm, notes: event.target.value })} /></Field></div>
            <div style={styles.actions}><button type="submit" style={{ ...styles.primaryButton, ...(saving ? styles.disabledButton : {}) }} disabled={saving}>{saving ? 'Saving…' : 'Save to Students'}</button><button type="button" style={styles.secondaryButton} onClick={() => setManualForm(initialManualForm)} disabled={saving}>Clear</button></div>
          </form>
        </section>
      ) : null}
    </div>
  )
}
