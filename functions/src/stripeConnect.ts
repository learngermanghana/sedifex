import * as functions from 'firebase-functions/v1'
import * as crypto from 'crypto'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { paidFulfillmentUpdateFields, paymentFailedFulfillmentUpdateFields } from './orderFulfillment'

export const STRIPE_SECRET_KEY = defineString('STRIPE_SECRET_KEY', { default: '' })
export const STRIPE_WEBHOOK_SECRET = defineString('STRIPE_WEBHOOK_SECRET', { default: '' })

const STRIPE_CHECKOUT_CURRENCIES = new Set(['EUR', 'GBP', 'USD'])
const PAYMENT_PROVIDERS = new Set(['paystack', 'stripe', 'manual'])

export type PaymentProvider = 'paystack' | 'stripe' | 'manual'

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

export type StripeConnectCheckoutInput = {
  connectedAccountId: string
  stripeConnectedAccountId?: string
  email?: string
  customerEmail?: string
  amountMinor: number
  currency: string
  reference: string
  successUrl?: string
  callbackUrl?: string
  cancelUrl?: string
  description?: string
  productName?: string
  platformFeeMinor: number
  platformFeePercent: number
  metadata: Record<string, unknown>
}

export function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function getRecord(value: unknown): Record<string, unknown> {
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

export function getPaymentProvider(body: Record<string, unknown>, currency: string): PaymentProvider {
  const paymentRouting = getRecord(body.paymentRouting)
  const provider = clean(
    body.paymentProvider
      ?? body.payment_provider
      ?? body.provider
      ?? paymentRouting.paymentProvider,
    80,
  ).toLowerCase()

  if (PAYMENT_PROVIDERS.has(provider)) return provider as PaymentProvider
  if (STRIPE_CHECKOUT_CURRENCIES.has(clean(currency, 20).toUpperCase())) return 'stripe'
  return 'paystack'
}

export function getStripeConnectedAccount(body: Record<string, unknown>) {
  const paymentRouting = getRecord(body.paymentRouting)
  const splitPayment = getRecord(body.splitPayment)
  return clean(
    body.stripeConnectedAccountId
      ?? body.stripe_connected_account_id
      ?? body.connectedAccountId
      ?? body.connected_account_id
      ?? paymentRouting.stripeConnectedAccountId
      ?? paymentRouting.connectedAccountId
      ?? splitPayment.stripeConnectedAccountId,
    120,
  )
}

export function getPlatformFeePercent(body: Record<string, unknown>) {
  const paymentRouting = getRecord(body.paymentRouting)
  const marketplaceFees = getRecord(body.marketplaceFees ?? body.marketplace_fees)
  const splitPayment = getRecord(body.splitPayment)
  const requested = numberValue(
    body.platformFeePercent
      ?? body.platform_fee_percent
      ?? paymentRouting.platformFeePercent
      ?? marketplaceFees.platformFeePercent
      ?? splitPayment.platformFeePercent,
  )
  const percent = requested ?? 3
  return Math.min(25, Math.max(0, Math.round(percent * 100) / 100))
}

export function calculatePlatformFeeMinor(amountMinor: number, percent: number) {
  return Math.round(amountMinor * percent / 100)
}

function addReturnQuery(url: string, reference: string) {
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

function metadataValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.slice(0, 500)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value).slice(0, 500)
}

function metadataKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)
}

function appendMetadata(params: URLSearchParams, prefix: string, metadata: Record<string, unknown>) {
  Object.entries(metadata).slice(0, 45).forEach(([key, value]) => {
    const safeKey = metadataKey(key)
    if (!safeKey || value === undefined) return
    params.append(`${prefix}[${safeKey}]`, metadataValue(value))
  })
}

export async function initializeStripeConnectCheckout(input: StripeConnectCheckoutInput) {
  const connectedAccountId = input.connectedAccountId || input.stripeConnectedAccountId || ''
  if (!connectedAccountId) throw new Error('Stripe connected account is required')

  const successUrl = addReturnQuery(input.successUrl || input.callbackUrl || '', input.reference)
  const cancelUrl = addReturnQuery(input.cancelUrl || input.callbackUrl || input.successUrl || '', input.reference)
  const customerEmail = input.customerEmail || input.email || ''
  const metadata = {
    ...input.metadata,
    storeId: input.metadata.storeId ?? '',
    merchantId: input.metadata.merchantId ?? input.metadata.storeId ?? '',
    reference: input.reference,
    paymentReference: input.metadata.paymentReference ?? input.reference,
    sedifexOrderId: input.metadata.sedifexOrderId ?? input.reference,
    sourceChannel: input.metadata.sourceChannel ?? '',
    sourceLabel: input.metadata.sourceLabel ?? '',
    paymentProvider: 'stripe',
    stripeConnectedAccountId: connectedAccountId,
    platformFeePercent: input.platformFeePercent,
    platformFeeMinor: input.platformFeeMinor,
  }

  const params = new URLSearchParams()
  params.append('mode', 'payment')
  params.append('line_items[0][price_data][currency]', input.currency.toLowerCase())
  params.append('line_items[0][price_data][unit_amount]', String(input.amountMinor))
  params.append('line_items[0][price_data][product_data][name]', input.productName || input.description || 'Sedifex checkout')
  params.append('line_items[0][quantity]', '1')
  params.append('payment_intent_data[application_fee_amount]', String(input.platformFeeMinor))
  params.append('success_url', successUrl || 'https://sedifex.com/payment/success?provider=stripe')
  params.append('cancel_url', cancelUrl || 'https://sedifex.com/payment/cancel?provider=stripe')
  params.append('client_reference_id', input.reference)
  if (customerEmail) params.append('customer_email', customerEmail)
  appendMetadata(params, 'metadata', metadata)
  appendMetadata(params, 'payment_intent_data[metadata]', metadata)

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecret()}`,
      'Stripe-Account': connectedAccountId,
      'Content-Type': 'application/x-www-form-urlencoded',
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
  if (!timestamp || signatures.length === 0 || !req.rawBody) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${req.rawBody.toString('utf8')}`)
    .digest('hex')

  return signatures.some((signature) => {
    const expectedBuffer = Buffer.from(expected)
    const signatureBuffer = Buffer.from(signature)
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  })
}

