import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import './Products.css'
import { requestAiAdvisor } from '../api/aiAdvisor'
import { ProductImageUploadError, uploadProductImage } from '../api/productImageUpload'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import type { ItemType, Product } from '../types/product'
import { productMatchesSearch } from '../utils/productSearch'

type ItemFormType = 'product' | 'service' | 'course'
type ServiceKind = 'consultation' | 'quote_request'
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
  brand: string
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
  branch: string
  preferredTimes: string
  startDate: string
  fullFee: string
  capacity: string
  requirements: string
  starterItems: string
  certificateIncluded: boolean
  Agreement: string
  courseMode: CourseMode
  classTimes: string
  isPublished: boolean
  isMarketplaceVisible: boolean
  isWebsiteVisible: boolean
}

type ListingType = 'product' | 'service' | 'course'
type SalesMode = 'buy_now' | 'book_now' | 'register' | 'request_quote'

const PRODUCT_CATEGORY = 'General Products'
const SERVICE_CATEGORY = 'General Services'
const EDUCATION_CATEGORY = 'Education'

const PRODUCT_CATEGORIES = [
  PRODUCT_CATEGORY,
  'Skin Care',
  'Hair Care',
  'Supplements',
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
  brand: '',
  serviceKind: 'consultation',
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
  branch: '',
  preferredTimes: '',
  startDate: '',
  fullFee: '',
  capacity: '',
  requirements: '',
  starterItems: '',
  certificateIncluded: false,
  Agreement: '',
  courseMode: 'in_person',
  classTimes: '',
  isPublished: false,
  isMarketplaceVisible: false,
  isWebsiteVisible: false,
}

