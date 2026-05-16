import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type SupportRecord = {
  id: string
  storeId?: string
  source?: string
  status?: string
  priority?: string
  person?: { name?: string; email?: string | null; phone?: string | null }
  data?: {
    supportType?: string | null
    needSummary?: string | null
    location?: string | null
    householdSize?: string | null
    urgency?: string | null
    notes?: string | null
  }
  createdAt?: Timestamp | string | null
}

type SupportForm = {
  name: string
  phone: string
  email: string
  supportType: string
  needSummary: string
  location: string
  householdSize: string
  urgency: string
  status: string
  priority: string
  notes: string
}

const initialForm: SupportForm = {
  name: '',
  phone: '',
  email: '',
  supportType: '',
  needSummary: '',
  location: '',
  householdSize: '',
  urgency: 'normal',
  status: 'new',
  priority: 'normal',
  notes: '',
}

const styles = {
  page: { display: 'grid', gap: 22, color: '#0f172a' },
  hero: {
    borderRadius: 26,
    padding: '28px 30px',
    background: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 54%, #f97316 100%)',
    color: '#fff',
    boxShadow: '0 28px 70px -42px rgba(127, 29, 29, 0.8)',
  },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.78)' },
  title: { margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05, letterSpacing: '-0.04em' },
  subtitle: { margin: '12px 0 0', maxWidth: 830, color: 'rgba(255,255,255,0.84)', fontSize: 16, lineHeight: 1.65 },
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
  primaryButton: { border: 0, borderRadius: 14, padding: '12px 18px', background: 'linear-gradient(135deg, #b91c1c, #dc2626)', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 36px -24px rgba(185, 28, 28, 0.85)' },
  secondaryButton: { border: '1px solid #cbd5e1', borderRadius: 14, padding: '11px 16px', background: '#fff', color: '#334155', fontWeight: 850, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto' as const, borderRadius: 18, border: '1px solid #e2e8f0' },
  table: { width: '100%', minWidth: 1040, borderCollapse: 'collapse' as const },
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
  if (['approved', 'fulfilled', 'resolved'].includes(normalized)) return { background: '#dcfce7', color: '#166534' }
  if (['in_review', 'contacted', 'assigned'].includes(normalized)) return { background: '#fef3c7', color: '#92400e' }
  if (['urgent', 'high'].includes(normalized)) return { background: '#fee2e2', color: '#991b1b' }
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

export default function SupportRequests() {
  const { storeId } = useActiveStore()
  const [rows, setRows] = useState<SupportRecord[]>([])
  const [form, setForm] = useState<SupportForm>(initialForm)
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
      const snapshot = await getDocs(query(collection(db, 'support_requests'), where('storeId', '==', storeId), limit(200)))
      if (!active) return
      setRows(snapshot.docs
        .map(item => ({ id: item.id, ...(item.data() as Omit<SupportRecord, 'id'>) }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)))
    } catch (loadError) {
      console.error(loadError)
      if (active) setError('Unable to load support requests. Check Firestore rules and try again.')
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
    const urgent = rows.filter(item => ['urgent', 'high'].includes(item.priority ?? item.data?.urgency ?? '')).length
    return { total, website, manual, urgent }
  }, [rows])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId) return setError('Select a workspace before adding a support request.')
    const name = clean(form.name, 140)
    const phone = clean(form.phone, 60)
    const email = normalizeEmail(form.email)
    if (!name) return setError('Requester name is required.')
    if (!phone && !email) return setError('Enter at least one contact: phone or email.')
    if (!clean(form.supportType, 160)) return setError('Support type is required.')

    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      const now = serverTimestamp()
      await addDoc(collection(db, 'support_requests'), {
        storeId,
        pageType: 'support_request',
        source: 'manual_dashboard',
        status: clean(form.status, 80) || 'new',
        priority: clean(form.priority, 80) || clean(form.urgency, 80) || 'normal',
        person: { name, phone: phone || null, email: email || null },
        data: {
          supportType: clean(form.supportType, 160) || null,
          needSummary: clean(form.needSummary, 500) || null,
          location: clean(form.location, 160) || null,
          householdSize: clean(form.householdSize, 80) || null,
          urgency: clean(form.urgency, 80) || null,
          notes: clean(form.notes, 1000) || null,
        },
        createdAt: now,
        updatedAt: now,
      })
      setForm(initialForm)
      setMessage('Support request added.')
      await load(true)
    } catch (saveError) {
      console.error(saveError)
      setError('Unable to save support request. Check Firestore rules or try again.')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof SupportForm>(key: K, value: SupportForm[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>NGO workspace</p>
        <h1 style={styles.title}>Support requests</h1>
        <p style={styles.subtitle}>Track people requesting help from your NGO. Add requests manually or receive submissions from your website without using extra Vercel API routes.</p>
      </section>

      <section style={styles.statsGrid} aria-label="Support request summary">
        <StatCard labelText="Total requests" value={totals.total} accent="#dc2626" />
        <StatCard labelText="Website requests" value={totals.website} accent="#0284c7" />
        <StatCard labelText="Manual entries" value={totals.manual} accent="#7c3aed" />
        <StatCard labelText="Urgent / high" value={totals.urgent} accent="#ea580c" />
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Add support request manually</h2>
            <p style={styles.muted}>Use this for calls, walk-ins, WhatsApp requests, community outreach, and field officer reports.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGrid}>
            <label style={styles.label}>Requester name *<input style={styles.input} value={form.name} onChange={event => update('name', event.target.value)} placeholder="Full name" /></label>
            <label style={styles.label}>Phone<input style={styles.input} value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="+233..." /></label>
            <label style={styles.label}>Email<input style={styles.input} type="email" value={form.email} onChange={event => update('email', event.target.value)} placeholder="name@example.com" /></label>
            <label style={styles.label}>Support type *<input style={styles.input} value={form.supportType} onChange={event => update('supportType', event.target.value)} placeholder="Food, fees, medical, shelter" /></label>
            <label style={styles.label}>Location<input style={styles.input} value={form.location} onChange={event => update('location', event.target.value)} placeholder="Community / town" /></label>
            <label style={styles.label}>Household size<input style={styles.input} value={form.householdSize} onChange={event => update('householdSize', event.target.value)} placeholder="e.g. 4 people" /></label>
            <label style={styles.label}>Priority<select style={styles.input} value={form.priority} onChange={event => update('priority', event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label style={styles.label}>Status<select style={styles.input} value={form.status} onChange={event => update('status', event.target.value)}><option value="new">New</option><option value="in_review">In review</option><option value="contacted">Contacted</option><option value="assigned">Assigned</option><option value="fulfilled">Fulfilled</option><option value="rejected">Rejected</option></select></label>
          </div>
          <label style={{ ...styles.label, marginTop: 14 }}>Need summary<textarea style={{ ...styles.input, minHeight: 90, resize: 'vertical' }} rows={3} value={form.needSummary} onChange={event => update('needSummary', event.target.value)} placeholder="What support is needed?" /></label>
          <label style={{ ...styles.label, marginTop: 14 }}>Notes<textarea style={{ ...styles.input, minHeight: 90, resize: 'vertical' }} rows={3} value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
          <div style={styles.actions}>
            <button type="submit" style={{ ...styles.primaryButton, opacity: saving ? 0.65 : 1 }} disabled={saving}>{saving ? 'Saving…' : 'Add request'}</button>
            <button type="button" style={styles.secondaryButton} onClick={() => setForm(initialForm)} disabled={saving}>Clear form</button>
          </div>
          {message ? <p style={{ ...styles.alert, background: '#dcfce7', color: '#166534' }}>{message}</p> : null}
        </form>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div><h2 style={styles.cardTitle}>Latest support requests</h2><p style={styles.muted}>Website requests and manual entries appear here.</p></div>
          <button type="button" style={styles.secondaryButton} onClick={() => void load(true)} disabled={loading}>Refresh</button>
        </div>
        {loading ? <p style={styles.muted}>Loading support requests…</p> : null}
        {error ? <p style={{ ...styles.alert, background: '#fef2f2', color: '#b91c1c' }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24, textAlign: 'center', color: '#64748b' }}><strong style={{ color: '#334155' }}>No support requests yet.</strong><p style={{ margin: '6px 0 0' }}>Add one manually or connect your website request form.</p></div> : null}
        {rows.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Requester</th><th style={styles.th}>Type</th><th style={styles.th}>Summary</th><th style={styles.th}>Location</th><th style={styles.th}>Source</th><th style={styles.th}>Priority</th><th style={styles.th}>Status</th><th style={styles.th}>Date</th></tr></thead>
              <tbody>{rows.map(item => <tr key={item.id}><td style={styles.td}><strong style={{ color: '#0f172a' }}>{item.person?.name ?? 'Unnamed requester'}</strong><br /><small>{item.person?.phone ?? item.person?.email ?? 'No contact'}</small></td><td style={styles.td}>{item.data?.supportType ?? '—'}</td><td style={styles.td}>{item.data?.needSummary ?? '—'}</td><td style={styles.td}>{item.data?.location ?? '—'}</td><td style={styles.td}>{label(item.source)}</td><td style={styles.td}><span style={{ ...statusStyle(item.priority), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{label(item.priority)}</span></td><td style={styles.td}><span style={{ ...statusStyle(item.status), display: 'inline-flex', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{label(item.status)}</span></td><td style={styles.td}>{formatDate(item.createdAt)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
