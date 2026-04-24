#!/usr/bin/env node
/* eslint-disable no-console */

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const DEFAULT_PRODUCT_IMAGE_URL =
  'https://storage.googleapis.com/sedifeximage/stores/Y5ivjrJUBtWl7KzoR0aVszFu1c93/logo.jpg?v=1775656136764'
const PAGE_SIZE = 500
const BATCH_LIMIT = 450

function parseCliArgs(argv) {
  const options = {
    storeId: null,
    dryRun: false,
    showHelp: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token) continue

    if (token === '--help' || token === '-h') {
      options.showHelp = true
      continue
    }

    if (token === '--dry-run') {
      options.dryRun = true
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

    if (!token.startsWith('--') && !options.storeId) {
      options.storeId = token
    }
  }

  return options
}

function printHelp() {
  console.log('Usage: node scripts/backfillProductNormalization.js [--store-id=<storeId>] [--dry-run]')
  console.log('')
  console.log('Normalizes every product document so product metadata is fixed without opening the Products page.')
  console.log('')
  console.log('Options:')
  console.log('  --store-id <id>   Restrict normalization to one store')
  console.log('  --dry-run         Print intended updates without writing to Firestore')
}

function toTrimmedStringOrNull(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function toTitleCaseWords(value) {
  return value.toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase())
}

function normalizeProductName(value) {
  const trimmed = toTrimmedStringOrNull(value)
  if (!trimmed) return null
  return toTitleCaseWords(trimmed)
}

function normalizeProductCategory(value) {
  const normalizedRaw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!normalizedRaw) return 'General Products'

  const canonical = normalizedRaw.toLowerCase()
  if (canonical === 'beverage' || canonical === 'beverages') {
    return 'Weight'
  }

  return toTitleCaseWords(normalizedRaw)
}

function normalizeBarcode(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const hasLetters = /[a-z]/i.test(raw)
  if (hasLetters) {
    return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  }
  return raw.replace(/[^\d]/g, '')
}

function normalizeImageUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeImageUrls(value, fallbackImageUrl) {
  const seen = new Set()
  const urls = []

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeImageUrl(item)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      urls.push(normalized)
    }
  }

  if (fallbackImageUrl && !seen.has(fallbackImageUrl)) {
    urls.unshift(fallbackImageUrl)
  }

  return urls
}

function valuesDiffer(currentValue, normalizedValue) {
  return JSON.stringify(currentValue) !== JSON.stringify(normalizedValue)
}

function buildProductUpdates(productData) {
  const updates = {}

  const normalizedName = normalizeProductName(productData.name)
  if (normalizedName && valuesDiffer(productData.name, normalizedName)) {
    updates.name = normalizedName
  }

  const normalizedCategory = normalizeProductCategory(productData.category)
  if (valuesDiffer(productData.category, normalizedCategory)) {
    updates.category = normalizedCategory
  }

  const normalizedDescription = toTrimmedStringOrNull(productData.description)
  if (valuesDiffer(productData.description ?? null, normalizedDescription)) {
    updates.description = normalizedDescription
  }

  const normalizedSku = toTrimmedStringOrNull(productData.sku)
  if (valuesDiffer(productData.sku ?? null, normalizedSku)) {
    updates.sku = normalizedSku
  }

  const normalizedBarcode = normalizeBarcode(productData.barcode ?? productData.sku)
  const barcodeValue = normalizedBarcode || null
  if (valuesDiffer(productData.barcode ?? null, barcodeValue)) {
    updates.barcode = barcodeValue
  }

  const normalizedManufacturerName = toTrimmedStringOrNull(productData.manufacturerName)
  if (valuesDiffer(productData.manufacturerName ?? null, normalizedManufacturerName)) {
    updates.manufacturerName = normalizedManufacturerName
  }

  const normalizedBatchNumber = toTrimmedStringOrNull(productData.batchNumber)
  if (valuesDiffer(productData.batchNumber ?? null, normalizedBatchNumber)) {
    updates.batchNumber = normalizedBatchNumber
  }

  const showOnReceipt = productData.showOnReceipt === true
  if (valuesDiffer(productData.showOnReceipt === true, showOnReceipt)) {
    updates.showOnReceipt = showOnReceipt
  }

  const imageUrlFromField = normalizeImageUrl(productData.imageUrl)
  const imageUrlFromList = Array.isArray(productData.imageUrls)
    ? productData.imageUrls
        .map(item => normalizeImageUrl(item))
        .find(item => Boolean(item)) ?? null
    : null

  const normalizedImageUrl = imageUrlFromField ?? imageUrlFromList ?? DEFAULT_PRODUCT_IMAGE_URL

  if (valuesDiffer(productData.imageUrl ?? null, normalizedImageUrl)) {
    updates.imageUrl = normalizedImageUrl
  }

  const normalizedImageUrls = normalizeImageUrls(productData.imageUrls, normalizedImageUrl)
  if (valuesDiffer(productData.imageUrls ?? [], normalizedImageUrls)) {
    updates.imageUrls = normalizedImageUrls
  }

  const normalizedImageAlt = normalizedImageUrl
    ? toTrimmedStringOrNull(productData.imageAlt) || normalizedName || 'Product image'
    : null
  if (valuesDiffer(productData.imageAlt ?? null, normalizedImageAlt)) {
    updates.imageAlt = normalizedImageAlt
  }

  if (!('productionDate' in productData)) {
    updates.productionDate = null
  }

  return updates
}

async function run() {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.showHelp) {
    printHelp()
    return
  }

  const targetStoreId = toTrimmedStringOrNull(args.storeId)
  const modeLabel = args.dryRun ? 'dry-run' : 'write'

  if (targetStoreId) {
    console.log(`[product-normalization] mode=${modeLabel} storeId=${targetStoreId}`)
  } else {
    console.log(`[product-normalization] mode=${modeLabel} all stores`)
  }

  let lastDoc = null
  let scanned = 0
  let updated = 0
  let pages = 0

  let batch = db.batch()
  let pendingWrites = 0

  async function flushBatch() {
    if (args.dryRun || pendingWrites === 0) return
    await batch.commit()
    batch = db.batch()
    pendingWrites = 0
  }

  while (true) {
    let query = db.collection('products').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE)
    if (targetStoreId) {
      query = db
        .collection('products')
        .where('storeId', '==', targetStoreId)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE)
    }
    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const pageSnapshot = await query.get()
    if (pageSnapshot.empty) break

    pages += 1
    scanned += pageSnapshot.size

    for (const productDoc of pageSnapshot.docs) {
      const productData = productDoc.data() || {}
      const updates = buildProductUpdates(productData)
      if (!Object.keys(updates).length) {
        continue
      }

      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp()
      updated += 1

      if (args.dryRun) {
        console.log(`[product-normalization] would update products/${productDoc.id}: ${Object.keys(updates).join(', ')}`)
      } else {
        batch.set(productDoc.ref, updates, { merge: true })
        pendingWrites += 1
        if (pendingWrites >= BATCH_LIMIT) {
          await flushBatch()
        }
      }
    }

    lastDoc = pageSnapshot.docs[pageSnapshot.docs.length - 1]
    console.log(`[product-normalization] processed page=${pages} scanned=${scanned} updated=${updated}`)
  }

  await flushBatch()

  console.log(`[product-normalization] complete scanned=${scanned} updated=${updated} pages=${pages} dryRun=${args.dryRun}`)
}

run().catch(error => {
  console.error('[product-normalization] failed', error)
  process.exit(1)
})
