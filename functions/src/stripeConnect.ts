import * as functions from 'firebase-functions/v1'
import * as crypto from 'crypto'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { paidFulfillmentUpdateFields, paymentFailedFulfillmentUpdateFields } from './orderFulfillment'

const STRIPE_SECRET_KEY = defineString('STRIPE_SECRET_KEY', { default: '' })
const STRIPE_WEBHOOK_SECRET = defineString('STRIPE_WEBHOOK_SECRET', { default: '' })
const DEFAULT_STRIPE_COMMISSION_PERCENT = defineString('SEDIFEX_DEFAULT_STRIPE_COMMISSION_PERCENT', {
  default: '3',
})

export const STRIPE_SUPPORTED_CHECKOUT_CURRENCIES = new Set(['EUR', 'GBP', 'USD'])

export type StripeCheckoutSessionResponse = {
  id?: string
  object?: string
  url?: string | null
  payment_intent?: string | null
  payment_status?: string | null
  status?: string | null
  client_reference_id?: string | null
  amount_total?: number | null
  currency?: string | null
  metadata?: Record<string, string>
  error?: { message?: string }
}

type StripeEvent = {
  id?: string
  type?: string
  account?: string
  data?: { object?: Record<string, unknown> }
}

type StripeRoutingInput = {
  storeId: string
  body: Record<string, unknown>
}

type StripeSessionInput = {
  connectedAccountId: string
  email: string
  amountMinor: number
  currency: string
  reference: string
  callbackUrl?: string
  cancelUrl?: string
  description: string
  applicationFeeAmount: number
  metadata: Record<string, unknown>
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getStripeSecret() {
  const key = STRIPE_SECRET_KEY.value()?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || ''
  if (!key) throw new Error('Stripe secret is not configured')
  return key
}

function getWebhookSecret() {
  return STRIPE_WEBHOOK_SECRET.value()?.trim() || process.env.STRIPE_WEBHOOK_SECRET?.trim() || ''
}

export function shouldUseStripeForCheckout(body: Record<string, unknown>, currency: string) {
  const routing = getRecord(body.paymentRouting)
  const provider = clean(
    body.paymentProvider
      ?? body.payment_provider
      ?? body.provider
      ?? routing.paymentProvider
      ?? routing.payment_provider
      ?? routing.provider,
    80,
  ).toLowerCase()
  const normalizedCurrency = currency.toUpperCase()
  const isStripeCurrency = STRIPE_SUPPORTED_CHECKOUT_CURRENCIES.has(normalizedCurrency)

  if (provider === 'paystack') return false
  if (provider === 'stripe' || provider === 'stripe_connect') return isStripeCurrency
  return isStripeCurrency
}

export function resolveStripeCommissionPercent(body: Record<string, unknown>) {
  const routing = getRecord(body.paymentRouting)
  const split = getRecord(body.splitPayment)
  const configured = numberValue(
    body.stripeCommissionPercent
      ?? body.commissionPercent
      ?? routing.stripeCommissionPercent
      ?? routing.commissionPercent
      ?? split.commissionPercent,
  )
  const raw = configured ?? numberValue(DEFAULT_STRIPE_COMMISSION_PERCENT.value() || process.env.SEDIFEX_DEFAULT_STRIPE_COMMISSION_PERCENT) ?? 3
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) throw new Error('Stripe commission percent must be between 0 and 100')
  return Math.round(raw * 100) / 100
}

export function calculateApplicationFeeAmount(amountMinor: number, commissionPercent: number) {
  return Math.max(0, Math.round(amountMinor * (commissionPercent / 100)))
}

export async function resolveStripeConnectedAccount(input: StripeRoutingInput) {
  const routing = getRecord(input.body.paymentRouting)
  const split = getRecord(input.body.splitPayment)
  const direct = clean(
    input.body.stripeAccountId
      ?? input.body.stripe_account_id
      ?? input.body.connectedAccountId
      ?? input.body.connected_account_id
      ?? input.body.stripeConnectedAccountId
      ?? input.body.stripe_connected_account_id
      ?? routing.stripeAccountId
      ?? routing.stripe_account_id
      ?? routing.connectedAccountId
      ?? routing.connected_account_id
      ?? routing.stripeConnectedAccountId
      ?? routing.stripe_connected_account_id
      ?? split.stripeAccountId
      ?? split.connectedAccountId,
    120,
  )
  if (direct) return direct

  const storeSnap = await defaultDb.collection('stores').doc(input.storeId).get()
  const store = (storeSnap.data() ?? {}) as Record<string, unknown>
  const storeRouting = getRecord(store.paymentRouting)
  const stripeRouting = getRecord(store.stripeConnect ?? store.stripe ?? store.stripe_connect)

  return clean(
    storeRouting.stripeAccountId
      ?? storeRouting.stripe_account_id
      ?? storeRouting.connectedAccountId
      ?? storeRouting.connected_account_id
      ?? storeRouting.stripeConnectedAccountId
      ?? storeRouting.stripe_connected_account_id
      ?? stripeRouting.accountId
      ?? stripeRouting.account_id
      ?? stripeRouting.connectedAccountId
      ?? stripeRouting.connected_account_id
      ?? store.stripeAccountId
      ?? store.stripe_account_id
      ?? store.stripeConnectedAccountId
      ?? store.stripe_connected_account_id,
    120,
  )
}

