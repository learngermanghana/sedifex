import * as functions from 'firebase-functions/v1'
import { defaultDb } from './firestore'

type CatalogType = 'PRODUCT' | 'SERVICE' | 'COURSE'

type CatalogItem = {
  id: string
  name: string
  type: CatalogType
  price: number
  priceMinor: number
  description?: string | null
  imageUrl?: string | null
  category?: string | null
}

const MAX_READ_PER_COLLECTION = 120
const MAX_RETURN_ITEMS = 60

function setCors(res: functions.Response, methods = 'GET, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', methods)
}

function cleanText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeType(value: unknown, fallback: CatalogType): CatalogType {
  const text = cleanText(value, 30).toUpperCase()
  if (text === 'PRODUCT' || text === 'SERVICE' || text === 'COURSE') return text
  return fallback
}

function getName(record: Record<string, unknown>) {
  return cleanText(
    record.name
      ?? record.productName
      ?? record.serviceName
      ?? record.courseName
      ?? record.title,
    220,
  )
}

function getPriceMinor(record: Record<string, unknown>) {
  const minorDirect = numberValue(record.priceMinor ?? record.amountMinor)
  if (minorDirect !== null) return Math.round(minorDirect)

  const majorValue = numberValue(
    record.price
      ?? record.sellingPrice
      ?? record.salePrice
      ?? record.amount
      ?? record.fee,
  )
  if (majorValue !== null) return Math.round(majorValue * 100)
  return 0
}

function includesQuery(item: CatalogItem, query: string) {
  if (!query) return true
  const haystack = [item.name, item.description ?? '', item.category ?? '', item.type].join(' ').toLowerCase()
  return haystack.includes(query)
}

function normalizeDoc(id: string, record: Record<string, unknown>, fallbackType: CatalogType): CatalogItem | null {
  const name = getName(record)
  if (!name) return null

  const priceMinor = getPriceMinor(record)
  const type = normalizeType(record.type ?? record.item_type ?? record.itemType, fallbackType)

  return {
    id,
    name,
    type,
    priceMinor,
    price: priceMinor / 100,
    description: cleanText(record.description, 500) || null,
    imageUrl: cleanText(record.imageUrl ?? record.image ?? record.photoUrl ?? record.coverImageUrl, 2000) || null,
    category: cleanText(record.category, 180) || null,
  }
}

async function fetchCollectionItems(path: string, fallbackType: CatalogType) {
  const snapshot = await defaultDb.collection(path).limit(MAX_READ_PER_COLLECTION).get()
  return snapshot.docs
    .map((doc) => normalizeDoc(doc.id, doc.data() as Record<string, unknown>, fallbackType))
    .filter((item): item is CatalogItem => item !== null)
}

async function fetchQueryItems(collection: string, storeId: string, fallbackType: CatalogType) {
  const snapshot = await defaultDb.collection(collection)
    .where('storeId', '==', storeId)
    .limit(MAX_READ_PER_COLLECTION)
    .get()
  return snapshot.docs
    .map((doc) => normalizeDoc(doc.id, doc.data() as Record<string, unknown>, fallbackType))
    .filter((item): item is CatalogItem => item !== null)
}

export const publicQuickPayCatalog = functions.https.onRequest(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const storeId = cleanText(req.query.storeId, 180)
  if (!storeId) {
    res.status(400).json({ error: 'missing-store-id' })
    return
  }

  const query = cleanText(req.query.q, 200).toLowerCase()

  const [products, services, courses, publicListings, v1IntegrationProducts] = await Promise.all([
    fetchCollectionItems(`stores/${storeId}/products`, 'PRODUCT'),
    fetchCollectionItems(`stores/${storeId}/services`, 'SERVICE'),
    fetchCollectionItems(`stores/${storeId}/courses`, 'COURSE'),
    fetchQueryItems('publicListings', storeId, 'PRODUCT'),
    fetchQueryItems('v1IntegrationProducts', storeId, 'PRODUCT'),
  ])

  const items = [...products, ...services, ...courses, ...publicListings, ...v1IntegrationProducts]
    .filter(item => includesQuery(item, query))
    .slice(0, MAX_RETURN_ITEMS)

  res.status(200).json({
    ok: true,
    storeId,
    count: items.length,
    items,
  })
})
