import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { getUsdGhsRates } from './currencyRates'

const PAYSTACK_SECRET_KEY = defineString('PAYSTACK_SECRET_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL', { default: '' })
const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})

type CheckoutBody = Record<string, unknown>

type NormalizedItemType = 'product' | 'service' | 'course'

const DEFAULT_PAYSTACK_PROCESSING_FEE_PERCENT = 1.95
const DEFAULT_SEDIFEX_COMMISSION_PERCENT = 3

type ResolvedPaymentRouting = {
  paystackSubaccountCode: string
  percentageCharge: number
  settlementMode: string
  status: string
  source: string
  splitEnabled: boolean
  splitDisabledReason: string | null
  raw: Record<string, unknown>
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getFirstArrayRecord(value: unknown): Record<string, unknown> {
  const items = Array.isArray(value) ? value : []
  const first = items[0]
  return getRecord(first)
}



function isTruthyFlag(value: unknown) {
  if (value === true) return true
  const normalized = clean(value, 40).toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'sandbox', 'test', 'test_mode'].includes(normalized)
}

function isSandboxCheckout(req: functions.https.Request, body: CheckoutBody) {
  const metadata = getRecord(body.metadata)
  return isTruthyFlag(req.get('x-sedifex-sandbox'))
    || isTruthyFlag(body.sandbox)
    || isTruthyFlag(body.sandboxMode)
    || isTruthyFlag(body.sandbox_mode)
    || isTruthyFlag(body.testMode)
    || isTruthyFlag(body.test_mode)
    || clean(body.mode, 40).toLowerCase() === 'sandbox'
    || isTruthyFlag(metadata.sandbox)
    || isTruthyFlag(metadata.sandboxMode)
    || isTruthyFlag(metadata.sandbox_mode)
    || isTruthyFlag(metadata.testMode)
    || isTruthyFlag(metadata.test_mode)
}

function getSandboxCheckoutUrl(reference: string, callbackUrl?: string) {
  if (!callbackUrl) return `https://sandbox.sedifex.test/checkout/${encodeURIComponent(reference)}`
  try {
    const url = new URL(callbackUrl)
    url.searchParams.set('sedifex_sandbox', 'true')
    url.searchParams.set('reference', reference)
    url.searchParams.set('status', 'sandbox_created')
    return url.toString()
  } catch (_error) {
    return `https://sandbox.sedifex.test/checkout/${encodeURIComponent(reference)}`
  }
}

function getBookingId(body: CheckoutBody) {
  const metadata = getRecord(body.metadata)
  return firstText([body.booking_id, body.bookingId, metadata.booking_id, metadata.bookingId], 220)
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

function firstText(values: unknown[], max = 220) {
  for (const value of values) {
    const text = clean(value, max)
    if (text) return text
  }
  return ''
}

function setCors(res: functions.Response, methods = 'POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version, X-Sedifex-Sandbox')
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
  const nested = getRecord(body.customer)
  const email = clean(nested.email ?? body.customerEmail ?? body.customer_email ?? body.email, 220).toLowerCase()
  const name = clean(nested.name ?? body.customerName ?? body.customer_name ?? body.name, 220)
  const phone = clean(nested.phone ?? body.customerPhone ?? body.customer_phone ?? body.phone, 80)
  return { email, name, phone }
}

function getAmountMajor(body: CheckoutBody) {
  const direct = numberValue(body.amount)
  if (direct !== null && direct > 0) return direct

  const fallbackAmount = numberValue(body.servicePrice ?? body.service_price ?? body.totalAmount ?? body.total_amount)
  if (fallbackAmount !== null && fallbackAmount > 0) return fallbackAmount

  const snapshot = getRecord(body.pricing_snapshot ?? body.pricingSnapshot)
  const finalTotalMinor = numberValue(snapshot.final_total ?? snapshot.finalTotal ?? snapshot.final_total_minor ?? snapshot.finalTotalMinor)
  return finalTotalMinor !== null && finalTotalMinor > 0 ? finalTotalMinor / 100 : null
}

function getSubaccount(body: CheckoutBody) {
  const split = getRecord(body.splitPayment)
  const routing = getRecord(body.paymentRouting)
  return clean(
    body.subaccount
      ?? body.paystackSubaccountCode
      ?? body.paystack_subaccount_code
      ?? split.subaccount
      ?? routing.paystackSubaccountCode
      ?? routing.subaccountCode,
    140,
  )
}

function getTransactionChargeMinor(body: CheckoutBody) {
  const split = getRecord(body.splitPayment)
  const value = numberValue(split.transactionChargeMinor ?? split.transaction_charge ?? split.transactionCharge ?? body.transactionChargeMinor ?? body.transaction_charge)
  return value !== null && value > 0 ? Math.round(value) : null
}

