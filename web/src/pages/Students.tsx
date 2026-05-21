import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, query, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

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
  studentPhotoUrl?: string | null
  course?: string | null
  preferredClassTime?: string | null
  branch?: string | null
  payment?: {
    mode?: string | null
    status?: string | null
    amount?: number | null
    currency?: string | null
    reference?: string | null
  } | null
  createdAt?: Timestamp | string | null
  updatedAt?: Timestamp | string | null
}

const styles = {
  page: {
    display: 'grid',
    gap: 18,
    color: '#0f172a',
    width: '100%',
    maxWidth: 'min(100%, 1440px)',
    margin: '0 auto',
    padding: '12px clamp(10px, 1.5vw, 18px) 32px',
    boxSizing: 'border-box' as const,
    overflowX: 'hidden' as const,
  },
  hero: {
    borderRadius: 22,
    padding: '22px clamp(18px, 3vw, 28px)',
    background: 'linear-gradient(135deg, #0f172a 0%, #312e81 55%, #4f46e5 100%)',
    color: '#fff',
    boxShadow: '0 24px 60px -42px rgba(49, 46, 129, 0.8)',
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.74)',
  },
  title: {
    margin: '8px 0 0',
    fontSize: 'clamp(26px, 4vw, 40px)',
    lineHeight: 1.05,
    letterSpacing: '-0.04em',
  },
  subtitle: {
    margin: '12px 0 0',
    maxWidth: 820,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 1.65,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
    gap: 12,
  },
  statCard: {
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    padding: 15,
    boxShadow: '0 18px 42px -36px rgba(15, 23, 42, 0.55)',
    borderTop: '4px solid #4f46e5',
  },
  statValue: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: '-0.05em',
    color: '#4f46e5',
  },
  statLabel: {
    margin: '6px 0 0',
    color: '#64748b',
    fontWeight: 800,
    fontSize: 12,
  },
  card: {
    borderRadius: 22,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    padding: 'clamp(15px, 2vw, 22px)',
    boxShadow: '0 22px 52px -42px rgba(15, 23, 42, 0.5)',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  },
  cardHeader: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
    letterSpacing: '-0.02em',
  },
  muted: {
    color: '#64748b',
    margin: '5px 0 0',
    lineHeight: 1.6,
  },
  input: {
    width: 'min(340px, 100%)',
    border: '1px solid #cbd5e1',
    borderRadius: 13,
    padding: '11px 12px',
    fontSize: 14,
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  button: {
    border: '1px solid #cbd5e1',
    borderRadius: 13,
    padding: '10px 14px',
    background: '#fff',
    color: '#334155',
    fontWeight: 850,
    cursor: 'pointer',
  },
  tableWrap: {
    width: '100%',
    maxWidth: '100%',
    overflowX: 'auto' as const,
    borderRadius: 16,
    border: '1px solid #e2e8f0',
  },
  table: {
    width: '100%',
    minWidth: 980,
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 12px',
    fontSize: 11,
    color: '#64748b',
    background: '#f8fafc',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '12px 12px',
    borderTop: '1px solid #e2e8f0',
    verticalAlign: 'top' as const,
    color: '#334155',
    fontSize: 13,
    overflowWrap: 'anywhere' as const,
  },
  stickyStudentTh: {
    position: 'sticky' as const,
    left: 0,
    zIndex: 3,
    minWidth: 260,
    boxShadow: '8px 0 14px -16px rgba(15,23,42,.8)',
  },
  stickyStudentTd: {
    position: 'sticky' as const,
    left: 0,
    zIndex: 2,
    background: '#fff',
    minWidth: 260,
    boxShadow: '8px 0 14px -16px rgba(15,23,42,.8)',
  },
  photo: {
    width: 44,
    height: 50,
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    background: '#eef2ff',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    color: '#3730a3',
    fontSize: 10,
    fontWeight: 900,
  },
  alert: {
    borderRadius: 16,
    padding: '12px 14px',
    fontWeight: 800,
  },
}

function toDate(value?: Timestamp | string | null) {
  if (!value) return null
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = value?.toDate?.()
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
}

function formatDate(value?: Timestamp | string | null) {
  const date = toDate(value)
  return date ? date.toLocaleDateString() : '—'
}

function studentName(student: StudentRecord) {
  return student.displayName || student.name || 'Unnamed student'
}

function paymentStatus(student: StudentRecord) {
  return student.payment?.status || 'not_required'
}

