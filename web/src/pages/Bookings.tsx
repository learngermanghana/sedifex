import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './Bookings.css'

type BookingRecord = {
  id: string
  serviceId: string
  serviceName: string
  bookingDate: string | null
  bookingTime: string | null
  preferredBranch: string | null
  paymentAmount: string | null
  paymentMethod: string | null
  status: string
  bookingStatus: string
  syncStatus: string
  paymentStatus: string
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  createdAt: Date | null
  updatedAt: Date | null
  sourceLabel: string
  reference: string | null
  bookingId: string | null
  paymentReference: string | null
  duplicateMerged: boolean
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function pickTimestamp(data: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = data[key]
    if (value && typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
      return (value as Timestamp).toDate()
    }
  }
  return null
}

const normalizeStatus = (value: unknown, fallback = 'pending') =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback

const normalizePaymentStatus = (value: unknown) => {
  const normalized = normalizeStatus(value, 'pending')
  if (['success', 'confirmed', 'paid'].includes(normalized)) return 'paid'
  if (['payment_pending', 'pending'].includes(normalized)) return 'payment_pending'
  return normalized
}

const normalizeSource = (raw: unknown) => {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (value.includes('market')) return 'Sedifex Market'
  if (value.includes('website')) return 'Website'
  if (value.includes('manual')) return 'Manual'
  return 'Website'
}

const statusLabel = (status: string) => ({
  pending_approval: 'Needs approval',
  pending: 'Needs approval',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  deleted: 'Cancelled',
  manual_review: 'Manual review',
}[status] ?? 'Pending approval')

const paymentLabel = (status: string) => ({
  payment_pending: 'Payment pending',
  pending: 'Payment pending',
  manual_review: 'Manual review',
  paid: 'Paid',
}[status] ?? 'Payment pending')

const dateKey = (dateText: string | null) => (dateText ? new Date(dateText).toDateString() : '')

