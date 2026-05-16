import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const PAYSTACK_SECRET_KEY = defineString('PAYSTACK_SECRET_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL', { default: '' })

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
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
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
