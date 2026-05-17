import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, normalizeSourceChannel, toDate } from './reportUtils'

type BookingRow = {
  id: string
  reference: string
  serviceName: string
  recordType: string
  customerName: string
  customerPhone: string
  sourceChannel: string
  bookingDate: string
  bookingTime: string
  paymentStatus: string
  bookingStatus: string
  registrationStatus: string
  slotStartAt: string
  slotEndAt: string
  amount: number
  createdAt: Date | null
}

function mapBooking(id: string, data: Record<string, unknown>): BookingRow {
  const customer = getNestedObject(data, 'customer')
  const booking = getNestedObject(data, 'booking')
  const payment = getNestedObject(data, 'payment')
  return {
    id,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, id),
    serviceName: asText(data.serviceName ?? booking.serviceName, 'Service booking'),
    recordType: asText(data.recordType ?? data.listingType, 'booking'),
    customerName: asText(customer.name ?? data.customerName, 'Customer'),
    customerPhone: asText(customer.phone ?? customer.email ?? data.customerPhone, ''),
    sourceChannel: normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? data.source),
    bookingDate: asText(data.bookingDate ?? booking.preferredDate, '—'),
    bookingTime: asText(data.bookingTime ?? booking.preferredTime, '—'),
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    bookingStatus: asText(data.bookingStatus ?? data.status, 'pending'),
    registrationStatus: asText(data.registrationStatus, '—'),
    slotStartAt: asText(data.startAt ?? booking.startAt, '—'),
    slotEndAt: asText(data.endAt ?? booking.endAt, '—'),
    amount: asNumber(payment.amount ?? data.amount ?? data.total, 0),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

export default function BookingsReport() {
  const { storeId } = useActiveStore()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setBookings([])
      return undefined
    }
    const unsubscribers = [
      onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => {
        const rootRows = snapshot.docs.map(docSnap => mapBooking(docSnap.id, docSnap.data() as Record<string, unknown>))
        setBookings(rootRows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [storeId])

  const filtered = useMemo(() => status === 'all' ? bookings : bookings.filter(booking => booking.bookingStatus === status || booking.paymentStatus === status), [bookings, status])
  const totals = useMemo(() => ({
    count: filtered.length,
    paid: filtered.filter(booking => ['paid', 'success', 'confirmed', 'completed'].some(token => booking.paymentStatus.toLowerCase().includes(token))).length,
    pending: filtered.filter(booking => booking.paymentStatus.toLowerCase().includes('pending') || booking.bookingStatus.toLowerCase().includes('pending')).length,
    value: filtered.reduce((sum, booking) => sum + booking.amount, 0),
  }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-bookings-report.csv', filtered.map(booking => ({
      reference: booking.reference,
      serviceName: booking.serviceName,
      recordType: booking.recordType,
      customer: booking.customerName,
      contact: booking.customerPhone,
      source: booking.sourceChannel,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus,
      registrationStatus: booking.registrationStatus,
      slotStartAt: booking.slotStartAt,
      slotEndAt: booking.slotEndAt,
      amount: booking.amount,
      createdAt: formatDate(booking.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Bookings report',
      subtitle: 'Service, class, appointment, and website bookings with payment and schedule details.',
      summary: [
        { label: 'Total bookings', value: totals.count },
        { label: 'Paid/confirmed', value: totals.paid },
        { label: 'Pending', value: totals.pending },
        { label: 'Booking value', value: formatMoney(totals.value) },
      ],
      rows: filtered.map(booking => ({
        reference: booking.reference,
        serviceName: `${booking.serviceName} (${booking.recordType})`,
        customer: booking.customerName,
        contact: booking.customerPhone,
        source: booking.sourceChannel,
        bookingDate: booking.bookingDate,
        bookingTime: booking.bookingTime,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        registrationStatus: booking.registrationStatus,
        slotStartAt: booking.slotStartAt,
        slotEndAt: booking.slotEndAt,
        amount: booking.amount,
        createdAt: formatDate(booking.createdAt),
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Bookings</p>
        <h1>Bookings report</h1>
        <p className="workspace-muted">Detailed service, class, appointment, and website booking records with CSV export.</p>
      </section>
      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.count}</strong><span>Total bookings</span></article>
        <article className="workspace-card"><strong>{totals.paid}</strong><span>Paid/confirmed</span></article>
        <article className="workspace-card"><strong>{totals.pending}</strong><span>Pending</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.value)}</strong><span>Booking value</span></article>
      </section>
      <section className="workspace-card">
        <div className="workspace-section-header"><div><h2>Booking details</h2><p className="workspace-muted">Filter status and export data.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></div></div>
        <div className="workspace-toolbar"><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="success">Paid</option><option value="completed">Completed</option></select></div>
        <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Reference</th><th>Service/Course/Event</th><th>Customer</th><th>Schedule</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead><tbody>{filtered.map(booking => <tr key={booking.id}><td>{booking.reference}</td><td>{booking.serviceName}<br /><small>{booking.recordType}</small></td><td><strong>{booking.customerName}</strong><br /><small>{booking.customerPhone || 'No contact'}</small></td><td>{booking.bookingDate}<br /><small>{booking.bookingTime}</small><br /><small>{booking.slotStartAt !== '—' ? `${booking.slotStartAt} - ${booking.slotEndAt}` : 'No slot'}</small></td><td>{booking.bookingStatus}<br /><small>{booking.registrationStatus}</small><br /><small>{booking.paymentStatus}</small></td><td>{formatMoney(booking.amount)}</td><td>{formatDate(booking.createdAt)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  )
}
