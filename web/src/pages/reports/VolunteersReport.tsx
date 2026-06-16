import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
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

  const columns: ReportColumn<VolunteerRow>[] = [
    { key: 'volunteer', label: 'Volunteer', sortable: true, value: row => `${row.name} ${row.phone} ${row.email}`, render: row => <><strong>{row.name}</strong><br /><small>{row.phone || row.email || 'No contact'}</small></> },
    { key: 'skills', label: 'Skills', sortable: true, value: row => row.skills, render: row => row.skills || '—' },
    { key: 'availability', label: 'Availability', sortable: true, value: row => row.availability },
    { key: 'status', label: 'Status', sortable: true, value: row => row.status },
    { key: 'createdAt', label: 'Date', sortable: true, value: row => row.createdAt, render: row => formatDate(row.createdAt) },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Volunteers</p><h1>Volunteers report</h1><p className="workspace-muted">Volunteer applications, skills, availability, status, and CSV export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Total volunteers</span></article><article className="workspace-card"><strong>{totals.newRows}</strong><span>New applications</span></article><article className="workspace-card"><strong>{totals.active}</strong><span>Active/approved</span></article><article className="workspace-card"><strong>{statuses.length}</strong><span>Status groups</span></article></section>
      <ReportDataTable title="Volunteer details" subtitle="Filter by status and export data." rows={filtered} columns={columns} getRowKey={row => row.id} searchPlaceholder="Search volunteer, skills, availability, or status…" actions={<><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></>} filters={<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}</select>} />
    </div>
  )
}
