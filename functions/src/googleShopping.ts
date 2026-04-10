import * as functions from 'firebase-functions/v1'
import { FieldValue } from 'firebase-admin/firestore'

import { admin, defaultDb as db } from './firestore'

type GoogleShoppingSyncMode = 'full' | 'incremental'

type IntegrationProduct = {
  id: string
  storeId: string
  name: string
  category: string | null
  description: string | null
  price: number | null
  stockCount: number | null
  imageUrl?: string | null
  sku?: string | null
  barcode?: string | null
  manufacturerName?: string | null
}

type MerchantProductInput = {
  offerId: string
  title: string
  description: string
  googleProductCategory: string
  availability: 'in stock' | 'out of stock'
  price: { value: string; currency: string }
  channel: 'online'
  contentLanguage: 'en'
  targetCountry: 'US'
  imageLink: string
  brand?: string
  gtin?: string
  mpn?: string
}

type SyncSummary = {
  mode: GoogleShoppingSyncMode
  totalProducts: number
  eligibleProducts: number
  invalidProducts: number
  createdOrUpdated: number
  removed: number
  disapproved: number
  errors: Array<{ productId: string; reason: string }>
}

const GOOGLE_MERCHANT_API_BASE = 'https://shoppingcontent.googleapis.com/content/v2.1'
const DEFAULT_INTEGRATION_BASE_URL = 'https://us-central1-sedifex-web.cloudfunctions.net'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isLikelyGtin(value: string): boolean {
  return /^\d{8}(\d{4})?(\d{1})?$/.test(value)
}

function resolveGoogleProductCategory(category: string | null): string {
  if (!category) return '222'
  const normalized = category.toLowerCase()
  if (normalized.includes('shoe') || normalized.includes('cloth') || normalized.includes('fashion')) return '166'
  if (normalized.includes('food') || normalized.includes('drink')) return '412'
  if (normalized.includes('phone') || normalized.includes('electronics')) return '293'
  return '222'
}

async function requireApiUser(req: functions.https.Request): Promise<{ uid: string; email: string }> {
  const authHeader = req.headers.authorization
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw new Error('missing-auth')
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const decoded = await admin.auth().verifyIdToken(token)
  if (!decoded.uid) throw new Error('invalid-auth')

  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : '',
  }
}

function extractStoreId(record: Record<string, unknown>): string {
  const candidates = [
    record.storeId,
    record.storeID,
    record.store_id,
    record.workspaceSlug,
    record.workspaceId,
    record.workspace_id,
    record.workspaceUid,
    record.workspace_uid,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate)
    if (normalized) return normalized
  }

  return ''
}

async function requireStoreMembership(uid: string, storeId: string): Promise<void> {
  const membershipSnaps = await db.collection('teamMembers').where('uid', '==', uid).limit(50).get()
  const hasMembership = membershipSnaps.docs.some((docSnap) => {
    const data = asRecord(docSnap.data())
    return extractStoreId(data) === storeId
  })

  if (!hasMembership) throw new Error('store-access-denied')
}

async function fetchIntegrationProducts(params: {
  storeId: string
  integrationApiKey: string
  integrationBaseUrl?: string
}): Promise<IntegrationProduct[]> {
  const baseUrl = normalizeString(params.integrationBaseUrl) || DEFAULT_INTEGRATION_BASE_URL
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/integrationProducts`)
  url.searchParams.set('storeId', params.storeId)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${params.integrationApiKey}`,
      'content-type': 'application/json',
    },
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(normalizeString(payload.error) || `integration-fetch-failed:${response.status}`)

  const products = Array.isArray(payload.products) ? payload.products : []
  return products.map(product => {
    const entry = asRecord(product)
    return {
      id: normalizeString(entry.id),
      storeId: normalizeString(entry.storeId),
      name: normalizeString(entry.name),
      category: normalizeString(entry.category) || null,
      description: normalizeString(entry.description) || null,
      price: typeof entry.price === 'number' ? entry.price : Number(entry.price),
      stockCount: typeof entry.stockCount === 'number' ? entry.stockCount : Number(entry.stockCount),
      imageUrl: normalizeString(entry.imageUrl) || null,
      sku: normalizeString(entry.sku) || null,
      barcode: normalizeString(entry.barcode) || null,
      manufacturerName: normalizeString(entry.manufacturerName) || null,
    }
  })
}

