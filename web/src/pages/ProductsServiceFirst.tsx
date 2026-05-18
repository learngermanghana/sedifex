import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import './Products.css'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import type { ItemType, Product } from '../types/product'

type ItemFormType = 'product' | 'service' | 'course'
type ServiceKind = 'appointment' | 'consultation' | 'quote_request'
type CourseMode = 'online' | 'in_person' | 'hybrid'

type Draft = {
  name: string
  itemType: ItemFormType
  category: string
  price: string
  costPrice: string
  description: string
  sku: string
  openingStock: string
  reorderPoint: string
  expiryDate: string
  imageUrl: string
  imageAlt: string
  serviceKind: ServiceKind
  durationMinutes: string
  location: string
  requiresDateTime: boolean
  requiresNotes: boolean
  requiresDestinationOrTopic: boolean
  allowDepositPayment: boolean
  depositAmount: string
  courseLevel: string
  registrationFee: string
  duration: string
  courseMode: CourseMode
  classTimes: string
}

const PRODUCT_CATEGORY = 'General Products'
const SERVICE_CATEGORY = 'General Services'
const EDUCATION_CATEGORY = 'Education'

const PRODUCT_CATEGORIES = [
  PRODUCT_CATEGORY,
  'Skin Care',
  'Hair Care',
  'Supplements',
  'Food & Beverages',
  'Household',
  'Electronics',
  'Fashion',
]

const SERVICE_CATEGORIES = [
  SERVICE_CATEGORY,
  'Beauty Services',
  'Spa Services',
  'Hair Services',
  'Training / Classes',
  'Consultation',
  'Repairs',
  'Delivery Services',
]

const COURSE_CATEGORIES = [
  EDUCATION_CATEGORY,
  'Language Classes',
  'Beauty Training',
  'Professional Training',
  'Online Course',
  'In-Person Course',
  'Workshop',
  'Certification',
]

const blankDraft: Draft = {
  name: '',
  itemType: 'product',
  category: PRODUCT_CATEGORY,
  price: '',
  costPrice: '',
  description: '',
  sku: '',
  openingStock: '',
  reorderPoint: '',
  expiryDate: '',
  imageUrl: '',
  imageAlt: '',
  serviceKind: 'appointment',
  durationMinutes: '',
  location: '',
  requiresDateTime: false,
  requiresNotes: false,
  requiresDestinationOrTopic: false,
  allowDepositPayment: false,
  depositAmount: '',
  courseLevel: '',
  registrationFee: '',
  duration: '',
  courseMode: 'in_person',
  classTimes: '',
}

function titleCase(value: string) {
  return value.trim().toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

function cleanNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof (value as any)?.toDate === 'function') {
    const parsed = (value as any).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function formatDateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : ''
}

function formatMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `GHS ${value.toFixed(2)}` : '—'
}

