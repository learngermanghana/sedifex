import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { upsertStoreCustomerFromCheckout } from './customerUpsert'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})

type CashCheckoutBody = {
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
  sourceChannel?: unknown
  source_channel?: unknown
  sourceLabel?: unknown
  source_label?: unknown
  metadata?: unknown
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
  paymentMethod?: unknown
  payment_method?: unknown
  paymentProvider?: unknown
  payment_provider?: unknown
  paymentCollectionMode?: unknown
  payment_collection_mode?: unknown
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getStoreId(body: CashCheckoutBody) {
  return clean(body.store_id ?? body.merchant_id ?? body.storeId ?? body.merchantId, 180)
}

function getCustomer(body: CashCheckoutBody) {
  const nested = getRecord(body.customer)
  return {
    email: clean(nested.email ?? body.customerEmail ?? body.customer_email ?? body.email, 220).toLowerCase(),
    name: clean(nested.name ?? body.customerName ?? body.customer_name ?? body.name, 220),
    phone: clean(nested.phone ?? body.customerPhone ?? body.customer_phone ?? body.phone, 80),
  }
}

function getAmountMajor(body: CashCheckoutBody) {
  const direct = numberValue(body.amount)
  if (direct && direct > 0) return direct
  const fallbackAmount = numberValue(body.servicePrice ?? body.service_price ?? body.totalAmount ?? body.total_amount)
  if (fallbackAmount && fallbackAmount > 0) return fallbackAmount
  const snapshot = getRecord(body.pricing_snapshot)
  const finalTotalMinor = numberValue(snapshot.final_total ?? snapshot.finalTotal)
  return finalTotalMinor && finalTotalMinor > 0 ? finalTotalMinor / 100 : null
}

function getFirstText(record: Record<string, unknown>, keys: string[], max = 220) {
  for (const key of keys) {
    const value = clean(record[key], max)
    if (value) return value
  }
  return ''
}

function getSnapshotItems(body: CashCheckoutBody) {
  const snapshot = getRecord(body.pricing_snapshot)
  return Array.isArray(snapshot.items) ? snapshot.items.map(getRecord) : []
}

function enrichCheckoutItems(body: CashCheckoutBody) {
  const rawItems = Array.isArray(body.items) ? body.items : []
  const snapshotItems = getSnapshotItems(body)
  const metadata = getRecord(body.metadata)

  const enrichedItems = rawItems.map((item) => {
    const base = getRecord(item)
    const itemId = clean(base.item_id ?? base.itemId, 220)
    const snapshotMatch = snapshotItems.find(snapshotItem => clean(snapshotItem.item_id ?? snapshotItem.itemId, 220) === itemId)
    const name = getFirstText(base, ['name', 'title', 'itemName', 'serviceName', 'productName'])
      || getFirstText(snapshotMatch ?? {}, ['name', 'title', 'itemName', 'serviceName', 'productName'])
      || getFirstText(metadata, ['itemName', 'manualPaymentName', 'serviceName', 'productName'])
    const itemName = getFirstText(base, ['itemName']) || getFirstText(snapshotMatch ?? {}, ['itemName']) || name
    const productName = getFirstText(base, ['productName']) || getFirstText(snapshotMatch ?? {}, ['productName'])
    const serviceName = getFirstText(base, ['serviceName']) || getFirstText(snapshotMatch ?? {}, ['serviceName']) || getFirstText(metadata, ['manualPaymentName'])
    return {
      ...base,
      ...(name ? { name } : {}),
      ...(itemName ? { itemName } : {}),
      ...(productName ? { productName } : {}),
      ...(serviceName ? { serviceName } : {}),
    }
  })

  const firstItem = enrichedItems.length ? getRecord(enrichedItems[0]) : {}
  const firstSnapshotItem = snapshotItems.length ? snapshotItems[0] : {}
  const itemName = getFirstText(firstItem, ['itemName', 'name', 'title'])
    || getFirstText(firstSnapshotItem, ['itemName', 'name', 'title'])
    || getFirstText(metadata, ['itemName', 'manualPaymentName'])
  const productName = getFirstText(firstItem, ['productName'])
    || getFirstText(firstSnapshotItem, ['productName'])
    || getFirstText(metadata, ['productName'])
  const serviceName = getFirstText(firstItem, ['serviceName'])
    || getFirstText(firstSnapshotItem, ['serviceName'])
    || getFirstText(metadata, ['serviceName', 'manualPaymentName'])

  return { enrichedItems, itemName, productName, serviceName }
}

function setCors(res: functions.Response, methods = 'POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', methods)
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = clean(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  if (received && received !== expected) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return false
  }
  return true
}

