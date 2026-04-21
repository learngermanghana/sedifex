#!/usr/bin/env node
/* eslint-disable no-console */

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

function parseCliArgs(argv) {
  const options = {
    storeId: null,
    showHelp: false,
    mode: 'backfill',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token) continue
    if (token === '--help' || token === '-h') {
      options.showHelp = true
      continue
    }
    if (token === '--store-id') {
      options.storeId = argv[index + 1] ?? null
      index += 1
      continue
    }
    if (token.startsWith('--store-id=')) {
      options.storeId = token.slice('--store-id='.length)
      continue
    }
    if (token === '--mode') {
      options.mode = argv[index + 1] ?? options.mode
      index += 1
      continue
    }
    if (token.startsWith('--mode=')) {
      options.mode = token.slice('--mode='.length)
      continue
    }
    if (!token.startsWith('--') && !options.storeId) {
      // Backward-compatible positional form: node backfillPublicProducts.js <storeId>
      options.storeId = token
    }
  }

  return options
}

function printHelp() {
  console.log('Usage: node scripts/backfillPublicProducts.js [--store-id=<storeId>] [--mode=backfill|reconcile]')
  console.log('')
  console.log('Modes:')
  console.log('  backfill   Backfills products into publicProducts/publicServices (default).')
  console.log('  reconcile Verify + repair published catalog consistency and metadata drift.')
}

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

function normalizeCategory(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized || null
}

function toPublicProduct(productDoc, storeMetaByStoreId, existingDocData = null) {
  const data = productDoc.data() || {}
  const storeId = toTrimmedStringOrNull(data.storeId)
  const name = toTrimmedStringOrNull(data.name)
  const storeMeta = storeMetaByStoreId.get(storeId) || null

  if (!storeId || !name) {
    return null
  }

  const category = normalizeCategory(data.category)

  return {
    sourceProductId: productDoc.id,
    storeId,
    storeName: toTrimmedStringOrNull(data.storeName) || storeMeta?.storeName || null,
    storeCity: toTrimmedStringOrNull(data.storeCity) || storeMeta?.storeCity || null,
    storePhone: toTrimmedStringOrNull(data.storePhone) || storeMeta?.storePhone || null,
    websiteLink: toTrimmedStringOrNull(data.websiteLink) || storeMeta?.websiteLink || null,
    name,
    description: toTrimmedStringOrNull(data.description),
    category,
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
    publishedAt: resolvePublishedAtValue(existingDocData || data),
    createdAt: data.createdAt ?? existingDocData?.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    sourceUpdatedAt: data.updatedAt ?? null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

async function flushBatch(state) {
  if (state.writes === 0) return
  await state.batch.commit()
  state.batch = db.batch()
  state.writes = 0
}

function queueSet(state, ref, payload, options = { merge: true }) {
  state.batch.set(ref, payload, options)
  state.writes += 1
}

function queueDelete(state, ref) {
  state.batch.delete(ref)
  state.writes += 1
}

async function maybeFlushBatch(state) {
  if (state.writes >= 450) {
    await flushBatch(state)
  }
}

async function runBackfill(targetStoreId) {
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
  const batchState = { batch: db.batch(), writes: 0 }

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

    queueSet(batchState, targetRef, payload, { merge: true })
    queueDelete(batchState, oppositeRef)
    upserts += 1

    await maybeFlushBatch(batchState)
  }

  await flushBatch(batchState)

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

    const publicBatchState = { batch: db.batch(), writes: 0 }
    for (const publicDoc of publicSnapshot.docs) {
      const data = publicDoc.data() || {}
      const needsPublishedAt = !hasPublishedAt(data.publishedAt)
      const normalizedCategory = normalizeCategory(data.category)
      const needsCategoryRepair = data.category !== normalizedCategory
      const needsUpdatedAt = !isFirestoreTimestampLike(data.updatedAt) && !hasPublishedAt(data.updatedAt)

      if (!needsPublishedAt && !needsCategoryRepair && !needsUpdatedAt) {
        continue
      }

      queueSet(
        publicBatchState,
        publicDoc.ref,
        {
          publishedAt: needsPublishedAt ? resolvePublishedAtValue(data) : data.publishedAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          category: normalizedCategory,
        },
        { merge: true },
      )
      publishedAtBackfills += 1
      await maybeFlushBatch(publicBatchState)
    }

    await flushBatch(publicBatchState)
  }

  console.log(
    `[backfillPublicProducts] metadata backfill complete across publicProducts/publicServices. updated=${publishedAtBackfills}`,
  )
}

