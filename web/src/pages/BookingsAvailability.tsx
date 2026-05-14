import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './BookingsAvailability.css'

type ServiceRecord = { id: string; name: string }
type SlotRecord = {
  id: string
  serviceId: string
  serviceName: string
  startAt: Date
  endAt: Date
  timezone: string
  capacity: number
  seatsBooked: number
  status: 'open' | 'closed'
}

function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function BookingsAvailability() {
  const { storeId } = useActiveStore()
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [slots, setSlots] = useState<SlotRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [serviceMode, setServiceMode] = useState<'catalog' | 'manual'>('catalog')
  const [serviceId, setServiceId] = useState('')
  const [manualServiceName, setManualServiceName] = useState('')
  const [startAt, setStartAt] = useState(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [endAt, setEndAt] = useState(toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [capacity, setCapacity] = useState('20')

  const serviceMap = useMemo(() => new Map(services.map(service => [service.id, service.name])), [services])

  const loadServices = useCallback(async (activeStoreId: string) => {
    const map = new Map<string, string>()
    for (const collectionName of ['services', 'integrationServices']) {
      const snapshot = await getDocs(collection(db, 'stores', activeStoreId, collectionName))
      snapshot.forEach(serviceDoc => {
        const data = serviceDoc.data() as Record<string, unknown>
        const nameCandidate = [data.name, data.title, data.serviceName].find(
          value => typeof value === 'string' && value.trim(),
        ) as string | undefined
        if (nameCandidate) map.set(serviceDoc.id, nameCandidate.trim())
      })
    }
    const productSnapshot = await getDocs(collection(db, 'stores', activeStoreId, 'products'))
    productSnapshot.forEach(productDoc => {
      const data = productDoc.data() as Record<string, unknown>
      const nameCandidate = [data.name, data.title, data.productName].find(
        value => typeof value === 'string' && value.trim(),
      ) as string | undefined
      if (nameCandidate) map.set(productDoc.id, nameCandidate.trim())
    })

    const nextServices = Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
    setServices(nextServices)
    setServiceId(previous => (previous && map.has(previous) ? previous : nextServices[0]?.id ?? ''))
    return map
  }, [])

  const loadSlots = useCallback(async (activeStoreId: string, serviceLookup: Map<string, string>) => {
    const slotQuery = query(collection(db, 'stores', activeStoreId, 'integrationAvailabilitySlots'), orderBy('startAt', 'asc'))
    const snapshot = await getDocs(slotQuery)
    const nextSlots: SlotRecord[] = snapshot.docs
      .map(slotDoc => {
        const data = slotDoc.data() as Record<string, unknown>
        const start = data.startAt && typeof (data.startAt as Timestamp).toDate === 'function' ? (data.startAt as Timestamp).toDate() : null
        const end = data.endAt && typeof (data.endAt as Timestamp).toDate === 'function' ? (data.endAt as Timestamp).toDate() : null
        if (!start || !end) return null
        const normalizedServiceId = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : 'unknown'
        return {
          id: slotDoc.id,
          serviceId: normalizedServiceId,
          serviceName:
            (typeof data.serviceName === 'string' && data.serviceName.trim()) ||
            serviceLookup.get(normalizedServiceId) ||
            normalizedServiceId,
          startAt: start,
          endAt: end,
          timezone: typeof data.timezone === 'string' && data.timezone.trim() ? data.timezone.trim() : 'UTC',
          capacity: typeof data.capacity === 'number' && Number.isFinite(data.capacity) ? Math.max(1, Math.floor(data.capacity)) : 1,
          seatsBooked: typeof data.seatsBooked === 'number' && Number.isFinite(data.seatsBooked) ? Math.max(0, Math.floor(data.seatsBooked)) : 0,
          status: data.status === 'closed' ? 'closed' : 'open',
        } as SlotRecord
      })
      .filter((slot): slot is SlotRecord => slot !== null)
    setSlots(nextSlots)
  }, [])

  const reload = useCallback(async () => {
    if (!storeId) {
      setErrorMessage('Select a workspace before managing availability.')
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorMessage(null)
    try {
      const lookup = await loadServices(storeId)
      await loadSlots(storeId, lookup)
    } catch (error) {
      console.error('[availability] Failed to load', error)
      setErrorMessage('Unable to load availability right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [loadServices, loadSlots, storeId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreateSlot = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!storeId) return
    const startDate = new Date(startAt)
    const endDate = new Date(endAt)
    const nextCapacity = Math.max(1, Math.floor(Number(capacity) || 1))
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      setErrorMessage('Enter a valid start date/time.')
      return
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      setErrorMessage('End date/time must be after start date/time.')
      return
    }
    const manualName = manualServiceName.trim()
    const selectedName = serviceMap.get(serviceId)?.trim() ?? ''
    const resolvedServiceName = serviceMode === 'manual' ? manualName : selectedName
    const resolvedServiceId = serviceMode === 'manual' ? `manual:${manualName.toLowerCase().replace(/\s+/g, '-')}` : serviceId

    if (!resolvedServiceName) {
      setErrorMessage(serviceMode === 'manual' ? 'Enter a service or product name.' : 'Choose a service or product first.')
      return
    }
    if (serviceMode === 'catalog' && !serviceId) {
      setErrorMessage('Choose a service or product first.')
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      await addDoc(collection(db, 'stores', storeId, 'integrationAvailabilitySlots'), {
        storeId,
        serviceId: resolvedServiceId,
        serviceName: resolvedServiceName,
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        timezone,
        capacity: nextCapacity,
        seatsBooked: 0,
        status: 'open',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to create slot', error)
      setErrorMessage('Failed to create slot. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [capacity, endAt, loadSlots, manualServiceName, serviceId, serviceMap, serviceMode, startAt, storeId, timezone])

  const toggleStatus = useCallback(async (slot: SlotRecord) => {
    if (!storeId) return
    try {
      await updateDoc(doc(db, 'stores', storeId, 'integrationAvailabilitySlots', slot.id), {
        status: slot.status === 'open' ? 'closed' : 'open',
        updatedAt: Timestamp.now(),
      })
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to update slot status', error)
      setErrorMessage('Failed to update slot status.')
    }
  }, [loadSlots, serviceMap, storeId])

  const deleteSlot = useCallback(async (slotId: string) => {
    if (!storeId) return
    try {
      await deleteDoc(doc(db, 'stores', storeId, 'integrationAvailabilitySlots', slotId))
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to delete slot', error)
      setErrorMessage('Failed to delete slot.')
    }
  }, [loadSlots, serviceMap, storeId])

  return (
    <main className="page availability-page">
      <section className="card stack gap-4">
        <header className="stack gap-1">
          <h1>Class availability</h1>
          <p className="bookings-page__intro">
            Create and manage upcoming class/session slots. Your website can use these slots to show the next available session.
          </p>
          <div className="availability-page__actions">
            <Link to="/bookings" className="btn btn-secondary">Back to bookings</Link>
          </div>
        </header>

        <form className="availability-form" onSubmit={handleCreateSlot}>
          <label><span>Service source</span><select value={serviceMode} onChange={event => setServiceMode(event.target.value === 'manual' ? 'manual' : 'catalog')}><option value="catalog">Select existing service/product</option><option value="manual">Manual input</option></select></label>
          {serviceMode === 'catalog' ? (
            <label><span>Service or product</span><select value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Select item</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          ) : (
            <label><span>Service or product name</span><input value={manualServiceName} onChange={event => setManualServiceName(event.target.value)} placeholder="e.g. Hair Braiding" required={serviceMode === 'manual'} /></label>
          )}
          <label><span>Start</span><input type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} required /></label>
          <label><span>End</span><input type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} required /></label>
          <label><span>Timezone</span><input value={timezone} onChange={event => setTimezone(event.target.value)} required /></label>
          <label><span>Capacity</span><input type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} required /></label>
          <button className="btn btn-secondary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add slot'}</button>
        </form>

        {loading && <p className="form__hint">Loading slots…</p>}
        {errorMessage && <p className="form__error">{errorMessage}</p>}

        {!loading && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Service</th><th>Start</th><th>End</th><th>Status</th><th>Capacity</th><th>Booked</th><th>Actions</th></tr></thead>
              <tbody>
                {slots.map(slot => (
                  <tr key={slot.id}>
                    <td>{slot.serviceName}</td>
                    <td>{slot.startAt.toLocaleString()}</td>
                    <td>{slot.endAt.toLocaleString()}</td>
                    <td>{slot.status}</td>
                    <td>{slot.capacity}</td>
                    <td>{slot.seatsBooked}</td>
                    <td>
                      <div className="availability-page__row-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => void toggleStatus(slot)}>{slot.status === 'open' ? 'Close' : 'Open'}</button>
                        <button type="button" className="btn btn-secondary" onClick={() => void deleteSlot(slot.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