function normalizeCategory(value: unknown, itemType: ItemType | ItemFormType) {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  const lowered = raw.toLowerCase()
  if (itemType === 'course') {
    if (!raw || lowered === 'general product' || lowered === 'general products' || lowered === 'general service' || lowered === 'general services') return EDUCATION_CATEGORY
    return titleCase(raw)
  }
  if (itemType === 'service') {
    if (!raw || lowered === 'general product' || lowered === 'general products') return SERVICE_CATEGORY
    return titleCase(raw)
  }
  if (!raw || lowered === 'general service' || lowered === 'general services' || lowered === 'education') return PRODUCT_CATEGORY
  return titleCase(raw)
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

function generateItemDescription(draft: Draft): string {
  const itemName = titleCase(draft.name.trim()) || (draft.itemType === 'course' ? 'This course' : draft.itemType === 'service' ? 'This service' : 'This product')
  const category = normalizeCategory(draft.category, draft.itemType)
  const locationText = draft.location.trim()

  if (draft.itemType === 'course') {
    const level = draft.courseLevel.trim() || 'all levels'
    const duration = draft.duration.trim()
    const mode = draft.courseMode === 'online' ? 'online' : draft.courseMode === 'hybrid' ? 'in online and in-person formats' : 'in person'
    const classTimes = draft.classTimes.trim()
    const fee = cleanNumber(draft.price)
    const feeText = fee !== null ? ` The course fee is GHS ${fee.toFixed(2)}.` : ''
    return `${itemName} is a ${level} ${category.toLowerCase()} programme designed for learners who want practical and structured progress. It includes guided lessons and class support to help students build confidence step by step${duration ? ` over ${duration}` : ''}. Classes are offered ${mode}${locationText ? ` at ${locationText}` : ''}${classTimes ? `, with sessions scheduled ${classTimes}` : ''}.${feeText}`.replace(/\s+/g, ' ').trim()
  }

  if (draft.itemType === 'service') {
    const duration = cleanNumber(draft.durationMinutes)
    const kind = draft.serviceKind === 'consultation' ? 'consultation service' : draft.serviceKind === 'quote_request' ? 'service available by quote request' : 'service designed for booked appointments'
    return `${itemName} is a ${kind} that supports customers who want professional and reliable support. ${duration ? `Typical session time is about ${duration} minutes. ` : ''}${locationText ? `It is offered at ${locationText}, and ` : ''}customers can request a preferred date and time while the store confirms availability.`.replace(/\s+/g, ' ').trim()
  }

  const fee = cleanNumber(draft.price)
  const feeText = fee !== null ? ` The current listed price is GHS ${fee.toFixed(2)}.` : ''
  return `${itemName} is available from the store for customers who want a reliable and convenient purchase option. It belongs to the ${category.toLowerCase()} category and can be ordered based on availability.${feeText}`.replace(/\s+/g, ' ').trim()
}

function improveDescription(text: string): string {
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/---+/g, ' ')
    .replace(/[•·▪◦]/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''
  const sentences = splitSentences(cleaned)
  if (sentences.length >= 2) return sentences.slice(0, 4).join(' ')
  const chunks = cleaned.split(/,\s+/).map(chunk => chunk.trim()).filter(Boolean).slice(0, 4)
  const rebuilt = chunks.join('. ')
  return rebuilt.endsWith('.') ? rebuilt : `${rebuilt}.`
}

function normalizeProduct(id: string, data: Record<string, unknown>): Product {
  const itemType: ItemType = data.itemType === 'service' ? 'service' : 'product'
  const itemFormType: ItemFormType = itemType === 'service' && data.listingType === 'course' ? 'course' : itemType
  const name = typeof data.name === 'string' && data.name.trim() ? titleCase(data.name) : 'Untitled item'
  const imageUrl = typeof data.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl.trim() : null
  return {
    id,
    name,
    itemType,
    category: normalizeCategory(data.category, itemFormType),
    description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
    sku: itemType === 'product' && typeof data.sku === 'string' && data.sku.trim() ? data.sku.trim() : null,
    barcode: itemType === 'product' && typeof data.barcode === 'string' && data.barcode.trim() ? data.barcode.trim() : null,
    price: cleanNumber(data.price),
    costPrice: itemType === 'product' ? cleanNumber(data.costPrice) : null,
    stockCount: itemType === 'product' ? cleanNumber(data.stockCount) : null,
    reorderPoint: itemType === 'product' ? cleanNumber(data.reorderPoint ?? data.reorderLevel) : null,
    taxRate: cleanNumber(data.taxRate),
    expiryDate: itemType === 'product' ? toDate(data.expiryDate) : null,
    productionDate: itemType === 'product' ? toDate(data.productionDate) : null,
    manufacturerName: itemType === 'product' && typeof data.manufacturerName === 'string' ? data.manufacturerName : null,
    batchNumber: itemType === 'product' && typeof data.batchNumber === 'string' ? data.batchNumber : null,
    showOnReceipt: itemType === 'product' && data.showOnReceipt === true,
    imageUrl,
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls.filter((item): item is string => typeof item === 'string') : imageUrl ? [imageUrl] : [],
    imageAlt: typeof data.imageAlt === 'string' && data.imageAlt.trim() ? data.imageAlt.trim() : name,
    lastReceiptAt: data.lastReceiptAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sortOrder: cleanNumber(data.sortOrder),
  }
}

function buildSavePayload(draft: Draft, storeId: string) {
  const isService = draft.itemType === 'service'
  const isCourse = draft.itemType === 'course'
  const behavesLikeService = isService || isCourse
  const name = titleCase(draft.name)
  const category = normalizeCategory(draft.category, isCourse ? 'course' : isService ? 'service' : 'product')
  const price = cleanNumber(draft.price)
  if (!name) throw new Error('Name is required.')
  if (price === null) throw new Error('Price is required.')

  const serviceKind: ServiceKind = isCourse ? 'appointment' : draft.serviceKind
  const salesMode = isCourse ? 'register' : serviceKind === 'quote_request' ? 'request_quote' : 'book_now'

  return {
    storeId,
    name,
    itemType: behavesLikeService ? 'service' : 'product',
    listingType: isCourse ? 'course' : behavesLikeService ? 'service' : 'product',
    serviceKind: isCourse ? 'course_enrollment' : serviceKind,
    salesMode,
    enrollmentMode: isCourse ? 'always_open' : null,
    category,
    description: draft.description.trim() || null,
    price,
    costPrice: behavesLikeService ? null : cleanNumber(draft.costPrice),
    sku: behavesLikeService ? null : draft.sku.trim() || null,
    barcode: behavesLikeService ? null : draft.sku.trim() || null,
    stockCount: behavesLikeService ? null : cleanNumber(draft.openingStock),
    reorderPoint: behavesLikeService ? null : cleanNumber(draft.reorderPoint),
    expiryDate: behavesLikeService || !draft.expiryDate ? null : new Date(draft.expiryDate),
    durationMinutes: isService ? cleanNumber(draft.durationMinutes) : null,
    location: behavesLikeService ? draft.location.trim() || null : null,
    requiresDateTime: isService ? draft.requiresDateTime : null,
    requiresNotes: isService ? draft.requiresNotes : null,
    requiresDestinationOrTopic: isService ? draft.requiresDestinationOrTopic : null,
    allowDepositPayment: behavesLikeService ? draft.allowDepositPayment : null,
    depositAmount: behavesLikeService ? cleanNumber(draft.depositAmount) : null,
    courseLevel: isCourse ? draft.courseLevel.trim() || null : null,
    registrationFee: isCourse ? cleanNumber(draft.registrationFee) : null,
    duration: isCourse ? draft.duration.trim() || null : null,
    courseMode: isCourse ? draft.courseMode : null,
    classTimes: isCourse ? draft.classTimes.trim() || null : null,
    productionDate: null,
    manufacturerName: null,
    batchNumber: null,
    showOnReceipt: false,
    imageUrl: draft.imageUrl.trim() || null,
    imageUrls: draft.imageUrl.trim() ? [draft.imageUrl.trim()] : [],
    imageAlt: draft.imageAlt.trim() || name,
    updatedAt: serverTimestamp(),
  }
}

export default function ProductsServiceFirst() {
  const { storeId } = useActiveStore()
  const { memberships } = useMemberships()
  const [items, setItems] = useState<Product[]>([])
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const activeMembership = useMemo(() => memberships.find(member => member.storeId === storeId) ?? null, [memberships, storeId])
  const canManage = activeMembership?.role === 'owner'
  const isService = draft.itemType === 'service'
  const isCourse = draft.itemType === 'course'
  const behavesLikeService = isService || isCourse
  const categoryOptions = draft.itemType === 'course' ? COURSE_CATEGORIES : draft.itemType === 'service' ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES

  useEffect(() => {
    if (!storeId) {
      setItems([])
      return
    }
    const q = query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('updatedAt', 'desc'), limit(500))
    return onSnapshot(q, snapshot => {
      const rows = snapshot.docs.map(documentSnapshot => normalizeProduct(documentSnapshot.id, documentSnapshot.data() as Record<string, unknown>))
      setItems(rows)
    })
  }, [storeId])

  function updateDraft(key: keyof Draft, value: string) {
    setDraft(current => {
      if (key === 'itemType') {
        const nextItemType = value as ItemFormType
        const currentCategory = normalizeCategory(current.category, current.itemType)
        const shouldSwitchToProduct = nextItemType === 'product' && (currentCategory === SERVICE_CATEGORY || currentCategory === EDUCATION_CATEGORY)
        const shouldSwitchToService = nextItemType === 'service' && (currentCategory === PRODUCT_CATEGORY || currentCategory === EDUCATION_CATEGORY)
        const shouldSwitchToCourse = nextItemType === 'course' && (currentCategory === PRODUCT_CATEGORY || currentCategory === SERVICE_CATEGORY)
        return {
          ...current,
          itemType: nextItemType,
          category: shouldSwitchToProduct
            ? PRODUCT_CATEGORY
            : shouldSwitchToService
            ? SERVICE_CATEGORY
            : shouldSwitchToCourse
            ? EDUCATION_CATEGORY
            : normalizeCategory(current.category, nextItemType),
          sku: nextItemType === 'product' ? current.sku : '',
          openingStock: nextItemType === 'product' ? current.openingStock : '',
          reorderPoint: nextItemType === 'product' ? current.reorderPoint : '',
          expiryDate: nextItemType === 'product' ? current.expiryDate : '',
          costPrice: nextItemType === 'product' ? current.costPrice : '',
        }
      }
      return { ...current, [key]: value }
    })
  }

  function resetForm() {
    setEditingId(null)
    setDraft(blankDraft)
    setError('')
  }

  function editItem(item: Product) {
    const itemType: ItemFormType = item.itemType === 'service' ? ((item as any).listingType === 'course' ? 'course' : 'service') : 'product'
    setEditingId(item.id)
    setDraft({
      name: item.name,
      itemType,
      category: normalizeCategory(item.category, itemType),
      price: typeof item.price === 'number' ? String(item.price) : '',
      costPrice: itemType === 'product' && typeof item.costPrice === 'number' ? String(item.costPrice) : '',
      description: item.description ?? '',
      sku: itemType === 'product' ? item.sku ?? item.barcode ?? '' : '',
      openingStock: itemType === 'product' && typeof item.stockCount === 'number' ? String(item.stockCount) : '',
      reorderPoint: itemType === 'product' && typeof item.reorderPoint === 'number' ? String(item.reorderPoint) : '',
      expiryDate: itemType === 'product' ? formatDateInput(item.expiryDate) : '',
      imageUrl: item.imageUrl ?? '',
      imageAlt: item.imageAlt ?? item.name,
      serviceKind: ((item as any).serviceKind as ServiceKind) ?? 'appointment',
      durationMinutes: typeof (item as any).durationMinutes === 'number' ? String((item as any).durationMinutes) : '',
      location: typeof (item as any).location === 'string' ? (item as any).location : '',
      requiresDateTime: (item as any).requiresDateTime === true,
      requiresNotes: (item as any).requiresNotes === true,
      requiresDestinationOrTopic: (item as any).requiresDestinationOrTopic === true,
      allowDepositPayment: (item as any).allowDepositPayment === true,
      depositAmount: typeof (item as any).depositAmount === 'number' ? String((item as any).depositAmount) : '',
      courseLevel: typeof (item as any).courseLevel === 'string' ? (item as any).courseLevel : '',
      registrationFee: typeof (item as any).registrationFee === 'number' ? String((item as any).registrationFee) : '',
      duration: typeof (item as any).duration === 'string' ? (item as any).duration : '',
      courseMode: ((item as any).courseMode as CourseMode) ?? 'in_person',
      classTimes: typeof (item as any).classTimes === 'string' ? (item as any).classTimes : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !canManage) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = buildSavePayload(draft as any, storeId)
      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), payload)
        setMessage(`${draft.itemType === 'service' ? 'Service' : 'Product'} updated.`)
      } else {
        await setDoc(doc(collection(db, 'products')), {
          ...payload,
          createdAt: serverTimestamp(),
          sortOrder: items.length + 1,
        })
        setMessage(`${draft.itemType === 'service' ? 'Service' : 'Product'} added.`)
      }
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save item.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item: Product) {
    if (!canManage) return
    if (!window.confirm(`Delete ${item.name}?`)) return
    await deleteDoc(doc(db, 'products', item.id))
    setMessage(`${item.itemType === 'service' ? 'Service' : 'Product'} deleted.`)
  }

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter(item => [item.name, item.category ?? '', item.sku ?? '', item.itemType].join(' ').toLowerCase().includes(term))
  }, [items, search])

  return (
    <div className="page products-page">
      <header className="page__header products-page__header">
        <div>
          <h2 className="page__title">Items</h2>
          <p className="page__subtitle">Manage products, services, and courses/programmes with the right fields for each type.</p>
        </div>
      </header>

      <div className="products-page__grid">
        <section className="card products-page__add-card">
          <h3 className="card__title">{editingId ? 'Edit item' : 'Add item'}</h3>
          <p className="card__subtitle">
            {isCourse
              ? 'Course/programme mode is for always-open enrollments. Use Upcoming events to create specific batches/intakes for this course.'
              : isService
              ? 'Service mode supports booking and quote requests. Stock fields are hidden.'
              : 'Product mode includes inventory fields like SKU, opening stock, reorder point, and expiry date.'}
          </p>
          {!canManage ? <p className="products__message products__message--error">Only the workspace owner can manage items.</p> : null}
          {message ? <p className="products__message products__message--success">{message}</p> : null}
          {error ? <p className="products__message products__message--error">{error}</p> : null}

          <form className="form" onSubmit={saveItem}>
            <div className="field">
              <label className="field__label" htmlFor="item-type">Item type</label>
              <select id="item-type" value={draft.itemType} onChange={event => updateDraft('itemType', event.target.value)}>
                <option value="product">Physical product</option>
                <option value="service">Service</option>
                <option value="course">Course / Programme</option>
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="item-name">{isCourse ? 'Course / programme name' : isService ? 'Service name' : 'Product name'}</label>
              <input id="item-name" value={draft.name} onChange={event => updateDraft('name', event.target.value)} required />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="item-category">{behavesLikeService ? 'Category' : 'Product category'}</label>
              <input
                id="item-category"
                value={draft.category}
                onChange={event => updateDraft('category', event.target.value)}
                onBlur={event => updateDraft('category', normalizeCategory(event.target.value, draft.itemType))}
                list="item-category-options"
              />
              <datalist id="item-category-options">
                {categoryOptions.map(category => <option key={category} value={category} />)}
              </datalist>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="item-price">{isCourse ? 'Fee' : isService ? 'Price' : 'Selling price'}</label>
              <input id="item-price" type="number" min="0" step="0.01" value={draft.price} onChange={event => updateDraft('price', event.target.value)} required />
            </div>

            {!behavesLikeService ? (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="item-sku">SKU / Barcode</label>
                  <input id="item-sku" value={draft.sku} onChange={event => updateDraft('sku', event.target.value)} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="item-cost">Cost price</label>
                  <input id="item-cost" type="number" min="0" step="0.01" value={draft.costPrice} onChange={event => updateDraft('costPrice', event.target.value)} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="item-stock">Opening / current stock</label>
                  <input id="item-stock" type="number" min="0" step="1" value={draft.openingStock} onChange={event => updateDraft('openingStock', event.target.value)} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="item-reorder">Reorder point</label>
                  <input id="item-reorder" type="number" min="0" step="1" value={draft.reorderPoint} onChange={event => updateDraft('reorderPoint', event.target.value)} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="item-expiry">Expiry date</label>
                  <input id="item-expiry" type="date" value={draft.expiryDate} onChange={event => updateDraft('expiryDate', event.target.value)} />
                </div>
              </>
            ) : null}

            {isService ? <div className="field"><label className="field__label" htmlFor="service-kind">Service kind</label><select id="service-kind" value={draft.serviceKind} onChange={event => updateDraft('serviceKind', event.target.value)}><option value="appointment">Appointment</option><option value="consultation">Consultation</option><option value="quote_request">Quote request</option></select></div> : null}
            {isService ? <div className="field"><label className="field__label" htmlFor="service-duration">Duration minutes</label><input id="service-duration" type="number" min="0" step="1" value={draft.durationMinutes} onChange={event => updateDraft('durationMinutes', event.target.value)} /></div> : null}
            {behavesLikeService ? <div className="field"><label className="field__label" htmlFor="service-location">Branch / location</label><input id="service-location" value={draft.location} onChange={event => updateDraft('location', event.target.value)} /></div> : null}
            {isCourse ? <div className="field"><label className="field__label" htmlFor="course-level">Course level</label><input id="course-level" value={draft.courseLevel} onChange={event => updateDraft('courseLevel', event.target.value)} /></div> : null}
            {isCourse ? <div className="field"><label className="field__label" htmlFor="course-regfee">Registration fee / deposit</label><input id="course-regfee" type="number" min="0" step="0.01" value={draft.registrationFee} onChange={event => updateDraft('registrationFee', event.target.value)} /></div> : null}
            {isCourse ? <div className="field"><label className="field__label" htmlFor="course-duration">Duration</label><input id="course-duration" value={draft.duration} onChange={event => updateDraft('duration', event.target.value)} /></div> : null}
            {isCourse ? <div className="field"><label className="field__label" htmlFor="course-mode">Mode</label><select id="course-mode" value={draft.courseMode} onChange={event => updateDraft('courseMode', event.target.value)}><option value="online">Online</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></div> : null}
            {isCourse ? <div className="field"><label className="field__label" htmlFor="course-times">Class times</label><input id="course-times" value={draft.classTimes} onChange={event => updateDraft('classTimes', event.target.value)} /></div> : null}
            <div className="field">
              <div className="products-page__label-row">
                <label className="field__label" htmlFor="item-description">{behavesLikeService ? 'Description' : 'Product description'}</label>
                <div className="products-page__description-actions">
                  <button
                    type="button"
                    className="button button--ghost products-page__helper-button"
                    onClick={() => {
                      if (!draft.name.trim()) {
                        setError('Enter the item name first.')
                        return
                      }
                      if (draft.description.trim() && !window.confirm('Replace the current description with a generated one?')) return
                      setError('')
                      updateDraft('description', generateItemDescription(draft))
                    }}
                  >
                    Generate with AI
                  </button>
                  <button
                    type="button"
                    className="button button--ghost products-page__helper-button"
                    onClick={() => {
                      const improved = improveDescription(draft.description)
                      if (!improved) return
                      setError('')
                      updateDraft('description', improved)
                    }}
                  >
                    Improve text
                  </button>
                </div>
              </div>
              <textarea id="item-description" rows={4} value={draft.description} onChange={event => updateDraft('description', event.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="item-image">Image URL</label>
              <input id="item-image" type="url" value={draft.imageUrl} onChange={event => updateDraft('imageUrl', event.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="item-image-file">Browse image</label>
              <input
                id="item-image-file"
                type="file"
                accept="image/*"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const result = typeof reader.result === 'string' ? reader.result : ''
                    if (result) updateDraft('imageUrl', result)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="item-image-alt">Image alt text</label>
              <input id="item-image-alt" value={draft.imageAlt} onChange={event => updateDraft('imageAlt', event.target.value)} />
            </div>
            <div className="products-page__list-actions">
              <button type="submit" className="button button--primary" disabled={saving || !canManage}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}</button>
              {editingId ? <button type="button" className="button button--ghost" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </section>

        <section className="card products-page__list-card">
          <div className="products-page__list-header">
            <div className="field field--inline">
              <label className="field__label" htmlFor="items-search">Search</label>
              <input id="items-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products or services" />
            </div>
          </div>

          <div className="products-page__list" aria-live="polite">
            {visibleItems.map(item => {
              const itemIsService = item.itemType === 'service'
              return (
                <article key={item.id} className="products-page__list-card">
                  <header className="products-page__list-card__header">
                    <div className="products-page__thumb-wrap">
                      {item.imageUrl ? <img className="products-page__thumb" src={item.imageUrl} alt={item.imageAlt ?? item.name} /> : <div className="products-page__thumb products-page__thumb--placeholder">No image</div>}
                    </div>
                    <div className="products-page__list-title">
                      <h4>{item.name}</h4>
                      <span className="products-page__badge products-page__badge--muted">{itemIsService ? 'Service' : 'Product'}</span>
                      <span className="products-page__list-value">{normalizeCategory(item.category, item.itemType)}</span>
                    </div>
                    <div className="products-page__list-meta">
                      <span className="products-page__meta-label">Price</span>
                      <span>{formatMoney(item.price)}</span>
                    </div>
                  </header>

                  <div className="products-page__list-grid">
                    {itemIsService ? (
                      <>
                        <div className="products-page__list-field"><label className="field__label">Service category</label><p className="products-page__list-value">{normalizeCategory(item.category, item.itemType)}</p></div>
                        <div className="products-page__list-field"><label className="field__label">Booking / service item</label><p className="products-page__list-value">No stock tracking</p></div>
                      </>
                    ) : (
                      <>
                        <div className="products-page__list-field"><label className="field__label">Product category</label><p className="products-page__list-value">{normalizeCategory(item.category, item.itemType)}</p></div>
                        <div className="products-page__list-field"><label className="field__label">SKU / Barcode</label><p className="products-page__list-value">{item.sku || item.barcode || '—'}</p></div>
                        <div className="products-page__list-field"><label className="field__label">On hand</label><p className="products-page__list-value">{item.stockCount ?? 0}</p></div>
                        <div className="products-page__list-field"><label className="field__label">Reorder point</label><p className="products-page__list-value">{item.reorderPoint ?? '—'}</p></div>
                        <div className="products-page__list-field"><label className="field__label">Expiry</label><p className="products-page__list-value">{item.expiryDate ? item.expiryDate.toLocaleDateString() : '—'}</p></div>
                      </>
                    )}
                    <div className="products-page__list-field"><label className="field__label">Description</label><p className="products-page__list-value">{item.description || '—'}</p></div>
                  </div>

                  <div className="products-page__list-actions">
                    {canManage ? <button type="button" className="button button--ghost" onClick={() => editItem(item)}>Edit</button> : null}
                    {canManage ? <button type="button" className="button button--danger" onClick={() => void deleteItem(item)}>Delete</button> : null}
                  </div>
                </article>
              )
            })}
            {visibleItems.length === 0 ? <div className="empty-state"><h3 className="empty-state__title">No items found</h3><p>Add a product or service to get started.</p></div> : null}
          </div>
        </section>
      </div>
    </div>
  )
}