function getPercentageCharge(value: unknown, fallback = DEFAULT_SEDIFEX_COMMISSION_PERCENT) {
  const parsed = numberValue(value)
  return parsed !== null && parsed > 0 ? parsed : fallback
}

function isQuickPayCheckout(body: CheckoutBody, metadata: Record<string, unknown>, sourceChannel: string) {
  return metadata.quickPay === true
    || metadata.quick_pay === true
    || clean(body.quickPay, 20).toLowerCase() === 'true'
    || clean(body.quick_pay, 20).toLowerCase() === 'true'
    || sourceChannel.toLowerCase().startsWith('quick_pay')
}

function isWebsiteCommerceCheckout(quickPayCheckout: boolean, details: ReturnType<typeof deriveCheckoutDetails>) {
  if (quickPayCheckout) return false
  return ['service_booking', 'service_purchase', 'product_order'].includes(details.recordType)
}

function calculateCustomerProcessingFeeMinor(
  baseTotalMinor: number,
  feePercent = DEFAULT_PAYSTACK_PROCESSING_FEE_PERCENT,
) {
  if (!Number.isFinite(baseTotalMinor) || baseTotalMinor <= 0) return 0
  if (!Number.isFinite(feePercent) || feePercent <= 0) return 0

  const rate = feePercent / 100

  if (rate >= 1) {
    throw new Error('Processing fee percent must be less than 100.')
  }

  return Math.max(0, Math.ceil(baseTotalMinor / (1 - rate)) - baseTotalMinor)
}

function calculateSedifexCommissionMinor(
  baseTotalMinor: number,
  commissionPercent = DEFAULT_SEDIFEX_COMMISSION_PERCENT,
) {
  if (!Number.isFinite(baseTotalMinor) || baseTotalMinor <= 0) return 0
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0) return 0

  return Math.round(baseTotalMinor * (commissionPercent / 100))
}

function normalizeRoutingSnapshot(input: {
  subaccount: string
  percentageCharge?: unknown
  settlementMode?: unknown
  status?: unknown
  source: string
  raw?: Record<string, unknown>
}): ResolvedPaymentRouting {
  const subaccount = clean(input.subaccount, 140)
  const settlementMode = clean(input.settlementMode, 80) || (subaccount ? 'subaccount' : '')
  const status = clean(input.status, 80) || (subaccount ? 'active' : '')
  const inactive = ['inactive', 'disabled', 'blocked', 'suspended'].includes(status.toLowerCase())
  const wrongMode = Boolean(settlementMode) && settlementMode.toLowerCase() !== 'subaccount'
  const splitEnabled = Boolean(subaccount) && !inactive && !wrongMode
  return {
    paystackSubaccountCode: subaccount,
    percentageCharge: getPercentageCharge(input.percentageCharge),
    settlementMode: settlementMode || 'subaccount',
    status: status || (splitEnabled ? 'active' : 'missing'),
    source: input.source,
    splitEnabled,
    splitDisabledReason: splitEnabled ? null : (!subaccount ? 'missing_paystack_subaccount' : inactive ? `routing_${status.toLowerCase()}` : 'settlement_mode_not_subaccount'),
    raw: input.raw ?? {},
  }
}

function routingFromBody(body: CheckoutBody): ResolvedPaymentRouting | null {
  const split = getRecord(body.splitPayment)
  const routing = getRecord(body.paymentRouting)
  const subaccount = getSubaccount(body)
  if (!subaccount) return null
  return normalizeRoutingSnapshot({
    subaccount,
    percentageCharge: routing.percentageCharge ?? routing.percentage_charge ?? split.percentageCharge ?? split.percentage_charge,
    settlementMode: routing.settlementMode ?? routing.settlement_mode ?? split.settlementMode ?? split.settlement_mode,
    status: routing.status ?? split.status,
    source: 'request_body',
    raw: { ...routing, ...split },
  })
}

