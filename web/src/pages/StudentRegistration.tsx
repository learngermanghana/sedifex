import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc as firestoreDoc, getDocs, limit, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type RegistrationDoc = {
  id: string
  storeId?: string
  source?: string
  status?: string
  studentCode?: string | null
  studentStatus?: string | null
  studentPhotoUrl?: string | null
  idCardIssued?: boolean
  idCardIssuedAt?: Timestamp | string | null
  idCardExpiresAt?: string | null
  customer?: { name?: string; email?: string | null; phone?: string | null }
  data?: { course?: string | null; preferredClassTime?: string | null; branch?: string | null; notes?: string | null; studentCode?: string | null; studentStatus?: string | null; studentPhotoUrl?: string | null }
  payment?: { mode?: string; status?: string; amount?: number | null; currency?: string; reference?: string }
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
  studentPhotoUrl: string
  studentStatus: string
  idCardExpiresAt: string
}

const initialManualForm: ManualForm = {
  name: '', phone: '', email: '', course: '', preferredClassTime: '', branch: '', notes: '', paymentMode: 'none', paymentStatus: 'not_required', amount: '', reference: '', studentPhotoUrl: '', studentStatus: 'pending', idCardExpiresAt: '',
}

const pageStyles = {
  page: { display: 'grid', gap: 18, color: '#0f172a', width: '100%', maxWidth: 'min(100%, 1440px)', minWidth: 0, margin: '0 auto', padding: '12px clamp(10px, 1.5vw, 18px) 32px', boxSizing: 'border-box' as const, overflowX: 'hidden' as const },
  hero: { borderRadius: 22, padding: '22px clamp(18px, 3vw, 28px)', background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 52%, #7c3aed 100%)', color: '#fff', boxShadow: '0 24px 60px -42px rgba(49, 46, 129, 0.8)', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' as const },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.74)' },
  title: { margin: '8px 0 0', fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 760, color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 1.65 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, minWidth: 0 },
  statCard: { borderRadius: 18, border: '1px solid #e2e8f0', background: '#ffffff', padding: 15, boxShadow: '0 18px 42px -36px rgba(15, 23, 42, 0.55)', minWidth: 0, boxSizing: 'border-box' as const },
  statLabel: { margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 12 },
  statValue: { margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.05em' },
  card: { borderRadius: 22, border: '1px solid #e2e8f0', background: '#ffffff', padding: 'clamp(15px, 2vw, 22px)', boxShadow: '0 22px 52px -42px rgba(15, 23, 42, 0.5)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' as const, overflow: 'hidden' as const },
  cardHeader: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 20, letterSpacing: '-0.02em' },
  muted: { color: '#64748b', margin: '5px 0 0', lineHeight: 1.6 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12, minWidth: 0 },
  label: { display: 'grid', gap: 7, color: '#334155', fontSize: 13, fontWeight: 800, minWidth: 0 },
  input: { width: '100%', maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 13, padding: '11px 12px', fontSize: 14, background: '#ffffff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const },
  actions: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 13, padding: '11px 17px', background: 'linear-gradient(135deg, #4338ca, #4f46e5)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(67, 56, 202, 0.85)' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 13, padding: '10px 15px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  tableWrap: { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' as const, borderRadius: 16, border: '1px solid #e2e8f0', boxSizing: 'border-box' as const },
  table: { width: '100%', minWidth: 860, borderCollapse: 'collapse' as const, tableLayout: 'auto' as const },
  th: { textAlign: 'left' as const, padding: '12px 12px', fontSize: 11, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' as const },
  td: { padding: '12px 12px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top' as const, color: '#334155', fontSize: 13, overflowWrap: 'anywhere' as const },
  alert: { borderRadius: 16, padding: '12px 14px', fontWeight: 800 },
}

function toDate(value?: Timestamp | string | null) { if (!value) return null; if (typeof value === 'string') { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed } const date = value?.toDate?.(); return date && !Number.isNaN(date.getTime()) ? date : null }
function formatDate(value?: Timestamp | string | null) { const date = toDate(value); return date ? date.toLocaleString() : '—' }
function formatAmount(payment?: RegistrationDoc['payment']) { if (!payment || typeof payment.amount !== 'number') return '—'; return `${payment.currency ?? 'GHS'} ${payment.amount.toFixed(2)}` }
function cleanText(value: string, max = 200) { return value.trim().slice(0, max) }
function normalizeEmail(value: string) { return cleanText(value, 160).toLowerCase() }
function normalizePaymentStatus(mode: ManualForm['paymentMode'], status: string) { const normalized = cleanText(status, 80); if (normalized) return normalized; if (mode === 'manual') return 'pending_manual_review'; if (mode === 'online') return 'pending'; return 'not_required' }
function buildManualReference(storeId: string) { return `REG-${storeId.slice(0, 6).toUpperCase()}-${Date.now()}` }
function buildStudentCode(storeId: string, id: string) { return `${storeId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'STU'}-${new Date().getFullYear()}-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}` }
function statusLabel(value?: string | null) { const text = value || 'not_required'; return text.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function statusStyle(value?: string | null) { const normalized = (value || '').toLowerCase(); if (['paid', 'success', 'captured', 'confirmed', 'active'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }; if (['pending', 'checkout_created', 'pending_manual_review'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }; return { background: '#e0e7ff', color: '#3730a3' } }
function studentCodeOf(item: RegistrationDoc) { return item.studentCode || item.data?.studentCode || buildStudentCode(item.storeId || 'STU', item.id) }
function studentPhotoOf(item: RegistrationDoc) { return item.studentPhotoUrl || item.data?.studentPhotoUrl || '' }
function studentStatusOf(item: RegistrationDoc) { return item.studentStatus || item.data?.studentStatus || 'pending' }

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) { return <article style={{ ...pageStyles.statCard, borderTop: `4px solid ${accent}` }}><p style={{ ...pageStyles.statValue, color: accent }}>{value}</p><p style={pageStyles.statLabel}>{label}</p></article> }

function PrintableIdCard({ student, onClose }: { student: RegistrationDoc; onClose: () => void }) {
  const code = studentCodeOf(student)
  const photo = studentPhotoOf(student)
  const status = studentStatusOf(student)
  return <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.72)', display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box' }}>
    <div style={{ background: '#fff', borderRadius: 24, padding: 22, width: 'min(680px, 100%)', boxSizing: 'border-box' }}>
      <div id="student-id-card-print-area" style={{ width: 420, maxWidth: '100%', margin: '0 auto', border: '1px solid #cbd5e1', borderRadius: 22, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: 'linear-gradient(135deg, #312e81, #7c3aed)', color: '#fff', padding: 18 }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 800 }}>Student ID Card</p>
          <h2 style={{ margin: '5px 0 0', fontSize: 21 }}>Sedifex School ID</h2>
        </div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '96px 1fr', gap: 16 }}>
          <div style={{ width: 96, height: 110, borderRadius: 16, background: '#eef2ff', display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#3730a3', fontWeight: 900 }}>{photo ? <img src={photo} alt={student.customer?.name || 'Student'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PHOTO'}</div>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{student.customer?.name || 'Unnamed student'}</h3>
            <p style={{ margin: '6px 0 0', color: '#475569', fontWeight: 800 }}>{code}</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#334155' }}>Course: <strong>{student.data?.course || '—'}</strong></p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#334155' }}>Class: <strong>{student.data?.preferredClassTime || '—'}</strong></p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#334155' }}>Branch: <strong>{student.data?.branch || '—'}</strong></p>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#475569' }}>
          <span>Status: <strong>{statusLabel(status)}</strong></span><span>Payment: <strong>{statusLabel(student.payment?.status)}</strong></span>
        </div>
      </div>
      <div style={pageStyles.actions}>
        <button type="button" style={pageStyles.primaryButton} onClick={() => window.print()}>Print card</button>
        <button type="button" style={pageStyles.secondaryButton} onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [selectedCardStudent, setSelectedCardStudent] = useState<RegistrationDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState<ManualForm>(initialManualForm)

  async function loadRegistrations(active = true) {
    if (!storeId) { setRegistrations([]); setLoading(false); return }
    try {
      setLoading(true); setError(null)
      const snapshot = await getDocs(query(collection(db, 'student_registrations'), where('storeId', '==', storeId), limit(200)))
      if (!active) return
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<RegistrationDoc, 'id'>) })).sort((left, right) => (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0))
      setRegistrations(rows)
    } catch (loadError) { console.error(loadError); if (active) setError('Unable to load student registrations. Check Firestore rules and try again.') } finally { if (active) setLoading(false) }
  }

  useEffect(() => { let active = true; void loadRegistrations(active); return () => { active = false } }, [storeId])
  const totals = useMemo(() => { const total = registrations.length; const paid = registrations.filter(item => ['paid', 'success', 'captured', 'confirmed'].includes(item.payment?.status ?? '')).length; const manual = registrations.filter(item => item.payment?.status === 'pending_manual_review').length; const pending = registrations.filter(item => ['pending', 'checkout_created'].includes(item.payment?.status ?? '')).length; return { total, paid, manual, pending } }, [registrations])

  async function ensureStudentCode(item: RegistrationDoc) {
    if (!storeId) return studentCodeOf(item)
    const code = studentCodeOf(item)
    await setDoc(firestoreDoc(db, 'student_registrations', item.id), { studentCode: code, data: { ...(item.data || {}), studentCode: code }, updatedAt: serverTimestamp() }, { merge: true })
    return code
  }

  async function handlePrintCard(item: RegistrationDoc) {
    await ensureStudentCode(item)
    setSelectedCardStudent({ ...item, studentCode: studentCodeOf(item) })
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId) { setError('Select a workspace before adding a student.'); return }
    const studentName = cleanText(manualForm.name, 140), phone = cleanText(manualForm.phone, 60), email = normalizeEmail(manualForm.email), course = cleanText(manualForm.course, 160), amount = Number(manualForm.amount), hasAmount = Number.isFinite(amount) && amount > 0
    if (!studentName) { setSaveMessage(null); setError('Student name is required.'); return }
    if (!phone && !email) { setSaveMessage(null); setError('Enter at least one contact: phone or email.'); return }
    try {
      setSaving(true); setError(null); setSaveMessage(null)
      const reference = cleanText(manualForm.reference, 140) || buildManualReference(storeId)
      const paymentStatus = normalizePaymentStatus(manualForm.paymentMode, manualForm.paymentStatus)
      const now = serverTimestamp(); const docRef = firestoreDoc(collection(db, 'student_registrations')); const studentCode = buildStudentCode(storeId, docRef.id)
      const payload = { storeId, pageId: 'student-registration', pageType: 'student_registration', source: 'manual_dashboard', status: 'new', studentCode, studentStatus: cleanText(manualForm.studentStatus, 80) || 'pending', studentPhotoUrl: cleanText(manualForm.studentPhotoUrl, 500) || null, idCardIssued: false, idCardIssuedAt: null, idCardExpiresAt: cleanText(manualForm.idCardExpiresAt, 80) || null, customer: { name: studentName, email: email || null, phone: phone || null }, data: { course: course || null, preferredClassTime: cleanText(manualForm.preferredClassTime, 120) || null, branch: cleanText(manualForm.branch, 120) || null, notes: cleanText(manualForm.notes, 1000) || null, studentCode, studentStatus: cleanText(manualForm.studentStatus, 80) || 'pending', studentPhotoUrl: cleanText(manualForm.studentPhotoUrl, 500) || null }, payment: { mode: manualForm.paymentMode, status: paymentStatus, amount: hasAmount ? amount : null, currency: 'GHS', reference }, createdAt: now, updatedAt: now }
      await setDoc(docRef, payload)
      await addDoc(collection(db, 'customers'), { storeId, name: studentName, displayName: studentName, email: email || null, phone: phone || null, source: 'student-registration-manual', tags: ['Student', course].filter(Boolean), studentRegistrationId: docRef.id, studentCode, studentStatus: payload.studentStatus, studentPhotoUrl: payload.studentPhotoUrl, createdAt: now, updatedAt: now })
      setManualForm(initialManualForm); setSaveMessage(`Student registration added. Student ID: ${studentCode}`); await loadRegistrations(true)
    } catch (saveError) { console.error(saveError); setError('Unable to save student registration. Check Firestore rules or try again.') } finally { setSaving(false) }
  }

  function updateManualForm<K extends keyof ManualForm>(key: K, value: ManualForm[K]) { setManualForm(current => ({ ...current, [key]: value, ...(key === 'paymentMode' ? { paymentStatus: value === 'manual' ? 'pending_manual_review' : value === 'online' ? 'pending' : 'not_required' } : {}) })) }

  return <div style={pageStyles.page}>{selectedCardStudent ? <PrintableIdCard student={selectedCardStudent} onClose={() => setSelectedCardStudent(null)} /> : null}
    <section style={pageStyles.hero}><p style={pageStyles.eyebrow}>Admissions workspace</p><h1 style={pageStyles.title}>Student registration</h1><p style={pageStyles.subtitle}>Keep registrations in one admissions list and print student ID cards with auto-filled codes, course, class, payment status, and student photo.</p></section>
    <section style={pageStyles.statsGrid} aria-label="Registration summary"><StatCard label="Total registrations" value={totals.total} accent="#4f46e5" /><StatCard label="Paid or confirmed" value={totals.paid} accent="#059669" /><StatCard label="Online pending" value={totals.pending} accent="#d97706" /><StatCard label="Manual review" value={totals.manual} accent="#7c3aed" /></section>
    <section style={pageStyles.card}><div style={pageStyles.cardHeader}><div><h2 style={pageStyles.cardTitle}>Add student manually</h2><p style={pageStyles.muted}>Student ID is generated automatically. Add a photo URL now or later before printing.</p></div></div><form onSubmit={handleManualSubmit}><div style={pageStyles.formGrid}>
      <label style={pageStyles.label}>Student name *<input style={pageStyles.input} value={manualForm.name} onChange={event => updateManualForm('name', event.target.value)} placeholder="Student full name" /></label>
      <label style={pageStyles.label}>Phone<input style={pageStyles.input} value={manualForm.phone} onChange={event => updateManualForm('phone', event.target.value)} placeholder="+233..." /></label>
      <label style={pageStyles.label}>Email<input style={pageStyles.input} type="email" value={manualForm.email} onChange={event => updateManualForm('email', event.target.value)} placeholder="student@example.com" /></label>
      <label style={pageStyles.label}>Course / program<input style={pageStyles.input} value={manualForm.course} onChange={event => updateManualForm('course', event.target.value)} placeholder="Hair Braiding" /></label>
      <label style={pageStyles.label}>Preferred class time<input style={pageStyles.input} value={manualForm.preferredClassTime} onChange={event => updateManualForm('preferredClassTime', event.target.value)} placeholder="14 July 2026, Morning" /></label>
      <label style={pageStyles.label}>Branch<input style={pageStyles.input} value={manualForm.branch} onChange={event => updateManualForm('branch', event.target.value)} placeholder="Tema" /></label>
      <label style={pageStyles.label}>Student photo URL<input style={pageStyles.input} value={manualForm.studentPhotoUrl} onChange={event => updateManualForm('studentPhotoUrl', event.target.value)} placeholder="https://..." /></label>
      <label style={pageStyles.label}>Student status<select style={pageStyles.input} value={manualForm.studentStatus} onChange={event => updateManualForm('studentStatus', event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="completed">Completed</option><option value="suspended">Suspended</option></select></label>
      <label style={pageStyles.label}>ID expiry date<input style={pageStyles.input} type="date" value={manualForm.idCardExpiresAt} onChange={event => updateManualForm('idCardExpiresAt', event.target.value)} /></label>
      <label style={pageStyles.label}>Payment mode<select style={pageStyles.input} value={manualForm.paymentMode} onChange={event => updateManualForm('paymentMode', event.target.value as ManualForm['paymentMode'])}><option value="none">No payment required</option><option value="manual">Manual payment</option><option value="online">Online payment</option></select></label>
      <label style={pageStyles.label}>Payment status<input style={pageStyles.input} value={manualForm.paymentStatus} onChange={event => updateManualForm('paymentStatus', event.target.value)} /></label>
      <label style={pageStyles.label}>Amount<input style={pageStyles.input} inputMode="decimal" value={manualForm.amount} onChange={event => updateManualForm('amount', event.target.value)} placeholder="0.00" /></label>
      <label style={pageStyles.label}>Reference<input style={pageStyles.input} value={manualForm.reference} onChange={event => updateManualForm('reference', event.target.value)} placeholder="Optional" /></label>
    </div><label style={{ ...pageStyles.label, marginTop: 14 }}>Notes<textarea style={{ ...pageStyles.input, minHeight: 82, resize: 'vertical' }} rows={3} value={manualForm.notes} onChange={event => updateManualForm('notes', event.target.value)} placeholder="Student goals, parent contact, payment note, etc." /></label><div style={pageStyles.actions}><button type="submit" style={{ ...pageStyles.primaryButton, opacity: saving ? 0.65 : 1 }} disabled={saving}>{saving ? 'Saving…' : 'Add student'}</button><button type="button" style={pageStyles.secondaryButton} onClick={() => setManualForm(initialManualForm)} disabled={saving}>Clear form</button></div>{saveMessage ? <p style={{ ...pageStyles.alert, background: '#dcfce7', color: '#166534' }}>{saveMessage}</p> : null}</form></section>
    <section style={pageStyles.card}><div style={pageStyles.cardHeader}><div><h2 style={pageStyles.cardTitle}>Latest registrations</h2><p style={pageStyles.muted}>Website submissions and manual entries appear here.</p></div><button type="button" style={pageStyles.secondaryButton} onClick={() => void loadRegistrations(true)} disabled={loading}>Refresh</button></div>{loading ? <p style={pageStyles.muted}>Loading registrations…</p> : null}{error ? <p style={{ ...pageStyles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}{!loading && !error && registrations.length === 0 ? <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}><strong style={{ color: '#334155' }}>No student registrations yet.</strong><p style={{ margin: '6px 0 0' }}>Add one manually or wait for the connected website to submit a registration.</p></div> : null}{registrations.length > 0 ? <div style={pageStyles.tableWrap}><table style={pageStyles.table}><thead><tr><th style={pageStyles.th}>Student</th><th style={pageStyles.th}>Student ID</th><th style={pageStyles.th}>Course</th><th style={pageStyles.th}>Class time</th><th style={pageStyles.th}>Status</th><th style={pageStyles.th}>Payment</th><th style={pageStyles.th}>Reference</th><th style={pageStyles.th}>Actions</th></tr></thead><tbody>{registrations.map(item => <tr key={item.id}><td style={pageStyles.td}><strong style={{ color: '#0f172a' }}>{item.customer?.name ?? 'Unnamed student'}</strong><br /><small>{item.customer?.phone ?? item.customer?.email ?? 'No contact'}</small></td><td style={pageStyles.td}><strong>{studentCodeOf(item)}</strong></td><td style={pageStyles.td}>{item.data?.course ?? '—'}</td><td style={pageStyles.td}>{item.data?.preferredClassTime ?? '—'}</td><td style={pageStyles.td}><span style={{ ...statusStyle(studentStatusOf(item)), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(studentStatusOf(item))}</span></td><td style={pageStyles.td}><span style={{ ...statusStyle(item.payment?.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(item.payment?.status)}</span><br /><small>{formatAmount(item.payment)}</small></td><td style={pageStyles.td}>{item.payment?.reference ?? '—'}<br /><small>{formatDate(item.createdAt)}</small></td><td style={pageStyles.td}><button type="button" style={pageStyles.secondaryButton} onClick={() => void handlePrintCard(item)}>Print ID</button></td></tr>)}</tbody></table></div> : null}</section>
  </div>
}