function appendReturnQuery(url: string, reference: string) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('reference')) parsed.searchParams.set('reference', reference)
    if (!parsed.searchParams.has('provider')) parsed.searchParams.set('provider', 'stripe')
    return parsed.toString()
  } catch {
    return url
  }
}

function stripeMetadataValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.slice(0, 500)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value).slice(0, 500)
}

function stripeMetadataKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)
}

function addMetadata(params: URLSearchParams, prefix: string, metadata: Record<string, unknown>) {
  Object.entries(metadata).slice(0, 45).forEach(([key, value]) => {
    const safeKey = stripeMetadataKey(key)
    if (!safeKey || value === undefined) return
    params.append(`${prefix}[${safeKey}]`, stripeMetadataValue(value))
  })
}

export async function createStripeCheckoutSession(input: StripeSessionInput) {
  const successUrl = appendReturnQuery(input.callbackUrl || '', input.reference)
  const cancelUrl = appendReturnQuery(input.cancelUrl || input.callbackUrl || '', input.reference)
  const metadata = {
    ...input.metadata,
    paymentProvider: 'stripe',
    payment_provider: 'stripe',
    stripeConnectedAccountId: input.connectedAccountId,
    applicationFeeAmount: input.applicationFeeAmount,
  }

  const params = new URLSearchParams()
  params.append('mode', 'payment')
  params.append('success_url', successUrl || 'https://sedifex.com/payment/success?provider=stripe')
  params.append('cancel_url', cancelUrl || 'https://sedifex.com/payment/cancel?provider=stripe')
  params.append('customer_email', input.email)
  params.append('client_reference_id', input.reference)
  params.append('line_items[0][quantity]', '1')
  params.append('line_items[0][price_data][currency]', input.currency.toLowerCase())
  params.append('line_items[0][price_data][unit_amount]', String(input.amountMinor))
  params.append('line_items[0][price_data][product_data][name]', input.description || 'Sedifex checkout')
  params.append('payment_intent_data[application_fee_amount]', String(input.applicationFeeAmount))
  params.append('payment_intent_data[metadata][reference]', input.reference)
  params.append('payment_intent_data[metadata][paymentProvider]', 'stripe')
  params.append('payment_intent_data[metadata][payment_provider]', 'stripe')
  addMetadata(params, 'metadata', metadata)
  addMetadata(params, 'payment_intent_data[metadata]', metadata)

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': input.connectedAccountId,
    },
    body: params.toString(),
  })
  const json = await response.json().catch(() => null) as StripeCheckoutSessionResponse | null
  if (!response.ok) throw new Error(json?.error?.message || `Stripe checkout session failed (${response.status})`)
  return json ?? {}
}

