import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  sourceLabel: string
  sourcePath: 'root' | 'store'
  bookingDate: string
  bookingTime: string
  paymentStatus: string
  bookingStatus: string
  syncStatus: string
  syncReason: string
  reminderStatus: string
  confirmedAt: Date | null
  cancelledAt: Date | null
  completedAt: Date | null
  registrationStatus: string
  slotStartAt: string
  slotEndAt: string
  amount: number
  createdAt: Date | null
}

function sourceLabel(sourceChannel: string) {
  if (sourceChannel === 'client_website') return 'Client website'
  if (sourceChannel === 'sedifex_market') return 'Sedifex Market'
  if (sourceChannel === 'sedifex_custom_page') return 'Sedifex public page'
  if (sourceChannel === 'manual_admin') return 'Manual/admin'
  return sourceChannel.replace(/_/g, ' ')
}

function normalizeStatus(value: unknown, fallback = 'pending') {
  const raw = asText(value, fallback).toLowerCase().replace(/\s+/g, '_')
  if (['paid', 'success', 'succeeded', 'confirmed', 'complete'].includes(raw)) return raw === 'confirmed' ? 'confirmed' : 'paid'
  if (raw === 'canceled') return 'cancelled'
  return raw || fallback
}

function readReminderStatus(data: Record<string, unknown>) {
  const reminder3 = data.reminder_3d_sent_at || data.reminder3dSentAt
  const reminder2 = data.reminder_2d_sent_at || data.reminder2dSentAt
  const reminder1 = data.reminder_1d_sent_at || data.reminder1dSentAt
  const thankYou = data.thank_you_sent_at || data.thankYouSentAt
  const sent = [reminder3 ? '3d' : '', reminder2 ? '2d' : '', reminder1 ? '1d' : '', thankYou ? 'thanks' : ''].filter(Boolean)
  return sent.length ? sent.join(', ') : 'Not sent'
}

function mapBooking(id: string, data: Record<string, unknown>, sourcePath: 'root' | 'store'): BookingRow {
  const customer = getNestedObject(data, 'customer')
  const booking = getNestedObject(data, 'booking')
  const payment = getNestedObject(data, 'payment')
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? data.source)
  const paymentStatus = payment.confirmed === true ? 'paid' : normalizeStatus(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending')
  return {
    id,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference ?? payment.reference, id),
    serviceName: asText(data.serviceName ?? data.internalServiceName ?? booking.serviceName ?? data.itemName ?? data.productName, 'Service booking'),
    recordType: asText(data.recordType ?? data.listingType, 'booking'),
    customerName: asText(customer.name ?? data.customerName ?? data.name ?? data.fullName, 'Customer'),
    customerPhone: asText(customer.phone ?? customer.email ?? data.customerPhone ?? data.phone ?? data.email, ''),
    sourceChannel,
    sourceLabel: sourceLabel(sourceChannel),
    sourcePath,
    bookingDate: asText(data.bookingDate ?? data.date ?? booking.preferredDate ?? booking.date, '—'),
    bookingTime: asText(data.bookingTime ?? data.time ?? booking.preferredTime ?? booking.time, '—'),
    paymentStatus,
    bookingStatus: normalizeStatus(data.bookingStatus ?? data.status, 'pending'),
    syncStatus: normalizeStatus(data.syncStatus ?? data.sync_status, 'not_ready'),
    syncReason: asText(data.syncReason ?? data.sync_reason, '—'),
    reminderStatus: readReminderStatus(data),
    confirmedAt: toDate(data.confirmedAt ?? data.paymentConfirmedAt ?? data.payment_confirmed_at),
    cancelledAt: toDate(data.cancelledAt ?? data.cancelled_at),
    completedAt: toDate(data.completedAt ?? data.completed_at),
    registrationStatus: asText(data.registrationStatus, '—'),
    slotStartAt: asText(data.startAt ?? booking.startAt, '—'),
    slotEndAt: asText(data.endAt ?? booking.endAt, '—'),
    amount: asNumber(payment.amount ?? data.paymentAmount ?? data.amount ?? data.total, 0),
    createdAt: toDate(data.createdAtServer ?? data.createdAt ?? data.updatedAt),
  }
}