function validateAndTransform(product: IntegrationProduct):
  | { valid: true; merchantProduct: MerchantProductInput }
  | { valid: false; reason: string } {
  const title = normalizeString(product.name)
  const description = normalizeString(product.description)
  const imageLink = normalizeString(product.imageUrl)
  const brand = normalizeString(product.manufacturerName)
  const barcode = normalizeString(product.barcode)
  const sku = normalizeString(product.sku)

  const missing: string[] = []
  if (!title) missing.push('title')
  if (!description) missing.push('description')
  if (!imageLink) missing.push('image')
  if (!(typeof product.price === 'number' && Number.isFinite(product.price) && product.price > 0)) missing.push('price')
  if (!brand) missing.push('brand')
  if (!barcode && !sku) missing.push('gtin_or_mpn')

  if (missing.length > 0) return { valid: false, reason: `missing:${missing.join(',')}` }

  return {
    valid: true,
    merchantProduct: {
      offerId: product.id,
      title,
      description,
      googleProductCategory: resolveGoogleProductCategory(product.category),
      availability: typeof product.stockCount === 'number' && product.stockCount > 0 ? 'in stock' : 'out of stock',
      price: { value: Number(product.price).toFixed(2), currency: 'USD' },
      channel: 'online',
      contentLanguage: 'en',
      targetCountry: 'US',
      imageLink,
      brand,
      ...(isLikelyGtin(barcode) ? { gtin: barcode } : {}),
      ...(!isLikelyGtin(barcode) && sku ? { mpn: sku } : {}),
    },
  }
}

async function upsertMerchantProduct(params: { merchantId: string; accessToken: string; product: MerchantProductInput }) {
  const endpoint = `${GOOGLE_MERCHANT_API_BASE}/${params.merchantId}/products`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params.product),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(normalizeString(payload.error) || `merchant-upsert-failed:${response.status}`)
  }
}