async function reconcileStore(storeId, storeMetaByStoreId) {
  const productsSnapshot = await db
    .collection('products')
    .where('storeId', '==', storeId)
    .where('isPublished', '==', true)
    .get()
  const [publicProductsSnapshot, publicServicesSnapshot] = await Promise.all([
    db.collection('publicProducts').where('storeId', '==', storeId).get(),
    db.collection('publicServices').where('storeId', '==', storeId).get(),
  ])

  const publicProductsById = new Map(publicProductsSnapshot.docs.map(doc => [doc.id, doc]))
  const publicServicesById = new Map(publicServicesSnapshot.docs.map(doc => [doc.id, doc]))
  const publishedIds = new Set(productsSnapshot.docs.map(doc => doc.id))

  const summary = {
    storeId,
    publishedProducts: productsSnapshot.size,
    existingPublicProducts: publicProductsSnapshot.size,
    existingPublicServices: publicServicesSnapshot.size,
    missingTarget: 0,
    wrongCollectionRepaired: 0,
    duplicateTargetRepaired: 0,
    metadataRepairs: 0,
    orphanPublicDocsRemoved: 0,
    sourceMetadataRepairs: 0,
    outOfSyncDetected: 0,
  }

  const batchState = { batch: db.batch(), writes: 0 }

  for (const productDoc of productsSnapshot.docs) {
    const productData = productDoc.data() || {}
    const expectedCollection = resolvePublicCatalogCollectionName(productData.itemType)
    const expectedRef = db.collection(expectedCollection).doc(productDoc.id)
    const oppositeRef =
      expectedCollection === 'publicServices'
        ? db.collection('publicProducts').doc(productDoc.id)
        : db.collection('publicServices').doc(productDoc.id)

    const existingExpected = expectedCollection === 'publicServices'
      ? publicServicesById.get(productDoc.id) || null
      : publicProductsById.get(productDoc.id) || null
    const existingOpposite = expectedCollection === 'publicServices'
      ? publicProductsById.get(productDoc.id) || null
      : publicServicesById.get(productDoc.id) || null

    if (!existingExpected) {
      summary.missingTarget += 1
      summary.outOfSyncDetected += 1
      const payload = toPublicProduct(productDoc, storeMetaByStoreId)
      if (payload) {
        queueSet(batchState, expectedRef, payload, { merge: true })
      }
    }

    if (existingOpposite) {
      summary.wrongCollectionRepaired += 1
      summary.outOfSyncDetected += 1
      queueDelete(batchState, oppositeRef)
    }

    if (existingExpected && existingOpposite) {
      summary.duplicateTargetRepaired += 1
    }

    const normalizedSourceCategory = normalizeCategory(productData.category)
    const needsSourceCategoryRepair = productData.category !== normalizedSourceCategory
    const needsSourcePublishedAt = !hasPublishedAt(productData.publishedAt)
    const needsSourceUpdatedAt = !isFirestoreTimestampLike(productData.updatedAt) && !hasPublishedAt(productData.updatedAt)

    if (needsSourceCategoryRepair || needsSourcePublishedAt || needsSourceUpdatedAt) {
      summary.sourceMetadataRepairs += 1
      queueSet(batchState, productDoc.ref, {
        category: normalizedSourceCategory,
        publishedAt: needsSourcePublishedAt ? resolvePublishedAtValue(productData) : productData.publishedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    }

    const expectedData = existingExpected ? existingExpected.data() || {} : null
    if (expectedData) {
      const normalizedCategory = normalizeCategory(expectedData.category)
      const needsCategoryRepair = expectedData.category !== normalizedCategory
      const needsPublishedAtRepair = !hasPublishedAt(expectedData.publishedAt)
      const needsUpdatedAtRepair = !isFirestoreTimestampLike(expectedData.updatedAt) && !hasPublishedAt(expectedData.updatedAt)
      if (needsCategoryRepair || needsPublishedAtRepair || needsUpdatedAtRepair) {
        summary.metadataRepairs += 1
        queueSet(batchState, expectedRef, {
          category: normalizedCategory,
          publishedAt: needsPublishedAtRepair ? resolvePublishedAtValue(expectedData) : expectedData.publishedAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      }
    }

    await maybeFlushBatch(batchState)
  }

  for (const publicDoc of [...publicProductsSnapshot.docs, ...publicServicesSnapshot.docs]) {
    if (publishedIds.has(publicDoc.id)) continue
    summary.orphanPublicDocsRemoved += 1
    summary.outOfSyncDetected += 1
    queueDelete(batchState, publicDoc.ref)
    await maybeFlushBatch(batchState)
  }

  await flushBatch(batchState)

  const [nextPublicProductsSnapshot, nextPublicServicesSnapshot] = await Promise.all([
    db.collection('publicProducts').where('storeId', '==', storeId).get(),
    db.collection('publicServices').where('storeId', '==', storeId).get(),
  ])

  await db.collection('stores').doc(storeId).set(
    {
      publicCatalogLastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      publicCatalogDocCount: {
        products: nextPublicProductsSnapshot.size,
        services: nextPublicServicesSnapshot.size,
      },
      publicCatalogOutOfSyncCount: 0,
    },
    { merge: true },
  )

  return summary
}

async function runReconciliation(targetStoreId) {
  let productsQuery = db.collection('products').where('isPublished', '==', true)
  if (targetStoreId) {
    productsQuery = productsQuery.where('storeId', '==', targetStoreId)
    console.log(`[backfillPublicProducts] reconcile mode for storeId=${targetStoreId}`)
  } else {
    console.log('[backfillPublicProducts] reconcile mode for all stores')
  }

  const publishedProductsSnapshot = await productsQuery.get()
  const storeIds = new Set()
  for (const productDoc of publishedProductsSnapshot.docs) {
    const storeId = toTrimmedStringOrNull(productDoc.get('storeId'))
    if (storeId) storeIds.add(storeId)
  }
  if (targetStoreId) {
    storeIds.add(targetStoreId)
  }

  const storeMetaByStoreId = new Map()
  for (const storeId of storeIds) {
    const storeSnap = await db.collection('stores').doc(storeId).get()
    if (!storeSnap.exists) continue
    storeMetaByStoreId.set(storeId, buildStorePublicMeta(storeSnap.data() || {}))
  }

  const summaries = []
  for (const storeId of [...storeIds]) {
    const summary = await reconcileStore(storeId, storeMetaByStoreId)
    summaries.push(summary)
    console.log(
      `[reconcile] store=${summary.storeId} published=${summary.publishedProducts} missingTarget=${summary.missingTarget} ` +
      `wrongCollectionRepaired=${summary.wrongCollectionRepaired} metadataRepairs=${summary.metadataRepairs} ` +
      `sourceMetadataRepairs=${summary.sourceMetadataRepairs} orphanRemoved=${summary.orphanPublicDocsRemoved} outOfSyncDetected=${summary.outOfSyncDetected}`,
    )
  }

  console.log('[reconcile] summary report by store:')
  console.log(JSON.stringify(summaries, null, 2))
}

async function run() {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.showHelp) {
    printHelp()
    return
  }

  const mode = toTrimmedStringOrNull(args.mode) || 'backfill'
  const targetStoreId = toTrimmedStringOrNull(args.storeId)

  if (mode !== 'backfill' && mode !== 'reconcile') {
    throw new Error(`Unsupported mode: ${mode}. Use --mode=backfill or --mode=reconcile`)
  }

  if (mode === 'reconcile') {
    await runReconciliation(targetStoreId)
    return
  }

  await runBackfill(targetStoreId)
}

run().catch(error => {
  console.error('[backfillPublicProducts] failed', error)
  process.exit(1)
})
