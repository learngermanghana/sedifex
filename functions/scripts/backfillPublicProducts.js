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

function toPublicProduct(productDoc) {
  const data = productDoc.data() || {}
  const storeId = toTrimmedStringOrNull(data.storeId)
  const name = toTrimmedStringOrNull(data.name)

  if (!storeId || !name) {
    return null
  }

  return {
    sourceProductId: productDoc.id,
    storeId,
    name,
    description: toTrimmedStringOrNull(data.description),
    category: toTrimmedStringOrNull(data.category),
    price: typeof data.price === 'number' ? data.price : null,
    stockCount: typeof data.stockCount === 'number' ? data.stockCount : null,
    itemType:
      data.itemType === 'service'
        ? 'service'
        : data.itemType === 'made_to_order'
          ? 'made_to_order'
          : 'product',
    isPublished: data.isPublished !== false,
    ...extractProductImageSet(data),
    createdAt: data.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    sourceUpdatedAt: data.updatedAt ?? null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
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

  let upserts = 0
  let skipped = 0
  let batch = db.batch()
  let writes = 0

  for (const productDoc of productsSnapshot.docs) {
    const payload = toPublicProduct(productDoc)
    if (!payload) {
      skipped += 1
      continue
    }

    const targetRef = db.collection('publicProducts').doc(productDoc.id)
    batch.set(targetRef, payload, { merge: true })
    upserts += 1
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

  console.log(
    `[backfillPublicProducts] done. upserts=${upserts}, skipped=${skipped}, total=${productsSnapshot.size}`,
  )
}

run().catch(error => {
  console.error('[backfillPublicProducts] failed', error)
  process.exit(1)
})
