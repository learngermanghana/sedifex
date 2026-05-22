import * as functions from 'firebase-functions/v1'
import { defaultDb } from './firestore'
import { admin } from './firestore'

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

type PublicStore = {
  storeId: string
  name: string
  logoUrl: string | null
  city: string | null
  phone: string | null
}

const MAX_READ_PER_COLLECTION = 120
const MAX_RETURN_ITEMS = 60
const MAX_STORE_RESULTS = 20

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

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function buildSearchTerms(value: string) {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []
  const words = normalized.split(/\s+/).filter(word => word.length >= 2)
  const prefixes = words.flatMap(word => {
    const output: string[] = []
    for (let i = 2; i <= Math.min(word.length, 12); i += 1) output.push(word.slice(0, i))
    return output
  })
  return Array.from(new Set([...words, ...prefixes, normalized])).slice(0, 180)
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

function getStoreName(record: Record<string, unknown>) {
  return cleanText(record.businessName ?? record.storeName ?? record.name ?? record.displayName ?? record.profileName, 220)
}

function normalizeStore(id: string, record: Record<string, unknown>): PublicStore | null {
  const name = getStoreName(record)
  if (!name) return null
  return {
    storeId: cleanText(record.storeId, 180) || id,
    name,
    logoUrl: cleanText(record.logoUrl ?? record.logo ?? record.photoUrl ?? record.imageUrl, 2000) || null,
    city: cleanText(record.city ?? record.town ?? record.location, 180) || null,
    phone: cleanText(record.phone ?? record.businessPhone ?? record.whatsapp ?? record.whatsappNumber, 80) || null,
  }
}

function storeMatchesQuery(store: PublicStore, query: string) {
  if (!query) return true
  const normalizedQuery = normalizeSearchText(query)
  const haystack = normalizeSearchText([store.name, store.city ?? '', store.phone ?? ''].join(' '))
  return haystack.includes(normalizedQuery)
}

function buildStoreIndexRecord(storeId: string, data: Record<string, unknown>) {
  const store = normalizeStore(storeId, data)
  if (!store) return null
  const searchSource = [store.name, store.city ?? '', store.phone ?? ''].join(' ')
  return {
    ...store,
    normalizedName: normalizeSearchText(store.name),
    searchText: normalizeSearchText(searchSource),
    searchTerms: buildSearchTerms(searchSource),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

async function fetchIndexedStores(query: string) {
  const terms = buildSearchTerms(query).slice(0, 10)
  if (!terms.length) return []
  const snapshot = await defaultDb.collection('quickPayStoreIndex')
    .where('searchTerms', 'array-contains-any', terms)
    .limit(MAX_STORE_RESULTS)
    .get()
  return snapshot.docs
    .map(doc => normalizeStore(cleanText(doc.data().storeId, 180) || doc.id, doc.data() as Record<string, unknown>))
    .filter((store): store is PublicStore => store !== null)
    .filter(store => storeMatchesQuery(store, query))
}

async function fetchFallbackStores(query: string) {
  const snapshot = await defaultDb.collection('stores').limit(300).get()
  return snapshot.docs
    .map(doc => normalizeStore(doc.id, doc.data() as Record<string, unknown>))
    .filter((store): store is PublicStore => store !== null)
    .filter(store => storeMatchesQuery(store, query))
    .slice(0, MAX_STORE_RESULTS)
}

export const syncQuickPayStoreIndex = functions.firestore
  .document('stores/{storeId}')
  .onWrite(async (change, context) => {
    const storeId = context.params.storeId
    const indexRef = defaultDb.collection('quickPayStoreIndex').doc(storeId)

    if (!change.after.exists) {
      await indexRef.delete()
      return
    }

    const data = change.after.data() as Record<string, unknown>
    const indexRecord = buildStoreIndexRecord(storeId, data)

    if (!indexRecord || indexRecord.searchTerms.length === 0) {
      await indexRef.delete()
      return
    }

    await indexRef.set(indexRecord, { merge: true })
  })

export const publicQuickPayStores = functions.https.onRequest(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    const query = cleanText(req.query.q, 200)
    if (normalizeSearchText(query).length < 2) {
      res.status(200).json({ ok: true, count: 0, stores: [] })
      return
    }

    const indexedStores = await fetchIndexedStores(query)
    const stores = indexedStores.length ? indexedStores : await fetchFallbackStores(query)

    res.status(200).json({ ok: true, count: stores.length, stores: stores.slice(0, MAX_STORE_RESULTS), source: indexedStores.length ? 'index' : 'fallback' })
  } catch (error) {
    functions.logger.error('publicQuickPayStores failed', { error })
    res.status(500).json({ error: 'quick-pay-store-search-failed' })
  }
})

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
