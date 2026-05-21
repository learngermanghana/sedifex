import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'
import { resolvePublicationTimestampCandidate } from './catalogPublication'

type StoreData = Record<string, unknown>
type ProductData = Record<string, unknown>
type BackfillPayload = {
  dryRun?: unknown
}
type SyncStorePayload = {
  storeId?: unknown
}
type ListingTypeCount = {
  listings: number
  products: number
  services: number
  courses: number
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function itemType(value: unknown): 'product' | 'service' | 'course' {
  return value === 'course' ? 'course' : value === 'service' ? 'service' : 'product'
}

function normalizeCategoryText(value: unknown): string | null {
  const raw = text(value)?.replace(/\s+/g, ' ')
  return raw || null
}

function categorySlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function isBlockedFoodCategory(value: unknown): boolean {
  const raw = normalizeCategoryText(value)
  if (!raw) return false
  const normalized = raw.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return [
    'food',
    'drink',
    'drinks',
    'beverage',
    'beverages',
    'food and beverage',
    'food and beverages',
  ].includes(normalized)
}

function toTitleCase(value: string): string {
  return value.trim().toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase())
}

function normalizePublicCategory(data: ProductData, normalizedItemType: 'product' | 'service' | 'course'): string {
  const explicitCategory = normalizeCategoryText(data.category)
  const explicitCategoryName = normalizeCategoryText(data.categoryName)
  const nameAndDescription = [text(data.name), text(data.description), text(data.serviceKind)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const hasBeautySignal = /beauty|makeup|cosmetology|hair|braid|bead|nail|spa|wig|millinery|fashion/.test(nameAndDescription)
  const hasTrainingSignal = /course|class|training|academy|school|workshop|certificate|certification|learn/.test(nameAndDescription)

  if (normalizedItemType === 'course') {
    if (hasBeautySignal || hasTrainingSignal) return 'Beauty Training'
    return 'Education'
  }

  if (normalizedItemType === 'service') {
    if (hasBeautySignal || hasTrainingSignal) return hasTrainingSignal ? 'Beauty Training' : 'Beauty Services'
    return 'Professional Services'
  }

  if (explicitCategory && !isBlockedFoodCategory(explicitCategory)) return toTitleCase(explicitCategory)
  if (explicitCategoryName && !isBlockedFoodCategory(explicitCategoryName)) return toTitleCase(explicitCategoryName)
  if (hasBeautySignal) return 'Beauty'
  return 'General Products'
}

function emptyListingCounts(): ListingTypeCount {
  return { listings: 0, products: 0, services: 0, courses: 0 }
}

function countListing(counts: ListingTypeCount, type: 'product' | 'service' | 'course'): void {
  counts.listings += 1
  if (type === 'course') counts.courses += 1
  else if (type === 'service') counts.services += 1
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
  for (const v of value) {
    const t = text(v)
    if (t) out.push(t)
  }
  return [...new Set(out)]
}

function safeServerTimestamp(): unknown {
  return admin.firestore?.FieldValue?.serverTimestamp
    ? admin.firestore.FieldValue.serverTimestamp()
    : new Date()
}

function safeDeleteField(): unknown {
  return admin.firestore?.FieldValue?.delete
    ? admin.firestore.FieldValue.delete()
    : null
}

function isStoreEligible(store: StoreData | undefined): boolean {
  if (!store) return false
  return store.verified === true && store.eligibleForBuy === true && store.buyOptOut !== true && store.status === 'active'
}

function canManageStoreCatalog(store: StoreData | undefined, auth: functions.https.CallableContext['auth']): boolean {
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

function isDraftStatus(status: unknown): boolean {
  return text(status)?.toLowerCase() === 'draft'
}

function isPublishedStatus(status: unknown): boolean {
  return text(status)?.toLowerCase() === 'published'
}

function normalizeSlugPart(value: string): string {
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
  const existingPublicListingId = text(data.publicListingId)
  const sourceProductId = resolveSourceProductId(productId, data)
  const listingType = itemType(data.itemType)
  const slug = normalizeSlugPart(text(data.slug) ?? text(data.name) ?? '')
  if (existingPublicListingId) return { publicListingId: existingPublicListingId, sourceProductId, slug: slug || null }
  if (!sourceProductId.toLowerCase().startsWith('draft-')) return { publicListingId: sourceProductId, sourceProductId, slug: slug || null }
  return { publicListingId: [listingType, slug || 'listing', shortId(sourceProductId)].join('-'), sourceProductId, slug: slug || null }
}

function hasLegacyPublicationFields(data: ProductData): boolean {
  return data.isPublished === null
    || data.isPublished === undefined
    || data.status === null
    || data.status === undefined
}

function shouldIncludeProduct(data: ProductData, eligibleStore: boolean): boolean {
  if (data.isMarketplaceVisible === false) return false
  if (data.isPublished === false) return false

  // Treat the canonical publication flag as stronger than a stale legacy status value.
  // This prevents products with isPublished=true and status="draft" from being removed from the public catalog.
  if (data.isPublished === true) return true

  if (isDraftStatus(data.status)) return false
  if (isPublishedStatus(data.status)) return true
  return eligibleStore && hasLegacyPublicationFields(data)
}

function buildStoreMeta(store: StoreData): Record<string, unknown> {
  const websiteUrl = text(store.websiteUrl)
    ?? text(store.websiteLink)
    ?? text(store.storeWebsiteUrl)
    ?? text(store.storeWebsite)
    ?? text(store.website)
    ?? text(store.promoWebsiteUrl)
  const storePhone = text(store.storePhone)
    ?? text(store.phone)
    ?? text(store.phoneNumber)
    ?? text(store.contactPhone)
    ?? text(store.whatsappNumber)
    ?? text(store.waLink)

  return {
    storeName: text(store.displayName) ?? text(store.storeName) ?? text(store.name),
    storeCity: text(store.city) ?? text(store.storeCity) ?? text(store.town),
    storeCountry: text(store.country) ?? text(store.storeCountry),
    storePhone,
    storeWhatsapp: text(store.whatsappNumber) ?? text(store.waLink) ?? storePhone,
    storeEmail: text(store.publicEmail) ?? text(store.email) ?? text(store.ownerEmail),
    addressLine1: text(store.addressLine1) ?? text(store.address),
    storeLogoUrl: text(store.storeLogoUrl) ?? text(store.logoUrl),
    logoUrl: text(store.logoUrl) ?? text(store.storeLogoUrl),
    websiteUrl,
    websiteLink: websiteUrl,
    storeWebsiteUrl: websiteUrl,
    instagramUrl: text(store.instagramUrl) ?? text(store.instagramHandle),
    facebookUrl: text(store.facebookUrl),
    tiktokUrl: text(store.tiktokUrl) ?? text(store.tiktokHandle),
    youtubeUrl: text(store.youtubeUrl),
    xUrl: text(store.xUrl) ?? text(store.twitterUrl) ?? text(store.xHandle),
    twitterUrl: text(store.twitterUrl) ?? text(store.xUrl) ?? text(store.xHandle),
    linkedinUrl: text(store.linkedinUrl),
  }
}

function publicPayload(
  productId: string,
  data: ProductData,
  storeMeta: Record<string, unknown>,
  identity: { publicListingId: string; sourceProductId: string; slug: string | null },
): Record<string, unknown> {
  const normalizedItemType = itemType(data.itemType)
  const status = data.isPublished === true || isPublishedStatus(data.status) ? 'published' : 'draft'
  const deleteSentinel = safeDeleteField()
  const category = normalizePublicCategory(data, normalizedItemType)
  const metadata = (typeof data.metadata === 'object' && data.metadata !== null ? data.metadata : {}) as Record<string, unknown>
  const payload: Record<string, unknown> = {
    id: identity.publicListingId,
    publicListingId: identity.publicListingId,
    sourceProductId: identity.sourceProductId,
    slug: identity.slug,
    storeId: text(data.storeId),
    ...storeMeta,
    name: text(data.name),
    description: text(data.description),
    category,
    price: typeof data.price === 'number' ? data.price : null,
    imageUrl: text(data.imageUrl),
    imageUrls: toArray(data.imageUrls),
    imageAlt: text(data.imageAlt),
    searchTokens: toArray(metadata.searchTokens),
    rankingScore: numberOrNull(metadata.rankingScore) ?? 0,
    itemType: normalizedItemType,
    listingType: normalizedItemType,
    status,
    isVisible: true,
    isPublished: true,
    isMarketplaceVisible: data.isMarketplaceVisible !== false,
    isWebsiteVisible: data.isWebsiteVisible === true,
    salesMode: text(data.salesMode),
    categoryKey: categorySlug(category),
    categoryName: category,
    currency: text(data.currency) ?? 'GHS',
    publishedAt: resolvePublicationTimestampCandidate(data.publishedAt, data.createdAt, data.updatedAt),
    sourceUpdatedAt: data.updatedAt ?? null,
    serviceKind: text(data.serviceKind),
    duration: text(data.duration),
    branch: text(data.branch) ?? text(data.location),
    preferredTimes: text(data.preferredTimes) ?? text(data.classTimes),
    startDate: timestampOrIso(data.startDate),
    registrationFee: numberOrNull(data.registrationFee),
    fullFee: numberOrNull(data.fullFee) ?? numberOrNull(data.price),
    capacity: numberOrNull(data.capacity),
    requirements: text(data.requirements),
    starterItems: text(data.starterItems),
    certificateIncluded: boolOrNull(data.certificateIncluded),
    Agreement: text(data.Agreement),
    updatedAt: safeServerTimestamp(),
  }

  if (deleteSentinel !== null) payload.unpublishedAt = deleteSentinel

  return payload
}

export async function removeStorePublicCatalog(storeId: string): Promise<void> {
  const listings = await db.collection('publicListings').where('storeId', '==', storeId).get()
  let batch = db.batch()
  let writes = 0
  for (const listing of listings.docs) {
    batch.delete(listing.ref)
    writes += 1
    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  if (writes > 0) await batch.commit()

  await db.collection('stores').doc(storeId).set({
    publicCatalogLastSyncedAt: safeServerTimestamp(),
    publicCatalogDocCount: emptyListingCounts(),
    publicCatalogOutOfSyncCount: 0,
  }, { merge: true })
}

export async function syncStorePublicCatalog(storeId: string): Promise<void> {
  const storeRef = db.collection('stores').doc(storeId)
  const storeSnap = await storeRef.get()
  const storeData = (storeSnap.data() ?? {}) as StoreData
  if (!isStoreEligible(storeData)) {
    await removeStorePublicCatalog(storeId)
    return
  }

  const storeMeta = buildStoreMeta(storeData)
  const productsSnap = await db.collection('products').where('storeId', '==', storeId).get()
  let batch = db.batch()
  let writes = 0
  const writtenCounts = emptyListingCounts()
  for (const productDoc of productsSnap.docs) {
    const data = (productDoc.data() ?? {}) as ProductData
    if (!shouldIncludeProduct(data, true)) continue
    const listingType = itemType(data.itemType)
    const identity = resolvePublicListingId(productDoc.id, data)
    batch.set(db.collection('products').doc(productDoc.id), identity, { merge: true })
    writes += 1
    batch.set(db.collection('publicListings').doc(identity.publicListingId), publicPayload(productDoc.id, data, storeMeta, identity), { merge: true })
    writes += 1
    countListing(writtenCounts, listingType)
    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  if (writes > 0) await batch.commit()

  await storeRef.set({
    publicCatalogLastSyncedAt: safeServerTimestamp(),
    publicCatalogDocCount: writtenCounts,
    publicCatalogOutOfSyncCount: 0,
  }, { merge: true })
}

export const syncPublicCatalogOnStoreEligibilityUpdate = functions.firestore.document('stores/{storeId}').onUpdate(async (change, context) => {
  const before = (change.before.data() ?? {}) as StoreData
  const after = (change.after.data() ?? {}) as StoreData
  const storeId = String(context.params.storeId || '')
  const watched: Array<keyof StoreData> = [
    'verified',
    'verified_product',
    'eligibleForBuy',
    'buyOptOut',
    'status',
    'paymentStatus',
    'contractStatus',
    'displayName',
    'storeName',
    'name',
    'phone',
    'phoneNumber',
    'storePhone',
    'contactPhone',
    'whatsappNumber',
    'waLink',
    'publicEmail',
    'email',
    'ownerEmail',
    'websiteUrl',
    'websiteLink',
    'storeWebsiteUrl',
    'storeWebsite',
    'website',
    'promoWebsiteUrl',
    'logoUrl',
    'storeLogoUrl',
    'addressLine1',
    'address',
    'city',
    'storeCity',
    'town',
    'country',
    'storeCountry',
    'instagramUrl',
    'instagramHandle',
    'facebookUrl',
    'tiktokUrl',
    'tiktokHandle',
    'youtubeUrl',
    'xUrl',
    'twitterUrl',
    'xHandle',
    'linkedinUrl',
  ]
  if (!watched.some((field) => before[field] !== after[field])) return
  if (isStoreEligible(after)) return syncStorePublicCatalog(storeId)
  if (isStoreEligible(before)) return removeStorePublicCatalog(storeId)
})

export const syncPublicCatalogOnProductWrite = functions.firestore.document('products/{productId}').onWrite(async (change, context) => {
  const productId = String(context.params.productId || '')
  const beforeData = (change.before.data() ?? {}) as ProductData
  const beforeIdentity = resolvePublicListingId(productId, beforeData)
  if (!change.after.exists) {
    await db.collection('publicListings').doc(beforeIdentity.publicListingId).delete()
    return
  }
  const afterData = (change.after.data() ?? {}) as ProductData
  const afterIdentity = resolvePublicListingId(productId, afterData)
  await db.collection('products').doc(productId).set(afterIdentity, { merge: true })
  const storeId = text(afterData.storeId)
  if (!storeId) {
    await db.collection('publicListings').doc(afterIdentity.publicListingId).delete()
    return
  }
  const storeSnap = await db.collection('stores').doc(storeId).get()
  const storeData = (storeSnap.data() ?? {}) as StoreData
  const eligibleStore = isStoreEligible(storeData)
  if (!eligibleStore) {
    await db.collection('publicListings').doc(afterIdentity.publicListingId).delete()
    return
  }
  if (!shouldIncludeProduct(afterData, eligibleStore)) {
    await db.collection('publicListings').doc(afterIdentity.publicListingId).delete()
    return
  }
  await db.collection('publicListings').doc(afterIdentity.publicListingId).set(publicPayload(productId, afterData, buildStoreMeta(storeData), afterIdentity), { merge: true })
  if (beforeIdentity.publicListingId !== afterIdentity.publicListingId) {
    functions.logger.info('public listing id migrated; retaining prior listing for later cleanup', {
      productId,
      previousPublicListingId: beforeIdentity.publicListingId,
      nextPublicListingId: afterIdentity.publicListingId,
    })
  }
})

export const adminSyncStorePublicCatalog = functions.https.onCall(async (data: SyncStorePayload, context) => {
  const runningInEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  const storeId = text(data?.storeId)
  if (!storeId) {
    throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
  }

  const storeSnapBefore = await db.collection('stores').doc(storeId).get()
  const storeDataBefore = (storeSnapBefore.data() ?? {}) as StoreData

  if (!runningInEmulator) {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.')
    }
    if (!canManageStoreCatalog(storeDataBefore, context.auth)) {
      throw new functions.https.HttpsError('permission-denied', 'Store owner or admin access required.')
    }
  }

  await syncStorePublicCatalog(storeId)

  const storeSnap = await db.collection('stores').doc(storeId).get()
  const storeData = (storeSnap.data() ?? {}) as StoreData
  return {
    ok: true,
    storeId,
    publicCatalogDocCount: storeData.publicCatalogDocCount ?? null,
    publicCatalogOutOfSyncCount: numberOrNull(storeData.publicCatalogOutOfSyncCount) ?? null,
    publicCatalogLastSyncedAt: timestampOrIso(storeData.publicCatalogLastSyncedAt),
  }
})

export const adminBackfillPublicListings = functions.https.onCall(async (data: BackfillPayload, context) => {
  const runningInEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  if (!runningInEmulator) {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.')
    }
    const isAdmin = context.auth.token?.admin === true
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.')
    }
  }

  const dryRun = data?.dryRun === true
  const productsSnap = await db.collection('products').get()

  const storeCache = new Map<string, StoreData | undefined>()
  let scannedCount = 0
  let syncedCount = 0
  let skippedCount = 0
  let legacyIncludedCount = 0
  let explicitHiddenCount = 0
  let batch = db.batch()
  let writes = 0

  for (const productDoc of productsSnap.docs) {
    scannedCount += 1
    const productData = (productDoc.data() ?? {}) as ProductData
    const storeId = text(productData.storeId)
    if (!storeId) {
      skippedCount += 1
      continue
    }

    let storeData = storeCache.get(storeId)
    if (!storeCache.has(storeId)) {
      const storeSnap = await db.collection('stores').doc(storeId).get()
      storeData = (storeSnap.data() ?? {}) as StoreData
      storeCache.set(storeId, storeData)
    }

    const eligibleStore = !!storeData && isStoreEligible(storeData)
    const includeProduct = shouldIncludeProduct(productData, eligibleStore)
    if (!includeProduct) {
      skippedCount += 1
      if (productData.isMarketplaceVisible === false || productData.isPublished === false || isDraftStatus(productData.status)) {
        explicitHiddenCount += 1
      }
      continue
    }
    const eligibleStoreData = storeData as StoreData

    syncedCount += 1
    if (hasLegacyPublicationFields(productData)) {
      legacyIncludedCount += 1
    }
    if (dryRun) continue
    const identity = resolvePublicListingId(productDoc.id, productData)
    const productUpdates: Record<string, unknown> = { ...identity }
    if (hasLegacyPublicationFields(productData) && productData.isMarketplaceVisible !== true) {
      productUpdates.isMarketplaceVisible = true
      productUpdates.migratedMarketplaceVisible = true
      productUpdates.marketplaceVisibilitySource = 'legacy_verified_store'
    }
    if (Object.keys(productUpdates).length > 0) {
      batch.set(
        db.collection('products').doc(productDoc.id),
        productUpdates,
        { merge: true },
      )
      writes += 1
    }

    try {
      batch.set(
        db.collection('publicListings').doc(identity.publicListingId),
        publicPayload(productDoc.id, productData, buildStoreMeta(eligibleStoreData), identity),
        { merge: true },
      )
      writes += 1
    } catch (error) {
      skippedCount += 1
      syncedCount -= 1
      functions.logger.error('adminBackfillPublicListings failed to build public payload', {
        productId: productDoc.id,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  if (!dryRun && writes > 0) {
    await batch.commit()
  }

  functions.logger.info('adminBackfillPublicListings completed', {
    dryRun,
    scannedCount,
    syncedCount,
    skippedCount,
    legacyIncludedCount,
    explicitHiddenCount,
  })

  return {
    ok: true,
    dryRun,
    scannedCount,
    syncedCount,
    skippedCount,
    legacyIncludedCount,
    explicitHiddenCount,
  }
})