function statusLabel(value?: string | null) {
  return (value || 'not_required').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusStyle(value?: string | null) {
  const normalized = (value || '').toLowerCase()
  if (['paid', 'success', 'captured', 'confirmed', 'active'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }
  if (['rejected', 'cancelled', 'canceled', 'suspended'].includes(normalized)) return { background: '#fee2e2', color: '#991b1b' }
  if (['pending', 'checkout_created', 'pending_manual_review', 'new'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }
  return { background: '#e0e7ff', color: '#3730a3' }
}

function formatAmount(student: StudentRecord) {
  const amount = student.payment?.amount
  if (typeof amount !== 'number') return '—'
  return `${student.payment?.currency || 'GHS'} ${amount.toFixed(2)}`
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <article style={{ ...styles.statCard, borderTopColor: accent }}>
      <p style={{ ...styles.statValue, color: accent }}>{value}</p>
      <p style={styles.statLabel}>{label}</p>
    </article>
  )
}

export default function Students() {
  const { storeId } = useActiveStore()
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function loadStudents(active = true) {
    if (!storeId) {
      setStudents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const snapshot = await getDocs(query(collection(db, 'students'), where('storeId', '==', storeId), limit(500)))
      if (!active) return
      const rows = snapshot.docs
        .map((documentSnapshot) => ({ id: documentSnapshot.id, ...(documentSnapshot.data() as Omit<StudentRecord, 'id'>) }))
        .sort((left, right) => (toDate(right.updatedAt)?.getTime() ?? 0) - (toDate(left.updatedAt)?.getTime() ?? 0))
      setStudents(rows)
    } catch (loadError) {
      console.error('[students] load failed', loadError)
      if (active) setError('Unable to load students. Check Firestore rules and try again.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadStudents(active)
    return () => {
      active = false
    }
  }, [storeId])

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return students
    return students.filter((student) => [
      studentName(student),
      student.studentCode,
      student.phone,
      student.email,
      student.course,
      student.branch,
      student.studentStatus,
      student.payment?.status,
    ].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [search, students])

  const stats = useMemo(() => {
    const total = students.length
    const active = students.filter((student) => ['active', 'confirmed'].includes((student.studentStatus || '').toLowerCase())).length
    const paid = students.filter((student) => ['paid', 'success', 'captured', 'confirmed'].includes(paymentStatus(student).toLowerCase())).length
    const pending = students.filter((student) => ['pending', 'new', 'pending_manual_review'].includes((student.studentStatus || '').toLowerCase()) || ['pending', 'pending_manual_review'].includes(paymentStatus(student).toLowerCase())).length
    return { total, active, paid, pending }
  }, [students])

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>School records</p>
        <h1 style={styles.title}>Students</h1>
        <p style={styles.subtitle}>
          Confirmed student profiles appear here after website registration review or manual entry. Use Student registration for new applications; use this page for the clean student list.
        </p>
      </section>

      <section style={styles.statsGrid} aria-label="Student summary">
        <StatCard label="Total students" value={stats.total} accent="#4f46e5" />
        <StatCard label="Active students" value={stats.active} accent="#059669" />
        <StatCard label="Paid records" value={stats.paid} accent="#0f766e" />
        <StatCard label="Pending follow-up" value={stats.pending} accent="#d97706" />
      </section>

      {error ? <p style={{ ...styles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Student list</h2>
            <p style={styles.muted}>Search by name, student ID, course, contact, status, or payment.</p>
          </div>
          <button type="button" style={styles.button} onClick={() => void loadStudents(true)} disabled={loading}>Refresh</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <input
            style={styles.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search students..."
          />
        </div>

        {loading ? <p style={styles.muted}>Loading students…</p> : null}
        {!loading && filteredStudents.length === 0 ? (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}>
            <strong style={{ color: '#334155' }}>{students.length === 0 ? 'No saved students yet.' : 'No students match your search.'}</strong>
            <p style={{ margin: '8px 0 0' }}>Confirm an incoming registration or add a manual student from Student registration.</p>
          </div>
        ) : null}

        {filteredStudents.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.stickyStudentTh }}>Student</th>
                  <th style={styles.th}>Student ID</th>
                  <th style={styles.th}>Course</th>
                  <th style={styles.th}>Class time</th>
                  <th style={styles.th}>Branch</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Payment</th>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td style={{ ...styles.td, ...styles.stickyStudentTd }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={styles.photo}>
                          {student.studentPhotoUrl ? <img src={student.studentPhotoUrl} alt={studentName(student)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'PHOTO'}
                        </div>
                        <div>
                          <strong style={{ color: '#0f172a' }}>{studentName(student)}</strong>
                          <br />
                          <small>{student.phone || student.email || 'No contact'}</small>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}><strong>{student.studentCode || '—'}</strong></td>
                    <td style={styles.td}>{student.course || '—'}</td>
                    <td style={styles.td}>{student.preferredClassTime || '—'}</td>
                    <td style={styles.td}>{student.branch || '—'}</td>
                    <td style={styles.td}>
                      <span style={{ ...statusStyle(student.studentStatus), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(student.studentStatus)}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...statusStyle(paymentStatus(student)), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{statusLabel(paymentStatus(student))}</span>
                      <br />
                      <small>{formatAmount(student)}</small>
                    </td>
                    <td style={styles.td}>{statusLabel(student.source)}</td>
                    <td style={styles.td}>{formatDate(student.updatedAt || student.createdAt)}</td>
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
