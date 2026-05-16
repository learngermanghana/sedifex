import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type VolunteerStatus = 'new' | 'contacted' | 'active' | 'inactive'

type VolunteerRecord = {
  id: string
  storeId?: string
  source?: string
  status?: VolunteerStatus | string
  person?: { name?: string; email?: string | null; phone?: string | null }
  data?: {
    skill?: string | null
    availability?: string | null
    preferredProject?: string | null
    location?: string | null
    notes?: string | null
  }
  createdAt?: Timestamp | string | null
}

type VolunteerForm = {
  name: string
  phone: string
  email: string
  skill: string
  availability: string
  preferredProject: string
  location: string
  status: VolunteerStatus
  notes: string
}

const volunteerStatuses: VolunteerStatus[] = ['new', 'contacted', 'active', 'inactive']

const initialForm: VolunteerForm = {
  name: '',
  phone: '',
  email: '',
  skill: '',
  availability: '',
  preferredProject: '',
  location: '',
  status: 'new',
  notes: '',
}

const styles = {
  page: { display: 'grid', gap: 22, color: '#0f172a' },
  hero: {
    borderRadius: 26,
    padding: '28px 30px',
    background: 'linear-gradient(135deg, #064e3b 0%, #059669 55%, #14b8a6 100%)',
    color: '#fff',
    boxShadow: '0 28px 70px -42px rgba(6, 78, 59, 0.8)',
  },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.78)' },
  title: { margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 820, color: 'rgba(255,255,255,0.84)', fontSize: 16, lineHeight: 1.65 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 },
  statCard: { borderRadius: 22, border: '1px solid #e2e8f0', background: '#fff', padding: 18, boxShadow: '0 20px 50px -38px rgba(15, 23, 42, 0.55)' },
  statValue: { margin: 0, fontSize: 34, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.05em' },
  statLabel: { margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 13 },
  card: { borderRadius: 24, border: '1px solid #e2e8f0', background: '#fff', padding: 22, boxShadow: '0 24px 60px -42px rgba(15, 23, 42, 0.5)' },
  cardHeader: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardTitle: { margin: 0, fontSize: 21, letterSpacing: '-0.02em' },
  muted: { color: '#64748b', margin: '5px 0 0', lineHeight: 1.6 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 },
  label: { display: 'grid', gap: 7, color: '#334155', fontSize: 13, fontWeight: 800 },
  input: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', fontSize: 14, background: '#fff', color: '#0f172a', outline: 'none' },
  actions: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 14, padding: '12px 18px', background: 'linear-gradient(135deg, #047857, #059669)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(4, 120, 87, 0.85)' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 14, padding: '11px 16px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  dangerButton: { border: '1px solid #fecaca', borderRadius: 14, padding: '11px 16px', background: '#fff1f2', color: '#be123c', fontWeight: 850, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto' as const, borderRadius: 18, border: '1px solid #e2e8f0' },
  table: { width: '100%', minWidth: 1120, borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '13px 14px', fontSize: 12, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  td: { padding: '14px 14px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top' as const, color: '#334155', fontSize: 14 },
  alert: { borderRadius: 16, padding: '12px 14px', fontWeight: 800 },
}

function clean(value: string, max = 200) {
  return value.trim().slice(0, max)
}

function normalizeEmail(value: string) {
  return clean(value, 160).toLowerCase()
}

function normalizeStatus(value?: string): VolunteerStatus {
  return volunteerStatuses.includes(value as VolunteerStatus) ? value as VolunteerStatus : 'new'
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

function label(value?: string) {
  return (value || 'new').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusStyle(value?: string) {
  const normalized = (value || 'new').toLowerCase()
  if (normalized === 'active') return { background: '#dcfce7', color: '#166534' }
  if (normalized === 'contacted') return { background: '#fef3c7', color: '#92400e' }
  if (normalized === 'inactive') return { background: '#f1f5f9', color: '#475569' }
  return { background: '#e0f2fe', color: '#075985' }
}

function StatCard({ labelText, value, accent }: { labelText: string; value: number; accent: string }) {
  return (
    <article style={{ ...styles.statCard, borderTop: `4px solid ${accent}` }}>
      <p style={{ ...styles.statValue, color: accent }}>{value}</p>
      <p style={styles.statLabel}>{labelText}</p>
    </article>
  )
}

export default function VolunteerApplications() {
  const { storeId } = useActiveStore()
  const [rows, setRows] = useState<VolunteerRecord[]>([])
  const [form, setForm] = useState<VolunteerForm>(initialForm)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load(active = true) {
    if (!storeId) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const snapshot = await getDocs(query(collection(db, 'volunteer_applications'), where('storeId', '==', storeId), limit(200)))
      if (!active) return
      setRows(snapshot.docs
        .map(item => ({ id: item.id, ...(item.data() as Omit<VolunteerRecord, 'id'>) }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)))
    } catch (loadError) {
      console.error(loadError)
      if (active) setError('Unable to load volunteer applications. Check Firestore rules and try again.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void load(active)
    return () => { active = false }
  }, [storeId])

  const totals = useMemo(() => {
    const total = rows.length
    const website = rows.filter(item => item.source === 'website_intake').length
    const manual = rows.filter(item => item.source !== 'website_intake').length
    const active = rows.filter(item => item.status === 'active').length
    return { total, website, manual, active }
  }, [rows])

  function resetForm() {
    setForm(initialForm)
    setEditingId('')
  }

  function startEdit(item: VolunteerRecord) {
    setEditingId(item.id)
    setForm({
      name: item.person?.name ?? '',
      phone: item.person?.phone ?? '',
      email: item.person?.email ?? '',
      skill: item.data?.skill ?? '',
      availability: item.data?.availability ?? '',
      preferredProject: item.data?.preferredProject ?? '',
      location: item.data?.location ?? '',
      status: normalizeStatus(item.status),
      notes: item.data?.notes ?? '',
    })
    setMessage(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function updateStatus(item: VolunteerRecord, nextStatus: VolunteerStatus) {
    try {
      await updateDoc(doc(db, 'volunteer_applications', item.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      })
      setMessage(`Volunteer status changed to ${label(nextStatus)}.`)
      await load(true)
    } catch (statusError) {
      console.error(statusError)
      setError('Unable to update volunteer status.')
    }
  }

  async function deleteVolunteer(item: VolunteerRecord) {
    const name = item.person?.name || 'this volunteer'
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'volunteer_applications', item.id))
      if (editingId === item.id) resetForm()
      setMessage('Volunteer deleted.')
      await load(true)
    } catch (deleteError) {
      console.error(deleteError)
      setError('Unable to delete volunteer.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId) return setError('Select a workspace before adding a volunteer.')
    const name = clean(form.name, 140)
    const phone = clean(form.phone, 60)
    const email = normalizeEmail(form.email)
    if (!name) return setError('Volunteer name is required.')
    if (!phone && !email) return setError('Enter at least one contact: phone or email.')

    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      const now = serverTimestamp()
      const payload = {
        storeId,
        pageType: 'volunteer_application',
        status: normalizeStatus(form.status),
        person: { name, phone: phone || null, email: email || null },
        data: {
          skill: clean(form.skill, 160) || null,
          availability: clean(form.availability, 160) || null,
          preferredProject: clean(form.preferredProject, 180) || null,
          location: clean(form.location, 160) || null,
          notes: clean(form.notes, 1000) || null,
        },
        updatedAt: now,
      }

      if (editingId) {
        await updateDoc(doc(db, 'volunteer_applications', editingId), payload)
        setMessage('Volunteer updated.')
      } else {
        await addDoc(collection(db, 'volunteer_applications'), {
          ...payload,
          source: 'manual_dashboard',
          createdAt: now,
        })
        setMessage('Volunteer added.')
      }

      resetForm()
      await load(true)
    } catch (saveError) {
      console.error(saveError)
      setError('Unable to save volunteer. Check Firestore rules or try again.')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof VolunteerForm>(key: K, value: VolunteerForm[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>NGO workspace</p>
        <h1 style={styles.title}>Volunteers</h1>
        <p style={styles.subtitle}>Manage people who want to volunteer. Move each volunteer through new, contacted, active, and inactive status stages.</p>
      </section>

      <section style={styles.statsGrid} aria-label="Volunteer summary">
        <StatCard labelText="Total volunteers" value={totals.total} accent="#059669" />
        <StatCard labelText="Website applications" value={totals.website} accent="#0284c7" />
        <StatCard labelText="Manual entries" value={totals.manual} accent="#7c3aed" />
        <StatCard labelText="Active volunteers" value={totals.active} accent="#16a34a" />
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>{editingId ? 'Edit volunteer' : 'Add volunteer manually'}</h2>
            <p style={styles.muted}>{editingId ? 'Update volunteer details or status.' : 'Use this for calls, WhatsApp enquiries, events, and office walk-ins.'}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGrid}>
            <label style={styles.label}>Full name *<input style={styles.input} value={form.name} onChange={event => update('name', event.target.value)} placeholder="Volunteer name" /></label>
            <label style={styles.label}>Phone<input style={styles.input} value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="+233..." /></label>
            <label style={styles.label}>Email<input style={styles.input} type="email" value={form.email} onChange={event => update('email', event.target.value)} placeholder="volunteer@example.com" /></label>
            <label style={styles.label}>Skill / interest<input style={styles.input} value={form.skill} onChange={event => update('skill', event.target.value)} placeholder="Teaching, fundraising, field work" /></label>
            <label style={styles.label}>Availability<input style={styles.input} value={form.availability} onChange={event => update('availability', event.target.value)} placeholder="Weekends, weekdays, evenings" /></label>
            <label style={styles.label}>Preferred project<input style={styles.input} value={form.preferredProject} onChange={event => update('preferredProject', event.target.value)} placeholder="School outreach" /></label>
            <label style={styles.label}>Location<input style={styles.input} value={form.location} onChange={event => update('location', event.target.value)} placeholder="Tema, Accra" /></label>
            <label style={styles.label}>Status<select style={styles.input} value={form.status} onChange={event => update('status', normalizeStatus(event.target.value))}>{volunteerStatuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label>
          </div>
          <label style={{ ...styles.label, marginTop: 14 }}>Notes<textarea style={{ ...styles.input, minHeight: 90, resize: 'vertical' }} rows={3} value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
          <div style={styles.actions}>
            <button type="submit" style={{ ...styles.primaryButton, opacity: saving ? 0.65 : 1 }} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update volunteer' : 'Add volunteer'}</button>
            <button type="button" style={styles.secondaryButton} onClick={resetForm} disabled={saving}>{editingId ? 'Cancel edit' : 'Clear form'}</button>
          </div>
          {message ? <p style={{ ...styles.alert, background: '#dcfce7', color: '#166534' }}>{message}</p> : null}
        </form>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div><h2 style={styles.cardTitle}>Latest volunteers</h2><p style={styles.muted}>Website applications and manual entries appear here. Change status, edit details, or delete duplicates.</p></div>
          <button type="button" style={styles.secondaryButton} onClick={() => void load(true)} disabled={loading}>Refresh</button>
        </div>
        {loading ? <p style={styles.muted}>Loading volunteers…</p> : null}
        {error ? <p style={{ ...styles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}><strong style={{ color: '#334155' }}>No volunteers yet.</strong><p style={{ margin: '6px 0 0' }}>Add one manually or connect your website volunteer form.</p></div> : null}
        {rows.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Volunteer</th><th style={styles.th}>Skill</th><th style={styles.th}>Availability</th><th style={styles.th}>Project</th><th style={styles.th}>Source</th><th style={styles.th}>Status</th><th style={styles.th}>Date</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{rows.map(item => <tr key={item.id}><td style={styles.td}><strong style={{ color: '#0f172a' }}>{item.person?.name ?? 'Unnamed volunteer'}</strong><br /><small>{item.person?.phone ?? item.person?.email ?? 'No contact'}</small></td><td style={styles.td}>{item.data?.skill ?? '—'}</td><td style={styles.td}>{item.data?.availability ?? '—'}</td><td style={styles.td}>{item.data?.preferredProject ?? '—'}</td><td style={styles.td}>{label(item.source)}</td><td style={styles.td}><span style={{ ...statusStyle(item.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900, marginBottom: 8 }}>{label(item.status)}</span><select style={{ ...styles.input, minWidth: 140 }} value={normalizeStatus(item.status)} onChange={event => void updateStatus(item, normalizeStatus(event.target.value))}>{volunteerStatuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></td><td style={styles.td}>{formatDate(item.createdAt)}</td><td style={styles.td}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" style={styles.secondaryButton} onClick={() => startEdit(item)}>Edit</button><button type="button" style={styles.dangerButton} onClick={() => void deleteVolunteer(item)}>Delete</button></div></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