async function loadPaymentRoutingFromFirestore(storeId: string): Promise<ResolvedPaymentRouting> {
  const empty = normalizeRoutingSnapshot({
    subaccount: '',
    source: 'firestore',
    raw: {},
  })
  if (!storeId) return empty

  const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
  const storeData = storeSnap.exists ? getRecord(storeSnap.data()) : {}
  const storeRouting = getRecord(storeData.paymentRouting)
  const storeNestedCode = clean(storeRouting.paystackSubaccountCode ?? storeRouting.subaccountCode, 140)
  if (storeNestedCode) {
    return normalizeRoutingSnapshot({
      subaccount: storeNestedCode,
      percentageCharge: storeRouting.percentageCharge ?? storeRouting.percentage_charge,
      settlementMode: storeRouting.settlementMode ?? storeRouting.settlement_mode,
      status: storeRouting.status,
      source: 'stores.paymentRouting',
      raw: storeRouting,
    })
  }

  const storeRootCode = clean(storeData.paystackSubaccountCode ?? storeData.paystack_subaccount_code, 140)
  if (storeRootCode) {
    return normalizeRoutingSnapshot({
      subaccount: storeRootCode,
      percentageCharge: storeRouting.percentageCharge ?? storeRouting.percentage_charge,
      settlementMode: storeRouting.settlementMode ?? storeRouting.settlement_mode,
      status: storeRouting.status,
      source: 'stores.paystackSubaccountCode',
      raw: storeRouting,
    })
  }

  const settingsSnap = await defaultDb.collection('storeSettings').doc(storeId).get()
  const settingsData = settingsSnap.exists ? getRecord(settingsSnap.data()) : {}
  const settingsRouting = getRecord(settingsData.paymentRouting)
  const settingsNestedCode = clean(settingsRouting.paystackSubaccountCode ?? settingsRouting.subaccountCode, 140)
  if (settingsNestedCode) {
    return normalizeRoutingSnapshot({
      subaccount: settingsNestedCode,
      percentageCharge: settingsRouting.percentageCharge ?? settingsRouting.percentage_charge,
      settlementMode: settingsRouting.settlementMode ?? settingsRouting.settlement_mode,
      status: settingsRouting.status,
      source: 'storeSettings.paymentRouting',
      raw: settingsRouting,
    })
  }

  const settingsRootCode = clean(settingsData.paystackSubaccountCode ?? settingsData.paystack_subaccount_code, 140)
  if (settingsRootCode) {
    return normalizeRoutingSnapshot({
      subaccount: settingsRootCode,
      percentageCharge: settingsRouting.percentageCharge ?? settingsRouting.percentage_charge,
      settlementMode: settingsRouting.settlementMode ?? settingsRouting.settlement_mode,
      status: settingsRouting.status,
      source: 'storeSettings.paystackSubaccountCode',
      raw: settingsRouting,
    })
  }

  return empty
}

function normalizeItemType(value: unknown): NormalizedItemType | '' {
  const normalized = clean(value, 80).toLowerCase().replace(/[\s_-]+/g, '_')
  if (normalized === 'course' || normalized === 'class' || normalized === 'training') return 'course'
  if (normalized === 'service' || normalized === 'booking' || normalized === 'service_booking' || normalized === 'service_purchase' || normalized === 'tour_package' || normalized === 'tour' || normalized === 'trip') return 'service'
  if (normalized === 'product' || normalized === 'product_order' || normalized === 'physical_product') return 'product'
  return ''
}

function normalizeAccountingType(value: unknown) {
  const normalized = clean(value, 80).toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  if (['booking', 'service_booking', 'appointment'].includes(normalized)) return 'booking'
  if (['service', 'service_purchase', 'service_payment'].includes(normalized)) return 'service'
  if (['course', 'class', 'training', 'course_payment'].includes(normalized)) return 'course'
  if (['student_registration', 'registration', 'student'].includes(normalized)) return 'student_registration'
  if (['donation', 'donor'].includes(normalized)) return 'donation'
  if (['product', 'product_order', 'physical_product'].includes(normalized)) return 'product'
  return normalized
}

function getSnapshotItems(body: CheckoutBody) {
  const snapshot = getRecord(body.pricing_snapshot ?? body.pricingSnapshot)
  return Array.isArray(snapshot.items) ? snapshot.items.map(getRecord) : []
}

