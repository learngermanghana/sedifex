import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, toDate } from './reportUtils'

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

  function exportPdf() {
    exportReportPdf({
      title: 'Student registrations report',
      subtitle: 'Admissions and registration data from Sedifex and connected school websites.',
      summary: [
        { label: 'Registrations', value: totals.count },
        { label: 'Paid/confirmed', value: totals.paid },
        { label: 'Pending', value: totals.pending },
        { label: 'Registration value', value: formatMoney(totals.value) },
      ],
      rows: filtered.map(row => ({
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        course: row.course,
        startMonth: row.startMonth,
        paymentStatus: row.paymentStatus,
        amount: row.amount,
        reference: row.reference,
        createdAt: formatDate(row.createdAt),
      })),
    })
  }

  const columns: ReportColumn<RegistrationRow>[] = [
    { key: 'student', label: 'Student', sortable: true, value: row => `${row.fullName} ${row.phone} ${row.email}`, render: row => <><strong>{row.fullName}</strong><br /><small>{row.phone || row.email || 'No contact'}</small></> },
    { key: 'course', label: 'Course', sortable: true, value: row => row.course },
    { key: 'startMonth', label: 'Start', sortable: true, value: row => row.startMonth },
    { key: 'paymentStatus', label: 'Payment', sortable: true, value: row => row.paymentStatus },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, value: row => row.amount, render: row => formatMoney(row.amount) },
    { key: 'reference', label: 'Reference', sortable: true, value: row => row.reference },
    { key: 'createdAt', label: 'Date', sortable: true, value: row => row.createdAt, render: row => formatDate(row.createdAt) },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Student registrations</p><h1>Student registrations report</h1><p className="workspace-muted">Admissions data from Sedifex student registration and connected school websites.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Registrations</span></article><article className="workspace-card"><strong>{totals.paid}</strong><span>Paid/confirmed</span></article><article className="workspace-card"><strong>{totals.pending}</strong><span>Pending</span></article><article className="workspace-card"><strong>{formatMoney(totals.value)}</strong><span>Registration value</span></article></section>
      <ReportDataTable title="Registration details" subtitle="Filter by course and export data." rows={filtered} columns={columns} getRowKey={row => row.id} searchPlaceholder="Search student, course, payment, or reference…" actions={<><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></>} filters={<select value={course} onChange={event => setCourse(event.target.value)}><option value="all">All courses</option>{courses.map(name => <option key={name} value={name}>{name}</option>)}</select>} />
    </div>
  )
}
