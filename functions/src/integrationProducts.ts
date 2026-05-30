import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import {
  cleanIntegrationText,
  isIntegrationRequestAuthorized,
  redactIntegrationApiKey,
  resolveIntegrationApiKey,
} from './integrationAuth'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})

const MAX_READ_PER_COLLECTION = 150
const MAX_RETURN_ITEMS = 300

type CatalogType = 'PRODUCT' | 'SERVICE' | 'COURSE'

type IntegrationProductItem = {
  id: string
  storeId: string
  name: string
  category?: string | null
  description?: string | null
  price: number
  priceMinor: number
  stockCount?: number | null
  itemType: 'product' | 'service' | 'course'
  type: CatalogType
  imageUrl?: string | null
  imageUrls: string[]
  imageAlt?: string | null
  sortOrder?: number | null
  order?: number | null
  updatedAt?: string | null
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-sedifex-api-key, api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = cleanIntegrationText(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)

  if (received && received !== expected) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return false
  }

  return true
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', '1', 'published', 'active', 'visible', 'public'].includes(normalized)) return true
    if (['false', 'no', '0', 'draft', 'hidden', 'archived', 'deleted', 'removed'].includes(normalized)) return false
  }
  return null
}

function isVisibleCatalogRecord(record: Record<string, unknown>) {
  const status = cleanIntegrationText(record.status ?? record.publishStatus ?? record.visibility, 80).toLowerCase()
  const isPublished = booleanValue(record.isPublished)
  const isWebsiteVisible = booleanValue(record.isWebsiteVisible)
  const isMarketplaceVisible = booleanValue(record.isMarketplaceVisible)
  const hasVisibilitySignal =
    Boolean(status)
    || isPublished !== null
    || isWebsiteVisible !== null
    || isMarketplaceVisible !== null

  if (['deleted', 'archived', 'removed'].includes(status)) return false

  if (
    isPublished === true
    || isWebsiteVisible === true
    || isMarketplaceVisible === true
    || ['published', 'active', 'public', 'visible'].includes(status)
  ) {
    return true
  }

  if (isPublished === false) return false
  if (['draft', 'hidden', 'private', 'inactive'].includes(status)) return false

  return !hasVisibilitySignal
}

function toDateIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  if (typeof value === 'object') {
    const seconds = numberValue((value as Record<string, unknown>)._seconds ?? (value as Record<string, unknown>).seconds)
    if (seconds !== null) return new Date(seconds * 1000).toISOString()
  }
  return null
}

function normalizeType(value: unknown, fallback: CatalogType): CatalogType {
  const text = cleanIntegrationText(value, 30).toUpperCase()
  if (text === 'PRODUCT' || text === 'SERVICE' || text === 'COURSE') return text
  return fallback
}

function itemTypeFromCatalogType(type: CatalogType) {
  return type.toLowerCase() as 'product' | 'service' | 'course'
}