function verifyStripeSignature(req: functions.https.Request) {
  const secret = getWebhookSecret()
  if (!secret) throw new Error('Stripe webhook secret is not configured')
  const header = req.get('stripe-signature') || ''
  const timestamp = header.split(',').map(part => part.trim()).find(part => part.startsWith('t='))?.slice(2) || ''
  const signatures = header.split(',').map(part => part.trim()).filter(part => part.startsWith('v1=')).map(part => part.slice(3))
  if (!timestamp || signatures.length === 0) return false
  const signedPayload = `${timestamp}.${req.rawBody.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return signatures.some((signature) => signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
}

function getFulfillmentType(metadata: Record<string, unknown>) {
  const value = clean(metadata.fulfillmentType ?? metadata.fulfillment_type ?? metadata.deliveryMethod ?? metadata.delivery_method, 80).toLowerCase()
  return ['pickup', 'self_pickup', 'collection'].includes(value) ? 'pickup' : 'delivery'
}

function extractEventDetails(event: StripeEvent) {
  const object = getRecord(event.data?.object)
  const metadata = getRecord(object.metadata)
  const reference = clean(
    object.client_reference_id
      ?? metadata.reference
      ?? metadata.paymentReference
      ?? metadata.payment_reference
      ?? metadata.clientOrderId
      ?? metadata.sedifexOrderId,
    220,
  )
  const storeId = clean(metadata.storeId ?? metadata.merchantId, 180)
  const amountMinor = numberValue(object.amount_total ?? object.amount_received ?? object.amount)
  const currency = clean(object.currency, 20).toUpperCase() || clean(metadata.currency, 20).toUpperCase()
  const paymentIntent = clean(object.payment_intent ?? object.id, 220)
  return { object, metadata, reference, storeId, amountMinor, currency, paymentIntent }
}

async function updateStripeIntegrationOrder(event: StripeEvent) {
  const evtType = event.type || 'unknown'
  if (!['checkout.session.completed', 'payment_intent.succeeded', 'payment_intent.payment_failed'].includes(evtType)) return false

  const { object, metadata, reference, storeId, amountMinor, currency, paymentIntent } = extractEventDetails(event)
  if (!reference || !storeId) {
    functions.logger.warn('Stripe event missing integration order identifiers', { evtType, reference, storeId, metadata })
    return false
  }

  const isSuccess = evtType === 'checkout.session.completed' || evtType === 'payment_intent.succeeded'
  const isFailure = evtType === 'payment_intent.payment_failed'
  const now = admin.firestore.FieldValue.serverTimestamp()
  const fulfillmentType = getFulfillmentType(metadata)
  const amountPaid = amountMinor !== null ? amountMinor / 100 : null
  const connectedAccountId = event.account || clean(metadata.stripeConnectedAccountId ?? metadata.connectedAccountId, 120) || null
  const orderUpdate: Record<string, unknown> = {
    provider: 'stripe',
    paymentProvider: 'stripe',
    payment_provider: 'stripe',
    paymentReference: reference,
    payment_reference: reference,
    stripeCheckoutSessionId: evtType === 'checkout.session.completed' ? clean(object.id, 220) || null : null,
    stripePaymentIntentId: paymentIntent || null,
    stripeConnectedAccountId: connectedAccountId,
    stripeStatus: clean(object.status, 80) || null,
    lastPaymentEvent: evtType,
    lastPaymentMetadata: metadata,
    paymentUpdatedAt: now,
    updatedAt: now,
  }

  if (amountPaid !== null) orderUpdate.amountPaid = amountPaid
  if (currency) orderUpdate.currency = currency

  if (isSuccess) {
    Object.assign(orderUpdate, paidFulfillmentUpdateFields(reference, storeId, fulfillmentType))
    orderUpdate.paymentStatus = 'paid'
    orderUpdate.payment_status = 'paid'
    orderUpdate.paidAt = clean(object.created, 80) || null
    orderUpdate.paymentConfirmedAt = now
    orderUpdate.syncStatus = 'pending'
    orderUpdate.syncRequestedAt = now
  } else if (isFailure) {
    Object.assign(orderUpdate, paymentFailedFulfillmentUpdateFields(reference, storeId, fulfillmentType))
    orderUpdate.paymentStatus = 'failed'
    orderUpdate.payment_status = 'failed'
    orderUpdate.paymentFailedAt = now
  }

  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  refs.set(`stores/${storeId}/integrationOrders/${reference}`, defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference))
  refs.set(`integrationOrders/${reference}`, defaultDb.collection('integrationOrders').doc(reference))

  const fields = ['reference', 'paymentReference', 'payment_reference', 'clientOrderId', 'client_order_id', 'sedifexOrderId', 'sedifex_order_id', 'stripeCheckoutSessionId', 'stripePaymentIntentId']
  const identifiers = Array.from(new Set([reference, paymentIntent, clean(object.id, 220)].filter(Boolean)))
  for (const field of fields) {
    for (let index = 0; index < identifiers.length; index += 10) {
      const chunk = identifiers.slice(index, index + 10)
      if (!chunk.length) continue
      const snap = await defaultDb.collection('integrationOrders').where(field, 'in', chunk).get()
      snap.docs.forEach(doc => refs.set(doc.ref.path, doc.ref))
    }
  }

  const batch = defaultDb.batch()
  refs.forEach(ref => batch.set(ref, orderUpdate, { merge: true }))
  batch.set(defaultDb.collection('stores').doc(storeId).collection('integrationPaymentEvents').doc(`${reference}_${Date.now()}`), {
    event: evtType,
    reference,
    provider: 'stripe',
    connectedAccountId,
    data: object,
    receivedAt: now,
  })
  await batch.commit()

  functions.logger.info('Stripe integration payment status updated', {
    event: evtType,
    storeId,
    reference,
    paymentStatus: isSuccess ? 'paid' : isFailure ? 'failed' : 'pending',
    matchedCount: refs.size,
    connectedAccountId,
  })

  return true
}

export const stripeConnectWebhook = functions.https.onRequest(async (req, res): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    if (!verifyStripeSignature(req)) {
      res.status(401).send('Invalid signature')
      return
    }

    const event = req.body as StripeEvent
    await updateStripeIntegrationOrder(event)
    res.status(200).send('ok')
  } catch (err) {
    functions.logger.error('stripeConnectWebhook error', { err })
    res.status(500).send('error')
  }
})
