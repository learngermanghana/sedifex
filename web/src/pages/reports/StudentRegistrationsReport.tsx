import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, formatDate, formatMoney, getNestedObject, toDate } from './reportUtils'

type RegistrationRow = {
  id: string
  fullName: string
  phone: string
  email: string
  course: string
  startMonth: string
  paymentStatus: string
  amount: number
  reference: string
  createdAt: Date | null
}

function mapRegistration(id: string, data: Record<string, unknown>): RegistrationRow {
  const student = getNestedObject(data, 'student')
  const payment = getNestedObject(data, 'payment')
  return {
    id,
    fullName: asText(data.fullName ?? student.fullName ?? student.name, 'Student'),
    phone: asText(data.phone ?? student.phone, ''),
    email: asText(data.email ?? student.email, ''),
    course: asText(data.course ?? data.courseName ?? student.course, 'Course not set'),
    startMonth: asText(data.startMonth ?? data.preferredStartDate ?? student.startMonth, '—'),
    paymentStatus: asText(data.paymentStatus ?? payment.status, 'pending'),
    amount: asNumber(data.amount ?? payment.amount, 0),
    reference: asText(data.reference ?? data.paymentReference ?? payment.reference, id),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

export default function StudentRegistrationsReport() {
  const { storeId } = useActiveStore()
  const [rows, setRows] = useState<RegistrationRow[]>([])
  const [course, setCourse] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setRows([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'student_registrations'), where('storeId', '==', storeId)), snapshot => {
      setRows(snapshot.docs.map(docSnap => mapRegistration(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const courses = useMemo(() => [...new Set(rows.map(row => row.course).filter(Boolean))], [rows])
  const filtered = useMemo(() => course === 'all' ? rows : rows.filter(row => row.course === course), [course, rows])
  const totals = useMemo(() => ({
    count: filtered.length,
    paid: filtered.filter(row => ['paid', 'success', 'confirmed'].some(token => row.paymentStatus.toLowerCase().includes(token))).length,
    pending: filtered.filter(row => row.paymentStatus.toLowerCase().includes('pending')).length,
    value: filtered.reduce((sum, row) => sum + row.amount, 0),
  }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-student-registrations-report.csv', filtered.map(row => ({
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      course: row.course,
      startMonth: row.startMonth,
      paymentStatus: row.paymentStatus,
      amount: row.amount,
      reference: row.reference,
      createdAt: formatDate(row.createdAt),
    })))
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Student registrations</p><h1>Student registrations report</h1><p className="workspace-muted">Admissions data from Sedifex student registration and connected school websites.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Registrations</span></article><article className="workspace-card"><strong>{totals.paid}</strong><span>Paid/confirmed</span></article><article className="workspace-card"><strong>{totals.pending}</strong><span>Pending</span></article><article className="workspace-card"><strong>{formatMoney(totals.value)}</strong><span>Registration value</span></article></section>
      <section className="workspace-card"><div className="workspace-section-header"><div><h2>Registration details</h2><p className="workspace-muted">Filter by course and export CSV.</p></div><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></div><div className="workspace-toolbar"><select value={course} onChange={event => setCourse(event.target.value)}><option value="all">All courses</option>{courses.map(name => <option key={name} value={name}>{name}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Student</th><th>Course</th><th>Start</th><th>Payment</th><th>Amount</th><th>Reference</th><th>Date</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.fullName}</strong><br /><small>{row.phone || row.email || 'No contact'}</small></td><td>{row.course}</td><td>{row.startMonth}</td><td>{row.paymentStatus}</td><td>{formatMoney(row.amount)}</td><td>{row.reference}</td><td>{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div></section>
    </div>
  )
}