function parseStripeEvent(req: functions.https.Request): StripeEvent {
  if (req.rawBody) return JSON.parse(req.rawBody.toString('utf8')) as StripeEvent
  return req.body as StripeEvent
}

function getFulfillmentType(metadata: Record<string, unknown>) {
  const value = clean(metadata.fulfillmentType ?? metadata.fulfillment_type ?? metadata.deliveryMethod ?? metadata.delivery_method, 80).toLowerCase()
  return ['pickup', 'self_pickup', 'collection'].includes(value) ? 'pickup' : 'delivery'
}

function extractEventDetails(event: StripeEvent) {
  const object = getRecord(event.data?.object)
  const metadata = getRecord(object.metadata)
  const reference = clean(
    metadata.reference
      ?? metadata.paymentReference
      ?? metadata.payment_reference
      ?? metadata.sedifexOrderId
      ?? metadata.sedifex_order_id
      ?? object.client_reference_id,
    220,
  )
  const storeId = clean(metadata.storeId ?? metadata.store_id ?? metadata.merchantId ?? metadata.merchant_id, 180)
  const amountMinor = numberValue(object.amount_total ?? object.amount_received ?? object.amount)
  const currency = clean(object.currency, 20).toUpperCase() || clean(metadata.currency, 20).toUpperCase()
  const paymentIntent = clean(object.payment_intent ?? object.id, 220)
  const sessionId = clean(object.object, 80) === 'checkout.session' ? clean(object.id, 220) : ''
  return { object, metadata, reference, storeId, amountMinor, currency, paymentIntent, sessionId }
}

async function updateStripeIntegrationOrder(event: StripeEvent) {
  const evtType = event.type || 'unknown'
  const successEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded'])
  const failureEvents = new Set(['checkout.session.async_payment_failed', 'payment_intent.payment_failed'])
  if (!successEvents.has(evtType) && !failureEvents.has(evtType)) return false

  const { object, metadata, reference, storeId, amountMinor, currency, paymentIntent, sessionId } = extractEventDetails(event)
  if (!reference || !storeId) {
    functions.logger.warn('Stripe event missing integration order identifiers', { evtType, reference, storeId, metadata })
    return false
  }

  const isSuccess = successEvents.has(evtType)
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
    stripeSessionId: sessionId || null,
    stripeCheckoutSessionId: sessionId || null,
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
    orderUpdate.settlementStatus = 'pending_settlement'
    orderUpdate.settlement_status = 'pending_settlement'
    orderUpdate.orderStatus = 'confirmed'
    orderUpdate.order_status = 'confirmed'
    orderUpdate.status = 'confirmed'
    orderUpdate.paymentConfirmedAt = now
    orderUpdate.syncStatus = 'pending'
  } else {
    Object.assign(orderUpdate, paymentFailedFulfillmentUpdateFields(reference, storeId, fulfillmentType))
    orderUpdate.paymentStatus = 'failed'
    orderUpdate.payment_status = 'failed'
    orderUpdate.settlementStatus = 'payment_failed'
    orderUpdate.settlement_status = 'payment_failed'
    orderUpdate.orderStatus = 'payment_failed'
    orderUpdate.order_status = 'payment_failed'
    orderUpdate.status = 'payment_failed'
    orderUpdate.paymentFailedAt = now
  }

  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  refs.set(`integrationOrders/${reference}`, defaultDb.collection('integrationOrders').doc(reference))
  refs.set(`stores/${storeId}/integrationOrders/${reference}`, defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference))

  const identifiers = Array.from(new Set([reference, paymentIntent, sessionId, clean(object.id, 220)].filter(Boolean)))
  const fields = ['reference', 'paymentReference', 'payment_reference', 'sedifexOrderId', 'sedifex_order_id', 'stripeSessionId', 'stripeCheckoutSessionId', 'stripePaymentIntentId']
  for (const field of fields) {
    for (let index = 0; index < identifiers.length; index += 10) {
      const chunk = identifiers.slice(index, index + 10)
      if (chunk.length === 0) continue
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
    paymentStatus: isSuccess ? 'paid' : 'failed',
    matchedCount: refs.size,
    connectedAccountId,
  })

  return true
}

export const stripeWebhook = functions.https.onRequest(async (req, res): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    if (!verifyStripeSignature(req)) {
      res.status(401).send('Invalid signature')
      return
    }

    const event = parseStripeEvent(req)
    await updateStripeIntegrationOrder(event)
    res.status(200).send('ok')
  } catch (err) {
    functions.logger.error('stripeWebhook error', { err })
    res.status(500).send('error')
  }
})

export const stripeConnectWebhook = stripeWebhook
export const createStripeCheckoutSession = initializeStripeConnectCheckout
export const shouldUseStripeForCheckout = (body: Record<string, unknown>, currency: string) => getPaymentProvider(body, currency) === 'stripe'
export const resolveStripeCommissionPercent = getPlatformFeePercent
export const calculateApplicationFeeAmount = calculatePlatformFeeMinor
export async function resolveStripeConnectedAccount(input: { body: Record<string, unknown> }) {
  return getStripeConnectedAccount(input.body)
}