function getName(record: Record<string, unknown>) {
  return cleanIntegrationText(
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
  if (minorDirect !== null) return Math.max(0, Math.round(minorDirect))

  const majorValue = numberValue(
    record.price
      ?? record.sellingPrice
      ?? record.salePrice
      ?? record.amount
      ?? record.fee,
  )
  if (majorValue !== null) return Math.max(0, Math.round(majorValue * 100))
  return 0
}

function getStockCount(record: Record<string, unknown>) {
  const stock = numberValue(record.stockCount ?? record.quantity ?? record.qty ?? record.stock ?? record.availableQuantity)
  return stock === null ? null : Math.max(0, Math.floor(stock))
}

function getImageUrls(record: Record<string, unknown>) {
  const candidates = [record.imageUrls, record.images, record.gallery]
  const urls = candidates.flatMap((value) => {
    if (!Array.isArray(value)) return []
    return value
      .map((item) => {
        if (typeof item === 'string') return cleanIntegrationText(item, 2000)
        if (item && typeof item === 'object') {
          return cleanIntegrationText(
            (item as Record<string, unknown>).url
              ?? (item as Record<string, unknown>).imageUrl
              ?? (item as Record<string, unknown>).src,
            2000,
          )
        }
        return ''
      })
      .filter(Boolean)
  })

  const primary = cleanIntegrationText(record.imageUrl ?? record.image ?? record.photoUrl ?? record.coverImageUrl, 2000)
  return Array.from(new Set([primary, ...urls].filter(Boolean)))
}

function normalizeDoc(id: string, storeId: string, record: Record<string, unknown>, fallbackType: CatalogType): IntegrationProductItem | null {
  if (!isVisibleCatalogRecord(record)) return null

  const name = getName(record)
  if (!name) return null

  const type = normalizeType(record.type ?? record.item_type ?? record.itemType ?? record.listingType, fallbackType)
  const itemType = itemTypeFromCatalogType(type)
  const priceMinor = getPriceMinor(record)
  const imageUrls = getImageUrls(record)
  const order = numberValue(record.order)
  const sortOrder = numberValue(record.sortOrder ?? record.featuredRank ?? record.rank)

  return {
    id,
    storeId: cleanIntegrationText(record.storeId, 180) || storeId,
    name,
    category: cleanIntegrationText(record.category, 180) || null,
    description: cleanIntegrationText(record.description, 1200) || null,
    price: priceMinor / 100,
    priceMinor,
    stockCount: getStockCount(record),
    itemType,
    type,
    imageUrl: imageUrls[0] || null,
    imageUrls,
    imageAlt: cleanIntegrationText(record.imageAlt ?? record.alt, 220) || name,
    sortOrder: sortOrder === null ? null : sortOrder,
    order: order === null ? null : order,
    updatedAt: toDateIso(record.updatedAt ?? record.createdAt),
  }
}

async function fetchCollectionItems(path: string, storeId: string, fallbackType: CatalogType) {
  const snapshot = await defaultDb.collection(path).limit(MAX_READ_PER_COLLECTION).get()
  return snapshot.docs
    .map((doc) => normalizeDoc(doc.id, storeId, doc.data() as Record<string, unknown>, fallbackType))
    .filter((item): item is IntegrationProductItem => item !== null)
}

async function fetchQueryItems(collection: string, storeId: string, fallbackType: CatalogType) {
  const snapshot = await defaultDb.collection(collection)
    .where('storeId', '==', storeId)
    .limit(MAX_READ_PER_COLLECTION)
    .get()
  return snapshot.docs
    .map((doc) => normalizeDoc(doc.id, storeId, doc.data() as Record<string, unknown>, fallbackType))
    .filter((item): item is IntegrationProductItem => item !== null)
}

function dedupeItems(items: IntegrationProductItem[]) {
  const seen = new Set<string>()
  const output: IntegrationProductItem[] = []

  for (const item of items) {
    const key = `${item.itemType}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }

  return output
}

function sortItems(items: IntegrationProductItem[]) {
  return [...items].sort((a, b) => {
    const aOrder = a.sortOrder ?? a.order ?? Number.POSITIVE_INFINITY
    const bOrder = b.sortOrder ?? b.order ?? Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })
}

async function getStoreItems(storeId: string) {
  const [
    products,
    services,
    courses,
    publicListings,
    v1IntegrationProducts,
    rootProducts,
    rootServices,
    rootCourses,
  ] = await Promise.all([
    fetchCollectionItems(`stores/${storeId}/products`, storeId, 'PRODUCT'),
    fetchCollectionItems(`stores/${storeId}/services`, storeId, 'SERVICE'),
    fetchCollectionItems(`stores/${storeId}/courses`, storeId, 'COURSE'),
    fetchQueryItems('publicListings', storeId, 'PRODUCT'),
    fetchQueryItems('v1IntegrationProducts', storeId, 'PRODUCT'),
    fetchQueryItems('products', storeId, 'PRODUCT'),
    fetchQueryItems('services', storeId, 'SERVICE'),
    fetchQueryItems('courses', storeId, 'COURSE'),
  ])

  return sortItems(
    dedupeItems([
      ...products,
      ...services,
      ...courses,
      ...publicListings,
      ...v1IntegrationProducts,
      ...rootProducts,
      ...rootServices,
      ...rootCourses,
    ]),
  ).slice(0, MAX_RETURN_ITEMS)
}

export const v1IntegrationProducts = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (!assertContract(req, res)) return

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const storeId = cleanIntegrationText(req.query.storeId, 180)
  if (!storeId) {
    res.status(400).json({ error: 'missing-store-id' })
    return
  }

  if (!(await isIntegrationRequestAuthorized(req, storeId))) {
    const requestKey = resolveIntegrationApiKey(req)
    res.status(401).json({
      error: 'invalid-api-key',
      message: 'Invalid API key for storeId or missing credentials.',
      debug: {
        storeId,
        hasApiKey: Boolean(requestKey),
        apiKeyHint: requestKey ? redactIntegrationApiKey(requestKey) : null,
      },
    })
    return
  }

  try {
    const products = await getStoreItems(storeId)
    const publicProducts = products.filter(item => item.itemType === 'product' || item.itemType === 'course')
    const publicServices = products.filter(item => item.itemType === 'service')

    res.status(200).json({
      ok: true,
      storeId,
      products,
      publicProducts,
      publicServices,
      count: products.length,
      updatedAt: admin.firestore.Timestamp.now().toDate().toISOString(),
    })
  } catch (error) {
    functions.logger.error('v1IntegrationProducts failed', { storeId, error })
    res.status(500).json({ error: 'integration-products-failed' })
  }
})
