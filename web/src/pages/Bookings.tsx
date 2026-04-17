import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './Bookings.css'

type BookingRecord = {
  id: string
  bookingName: string | null
  bookingPhone: string | null
  bookingEmail: string | null
  serviceId: string
  serviceName: string
  bookingDate: string | null
  bookingTime: string | null
  preferredBranch: string | null
  sessionType: string | null
  therapistPreference: string | null
  preferredContactMethod: string | null
  paymentAmount: string | null
  depositAmount: string | null
  paymentMethod: string | null
  paymentScreenshotUrl: string | null
  paymentScreenshotReady: boolean | null
  noRefundAccepted: boolean | null
  status: string
  quantity: number
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  notes: string | null
  createdAt: Date | null
}

type ServiceRecord = {
  id: string
  name: string
}

const PAGE_SIZE = 25
const STATUS_ALL = 'all'
const SERVICE_ALL = 'all'

const STATUS_ACTIONS: Record<string, Array<{ label: string; nextStatus: string }>> = {
  confirmed: [
    { label: 'Reschedule', nextStatus: 'rescheduled' },
    { label: 'Complete', nextStatus: 'completed' },
    { label: 'Cancel', nextStatus: 'cancelled' },
  ],
  rescheduled: [
    { label: 'Confirm', nextStatus: 'confirmed' },
    { label: 'Complete', nextStatus: 'completed' },
    { label: 'Cancel', nextStatus: 'cancelled' },
  ],
}

function formatDate(value: Date | null): string {
  if (!value) return '—'
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function normalizeStatus(rawStatus: unknown): string {
  if (typeof rawStatus !== 'string' || !rawStatus.trim()) return 'confirmed'
  return rawStatus.trim().toLowerCase()
}

function statusLabel(status: string): string {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function dateToTimestamp(date: string, useDayEnd = false): Timestamp {
  const parsedDate = new Date(date)
  if (useDayEnd) {
    parsedDate.setHours(23, 59, 59, 999)
  } else {
    parsedDate.setHours(0, 0, 0, 0)
  }
  return Timestamp.fromDate(parsedDate)
}

function pickString(data: Record<string, unknown>, keys: string[], fallback: string | null = null): string | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return fallback
}

function pickBoolean(data: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true' || normalized === 'yes') return true
      if (normalized === 'false' || normalized === 'no') return false
    }
  }
  return null
}

