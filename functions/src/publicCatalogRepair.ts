import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'
import { resolvePublicationTimestampCandidate } from './catalogPublication'

type StoreData = Record<string, unknown>
type ProductData = Record<string, unknown>
type RepairPayload = { storeId?: unknown }
type ListingType = 'product' | 'service' | 'course'
type ListingCounts = { listings: number; products: number; services: number; courses: number }

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizedType(value: unknown): ListingType {
  const raw = text(value)?.toLowerCase()
  if (raw === 'course' || raw === 'programme' || raw === 'program') return 'course'
  if (raw === 'service' || raw === 'booking' || raw === 'appointment') return 'service'
  return 'product'
}

function resolveListingType(data: ProductData): ListingType {
  return normalizedType(text(data.listingType) ?? text(data.itemType) ?? data.type)
}

function emptyCounts(): ListingCounts {
  return { listings: 0, products: 0, services: 0, courses: 0 }
}

function addCount(counts: ListingCounts, listingType: ListingType) {
  counts.listings += 1
  if (listingType === 'course') counts.courses += 1
  else if (listingType === 'service') counts.services += 1
  else counts.products += 1
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function timestampOrIso(value: unknown): string | null {
  try {
    if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
      const date = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(date.getTime()) ? null : date.toISOString()
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString()
    }
  } catch {
    return null
  }
  return null
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const normalized = text(item)
    if (normalized) out.push(normalized)
  }
  return [...new Set(out)]
}

function serverTimestamp(): unknown {
  return admin.firestore.FieldValue.serverTimestamp()
}

function isStoreEligible(store: StoreData | undefined): boolean {
  if (!store) return false
  return store.verified === true && store.eligibleForBuy === true && store.buyOptOut !== true && store.status === 'active'
}

function canManageStore(store: StoreData | undefined, auth: functions.https.CallableContext['auth']): boolean {
  if (!auth || !store) return false
  if (auth.token?.admin === true) return true
  const uid = auth.uid
  const email = typeof auth.token?.email === 'string' ? auth.token.email.trim().toLowerCase() : null
  const ownerUid = text(store.ownerUid) ?? text(store.userId) ?? text(store.createdBy) ?? text(store.id)
  const ownerEmail = text(store.ownerEmail) ?? text(store.email)
  if (ownerUid && ownerUid === uid) return true
  if (email && ownerEmail && ownerEmail.trim().toLowerCase() === email) return true
  return false
}

function shouldPublish(data: ProductData, eligibleStore: boolean): boolean {
  if (data.isMarketplaceVisible === false) return false
  if (data.isPublished === false) return false
  if (data.isPublished === true) return true
  const status = text(data.status)?.toLowerCase()
  if (status === 'draft') return false
  if (status === 'published') return true
  return eligibleStore
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
}

function shortId(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (cleaned || '000000').slice(-6)
}

function resolveSourceProductId(productId: string, data: ProductData): string {
  return text(data.sourceProductId) ?? productId
}

function resolvePublicListingId(productId: string, data: ProductData): { publicListingId: string; sourceProductId: string; slug: string | null } {
  const sourceProductId = resolveSourceProductId(productId, data)
  const listingType = resolveListingType(data)
  const slug = normalizeSlug(text(data.slug) ?? text(data.name) ?? text(data.productName) ?? '')

  // Rebuild with one canonical id. Do not reuse old draft/service/product duplicate ids blindly.
  if (!sourceProductId.toLowerCase().startsWith('draft-')) {
    return { publicListingId: sourceProductId, sourceProductId, slug: slug || null }
  }

  return {
    publicListingId: [listingType, slug || 'listing', shortId(sourceProductId)].join('-'),
    sourceProductId,
    slug: slug || null,
  }
}

function storeMeta(store: StoreData): Record<string, unknown> {
  return {
    storeName: text(store.displayName) ?? text(store.name),
    storeCity: text(store.city) ?? text(store.town),
    storePhone: text(store.phone) ?? text(store.phoneNumber) ?? text(store.contactPhone),
    websiteLink: text(store.websiteLink) ?? text(store.promoWebsiteUrl),
  }
}