async function deleteMerchantProduct(params: { merchantId: string; accessToken: string; offerId: string }) {
  const googleProductId = `online:en:US:${params.offerId}`
  const endpoint = `${GOOGLE_MERCHANT_API_BASE}/${params.merchantId}/products/${encodeURIComponent(googleProductId)}`
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${params.accessToken}` },
  })

  if (!response.ok && response.status !== 404) {
    throw new Error(`merchant-delete-failed:${response.status}`)
  }
}

async function persistSyncStatus(storeId: string, summary: SyncSummary, state: 'success' | 'error', message: string) {
  await db.collection('storeSettings').doc(storeId).set(
    {
      googleShopping: {
        status: {
          state,
          lastMode: summary.mode,
          lastRunAt: FieldValue.serverTimestamp(),
          ...(state === 'success' ? { lastSuccessfulAt: FieldValue.serverTimestamp() } : {}),
          successCount: summary.createdOrUpdated,
          errorCount: summary.errors.length,
          disapprovalCount: summary.disapproved,
          outOfStockMismatchCount: 0,
          message,
        },
      },
    },
    { merge: true },
  )
}

async function runSync(params: {
  storeId: string
  mode: GoogleShoppingSyncMode
  merchantId: string
  accessToken: string
  integrationApiKey: string
  integrationBaseUrl?: string
}): Promise<SyncSummary> {
  const products = await fetchIntegrationProducts({
    storeId: params.storeId,
    integrationApiKey: params.integrationApiKey,
    integrationBaseUrl: params.integrationBaseUrl,
  })

  const mapCollection = db.collection('storeSettings').doc(params.storeId).collection('googleShoppingProductMappings')
  const errors: Array<{ productId: string; reason: string }> = []
  let eligibleProducts = 0
  let createdOrUpdated = 0
  let removed = 0
  let disapproved = 0

  for (const product of products) {
    const transformed = validateAndTransform(product)
    if (!transformed.valid) {
      errors.push({ productId: product.id, reason: transformed.reason })
      continue
    }

    eligibleProducts += 1
    try {
      await upsertMerchantProduct({ merchantId: params.merchantId, accessToken: params.accessToken, product: transformed.merchantProduct })
      await mapCollection.doc(product.id).set(
        {
          sedifexProductId: product.id,
          googleOfferId: transformed.merchantProduct.offerId,
          availability: transformed.merchantProduct.availability,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      createdOrUpdated += 1
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'merchant-upsert-failed'
      errors.push({ productId: product.id, reason })
      if (reason.includes('disapproved')) disapproved += 1
    }
  }

  if (params.mode === 'full') {
    const currentIds = new Set(products.map(product => product.id))
    const mappingSnap = await mapCollection.limit(1000).get()
    for (const mapped of mappingSnap.docs) {
      if (currentIds.has(mapped.id)) continue
      const mappedData = asRecord(mapped.data())
      const offerId = normalizeString(mappedData.googleOfferId) || mapped.id
      try {
        await deleteMerchantProduct({ merchantId: params.merchantId, accessToken: params.accessToken, offerId })
        await mapped.ref.delete()
        removed += 1
      } catch (error) {
        errors.push({ productId: mapped.id, reason: error instanceof Error ? error.message : 'merchant-delete-failed' })
      }
    }
  }

  return {
    mode: params.mode,
    totalProducts: products.length,
    eligibleProducts,
    invalidProducts: products.length - eligibleProducts,
    createdOrUpdated,
    removed,
    disapproved,
    errors,
  }
}

function setCors(res: functions.Response<any>) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

export const googleShoppingSync = functions.https.onRequest(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    const user = await requireApiUser(req)
    const body = asRecord(req.body)
    const storeId = normalizeString(body.storeId)
    const mode: GoogleShoppingSyncMode = body.mode === 'incremental' ? 'incremental' : 'full'
    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    await requireStoreMembership(user.uid, storeId)

    const settingsRef = db.collection('storeSettings').doc(storeId)
    const settingsSnap = await settingsRef.get()
    const googleShopping = asRecord(asRecord(settingsSnap.data()).googleShopping)
    const connection = asRecord(googleShopping.connection)
    const catalogSync = asRecord(googleShopping.catalogSync)

    const merchantId = normalizeString(connection.merchantId)
    const accessToken = normalizeString(catalogSync.accessToken)
    const integrationApiKey = normalizeString(catalogSync.integrationApiKey)
    const integrationBaseUrl = normalizeString(catalogSync.integrationBaseUrl)

    if (connection.connected !== true || !merchantId) {
      res.status(400).json({ error: 'merchant-not-connected' })
      return
    }
    if (!accessToken) {
      res.status(400).json({ error: 'missing-merchant-access-token' })
      return
    }
    if (!integrationApiKey) {
      res.status(400).json({ error: 'missing-integration-api-key' })
      return
    }

    await settingsRef.set(
      {
        googleShopping: {
          status: {
            state: 'running',
            lastMode: mode,
            lastRunAt: FieldValue.serverTimestamp(),
            message: mode === 'full' ? 'Running initial full catalog upload…' : 'Running incremental sync…',
          },
        },
      },
      { merge: true },
    )

    const summary = await runSync({ storeId, mode, merchantId, accessToken, integrationApiKey, integrationBaseUrl })

    const statusMessage =
      summary.errors.length > 0 ? `Sync completed with ${summary.errors.length} issue(s).` : 'Sync completed successfully.'
    await persistSyncStatus(storeId, summary, summary.errors.length > 0 ? 'error' : 'success', statusMessage)

    if (summary.errors.length > 0) {
      const tasksRef = settingsRef.collection('googleShoppingFixTasks')
      await Promise.all(
        summary.errors.slice(0, 100).map(error =>
          tasksRef.doc(error.productId).set(
            {
              productId: error.productId,
              reason: error.reason,
              status: 'open',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
        ),
      )
    }

    res.status(200).json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync-failed'
    res.status(500).json({ error: message })
  }
})

export const googleShoppingSyncScheduled = functions.pubsub.schedule('every 30 minutes').onRun(async () => {
  const settingsSnap = await db
    .collection('storeSettings')
    .where('googleShopping.catalogSync.autoSyncEnabled', '==', true)
    .limit(25)
    .get()

  for (const settingsDoc of settingsSnap.docs) {
    const storeId = settingsDoc.id
    const googleShopping = asRecord(asRecord(settingsDoc.data()).googleShopping)
    const connection = asRecord(googleShopping.connection)
    const catalogSync = asRecord(googleShopping.catalogSync)

    const merchantId = normalizeString(connection.merchantId)
    const accessToken = normalizeString(catalogSync.accessToken)
    const integrationApiKey = normalizeString(catalogSync.integrationApiKey)
    const integrationBaseUrl = normalizeString(catalogSync.integrationBaseUrl)

    if (connection.connected !== true || !merchantId || !accessToken || !integrationApiKey) {
      continue
    }

    try {
      const summary = await runSync({
        storeId,
        mode: 'incremental',
        merchantId,
        accessToken,
        integrationApiKey,
        integrationBaseUrl,
      })
      const state = summary.errors.length > 0 ? 'error' : 'success'
      const message = summary.errors.length > 0 ? `Auto-sync: ${summary.errors.length} issue(s).` : 'Auto-sync successful.'
      await persistSyncStatus(storeId, summary, state, message)
    } catch (error) {
      await db.collection('storeSettings').doc(storeId).set(
        {
          googleShopping: {
            status: {
              state: 'error',
              lastMode: 'incremental',
              lastRunAt: FieldValue.serverTimestamp(),
              message: error instanceof Error ? error.message : 'scheduled-sync-failed',
            },
          },
        },
        { merge: true },
      )
    }
  }

  return null
})
