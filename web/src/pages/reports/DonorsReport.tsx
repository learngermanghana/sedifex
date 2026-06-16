import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, toDate } from './reportUtils'

type DonorRow = {
  id: string
  name: string
  email: string
  phone: string
  lifetimeGiving: number
  lastGiftAmount: number
  lastGiftDate: string
  status: string
  createdAt: Date | null
}

function mapDonor(id: string, data: Record<string, unknown>): DonorRow {
  const contact = getNestedObject(data, 'contact')
  return {
    id,
    name: asText(data.name ?? data.fullName ?? contact.name, 'Donor'),
    email: asText(data.email ?? contact.email, ''),
    phone: asText(data.phone ?? contact.phone, ''),
    lifetimeGiving: asNumber(data.lifetimeGiving ?? data.totalGiving, 0),
    lastGiftAmount: asNumber(data.lastGiftAmount, 0),
    lastGiftDate: asText(data.lastGiftDate, '—'),
    status: asText(data.status, 'active'),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

export default function DonorsReport() {
  const { storeId } = useActiveStore()
  const [donors, setDonors] = useState<DonorRow[]>([])
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setDonors([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'donor_profiles'), where('storeId', '==', storeId)), snapshot => {
      setDonors(snapshot.docs.map(docSnap => mapDonor(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const statuses = useMemo(() => [...new Set(donors.map(row => row.status).filter(Boolean))], [donors])
  const filtered = useMemo(() => status === 'all' ? donors : donors.filter(row => row.status === status), [donors, status])
  const totals = useMemo(() => ({
    count: filtered.length,
    lifetimeGiving: filtered.reduce((sum, row) => sum + row.lifetimeGiving, 0),
    averageGiving: filtered.length ? filtered.reduce((sum, row) => sum + row.lifetimeGiving, 0) / filtered.length : 0,
    active: filtered.filter(row => row.status === 'active').length,
  }), [filtered])

  const reportRows = filtered.map(row => ({
    name: row.name,
    email: row.email,
    phone: row.phone,
    lifetimeGiving: row.lifetimeGiving,
    lastGiftAmount: row.lastGiftAmount,
    lastGiftDate: row.lastGiftDate,
    status: row.status,
    createdAt: formatDate(row.createdAt),
  }))

  function exportRows() {
    downloadCsv('sedifex-donors-report.csv', reportRows)
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Donors report',
      subtitle: 'Donor profiles, giving totals, status, and contact details.',
      summary: [
        { label: 'Donors', value: totals.count },
        { label: 'Lifetime giving', value: formatMoney(totals.lifetimeGiving) },
        { label: 'Average giving', value: formatMoney(totals.averageGiving) },
        { label: 'Active donors', value: totals.active },
      ],
      rows: reportRows,
    })
  }

  const columns: ReportColumn<DonorRow>[] = [
    { key: 'donor', label: 'Donor', sortable: true, value: row => `${row.name} ${row.email} ${row.phone}`, render: row => <strong>{row.name}</strong> },
    { key: 'contact', label: 'Contact', value: row => `${row.phone} ${row.email}`, render: row => <>{row.phone || '—'}<br /><small>{row.email || 'No email'}</small></> },
    { key: 'lifetimeGiving', label: 'Lifetime giving', align: 'right', sortable: true, value: row => row.lifetimeGiving, render: row => formatMoney(row.lifetimeGiving) },
    { key: 'lastGift', label: 'Last gift', align: 'right', sortable: true, value: row => row.lastGiftAmount, render: row => <>{formatMoney(row.lastGiftAmount)}<br /><small>{row.lastGiftDate}</small></> },
    { key: 'status', label: 'Status', sortable: true, value: row => row.status },
    { key: 'createdAt', label: 'Created', sortable: true, value: row => row.createdAt, render: row => formatDate(row.createdAt) },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Donors</p><h1>Donors report</h1><p className="workspace-muted">Donor profiles, lifetime giving, contacts, status, CSV export, and PDF export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Donors</span></article><article className="workspace-card"><strong>{formatMoney(totals.lifetimeGiving)}</strong><span>Lifetime giving</span></article><article className="workspace-card"><strong>{formatMoney(totals.averageGiving)}</strong><span>Average giving</span></article><article className="workspace-card"><strong>{totals.active}</strong><span>Active donors</span></article></section>
      <ReportDataTable title="Donor details" subtitle="Filter by status and export donor data." rows={filtered} columns={columns} getRowKey={row => row.id} searchPlaceholder="Search donor, contact, or status…" actions={<><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></>} filters={<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}</select>} />
    </div>
  )
}
