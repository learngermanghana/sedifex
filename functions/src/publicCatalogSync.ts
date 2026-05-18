import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'
import { resolvePublicationTimestampCandidate } from './catalogPublication'

type StoreData = Record<string, unknown>
type ProductData = Record<string, unknown>

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
  return (
    store.verified === true &&
    store.eligibleForBuy === true &&
    store.buyOptOut !== true &&
    store.status === 'active'
  )
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
    isPublished: true,
    publishedAt: resolvePublicationTimestampCandidate(data.publishedAt, data.createdAt, data.updatedAt),
    unpublishedAt: admin.firestore.FieldValue.delete(),
    sourceUpdatedAt: data.updatedAt ?? null,
    listingType: normalizedItemType === 'course' ? 'course' : text(data.listingType),
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

async function flush(batch: FirebaseFirestore.WriteBatch, count: number): Promise<void> {
  if (count > 0) await batch.commit()
}

export async function removeStorePublicCatalog(storeId: string): Promise<void> {
  const [publicProducts, publicServices] = await Promise.all([
    db.collection('publicProducts').where('storeId', '==', storeId).get(),
    db.collection('publicServices').where('storeId', '==', storeId).get(),
  ])

  let batch = db.batch()
  let writes = 0
  let removed = 0

  for (const doc of [...publicProducts.docs, ...publicServices.docs]) {
    batch.delete(doc.ref)
    writes += 1
    removed += 1
    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }
  await flush(batch, writes)

  await db.collection('stores').doc(storeId).set(
    {
      publicCatalogLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      publicCatalogDocCount: { products: 0, services: 0 },
    },
    { merge: true },
  )

  functions.logger.info('removeStorePublicCatalog complete', { storeId, publicDocsRemoved: removed })
}

export async function syncStorePublicCatalog(storeId: string): Promise<void> {
  const storeRef = db.collection('stores').doc(storeId)
  const storeSnap = await storeRef.get()
  const storeData = (storeSnap.data() ?? {}) as StoreData
  const eligible = isStoreEligible(storeData)

  if (!eligible) {
    await removeStorePublicCatalog(storeId)
    return
  }

  const storeMeta = buildStoreMeta(storeData)
  const productsSnap = await db.collection('products').where('storeId', '==', storeId).where('isPublished', '==', true).get()

  let batch = db.batch()
  let writes = 0
  let writtenProducts = 0
  let writtenServices = 0
  let removed = 0

  for (const productDoc of productsSnap.docs) {
    const data = (productDoc.data() ?? {}) as ProductData
    const normalizedItemType = itemType(data.itemType)
    const targetCollection = normalizedItemType === 'product' ? 'publicProducts' : 'publicServices'
    const oppositeCollection = normalizedItemType === 'product' ? 'publicServices' : 'publicProducts'
    const payload = publicPayload(productDoc.id, data, storeMeta)

    batch.set(db.collection(targetCollection).doc(productDoc.id), payload, { merge: true })
    batch.delete(db.collection(oppositeCollection).doc(productDoc.id))
    writes += 2
    removed += 1

    if (normalizedItemType !== 'product') writtenServices += 1
    else writtenProducts += 1

    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  await flush(batch, writes)

  await storeRef.set(
    {
      publicCatalogLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      publicCatalogDocCount: {
        products: writtenProducts,
        services: writtenServices,
      },
      publicCatalogOutOfSyncCount: 0,
    },
    { merge: true },
  )

  functions.logger.info('syncStorePublicCatalog complete', {
    storeId,
    productsScanned: productsSnap.size,
    publicProductsWritten: writtenProducts,
    publicServicesWritten: writtenServices,
    publicDocsRemoved: removed,
  })
}

export const syncPublicCatalogOnStoreEligibilityUpdate = functions.firestore
  .document('stores/{storeId}')
  .onUpdate(async (change, context) => {
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
    ]

    const changed = watched.some((field) => before[field] !== after[field])
    if (!changed) return

    const beforeEligible = isStoreEligible(before)
    const afterEligible = isStoreEligible(after)

    functions.logger.info('store eligibility changed', { storeId, beforeEligible, afterEligible })

    if (afterEligible) {
      await syncStorePublicCatalog(storeId)
      return
    }

    if (beforeEligible && !afterEligible) {
      await removeStorePublicCatalog(storeId)
    }
  })

export const syncPublicCatalogOnProductWrite = functions.firestore
  .document('products/{productId}')
  .onWrite(async (change, context) => {
    const productId = String(context.params.productId || '')
    const afterExists = change.after.exists

    if (!afterExists) {
      await Promise.all([
        db.collection('publicProducts').doc(productId).delete(),
        db.collection('publicServices').doc(productId).delete(),
      ])
      functions.logger.info('product removed from public catalog', { productId })
      return
    }

    const afterData = (change.after.data() ?? {}) as ProductData
    const storeId = text(afterData.storeId)
    if (!storeId || afterData.isPublished !== true) {
      await Promise.all([
        db.collection('publicProducts').doc(productId).delete(),
        db.collection('publicServices').doc(productId).delete(),
      ])
      return
    }

    const storeSnap = await db.collection('stores').doc(storeId).get()
    const storeData = (storeSnap.data() ?? {}) as StoreData
    if (!isStoreEligible(storeData)) {
      await Promise.all([
        db.collection('publicProducts').doc(productId).delete(),
        db.collection('publicServices').doc(productId).delete(),
      ])
      return
    }

    const payload = publicPayload(productId, afterData, buildStoreMeta(storeData))
    const normalizedItemType = itemType(afterData.itemType)
    const isPublicProduct = normalizedItemType === 'product'
    const target = isPublicProduct ? 'publicProducts' : 'publicServices'
    const opposite = isPublicProduct ? 'publicServices' : 'publicProducts'

    await Promise.all([
      db.collection(target).doc(productId).set(payload, { merge: true }),
      db.collection(opposite).doc(productId).delete(),
    ])

    functions.logger.info('product synced to public catalog', {
      storeId,
      productId,
      publicProductsWritten: isPublicProduct ? 1 : 0,
      publicServicesWritten: isPublicProduct ? 0 : 1,
      publicDocsRemoved: 1,
    })
  })