function startForRange(range: string) {
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  if (range === 'yesterday') {
    start.setDate(now.getDate() - 1)
    start.setHours(0, 0, 0, 0)
  }
  if (range === '7d') start.setDate(now.getDate() - 7)
  if (range === '30d') start.setDate(now.getDate() - 30)
  if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }
  if (range === 'last_month') {
    start.setMonth(now.getMonth() - 1, 1)
    start.setHours(0, 0, 0, 0)
  }
  return start
}

function endForRange(range: string) {
  const now = new Date()
  if (range === 'yesterday') {
    const end = new Date(now)
    end.setHours(0, 0, 0, 0)
    return end
  }
  if (range === 'last_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return now
}

function inDateRange(date: Date | null, range: string) {
  if (range === 'all') return true
  if (!date) return false
  const start = startForRange(range)
  const end = endForRange(range)
  return date >= start && date <= end
}

function isPaidLike(status: string) {
  return ['paid', 'success', 'confirmed', 'completed'].some(token => status.toLowerCase().includes(token))
}

export default function BookingsReport() {
  const { storeId } = useActiveStore()
  const [rootBookings, setRootBookings] = useState<BookingRow[]>([])
  const [storeBookings, setStoreBookings] = useState<BookingRow[]>([])
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [sync, setSync] = useState('all')
  const [range, setRange] = useState('30d')

  useEffect(() => {
    if (!storeId) {
      setRootBookings([])
      setStoreBookings([])
      return undefined
    }
    const unsubRoot = onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => {
      setRootBookings(snapshot.docs.map(docSnap => mapBooking(docSnap.id, docSnap.data() as Record<string, unknown>, 'root')))
    })
    const unsubStore = onSnapshot(collection(db, 'stores', storeId, 'integrationBookings'), snapshot => {
      setStoreBookings(snapshot.docs.map(docSnap => mapBooking(docSnap.id, docSnap.data() as Record<string, unknown>, 'store')))
    })
    return () => {
      unsubRoot()
      unsubStore()
    }
  }, [storeId])

  const bookings = useMemo(() => {
    const merged = new Map<string, BookingRow>()
    rootBookings.forEach(row => merged.set(row.id, row))
    storeBookings.forEach(row => merged.set(row.id, { ...merged.get(row.id), ...row, sourcePath: merged.has(row.id) ? 'store' : row.sourcePath }))
    return Array.from(merged.values()).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }, [rootBookings, storeBookings])

  const filtered = useMemo(() => bookings.filter(booking => {
    const statusOk = status === 'all' || booking.bookingStatus === status || booking.paymentStatus === status
    const sourceOk = source === 'all' || booking.sourceChannel === source
    const syncOk = sync === 'all' || booking.syncStatus === sync
    const dateOk = inDateRange(booking.createdAt, range)
    return statusOk && sourceOk && syncOk && dateOk
  }), [bookings, range, source, status, sync])

  const totals = useMemo(() => ({
    count: filtered.length,
    paid: filtered.filter(booking => isPaidLike(booking.paymentStatus)).length,
    pending: filtered.filter(booking => booking.paymentStatus.includes('pending') || booking.bookingStatus.includes('pending')).length,
    confirmed: filtered.filter(booking => booking.bookingStatus === 'confirmed').length,
    cancelled: filtered.filter(booking => booking.bookingStatus === 'cancelled').length,
    completed: filtered.filter(booking => booking.bookingStatus === 'completed').length,
    syncPending: filtered.filter(booking => booking.syncStatus === 'pending').length,
    synced: filtered.filter(booking => booking.syncStatus === 'synced').length,
    value: filtered.reduce((sum, booking) => sum + booking.amount, 0),
  }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-bookings-report.csv', filtered.map(booking => ({
      reference: booking.reference,
      serviceName: booking.serviceName,
      recordType: booking.recordType,
      customer: booking.customerName,
      contact: booking.customerPhone,
      source: booking.sourceLabel,
      sourcePath: booking.sourcePath,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus,
      syncStatus: booking.syncStatus,
      syncReason: booking.syncReason,
      reminderStatus: booking.reminderStatus,
      confirmedAt: formatDate(booking.confirmedAt),
      cancelledAt: formatDate(booking.cancelledAt),
      completedAt: formatDate(booking.completedAt),
      amount: booking.amount,
      createdAt: formatDate(booking.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Bookings report',
      subtitle: 'Service, class, appointment, and website bookings with payment, source, sync, and reminder status.',
      summary: [
        { label: 'Total bookings', value: totals.count },
        { label: 'Confirmed', value: totals.confirmed },
        { label: 'Sync pending', value: totals.syncPending },
        { label: 'Booking value', value: formatMoney(totals.value) },
      ],
      rows: filtered.map(booking => ({
        reference: booking.reference,
        serviceName: `${booking.serviceName} (${booking.recordType})`,
        customer: booking.customerName,
        source: booking.sourceLabel,
        bookingDate: booking.bookingDate,
        bookingTime: booking.bookingTime,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        syncStatus: booking.syncStatus,
        reminderStatus: booking.reminderStatus,
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
        <p className="workspace-muted">Track Sedifex Market, website, and manual bookings with payment, confirmation, App Script sync, and reminder status.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.count}</strong><span>Total bookings</span></article>
        <article className="workspace-card"><strong>{totals.confirmed}</strong><span>Confirmed</span></article>
        <article className="workspace-card"><strong>{totals.syncPending}</strong><span>Sync pending</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.value)}</strong><span>Booking value</span></article>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.pending}</strong><span>Pending</span></article>
        <article className="workspace-card"><strong>{totals.paid}</strong><span>Paid</span></article>
        <article className="workspace-card"><strong>{totals.cancelled}</strong><span>Cancelled</span></article>
        <article className="workspace-card"><strong>{totals.completed}</strong><span>Completed</span></article>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Booking details</h2><p className="workspace-muted">Filter by date, source, status, and sync state. Open any booking for action.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="last_month">Last month</option>
            <option value="all">All time</option>
          </select>
          <select value={source} onChange={event => setSource(event.target.value)}>
            <option value="all">All sources</option>
            <option value="sedifex_market">Sedifex Market</option>
            <option value="client_website">Client website</option>
            <option value="sedifex_custom_page">Sedifex public page</option>
            <option value="manual_admin">Manual/admin</option>
          </select>
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select value={sync} onChange={event => setSync(event.target.value)}>
            <option value="all">All sync states</option>
            <option value="pending">Sync pending</option>
            <option value="synced">Synced</option>
            <option value="not_ready">Not ready / not configured</option>
          </select>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Service/Course/Event</th>
                <th>Customer</th>
                <th>Source</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Sync / reminders</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(booking => (
                <tr key={booking.id}>
                  <td>{booking.reference}<br /><small>{formatDate(booking.createdAt)}</small></td>
                  <td>{booking.serviceName}<br /><small>{booking.recordType}</small></td>
                  <td><strong>{booking.customerName}</strong><br /><small>{booking.customerPhone || 'No contact'}</small></td>
                  <td>{booking.sourceLabel}<br /><small>{booking.sourcePath === 'root' ? 'Root record' : 'Store record'}</small></td>
                  <td>{booking.bookingDate}<br /><small>{booking.bookingTime}</small><br /><small>{booking.slotStartAt !== '—' ? `${booking.slotStartAt} - ${booking.slotEndAt}` : 'No slot'}</small></td>
                  <td>{booking.bookingStatus}<br /><small>Payment: {booking.paymentStatus}</small><br /><small>{booking.registrationStatus}</small></td>
                  <td>{booking.syncStatus}<br /><small>{booking.syncReason}</small><br /><small>Reminders: {booking.reminderStatus}</small></td>
                  <td>{formatMoney(booking.amount)}</td>
                  <td><Link className="btn btn-secondary" to={`/bookings/${booking.id}`}>Open</Link></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={9}>No booking records found for this filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
