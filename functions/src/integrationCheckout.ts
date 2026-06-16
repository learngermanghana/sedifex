import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const PAYSTACK_SECRET_KEY = defineString('PAYSTACK_SECRET_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL', { default: '' })
const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })
const SEDIFEX_MARKET_MERCHANT_TOKENS_JSON = defineString('SEDIFEX_MARKET_MERCHANT_TOKENS_JSON', { default: '' })
const SEDIFEX_MERCHANT_TOKENS_JSON = defineString('SEDIFEX_MERCHANT_TOKENS_JSON', { default: '' })

type CheckoutBody = {
  store_id?: unknown
  merchant_id?: unknown
  storeId?: unknown
  merchantId?: unknown
  payment_reference?: unknown
  reference?: unknown
  client_order_id?: unknown
  clientOrderId?: unknown
  amount?: unknown
  currency?: unknown
  items?: unknown
  customer?: unknown
  pricing_snapshot?: unknown
  marketplace_fees?: unknown
  returnUrl?: unknown
  subaccount?: unknown
  paystackSubaccountCode?: unknown
  paystack_subaccount_code?: unknown
  splitPayment?: unknown
  paymentRouting?: unknown
  sourceChannel?: unknown
  source_channel?: unknown
  sourceLabel?: unknown
  source_label?: unknown
  metadata?: unknown
  branchLocationId?: unknown
  branch_location_id?: unknown
  selectedBranchStoreId?: unknown
  selected_branch_store_id?: unknown
  customerEmail?: unknown
  customer_email?: unknown
  customerName?: unknown
  customer_name?: unknown
  customerPhone?: unknown
  customer_phone?: unknown
  email?: unknown
  name?: unknown
  phone?: unknown
  servicePrice?: unknown
  service_price?: unknown
  totalAmount?: unknown
  total_amount?: unknown
  bookingId?: unknown
  booking_id?: unknown
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeServiceLikeItemId(rawValue: unknown) {
  const value = clean(rawValue, 220)
  if (!value) return ''
  return value.toLowerCase().startsWith('draft-') ? value.slice(6).trim() : value
}


function getBookingId(body: CheckoutBody) {
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {}
  return clean(body.bookingId ?? body.booking_id ?? metadata.bookingId ?? metadata.booking_id, 220)
}

async function findExistingIntegrationOrderRefs(storeId: string, identifiers: string[]) {
  const unique = Array.from(new Set(identifiers.map(value => clean(value, 260)).filter(Boolean)))
  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  for (const identifier of unique) {
    const rootDirect = defaultDb.collection('integrationOrders').doc(identifier)
    const storeDirect = defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(identifier)
    const [rootSnap, storeSnap] = await Promise.all([rootDirect.get(), storeDirect.get()])
    if (rootSnap.exists) refs.set(rootDirect.path, rootDirect)
    if (storeSnap.exists) refs.set(storeDirect.path, storeDirect)
  }
  const fields = ['booking_id', 'bookingId', 'payment_reference', 'paymentReference', 'reference', 'clientOrderId', 'client_order_id']
  for (const field of fields) {
    for (let index = 0; index < unique.length; index += 10) {
      const chunk = unique.slice(index, index + 10)
      const [rootSnap, storeSnap] = await Promise.all([
        defaultDb.collection('integrationOrders').where(field, 'in', chunk).get(),
        defaultDb.collection('stores').doc(storeId).collection('integrationOrders').where(field, 'in', chunk).get(),
      ])
      rootSnap.docs.forEach(docSnap => refs.set(docSnap.ref.path, docSnap.ref))
      storeSnap.docs.forEach(docSnap => refs.set(docSnap.ref.path, docSnap.ref))
    }
  }
  return Array.from(refs.values())
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getStoreId(body: CheckoutBody) {
  return clean(
    body.store_id
      ?? body.merchant_id
      ?? body.storeId
      ?? body.merchantId
      ?? body.selectedBranchStoreId
      ?? body.selected_branch_store_id
      ?? body.branchLocationId
      ?? body.branch_location_id,
    180,
  )
}

function getCustomer(body: CheckoutBody) {
  const nested = body.customer && typeof body.customer === 'object' ? (body.customer as Record<string, unknown>) : {}
  return {
    ...nested,
    email: nested.email ?? body.customerEmail ?? body.customer_email ?? body.email,
    name: nested.name ?? body.customerName ?? body.customer_name ?? body.name,
    phone: nested.phone ?? body.customerPhone ?? body.customer_phone ?? body.phone,
  }
}

function getAmountMajor(body: CheckoutBody) {
  const direct = numberValue(body.amount)
  if (direct && direct > 0) return direct
  const fallbackAmount = numberValue(body.servicePrice ?? body.service_price ?? body.totalAmount ?? body.total_amount)
  if (fallbackAmount && fallbackAmount > 0) return fallbackAmount
  const snapshot = body.pricing_snapshot && typeof body.pricing_snapshot === 'object' ? body.pricing_snapshot as Record<string, unknown> : {}
  const finalTotalMinor = numberValue(snapshot.final_total)
  return finalTotalMinor && finalTotalMinor > 0 ? finalTotalMinor / 100 : null
}

type CanonicalCheckoutInput = {
  storeId: string
  customer: {
    email: string
    name: string
    phone: string
  }
  amountMajor: number | null
  sourceChannel: string
}

function normalizeCheckoutBody(body: CheckoutBody): CanonicalCheckoutInput {
  const storeId = getStoreId(body)
  const customer = getCustomer(body)
  const sourceChannel = clean(body.sourceChannel ?? body.source_channel, 80) || 'integration_checkout'
  return {
    storeId,
    customer: {
      email: clean(customer.email, 220).toLowerCase(),
      name: clean(customer.name, 220),
      phone: clean(customer.phone, 80),
    },
    amountMajor: getAmountMajor(body),
    sourceChannel,
  }
}

type ValidationDetail = {
  field: string
  acceptedAliases: string[]
  message: string
}

function respondValidationError(res: functions.Response, error: string, details: ValidationDetail[]) {
  res.status(400).json({ error, details })
}

function getSubaccount(body: CheckoutBody) {
  const split = body.splitPayment && typeof body.splitPayment === 'object' ? body.splitPayment as Record<string, unknown> : {}
  const routing = body.paymentRouting && typeof body.paymentRouting === 'object' ? body.paymentRouting as Record<string, unknown> : {}
  return clean(
    body.subaccount ?? body.paystackSubaccountCode ?? body.paystack_subaccount_code ?? split.subaccount ?? routing.paystackSubaccountCode ?? routing.subaccountCode,
    140,
  )
}


function getRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function getFirstText(record: Record<string, unknown>, keys: string[], max = 220) {
  for (const key of keys) {
    const value = clean(record[key], max)
    if (value) return value
  }
  return ''
}


function normalizeStoredItemType(value: unknown): 'product' | 'service' | 'course' | null {
  const normalized = clean(value, 50).toLowerCase().replace(/[\s_-]+/g, '_')
  if (normalized === 'service' || normalized === 'service_booking' || normalized === 'booking') return 'service'
  if (normalized === 'course' || normalized === 'class' || normalized === 'training') return 'course'
  if (normalized === 'product' || normalized === 'product_order' || normalized === 'physical_product') return 'product'
  return null
}

function getCheckoutItemType(base: Record<string, unknown>, snapshotMatch: Record<string, unknown> | undefined, metadata: Record<string, unknown>) {
  return normalizeStoredItemType(
    base.itemType ?? base.item_type ?? base.listingType ?? base.listing_type ?? base.type
    ?? snapshotMatch?.itemType ?? snapshotMatch?.item_type ?? snapshotMatch?.listingType ?? snapshotMatch?.listing_type ?? snapshotMatch?.type
    ?? metadata.itemType ?? metadata.item_type ?? metadata.listingType ?? metadata.listing_type ?? metadata.type,
  )
}

function getSnapshotItems(body: CheckoutBody) {
  const snapshot = getRecord(body.pricing_snapshot)
  return Array.isArray(snapshot.items) ? snapshot.items : []
}

function enrichCheckoutItems(body: CheckoutBody) {
  const rawItems = Array.isArray(body.items) ? body.items : []
  const snapshotItems = getSnapshotItems(body).map(getRecord)
  const metadata = getRecord(body.metadata)

  const enrichedItems = rawItems.map((item) => {
    const base = getRecord(item)
    const itemId = clean(base.item_id ?? base.itemId, 220)
    const snapshotMatch = snapshotItems.find(snapshotItem => clean(snapshotItem.item_id ?? snapshotItem.itemId, 220) === itemId)
    const name = getFirstText(base, ['name', 'title', 'itemName', 'serviceName', 'productName'])
      || getFirstText(snapshotMatch ?? {}, ['name', 'title', 'itemName', 'serviceName', 'productName'])
    const itemName = getFirstText(base, ['itemName']) || getFirstText(snapshotMatch ?? {}, ['itemName'])
    const productName = getFirstText(base, ['productName']) || getFirstText(snapshotMatch ?? {}, ['productName'])
    const serviceName = getFirstText(base, ['serviceName']) || getFirstText(snapshotMatch ?? {}, ['serviceName'])
    const itemType = getCheckoutItemType(base, snapshotMatch, metadata)
    return {
      ...base,
      ...(name ? { name } : {}),
      ...(itemName ? { itemName } : {}),
      ...(productName ? { productName } : {}),
      ...(serviceName ? { serviceName } : {}),
      ...(itemType ? { itemType, item_type: itemType } : {}),
    }
  })

  const firstItem = enrichedItems.length ? getRecord(enrichedItems[0]) : {}
  const firstSnapshotItem = snapshotItems.length ? snapshotItems[0] : {}
  const itemName = getFirstText(firstItem, ['itemName', 'name', 'title'])
    || getFirstText(firstSnapshotItem, ['itemName', 'name', 'title'])
    || getFirstText(metadata, ['itemName'])
  const productName = getFirstText(firstItem, ['productName'])
    || getFirstText(firstSnapshotItem, ['productName'])
    || getFirstText(metadata, ['productName'])
  const serviceName = getFirstText(firstItem, ['serviceName'])
    || getFirstText(firstSnapshotItem, ['serviceName'])
    || getFirstText(metadata, ['serviceName'])
  const itemType = getCheckoutItemType(firstItem, firstSnapshotItem, metadata)
    ?? (serviceName ? 'service' : productName ? 'product' : null)

  return { enrichedItems, itemName, productName, serviceName, itemType }
}
function getTransactionChargeMinor(body: CheckoutBody) {
  const split = body.splitPayment && typeof body.splitPayment === 'object' ? body.splitPayment as Record<string, unknown> : {}
  const value = numberValue(split.transactionChargeMinor ?? split.transaction_charge ?? split.transactionCharge)
  return value && value > 0 ? Math.round(value) : null
}

function setCors(res: functions.Response, methods = 'POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', methods)
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = clean(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  if (received && received !== expected) {
    res.status(400).json({
      error: 'contract-version-mismatch',
      expectedVersion: expected,
      receivedVersion: received,
    })
    return false
  }
  return true
}

function getResponseRequestId(res: functions.Response) {
  const value = res.getHeader('x-sedifex-request-id')
  return typeof value === 'string' ? value : null
}

async function queryHasMatch(collectionPath: FirebaseFirestore.CollectionReference, field: string, apiKey: string) {
  const snapshot = await collectionPath.where(field, '==', apiKey).limit(1).get()
  return !snapshot.empty
}

function nestedRecordContainsKey(value: unknown, apiKey: string, depth = 0): boolean {
  if (!value || depth > 6) return false
  if (Array.isArray(value)) {
    return value.some(item => nestedRecordContainsKey(item, apiKey, depth + 1))
  }
  if (typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  for (const [field, fieldValue] of Object.entries(record)) {
    const looksLikeCredential = /api.?key|integration.?key|token|secret|credential|authorization/i.test(field)
    if (looksLikeCredential && clean(fieldValue, 1000) === apiKey) return true
    if (fieldValue && typeof fieldValue === 'object' && nestedRecordContainsKey(fieldValue, apiKey, depth + 1)) return true
  }
  return false
}

function recordContainsKey(record: Record<string, unknown>, apiKey: string) {
  const googleShopping = record.googleShopping && typeof record.googleShopping === 'object'
    ? record.googleShopping as Record<string, unknown>
    : {}
  const catalogSync = googleShopping.catalogSync && typeof googleShopping.catalogSync === 'object'
    ? googleShopping.catalogSync as Record<string, unknown>
    : {}
  const connection = googleShopping.connection && typeof googleShopping.connection === 'object'
    ? googleShopping.connection as Record<string, unknown>
    : {}

  const candidates = [
    record.integrationApiKey,
    record.integrationKey,
    record.integrationToken,
    record.apiKey,
    record.token,
    record.key,
    catalogSync.integrationApiKey,
    catalogSync.integrationKey,
    catalogSync.apiKey,
    connection.integrationApiKey,
    connection.integrationKey,
    connection.apiKey,
  ]

  return candidates.some(value => clean(value, 1000) === apiKey) || nestedRecordContainsKey(record, apiKey)
}

function getRequestApiKey(req: functions.https.Request) {
  const bearer = clean(req.get('authorization'), 1000).replace(/^Bearer\s+/i, '')
  return clean(req.get('x-api-key'), 1000) || bearer
}

function redactApiKey(apiKey: string) {
  if (!apiKey) return null
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`
}


function getSedifexMarketMerchantTokenMap(): Record<string, string> {
  const raw =
    SEDIFEX_MARKET_MERCHANT_TOKENS_JSON.value()?.trim() ||
    process.env.SEDIFEX_MARKET_MERCHANT_TOKENS_JSON?.trim() ||
    SEDIFEX_MERCHANT_TOKENS_JSON.value()?.trim() ||
    process.env.SEDIFEX_MERCHANT_TOKENS_JSON?.trim() ||
    ''

  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const map: Record<string, string> = {}
    for (const [storeId, token] of Object.entries(parsed)) {
      if (typeof token === 'string' && token.trim()) {
        map[storeId.trim()] = token.trim()
      }
    }
    return map
  } catch (error) {
    functions.logger.warn('Invalid Sedifex Market merchant token JSON')
    return {}
  }
}

function normalizeMerchantTokenPrefix(token: string) {
  const trimmed = clean(token, 1000)
  if (!trimmed) return ''
  if (trimmed.startsWith('sdfx_')) return `sedx_${trimmed.slice('sdfx_'.length)}`
  return trimmed
}

function isAuthorizedBySedifexMarketToken(storeId: string, apiKey: string) {
  const map = getSedifexMarketMerchantTokenMap()
  const expected = map[storeId]
  if (!expected || !apiKey) return false
  const normalizedExpected = normalizeMerchantTokenPrefix(expected)
  const normalizedApiKey = normalizeMerchantTokenPrefix(apiKey)
  return normalizedExpected === normalizedApiKey
}

async function isAuthorizedByExistingProductEndpoint(req: functions.https.Request, storeId: string, apiKey: string) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sedifex-web'
  const contractVersion = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/v1IntegrationProducts?storeId=${encodeURIComponent(storeId)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        Accept: 'application/json',
        'X-Sedifex-Contract-Version': clean(req.get('x-sedifex-contract-version'), 80) || contractVersion,
      },
      signal: controller.signal,
    })

    if (!response.ok) return false

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!payload || typeof payload !== 'object') return true

    const payloadStoreId = clean(payload.storeId, 180)
    if (payloadStoreId && payloadStoreId !== storeId) return false

    const products = Array.isArray(payload.products) ? payload.products : []
    const publicListings = Array.isArray(payload.publicListings) ? payload.publicListings : []
    const sampledItems = [...products, ...publicListings].slice(0, 10)

    for (const item of sampledItems) {
      if (!item || typeof item !== 'object') continue
      const itemStoreId = clean((item as Record<string, unknown>).storeId, 180)
      if (itemStoreId && itemStoreId !== storeId) return false
    }

    return true
  } catch (error) {
    functions.logger.warn('integration order status product endpoint auth fallback failed', { storeId, error })
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function isAuthorized(req: functions.https.Request, storeId: string) {
  const apiKey = getRequestApiKey(req)
  if (!apiKey) return false

  const master = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() || process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() || ''
  if (master && apiKey === master) return true

  if (isAuthorizedBySedifexMarketToken(storeId, apiKey)) {
    functions.logger.info('Sedifex Market merchant token authorized checkout request', { storeId })
    return true
  }

  let authLookupFailed = false

  try {
    const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
    const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(storeData, apiKey)) return true

    const settingsSnap = await defaultDb.collection('storeSettings').doc(storeId).get()
    const settingsData = (settingsSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(settingsData, apiKey)) return true

    const storeKeyCollections = [
      defaultDb.collection('stores').doc(storeId).collection('integrationApiKeys'),
      defaultDb.collection('storeSettings').doc(storeId).collection('integrationApiKeys'),
    ]

    for (const keyCollection of storeKeyCollections) {
      for (const field of ['token', 'key', 'apiKey', 'value']) {
        if (await queryHasMatch(keyCollection, field, apiKey)) return true
      }
    }

    const globalKeyCollection = defaultDb.collection('integrationApiKeys')
    for (const field of ['token', 'key', 'apiKey', 'value']) {
      const snapshot = await globalKeyCollection
        .where('storeId', '==', storeId)
        .where(field, '==', apiKey)
        .limit(1)
        .get()
      if (!snapshot.empty) return true
    }

  } catch (error) {
    authLookupFailed = true
    functions.logger.warn('integration order status auth lookup failed', { storeId, error })
  }

  if (await isAuthorizedByExistingProductEndpoint(req, storeId, apiKey)) {
    if (authLookupFailed) {
      functions.logger.info('integration checkout authorized via product endpoint fallback after auth lookup failure', { storeId })
    }
    return true
  }

  return false
}

function toDateIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null
  }
  return null
}

function pickString(record: Record<string, unknown>, keys: string[], max = 500) {
  for (const key of keys) {
    const value = clean(record[key], max)
    if (value) return value
  }
  return ''
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(record[key])
    if (value !== null) return value
  }
  return null
}

function normalizeIntegrationOrder(reference: string, storeId: string, record: Record<string, unknown>) {
  const customer = record.customer && typeof record.customer === 'object' ? record.customer as Record<string, unknown> : {}
  const resolvedReference = pickString(record, ['reference', 'paymentReference', 'payment_reference', 'paystackReference'], 220) || reference
  const amountPaid = pickNumber(record, ['amountPaid', 'amount_paid', 'confirmedAmount', 'amount'])
  const amount = pickNumber(record, ['amount', 'total', 'grossAmount'])
  const currency = pickString(record, ['currency'], 20) || 'GHS'
  const paymentStatus = pickString(record, ['paymentStatus', 'payment_status', 'paystackStatus'], 80) || null
  const orderStatus = pickString(record, ['orderStatus', 'order_status', 'status'], 80) || null
  const syncStatus = pickString(record, ['syncStatus', 'sync_status'], 80) || null
  const rawStatus = pickString(record, ['status', 'orderStatus', 'order_status', 'paymentStatus', 'payment_status', 'paystackStatus'], 80) || syncStatus || 'pending'

  const normalizeStatus = (value: string | null) => {
    if (!value) return null
    const normalized = value.toLowerCase()
    if (['success', 'successful', 'paid', 'completed', 'complete', 'settled'].includes(normalized)) return 'paid'
    if (['failed', 'abandoned', 'cancelled', 'canceled', 'declined', 'reversed'].includes(normalized)) return 'failed'
    if (['pending', 'processing', 'queued', 'syncing', 'pending_payment'].includes(normalized)) return 'pending'
    return value
  }

  const status = normalizeStatus(paymentStatus) ?? normalizeStatus(orderStatus) ?? normalizeStatus(rawStatus) ?? 'pending'

  return {
    ok: true,
    storeId: pickString(record, ['storeId', 'merchantId'], 180) || storeId,
    merchantId: pickString(record, ['merchantId', 'storeId'], 180) || storeId,
    reference: resolvedReference,
    paymentReference: pickString(record, ['paymentReference', 'payment_reference', 'paystackReference'], 220) || resolvedReference,
    payment_reference: pickString(record, ['payment_reference', 'paymentReference', 'paystackReference'], 220) || resolvedReference,
    paystackReference: pickString(record, ['paystackReference', 'paymentReference', 'payment_reference'], 220) || resolvedReference,
    clientOrderId: pickString(record, ['clientOrderId', 'client_order_id'], 220) || null,
    client_order_id: pickString(record, ['client_order_id', 'clientOrderId'], 220) || null,
    customer: {
      name: clean(customer.name ?? record.customerName, 180) || undefined,
      email: clean(customer.email ?? record.customerEmail, 220) || undefined,
      phone: clean(customer.phone ?? record.customerPhone, 80) || undefined,
    },
    customerName: clean(customer.name ?? record.customerName, 180) || undefined,
    customerEmail: clean(customer.email ?? record.customerEmail, 220) || undefined,
    customerPhone: clean(customer.phone ?? record.customerPhone, 80) || undefined,
    amountPaid: amountPaid ?? amount,
    amount_paid: amountPaid ?? amount,
    amount,
    currency,
    status,
    paymentStatus,
    payment_status: paymentStatus,
    orderStatus,
    order_status: orderStatus,
    syncStatus,
    sync_status: syncStatus,
    paidAt: toDateIso(record.paidAt),
    paymentConfirmedAt: toDateIso(record.paymentConfirmedAt),
    updatedAt: toDateIso(record.updatedAt),
  }
}

async function initializePaystack(payload: Record<string, unknown>) {
  const key = PAYSTACK_SECRET_KEY.value()?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || ''
  if (!key) throw new Error('Paystack secret is not configured')

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      ['Author' + 'ization']: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const json = await response.json().catch(() => null) as {
    status?: boolean
    message?: string
    data?: { authorization_url?: string; access_code?: string; reference?: string }
  } | null
  if (!response.ok || !json?.status) throw new Error(json?.message || `Paystack initialize failed (${response.status})`)
  return json
}



type CheckoutPreviewItem = {
  item_id?: unknown
  itemId?: unknown
  productId?: unknown
  serviceId?: unknown
  qty?: unknown
  quantity?: unknown
  type?: unknown
  item_type?: unknown
}

function normalizeCheckoutItemType(value: unknown) {
  const normalized = clean(value, 50).toUpperCase()
  if (normalized === 'SERVICE' || normalized === 'COURSE') return 'SERVICE'
  return 'PRODUCT'
}

function getItemPriceMinor(record: Record<string, unknown>) {
  const minor = numberValue(record.priceMinor ?? record.amountMinor)
  if (minor !== null && minor >= 0) return Math.round(minor)

  const major = numberValue(record.price ?? record.sellingPrice ?? record.salePrice ?? record.amount ?? record.fee)
  if (major === null || major < 0) return null
  return Math.round(major * 100)
}

async function resolveCatalogItem(storeId: string, itemId: string, hintedType: string) {
  const directRefs = [
    defaultDb.collection('stores').doc(storeId).collection('products').doc(itemId),
    defaultDb.collection('stores').doc(storeId).collection('services').doc(itemId),
    defaultDb.collection('products').doc(itemId),
    defaultDb.collection('services').doc(itemId),
    defaultDb.collection('publicListings').doc(itemId),
  ]

  for (const ref of directRefs) {
    const snap = await ref.get()
    if (!snap.exists) continue
    const data = (snap.data() ?? {}) as Record<string, unknown>
    return {
      item: data,
      type: normalizeCheckoutItemType(data.type ?? data.item_type ?? hintedType ?? (ref.parent.id.toUpperCase().includes('SERVICE') ? 'SERVICE' : 'PRODUCT')),
    }
  }

  const queryCollections = ['publicListings', 'v1IntegrationProducts']
  const queryFields = ['id', 'productId', 'sourceProductId']

  for (const collectionName of queryCollections) {
    for (const field of queryFields) {
      const snap = await defaultDb
        .collection(collectionName)
        .where(field, '==', itemId)
        .where('storeId', '==', storeId)
        .limit(1)
        .get()
      if (snap.empty) continue
      const data = (snap.docs[0].data() ?? {}) as Record<string, unknown>
      return {
        item: data,
        type: normalizeCheckoutItemType(data.type ?? data.item_type ?? hintedType),
      }
    }
  }

  return null
}

export const integrationCheckoutPreview = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }
  if (!assertContract(req, res)) return

  try {
    const body = (req.body ?? {}) as CheckoutBody
    const storeId = getStoreId(body)
    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    const authorized = await isAuthorized(req, storeId)
    if (!authorized) {
      const requestApiKey = getRequestApiKey(req)
      functions.logger.warn('integrationCheckoutPreview auth failed', {
        storeId,
        hasApiKey: Boolean(requestApiKey),
        apiKeyHint: redactApiKey(requestApiKey),
        hasAuthorizationHeader: Boolean(clean(req.get('authorization'), 1000)),
      })
      return
    }

    const items = Array.isArray(body.items) ? body.items as CheckoutPreviewItem[] : []
    if (!items.length) {
      res.status(400).json({ error: 'items-required' })
      return
    }

    functions.logger.info('integrationCheckoutPreview authorized', { storeId, itemCount: items.length })

    const responseItems: Array<Record<string, unknown>> = []
    let subtotal = 0

    for (const rawItem of items) {
      const item = rawItem && typeof rawItem === 'object' ? rawItem as CheckoutPreviewItem : {}
      const itemId = normalizeServiceLikeItemId(item.item_id ?? item.itemId ?? item.productId ?? item.serviceId)
      const qtyRaw = numberValue(item.qty ?? item.quantity)
      const qty = qtyRaw && qtyRaw > 0 ? Math.round(qtyRaw) : 1
      const type = normalizeCheckoutItemType(item.type ?? item.item_type ?? (item.serviceId ? 'SERVICE' : 'PRODUCT'))

      if (!itemId) {
        res.status(404).json({ error: 'checkout-item-not-found', item_id: itemId, storeId })
        return
      }

      const resolved = await resolveCatalogItem(storeId, itemId, type)
      if (!resolved) {
        res.status(404).json({ error: 'checkout-item-not-found', item_id: itemId, storeId })
        return
      }

      const unitPrice = getItemPriceMinor(resolved.item)
      if (unitPrice === null) {
        res.status(400).json({ error: 'checkout-item-price-missing', item_id: itemId, storeId })
        return
      }

      const lineTotal = unitPrice * qty
      subtotal += lineTotal

      responseItems.push({
        item_id: itemId,
        name: clean(resolved.item.name ?? resolved.item.productName ?? resolved.item.title, 220) || itemId,
        qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        type: resolved.type,
      })
    }

    const payload = {
      pricing_version: '2026-05-12-v1',
      currency: 'GHS',
      subtotal,
      tax_total: 0,
      delivery_fee: 0,
      pre_processing_total: subtotal,
      processing_fee_to_add: 0,
      final_total: subtotal,
      breakdown: [
        { code: 'SUBTOTAL', amount: subtotal },
      ],
      items: responseItems,
    }

    res.status(200).json(payload)
  } catch (error) {
    functions.logger.error('integrationCheckoutPreview failed', { error })
    res.status(500).json({ error: 'checkout-preview-failed' })
  }
})
export const integrationCheckoutCreate = functions.https.onRequest(async (req, res): Promise<void> => {
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
    const body = (req.body ?? {}) as CheckoutBody
    const normalized = normalizeCheckoutBody(body)
    const storeId = normalized.storeId
    const email = normalized.customer.email
    const phone = normalized.customer.phone
    const amountMajor = normalized.amountMajor
    const bookingId = getBookingId(body)
    const reference = clean(body.payment_reference ?? body.reference, 220) || clean(body.client_order_id ?? body.clientOrderId, 220) || bookingId || `${storeId}_${Date.now()}`
    const currency = clean(body.currency, 20) || 'GHS'
    const callbackUrl = clean(body.returnUrl, 700) || APP_BASE_URL.value() || undefined
    const sourceChannel = normalized.sourceChannel
    const sourceLabel = clean(body.sourceLabel ?? body.source_label, 120) || 'Sedifex checkout'
    const subaccount = getSubaccount(body)
    const transactionChargeMinor = getTransactionChargeMinor(body)

    if (!storeId) {
      respondValidationError(res, 'missing-store-id', [
        {
          field: 'storeId',
          acceptedAliases: ['store_id', 'merchant_id', 'storeId', 'merchantId', 'selectedBranchStoreId', 'selected_branch_store_id', 'branchLocationId', 'branch_location_id'],
          message: 'A valid store identifier is required.',
        },
      ])
      return
    }
    if (!email) {
      respondValidationError(res, 'customer-email-required', [
        {
          field: 'customer.email',
          acceptedAliases: ['customer.email', 'customerEmail', 'customer_email', 'email'],
          message: 'A customer email is required to initialize Paystack checkout.',
        },
      ])
      return
    }
    if (!amountMajor || amountMajor <= 0) {
      respondValidationError(res, 'amount-required', [
        {
          field: 'amount',
          acceptedAliases: ['amount', 'servicePrice', 'service_price', 'totalAmount', 'total_amount', 'pricing_snapshot.final_total (minor units)'],
          message: 'A positive amount is required.',
        },
      ])
      return
    }

    const paystackPayload: Record<string, unknown> = {
      email,
      amount: Math.round(amountMajor * 100),
      reference,
      currency,
      callback_url: callbackUrl,
      metadata: {
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {}),
        storeId,
        merchantId: storeId,
        clientOrderId: clean(body.client_order_id ?? body.clientOrderId, 220) || reference,
        sedifexOrderId: reference,
        bookingId: bookingId || null,
        booking_id: bookingId || null,
        sourceChannel,
        sourceLabel,
        paystackSubaccountCode: subaccount || null,
        splitEnabled: Boolean(subaccount),
      },
    }

    if (subaccount) paystackPayload.subaccount = subaccount
    if (subaccount && transactionChargeMinor) {
      paystackPayload.transaction_charge = transactionChargeMinor
      paystackPayload.bearer = 'subaccount'
    }

    const paystack = await initializePaystack(paystackPayload)
    const authorizationUrl = paystack.data?.authorization_url ?? null
    const { enrichedItems, itemName, productName, serviceName, itemType } = enrichCheckoutItems(body)
    const now = admin.firestore.FieldValue.serverTimestamp()
    const record = {
      storeId,
      merchantId: storeId,
      reference,
      clientOrderId: clean(body.client_order_id ?? body.clientOrderId, 220) || reference,
      sourceChannel,
      source_channel: sourceChannel,
      sourceLabel,
      source_label: sourceLabel,
      bookingId: bookingId || null,
      booking_id: bookingId || null,
      customer: { email, phone: phone || null },
      amount: amountMajor,
      amountMinor: Math.round(amountMajor * 100),
      currency,
      itemName: itemName || null,
      productName: productName || null,
      serviceName: serviceName || null,
      itemType: itemType || 'product',
      item_type: itemType || 'product',
      recordType: itemType === 'service' || itemType === 'course' ? 'service_booking' : 'product_order',
      data: { itemName: itemName || null, productName: productName || null, serviceName: serviceName || null, itemType: itemType || 'product' },
      items: enrichedItems,
      pricingSnapshot: body.pricing_snapshot ?? null,
      marketplaceFees: body.marketplace_fees ?? null,
      paymentProvider: 'paystack',
      paymentReference: reference,
      payment_reference: reference,
      paymentStatus: 'pending',
      payment_status: 'pending',
      orderStatus: 'pending_payment',
      order_status: 'pending_payment',
      paymentCollectionMode: 'online_checkout',
      paystackSplit: subaccount ? { enabled: true, subaccount, transactionChargeMinor, bearer: transactionChargeMinor ? 'subaccount' : null, commissionControlledBy: 'sedifex' } : { enabled: false },
      authorizationUrl,
      checkoutUrl: authorizationUrl,
      createdAt: now,
      updatedAt: now,
    }

    const matchingOrderRefs = await findExistingIntegrationOrderRefs(storeId, [bookingId, reference, clean(body.client_order_id ?? body.clientOrderId, 220)])
    if (matchingOrderRefs.length) {
      await Promise.all(matchingOrderRefs.map(orderRef => orderRef.set({ ...record, updatedAt: now, duplicateSuppressedAt: now }, { merge: true })))
    } else {
      await defaultDb.collection('checkoutIntents').doc(reference).set({
        ...record,
        checkoutIntent: true,
        persistedAsOrder: false,
      }, { merge: true })
    }

    res.status(200).json({
      ok: true,
      reference,
      payment_reference: reference,
      authorizationUrl,
      checkoutUrl: authorizationUrl,
      accessCode: paystack.data?.access_code ?? null,
      orderId: reference,
      payment_status: 'pending',
      order_status: 'pending_payment',
      paystackSplit: subaccount ? { enabled: true, subaccount } : { enabled: false },
    })
  } catch (error) {
    functions.logger.error('integrationCheckoutCreate failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'checkout-create-failed' })
  }
})

export const integrationOrderStatus = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }
  if (!assertContract(req, res)) return

  try {
    const reference = clean(req.query.reference, 220)
    const storeId = clean(req.query.storeId, 180)

    if (!reference) {
      res.status(400).json({ error: 'missing-reference' })
      return
    }
    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    const authorized = await isAuthorized(req, storeId)
    if (!authorized) {
      const requestApiKey = getRequestApiKey(req)
      functions.logger.warn('integrationOrderStatus auth failed', {
        storeId,
        reference,
        hasApiKey: Boolean(requestApiKey),
        apiKeyHint: redactApiKey(requestApiKey),
        hasAuthorizationHeader: Boolean(clean(req.get('authorization'), 1000)),
      })
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const refs = [
      defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference),
      defaultDb.collection('integrationOrders').doc(reference),
      defaultDb.collection('checkoutIntents').doc(reference),
    ]

    for (const ref of refs) {
      const snap = await ref.get()
      if (!snap.exists) continue
      const data = snap.data() as Record<string, unknown>
      const docStoreId = pickString(data, ['storeId', 'merchantId'], 180)
      if (docStoreId && docStoreId !== storeId) continue
      res.status(200).json(normalizeIntegrationOrder(reference, storeId, data))
      return
    }

    const fieldsToMatch = ['reference', 'paymentReference', 'payment_reference', 'clientOrderId', 'client_order_id', 'paystackReference']
    for (const field of fieldsToMatch) {
      const snap = await defaultDb
        .collection('integrationOrders')
        .where(field, '==', reference)
        .limit(5)
        .get()

      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>
        const docStoreId = pickString(data, ['storeId', 'merchantId'], 180)
        if (docStoreId && docStoreId !== storeId) continue
        res.status(200).json(normalizeIntegrationOrder(reference, storeId, data))
        return
      }
    }

    res.status(404).json({ ok: false, error: 'order-not-found', reference, storeId })
  } catch (error) {
    functions.logger.error('integrationOrderStatus failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'order-status-failed' })
  }
})
