import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
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
  depositAmount: '',
  paymentMethod: '',
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
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
          bookingDate: stringValue(data.bookingDate || data.date),
          bookingTime: stringValue(data.bookingTime || data.time),
          preferredBranch: stringValue(data.preferredBranch || data.branchName),
          preferredContactMethod: stringValue(data.preferredContactMethod || data.contactMethod),
          status: stringValue(data.status) || 'confirmed',
          quantity: String(typeof data.quantity === 'number' ? data.quantity : 1),
          notes: stringValue(data.notes),
          depositAmount: stringValue(data.depositAmount),
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
      await setDoc(
        doc(db, 'stores', storeId, 'integrationBookings', targetId),
        {
          name: form.fullName.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          serviceName: form.serviceName.trim(),
          serviceId: form.serviceId.trim(),
          date: form.bookingDate,
          bookingDate: form.bookingDate,
          time: form.bookingTime,
          bookingTime: form.bookingTime,
          preferredBranch: form.preferredBranch.trim(),
          preferredContactMethod: form.preferredContactMethod.trim(),
          status: form.status.trim() || 'confirmed',
          quantity: quantityValue,
          notes: form.notes.trim(),
          depositAmount: form.depositAmount.trim(),
          paymentMethod: form.paymentMethod.trim(),
          customer: {
            name: form.fullName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
          },
          source: isCreateMode ? 'manual' : 'manual-edit',
          syncStatus: 'pending',
          syncRequestedAt: Timestamp.now(),
          updatedAt: serverTimestamp(),
          createdAt: isCreateMode ? serverTimestamp() : undefined,
        },
        { merge: true },
      )

      navigate('/bookings')
    } catch (error) {
      console.error('[booking-editor] Failed to save booking', error)
      setErrorMessage('Unable to save booking right now.')
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
            <label><span>Deposit amount</span><input value={form.depositAmount} onChange={event => setForm(prev => ({ ...prev, depositAmount: event.target.value }))} /></label>
            <label><span>Payment method</span><input value={form.paymentMethod} onChange={event => setForm(prev => ({ ...prev, paymentMethod: event.target.value }))} /></label>
            <label className="booking-editor-page__notes"><span>Notes</span><textarea value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} rows={4} /></label>

            <div className="booking-editor-page__actions">
              <button type="submit" className="button button--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save and sync'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