function titleCase(value: string) {
  return value.trim().toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

function cleanNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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


function cleanSavedDescription(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[•·▪◦]/g, '-')
    .replace(/^\s*[-–—]\s*$/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '**$1**')
    .replace(/\s-\s(?=\*\*[^*]{1,80}:)/g, '\n- ')
    .replace(/\*\*(?=[^*]{1,80}:\*\*)/g, '\n**')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function buildAiDescriptionPrompt(draft: Draft): string {
  const details = {
    name: titleCase(draft.name.trim()),
    itemType: draft.itemType,
    category: normalizeCategory(draft.category, draft.itemType),
    price: cleanNumber(draft.price),
    currency: 'GHS',
    sku: draft.sku.trim() || null,
    openingStock: cleanNumber(draft.openingStock),
    expiryDate: draft.expiryDate || null,
    serviceKind: draft.itemType === 'service' ? draft.serviceKind : null,
    durationMinutes: draft.itemType === 'service' ? cleanNumber(draft.durationMinutes) : null,
    location: draft.location.trim() || draft.branch.trim() || null,
    courseLevel: draft.itemType === 'course' ? draft.courseLevel.trim() || null : null,
    courseMode: draft.itemType === 'course' ? draft.courseMode : null,
    courseDuration: draft.itemType === 'course' ? draft.duration.trim() || null : null,
    classTimes: draft.itemType === 'course' ? draft.preferredTimes.trim() || draft.classTimes.trim() || null : null,
    requirements: draft.itemType === 'course' ? draft.requirements.trim() || null : null,
    starterItems: draft.itemType === 'course' ? draft.starterItems.trim() || null : null,
  }

  return [
    'You are writing a real customer-facing catalogue description for a Ghanaian store.',
    'Do not write a generic placeholder like “available from the store” or only mention category and price.',
    'Talk about the specific product/service/course name and what a customer can use it for.',
    'Use warm, natural, simple English. Avoid medical claims, guaranteed results, or invented ingredients/specifications.',
    'If some facts are missing, infer safe everyday uses from the name and category, but do not pretend to know exact ingredients, materials, sizes, or technical specs.',
    'Format exactly as plain text with:',
    '1) One strong opening paragraph of 2-3 sentences.',
    '2) Three benefit bullets, each starting with "-".',
    '3) One line starting with "Best for:".',
    '4) One short call-to-action line.',
    'Keep it between 120 and 220 words unless the product details require less.',
    'Item details JSON:',
    JSON.stringify(details),
  ].join('\n')
}

function getProductDescriptionAngle(itemName: string, category: string) {
  const source = `${itemName} ${category}`.toLowerCase()

  if (/skin|glow|cream|lotion|soap|serum|beauty|cosmetic|face|body/.test(source)) {
    return {
      audience: 'customers who care about looking fresh, feeling confident, and keeping their daily beauty routine simple',
      sensory: 'smooth, clean, and self-care focused',
      uses: 'daily personal care, beauty shelves, gifting, and salon or boutique recommendations',
      benefits: [
        'Supports a polished self-care routine with a product customers can easily remember and ask for again.',
        'Works well as a beauty-focused item for shoppers comparing glow, skin-care, or personal-care options.',
        'Presents neatly on your catalogue so customers understand the value before they place an order.',
      ],
    }
  }

  if (/food|drink|beverage|snack|rice|oil|spice|tea|coffee|juice/.test(source)) {
    return {
      audience: 'customers who want dependable food and beverage options for home, work, events, or everyday use',
      sensory: 'fresh, practical, and easy to enjoy',
      uses: 'daily meals, quick restocking, pantry planning, office use, and small gatherings',
      benefits: [
        'Makes shopping easier by clearly presenting what the item is and why it fits everyday needs.',
        'Helps customers choose a ready-to-order option from your food and beverage selection.',
        'Works well for repeat purchases when customers want familiar quality and convenient availability.',
      ],
    }
  }

  if (/fashion|cloth|dress|shirt|shoe|bag|watch|jewellery|jewelry|wear/.test(source)) {
    return {
      audience: 'customers who want stylish pieces that are easy to match with everyday or occasion looks',
      sensory: 'stylish, presentable, and confidence-building',
      uses: 'personal styling, gifting, events, work outfits, casual wear, and wardrobe refreshes',
      benefits: [
        'Gives shoppers a clearer idea of how the item can fit their style and daily dressing needs.',
        'Highlights the product as a practical choice for customers who want a neat, ready-to-buy fashion option.',
        'Helps your listing feel more complete so customers can decide with confidence.',
      ],
    }
  }

  if (/electronic|phone|charger|speaker|cable|adapter|laptop|device|gadget/.test(source)) {
    return {
      audience: 'customers who want useful electronics that make daily work, communication, or entertainment easier',
      sensory: 'practical, modern, and convenience-focused',
      uses: 'home use, office work, travel, school, gifting, and everyday digital needs',
      benefits: [
        'Explains the product in a way that helps customers connect it to real daily tasks.',
        'Positions the item as a convenient option for shoppers comparing useful tech accessories or devices.',
        'Makes the listing stronger by showing why the item deserves attention beyond the price alone.',
      ],
    }
  }

  return {
    audience: 'customers who want a useful, reliable item they can buy with confidence from your store',
    sensory: 'practical, neat, and customer-friendly',
    uses: 'everyday use, gifting, shop restocking, personal needs, and convenient local ordering',
    benefits: [
      'Describes the item clearly so customers understand what they are buying and why it may suit them.',
      'Helps your product stand out with more detail than a short availability note.',
      'Gives shoppers enough confidence to ask questions, place an order, or save the item for later.',
    ],
  }
}

function generateItemDescription(draft: Draft): string {
  const itemName = titleCase(draft.name.trim()) || (draft.itemType === 'course' ? 'This course' : draft.itemType === 'service' ? 'This service' : 'This product')
  const category = normalizeCategory(draft.category, draft.itemType)
  const locationText = draft.location.trim()

  if (draft.itemType === 'course') {
    const level = draft.courseLevel.trim() || 'all levels'
    const duration = draft.duration.trim()
    const mode = draft.courseMode === 'online' ? 'online' : draft.courseMode === 'hybrid' ? 'in online and in-person formats' : 'in person'
    const classTimes = draft.preferredTimes.trim() || draft.classTimes.trim()
    const fee = cleanNumber(draft.price)
    const feeText = fee !== null ? `Course fee: GHS ${fee.toFixed(2)}.` : ''
    const intro = `${itemName} is a ${level} ${category.toLowerCase()} programme designed for learners who want practical guidance, steady progress, and skills they can apply with confidence.`
    const details = `Classes are offered ${mode}${(draft.branch.trim() || locationText) ? ` at ${draft.branch.trim() || locationText}` : ''}${classTimes ? `, with sessions scheduled ${classTimes}` : ''}${duration ? `, over ${duration}` : ''}.`
    const benefits = ['- Learn through a structured programme that is easy to understand and follow.', '- Build confidence with lessons focused on practical progress, not only theory.', '- Register through the store and keep payment or enquiry records in one place.']
    return cleanSavedDescription([intro, details, ...benefits, feeText, 'Best for: learners who want a clear course option with simple registration.'].filter(Boolean).join('\n\n'))
  }

  if (draft.itemType === 'service') {
    const duration = cleanNumber(draft.durationMinutes)
    const intro = `${itemName} is a ${category.toLowerCase()} service for customers who want professional support, clear booking steps, and a dependable experience from enquiry to completion.`
    const booking = `${locationText ? `It is offered at ${locationText}. ` : ''}Customers can request or book a preferred date and time, share notes about what they need, and keep payment or appointment details organised through the store.`
    const benefits = ['- Gives customers a simple way to understand the service before booking.', '- Helps reduce back-and-forth by setting clear expectations for enquiries and appointments.', '- Works well for customers who prefer convenient ordering, booking, and follow-up.']
    const durationText = duration ? `Typical session time: about ${duration} minutes.` : ''
    return cleanSavedDescription([intro, booking, ...benefits, durationText, 'Best for: customers who want reliable service with an easy booking process.'].filter(Boolean).join('\n\n'))
  }

  const fee = cleanNumber(draft.price)
  const stockCount = cleanNumber(draft.openingStock)
  const angle = getProductDescriptionAngle(itemName, category)
  const categoryPhrase = category === PRODUCT_CATEGORY ? 'product' : `${category.toLowerCase()} item`
  const priceText = fee !== null ? `Price: GHS ${fee.toFixed(2)}.` : ''
  const stockText = stockCount !== null ? `Current stock: ${stockCount} available before new sales are recorded.` : ''
  const skuText = draft.sku.trim() ? `SKU / code: ${draft.sku.trim()}.` : ''
  const expiryText = draft.expiryDate ? `Expiry date: ${draft.expiryDate}.` : ''
  const intro = `${itemName} is a ${categoryPhrase} made for ${angle.audience}. It gives shoppers a clearer reason to choose the item by explaining how it fits real customer needs, not just that it is available.`
  const details = `With a ${angle.sensory} appeal, ${itemName} is suitable for ${angle.uses}. It can be shared in your catalogue, recommended during customer conversations, and ordered based on availability.`
  const closing = 'Best for: customers who want a clear, convenient product option and enough information to decide before buying.'
  const cta = 'Order now, ask about availability, or contact the store for guidance before purchase.'

  return cleanSavedDescription([intro, details, ...angle.benefits.map(benefit => `- ${benefit}`), priceText, stockText, skuText, expiryText, closing, cta].filter(Boolean).join('\n\n'))
}

function improveDescription(text: string): string {
  const cleaned = cleanSavedDescription(text)

  if (!cleaned) return ''

  // If the text already has useful structure, preserve it after cleaning.
  if (cleaned.includes('\n') || /^[-*]\s+/m.test(cleaned) || /\*\*[^*]+:\*\*/.test(cleaned)) {
    return cleaned
  }

  const sentences = splitSentences(cleaned)
  if (sentences.length >= 2) return sentences.slice(0, 5).join(' ')

  const chunks = cleaned
    .split(/,\s+/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .slice(0, 5)

  const rebuilt = chunks.join('. ')
  return rebuilt.endsWith('.') ? rebuilt : `${rebuilt}.`
}

function normalizeProduct(id: string, data: Record<string, unknown>): Product {
  const itemType: ItemType = data.itemType === 'course' ? 'course' : data.itemType === 'service' ? 'service' : 'product'
  const itemFormType: ItemFormType = itemType === 'course' || (itemType === 'service' && data.listingType === 'course') ? 'course' : itemType
  const name = typeof data.name === 'string' && data.name.trim() ? titleCase(data.name) : 'Untitled item'
  const imageUrl = typeof data.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl.trim() : null
  return {
    id,
    name,
    itemType,
    category: normalizeCategory(data.category, itemFormType),
    description: typeof data.description === 'string' && data.description.trim() ? cleanSavedDescription(data.description) : null,
    sku: itemType === 'product' && typeof data.sku === 'string' && data.sku.trim() ? data.sku.trim() : null,
    barcode: itemType === 'product' && typeof data.barcode === 'string' && data.barcode.trim() ? data.barcode.trim() : null,
    price: cleanNumber(data.price),
    costPrice: itemType === 'product' ? cleanNumber(data.costPrice) : null,
    stockCount: itemType === 'product' ? cleanNumber(data.stockCount) : null,
    reorderPoint: itemType === 'product' ? cleanNumber(data.reorderPoint ?? data.reorderLevel) : null,
    taxRate: cleanNumber(data.taxRate),
    expiryDate: itemType === 'product' ? toDate(data.expiryDate) : null,
    productionDate: itemType === 'product' ? toDate(data.productionDate) : null,
    brand: itemType === 'product' ? cleanText(data.brand ?? data.manufacturerName) : null,
    manufacturerName: itemType === 'product' ? cleanText(data.manufacturerName ?? data.brand) : null,
    batchNumber: itemType === 'product' && typeof data.batchNumber === 'string' ? data.batchNumber : null,
    showOnReceipt: itemType === 'product' && data.showOnReceipt === true,
    imageUrl,
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls.filter((item): item is string => typeof item === 'string') : imageUrl ? [imageUrl] : [],
    imageAlt: typeof data.imageAlt === 'string' && data.imageAlt.trim() ? data.imageAlt.trim() : name,
    isPublished: data.isPublished === true,
    status: data.status === 'published' ? 'published' : 'draft',
    isMarketplaceVisible: data.isMarketplaceVisible === true,
    isWebsiteVisible: data.isWebsiteVisible === true,
    storeId: cleanText(data.storeId),
    storeName: cleanText(data.storeName),
    currency: cleanText(data.currency),
    listingType: cleanText(data.listingType) as Product['listingType'],
    serviceKind: cleanText(data.serviceKind),
    duration: cleanText(data.duration),
    branch: cleanText(data.branch ?? data.location),
    preferredTimes: cleanText(data.preferredTimes ?? data.classTimes),
    startDate: toDate(data.startDate),
    registrationFee: cleanNumber(data.registrationFee),
    fullFee: cleanNumber(data.fullFee),
    capacity: cleanNumber(data.capacity),
    requirements: cleanText(data.requirements),
    starterItems: cleanText(data.starterItems),
    certificateIncluded: typeof data.certificateIncluded === 'boolean' ? data.certificateIncluded : null,
    Agreement: cleanText(data.Agreement),
    courseLevel: cleanText(data.courseLevel),
    courseMode: cleanText(data.courseMode),
    lastReceiptAt: data.lastReceiptAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sortOrder: cleanNumber(data.sortOrder),
  }
}

function getProductSortTime(product: Product): number {
  return toDate(product.updatedAt)?.getTime() ?? toDate(product.createdAt)?.getTime() ?? 0
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
  if (isService && !category) throw new Error('Service category is required.')
  if (isService && !['book_now', 'request_quote'].includes(draft.serviceKind === 'quote_request' ? 'request_quote' : 'book_now')) {
    throw new Error('Service sales mode is required.')
  }
  if (isCourse && !category) throw new Error('Course category is required.')
  if (isCourse && !draft.courseMode) throw new Error('Course enrollment mode is required.')

  const serviceKind: ServiceKind = isCourse ? 'consultation' : draft.serviceKind
  const listingType: ListingType = isCourse ? 'course' : isService ? 'service' : 'product'
  const salesMode: SalesMode = isCourse
    ? 'register'
    : isService
    ? serviceKind === 'quote_request'
      ? 'request_quote'
      : 'book_now'
    : 'buy_now'
  const trimmedImageUrl = draft.imageUrl.trim()
  const imageUrls = trimmedImageUrl ? [trimmedImageUrl] : []
  const currency = 'GHS'
  const categoryName = category
  const categoryKey = category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const isPublished = draft.isPublished === true
  const status: 'draft' | 'published' = isPublished ? 'published' : 'draft'
  const description = cleanSavedDescription(draft.description)
  const brand = behavesLikeService ? null : draft.brand.trim() || null

  return {
    storeId,
    storeName: null,
    name,
    itemType: isCourse ? 'course' : isService ? 'service' : 'product',
    listingType,
    serviceKind: isCourse ? 'course_enrollment' : serviceKind,
    salesMode,
    enrollmentMode: isCourse ? 'always_open' : null,
    category,
    categoryKey,
    categoryName,
    status,
    description: description || null,
    price,
    currency,
    costPrice: behavesLikeService ? null : cleanNumber(draft.costPrice),
    sku: behavesLikeService ? null : draft.sku.trim() || null,
    barcode: behavesLikeService ? null : draft.sku.trim() || null,
    stockCount: behavesLikeService ? null : cleanNumber(draft.openingStock),
    reorderPoint: behavesLikeService ? null : cleanNumber(draft.reorderPoint),
    expiryDate: behavesLikeService || !draft.expiryDate ? null : new Date(draft.expiryDate),
    durationMinutes: isService ? cleanNumber(draft.durationMinutes) : null,
    location: behavesLikeService ? (draft.branch.trim() || draft.location.trim() || null) : null,
    branch: isCourse ? draft.branch.trim() || null : null,
    requiresDateTime: isService ? draft.requiresDateTime : null,
    requiresNotes: isService ? draft.requiresNotes : null,
    requiresDestinationOrTopic: isService ? draft.requiresDestinationOrTopic : null,
    allowDepositPayment: behavesLikeService ? draft.allowDepositPayment : null,
    depositAmount: behavesLikeService ? cleanNumber(draft.depositAmount) : null,
    courseLevel: isCourse ? draft.courseLevel.trim() || null : null,
    registrationFee: isCourse ? cleanNumber(draft.registrationFee) : null,
    duration: isCourse ? draft.duration.trim() || null : null,
    preferredTimes: isCourse ? draft.preferredTimes.trim() || null : null,
    startDate: isCourse && draft.startDate ? new Date(draft.startDate) : null,
    fullFee: isCourse ? cleanNumber(draft.fullFee) ?? price : null,
    capacity: isCourse ? cleanNumber(draft.capacity) : null,
    requirements: isCourse ? draft.requirements.trim() || null : null,
    starterItems: isCourse ? draft.starterItems.trim() || null : null,
    certificateIncluded: isCourse ? draft.certificateIncluded : null,
    Agreement: isCourse ? draft.Agreement.trim() || null : null,
    courseMode: isCourse ? draft.courseMode : null,
    classTimes: isCourse ? draft.preferredTimes.trim() || draft.classTimes.trim() || null : null,
    productionDate: null,
    brand,
    manufacturerName: brand,
    batchNumber: null,
    showOnReceipt: false,
    imageUrl: trimmedImageUrl || null,
    imageUrls,
    imageAlt: draft.imageAlt.trim() || name,
    isPublished,
    isMarketplaceVisible: draft.isMarketplaceVisible,
    isWebsiteVisible: draft.isWebsiteVisible,
    featuredRank: null,
    rankingScore: null,
    updatedAt: serverTimestamp(),
  }
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
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
  const [imageUploadState, setImageUploadState] = useState<'idle' | 'uploading' | 'success' | 'failed'>('idle')
  const [imageStatusMessage, setImageStatusMessage] = useState('')
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)

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
    const q = query(collection(db, 'products'), where('storeId', '==', storeId), limit(500))
    return onSnapshot(q, snapshot => {
      const rows = snapshot.docs
        .map(documentSnapshot => normalizeProduct(documentSnapshot.id, documentSnapshot.data() as Record<string, unknown>))
        .sort((a, b) => getProductSortTime(b) - getProductSortTime(a) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
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
          branch: nextItemType === 'course' ? current.branch || current.location : current.branch,
          preferredTimes: nextItemType === 'course' ? current.preferredTimes || current.classTimes : current.preferredTimes,
          costPrice: nextItemType === 'product' ? current.costPrice : '',
        }
      }
      if (key === 'certificateIncluded') return { ...current, certificateIncluded: value === 'true' }
      return { ...current, [key]: value }
    })
  }

  async function handleGenerateDescription() {
    if (isGeneratingDescription) return
    if (!draft.name.trim()) {
      setError('Enter the item name first.')
      return
    }
    if (draft.description.trim() && !window.confirm('Replace the current description with an AI-generated one?')) return

    setError('')
    setMessage('')
    setIsGeneratingDescription(true)
    try {
      const response = await requestAiAdvisor({
        question: buildAiDescriptionPrompt(draft),
        storeId: storeId ?? undefined,
        jsonContext: { source: 'products-service-first-description', draft },
      })
      const generated = cleanSavedDescription(typeof response.advice === 'string' ? response.advice : '')
      if (!generated) throw new Error('AI returned an empty description.')
      updateDraft('description', generated)
      setMessage('AI generated a richer description. Review and edit before saving.')
    } catch (aiError) {
      console.error('[products-service-first] AI description generation failed', aiError)
      updateDraft('description', generateItemDescription(draft))
      setError('AI could not be reached, so a richer local draft was generated instead. You can edit it before saving.')
    } finally {
      setIsGeneratingDescription(false)
    }
  }

  function resetForm() {
    setEditingId(null)
    setDraft(current => ({
      ...blankDraft,
      itemType: current.itemType === 'service' ? 'service' : current.itemType === 'course' ? 'course' : 'product',
      category: current.itemType === 'service' ? SERVICE_CATEGORY : current.itemType === 'course' ? EDUCATION_CATEGORY : PRODUCT_CATEGORY,
      serviceKind: current.itemType === 'service' ? current.serviceKind : 'consultation',
      isMarketplaceVisible: current.isMarketplaceVisible,
      isWebsiteVisible: current.isWebsiteVisible,
    }))
    setError('')
    setImageUploadState('idle')
    setImageStatusMessage('')
  }

  function editItem(item: Product) {
    const itemType: ItemFormType = item.itemType === 'course' || (item.itemType === 'service' && item.listingType === 'course') ? 'course' : item.itemType === 'service' ? 'service' : 'product'
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
      brand: item.itemType === 'product' ? (item.brand ?? item.manufacturerName ?? '') : '',
      serviceKind: ((item as any).serviceKind === 'quote_request' ? 'quote_request' : 'consultation') as ServiceKind,
      durationMinutes: typeof (item as any).durationMinutes === 'number' ? String((item as any).durationMinutes) : '',
      location: typeof (item as any).location === 'string' ? (item as any).location : '',
      requiresDateTime: (item as any).requiresDateTime === true,
      requiresNotes: (item as any).requiresNotes === true,
      requiresDestinationOrTopic: (item as any).requiresDestinationOrTopic === true,
      allowDepositPayment: (item as any).allowDepositPayment === true,
      depositAmount: typeof (item as any).depositAmount === 'number' ? String((item as any).depositAmount) : '',
      courseLevel: typeof (item as any).courseLevel === 'string' ? (item as any).courseLevel : '',
      registrationFee: typeof item.registrationFee === 'number' ? String(item.registrationFee) : '',
      duration: typeof item.duration === 'string' ? item.duration : '',
      branch: item.branch ?? (typeof (item as any).location === 'string' ? (item as any).location : ''),
      preferredTimes: item.preferredTimes ?? (typeof (item as any).classTimes === 'string' ? (item as any).classTimes : ''),
      startDate: formatDateInput(item.startDate),
      fullFee: typeof item.fullFee === 'number' ? String(item.fullFee) : typeof item.price === 'number' ? String(item.price) : '',
      capacity: typeof item.capacity === 'number' ? String(item.capacity) : '',
      requirements: item.requirements ?? '',
      starterItems: item.starterItems ?? '',
      certificateIncluded: item.certificateIncluded === true,
      Agreement: item.Agreement ?? '',
      courseMode: ((item as any).courseMode as CourseMode) ?? 'in_person',
      classTimes: item.preferredTimes ?? (typeof (item as any).classTimes === 'string' ? (item as any).classTimes : ''),
      isPublished: (item as any).isPublished !== false,
      isMarketplaceVisible: (item as any).isMarketplaceVisible === true,
      isWebsiteVisible: (item as any).isWebsiteVisible !== false,
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
      if (!editingId) {
        const possibleDuplicate = items.find(item => {
          const existingStoreId = typeof (item as Product & { storeId?: unknown }).storeId === 'string'
            ? ((item as Product & { storeId?: string }).storeId as string)
            : storeId
          if (existingStoreId !== storeId) return false
          const existingListingType = item.listingType ?? item.itemType
          return (
            normalizeName(item.name) === normalizeName(payload.name) &&
            existingListingType === payload.listingType &&
            normalizeName(item.category ?? '') === normalizeName(payload.categoryName ?? '') &&
            Number(item.price ?? -1) === Number(payload.price)
          )
        })
        if (possibleDuplicate) {
          const shouldCreateAnyway = window.confirm(
            'Possible duplicate found: this store already has a similar product/course/service. Review before creating another one.\n\nClick OK to "Create anyway", or Cancel to edit the existing item.',
          )
          if (!shouldCreateAnyway) {
            editItem(possibleDuplicate)
            throw new Error('Duplicate prevented. You can edit the existing item instead.')
          }
        }
      }
      const imageUploadPending = draft.imageUrl.startsWith('data:image/')
      const draftPayload = {
        ...payload,
        status: 'draft',
        isPublished: false,
      }
      const publishPayload = payload.isPublished
        ? {
            ...payload,
            status: 'published',
            publishedAt: serverTimestamp(),
          }
        : null

      if (editingId) {
        const itemRef = doc(db, 'products', editingId)
        await withTimeout(updateDoc(itemRef, draftPayload), 20_000, 'Save timed out. Please check your internet and try again.')
        if (publishPayload) {
          try {
            await withTimeout(updateDoc(itemRef, publishPayload), 20_000, 'Publish timed out. Please try again.')
            setMessage(imageUploadPending ? 'Item saved. Image upload is pending — you can retry later.' : 'Item saved successfully.')
          } catch (_publishError) {
            setMessage('Draft saved but publishing was incomplete.')
            setError('Draft saved but publishing was incomplete.')
          }
        } else {
          setMessage(imageUploadPending ? 'Draft saved. Image upload is pending — you can retry later.' : 'Draft saved successfully.')
        }
      } else {
        const itemRef = doc(collection(db, 'products'))
        await withTimeout(setDoc(itemRef, {
          ...draftPayload,
          createdAt: serverTimestamp(),
          sortOrder: items.length + 1,
        }), 20_000, 'Save timed out. Please check your internet and try again.')
        if (publishPayload) {
          try {
            await withTimeout(updateDoc(itemRef, publishPayload), 20_000, 'Publish timed out. Please try again.')
            setMessage(imageUploadPending ? 'Item saved. Image upload is pending — you can retry later.' : 'Item saved successfully.')
          } catch (_publishError) {
            setMessage('Draft saved but publishing was incomplete.')
            setError('Draft saved but publishing was incomplete.')
          }
        } else {
          setMessage(imageUploadPending ? 'Draft saved. Image upload is pending — you can retry later.' : 'Draft saved successfully.')
        }
      }
      if (imageUploadPending) {
        setError('Image upload failed or is incomplete. Item was still saved; retry upload later.')
      }
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item. Please check the details and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item: Product) {
    if (!canManage) return
    if (!window.confirm(`Delete ${item.name}?`)) return
    await deleteDoc(doc(db, 'products', item.id))
    setMessage(`${item.itemType === 'course' ? 'Course' : item.itemType === 'service' ? 'Service' : 'Product'} deleted.`)
  }

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter(item => productMatchesSearch(item, term))
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

          <form className="form products-page__form" onSubmit={saveItem}>
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
                  <label className="field__label" htmlFor="item-brand">Brand</label>
                  <input id="item-brand" value={draft.brand} onChange={event => updateDraft('brand', event.target.value)} placeholder="e.g. Nike, Samsung, Local label" />
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

            {isService ? <div className="field"><label className="field__label" htmlFor="service-kind">Service kind</label><select id="service-kind" value={draft.serviceKind} onChange={event => updateDraft('serviceKind', event.target.value)}><option value="consultation">Consultation / appointment</option><option value="quote_request">Request quote</option></select></div> : null}
            {isService ? <div className="field"><label className="field__label" htmlFor="service-duration">Duration minutes</label><input id="service-duration" type="number" min="0" step="1" value={draft.durationMinutes} onChange={event => updateDraft('durationMinutes', event.target.value)} /></div> : null}
            {behavesLikeService && !isCourse ? <div className="field"><label className="field__label" htmlFor="service-location">Branch / location</label><input id="service-location" value={draft.location} onChange={event => updateDraft('location', event.target.value)} /></div> : null}
            {isCourse ? (
              <>
                <div className="field"><label className="field__label" htmlFor="course-branch">Branch</label><input id="course-branch" value={draft.branch} onChange={event => updateDraft('branch', event.target.value)} placeholder="e.g. Accra campus or Online" /></div>
                <div className="field"><label className="field__label" htmlFor="course-times">Preferred times</label><input id="course-times" value={draft.preferredTimes} onChange={event => updateDraft('preferredTimes', event.target.value)} placeholder="e.g. Weekdays 6pm, Saturdays 10am" /></div>
                <div className="field"><label className="field__label" htmlFor="course-start-date">Start date</label><input id="course-start-date" type="date" value={draft.startDate} onChange={event => updateDraft('startDate', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-regfee">Registration fee</label><input id="course-regfee" type="number" min="0" step="0.01" value={draft.registrationFee} onChange={event => updateDraft('registrationFee', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-fullfee">Full fee</label><input id="course-fullfee" type="number" min="0" step="0.01" value={draft.fullFee} onChange={event => updateDraft('fullFee', event.target.value)} placeholder="Defaults to Fee when blank" /></div>
                <div className="field"><label className="field__label" htmlFor="course-duration">Duration</label><input id="course-duration" value={draft.duration} onChange={event => updateDraft('duration', event.target.value)} placeholder="e.g. 8 weeks" /></div>
                <div className="field"><label className="field__label" htmlFor="course-capacity">Capacity</label><input id="course-capacity" type="number" min="0" step="1" value={draft.capacity} onChange={event => updateDraft('capacity', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-requirements">Requirements</label><textarea id="course-requirements" rows={3} value={draft.requirements} onChange={event => updateDraft('requirements', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-starter-items">Starter items</label><textarea id="course-starter-items" rows={3} value={draft.starterItems} onChange={event => updateDraft('starterItems', event.target.value)} /></div>
                <label className="checkbox"><input type="checkbox" checked={draft.certificateIncluded} onChange={event => updateDraft('certificateIncluded', event.target.checked ? 'true' : '')} /><span>Certificate included</span></label>
                <div className="field"><label className="field__label" htmlFor="course-agreement">Agreement</label><textarea id="course-agreement" rows={3} value={draft.Agreement} onChange={event => updateDraft('Agreement', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-level">Course level</label><input id="course-level" value={draft.courseLevel} onChange={event => updateDraft('courseLevel', event.target.value)} /></div>
                <div className="field"><label className="field__label" htmlFor="course-mode">Mode</label><select id="course-mode" value={draft.courseMode} onChange={event => updateDraft('courseMode', event.target.value)}><option value="online">Online</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></div>
              </>
            ) : null}
            <div className="field">
              <div className="products-page__label-row">
                <label className="field__label" htmlFor="item-description">{behavesLikeService ? 'Description' : 'Product description'}</label>
                <div className="products-page__description-actions">
                  <button
                    type="button"
                    className="button button--ghost products-page__helper-button"
                    onClick={handleGenerateDescription}
                    disabled={isGeneratingDescription}
                  >
                    {isGeneratingDescription ? 'Generating with AI…' : 'Generate with AI'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost products-page__helper-button"
                    onClick={() => {
                      const improved = improveDescription(draft.description)
                      if (!improved) {
                        setError('Add a description first.')
                        return
                      }
                      setError('')
                      updateDraft('description', improved)
                    }}
                  >
                    Clean formatting
                  </button>
                </div>
              </div>
              <textarea id="item-description" rows={4} value={draft.description} onChange={event => updateDraft('description', event.target.value)} />
              <p className="field__hint">Use Clean formatting to remove broken AI separators, empty dash lines, and messy markdown.</p>
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
                onChange={async event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (!storeId) {
                    setImageUploadState('failed')
                    setImageStatusMessage('Select a store before uploading an image.')
                    event.target.value = ''
                    return
                  }
                  if (!file.type.startsWith('image/')) {
                    setImageUploadState('failed')
                    setImageStatusMessage('Please choose a valid image file.')
                    event.target.value = ''
                    return
                  }
                  setImageUploadState('uploading')
                  setImageStatusMessage('Uploading image...')
                  try {
                    const uploadedImageUrl = await uploadProductImage(file, { storagePath: `stores/${storeId}/products` })
                    updateDraft('imageUrl', uploadedImageUrl)
                    setImageUploadState('success')
                    setImageStatusMessage('Image uploaded successfully.')
                  } catch (uploadError) {
                    const message = uploadError instanceof ProductImageUploadError
                      ? uploadError.message
                      : 'Image upload failed.'
                    setImageUploadState('failed')
                    setImageStatusMessage(message)
                  } finally {
                    event.target.value = ''
                  }
                }}
              />
              {imageStatusMessage ? <p className={`products-page__upload-state products-page__upload-state--${imageUploadState}`}>{imageStatusMessage}</p> : null}
              {draft.imageUrl.startsWith('data:image/') ? <p className="products-page__upload-warning">Image selected locally but not uploaded to cloud storage yet.</p> : null}
            </div>
            {draft.imageUrl ? (
              <div className="products-page__image-preview-box">
                <img className="products-page__image-preview" src={draft.imageUrl} alt={draft.imageAlt || draft.name || 'Preview'} />
                <button type="button" className="button button--ghost" onClick={() => { updateDraft('imageUrl', ''); setImageUploadState('idle'); setImageStatusMessage('') }}>Remove image</button>
              </div>
            ) : null}
            <div className="products-page__visibility-grid">
              <label className="checkbox"><input type="checkbox" checked={draft.isPublished} onChange={event => setDraft(current => ({ ...current, isPublished: event.target.checked }))} /><span>Publish item</span></label>
              <label className="checkbox"><input type="checkbox" checked={draft.isMarketplaceVisible} onChange={event => setDraft(current => ({ ...current, isMarketplaceVisible: event.target.checked }))} /><span>Show on SedifexMarket</span></label>
              <label className="checkbox"><input type="checkbox" checked={draft.isWebsiteVisible} onChange={event => setDraft(current => ({ ...current, isWebsiteVisible: event.target.checked }))} /><span>Show on your website</span></label>
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
              const itemIsCourse = item.itemType === 'course' || item.listingType === 'course'
              const itemIsService = item.itemType === 'service'
              const itemIsServiceLike = itemIsService || itemIsCourse
              return (
                <article key={item.id} className="products-page__list-card">
                  <header className="products-page__list-card__header">
                    <div className="products-page__thumb-wrap">
                      {item.imageUrl ? <img className="products-page__thumb" src={item.imageUrl} alt={item.imageAlt ?? item.name} /> : <div className="products-page__thumb products-page__thumb--placeholder">No image</div>}
                    </div>
                    <div className="products-page__list-title">
                      <h4>{item.name}</h4>
                      <span className="products-page__badge products-page__badge--muted">{itemIsCourse ? 'Course' : itemIsService ? 'Service' : 'Product'}</span>
                      <span className={`products-page__badge ${(item as any).isPublished === false ? 'products-page__badge--draft' : 'products-page__badge--published'}`}>{(item as any).isPublished === false ? 'Draft' : 'Published'}</span>
                      {(item as any).isMarketplaceVisible ? <span className="products-page__badge products-page__badge--market">Marketplace Visible</span> : null}
                      <span className="products-page__list-value">{normalizeCategory(item.category, item.itemType)}</span>
                    </div>
                    <div className="products-page__list-meta">
                      <span className="products-page__meta-label">Price</span>
                      <span>{formatMoney(item.price)}</span>
                    </div>
                  </header>

                  <div className="products-page__list-grid">
                    {itemIsServiceLike ? (
                      <>
                        <div className="products-page__list-field"><label className="field__label">{itemIsCourse ? 'Course category' : 'Service category'}</label><p className="products-page__list-value">{normalizeCategory(item.category, itemIsCourse ? 'course' : item.itemType)}</p></div>
                        <div className="products-page__list-field"><label className="field__label">{itemIsCourse ? 'Course item' : 'Booking / service item'}</label><p className="products-page__list-value">No stock tracking</p></div>
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Duration</label><p className="products-page__list-value">{item.duration || '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Branch</label><p className="products-page__list-value">{item.branch || '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Preferred times</label><p className="products-page__list-value">{item.preferredTimes || '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Start date</label><p className="products-page__list-value">{item.startDate ? item.startDate.toLocaleDateString() : '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Registration fee</label><p className="products-page__list-value">{formatMoney(item.registrationFee)}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Full fee</label><p className="products-page__list-value">{formatMoney(item.fullFee ?? item.price)}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Capacity</label><p className="products-page__list-value">{item.capacity ?? '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Certificate</label><p className="products-page__list-value">{item.certificateIncluded ? 'Included' : '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Requirements</label><p className="products-page__list-value">{item.requirements || '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Starter items</label><p className="products-page__list-value">{item.starterItems || '—'}</p></div> : null}
                        {itemIsCourse ? <div className="products-page__list-field"><label className="field__label">Agreement</label><p className="products-page__list-value">{item.Agreement || '—'}</p></div> : null}
                      </>
                    ) : (
                      <>
                        <div className="products-page__list-field"><label className="field__label">Product category</label><p className="products-page__list-value">{normalizeCategory(item.category, item.itemType)}</p></div>
                        <div className="products-page__list-field"><label className="field__label">Brand</label><p className="products-page__list-value">{item.brand || item.manufacturerName || '—'}</p></div>
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