export default function Bookings() {
  const { storeId } = useActiveStore()
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'needs_action' | 'today' | 'upcoming' | 'all' | 'cancelled'>('needs_action')
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null)

  const hydrateBooking = useCallback((id: string, data: Record<string, unknown>, serviceMap: Map<string, string>) => {
    const nestedData = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : {}
    const customer = data.customer && typeof data.customer === 'object' ? (data.customer as Record<string, unknown>) : {}
    const serviceId = pickString(data, ['serviceId']) ?? '—'
    const snapshotA = data.pricingSnapshot && typeof data.pricingSnapshot === 'object' ? (data.pricingSnapshot as Record<string, unknown>) : {}
    const snapshotB = data.pricing_snapshot && typeof data.pricing_snapshot === 'object' ? (data.pricing_snapshot as Record<string, unknown>) : {}
    const pickSnapshotName = (snapshot: Record<string, unknown>) => {
      const items = snapshot.items
      if (!Array.isArray(items) || !items.length || typeof items[0] !== 'object' || !items[0]) return null
      const first = items[0] as Record<string, unknown>
      return typeof first.name === 'string' && first.name.trim() ? first.name.trim() : null
    }
    const serviceName =
      pickString(data, ['serviceName', 'itemName', 'productName']) ??
      pickString(nestedData, ['serviceName', 'itemName']) ??
      pickString(data, ['booking.serviceName']) ??
      pickSnapshotName(snapshotA) ??
      pickSnapshotName(snapshotB) ??
      serviceMap.get(serviceId) ??
      'Service not named'

    return {
      id,
      serviceId,
      serviceName,
      bookingDate: pickString(data, ['bookingDate', 'date']),
      bookingTime: pickString(data, ['bookingTime', 'time']),
      preferredBranch: pickString(data, ['preferredBranch', 'branch', 'location']),
      paymentAmount: pickString(data, ['paymentAmount', 'amount', 'total']),
      paymentMethod: pickString(data, ['paymentMethod']),
      bookingStatus: normalizeStatus(data.bookingStatus ?? data.status),
      status: normalizeStatus(data.status),
      syncStatus: normalizeStatus(data.syncStatus ?? data.sync_status, 'not_ready'),
      paymentStatus: normalizePaymentStatus(data.paymentStatus),
      customerName: pickString(data, ['customerName', 'name']) ?? pickString(customer, ['name']),
      customerPhone: pickString(data, ['customerPhone', 'phone']) ?? pickString(customer, ['phone']),
      customerEmail: pickString(data, ['customerEmail', 'email']) ?? pickString(customer, ['email']),
      createdAt: pickTimestamp(data, ['createdAt', 'createdAtServer', 'updatedAt', 'syncRequestedAt']),
      updatedAt: pickTimestamp(data, ['updatedAt']),
      sourceLabel: normalizeSource(data.sourceChannel ?? data.source_channel ?? data.source ?? data.channel),
      reference: pickString(data, ['reference']),
      bookingId: pickString(data, ['bookingId']),
      paymentReference: pickString(data, ['paymentReference']),
      duplicateMerged: false,
    } satisfies BookingRecord
  }, [])

  const loadBookings = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const serviceMap = new Map<string, string>()
      for (const collectionName of ['services', 'integrationServices']) {
        const servicesSnapshot = await getDocs(collection(db, 'stores', storeId, collectionName))
        servicesSnapshot.forEach(docSnap => {
          const data = docSnap.data() as Record<string, unknown>
          const name = pickString(data, ['name', 'title', 'serviceName'])
          if (name) serviceMap.set(docSnap.id, name)
        })
      }
      const [storeSnapshot, rootSnapshot] = await Promise.all([
        getDocs(collection(db, 'stores', storeId, 'integrationBookings')),
        getDocs(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId))),
      ])
      const merged = new Map<string, BookingRecord>()
      const makeKey = (b: BookingRecord) =>
        b.bookingId ||
        b.reference ||
        b.paymentReference ||
        `${(b.customerPhone || b.customerEmail || 'unknown').toLowerCase()}|${b.serviceId}|${b.bookingDate || ''}|${b.bookingTime || ''}`

      storeSnapshot.forEach(docSnap => {
        const booking = hydrateBooking(docSnap.id, docSnap.data() as Record<string, unknown>, serviceMap)
        merged.set(makeKey(booking), booking)
      })
      rootSnapshot.forEach(docSnap => {
        const booking = hydrateBooking(docSnap.id, docSnap.data() as Record<string, unknown>, serviceMap)
        const key = makeKey(booking)
        if (merged.has(key)) {
          const kept = merged.get(key)
          if (kept) merged.set(key, { ...kept, duplicateMerged: true })
          return
        }
        merged.set(key, booking)
      })

      setBookings(Array.from(merged.values()).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load bookings right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [hydrateBooking, storeId])

  useEffect(() => { void loadBookings() }, [loadBookings])

  const updateBooking = useCallback(async (booking: BookingRecord, updates: Record<string, unknown>) => {
    if (!storeId) return
    setUpdatingBookingId(booking.id)
    try {
      const payload = { ...updates, updatedAt: Timestamp.now() }
      await setDoc(doc(db, 'stores', storeId, 'integrationBookings', booking.id), payload, { merge: true })
      await setDoc(doc(db, 'integrationBookings', booking.id), payload, { merge: true })
      setBookings(prev => prev.map(b => (b.id === booking.id ? { ...b, ...updates } as BookingRecord : b)))
    } finally {
      setUpdatingBookingId(null)
    }
  }, [storeId])

  const todayStr = new Date().toDateString()
  const summary = {
    newToday: bookings.filter(b => b.createdAt?.toDateString() === todayStr).length,
    pending: bookings.filter(b => ['pending','pending_approval','manual_review'].includes(b.status) || b.bookingStatus === 'pending_approval').length,
    paymentPending: bookings.filter(b => ['pending', 'payment_pending', 'manual_review'].includes(b.paymentStatus)).length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => ['cancelled', 'deleted'].includes(b.status)).length,
  }

  const visible = useMemo(() => bookings.filter(b => {
    if (activeTab === 'all') return true
    if (activeTab === 'cancelled') return ['cancelled', 'deleted'].includes(b.status)
    if (activeTab === 'today') return dateKey(b.bookingDate) === todayStr
    if (activeTab === 'upcoming') {
      const d = b.bookingDate ? new Date(b.bookingDate) : null
      return !!d && d > new Date() && !['cancelled', 'deleted', 'completed'].includes(b.status)
    }
    return ['pending','pending_approval','manual_review'].includes(b.status) || b.bookingStatus === 'pending_approval' || ['pending', 'payment_pending', 'manual_review'].includes(b.paymentStatus)
  }), [activeTab, bookings, todayStr])

  const actionsFor = (b: BookingRecord) => {
    if (['completed', 'cancelled', 'deleted'].includes(b.status)) return ['open']
    const actions = ['open']
    if (['pending', 'pending_approval', 'manual_review'].includes(b.status) || b.bookingStatus === 'pending_approval') actions.push('confirm', 'cancel')
    if (b.status === 'confirmed') actions.push('reschedule', 'complete', 'cancel')
    if (['pending', 'payment_pending', 'manual_review'].includes(b.paymentStatus)) actions.push('mark_paid')
    return actions
  }

  return <main className="page bookings-page"><section className="card stack gap-4 bookings-board">
    <header className="stack gap-2">
      <h1>Bookings</h1>
      <p className="bookings-page__intro">Manage today’s bookings, payments, confirmations, and follow-ups.</p>
      <div className="bookings-page__row-actions">
        <Link to="/bookings/new" className="btn btn-secondary">Add booking</Link>
        <Link to="/bookings/availability" className="btn btn-secondary">Manage availability</Link>
        <Link to="/reports/bookings" className="btn btn-secondary">Open reports</Link>
      </div>
      <Link to="/reports/bookings" className="bookings-page__report-link">Need export/audit? Open bookings report</Link>
    </header>

    <div className="bookings-page__summary-grid">{[
      ['New today', summary.newToday], ['Pending approval', summary.pending], ['Payment pending', summary.paymentPending],
      ['Confirmed', summary.confirmed], ['Completed', summary.completed], ['Cancelled', summary.cancelled],
    ].map(([label, value]) => <article key={label as string} className="bookings-page__summary-card"><p>{label}</p><strong>{value as number}</strong></article>)}</div>

    <div className="bookings-page__tabs">{[
      ['needs_action', 'Needs action'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All'], ['cancelled', 'Cancelled'],
    ].map(([id,label]) => <button key={id} type="button" className={`bookings-page__tab ${activeTab===id?'is-active':''}`} onClick={() => setActiveTab(id as typeof activeTab)}>{label}</button>)}</div>

    {loading ? <p>Loading bookings…</p> : errorMessage ? <p className="form__error">{errorMessage}</p> : <div className="bookings-table-wrap"><table className="table bookings-table"><thead><tr><th>Booking</th><th>Customer</th><th>Schedule</th><th>Source</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map(b => {
      const acts = actionsFor(b)
      return <tr key={b.id}><td><strong>{b.serviceName}</strong><small>{b.reference || b.bookingId || 'No reference'}</small>{b.serviceName === 'Service not named' ? <small className="muted">Service ID: {b.serviceId}</small> : null}{b.duplicateMerged ? <span className="bookings-badge">Duplicate records merged</span> : null}</td><td><strong>{b.customerName || 'Customer'}</strong><small>{b.customerPhone || b.customerEmail || 'No contact'}</small></td><td><strong>{b.bookingDate || 'Date not set'}</strong><small>{b.bookingTime || 'Time not set'}</small><small>{b.preferredBranch || 'Main branch'}</small></td><td><span className="bookings-badge">{b.sourceLabel}</span></td><td><strong>{b.paymentAmount || '—'}</strong><small>{paymentLabel(b.paymentStatus)}</small><small>{b.paymentMethod || 'Method not set'}</small></td><td><span className={`bookings-page__status bookings-page__status--${b.bookingStatus}`}>{statusLabel(b.bookingStatus)}</span><small>{b.paymentStatus === 'paid' && b.bookingStatus !== 'confirmed' ? 'Paid - waiting for store confirmation' : ''}</small><small>{b.syncStatus === 'pending' ? 'Sync pending' : b.syncStatus === 'synced' ? 'Synced' : ''}</small></td><td><div className="bookings-page__row-actions"><Link className="btn btn-secondary" to={`/bookings/${b.id}`}>Open</Link>{acts.includes('confirm') && <button className="btn btn-secondary" onClick={() => void updateBooking(b,{bookingStatus:'confirmed',status:'confirmed',confirmedAt:Timestamp.now(),confirmedBy:'staff_admin',syncStatus:'pending',syncReason:'booking_confirmed',syncRequestedAt:Timestamp.now()})} disabled={updatingBookingId===b.id}>Confirm</button>}{acts.includes('mark_paid') && <button className="btn btn-secondary" onClick={() => void updateBooking(b,{paymentStatus:'paid'})} disabled={updatingBookingId===b.id}>Mark paid</button>}{acts.includes('reschedule') && <Link className="btn btn-secondary" to={`/bookings/${b.id}`}>Reschedule</Link>}{acts.includes('complete') && <button className="btn btn-secondary" onClick={() => void updateBooking(b,{bookingStatus:'completed',status:'completed',completedAt:Timestamp.now()})} disabled={updatingBookingId===b.id}>Complete</button>}{acts.includes('cancel') && <button className="btn btn-secondary" onClick={() => void updateBooking(b,{bookingStatus:'cancelled',status:'cancelled',cancelledAt:Timestamp.now(),syncStatus:'pending',syncReason:'booking_cancelled',syncRequestedAt:Timestamp.now()})} disabled={updatingBookingId===b.id}>Cancel</button>}</div></td></tr>
    })}</tbody></table><div className="bookings-cards">{visible.map(b => <article key={`${b.id}-card`} className="bookings-card"><h3>{b.serviceName}</h3><p>{b.customerName || 'Customer'} • {b.bookingDate || 'Date not set'} {b.bookingTime || ''}</p><p>{statusLabel(b.status)} • {paymentLabel(b.paymentStatus)}</p><Link className="btn btn-secondary" to={`/bookings/${b.id}`}>Open</Link></article>)}</div></div>}
  </section></main>
}