function deriveCheckoutDetails(body: CheckoutBody) {
  const rawItems = Array.isArray(body.items) ? body.items.map(getRecord) : []
  const firstItem = rawItems[0] ?? {}
  const snapshotItems = getSnapshotItems(body)
  const firstSnapshotItem = snapshotItems[0] ?? {}
  const metadata = getRecord(body.metadata)

  const itemName = firstText([
    body.itemName,
    body.productName,
    body.serviceName,
    firstItem.itemName,
    firstItem.name,
    firstItem.title,
    firstSnapshotItem.itemName,
    firstSnapshotItem.name,
    firstSnapshotItem.title,
    metadata.itemName,
  ])
  const productName = firstText([body.productName, firstItem.productName, firstSnapshotItem.productName, metadata.productName])
  const serviceName = firstText([body.serviceName, firstItem.serviceName, firstItem.name, firstSnapshotItem.serviceName, metadata.serviceName])

  const quickPayType = firstText([
    body.quickPayType,
    firstItem.quickPayType,
    firstItem.originalQuickPayType,
    firstSnapshotItem.quickPayType,
    firstSnapshotItem.originalQuickPayType,
    metadata.quickPayType,
    metadata.originalQuickPayType,
  ], 80).toUpperCase()

  const accountingType = normalizeAccountingType(firstText([
    body.accountingType,
    body.orderType,
    body.order_type,
    firstItem.accountingType,
    firstItem.orderType,
    firstItem.quickPayType,
    firstSnapshotItem.accountingType,
    firstSnapshotItem.quickPayType,
    metadata.accountingType,
    metadata.orderType,
    metadata.quickPayType,
  ], 80))

  const itemType = normalizeItemType(
    body.itemType
      ?? body.item_type
      ?? firstItem.itemType
      ?? firstItem.item_type
      ?? firstItem.type
      ?? firstSnapshotItem.itemType
      ?? firstSnapshotItem.item_type
      ?? firstSnapshotItem.type
      ?? metadata.itemType
      ?? metadata.item_type,
  ) || (accountingType === 'product' ? 'product' : accountingType === 'course' ? 'course' : accountingType ? 'service' : productName ? 'product' : 'service')

  const recordType = accountingType === 'booking' || quickPayType === 'BOOKING'
    ? 'service_booking'
    : accountingType === 'service' || quickPayType === 'SERVICE'
      ? 'service_purchase'
      : accountingType === 'course' || quickPayType === 'COURSE'
        ? 'course_payment'
        : accountingType === 'student_registration' || quickPayType === 'STUDENT_REGISTRATION'
          ? 'student_registration'
          : accountingType === 'donation' || quickPayType === 'DONATION'
            ? 'donation'
            : itemType === 'product'
              ? 'product_order'
              : itemType === 'course'
                ? 'course_payment'
                : 'service_purchase'

  const enrichedItems = rawItems.map((item) => {
    const itemId = clean(item.item_id ?? item.itemId, 220)
    const snapshotMatch = snapshotItems.find(snapshot => clean(snapshot.item_id ?? snapshot.itemId, 220) === itemId) ?? {}
    const resolvedName = firstText([item.name, item.itemName, item.serviceName, item.productName, snapshotMatch.name, snapshotMatch.itemName])
    const resolvedType = normalizeItemType(item.itemType ?? item.item_type ?? item.type ?? snapshotMatch.itemType ?? snapshotMatch.item_type ?? snapshotMatch.type) || itemType
    return {
      ...item,
      ...(resolvedName ? { name: resolvedName, itemName: resolvedName } : {}),
      itemType: resolvedType,
      item_type: resolvedType,
      accountingType: recordType,
      orderType: recordType,
      order_type: recordType,
    }
  })

  return {
    metadata,
    quickPayType,
    accountingType: accountingType || recordType,
    itemType,
    recordType,
    itemName,
    productName,
    serviceName,
    enrichedItems,
  }
}

type AuthoritativePricingLine = {
  itemId: string
  name: string | null
  itemType: string
  quantity: number
  listedUnitAmount: number
  listedCurrency: 'GHS' | 'USD'
  listedLineAmount: number
  paymentLineAmountGhs: number
}

function itemIsCheckoutAvailable(record: Record<string, unknown>) {
  if (record.isWebsiteVisible === false) return false
  if (record.isPublished === false) return false
  const status = clean(record.status, 40).toLowerCase()
  return !['draft', 'archived', 'deleted', 'removed', 'hidden', 'inactive'].includes(status)
}

function getCatalogPriceMajor(record: Record<string, unknown>) {
  const direct = numberValue(record.price ?? record.sellingPrice ?? record.salePrice ?? record.amount ?? record.fee)
  if (direct !== null && direct >= 0) return direct
  const minor = numberValue(record.priceMinor ?? record.amountMinor)
  if (minor !== null && minor >= 0) return minor / 100
  return null
}

async function resolveAuthoritativeCatalogItem(storeId: string, itemId: string) {
  const directRefs = [
    defaultDb.collection('stores').doc(storeId).collection('products').doc(itemId),
    defaultDb.collection('stores').doc(storeId).collection('services').doc(itemId),
    defaultDb.collection('stores').doc(storeId).collection('courses').doc(itemId),
    defaultDb.collection('products').doc(itemId),
    defaultDb.collection('services').doc(itemId),
    defaultDb.collection('courses').doc(itemId),
    defaultDb.collection('publicListings').doc(itemId),
  ]

  for (const ref of directRefs) {
    const snap = await ref.get()
    if (!snap.exists) continue
    const record = (snap.data() ?? {}) as Record<string, unknown>
    const recordStoreId = clean(record.storeId, 180)
    if (recordStoreId && recordStoreId !== storeId) continue
    if (!itemIsCheckoutAvailable(record)) return { unavailable: true as const, item: record }
    return { unavailable: false as const, item: record }
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
      const record = (snap.docs[0].data() ?? {}) as Record<string, unknown>
      if (!itemIsCheckoutAvailable(record)) return { unavailable: true as const, item: record }
      return { unavailable: false as const, item: record }
    }
  }

  return null
}

