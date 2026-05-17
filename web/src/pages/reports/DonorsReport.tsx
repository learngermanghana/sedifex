import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
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

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Donors</p><h1>Donors report</h1><p className="workspace-muted">Donor profiles, lifetime giving, contacts, status, CSV export, and PDF export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Donors</span></article><article className="workspace-card"><strong>{formatMoney(totals.lifetimeGiving)}</strong><span>Lifetime giving</span></article><article className="workspace-card"><strong>{formatMoney(totals.averageGiving)}</strong><span>Average giving</span></article><article className="workspace-card"><strong>{totals.active}</strong><span>Active donors</span></article></section>
      <section className="workspace-card"><div className="workspace-section-header"><div><h2>Donor details</h2><p className="workspace-muted">Filter by status and export donor data.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></div></div><div className="workspace-toolbar"><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Donor</th><th>Contact</th><th>Lifetime giving</th><th>Last gift</th><th>Status</th><th>Created</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.phone || '—'}<br /><small>{row.email || 'No email'}</small></td><td>{formatMoney(row.lifetimeGiving)}</td><td>{formatMoney(row.lastGiftAmount)}<br /><small>{row.lastGiftDate}</small></td><td>{row.status}</td><td>{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div></section>
    </div>
  )
}
