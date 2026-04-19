#!/usr/bin/env node
/* eslint-disable no-console */

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

function toTrimmedStringOrNull(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toTrimmedStringArray(value) {
  if (!Array.isArray(value)) return []
  const unique = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    unique.add(trimmed)
  }
  return [...unique]
}

function isFirestoreTimestampLike(value) {
  return (
    value instanceof admin.firestore.Timestamp ||
    (value && typeof value === 'object' && typeof value.toDate === 'function')
  )
}

function pickStoreCity(storeData) {
  return toTrimmedStringOrNull(storeData.city) || toTrimmedStringOrNull(storeData.town)
}

function buildStorePublicMeta(storeData) {
  const promoSlug = toTrimmedStringOrNull(storeData.promoSlug)
  return {
    storeName: toTrimmedStringOrNull(storeData.displayName) || toTrimmedStringOrNull(storeData.name),
    storeCity: pickStoreCity(storeData),
    storePhone:
      toTrimmedStringOrNull(storeData.phone) ||
      toTrimmedStringOrNull(storeData.phoneNumber) ||
      toTrimmedStringOrNull(storeData.contactPhone),
    websiteLink:
      toTrimmedStringOrNull(storeData.websiteLink) ||
      toTrimmedStringOrNull(storeData.promoWebsiteUrl) ||
      (promoSlug ? `https://www.sedifex.com/${encodeURIComponent(promoSlug)}` : null),
  }
}

function extractProductImageSet(data) {
  const primaryImageUrl = toTrimmedStringOrNull(data.imageUrl)
  const imageUrls = toTrimmedStringArray(data.imageUrls)
  if (primaryImageUrl && !imageUrls.includes(primaryImageUrl)) {
    imageUrls.unshift(primaryImageUrl)
  }

  const fallbackImageUrl = imageUrls[0] ?? primaryImageUrl ?? null
  if (fallbackImageUrl && !imageUrls.length) {
    imageUrls.push(fallbackImageUrl)
  }

  return {
    imageUrl: fallbackImageUrl,
    imageUrls,
    imageAlt: toTrimmedStringOrNull(data.imageAlt),
  }
}