function checkoutItemRequests(body: CheckoutBody) {
  const rawItems = Array.isArray(body.items) ? body.items.map(getRecord) : []
  if (rawItems.length) {
    return rawItems.map((item) => ({
      itemId: clean(item.item_id ?? item.itemId ?? item.productId ?? item.serviceId ?? item.id, 220),
      quantity: Math.max(1, Math.round(numberValue(item.qty ?? item.quantity) ?? 1)),
      hintedType: normalizeItemType(item.itemType ?? item.item_type ?? item.type) || '',
    }))
  }

  const itemId = clean(
    body.item_id ?? body.itemId ?? body.productId ?? body.product_id ?? body.serviceId ?? body.service_id,
    220,
  )
  if (!itemId) return []
  return [{
    itemId,
    quantity: Math.max(1, Math.round(numberValue(body.qty ?? body.quantity) ?? 1)),
    hintedType: normalizeItemType(body.itemType ?? body.item_type) || '',
  }]
}

async function resolveAuthoritativePricing(body: CheckoutBody, storeId: string) {
  const requestedItems = checkoutItemRequests(body).filter(item => item.itemId)
  if (!requestedItems.length) return null

  let rates: Awaited<ReturnType<typeof getUsdGhsRates>> | null = null
  const lines: AuthoritativePricingLine[] = []

  for (const requested of requestedItems) {
    const resolved = await resolveAuthoritativeCatalogItem(storeId, requested.itemId)
    if (!resolved) return null
    if (resolved.unavailable) {
      throw new Error(`Item ${requested.itemId} is not available for website checkout.`)
    }

    const price = getCatalogPriceMajor(resolved.item)
    if (price === null || price < 0) {
      throw new Error(`Item ${requested.itemId} does not have a valid Sedifex price.`)
    }

    const listedCurrencyRaw = (clean(resolved.item.currency, 20) || 'GHS').toUpperCase()
    if (listedCurrencyRaw !== 'GHS' && listedCurrencyRaw !== 'USD') {
      throw new Error(`Item ${requested.itemId} uses an unsupported currency.`)
    }
    const listedCurrency = listedCurrencyRaw as 'GHS' | 'USD'
    const listedLineAmount = roundMoney(price * requested.quantity)
    if (listedCurrency === 'USD' && !rates) {
      rates = await getUsdGhsRates({ refreshIfMissing: true })
    }
    const paymentLineAmountGhs = listedCurrency === 'USD'
      ? roundMoney(listedLineAmount * rates!.usdToGhs)
      : listedLineAmount

    lines.push({
      itemId: requested.itemId,
      name: firstText([resolved.item.name, resolved.item.title, resolved.item.productName, resolved.item.serviceName]) || null,
      itemType: normalizeItemType(resolved.item.itemType ?? resolved.item.item_type ?? resolved.item.type) || requested.hintedType || 'product',
      quantity: requested.quantity,
      listedUnitAmount: price,
      listedCurrency,
      listedLineAmount,
      paymentLineAmountGhs,
    })
  }

  const currencies = Array.from(new Set(lines.map(line => line.listedCurrency)))
  const homogeneousCurrency = currencies.length === 1 ? currencies[0] : null
  const listedAmount = homogeneousCurrency
    ? roundMoney(lines.reduce((sum, line) => sum + line.listedLineAmount, 0))
    : null
  const paymentAmountGhs = roundMoney(lines.reduce((sum, line) => sum + line.paymentLineAmountGhs, 0))

  return {
    lines,
    listedAmount,
    listedCurrency: homogeneousCurrency ?? 'MIXED',
    paymentAmountGhs,
    exchangeRateUpdatedAt: rates?.fetchedAt ?? null,
    exchangeRateUsdToGhs: rates?.usdToGhs ?? null,
    priceSource: 'sedifex_catalog' as const,
  }
}

