import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './BookingEditor.css'

type BookingFormState = {
  fullName: string
  phone: string
  email: string
  serviceName: string
  serviceId: string
  bookingDate: string
  bookingTime: string
  preferredBranch: string
  preferredContactMethod: string
  status: string
  quantity: string
  notes: string
  paymentAmount: string
  depositAmount: string
  paymentMethod: string
}

const DEFAULT_FORM: BookingFormState = {
  fullName: '',
  phone: '',
  email: '',
  serviceName: '',
  serviceId: '',
  bookingDate: '',
  bookingTime: '',
  preferredBranch: '',
  preferredContactMethod: '',
  status: 'confirmed',
  quantity: '1',
  notes: '',
  paymentAmount: '',
  depositAmount: '',
  paymentMethod: '',
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}


function normalizeDateInput(value: unknown): string {
  const raw = stringValue(value).trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function normalizeTimeInput(value: unknown): string {
  const raw = stringValue(value).trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '').toLowerCase()
  const ampm = compact.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/)
  if (ampm) {
    const hour12 = Number.parseInt(ampm[1], 10)
    const minute = Number.parseInt(ampm[2] ?? '0', 10)
    if (hour12 >= 1 && hour12 <= 12 && minute >= 0 && minute <= 59) {
      const hour24 = hour12 % 12 + (ampm[3] === 'pm' ? 12 : 0)
      return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }
  }
  const hhmm = compact.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) {
    const hour = Number.parseInt(hhmm[1], 10)
    const minute = Number.parseInt(hhmm[2], 10)
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }
  }
  return ''
}
export default function BookingEditor() {
  const { storeId } = useActiveStore()
  const { bookingId = 'new' } = useParams()
  const navigate = useNavigate()
  const isCreateMode = bookingId === 'new'
  const [form, setForm] = useState<BookingFormState>(DEFAULT_FORM)
  const [loading, setLoading] = useState(!isCreateMode)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId || isCreateMode) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function loadBooking() {
      setLoading(true)
      setErrorMessage(null)
      try {
        const bookingRef = doc(db, 'stores', storeId, 'integrationBookings', bookingId)
        const snap = await getDoc(bookingRef)
        if (!snap.exists()) {
          if (!cancelled) {
            setErrorMessage('Booking not found.')
          }
          return
        }
        const data = snap.data() as Record<string, unknown>
        if (cancelled) return
        setForm({
          fullName: stringValue(data.fullName || data.name || data.customerName),
          phone: stringValue(data.phone || data.customerPhone),
          email: stringValue(data.email || data.customerEmail),
          serviceName: stringValue(data.serviceName || data.internalServiceName),
          serviceId: stringValue(data.serviceId),
          bookingDate: normalizeDateInput(data.bookingDate || data.date),
          bookingTime: normalizeTimeInput(data.bookingTime || data.time),
          preferredBranch: stringValue(data.preferredBranch || data.branchName),
          preferredContactMethod: stringValue(data.preferredContactMethod || data.contactMethod),
          status: stringValue(data.status) || 'confirmed',
          quantity: String(typeof data.quantity === 'number' ? data.quantity : 1),
          notes: stringValue(data.notes),
          paymentAmount: stringValue(data.paymentAmount || data.amount || data.total || data.price),
          depositAmount: stringValue(data.depositAmount || data.depositPaid || data.amountPaid),
          paymentMethod: stringValue(data.paymentMethod),
        })
      } catch (error) {
        console.error('[booking-editor] Failed to load booking', error)
        if (!cancelled) {
          setErrorMessage('Unable to load this booking. Please retry.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadBooking()
    return () => {
      cancelled = true
    }
  }, [bookingId, isCreateMode, storeId])

  const quantityValue = useMemo(() => {
    const parsed = Number.parseInt(form.quantity, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  }, [form.quantity])

  async function handleSave() {
    if (!storeId) {
      setErrorMessage('Select a workspace before editing bookings.')
      return
    }
    if (!form.fullName.trim()) {
      setErrorMessage('Customer name is required.')
      return
    }

    setSaving(true)
    setErrorMessage(null)
    const targetId = isCreateMode ? doc(db, 'stores', storeId, 'integrationBookings').id : bookingId

    try {
      const now = Timestamp.now()
      const normalizedStatus = (form.status.trim() || 'pending_approval').toLowerCase()
      const isConfirmed = normalizedStatus === 'confirmed'
      const syncReason = normalizedStatus === 'rescheduled' ? 'booking_rescheduled' : normalizedStatus === 'cancelled' ? 'booking_cancelled' : isConfirmed ? 'booking_confirmed' : null
      const payload = {
          name: form.fullName.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          serviceName: form.serviceName.trim(),
          serviceId: form.serviceId.trim(),
          date: normalizeDateInput(form.bookingDate),
          bookingDate: normalizeDateInput(form.bookingDate),
          time: normalizeTimeInput(form.bookingTime),
          bookingTime: normalizeTimeInput(form.bookingTime),
          preferredBranch: form.preferredBranch.trim(),
          preferredContactMethod: form.preferredContactMethod.trim(),
          bookingStatus: normalizedStatus,
          status: normalizedStatus === 'pending_approval' ? 'pending' : normalizedStatus,
          quantity: quantityValue,
          notes: form.notes.trim(),
          paymentAmount: form.paymentAmount.trim(),
          depositAmount: form.depositAmount.trim(),
          paymentMethod: form.paymentMethod.trim(),
          customer: {
            name: form.fullName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
          },
          bookingId: targetId,
          booking_id: targetId,
          source: isCreateMode ? 'manual_admin' : 'manual-edit',
          sourceChannel: 'manual_admin',
          source_channel: 'manual_admin',
          syncStatus: syncReason ? 'pending' : 'not_ready',
          syncReason,
          syncRequestedAt: syncReason ? now : null,
          confirmedAt: isConfirmed ? now : null,
          confirmedBy: isConfirmed ? 'staff_admin' : null,
          rescheduledAt: normalizedStatus === 'rescheduled' ? now : null,
          cancelledAt: normalizedStatus === 'cancelled' ? now : null,
          completedAt: normalizedStatus === 'completed' ? now : null,
          updatedAt: serverTimestamp(),
          createdAt: isCreateMode ? serverTimestamp() : undefined,
        }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId, 'integrationBookings', targetId), payload, { merge: true }),
        setDoc(doc(db, 'integrationBookings', targetId), payload, { merge: true }),
      ])

      navigate('/bookings')
    } catch (error) {
      console.error('[booking-editor] Failed to save booking', error)
      setErrorMessage('Unable to save booking right now.')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmPayment() {
    if (!storeId || isCreateMode) return

    setSaving(true)
    setErrorMessage(null)
    try {
      const now = Timestamp.now()
      const payload = {
          paymentStatus: 'confirmed',
          paymentConfirmedAt: now,
          paymentVerifiedAt: now,
          paymentVerifiedBy: 'staff_admin',
          syncStatus: 'not_ready',
          syncRequestedAt: null,
          updatedAt: serverTimestamp(),
        }
      await Promise.all([
        setDoc(doc(db, 'stores', storeId, 'integrationBookings', bookingId), payload, { merge: true }),
        setDoc(doc(db, 'integrationBookings', bookingId), payload, { merge: true }),
      ])
      navigate('/bookings')
    } catch (error) {
      console.error('[booking-editor] Failed to confirm payment', error)
      setErrorMessage('Unable to confirm payment right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page booking-editor-page">
      <section className="card booking-editor-page__card stack gap-3">
        <header className="stack gap-1">
          <p className="form__hint">
            <Link to="/bookings">← Back to bookings</Link>
          </p>
          <h1>{isCreateMode ? 'Add booking' : 'Edit booking'}</h1>
          <p className="form__hint">Save changes to update this booking and queue sync back to your sheet.</p>
        </header>

        {loading && <p className="form__hint">Loading booking…</p>}
        {errorMessage && <p className="form__error">{errorMessage}</p>}

        {!loading && (
          <form
            className="booking-editor-page__form"
            onSubmit={event => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <label><span>Customer name</span><input value={form.fullName} onChange={event => setForm(prev => ({ ...prev, fullName: event.target.value }))} required /></label>
            <label><span>Phone</span><input value={form.phone} onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))} /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} /></label>
            <label><span>Service name</span><input value={form.serviceName} onChange={event => setForm(prev => ({ ...prev, serviceName: event.target.value }))} /></label>
            <label><span>Service ID</span><input value={form.serviceId} onChange={event => setForm(prev => ({ ...prev, serviceId: event.target.value }))} /></label>
            <label><span>Booking date</span><input type="date" value={form.bookingDate} onChange={event => setForm(prev => ({ ...prev, bookingDate: event.target.value }))} /></label>
            <label><span>Booking time</span><input type="time" value={form.bookingTime} onChange={event => setForm(prev => ({ ...prev, bookingTime: event.target.value }))} /></label>
            <label><span>Preferred branch</span><input value={form.preferredBranch} onChange={event => setForm(prev => ({ ...prev, preferredBranch: event.target.value }))} /></label>
            <label><span>Preferred contact method</span><input value={form.preferredContactMethod} onChange={event => setForm(prev => ({ ...prev, preferredContactMethod: event.target.value }))} /></label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}>
                <option value="confirmed">Confirmed</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label><span>Quantity</span><input type="number" min={1} value={form.quantity} onChange={event => setForm(prev => ({ ...prev, quantity: event.target.value }))} /></label>
            <label><span>Payment amount</span><input value={form.paymentAmount} onChange={event => setForm(prev => ({ ...prev, paymentAmount: event.target.value }))} /></label>
            <label><span>Deposit amount</span><input value={form.depositAmount} onChange={event => setForm(prev => ({ ...prev, depositAmount: event.target.value }))} /></label>
            <label><span>Payment method</span><input value={form.paymentMethod} onChange={event => setForm(prev => ({ ...prev, paymentMethod: event.target.value }))} /></label>
            <label className="booking-editor-page__notes"><span>Notes</span><textarea value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} rows={4} /></label>

            <div className="booking-editor-page__actions">
              <button type="submit" className="button button--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save and sync'}
              </button>
              {!isCreateMode && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => void handleConfirmPayment()}
                >
                  {saving ? 'Saving…' : 'Confirm payment'}
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
