import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc as firestoreDoc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore'
import { uploadProductImage } from '../api/productImageUpload'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type RegistrationData = Record<string, unknown> & {
  course?: string | null
  preferredClassTime?: string | null
  branch?: string | null
  notes?: string | null
  studentCode?: string | null
  studentStatus?: string | null
  studentPhotoUrl?: string | null
}

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
  customer?: { name?: string | null; email?: string | null; phone?: string | null }
  data?: RegistrationData
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
  hero: { borderRadius: 22, padding: '22px clamp(18px, 3vw, 28px)', background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 52%, #7c3aed 100%)', color: '#fff', boxShadow: '0 24px 60px -42px rgba(49, 46, 129, 0.8)' },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.74)' },
  title: { margin: '8px 0 0', fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 760, color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 1.65 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, minWidth: 0 },
  statCard: { borderRadius: 18, border: '1px solid #e2e8f0', background: '#ffffff', padding: 15, boxShadow: '0 18px 42px -36px rgba(15, 23, 42, 0.55)' },
  statLabel: { margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 12 },
  statValue: { margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.05em' },
  card: { borderRadius: 22, border: '1px solid #e2e8f0', background: '#ffffff', padding: 'clamp(15px, 2vw, 22px)', boxShadow: '0 22px 52px -42px rgba(15, 23, 42, 0.5)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' as const, overflow: 'hidden' as const },
  cardHeader: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 20, letterSpacing: '-0.02em' },
  muted: { color: '#64748b', margin: '5px 0 0', lineHeight: 1.6 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12, minWidth: 0 },
  label: { display: 'grid', gap: 7, color: '#334155', fontSize: 13, fontWeight: 800, minWidth: 0 },
  input: { width: '100%', maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 13, padding: '11px 12px', fontSize: 14, background: '#ffffff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const },
  actions: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 13, padding: '11px 17px', background: 'linear-gradient(135deg, #4338ca, #4f46e5)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(67, 56, 202, 0.85)' },
  successButton: { border: 0, borderRadius: 13, padding: '9px 12px', background: '#059669', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  warningButton: { border: 0, borderRadius: 13, padding: '9px 12px', background: '#d97706', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  dangerButton: { border: 0, borderRadius: 13, padding: '9px 12px', background: '#dc2626', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 13, padding: '9px 12px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  disabledButton: { opacity: 0.48, cursor: 'not-allowed' },
  tableWrap: { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' as const, borderRadius: 16, border: '1px solid #e2e8f0', boxSizing: 'border-box' as const },
  table: { width: '100%', minWidth: 1120, borderCollapse: 'collapse' as const, tableLayout: 'auto' as const },
  th: { textAlign: 'left' as const, padding: '12px 12px', fontSize: 11, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase' as const, letterSpacing: '0.07em', whiteSpace: 'nowrap' as const },
  td: { padding: '12px 12px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top' as const, color: '#334155', fontSize: 13, overflowWrap: 'anywhere' as const },
  stickyStudentTh: { position: 'sticky' as const, left: 0, zIndex: 3, minWidth: 250, boxShadow: '8px 0 14px -16px rgba(15,23,42,.8)' },
  stickyStudentTd: { position: 'sticky' as const, left: 0, zIndex: 2, background: '#fff', minWidth: 250, boxShadow: '8px 0 14px -16px rgba(15,23,42,.8)' },
  alert: { borderRadius: 16, padding: '12px 14px', fontWeight: 800 },
  photoPreview: { width: 72, height: 82, borderRadius: 14, border: '1px solid #cbd5e1', background: '#eef2ff', display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#3730a3', fontSize: 11, fontWeight: 900 },
}

const textFrom = (...values: unknown[]) => values.find((value) => typeof value === 'string' && value.trim()) as string | undefined
function toDate(value?: Timestamp | string | null) { if (!value) return null; if (typeof value === 'string') { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed } const date = value?.toDate?.(); return date && !Number.isNaN(date.getTime()) ? date : null }
function formatDate(value?: Timestamp | string | null) { const date = toDate(value); return date ? date.toLocaleString() : '—' }
function formatAmount(payment?: RegistrationDoc['payment']) { if (!payment || typeof payment.amount !== 'number') return '—'; return `${payment.currency ?? 'GHS'} ${payment.amount.toFixed(2)}` }
function cleanText(value: string, max = 200) { return value.trim().slice(0, max) }
function normalizeEmail(value: string) { return cleanText(value, 160).toLowerCase() }
function normalizePaymentStatus(mode: ManualForm['paymentMode'], status: string) { const normalized = cleanText(status, 80); if (normalized) return normalized; if (mode === 'manual') return 'pending_manual_review'; if (mode === 'online') return 'pending'; return 'not_required' }
function buildManualReference(storeId: string) { return `REG-${storeId.slice(0, 6).toUpperCase()}-${Date.now()}` }
function buildStudentCode(storeId: string, id: string) { return `${storeId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'STU'}-${new Date().getFullYear()}-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}` }
function safeDocId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) }
function statusLabel(value?: string | null) { const text = value || 'not_required'; return text.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function statusStyle(value?: string | null) { const normalized = (value || '').toLowerCase(); if (['paid', 'success', 'captured', 'confirmed', 'active'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }; if (['rejected', 'cancelled', 'canceled'].includes(normalized)) return { background: '#fee2e2', color: '#991b1b' }; if (['pending', 'checkout_created', 'pending_manual_review', 'new'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }; return { background: '#e0e7ff', color: '#3730a3' } }
function studentCodeOf(item: RegistrationDoc) { return item.studentCode || item.data?.studentCode || buildStudentCode(item.storeId || 'STU', item.id) }
function studentNameOf(item: RegistrationDoc) { return textFrom(item.customer?.name, item.data?.studentName, item.data?.fullName, item.data?.name, item.data?.customerName) || 'Unnamed student' }
function studentPhoneOf(item: RegistrationDoc) { return textFrom(item.customer?.phone, item.data?.phone, item.data?.studentPhone, item.data?.customerPhone) || '' }
function studentEmailOf(item: RegistrationDoc) { return textFrom(item.customer?.email, item.data?.email, item.data?.studentEmail, item.data?.customerEmail) || '' }
function studentPhotoOf(item: RegistrationDoc) { return item.studentPhotoUrl || item.data?.studentPhotoUrl || '' }
function studentStatusOf(item: RegistrationDoc) { return item.studentStatus || item.data?.studentStatus || item.status || 'pending' }
function isIncomingRegistration(item: RegistrationDoc) { return item.source !== 'manual_dashboard' }
function isPaidStatus(value?: string | null) { return ['paid', 'success', 'captured', 'confirmed'].includes((value || '').toLowerCase()) }
function isActiveStatus(value?: string | null) { return ['active', 'confirmed'].includes((value || '').toLowerCase()) }

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return <article style={{ ...pageStyles.statCard, borderTop: `4px solid ${accent}` }}><p style={{ ...pageStyles.statValue, color: accent }}>{value}</p><p style={pageStyles.statLabel}>{label}</p></article>
}

function PrintableIdCard({ student, schoolName, onClose }: { student: RegistrationDoc; schoolName: string; onClose: () => void }) {
  const code = studentCodeOf(student)
  const photo = studentPhotoOf(student)
  const status = studentStatusOf(student)
  const name = studentNameOf(student)
  const title = schoolName || 'Student ID'
  return <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.72)', display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box' }}>
    <div style={{ background: '#fff', borderRadius: 24, padding: 22, width: 'min(720px, 100%)', boxSizing: 'border-box' }}>
      <div id="student-id-card-print-area" style={{ width: 440, maxWidth: '100%', margin: '0 auto', border: '1px solid #cbd5e1', borderRadius: 22, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: 'linear-gradient(135deg, #312e81, #7c3aed)', color: '#fff', padding: 18 }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 800 }}>Student ID Card</p>
          <h2 style={{ margin: '5px 0 0', fontSize: 21 }}>{title}</h2>
        </div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '96px 1fr', gap: 16 }}>
          <div style={{ width: 96, height: 110, borderRadius: 16, background: '#eef2ff', display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#3730a3', fontWeight: 900 }}>{photo ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PHOTO'}</div>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{name}</h3>
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

function RegistrationTable({ title, subtitle, items, loading, emptyText, onRefresh, onPrint, onConfirm, onMarkPaid, onReject, actioningId }: {
  title: string
  subtitle: string
  items: RegistrationDoc[]
  loading: boolean
  emptyText: string
  onRefresh: () => void
  onPrint: (item: RegistrationDoc) => void
  onConfirm: (item: RegistrationDoc) => void
  onMarkPaid: (item: RegistrationDoc) => void
  onReject: (item: RegistrationDoc) => void
  actioningId: string | null
}) {
  return <section style={pageStyles.card}>
    <div style={pageStyles.cardHeader}><div><h2 style={pageStyles.cardTitle}>{title}</h2><p style={pageStyles.muted}>{subtitle}</p></div><button type="button" style={pageStyles.secondaryButton} onClick={onRefresh} disabled={loading}>Refresh</button></div>
    {loading ? <p style={pageStyles.muted}>Loading registrations…</p> : null}
    {!loading && items.length === 0 ? <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}><strong style={{ color: '#334155' }}>{emptyText}</strong></div> : null}
    {items.length > 0 ? <div style={pageStyles.tableWrap}><table style={pageStyles.table}><thead><tr><th style={{ ...pageStyles.th, ...pageStyles.stickyStudentTh }}>Student</th><th style={pageStyles.th}>Student ID</th><th style={pageStyles.th}>Course</th><th style={pageStyles.th}>Class time</th><th style={pageStyles.th}>Status</th><th style={pageStyles.th}>Payment</th><th style={pageStyles.th}>Reference</th><th style={pageStyles.th}>Actions</th></tr></thead><tbody>{items.map(item => {
      const isBusy = actioningId === item.id
      const isConfirmed = isActiveStatus(studentStatusOf(item))
      const isPaid = isPaidStatus(item.payment?.status)
      const name = studentNameOf(item)
      const contact = studentPhoneOf(item) || studentEmailOf(item) || 'No contact'
      return <tr key={item.id}><td style={{ ...pageStyles.td, ...pageStyles.stickyStudentTd }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><div style={{ ...pageStyles.photoPreview, width: 44, height: 50 }}>{studentPhotoOf(item) ? <img src={studentPhotoOf(item)} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PHOTO'}</div><div><strong style={{ color: '#0f172a' }}>{name}</strong><br /><small>{contact}</small></div></div></td><td style={pageStyles.td}><strong>{studentCodeOf(item)}</strong></td><td style={pageStyles.td}>{item.data?.course ?? '—'}</td><td style={pageStyles.td}>{item.data?.preferredClassTime ?? '—'}</td><td style={pageStyles.td}><span style={{ ...statusStyle(studentStatusOf(item)), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(studentStatusOf(item))}</span></td><td style={pageStyles.td}><span style={{ ...statusStyle(item.payment?.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(item.payment?.status)}</span><br /><small>{formatAmount(item.payment)}</small></td><td style={pageStyles.td}>{item.payment?.reference ?? '—'}<br /><small>{formatDate(item.createdAt)}</small></td><td style={pageStyles.td}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><button type="button" style={{ ...pageStyles.successButton, ...(isConfirmed ? pageStyles.disabledButton : {}) }} onClick={() => onConfirm(item)} disabled={isBusy || isConfirmed}>{isConfirmed ? 'Confirmed' : 'Confirm'}</button><button type="button" style={{ ...pageStyles.warningButton, ...(isPaid ? pageStyles.disabledButton : {}) }} onClick={() => onMarkPaid(item)} disabled={isBusy || isPaid}>{isPaid ? 'Paid' : 'Mark paid'}</button><button type="button" style={pageStyles.secondaryButton} onClick={() => onPrint(item)} disabled={isBusy}>Print ID</button><button type="button" style={pageStyles.dangerButton} onClick={() => onReject(item)} disabled={isBusy}>Reject</button></div></td></tr>
    })}</tbody></table></div> : null}
  </section>
}

export default function StudentRegistration() {
  const { storeId } = useActiveStore()
  const [registrations, setRegistrations] = useState<RegistrationDoc[]>([])
  const [selectedCardStudent, setSelectedCardStudent] = useState<RegistrationDoc | null>(null)
  const [schoolName, setSchoolName] = useState('School ID')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState<ManualForm>(initialManualForm)

  async function loadStoreName(active = true) {
    if (!storeId) return
    try {
      const snapshot = await getDoc(firestoreDoc(db, 'stores', storeId))
      if (!active || !snapshot.exists()) return
      const data = snapshot.data() as Record<string, unknown>
      const name = textFrom(data.displayName, data.storeName, data.name)
      setSchoolName(name ? `${name} ID` : 'Student ID')
    } catch (storeError) {
      console.warn('[student-registration] unable to load store name', storeError)
    }
  }

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

  useEffect(() => { let active = true; void loadStoreName(active); void loadRegistrations(active); return () => { active = false } }, [storeId])

  const incomingRegistrations = useMemo(() => registrations.filter(isIncomingRegistration), [registrations])
  const manualRegistrations = useMemo(() => registrations.filter(item => !isIncomingRegistration(item)), [registrations])
  const totals = useMemo(() => {
    const total = registrations.length
    const paid = registrations.filter(item => isPaidStatus(item.payment?.status)).length
    const manual = manualRegistrations.length
    const pending = incomingRegistrations.filter(item => ['pending', 'checkout_created', 'new'].includes(item.payment?.status ?? '') || ['pending', 'new'].includes(studentStatusOf(item))).length
    return { total, paid, manual, pending }
  }, [incomingRegistrations, manualRegistrations, registrations])

  async function ensureStudentCode(item: RegistrationDoc) {
    if (!storeId) return studentCodeOf(item)
    const code = studentCodeOf(item)
    await setDoc(firestoreDoc(db, 'student_registrations', item.id), { studentCode: code, data: { ...(item.data || {}), studentCode: code }, updatedAt: serverTimestamp() }, { merge: true })
    return code
  }

  async function saveStudentRecord(item: RegistrationDoc, overrides: { studentStatus?: string; paymentStatus?: string } = {}) {
    if (!storeId) return
    const studentCode = studentCodeOf(item)
    const now = serverTimestamp()
    const studentStatus = overrides.studentStatus ?? studentStatusOf(item)
    const paymentStatus = overrides.paymentStatus ?? item.payment?.status ?? 'pending'
    const name = studentNameOf(item)
    const phone = studentPhoneOf(item) || null
    const email = studentEmailOf(item) || null
    const photoUrl = studentPhotoOf(item) || null
    const course = textFrom(item.data?.course) || null
    const preferredClassTime = textFrom(item.data?.preferredClassTime) || null
    const branch = textFrom(item.data?.branch) || null
    const commonPayload = {
      storeId,
      name,
      displayName: name,
      email,
      phone,
      source: item.source || 'website_registration',
      tags: ['Student', course].filter(Boolean),
      studentRegistrationId: item.id,
      studentCode,
      studentStatus,
      studentPhotoUrl: photoUrl,
      course,
      preferredClassTime,
      branch,
      payment: { ...(item.payment || {}), status: paymentStatus, currency: item.payment?.currency ?? 'GHS' },
      updatedAt: now,
    }
    const studentDocId = safeDocId(`${storeId}_${studentCode}`)
    await setDoc(firestoreDoc(db, 'students', studentDocId), { ...commonPayload, createdAt: item.createdAt || now }, { merge: true })
    await setDoc(firestoreDoc(db, 'customers', studentDocId), { ...commonPayload, customerType: 'student', createdAt: item.createdAt || now }, { merge: true })
  }

  async function handlePrintCard(item: RegistrationDoc) {
    await ensureStudentCode(item)
    setSelectedCardStudent({ ...item, studentCode: studentCodeOf(item) })
  }

  async function updateRegistrationStatus(item: RegistrationDoc, changes: Partial<RegistrationDoc> & { data?: RegistrationDoc['data']; payment?: RegistrationDoc['payment'] }, message: string, studentRecordChanges: { studentStatus?: string; paymentStatus?: string } = {}) {
    setActioningId(item.id)
    setError(null)
    setSaveMessage(null)
    try {
      const studentCode = await ensureStudentCode(item)
      const mergedItem: RegistrationDoc = {
        ...item,
        ...changes,
        studentCode,
        data: { ...(item.data || {}), ...(changes.data || {}), studentCode },
        payment: changes.payment || item.payment,
      }
      await setDoc(firestoreDoc(db, 'student_registrations', item.id), { ...changes, studentCode, data: mergedItem.data, updatedAt: serverTimestamp() }, { merge: true })
      await saveStudentRecord(mergedItem, studentRecordChanges)
      setSaveMessage(message)
      await loadRegistrations(true)
    } catch (actionError) {
      console.error(actionError)
      setError('Unable to update registration or save student record. Check Firestore rules and try again.')
    } finally {
      setActioningId(null)
    }
  }

  function confirmStudent(item: RegistrationDoc) {
    const code = studentCodeOf(item)
    void updateRegistrationStatus(item, { status: 'confirmed', studentStatus: 'active', data: { ...(item.data || {}), studentStatus: 'active', studentCode: code } }, 'Student confirmed and saved to Students/Customers records.', { studentStatus: 'active' })
  }

  function markPaid(item: RegistrationDoc) {
    void updateRegistrationStatus(item, { payment: { ...(item.payment || {}), status: 'paid', currency: item.payment?.currency ?? 'GHS' }, status: item.status === 'rejected' ? 'confirmed' : item.status }, 'Payment marked as paid and saved to student record.', { paymentStatus: 'paid' })
  }

  function rejectStudent(item: RegistrationDoc) {
    if (!window.confirm(`Reject registration for ${studentNameOf(item)}?`)) return
    void updateRegistrationStatus(item, { status: 'rejected', studentStatus: 'rejected', data: { ...(item.data || {}), studentStatus: 'rejected' } }, 'Registration rejected.', { studentStatus: 'rejected' })
  }

  async function handlePhotoUpload(file: File | null) {
    if (!file || !storeId) return
    if (!file.type.startsWith('image/')) { setError('Choose a valid image file.'); return }
    setUploadingPhoto(true)
    setError(null)
    try {
      const url = await uploadProductImage(file, { storagePath: `stores/${storeId}/student-photos` })
      updateManualForm('studentPhotoUrl', url)
      setSaveMessage('Student photo uploaded. Save the student to attach it to the ID card.')
    } catch (uploadError) {
      console.error(uploadError)
      setError('Unable to upload student photo. You can paste a photo URL instead.')
    } finally {
      setUploadingPhoto(false)
    }
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
      const photoUrl = cleanText(manualForm.studentPhotoUrl, 500) || null
      const payload: RegistrationDoc = { id: docRef.id, storeId, source: 'manual_dashboard', status: 'confirmed', studentCode, studentStatus: cleanText(manualForm.studentStatus, 80) || 'pending', studentPhotoUrl: photoUrl, idCardIssued: false, idCardIssuedAt: null, idCardExpiresAt: cleanText(manualForm.idCardExpiresAt, 80) || null, customer: { name: studentName, email: email || null, phone: phone || null }, data: { course: course || null, preferredClassTime: cleanText(manualForm.preferredClassTime, 120) || null, branch: cleanText(manualForm.branch, 120) || null, notes: cleanText(manualForm.notes, 1000) || null, studentCode, studentStatus: cleanText(manualForm.studentStatus, 80) || 'pending', studentPhotoUrl: photoUrl }, payment: { mode: manualForm.paymentMode, status: paymentStatus, amount: hasAmount ? amount : null, currency: 'GHS', reference }, createdAt: null }
      await setDoc(docRef, { ...payload, pageId: 'student-registration', pageType: 'student_registration', createdAt: now, updatedAt: now })
      await saveStudentRecord({ ...payload, createdAt: null }, { studentStatus: payload.studentStatus || 'pending', paymentStatus })
      setManualForm(initialManualForm); setSaveMessage(`Manual student registration added and saved. Student ID: ${studentCode}`); await loadRegistrations(true)
    } catch (saveError) { console.error(saveError); setError('Unable to save student registration. Check Firestore rules or try again.') } finally { setSaving(false) }
  }

  function updateManualForm<K extends keyof ManualForm>(key: K, value: ManualForm[K]) { setManualForm(current => ({ ...current, [key]: value, ...(key === 'paymentMode' ? { paymentStatus: value === 'manual' ? 'pending_manual_review' : value === 'online' ? 'pending' : 'not_required' } : {}) })) }

  return <div style={pageStyles.page}>{selectedCardStudent ? <PrintableIdCard student={selectedCardStudent} schoolName={schoolName} onClose={() => setSelectedCardStudent(null)} /> : null}
    <section style={pageStyles.hero}><p style={pageStyles.eyebrow}>Admissions workspace</p><h1 style={pageStyles.title}>Student registration</h1><p style={pageStyles.subtitle}>Review website registrations separately from manual entries. Confirm students, mark payments, upload photos, and print student ID cards. Confirmed records are saved into Students and Customers.</p></section>
    <section style={pageStyles.statsGrid} aria-label="Registration summary"><StatCard label="Total registrations" value={totals.total} accent="#4f46e5" /><StatCard label="Paid" value={totals.paid} accent="#059669" /><StatCard label="Incoming pending" value={totals.pending} accent="#d97706" /><StatCard label="Manual entries" value={totals.manual} accent="#7c3aed" /></section>
    {error ? <p style={{ ...pageStyles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}
    {saveMessage ? <p style={{ ...pageStyles.alert, background: '#dcfce7', color: '#166534' }}>{saveMessage}</p> : null}

    <RegistrationTable title="Incoming website registrations" subtitle="New registrations submitted from connected websites appear here first. Confirm saves the student into Students and Customers. Mark paid updates payment records." items={incomingRegistrations} loading={loading} emptyText="No incoming website registrations yet." onRefresh={() => void loadRegistrations(true)} onPrint={(item) => void handlePrintCard(item)} onConfirm={confirmStudent} onMarkPaid={markPaid} onReject={rejectStudent} actioningId={actioningId} />

    <section style={pageStyles.card}><div style={pageStyles.cardHeader}><div><h2 style={pageStyles.cardTitle}>Add student manually</h2><p style={pageStyles.muted}>Use this for walk-ins or phone registrations. Upload a student photo or paste a photo URL before printing the ID card.</p></div></div><form onSubmit={handleManualSubmit}><div style={pageStyles.formGrid}>
      <label style={pageStyles.label}>Student name *<input style={pageStyles.input} value={manualForm.name} onChange={event => updateManualForm('name', event.target.value)} placeholder="Student full name" /></label>
      <label style={pageStyles.label}>Phone<input style={pageStyles.input} value={manualForm.phone} onChange={event => updateManualForm('phone', event.target.value)} placeholder="+233..." /></label>
      <label style={pageStyles.label}>Email<input style={pageStyles.input} type="email" value={manualForm.email} onChange={event => updateManualForm('email', event.target.value)} placeholder="student@example.com" /></label>
      <label style={pageStyles.label}>Course / program<input style={pageStyles.input} value={manualForm.course} onChange={event => updateManualForm('course', event.target.value)} placeholder="Hair Braiding" /></label>
      <label style={pageStyles.label}>Preferred class time<input style={pageStyles.input} value={manualForm.preferredClassTime} onChange={event => updateManualForm('preferredClassTime', event.target.value)} placeholder="14 July 2026, Morning" /></label>
      <label style={pageStyles.label}>Branch<input style={pageStyles.input} value={manualForm.branch} onChange={event => updateManualForm('branch', event.target.value)} placeholder="Tema" /></label>
      <label style={pageStyles.label}>Upload student photo<input style={pageStyles.input} type="file" accept="image/*" onChange={event => void handlePhotoUpload(event.target.files?.[0] ?? null)} disabled={uploadingPhoto || saving} />{uploadingPhoto ? <small>Uploading photo…</small> : null}</label>
      <label style={pageStyles.label}>Student photo URL<input style={pageStyles.input} value={manualForm.studentPhotoUrl} onChange={event => updateManualForm('studentPhotoUrl', event.target.value)} placeholder="https://..." /></label>
      <div style={{ ...pageStyles.label, gap: 8 }}>Photo preview<div style={pageStyles.photoPreview}>{manualForm.studentPhotoUrl ? <img src={manualForm.studentPhotoUrl} alt="Student preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PHOTO'}</div></div>
      <label style={pageStyles.label}>Student status<select style={pageStyles.input} value={manualForm.studentStatus} onChange={event => updateManualForm('studentStatus', event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="completed">Completed</option><option value="suspended">Suspended</option></select></label>
      <label style={pageStyles.label}>ID expiry date<input style={pageStyles.input} type="date" value={manualForm.idCardExpiresAt} onChange={event => updateManualForm('idCardExpiresAt', event.target.value)} /></label>
      <label style={pageStyles.label}>Payment mode<select style={pageStyles.input} value={manualForm.paymentMode} onChange={event => updateManualForm('paymentMode', event.target.value as ManualForm['paymentMode'])}><option value="none">No payment required</option><option value="manual">Manual payment</option><option value="online">Online payment</option></select></label>
      <label style={pageStyles.label}>Payment status<input style={pageStyles.input} value={manualForm.paymentStatus} onChange={event => updateManualForm('paymentStatus', event.target.value)} /></label>
      <label style={pageStyles.label}>Amount<input style={pageStyles.input} inputMode="decimal" value={manualForm.amount} onChange={event => updateManualForm('amount', event.target.value)} placeholder="0.00" /></label>
      <label style={pageStyles.label}>Reference<input style={pageStyles.input} value={manualForm.reference} onChange={event => updateManualForm('reference', event.target.value)} placeholder="Optional" /></label>
    </div><label style={{ ...pageStyles.label, marginTop: 14 }}>Notes<textarea style={{ ...pageStyles.input, minHeight: 82, resize: 'vertical' }} rows={3} value={manualForm.notes} onChange={event => updateManualForm('notes', event.target.value)} placeholder="Student goals, parent contact, payment note, etc." /></label><div style={pageStyles.actions}><button type="submit" style={{ ...pageStyles.primaryButton, opacity: saving ? 0.65 : 1 }} disabled={saving || uploadingPhoto}>{saving ? 'Saving…' : 'Add manual student'}</button><button type="button" style={pageStyles.secondaryButton} onClick={() => setManualForm(initialManualForm)} disabled={saving || uploadingPhoto}>Clear form</button></div></form></section>

    <RegistrationTable title="Manual entries" subtitle="Students added by staff from this dashboard." items={manualRegistrations} loading={loading} emptyText="No manual entries yet." onRefresh={() => void loadRegistrations(true)} onPrint={(item) => void handlePrintCard(item)} onConfirm={confirmStudent} onMarkPaid={markPaid} onReject={rejectStudent} actioningId={actioningId} />
  </div>
}
