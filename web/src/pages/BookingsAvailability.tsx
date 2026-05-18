import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './BookingsAvailability.css'

type ServiceRecord = {
  id: string
  name: string
  itemType?: 'product' | 'service' | 'course' | 'programme'
  imageUrl?: string | null
  imageAlt?: string | null
  source?: string
}
type EventKind = 'intake' | 'class' | 'workshop' | 'event' | 'trip'
type RegistrationMode = 'free' | 'paid' | 'deposit' | 'enquiry'

type SlotRecord = {
  id: string
  serviceId: string
  serviceName: string
  linkedCourseId?: string
  eventKind: EventKind
  registrationMode: RegistrationMode
  price?: number
  depositAmount?: number
  location?: string
  description?: string
  marketplaceEnabled: boolean
  startAt: Date
  endAt: Date
  timezone: string
  capacity: number
  seatsBooked: number
  status: 'open' | 'closed'
  imageUrl?: string
  imageAlt?: string
}

function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event'
}

function safeFileName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'event-photo.jpg'
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(error => {
        clearTimeout(timer)
        reject(error)
      })
  })
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
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Accra')
  const [capacity, setCapacity] = useState('20')
  const [eventKind, setEventKind] = useState<EventKind>('intake')
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('paid')
  const [linkedCourseId, setLinkedCourseId] = useState('')
  const [price, setPrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(true)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const serviceMap = useMemo(() => new Map(services.map(service => [service.id, service])), [services])
  const selectedService = serviceMap.get(serviceId)
  const previewUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : ''), [photoFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const loadServices = useCallback(async (activeStoreId: string) => {
    const map = new Map<string, ServiceRecord>()

    const addService = (docId: string, data: Record<string, unknown>, source: string, fallbackType: ServiceRecord['itemType']) => {
      const nameCandidate = [data.name, data.title, data.productName, data.serviceName].find(
        value => typeof value === 'string' && value.trim(),
      ) as string | undefined
      if (!nameCandidate) return
      map.set(docId, {
        id: docId,
        name: nameCandidate.trim(),
        itemType: data.itemType === 'course' ? 'course' : data.itemType === 'programme' ? 'programme' : data.itemType === 'service' ? 'service' : fallbackType,
        imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
        imageAlt: typeof data.imageAlt === 'string' ? data.imageAlt : null,
        source,
      })
    }

    const topLevelProducts = await getDocs(query(collection(db, 'products'), where('storeId', '==', activeStoreId), limit(500)))
    topLevelProducts.forEach(productDoc => {
      addService(productDoc.id, productDoc.data() as Record<string, unknown>, 'products', 'product')
    })

    const legacyCollections = [
      'services',
      'integrationServices',
      'products',
      'programmes',
      'programs',
      'integrationProgrammes',
      'integrationPrograms',
    ]

    for (const collectionName of legacyCollections) {
      const snapshot = await getDocs(collection(db, 'stores', activeStoreId, collectionName))
      snapshot.forEach(serviceDoc => {
        const inferredType: ServiceRecord['itemType'] =
          collectionName.includes('program') ? 'programme' : collectionName.includes('service') ? 'service' : 'product'
        addService(serviceDoc.id, serviceDoc.data() as Record<string, unknown>, `stores/${activeStoreId}/${collectionName}`, inferredType)
      })
    }

    const nextServices = Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name))
    setServices(nextServices)
    setServiceId(previous => (previous && map.has(previous) ? previous : nextServices[0]?.id ?? ''))
    return map
  }, [])

  const loadSlots = useCallback(async (activeStoreId: string, serviceLookup: Map<string, ServiceRecord>) => {
    const slotQuery = query(collection(db, 'stores', activeStoreId, 'integrationAvailabilitySlots'), orderBy('startAt', 'asc'))
    const snapshot = await getDocs(slotQuery)
    const nextSlots: SlotRecord[] = snapshot.docs
      .map(slotDoc => {
        const data = slotDoc.data() as Record<string, unknown>
        const start = data.startAt && typeof (data.startAt as Timestamp).toDate === 'function' ? (data.startAt as Timestamp).toDate() : null
        const end = data.endAt && typeof (data.endAt as Timestamp).toDate === 'function' ? (data.endAt as Timestamp).toDate() : null
        if (!start || !end) return null
        const normalizedServiceId = typeof data.serviceId === 'string' && data.serviceId.trim() ? data.serviceId.trim() : 'unknown'
        const attributes = data.attributes && typeof data.attributes === 'object' ? data.attributes as Record<string, unknown> : {}
        return {
          id: slotDoc.id,
          serviceId: normalizedServiceId,
          serviceName:
            (typeof data.serviceName === 'string' && data.serviceName.trim()) ||
            serviceLookup.get(normalizedServiceId)?.name ||
            normalizedServiceId,
          startAt: start,
          endAt: end,
          timezone: typeof data.timezone === 'string' && data.timezone.trim() ? data.timezone.trim() : 'Africa/Accra',
          capacity: typeof data.capacity === 'number' && Number.isFinite(data.capacity) ? Math.max(1, Math.floor(data.capacity)) : 1,
          seatsBooked: typeof data.seatsBooked === 'number' && Number.isFinite(data.seatsBooked) ? Math.max(0, Math.floor(data.seatsBooked)) : 0,
          status: data.status === 'closed' ? 'closed' : 'open',
          linkedCourseId: typeof data.linkedCourseId === 'string' ? data.linkedCourseId : undefined,
          eventKind: (typeof data.eventKind === 'string' ? data.eventKind : 'event') as EventKind,
          registrationMode: (typeof data.registrationMode === 'string' ? data.registrationMode : 'paid') as RegistrationMode,
          price: typeof data.price === 'number' ? data.price : undefined,
          depositAmount: typeof data.depositAmount === 'number' ? data.depositAmount : undefined,
          location: typeof data.location === 'string' ? data.location : undefined,
          description: typeof data.description === 'string' ? data.description : undefined,
          marketplaceEnabled: typeof data.marketplaceEnabled === 'boolean' ? data.marketplaceEnabled : true,
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : typeof attributes.imageUrl === 'string' ? attributes.imageUrl : undefined,
          imageAlt: typeof data.imageAlt === 'string' ? data.imageAlt : typeof attributes.imageAlt === 'string' ? attributes.imageAlt : undefined,
        } as SlotRecord
      })
      .filter((slot): slot is SlotRecord => slot !== null)
    setSlots(nextSlots)
  }, [])

  const reload = useCallback(async () => {
    if (!storeId) {
      setErrorMessage('Select a workspace before managing events.')
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
      setErrorMessage('Unable to load upcoming events right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [loadServices, loadSlots, storeId])

  useEffect(() => {
    void reload()
  }, [reload])

  const uploadPhoto = useCallback(async (resolvedServiceName: string) => {
    if (photoFile) {
      if (!photoFile.type.startsWith('image/')) throw new Error('The selected file must be an image.')
      if (photoFile.size > 5 * 1024 * 1024) throw new Error('The selected file must be 5MB or smaller.')
      if (!storeId) throw new Error('No active store selected.')
      const extensionSafeName = safeFileName(photoFile.name)
      const path = `stores/${storeId}/availability/${Date.now()}-${slugify(resolvedServiceName)}-${extensionSafeName}`
      const storageRef = ref(storage, path)
      await withTimeout(uploadBytes(storageRef, photoFile, { contentType: photoFile.type || 'image/jpeg' }), 20000, 'Photo upload timed out.')
      return withTimeout(getDownloadURL(storageRef), 15000, 'Could not get uploaded photo URL in time.')
    }
    return imageUrl.trim()
  }, [imageUrl, photoFile, storeId])

  const handleCreateSlot = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!storeId || saving) return
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
    const resolvedServiceName = serviceMode === 'manual' ? manualName : selectedService?.name?.trim() ?? ''
    const resolvedServiceId = serviceMode === 'manual' ? `manual:${slugify(manualName)}` : serviceId

    if (!resolvedServiceName) {
      setErrorMessage(serviceMode === 'manual' ? 'Enter an event, service, class, or product name.' : 'Choose a service, product, or programme first.')
      return
    }
    if (serviceMode === 'catalog' && !serviceId) {
      setErrorMessage('Choose a service, product, or programme first.')
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      const uploadedImageUrl = await uploadPhoto(resolvedServiceName)
      const fallbackImageUrl = !uploadedImageUrl && !imageUrl.trim() ? selectedService?.imageUrl?.trim() || '' : ''
      const resolvedImageUrl = uploadedImageUrl || imageUrl.trim() || fallbackImageUrl
      const fallbackImageAlt = selectedService?.imageAlt?.trim() || `${resolvedServiceName} photo`
      const resolvedImageAlt = imageAlt.trim() || (resolvedImageUrl ? fallbackImageAlt : '')

      await addDoc(collection(db, 'stores', storeId, 'integrationAvailabilitySlots'), {
        storeId,
        serviceId: resolvedServiceId,
        serviceName: resolvedServiceName,
        sourceItemId: selectedService?.id || null,
        sourceItemType: selectedService?.itemType || null,
        sourceItemCollection: selectedService?.source || null,
        source: selectedService?.source || null,
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        timezone,
        capacity: nextCapacity,
        seatsBooked: 0,
        listingType: 'event',
        enrollmentMode: 'scheduled',
        eventKind,
        registrationMode,
        linkedCourseId: linkedCourseId.trim() || null,
        price: price.trim() ? Number(price) : null,
        depositAmount: depositAmount.trim() ? Number(depositAmount) : null,
        location: location.trim() || null,
        description: description.trim() || null,
        marketplaceEnabled,
        status: 'open',
        isPublic: true,
        visibleOnWebsite: true,
        imageUrl: resolvedImageUrl || null,
        imageAlt: resolvedImageAlt || null,
        attributes: {
          imageUrl: resolvedImageUrl || null,
          imageAlt: resolvedImageAlt || null,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })

      setImageUrl('')
      setImageAlt('')
      setPhotoFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (serviceMode === 'manual') setManualServiceName('')
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to create event', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create event. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [capacity, depositAmount, description, endAt, eventKind, imageAlt, imageUrl, linkedCourseId, loadSlots, location, manualServiceName, marketplaceEnabled, price, registrationMode, saving, selectedService, serviceId, serviceMap, serviceMode, startAt, storeId, timezone, uploadPhoto])

  const toggleStatus = useCallback(async (slot: SlotRecord) => {
    if (!storeId) return
    try {
      await updateDoc(doc(db, 'stores', storeId, 'integrationAvailabilitySlots', slot.id), {
        status: slot.status === 'open' ? 'closed' : 'open',
        visibleOnWebsite: slot.status !== 'open',
        updatedAt: Timestamp.now(),
      })
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to update event status', error)
      setErrorMessage('Failed to update event status.')
    }
  }, [loadSlots, serviceMap, storeId])

  const deleteSlot = useCallback(async (slotId: string) => {
    if (!storeId) return
    try {
      await deleteDoc(doc(db, 'stores', storeId, 'integrationAvailabilitySlots', slotId))
      await loadSlots(storeId, serviceMap)
    } catch (error) {
      console.error('[availability] Failed to delete event', error)
      setErrorMessage('Failed to delete event.')
    }
  }, [loadSlots, serviceMap, storeId])

  return (
    <main className="page availability-page">
      <section className="card stack gap-4">
        <header className="stack gap-1">
          <h1>Upcoming events</h1>
          <p className="bookings-page__intro">
            Create public events, classes, service sessions, intakes, or programmes that your connected website can display automatically.
          </p>
        </header>

        <form className="availability-form" onSubmit={handleCreateSlot}>
          <label><span>Event source</span><select value={serviceMode} onChange={event => setServiceMode(event.target.value === 'manual' ? 'manual' : 'catalog')}><option value="catalog">Select existing service/product</option><option value="manual">Manual event/class name</option></select></label>
          {serviceMode === 'catalog' ? (
            <label><span>Service, product, or programme</span><select value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Select item</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          ) : (
            <label><span>Event, class, or programme name</span><input value={manualServiceName} onChange={event => setManualServiceName(event.target.value)} placeholder="e.g. Hair Braiding" required={serviceMode === 'manual'} /></label>
          )}
          <label><span>Start</span><input type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} required /></label>
          <label><span>End</span><input type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} required /></label>
          <label><span>Timezone</span><input value={timezone} onChange={event => setTimezone(event.target.value)} required /></label>
          <label><span>Event kind</span><select value={eventKind} onChange={event => setEventKind(event.target.value as EventKind)}><option value="intake">Intake</option><option value="class">Class</option><option value="workshop">Workshop</option><option value="event">Event</option><option value="trip">Trip</option></select></label>
          <label><span>Registration mode</span><select value={registrationMode} onChange={event => setRegistrationMode(event.target.value as RegistrationMode)}><option value="paid">Paid</option><option value="free">Free</option><option value="deposit">Deposit</option><option value="enquiry">Enquiry</option></select></label>
          <label><span>Linked course ID (optional)</span><input value={linkedCourseId} onChange={event => setLinkedCourseId(event.target.value)} placeholder="e.g. german-b1-course" /></label>
          <label><span>Capacity / limit</span><input type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} required /></label>
          <label><span>Price (optional)</span><input type="number" min={0} step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
          <label><span>Deposit amount (optional)</span><input type="number" min={0} step="0.01" value={depositAmount} onChange={event => setDepositAmount(event.target.value)} /></label>
          <label><span>Location (optional)</span><input value={location} onChange={event => setLocation(event.target.value)} /></label>
          <label><span>Description (optional)</span><input value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label><span>Marketplace enabled</span><select value={marketplaceEnabled ? 'yes' : 'no'} onChange={event => setMarketplaceEnabled(event.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No</option></select></label>
          <div className="availability-photo-picker">
            <span>Photo upload</span>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={event => setPhotoFile(event.target.files?.[0] ?? null)} />
            <div className="availability-photo-actions">
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload photo</button>
              {photoFile && <button type="button" className="btn btn-secondary" onClick={() => { setPhotoFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>Remove photo</button>}
            </div>
            <p className="availability-photo-name">{photoFile ? `Selected: ${photoFile.name}` : 'No file selected yet.'}</p>
            {previewUrl && <img className="availability-photo-preview" src={previewUrl} alt="Selected upload preview" />}
          </div>
          <label><span>Or image URL</span><input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://..." /></label>
          <label><span>Image alt text</span><input value={imageAlt} onChange={event => setImageAlt(event.target.value)} placeholder="Short photo description" /></label>
          <button className="btn btn-secondary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button>
        </form>

        {loading && <p className="form__hint">Loading events…</p>}
        {errorMessage && <p className="form__error">{errorMessage}</p>}

        {!loading && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Photo</th><th>Event</th><th>Start</th><th>End</th><th>Status</th><th>Limit</th><th>Booked</th><th>Actions</th></tr></thead>
              <tbody>
                {slots.map(slot => (
                  <tr key={slot.id}>
                    <td>{slot.imageUrl ? <img src={slot.imageUrl} alt={slot.imageAlt || slot.serviceName} style={{ width: 58, height: 46, objectFit: 'cover', borderRadius: 10 }} /> : '—'}</td>
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
