import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'
import { resolvePublicationTimestampCandidate } from './catalogPublication'

type StoreData = Record<string, unknown>
type ProductData = Record<string, unknown>
type BackfillPayload = {
  dryRun?: unknown
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function itemType(value: unknown): 'product' | 'service' | 'course' {
  return value === 'course' ? 'course' : value === 'service' ? 'service' : 'product'
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

function isStoreEligible(store: StoreData | undefined): boolean {
  if (!store) return false
  return store.verified === true && store.eligibleForBuy === true && store.buyOptOut !== true && store.status === 'active'
}

function buildStoreMeta(store: StoreData): Record<string, unknown> {
  return {
    storeName: text(store.displayName) ?? text(store.name),
    storeCity: text(store.city) ?? text(store.town),
    storePhone: text(store.phone) ?? text(store.phoneNumber) ?? text(store.contactPhone),
    websiteLink: text(store.websiteLink) ?? text(store.promoWebsiteUrl),
  }
}

function publicPayload(productId: string, data: ProductData, storeMeta: Record<string, unknown>): Record<string, unknown> {
  const normalizedItemType = itemType(data.itemType)
  const status = data.isPublished === true ? 'published' : 'draft'
  return {
    sourceProductId: productId,
    storeId: text(data.storeId),
    ...storeMeta,
    name: text(data.name),
    description: text(data.description),
    category: text(data.category),
    price: typeof data.price === 'number' ? data.price : null,
    imageUrl: text(data.imageUrl),
    imageUrls: toArray(data.imageUrls),
    imageAlt: text(data.imageAlt),
    itemType: normalizedItemType,
    listingType: normalizedItemType,
    status,
    isPublished: true,
    isMarketplaceVisible: data.isMarketplaceVisible === true,
    isWebsiteVisible: data.isWebsiteVisible === true,
    salesMode: text(data.salesMode),
    categoryKey: text(data.categoryKey),
    categoryName: text(data.categoryName) ?? text(data.category),
    currency: text(data.currency) ?? 'GHS',
    publishedAt: resolvePublicationTimestampCandidate(data.publishedAt, data.createdAt, data.updatedAt),
    unpublishedAt: admin.firestore.FieldValue.delete(),
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
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
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
    publicCatalogLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    publicCatalogDocCount: { listings: 0 },
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
  const productsSnap = await db.collection('products').where('storeId', '==', storeId).where('isPublished', '==', true).get()
  let batch = db.batch()
  let writes = 0
  let writtenListings = 0
  for (const productDoc of productsSnap.docs) {
    const data = (productDoc.data() ?? {}) as ProductData
    if (data.isMarketplaceVisible !== true) continue
    batch.set(db.collection('publicListings').doc(productDoc.id), publicPayload(productDoc.id, data, storeMeta), { merge: true })
    writes += 1
    writtenListings += 1
    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  if (writes > 0) await batch.commit()

  await storeRef.set({
    publicCatalogLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    publicCatalogDocCount: { listings: writtenListings },
    publicCatalogOutOfSyncCount: 0,
  }, { merge: true })
}

export const syncPublicCatalogOnStoreEligibilityUpdate = functions.firestore.document('stores/{storeId}').onUpdate(async (change, context) => {
  const before = (change.before.data() ?? {}) as StoreData
  const after = (change.after.data() ?? {}) as StoreData
  const storeId = String(context.params.storeId || '')
  const watched: Array<keyof StoreData> = ['verified', 'verified_product', 'eligibleForBuy', 'buyOptOut', 'status', 'paymentStatus', 'contractStatus']
  if (!watched.some((field) => before[field] !== after[field])) return
  if (isStoreEligible(after)) return syncStorePublicCatalog(storeId)
  if (isStoreEligible(before)) return removeStorePublicCatalog(storeId)
})

export const syncPublicCatalogOnProductWrite = functions.firestore.document('products/{productId}').onWrite(async (change, context) => {
  const productId = String(context.params.productId || '')
  if (!change.after.exists) {
    await db.collection('publicListings').doc(productId).delete()
    return
  }
  const afterData = (change.after.data() ?? {}) as ProductData
  const storeId = text(afterData.storeId)
  if (!storeId || afterData.isPublished !== true) {
    await db.collection('publicListings').doc(productId).delete()
    return
  }
  if (afterData.isMarketplaceVisible !== true) {
    await db.collection('publicListings').doc(productId).delete()
    return
  }
  const storeSnap = await db.collection('stores').doc(storeId).get()
  const storeData = (storeSnap.data() ?? {}) as StoreData
  if (!isStoreEligible(storeData)) {
    await db.collection('publicListings').doc(productId).delete()
    return
  }
  await db.collection('publicListings').doc(productId).set(publicPayload(productId, afterData, buildStoreMeta(storeData)), { merge: true })
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
  const productsSnap = await db.collection('products')
    .where('isPublished', '==', true)
    .get()

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

    if (productData.isMarketplaceVisible === false) {
      skippedCount += 1
      explicitHiddenCount += 1
      continue
    }

    let storeData = storeCache.get(storeId)
    if (!storeCache.has(storeId)) {
      const storeSnap = await db.collection('stores').doc(storeId).get()
      storeData = (storeSnap.data() ?? {}) as StoreData
      storeCache.set(storeId, storeData)
    }

    const eligibleStore = !!storeData && isStoreEligible(storeData)
    const isExplicitVisible = productData.isMarketplaceVisible === true
    const isLegacyCandidate = productData.isMarketplaceVisible === null || productData.isMarketplaceVisible === undefined
    const includeExplicit = isExplicitVisible && eligibleStore
    const includeLegacy = isLegacyCandidate && eligibleStore
    if (!includeExplicit && !includeLegacy) {
      skippedCount += 1
      continue
    }
    const eligibleStoreData = storeData as StoreData

    syncedCount += 1
    if (includeLegacy) {
      legacyIncludedCount += 1
    }
    if (dryRun) continue

    if (includeLegacy) {
      batch.set(
        db.collection('products').doc(productDoc.id),
        {
          isMarketplaceVisible: true,
          migratedMarketplaceVisible: true,
          marketplaceVisibilitySource: 'legacy_verified_store',
        },
        { merge: true },
      )
      writes += 1
    }

    batch.set(
      db.collection('publicListings').doc(productDoc.id),
      publicPayload(productDoc.id, productData, buildStoreMeta(eligibleStoreData)),
      { merge: true },
    )
    writes += 1

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