export const integrationCashCheckoutCreate = functions.https.onRequest(async (req, res): Promise<void> => {
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
    const body = (req.body ?? {}) as CashCheckoutBody
    const storeId = getStoreId(body)
    const customer = getCustomer(body)
    const amountMajor = getAmountMajor(body)
    const reference = clean(body.payment_reference ?? body.reference, 220)
      || clean(body.client_order_id ?? body.clientOrderId, 220)
      || `cash_${storeId}_${Date.now()}`
    const currency = clean(body.currency, 20) || 'GHS'
    const sourceChannel = clean(body.sourceChannel ?? body.source_channel, 80) || 'quick_pay_cash'
    const sourceLabel = clean(body.sourceLabel ?? body.source_label, 120) || 'Sedifex Quick Pay Cash'

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }
    if (!customer.email && !customer.phone) {
      res.status(400).json({ error: 'customer-contact-required', message: 'Enter a customer phone number or email for cash checkout.' })
      return
    }
    if (!amountMajor || amountMajor <= 0) {
      res.status(400).json({ error: 'amount-required' })
      return
    }

    const { enrichedItems, itemName, productName, serviceName } = enrichCheckoutItems(body)
    const now = admin.firestore.FieldValue.serverTimestamp()
    const clientOrderId = clean(body.client_order_id ?? body.clientOrderId, 220) || reference
    const metadata = getRecord(body.metadata)
    const paymentMethod = 'CASH'
    const paymentStatus = 'pending_cash'
    const orderStatus = 'awaiting_cash_confirmation'

    const customerUpsert = await upsertStoreCustomerFromCheckout({
      storeId,
      customer,
      reference,
      sourceChannel,
      sourceLabel,
      paymentMethod,
      paymentStatus,
      orderStatus,
      amount: amountMajor,
      currency,
      itemName: itemName || serviceName || productName || null,
    }).catch(error => {
      functions.logger.warn('Cash checkout customer auto-save failed', { storeId, reference, error })
      return null
    })

    const record = {
      storeId,
      merchantId: storeId,
      reference,
      clientOrderId,
      customerId: customerUpsert?.customerId ?? null,
      sourceChannel,
      source_channel: sourceChannel,
      sourceLabel,
      source_label: sourceLabel,
      recordType: 'manual_cash_sale',
      storeOnly: true,
      excludedFromSedifexSettlement: true,
      settlementScope: 'store_only_cash',
      customer,
      customerName: customer.name || null,
      customerEmail: customer.email || null,
      customerPhone: customer.phone || null,
      amount: amountMajor,
      amountMinor: Math.round(amountMajor * 100),
      currency,
      itemName: itemName || null,
      productName: productName || null,
      serviceName: serviceName || null,
      data: { itemName: itemName || null, productName: productName || null, serviceName: serviceName || null },
      items: enrichedItems,
      pricingSnapshot: body.pricing_snapshot ?? null,
      marketplaceFees: null,
      paymentProvider: 'cash',
      payment_provider: 'cash',
      paymentMethod,
      payment_method: paymentMethod,
      paymentReference: reference,
      payment_reference: reference,
      paymentStatus,
      payment_status: paymentStatus,
      orderStatus,
      order_status: orderStatus,
      paymentCollectionMode: 'cash',
      payment_collection_mode: 'cash',
      cashCheckout: true,
      cashPayment: { cashConfirmed: false, status: orderStatus, expectedAmount: amountMajor, currency },
      cashConfirmed: false,
      inventoryDeductionStatus: 'pending_cash_confirmation',
      paystackSplit: { enabled: false, reason: 'store_only_cash_checkout' },
      metadata: {
        ...metadata,
        storeId,
        merchantId: storeId,
        clientOrderId,
        sedifexOrderId: reference,
        customerId: customerUpsert?.customerId ?? null,
        sourceChannel,
        sourceLabel,
        paymentMethod,
        paymentCollectionMode: 'cash',
        cashCheckout: true,
        storeOnly: true,
        excludedFromSedifexSettlement: true,
      },
      statusHistory: [{
        status: orderStatus,
        paymentStatus,
        paymentMethod,
        actor: 'customer',
        note: 'Customer selected store-only cash payment on Sedifex Quick Pay.',
        createdAt: new Date().toISOString(),
      }],
      createdAt: now,
      updatedAt: now,
    }

    await defaultDb.collection('stores').doc(storeId).collection('cashOrders').doc(reference).set(record, { merge: true })

    res.status(200).json({
      ok: true,
      cashCheckout: true,
      storeOnly: true,
      collection: `stores/${storeId}/cashOrders`,
      reference,
      payment_reference: reference,
      orderId: reference,
      customerId: customerUpsert?.customerId ?? null,
      customerAutoSaved: Boolean(customerUpsert?.customerId),
      paymentStatus,
      payment_status: paymentStatus,
      orderStatus,
      order_status: orderStatus,
      paymentMethod,
      paymentCollectionMode: 'cash',
      message: 'Store-only cash order created. Store must confirm cash received in Sedifex.',
    })
  } catch (error) {
    functions.logger.error('integrationCashCheckoutCreate failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'cash-checkout-create-failed' })
  }
})
