import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asText, downloadCsv, exportReportPdf, formatDate, getNestedObject, toDate } from './reportUtils'

type VolunteerRow = {
  id: string
  name: string
  phone: string
  email: string
  skills: string
  availability: string
  status: string
  createdAt: Date | null
}

function mapVolunteer(id: string, data: Record<string, unknown>): VolunteerRow {
  const person = getNestedObject(data, 'person')
  const skills = Array.isArray(data.skills) ? data.skills.join(', ') : asText(data.skills, '')
  return {
    id,
    name: asText(data.name ?? person.name ?? data.fullName, 'Volunteer'),
    phone: asText(data.phone ?? person.phone, ''),
    email: asText(data.email ?? person.email, ''),
    skills,
    availability: asText(data.availability ?? data.preferredAvailability, '—'),
    status: asText(data.status, 'new'),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

export default function VolunteersReport() {
  const { storeId } = useActiveStore()
  const [rows, setRows] = useState<VolunteerRow[]>([])
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setRows([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'volunteer_applications'), where('storeId', '==', storeId)), snapshot => {
      setRows(snapshot.docs.map(docSnap => mapVolunteer(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const statuses = useMemo(() => [...new Set(rows.map(row => row.status).filter(Boolean))], [rows])
  const filtered = useMemo(() => status === 'all' ? rows : rows.filter(row => row.status === status), [rows, status])
  const totals = useMemo(() => ({ count: filtered.length, newRows: filtered.filter(row => row.status === 'new').length, active: filtered.filter(row => ['active', 'approved', 'confirmed'].includes(row.status)).length }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-volunteers-report.csv', filtered.map(row => ({ name: row.name, phone: row.phone, email: row.email, skills: row.skills, availability: row.availability, status: row.status, createdAt: formatDate(row.createdAt) })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Volunteers report',
      subtitle: 'Volunteer applications, skills, availability, and status tracking.',
      summary: [
        { label: 'Total volunteers', value: totals.count },
        { label: 'New applications', value: totals.newRows },
        { label: 'Active/approved', value: totals.active },
        { label: 'Status groups', value: statuses.length },
      ],
      rows: filtered.map(row => ({ name: row.name, phone: row.phone, email: row.email, skills: row.skills, availability: row.availability, status: row.status, createdAt: formatDate(row.createdAt) })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Volunteers</p><h1>Volunteers report</h1><p className="workspace-muted">Volunteer applications, skills, availability, status, and CSV export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Total volunteers</span></article><article className="workspace-card"><strong>{totals.newRows}</strong><span>New applications</span></article><article className="workspace-card"><strong>{totals.active}</strong><span>Active/approved</span></article><article className="workspace-card"><strong>{statuses.length}</strong><span>Status groups</span></article></section>
      <section className="workspace-card"><div className="workspace-section-header"><div><h2>Volunteer details</h2><p className="workspace-muted">Filter by status and export data.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></div></div><div className="workspace-toolbar"><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Volunteer</th><th>Skills</th><th>Availability</th><th>Status</th><th>Date</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.name}</strong><br /><small>{row.phone || row.email || 'No contact'}</small></td><td>{row.skills || '—'}</td><td>{row.availability}</td><td>{row.status}</td><td>{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div></section>
    </div>
  )
}
