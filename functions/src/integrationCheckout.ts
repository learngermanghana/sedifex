import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const PAYSTACK_SECRET_KEY = defineString('PAYSTACK_SECRET_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL', { default: '' })
const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })

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
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getStoreId(body: CheckoutBody) {
  return clean(body.store_id ?? body.merchant_id ?? body.storeId ?? body.merchantId, 180)
}

function getCustomer(body: CheckoutBody) {
  return body.customer && typeof body.customer === 'object' ? (body.customer as Record<string, unknown>) : {}
}

function getAmountMajor(body: CheckoutBody) {
  const direct = numberValue(body.amount)
  if (direct && direct > 0) return direct
  const snapshot = body.pricing_snapshot && typeof body.pricing_snapshot === 'object' ? body.pricing_snapshot as Record<string, unknown> : {}
  const finalTotalMinor = numberValue(snapshot.final_total)
  return finalTotalMinor && finalTotalMinor > 0 ? finalTotalMinor / 100 : null
}

function getSubaccount(body: CheckoutBody) {
  const split = body.splitPayment && typeof body.splitPayment === 'object' ? body.splitPayment as Record<string, unknown> : {}
  const routing = body.paymentRouting && typeof body.paymentRouting === 'object' ? body.paymentRouting as Record<string, unknown> : {}
  return clean(
    body.subaccount ?? body.paystackSubaccountCode ?? body.paystack_subaccount_code ?? split.subaccount ?? routing.paystackSubaccountCode ?? routing.subaccountCode,
    140,
  )
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

async function queryHasMatch(collectionPath: FirebaseFirestore.CollectionReference, field: string, apiKey: string) {
  const snapshot = await collectionPath.where(field, '==', apiKey).limit(1).get()
  return !snapshot.empty
}

function recordContainsKey(record: Record<string, unknown>, apiKey: string) {
  const candidates = [
    record.integrationApiKey,
    record.integrationKey,
    record.integrationToken,
    record.apiKey,
    record.token,
    record.key,
  ]
  return candidates.some(value => clean(value, 1000) === apiKey)
}

async function isAuthorized(req: functions.https.Request, storeId: string) {
  const bearer = clean(req.get('authorization'), 1000).replace(/^Bearer\s+/i, '')
  const apiKey = clean(req.get('x-api-key'), 1000) || bearer
  if (!apiKey) return false

  const master = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() || process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() || ''
  if (master && apiKey === master) return true

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
    functions.logger.warn('integration order status auth lookup failed', { storeId, error })
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
  const status = pickString(record, ['status', 'orderStatus', 'order_status', 'paymentStatus', 'payment_status'], 80) || syncStatus || 'pending'

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
    const storeId = getStoreId(body)
    const customer = getCustomer(body)
    const email = clean(customer.email, 220).toLowerCase()
    const phone = clean(customer.phone, 80)
    const amountMajor = getAmountMajor(body)
    const reference = clean(body.payment_reference ?? body.reference, 220) || clean(body.client_order_id ?? body.clientOrderId, 220) || `${storeId}_${Date.now()}`
    const currency = clean(body.currency, 20) || 'GHS'
    const callbackUrl = clean(body.returnUrl, 700) || APP_BASE_URL.value() || undefined
    const sourceChannel = clean(body.sourceChannel ?? body.source_channel, 80) || 'integration_checkout'
    const sourceLabel = clean(body.sourceLabel ?? body.source_label, 120) || 'Sedifex checkout'
    const subaccount = getSubaccount(body)
    const transactionChargeMinor = getTransactionChargeMinor(body)

    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }
    if (!email) {
      res.status(400).json({ error: 'customer-email-required' })
      return
    }
    if (!amountMajor || amountMajor <= 0) {
      res.status(400).json({ error: 'amount-required' })
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
      customer: { email, phone: phone || null },
      amount: amountMajor,
      amountMinor: Math.round(amountMajor * 100),
      currency,
      items: Array.isArray(body.items) ? body.items : [],
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

    await Promise.all([
      defaultDb.collection('integrationOrders').doc(reference).set(record, { merge: true }),
      defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference).set(record, { merge: true }),
    ])

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
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const refs = [
      defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference),
      defaultDb.collection('integrationOrders').doc(reference),
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