async function initializePaystack(payload: Record<string, unknown>) {
  const key = PAYSTACK_SECRET_KEY.value()?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || ''
  if (!key) throw new Error('Paystack secret is not configured')

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
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
  if (!assertContract(req, res)) return

  try {
    const body = (req.body ?? {}) as CheckoutBody
    const storeId = getStoreId(body)
    const customer = getCustomer(body)
    const clientAmountMajor = getAmountMajor(body)
    const bookingId = getBookingId(body)
    const reference = clean(body.payment_reference ?? body.reference, 220) || clean(body.client_order_id ?? body.clientOrderId, 220) || bookingId || `${storeId}_${Date.now()}`
    const clientListedCurrency = (clean(body.currency, 20) || 'GHS').toUpperCase()
    const callbackUrl = clean(body.returnUrl, 700) || APP_BASE_URL.value() || undefined
    const sourceChannel = clean(body.sourceChannel ?? body.source_channel, 80) || 'integration_checkout'
    const sourceLabel = clean(body.sourceLabel ?? body.source_label, 120) || 'Sedifex checkout'
    const listedTransactionChargeMinor = getTransactionChargeMinor(body)
    const details = deriveCheckoutDetails(body)
    const quickPayCheckout = isQuickPayCheckout(body, details.metadata, sourceChannel)
    const websiteCommerceCheckout = isWebsiteCommerceCheckout(quickPayCheckout, details)
    const sandboxCheckout = isSandboxCheckout(req, body)

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }
    if (!customer.email) {
      res.status(400).json({ error: 'customer-email-required' })
      return
    }

    const authoritativePricing = await resolveAuthoritativePricing(body, storeId)
    const amountMajor = authoritativePricing?.listedAmount ?? clientAmountMajor
    const listedCurrency = authoritativePricing?.listedCurrency ?? clientListedCurrency
    const paymentAmountMajor = authoritativePricing?.paymentAmountGhs
      ?? (listedCurrency === 'USD'
        ? roundMoney((amountMajor ?? 0) * (await getUsdGhsRates({ refreshIfMissing: true })).usdToGhs)
        : roundMoney(amountMajor ?? 0))

    if (!paymentAmountMajor || paymentAmountMajor <= 0) {
      res.status(400).json({ error: 'amount-required' })
      return
    }
    if (!authoritativePricing && listedCurrency !== 'GHS' && listedCurrency !== 'USD') {
      res.status(400).json({
        error: 'unsupported-currency',
        message: 'Sedifex checkout currently supports item prices in GHS or USD only.',
      })
      return
    }

    const currencyRates = listedCurrency === 'USD' && !authoritativePricing
      ? await getUsdGhsRates({ refreshIfMissing: true })
      : null
    const auditExchangeRateUsdToGhs = authoritativePricing?.exchangeRateUsdToGhs ?? currencyRates?.usdToGhs ?? null
    const auditExchangeRateUpdatedAt = authoritativePricing?.exchangeRateUpdatedAt ?? currencyRates?.fetchedAt ?? null
    const transactionChargeMinor = listedCurrency === 'USD' && listedTransactionChargeMinor && auditExchangeRateUsdToGhs
      ? Math.round((listedTransactionChargeMinor / 100) * auditExchangeRateUsdToGhs * 100)
      : listedTransactionChargeMinor
    const currency = 'GHS'
    const baseTotalMinor = Math.round(paymentAmountMajor * 100)
    const bodyRouting = routingFromBody(body)
    const firestoreRouting = (quickPayCheckout || websiteCommerceCheckout) && !bodyRouting
      ? await loadPaymentRoutingFromFirestore(storeId)
      : null
    const paymentRouting = bodyRouting ?? firestoreRouting ?? normalizeRoutingSnapshot({ subaccount: '', source: 'none' })
    const subaccount = paymentRouting.splitEnabled ? paymentRouting.paystackSubaccountCode : ''
    const commissionPercent = websiteCommerceCheckout
      ? DEFAULT_SEDIFEX_COMMISSION_PERCENT
      : paymentRouting.percentageCharge || DEFAULT_SEDIFEX_COMMISSION_PERCENT
    const customerPaysProcessingFee = quickPayCheckout || websiteCommerceCheckout
    const processingFeeMinor = customerPaysProcessingFee
      ? calculateCustomerProcessingFeeMinor(baseTotalMinor)
      : 0
    const customerTotalMinor = baseTotalMinor + processingFeeMinor
    const automaticSedifexCommission = quickPayCheckout || websiteCommerceCheckout
    const sedifexCommissionMinor = subaccount
      ? (automaticSedifexCommission
        ? calculateSedifexCommissionMinor(baseTotalMinor, commissionPercent)
        : transactionChargeMinor ?? 0)
      : 0
    const pricingSnapshot = {
      baseTotalMinor,
      processingFeeMinor,
      customerTotalMinor,
      sedifexCommissionMinor,
      customerPaysProcessingFee,
      automaticSedifexCommission,
      merchantPaysCommission: sedifexCommissionMinor > 0,
      priceSource: authoritativePricing?.priceSource ?? 'client_amount',
      clientSubmittedAmount: clientAmountMajor,
      clientSubmittedCurrency: clientListedCurrency,
      listedAmount: amountMajor,
      listedCurrency,
      paymentAmountGhs: paymentAmountMajor,
      paymentCurrency: 'GHS',
      exchangeRateUsdToGhs: auditExchangeRateUsdToGhs,
      exchangeRateUpdatedAt: auditExchangeRateUpdatedAt,
    }
    const { exchangeRateUsdToGhs: _internalExchangeRate, ...publicPricingSnapshot } = pricingSnapshot
    void _internalExchangeRate

    const paymentRoutingSnapshot = {
      paystackSubaccountCode: paymentRouting.paystackSubaccountCode || null,
      percentageCharge: commissionPercent,
      settlementMode: paymentRouting.settlementMode,
      status: paymentRouting.status,
      source: paymentRouting.source,
      splitEnabled: Boolean(subaccount),
      splitDisabledReason: subaccount ? null : paymentRouting.splitDisabledReason,
      priceSource: authoritativePricing?.priceSource ?? 'client_amount',
    }
    const paystackSplitSnapshot = subaccount ? {
      enabled: true,
      provider: 'paystack',
      mode: 'subaccount',
      subaccount,
      transactionChargeMinor: sedifexCommissionMinor,
      transaction_charge: sedifexCommissionMinor,
      bearer: sedifexCommissionMinor > 0 ? 'subaccount' : null,
      percentageCharge: commissionPercent,
      customerPaysProcessingFee,
      automaticSedifexCommission,
      merchantPaysCommission: sedifexCommissionMinor > 0,
    } : {
      enabled: false,
      provider: 'paystack',
      mode: 'subaccount',
      subaccount: null,
      transactionChargeMinor: 0,
      transaction_charge: 0,
      bearer: null,
      percentageCharge: commissionPercent,
      customerPaysProcessingFee,
      automaticSedifexCommission,
      merchantPaysCommission: false,
      splitDisabledReason: paymentRouting.splitDisabledReason,
    }

    const authoritativeOrderItems = authoritativePricing
      ? authoritativePricing.lines.map(line => ({
          item_id: line.itemId,
          itemId: line.itemId,
          name: line.name,
          itemName: line.name,
          itemType: line.itemType,
          item_type: line.itemType,
          qty: line.quantity,
          quantity: line.quantity,
          price: line.listedUnitAmount,
          unitPrice: line.listedUnitAmount,
          currency: line.listedCurrency,
          lineTotal: line.listedLineAmount,
          paymentLineAmountGhs: line.paymentLineAmountGhs,
        }))
      : null

    const storedMetadata = {
      ...details.metadata,
      quickPay: details.metadata.quickPay ?? quickPayCheckout,
      storeId,
      merchantId: storeId,
      clientOrderId: clean(body.client_order_id ?? body.clientOrderId, 220) || reference,
      sedifexOrderId: reference,
      bookingId: bookingId || null,
      booking_id: bookingId || null,
      sourceChannel,
      sourceLabel,
      customerName: customer.name || null,
      customerEmail: customer.email,
      customerPhone: customer.phone || null,
      itemName: details.itemName || null,
      itemType: details.itemType,
      quickPayType: details.quickPayType || null,
      accountingType: details.accountingType,
      orderType: details.recordType,
      recordType: details.recordType,
      paystackSubaccountCode: subaccount || null,
      baseTotalMinor,
      processingFeeMinor,
      customerTotalMinor,
      sedifexCommissionMinor,
      priceSource: authoritativePricing?.priceSource ?? 'client_amount',
      clientSubmittedAmount: clientAmountMajor,
      clientSubmittedCurrency: clientListedCurrency,
      listedAmount: amountMajor,
      listedCurrency,
      paymentAmountGhs: paymentAmountMajor,
      paymentCurrency: 'GHS',
      exchangeRateUsdToGhs: auditExchangeRateUsdToGhs,
      exchangeRateUpdatedAt: auditExchangeRateUpdatedAt,
      customerPaysProcessingFee,
      automaticSedifexCommission,
      merchantPaysCommission: sedifexCommissionMinor > 0,
      settlementMode: paymentRouting.settlementMode,
      splitEnabled: Boolean(subaccount),
      splitDisabledReason: subaccount ? null : paymentRouting.splitDisabledReason,
    }

    if (sandboxCheckout) {
      const sandboxCheckoutUrl = getSandboxCheckoutUrl(reference, callbackUrl)
      res.status(200).json({
        ok: true,
        sandbox: true,
        persisted: false,
        reference,
        payment_reference: reference,
        authorizationUrl: sandboxCheckoutUrl,
        checkoutUrl: sandboxCheckoutUrl,
        accessCode: `sandbox_${reference}`,
        orderId: reference,
        payment_status: 'sandbox_created',
        order_status: 'sandbox_created',
        status: 'sandbox_created',
        paymentProvider: 'sandbox',
        payment_provider: 'sandbox',
        recordType: details.recordType,
        orderType: details.recordType,
        pricingSnapshot: publicPricingSnapshot,
        paymentRouting: paymentRoutingSnapshot,
        paystackSplit: paystackSplitSnapshot,
        message: 'Sandbox checkout validated successfully. No Paystack transaction was initialized and no Sedifex order was saved.',
      })
      return
    }

    const paystackPayload: Record<string, unknown> = {
      email: customer.email,
      amount: customerTotalMinor,
      reference,
      currency,
      callback_url: callbackUrl,
      metadata: storedMetadata,
    }

    if (subaccount) {
      paystackPayload.subaccount = subaccount
      if (sedifexCommissionMinor > 0) {
        paystackPayload.transaction_charge = sedifexCommissionMinor
        paystackPayload.bearer = 'subaccount'
      }
    }

    const paystack = await initializePaystack(paystackPayload)
    const authorizationUrl = paystack.data?.authorization_url ?? null
    const now = admin.firestore.FieldValue.serverTimestamp()
    const nowIso = new Date().toISOString()
    const clientOrderId = clean(body.client_order_id ?? body.clientOrderId, 220) || reference

    const record = {
      storeId,
      merchantId: storeId,
      reference,
      clientOrderId,
      client_order_id: clientOrderId,
      sourceChannel,
      source_channel: sourceChannel,
      sourceLabel,
      source_label: sourceLabel,
      bookingId: bookingId || null,
      booking_id: bookingId || null,
      customer: {
        name: customer.name || null,
        email: customer.email,
        phone: customer.phone || null,
      },
      customerName: customer.name || null,
      customer_name: customer.name || null,
      customerEmail: customer.email,
      customer_email: customer.email,
      customerPhone: customer.phone || null,
      customer_phone: customer.phone || null,
      amount: customerTotalMinor / 100,
      amountMinor: customerTotalMinor,
      amount_minor: customerTotalMinor,
      baseAmount: baseTotalMinor / 100,
      baseAmountMinor: baseTotalMinor,
      base_amount_minor: baseTotalMinor,
      processingFeeMinor,
      processing_fee_minor: processingFeeMinor,
      customerTotalMinor,
      customer_total_minor: customerTotalMinor,
      sedifexCommissionMinor,
      sedifex_commission_minor: sedifexCommissionMinor,
      currency,
      priceSource: authoritativePricing?.priceSource ?? 'client_amount',
      authoritativeItems: authoritativePricing?.lines ?? null,
      clientSubmittedAmount: clientAmountMajor,
      clientSubmittedCurrency: clientListedCurrency,
      listedAmount: amountMajor,
      listedCurrency,
      paymentAmountGhs: paymentAmountMajor,
      paymentCurrency: 'GHS',
      exchangeRateUsdToGhs: auditExchangeRateUsdToGhs,
      exchangeRateUpdatedAt: auditExchangeRateUpdatedAt,
      itemName: details.itemName || details.productName || details.serviceName || null,
      productName: details.productName || null,
      serviceName: details.serviceName || null,
      itemType: details.itemType,
      item_type: details.itemType,
      accountingType: details.accountingType,
      accounting_type: details.accountingType,
      recordType: details.recordType,
      orderType: details.recordType,
      order_type: details.recordType,
      data: {
        itemName: details.itemName || null,
        productName: details.productName || null,
        serviceName: details.serviceName || null,
        itemType: details.itemType,
        accountingType: details.accountingType,
        recordType: details.recordType,
      },
      items: authoritativeOrderItems ?? details.enrichedItems,
      pricingSnapshot,
      pricing_snapshot: pricingSnapshot,
      clientPricingSnapshot: body.pricing_snapshot ?? body.pricingSnapshot ?? null,
      client_pricing_snapshot: body.pricing_snapshot ?? body.pricingSnapshot ?? null,
      marketplaceFees: body.marketplace_fees ?? body.marketplaceFees ?? null,
      marketplace_fees: body.marketplace_fees ?? body.marketplaceFees ?? null,
      metadata: storedMetadata,
      paymentProvider: 'paystack',
      payment_provider: 'paystack',
      paymentMethod: 'ONLINE',
      payment_method: 'ONLINE',
      paymentReference: reference,
      payment_reference: reference,
      paystackReference: reference,
      paymentStatus: 'pending',
      payment_status: 'pending',
      orderStatus: 'pending_payment',
      order_status: 'pending_payment',
      status: 'pending_payment',
      paymentCollectionMode: 'online_checkout',
      payment_collection_mode: 'online_checkout',
      paymentRouting: paymentRoutingSnapshot,
      payment_routing: paymentRoutingSnapshot,
      paystackSplit: paystackSplitSnapshot,
      authorizationUrl,
      checkoutUrl: authorizationUrl,
      orderDate: nowIso,
      order_date: nowIso,
      createdAt: now,
      createdAtIso: nowIso,
      created_at: now,
      updatedAt: now,
      updatedAtIso: nowIso,
    }

    const matchingOrderRefs = await findExistingIntegrationOrderRefs(storeId, [bookingId, reference, clean(body.client_order_id ?? body.clientOrderId, 220)])
    if (matchingOrderRefs.length) {
      await Promise.all(matchingOrderRefs.map(orderRef => orderRef.set({ ...record, updatedAt: now, updatedAtIso: nowIso, duplicateSuppressedAt: now }, { merge: true })))
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
      recordType: details.recordType,
      orderType: details.recordType,
      pricingSnapshot: publicPricingSnapshot,
      priceSource: authoritativePricing?.priceSource ?? 'client_amount',
      listedAmount: amountMajor,
      listedCurrency,
      paymentAmountGhs: paymentAmountMajor,
      paymentCurrency: 'GHS',
      exchangeRateUpdatedAt: auditExchangeRateUpdatedAt,
      paystackSplit: paystackSplitSnapshot,
    })
  } catch (error) {
    functions.logger.error('integrationCheckoutCreate failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'checkout-create-failed' })
  }
})
