import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const PAYSTACK_SECRET_KEY = defineString('PAYSTACK_SECRET_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL', { default: '' })
const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})

type CheckoutBody = Record<string, unknown>

type NormalizedItemType = 'product' | 'service' | 'course'

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getFirstArrayRecord(value: unknown): Record<string, unknown> {
  const items = Array.isArray(value) ? value : []
  const first = items[0]
  return getRecord(first)
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
  const value = numberValue(split.transactionChargeMinor ?? split.transaction_charge ?? split.transactionCharge)
  return value !== null && value > 0 ? Math.round(value) : null
}

function normalizeItemType(value: unknown): NormalizedItemType | '' {
  const normalized = clean(value, 80).toLowerCase().replace(/[\s_-]+/g, '_')
  if (normalized === 'course' || normalized === 'class' || normalized === 'training') return 'course'
  if (normalized === 'service' || normalized === 'booking' || normalized === 'service_booking' || normalized === 'service_purchase') return 'service'
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
    const amountMajor = getAmountMajor(body)
    const bookingId = getBookingId(body)
    const reference = clean(body.payment_reference ?? body.reference, 220) || clean(body.client_order_id ?? body.clientOrderId, 220) || bookingId || `${storeId}_${Date.now()}`
    const currency = clean(body.currency, 20) || 'GHS'
    const callbackUrl = clean(body.returnUrl, 700) || APP_BASE_URL.value() || undefined
    const sourceChannel = clean(body.sourceChannel ?? body.source_channel, 80) || 'integration_checkout'
    const sourceLabel = clean(body.sourceLabel ?? body.source_label, 120) || 'Sedifex checkout'
    const subaccount = getSubaccount(body)
    const transactionChargeMinor = getTransactionChargeMinor(body)
    const details = deriveCheckoutDetails(body)

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }
    if (!customer.email) {
      res.status(400).json({ error: 'customer-email-required' })
      return
    }
    if (!amountMajor || amountMajor <= 0) {
      res.status(400).json({ error: 'amount-required' })
      return
    }

    const storedMetadata = {
      ...details.metadata,
      quickPay: details.metadata.quickPay ?? true,
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
      splitEnabled: Boolean(subaccount),
    }

    const paystackPayload: Record<string, unknown> = {
      email: customer.email,
      amount: Math.round(amountMajor * 100),
      reference,
      currency,
      callback_url: callbackUrl,
      metadata: storedMetadata,
    }

    if (subaccount) paystackPayload.subaccount = subaccount
    if (subaccount && transactionChargeMinor) {
      paystackPayload.transaction_charge = transactionChargeMinor
      paystackPayload.bearer = 'subaccount'
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
      amount: amountMajor,
      amountMinor: Math.round(amountMajor * 100),
      amount_minor: Math.round(amountMajor * 100),
      currency,
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
      items: details.enrichedItems,
      pricingSnapshot: body.pricing_snapshot ?? body.pricingSnapshot ?? null,
      pricing_snapshot: body.pricing_snapshot ?? body.pricingSnapshot ?? null,
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
      paystackSplit: subaccount ? { enabled: true, subaccount, transactionChargeMinor, bearer: transactionChargeMinor ? 'subaccount' : null, commissionControlledBy: 'sedifex' } : { enabled: false },
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
      await Promise.all([
        defaultDb.collection('integrationOrders').doc(reference).set(record, { merge: true }),
        defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference).set(record, { merge: true }),
      ])
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
      paystackSplit: subaccount ? { enabled: true, subaccount } : { enabled: false },
    })
  } catch (error) {
    functions.logger.error('integrationCheckoutCreate failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'checkout-create-failed' })
  }
})
