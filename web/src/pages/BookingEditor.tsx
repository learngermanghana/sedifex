import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { buildCancelBookingPayload, buildCompleteBookingPayload, buildConfirmBookingPayload, hasAppScriptBookingSyncConfigured } from '../utils/bookingActions'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import { playSound } from '../utils/sound'
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
  paymentReference: string
  paymentStatus: string
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
  paymentReference: '',
  paymentStatus: 'payment_pending',
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString()
  }
  return ''
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function firstStringValue(...values: unknown[]): string {
  for (const value of values) {
    const str = stringValue(value).trim()
    if (str) return str
  }
  return ''
}

function normalizePaymentStatus(data: Record<string, unknown>, payment: Record<string, unknown>): string {
  if (payment.confirmed === true) return 'paid'
  const raw = firstStringValue(data.paymentStatus, data.payment_status, payment.status).toLowerCase()
  if (!raw) return 'payment_pending'
  if (['paid', 'confirmed', 'success', 'succeeded', 'complete', 'completed'].includes(raw)) return 'paid'
  if (['pending', 'payment_pending', 'unpaid'].includes(raw)) return 'payment_pending'
  return raw
}

function normalizeBookingForm(data: Record<string, unknown>): BookingFormState {
  const customer = recordValue(data.customer)
  const booking = recordValue(data.booking)
  const payment = recordValue(data.payment)
  const status = firstStringValue(data.bookingStatus, data.status) || 'confirmed'

  return {
    fullName: firstStringValue(data.fullName, data.name, data.customerName, customer.name),
    phone: firstStringValue(data.phone, data.customerPhone, customer.phone),
    email: firstStringValue(data.email, data.customerEmail, customer.email),
    serviceName: firstStringValue(data.serviceName, data.internalServiceName, booking.serviceName, data.itemName, data.productName),
    serviceId: firstStringValue(data.serviceId, booking.serviceId),
    bookingDate: normalizeDateInput(firstStringValue(data.bookingDate, data.date, booking.preferredDate, booking.date, booking.startAt)),
    bookingTime: normalizeTimeInput(firstStringValue(data.bookingTime, data.time, booking.preferredTime, booking.time, booking.startAt)),
    preferredBranch: firstStringValue(data.preferredBranch, data.branchName, data.branch, data.location),
    preferredContactMethod: firstStringValue(data.preferredContactMethod, data.contactMethod),
    status,
    quantity: String(typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? data.quantity : 1),
    notes: firstStringValue(data.notes),
    paymentAmount: firstStringValue(data.paymentAmount, data.amount, data.total, data.price, payment.amount),
    depositAmount: firstStringValue(data.depositAmount, data.depositPaid, data.amountPaid, payment.depositAmount, payment.amountPaid),
    paymentMethod: firstStringValue(data.paymentMethod, payment.method),
    paymentReference: firstStringValue(data.paymentReference, data.reference, payment.reference),
    paymentStatus: normalizePaymentStatus(data, payment),
  }
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [existingPayment, setExistingPayment] = useState<Record<string, unknown>>({})
  const [shouldQueueBookingSync, setShouldQueueBookingSync] = useState(false)
  const { publish } = useToast()

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
        const storeDocSnap = await getDoc(doc(db, 'stores', storeId))
        setShouldQueueBookingSync(hasAppScriptBookingSyncConfigured(storeDocSnap.data() as Record<string, unknown> | undefined))
        const storeBookingRef = doc(db, 'stores', storeId, 'integrationBookings', bookingId)
        const storeSnap = await getDoc(storeBookingRef)
        let data: Record<string, unknown> | null = null

        if (storeSnap.exists()) {
          data = storeSnap.data() as Record<string, unknown>
        } else {
          const rootBookingRef = doc(db, 'integrationBookings', bookingId)
          const rootSnap = await getDoc(rootBookingRef)
          if (rootSnap.exists()) {
            data = rootSnap.data() as Record<string, unknown>
            await setDoc(storeBookingRef, { ...data, storeId }, { merge: true })
          }
        }

        if (!data) {
          if (!cancelled) {
            setErrorMessage('Booking not found.')
          }
          return
        }

        if (cancelled) return
        setForm(normalizeBookingForm(data))
        setExistingPayment(recordValue(data.payment))
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


  useEffect(() => {
    if (!storeId || !isCreateMode) return
    let cancelled = false
    async function loadStoreSyncConfig() {
      try {
        const storeDocSnap = await getDoc(doc(db, 'stores', storeId))
        if (!cancelled) {
          setShouldQueueBookingSync(hasAppScriptBookingSyncConfigured(storeDocSnap.data() as Record<string, unknown> | undefined))
        }
      } catch (error) {
        console.error('[booking-editor] Failed to load booking sync config', error)
        if (!cancelled) setShouldQueueBookingSync(false)
      }
    }
    void loadStoreSyncConfig()
    return () => {
      cancelled = true
    }
  }, [isCreateMode, storeId])

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
    setSuccessMessage(null)
    const targetId = isCreateMode ? doc(db, 'stores', storeId, 'integrationBookings').id : bookingId

    try {
      const normalizedStatus = (form.status.trim() || 'pending_approval').toLowerCase()
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
          paymentReference: form.paymentReference.trim(),
          reference: form.paymentReference.trim(),
          paymentStatus: form.paymentStatus.trim() || 'payment_pending',
          payment: {
            amount: form.paymentAmount.trim(),
            depositAmount: form.depositAmount.trim(),
            method: form.paymentMethod.trim(),
            reference: form.paymentReference.trim(),
            status: form.paymentStatus.trim() || 'payment_pending',
            confirmed: ['paid', 'confirmed'].includes((form.paymentStatus.trim() || '').toLowerCase()),
          },
          booking: {
            serviceId: form.serviceId.trim(),
            serviceName: form.serviceName.trim(),
            preferredDate: normalizeDateInput(form.bookingDate),
            preferredTime: normalizeTimeInput(form.bookingTime),
          },
          customer: {
            name: form.fullName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
          },
          bookingId: targetId,
          booking_id: targetId,
          updatedAt: serverTimestamp(),
          ...(isCreateMode ? {
            createdAt: serverTimestamp(),
            source: 'manual_admin',
            sourceChannel: 'manual_admin',
            source_channel: 'manual_admin',
          } : {}),
        }
      await withTimeout(
        Promise.all([
          setDoc(doc(db, 'stores', storeId, 'integrationBookings', targetId), payload, { merge: true }),
          setDoc(doc(db, 'integrationBookings', targetId), payload, { merge: true }),
        ]),
        15000,
        'Saving booking timed out. Please try again.',
      )

      const saveMessage = 'Booking changes saved successfully.'
      setSuccessMessage(saveMessage)
      publish({ tone: 'success', message: saveMessage })
      void playSound('success')
      if (isCreateMode) navigate('/bookings')
    } catch (error) {
      console.error('[booking-editor] Failed to save booking', error)
      const failureMessage = 'Unable to save booking right now.'
      setErrorMessage(failureMessage)
      publish({ tone: 'error', message: failureMessage })
      void playSound('error')
    } finally {
      setSaving(false)
    }
  }

  async function updateExistingBooking(payload: Record<string, unknown>, failureMessage: string, successMessageText: string) {
    if (!storeId || isCreateMode) return

    setSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      await withTimeout(
        Promise.all([
          setDoc(doc(db, 'stores', storeId, 'integrationBookings', bookingId), payload, { merge: true }),
          setDoc(doc(db, 'integrationBookings', bookingId), payload, { merge: true }),
        ]),
        15000,
        'Saving booking timed out. Please try again.',
      )
      setForm(prev => ({
        ...prev,
        status: typeof payload.status === 'string' ? payload.status : prev.status,
        paymentStatus: typeof payload.paymentStatus === 'string' ? payload.paymentStatus : prev.paymentStatus,
      }))
      if (payload.payment && typeof payload.payment === 'object') {
        setExistingPayment(payload.payment as Record<string, unknown>)
      }
      setSuccessMessage(successMessageText)
      publish({ tone: 'success', message: successMessageText })
      void playSound('success')
    } catch (error) {
      console.error('[booking-editor] Failed to update booking', error)
      setErrorMessage(failureMessage)
      publish({ tone: 'error', message: failureMessage })
      void playSound('error')
    } finally {
      setSaving(false)
    }
  }

  function handleConfirmBooking() {
    return updateExistingBooking(
      buildConfirmBookingPayload(existingPayment, shouldQueueBookingSync),
      'Unable to confirm booking right now.',
      shouldQueueBookingSync
        ? 'Booking confirmed, payment marked paid, and sync queued.'
        : 'Booking confirmed and payment marked paid. App Script sync is not configured.',
    )
  }

  function handleCancelBooking() {
    return updateExistingBooking(
      buildCancelBookingPayload(shouldQueueBookingSync),
      'Unable to cancel booking right now.',
      shouldQueueBookingSync ? 'Booking cancelled and sync queued.' : 'Booking cancelled. App Script sync is not configured.',
    )
  }

  function handleCompleteBooking() {
    return updateExistingBooking(
      buildCompleteBookingPayload(shouldQueueBookingSync),
      'Unable to complete booking right now.',
      shouldQueueBookingSync ? 'Booking completed and sync queued.' : 'Booking completed. App Script sync is not configured.',
    )
  }


  return (
    <main className="page booking-editor-page">
      <section className="card booking-editor-page__card stack gap-3">
        <header className="stack gap-1">
          <p className="form__hint">
            <Link to="/bookings">← Back to bookings</Link>
          </p>
          <h1>{isCreateMode ? 'Add booking' : 'Edit booking'}</h1>
          <p className="form__hint">Use action buttons to immediately confirm, cancel, or complete bookings. Save changes only updates edited fields.</p>
        </header>

        {loading && <p className="form__hint">Loading booking…</p>}
        {errorMessage && <p className="form__error">{errorMessage}</p>}
        {successMessage && <p className="form__success">{successMessage}</p>}

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
                <option value="pending_approval">Pending approval</option>
                <option value="pending">Pending</option>
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
            <label><span>Payment reference</span><input value={form.paymentReference} onChange={event => setForm(prev => ({ ...prev, paymentReference: event.target.value }))} /></label>
            <label>
              <span>Payment status</span>
              <select value={form.paymentStatus} onChange={event => setForm(prev => ({ ...prev, paymentStatus: event.target.value }))}>
                <option value="payment_pending">Payment pending</option>
                <option value="paid">Paid</option>
                <option value="manual_review">Manual review</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <label className="booking-editor-page__notes"><span>Notes</span><textarea value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} rows={4} /></label>

            <div className="booking-editor-page__actions">
              {!isCreateMode && (
                <>
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void handleConfirmBooking()}>
                    Confirm booking
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void handleCancelBooking()}>
                    Cancel booking
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void handleCompleteBooking()}>
                    Complete booking
                  </button>
                </>
              )}
              <button type="submit" className="button button--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