function toPublicProduct(productDoc, storeMetaByStoreId) {
  const data = productDoc.data() || {}
  const storeId = toTrimmedStringOrNull(data.storeId)
  const name = toTrimmedStringOrNull(data.name)
  const storeMeta = storeMetaByStoreId.get(storeId) || null

  if (!storeId || !name) {
    return null
  }

  return {
    sourceProductId: productDoc.id,
    storeId,
    storeName: toTrimmedStringOrNull(data.storeName) || storeMeta?.storeName || null,
    storeCity: toTrimmedStringOrNull(data.storeCity) || storeMeta?.storeCity || null,
    storePhone: toTrimmedStringOrNull(data.storePhone) || storeMeta?.storePhone || null,
    websiteLink: toTrimmedStringOrNull(data.websiteLink) || storeMeta?.websiteLink || null,
    name,
    description: toTrimmedStringOrNull(data.description),
    category: toTrimmedStringOrNull(data.category),
    sku: toTrimmedStringOrNull(data.sku),
    barcode: toTrimmedStringOrNull(data.barcode),
    manufacturerName: toTrimmedStringOrNull(data.manufacturerName),
    price: typeof data.price === 'number' ? data.price : null,
    stockCount: typeof data.stockCount === 'number' ? data.stockCount : null,
    reorderPoint: typeof data.reorderPoint === 'number' ? data.reorderPoint : null,
    taxRate: typeof data.taxRate === 'number' ? data.taxRate : null,
    productionDate: isFirestoreTimestampLike(data.productionDate) || typeof data.productionDate === 'string' ? data.productionDate : null,
    expiryDate: isFirestoreTimestampLike(data.expiryDate) || typeof data.expiryDate === 'string' ? data.expiryDate : null,
    batchNumber: toTrimmedStringOrNull(data.batchNumber),
    showOnReceipt: data.showOnReceipt === true,
    itemType:
      data.itemType === 'service'
        ? 'service'
        : data.itemType === 'made_to_order'
          ? 'made_to_order'
          : 'product',
    isPublished: data.isPublished !== false,
    ...extractProductImageSet(data),
    publishedAt: data.publishedAt ?? data.createdAt ?? data.updatedAt ?? admin.firestore.FieldValue.serverTimestamp(),
    createdAt: data.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    sourceUpdatedAt: data.updatedAt ?? null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

function resolvePublicCatalogCollectionName(itemType) {
  return itemType === 'service' ? 'publicServices' : 'publicProducts'
}

function hasPublishedAt(value) {
  return (
    value instanceof admin.firestore.Timestamp ||
    typeof value === 'string' ||
    (value && typeof value === 'object' && typeof value.toDate === 'function')
  )
}

function resolvePublishedAtValue(data) {
  if (hasPublishedAt(data.publishedAt)) {
    return data.publishedAt
  }
  if (hasPublishedAt(data.createdAt)) {
    return data.createdAt
  }
  if (hasPublishedAt(data.sourceUpdatedAt)) {
    return data.sourceUpdatedAt
  }
  if (hasPublishedAt(data.updatedAt)) {
    return data.updatedAt
  }
  return admin.firestore.FieldValue.serverTimestamp()
}

async function run() {
  const targetStoreId = toTrimmedStringOrNull(process.argv[2])
  let query = db.collection('products')

  if (targetStoreId) {
    query = query.where('storeId', '==', targetStoreId)
    console.log(`[backfillPublicProducts] running for storeId=${targetStoreId}`)
  } else {
    console.log('[backfillPublicProducts] running for all stores')
  }

  const productsSnapshot = await query.get()
  console.log(`[backfillPublicProducts] scanning ${productsSnapshot.size} products`)

  const storeIds = new Set()
  for (const productDoc of productsSnapshot.docs) {
    const storeId = toTrimmedStringOrNull(productDoc.get('storeId'))
    if (storeId) storeIds.add(storeId)
  }

  const storeMetaByStoreId = new Map()
  for (const storeId of storeIds) {
    const storeSnap = await db.collection('stores').doc(storeId).get()
    if (!storeSnap.exists) continue
    storeMetaByStoreId.set(storeId, buildStorePublicMeta(storeSnap.data() || {}))
  }

  let upserts = 0
  let skipped = 0
  let batch = db.batch()
  let writes = 0

  for (const productDoc of productsSnapshot.docs) {
    const payload = toPublicProduct(productDoc, storeMetaByStoreId)
    if (!payload) {
      skipped += 1
      continue
    }

    const targetCollectionName = resolvePublicCatalogCollectionName(payload.itemType)
    const targetRef = db.collection(targetCollectionName).doc(productDoc.id)
    const oppositeRef =
      targetCollectionName === 'publicServices'
        ? db.collection('publicProducts').doc(productDoc.id)
        : db.collection('publicServices').doc(productDoc.id)
    batch.set(targetRef, payload, { merge: true })
    batch.delete(oppositeRef)
    upserts += 1
    writes += 2

    if (writes >= 450) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  if (writes > 0) {
    await batch.commit()
  }

  console.log(
    `[backfillPublicProducts] done. upserts=${upserts}, skipped=${skipped}, total=${productsSnapshot.size}`,
  )

  const publicCollections = ['publicProducts', 'publicServices']
  let publishedAtBackfills = 0

  for (const collectionName of publicCollections) {
    let publicQuery = db.collection(collectionName)
    if (targetStoreId) {
      publicQuery = publicQuery.where('storeId', '==', targetStoreId)
    }
    const publicSnapshot = await publicQuery.get()
    console.log(
      `[backfillPublicProducts] scanning ${publicSnapshot.size} ${collectionName} docs for publishedAt`,
    )

    batch = db.batch()
    writes = 0
    for (const publicDoc of publicSnapshot.docs) {
      const data = publicDoc.data() || {}
      if (hasPublishedAt(data.publishedAt)) {
        continue
      }

      batch.set(
        publicDoc.ref,
        {
          publishedAt: resolvePublishedAtValue(data),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      publishedAtBackfills += 1
      writes += 1

      if (writes >= 450) {
        await batch.commit()
        batch = db.batch()
        writes = 0
      }
    }

    if (writes > 0) {
      await batch.commit()
    }
  }

  console.log(
    `[backfillPublicProducts] publishedAt backfill complete across publicProducts/publicServices. updated=${publishedAtBackfills}`,
  )
}

run().catch(error => {
  console.error('[backfillPublicProducts] failed', error)
  process.exit(1)
})