function pickAmount(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString()
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default function Bookings() {
  const { storeId } = useActiveStore()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [diagnosticsId, setDiagnosticsId] = useState<string | null>(null)
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL)
  const [serviceFilter, setServiceFilter] = useState(SERVICE_ALL)
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lastCursor, setLastCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<QueryDocumentSnapshot<DocumentData> | null>>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null)

  const hydrateBooking = useCallback((docSnap: QueryDocumentSnapshot<DocumentData>, serviceMap: Map<string, string>) => {
    const data = docSnap.data() as Record<string, unknown>
    const customer =
      data.customer && typeof data.customer === 'object'
        ? (data.customer as Record<string, unknown>)
        : {}
    const createdAtValue =
      data.createdAt && typeof data.createdAt === 'object' && typeof (data.createdAt as Timestamp).toDate === 'function'
        ? (data.createdAt as Timestamp).toDate()
        : null
    const serviceId = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : '—'
    const bookingName = pickString(data, ['name', 'fullName', 'customerName'], typeof customer.name === 'string' ? customer.name : null)
    const bookingPhone = pickString(data, ['phone', 'customerPhone'], typeof customer.phone === 'string' ? customer.phone : null)
    const bookingEmail = pickString(data, ['email', 'customerEmail'], typeof customer.email === 'string' ? customer.email : null)
    const preferredBranch = pickString(data, ['preferredBranch', 'branch', 'branchName'])
    const sessionType = pickString(data, ['sessionType', 'duration', 'sessionDuration'])
    const therapistPreference = pickString(data, ['therapistPreference', 'preferredTherapist'])
    const preferredContactMethod = pickString(data, ['preferredContactMethod', 'contactMethod'])
    const paymentMethod = pickString(data, ['paymentMethod'])
    const paymentScreenshotUrl = pickString(data, ['paymentScreenshotUrl', 'screenshotUrl'])
    const paymentAmount = pickAmount(data, ['paymentAmount', 'amount', 'total', 'price'])
    const depositAmount = pickAmount(data, ['depositAmount', 'depositPaid', 'amountPaid'])
    const bookingDate = pickString(data, ['date', 'bookingDate'])
    const bookingTime = pickString(data, ['time', 'bookingTime'])
    const internalServiceName = pickString(data, ['serviceName', 'serviceNoteName', 'internalServiceName'])
    const paymentScreenshotReady = pickBoolean(data, ['paymentScreenshotReady'])
    const noRefundAccepted = pickBoolean(data, ['noRefundAccepted', 'agreeNoRefundPolicy'])

    return {
      id: docSnap.id,
      bookingName,
      bookingPhone,
      bookingEmail,
      serviceId,
      serviceName: internalServiceName ?? serviceMap.get(serviceId) ?? serviceId,
      bookingDate,
      bookingTime,
      preferredBranch,
      sessionType,
      therapistPreference,
      preferredContactMethod,
      paymentMethod,
      paymentScreenshotUrl,
      paymentAmount,
      depositAmount,
      paymentScreenshotReady,
      noRefundAccepted,
      status: normalizeStatus(data.status),
      quantity:
        typeof data.quantity === 'number' && Number.isFinite(data.quantity)
          ? Math.max(1, Math.floor(data.quantity))
          : 1,
      customerName:
        typeof customer.name === 'string' && customer.name.trim() ? customer.name.trim() : null,
      customerPhone:
        typeof customer.phone === 'string' && customer.phone.trim() ? customer.phone.trim() : null,
      customerEmail:
        typeof customer.email === 'string' && customer.email.trim() ? customer.email.trim() : null,
      notes: typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null,
      createdAt: createdAtValue,
    } satisfies BookingRecord
  }, [])

  const loadServices = useCallback(async (activeStoreId: string): Promise<Map<string, string>> => {
    const serviceMap = new Map<string, string>()
    const potentialCollections = ['services', 'integrationServices']

    for (const collectionName of potentialCollections) {
      const servicesSnapshot = await getDocs(collection(db, 'stores', activeStoreId, collectionName))
      servicesSnapshot.forEach(serviceDoc => {
        const data = serviceDoc.data() as Record<string, unknown>
        const candidates = [data.name, data.title, data.serviceName]
        const selectedName = candidates.find(value => typeof value === 'string' && value.trim()) as string | undefined
        if (selectedName) {
          serviceMap.set(serviceDoc.id, selectedName.trim())
        }
      })
    }

    const nextServices: ServiceRecord[] = Array.from(serviceMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
    setServices(nextServices)

    return serviceMap
  }, [])

  const buildBookingsQuery = useCallback(
    (activeStoreId: string, serviceFilterValue: string, statusFilterValue: string, startAfterDoc: QueryDocumentSnapshot<DocumentData> | null) => {
      const queryConstraints: Array<
        ReturnType<typeof where> | ReturnType<typeof orderBy> | ReturnType<typeof limit> | ReturnType<typeof startAfter>
      > = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE + 1)]

      if (statusFilterValue !== STATUS_ALL) {
        queryConstraints.unshift(where('status', '==', statusFilterValue))
      }

      if (serviceFilterValue !== SERVICE_ALL) {
        queryConstraints.unshift(where('serviceId', '==', serviceFilterValue))
      }

      if (startDate) {
        queryConstraints.unshift(where('createdAt', '>=', dateToTimestamp(startDate)))
      }

      if (endDate) {
        queryConstraints.unshift(where('createdAt', '<=', dateToTimestamp(endDate, true)))
      }

      if (startAfterDoc) {
        queryConstraints.push(startAfter(startAfterDoc))
      }

      return query(collection(db, 'stores', activeStoreId, 'integrationBookings'), ...queryConstraints)
    },
    [endDate, startDate],
  )

  const loadBookingsPage = useCallback(
    async (startAfterDoc: QueryDocumentSnapshot<DocumentData> | null, nextPageNumber: number, nextCursorStack: Array<QueryDocumentSnapshot<DocumentData> | null>) => {
      if (!storeId) return

      setLoading(true)
      setErrorMessage(null)
      setDiagnosticsId(null)

      try {
        const serviceMap = await loadServices(storeId)
        const bookingsQuery = buildBookingsQuery(storeId, serviceFilter, statusFilter, startAfterDoc)
        const snapshot = await getDocs(bookingsQuery)
        const docs = snapshot.docs
        const hasMore = docs.length > PAGE_SIZE
        const pageDocs = hasMore ? docs.slice(0, PAGE_SIZE) : docs
        const nextLastCursor = pageDocs.length ? pageDocs[pageDocs.length - 1] : null

        setBookings(pageDocs.map(docSnap => hydrateBooking(docSnap, serviceMap)))
        setLastCursor(nextLastCursor)
        setHasNextPage(hasMore)
        setCursorStack(nextCursorStack)
        setPageNumber(nextPageNumber)
      } catch (error) {
        console.error('[bookings] Failed to load bookings', error)
        const diagCode = `BK-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`
        setDiagnosticsId(diagCode)
        setErrorMessage('Unable to load bookings right now. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [buildBookingsQuery, hydrateBooking, loadServices, serviceFilter, statusFilter, storeId],
  )

  useEffect(() => {
    if (!storeId) {
      setBookings([])
      setServices([])
      setLoading(false)
      setErrorMessage('Select a workspace to view bookings.')
      return
    }

    void loadBookingsPage(null, 1, [])
  }, [loadBookingsPage, storeId])

  const handleNextPage = useCallback(() => {
    if (!hasNextPage || !lastCursor) return
    const nextStack = [...cursorStack, lastCursor]
    void loadBookingsPage(lastCursor, pageNumber + 1, nextStack)
  }, [cursorStack, hasNextPage, lastCursor, loadBookingsPage, pageNumber])

  const handlePreviousPage = useCallback(() => {
    if (pageNumber <= 1) return
    const previousStack = cursorStack.slice(0, -1)
    const previousCursor = previousStack.length ? previousStack[previousStack.length - 1] : null
    void loadBookingsPage(previousCursor, pageNumber - 1, previousStack)
  }, [cursorStack, loadBookingsPage, pageNumber])

  const handleRetry = useCallback(() => {
    void loadBookingsPage(pageNumber <= 1 ? null : cursorStack[cursorStack.length - 1] ?? null, pageNumber, cursorStack)
  }, [cursorStack, loadBookingsPage, pageNumber])

  const handleStatusUpdate = useCallback(
    async (bookingId: string, nextStatus: string) => {
      if (!storeId) return
      setUpdatingBookingId(bookingId)
      try {
        await updateDoc(doc(db, 'stores', storeId, 'integrationBookings', bookingId), {
          status: nextStatus,
          syncStatus: 'pending',
          syncRequestedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })

        setBookings(previous =>
          previous.map(booking =>
            booking.id === bookingId
              ? {
                  ...booking,
                  status: nextStatus,
                }
              : booking,
          ),
        )
      } catch (error) {
        console.error('[bookings] Failed to update booking status', error)
        setErrorMessage('Status update failed. Please retry.')
      } finally {
        setUpdatingBookingId(null)
      }
    },
    [storeId],
  )

  const handleDeleteBooking = useCallback(
    async (bookingId: string) => {
      if (!storeId) return
      const shouldDelete = window.confirm('Delete this booking? This cannot be undone.')
      if (!shouldDelete) return

      setUpdatingBookingId(bookingId)
      setErrorMessage(null)

      try {
        await deleteDoc(doc(db, 'stores', storeId, 'integrationBookings', bookingId))

        setBookings(previous => previous.filter(booking => booking.id !== bookingId))
      } catch (error) {
        console.error('[bookings] Failed to delete booking', error)
        setErrorMessage('Delete failed. Please retry.')
      } finally {
        setUpdatingBookingId(null)
      }
    },
    [storeId],
  )


  const filteredBookings = useMemo(() => {
    const queryText = searchTerm.trim().toLowerCase()
    if (!queryText) return bookings

    return bookings.filter(booking => {
      const fields = [booking.customerName, booking.customerPhone, booking.customerEmail]
      return fields.some(value => typeof value === 'string' && value.toLowerCase().includes(queryText))
    })
  }, [bookings, searchTerm])

  const confirmedCount = useMemo(() => bookings.filter(booking => booking.status === 'confirmed').length, [bookings])

  return (
    <main className="page bookings-page">
      <section className="card stack gap-4">
        <header className="stack gap-1">
          <div className="bookings-page__header-row">
            <h1>Bookings</h1>
            <Link to="/bookings/new" className="btn btn-secondary">
              Add booking
            </Link>
          </div>
          <p className="form__hint">
            Website bookings appear here. New bookings and booking updates are synced automatically, and booking contact details are mapped into Customers when they include a phone or email.
          </p>
        </header>

        <div className="bookings-page__filters">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value={STATUS_ALL}>All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            <span>Service</span>
            <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)}>
              <option value={SERVICE_ALL}>All services</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
          </label>
          <label className="bookings-page__search">
            <span>Search customer</span>
            <input
              type="search"
              placeholder="Name, phone, or email"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
            />
          </label>
          <button className="btn btn-secondary" type="button" onClick={() => void loadBookingsPage(null, 1, [])}>
            Apply filters
          </button>
        </div>

        {loading && <p className="form__hint">Loading bookings…</p>}
        {!loading && errorMessage && (
          <div className="stack gap-2">
            <p className="form__error">{errorMessage}</p>
            {diagnosticsId && <p className="form__hint">Diagnostics ID: {diagnosticsId}</p>}
            <button className="btn btn-secondary" type="button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
        {!loading && !errorMessage && (
          <>
            <p className="form__hint">
              Total bookings: <strong>{bookings.length}</strong> • Confirmed: <strong>{confirmedCount}</strong> • Page:{' '}
              <strong>{pageNumber}</strong>
            </p>
            {filteredBookings.length ? (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Service</th>
                        <th>Customer</th>
                        <th>Qty</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.map(booking => (
                        <tr
                          key={booking.id}
                          className="bookings-page__row"
                        >
                          <td>{formatDate(booking.createdAt)}</td>
                          <td>{booking.serviceName || booking.serviceId}</td>
                          <td>
                            {[booking.customerName, booking.customerPhone, booking.customerEmail]
                              .filter(Boolean)
                              .join(' • ') || '—'}
                          </td>
                          <td>{booking.quantity}</td>
                          <td>
                            <span className={`bookings-page__status bookings-page__status--${booking.status}`}>
                              {statusLabel(booking.status)}
                            </span>
                          </td>
                          <td>{booking.paymentAmount ?? booking.depositAmount ?? '—'}</td>
                          <td>{booking.notes ?? '—'}</td>
                          <td>
                            <div className="bookings-page__actions">
                              {(STATUS_ACTIONS[booking.status] ?? []).map(action => (
                                <button
                                  key={action.nextStatus}
                                  className="btn btn-secondary"
                                  type="button"
                                  disabled={updatingBookingId === booking.id}
                                  onClick={() => void handleStatusUpdate(booking.id, action.nextStatus)}
                                >
                                  {action.label}
                                </button>
                              ))}
                              <Link to={`/bookings/${booking.id}`} className="btn btn-secondary">
                                Edit
                              </Link>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={updatingBookingId === booking.id}
                                onClick={() => void handleDeleteBooking(booking.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bookings-page__pagination">
                  <button className="btn btn-secondary" type="button" disabled={pageNumber <= 1} onClick={handlePreviousPage}>
                    Previous
                  </button>
                  <button className="btn btn-secondary" type="button" disabled={!hasNextPage} onClick={handleNextPage}>
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="stack gap-2">
                <p className="form__hint">No bookings yet.</p>
                <p className="form__hint">
                  Set up your booking widget and integration to start receiving appointments.
                </p>
                <Link to="/docs/integration-quickstart" className="btn btn-secondary" style={{ width: 'fit-content' }}>
                  Open integration guide
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