function publicPayload(productId: string, data: ProductData, store: StoreData, identity: { publicListingId: string; sourceProductId: string; slug: string | null }): Record<string, unknown> {
  const listingType = resolveListingType(data)
  const category = text(data.category) ?? text(data.categoryName) ?? 'General'
  const metadata = (typeof data.metadata === 'object' && data.metadata !== null ? data.metadata : {}) as Record<string, unknown>

  return {
    id: identity.publicListingId,
    publicListingId: identity.publicListingId,
    sourceProductId: identity.sourceProductId,
    slug: identity.slug,
    storeId: text(data.storeId),
    ...storeMeta(store),
    name: text(data.name) ?? text(data.productName),
    description: text(data.description),
    category,
    categoryKey: text(data.categoryKey),
    categoryName: text(data.categoryName) ?? category,
    price: numberOrNull(data.price) ?? numberOrNull(data.fullFee),
    fullFee: numberOrNull(data.fullFee) ?? numberOrNull(data.price),
    registrationFee: numberOrNull(data.registrationFee),
    currency: text(data.currency) ?? 'GHS',
    imageUrl: text(data.imageUrl),
    imageUrls: toArray(data.imageUrls),
    imageAlt: text(data.imageAlt),
    searchTokens: toArray(metadata.searchTokens),
    rankingScore: numberOrNull(metadata.rankingScore) ?? numberOrNull(data.rankingScore) ?? 0,
    itemType: listingType,
    listingType,
    status: 'published',
    isVisible: true,
    isPublished: true,
    isMarketplaceVisible: true,
    isWebsiteVisible: data.isWebsiteVisible === true,
    salesMode: text(data.salesMode),
    serviceKind: text(data.serviceKind),
    duration: text(data.duration),
    branch: text(data.branch) ?? text(data.location),
    preferredTimes: text(data.preferredTimes) ?? text(data.classTimes),
    startDate: timestampOrIso(data.startDate),
    capacity: numberOrNull(data.capacity),
    requirements: text(data.requirements),
    starterItems: text(data.starterItems),
    certificateIncluded: boolOrNull(data.certificateIncluded),
    Agreement: text(data.Agreement),
    publishedAt: resolvePublicationTimestampCandidate(data.publishedAt, data.createdAt, data.updatedAt),
    sourceUpdatedAt: data.updatedAt ?? null,
    updatedAt: serverTimestamp(),
  }
}

async function deleteExistingStorePublicListings(storeId: string): Promise<number> {
  const snap = await db.collection('publicListings').where('storeId', '==', storeId).get()
  let batch = db.batch()
  let writes = 0
  let deleted = 0
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref)
    writes += 1
    deleted += 1
    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  if (writes > 0) await batch.commit()
  return deleted
}

export const repairStorePublicCatalog = functions.https.onCall(async (data: RepairPayload, context) => {
  const storeId = text(data?.storeId)
  if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')

  const storeRef = db.collection('stores').doc(storeId)
  const storeSnap = await storeRef.get()
  const store = (storeSnap.data() ?? {}) as StoreData

  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.')
    if (!canManageStore(store, context.auth)) throw new functions.https.HttpsError('permission-denied', 'Store owner or admin access required.')
  }

  const deletedListings = await deleteExistingStorePublicListings(storeId)
  const counts = emptyCounts()

  if (!isStoreEligible(store)) {
    await storeRef.set({
      publicCatalogLastSyncedAt: serverTimestamp(),
      publicCatalogDocCount: counts,
      publicCatalogOutOfSyncCount: 0,
    }, { merge: true })
    return { ok: true, storeId, deletedListings, writtenListings: 0, publicCatalogDocCount: counts, publicCatalogOutOfSyncCount: 0 }
  }

  const productsSnap = await db.collection('products').where('storeId', '==', storeId).get()
  let batch = db.batch()
  let writes = 0
  let scannedProducts = 0
  let skippedProducts = 0

  for (const productDoc of productsSnap.docs) {
    scannedProducts += 1
    const product = (productDoc.data() ?? {}) as ProductData
    if (!shouldPublish(product, true)) {
      skippedProducts += 1
      continue
    }

    const identity = resolvePublicListingId(productDoc.id, product)
    const listingType = resolveListingType(product)

    batch.set(productDoc.ref, {
      publicListingId: identity.publicListingId,
      sourceProductId: identity.sourceProductId,
      slug: identity.slug,
      listingType,
      itemType: listingType,
    }, { merge: true })
    writes += 1

    batch.set(db.collection('publicListings').doc(identity.publicListingId), publicPayload(productDoc.id, product, store, identity), { merge: true })
    writes += 1
    addCount(counts, listingType)

    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  if (writes > 0) await batch.commit()

  await storeRef.set({
    publicCatalogLastSyncedAt: serverTimestamp(),
    publicCatalogDocCount: counts,
    publicCatalogOutOfSyncCount: 0,
  }, { merge: true })

  return {
    ok: true,
    storeId,
    deletedListings,
    scannedProducts,
    skippedProducts,
    writtenListings: counts.listings,
    publicCatalogDocCount: counts,
    publicCatalogOutOfSyncCount: 0,
  }
})
