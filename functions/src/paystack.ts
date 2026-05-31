// functions/src/paystack.ts

import * as functions from 'firebase-functions/v1'
import * as crypto from 'crypto'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { paidFulfillmentUpdateFields, paymentFailedFulfillmentUpdateFields } from './orderFulfillment'

/**
 * Types
 */
type PlanId = string

type PaystackInitResponse = {
  status: boolean
  message?: string
  data?: {
    authorization_url: string
    access_code?: string
    reference: string
  }
}

type PaystackCustomer = {
  id?: number
  email?: string
  first_name?: string | null
  last_name?: string | null
}

type PaystackEventData = {
  reference?: string
  amount?: number
  currency?: string
  status?: string
  paid_at?: string
  channel?: string
  fees?: number
  customer?: PaystackCustomer
  metadata?: Record<string, any>
  plan?: string | null
  subscription?: string | null
}

type PaystackEvent = {
  event: string
  data: PaystackEventData
}

/**
 * Config
 */
const PAYSTACK_SECRET = defineString('PAYSTACK_SECRET_KEY')
const PAYSTACK_PUBLIC = defineString('PAYSTACK_PUBLIC_KEY')
const APP_BASE_URL = defineString('APP_BASE_URL')

const YEARLY_CONTRACT_MONTHS = 12
const YEARLY_PLAN_AMOUNTS_GHS: Record<string, number> = {
  business: 999,
  growth_website: 1999,
}

let paystackConfigLogged = false
function getPaystackConfig() {
  const secret = PAYSTACK_SECRET.value()
  const publicKey = PAYSTACK_PUBLIC.value()
  const appBaseUrl = APP_BASE_URL.value()

  if (!paystackConfigLogged && !secret) {
    functions.logger.warn(
      'Paystack secret not set. Configure PAYSTACK_SECRET_KEY via params (e.g. firebase functions:config:set PAYSTACK_SECRET_KEY="sk_live_xxx")',
    )
    paystackConfigLogged = true
  }

  return { secret, publicKey, appBaseUrl }
}

/**
 * Util: kobo conversion (Paystack expects amounts in kobo)
 */
const toKobo = (amount: number) => Math.round(Math.abs(amount) * 100)

/**
 * Helper: ensure user is authenticated for callables
 */
function assertAuthenticated(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
  }
}

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')


async function findStoreIntegrationOrderRefs(storeId: string, identifiers: string[]) {
  const unique = Array.from(new Set(identifiers.map(value => toTrimmedString(value)).filter(Boolean)))
  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  for (const identifier of unique) {
    const direct = defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(identifier)
    const snap = await direct.get()
    if (snap.exists) refs.set(direct.path, direct)
  }
  const fields = ['booking_id', 'bookingId', 'payment_reference', 'paymentReference', 'reference', 'clientOrderId', 'client_order_id', 'sedifexOrderId', 'sedifex_order_id', 'paystackReference']
  for (const field of fields) {
    for (let index = 0; index < unique.length; index += 10) {
      const chunk = unique.slice(index, index + 10)
      const snap = await defaultDb.collection('stores').doc(storeId).collection('integrationOrders').where(field, 'in', chunk).get()
      snap.docs.forEach(docSnap => refs.set(docSnap.ref.path, docSnap.ref))
    }
  }
  return Array.from(refs.values())
}

function getFulfillmentTypeFromMetadata(metadata: Record<string, any>) {
  const value = toTrimmedString(metadata.fulfillmentType || metadata.fulfillment_type || metadata.deliveryMethod || metadata.delivery_method).toLowerCase()
  return ['pickup', 'self_pickup', 'collection'].includes(value) ? 'pickup' : 'delivery'
}

function isIntegrationCheckoutEvent(data: PaystackEventData) {
  const metadata = data.metadata ?? {}
  const channel = toTrimmedString(metadata.channel)
  return Boolean(
    channel === 'client-website' ||
      toTrimmedString(metadata.sedifexOrderId) ||
      toTrimmedString(metadata.clientOrderId) ||
      toTrimmedString(metadata.orderType),
  )
}

function isDonationEvent(data: PaystackEventData) {
  const metadata = data.metadata ?? {}
  return Boolean(
    toTrimmedString(metadata.pageType) === 'donation' ||
      toTrimmedString(metadata.fundTransactionId) ||
      toTrimmedString(data.reference).startsWith('DON-'),
  )
}

function getContractMonths(metadata: Record<string, any> | null | undefined): number {
  const raw = Number(metadata?.contractMonths)
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.min(36, Math.floor(raw)))
  return YEARLY_CONTRACT_MONTHS
}

function buildContractPeriod(paidAt: string | null | undefined, months: number) {
  const start = paidAt ? new Date(paidAt) : new Date()
  const end = new Date(start)
  end.setMonth(end.getMonth() + months)
  return {
    startTimestamp: admin.firestore.Timestamp.fromDate(start),
    endTimestamp: admin.firestore.Timestamp.fromDate(end),
  }
}

function expectedYearlyAmount(plan: string | null): number | null {
  if (!plan) return null
  return YEARLY_PLAN_AMOUNTS_GHS[plan] ?? null
}

async function updateDonationTransactionFromPaystackEvent(evtType: string, data: PaystackEventData) {
  if (!isDonationEvent(data)) return false

  const metadata = data.metadata ?? {}
  const reference = toTrimmedString(data.reference)
  const storeId = toTrimmedString(metadata.storeId)
  const fundTransactionId = toTrimmedString(metadata.fundTransactionId)
  const isSuccess = evtType === 'charge.success'
  const isFailure = evtType === 'charge.failed'
  if (!reference || (!isSuccess && !isFailure)) return false

  const now = admin.firestore.FieldValue.serverTimestamp()
  const amount = typeof data.amount === 'number' ? data.amount / 100 : null
  const fees = typeof data.fees === 'number' ? data.fees / 100 : null
  const status = isSuccess ? 'captured' : 'failed'

  const updatePayload: Record<string, unknown> = {
    status,
    provider: 'paystack',
    providerReference: reference,
    paymentReference: reference,
    paystackReference: reference,
    providerTransactionId: data.reference ?? null,
    confirmedAmount: amount,
    confirmedAt: isSuccess ? now : null,
    failedAt: isFailure ? now : null,
    updatedAt: now,
    payment: {
      provider: 'paystack',
      status,
      reference,
      amountPaid: isSuccess ? amount : null,
      amount,
      currency: data.currency || 'GHS',
      fees,
      channel: data.channel || null,
      paidAt: data.paid_at || null,
      gatewayRaw: data,
    },
  }

  const matchedRefs = new Map<string, FirebaseFirestore.DocumentReference>()

  if (fundTransactionId) {
    const directRef = defaultDb.collection('fund_transactions').doc(fundTransactionId)
    const directSnap = await directRef.get()
    if (directSnap.exists) matchedRefs.set(directRef.path, directRef)
  }

  const fields = ['reference', 'paymentReference', 'payment.reference']
  for (const field of fields) {
    let snap: FirebaseFirestore.QuerySnapshot
    if (storeId) {
      snap = await defaultDb
        .collection('fund_transactions')
        .where('storeId', '==', storeId)
        .where(field, '==', reference)
        .limit(10)
        .get()
    } else {
      snap = await defaultDb
        .collection('fund_transactions')
        .where(field, '==', reference)
        .limit(10)
        .get()
    }
    snap.docs.forEach(docSnap => matchedRefs.set(docSnap.ref.path, docSnap.ref))
  }

  if (matchedRefs.size === 0) {
    functions.logger.warn('Donation Paystack event had no matching fund transaction', {
      event: evtType,
      storeId,
      reference,
      fundTransactionId,
      metadata,
    })
    return true
  }

  const batch = defaultDb.batch()
  Array.from(matchedRefs.values()).forEach(ref => batch.set(ref, updatePayload, { merge: true }))
  await batch.commit()

  if (isSuccess) {
    for (const ref of matchedRefs.values()) {
      const snap = await ref.get()
      const txData = snap.data() ?? {}
      const donorId = toTrimmedString(txData.donorId)
      if (donorId) {
        await defaultDb.collection('donor_profiles').doc(donorId).set({
          lastDonationAmount: amount,
          lastDonationCurrency: data.currency || 'GHS',
          lastDonationReference: reference,
          lastDonationStatus: 'captured',
          lastDonationAt: now,
          updatedAt: now,
        }, { merge: true })
      }
    }
  }

  functions.logger.info('Donation Paystack status updated', {
    event: evtType,
    storeId,
    reference,
    matchedCount: matchedRefs.size,
    status,
  })

  return true
}

async function updateIntegrationOrderFromPaystackEvent(evtType: string, data: PaystackEventData) {
  if (!isIntegrationCheckoutEvent(data)) return false

  const metadata = data.metadata ?? {}
  const storeId = toTrimmedString(metadata.storeId)
  const reference = toTrimmedString(data.reference)
  if (!storeId || !reference) {
    functions.logger.warn('Integration Paystack event missing storeId/reference', {
      event: evtType,
      storeId,
      reference,
      metadata,
    })
    return false
  }

  const isSuccess = evtType === 'charge.success'
  const isFailure = evtType === 'charge.failed'
  if (!isSuccess && !isFailure) return false

  const amount = typeof data.amount === 'number' ? data.amount / 100 : null
  const fees = typeof data.fees === 'number' ? data.fees / 100 : null
  const now = admin.firestore.FieldValue.serverTimestamp()
  const fulfillmentType = getFulfillmentTypeFromMetadata(metadata)
  const orderRef = defaultDb
    .collection('stores')
    .doc(storeId)
    .collection('integrationOrders')
    .doc(reference)

  const orderUpdate: Record<string, unknown> = {
    provider: 'paystack',
    paymentProvider: 'paystack',
    paymentReference: reference,
    paystackReference: reference,
    paystackStatus: data.status ?? null,
    paystackChannel: data.channel ?? null,
    paystackFees: fees,
    customerEmail: data.customer?.email ?? null,
    lastPaymentEvent: evtType,
    lastPaymentMetadata: metadata,
    paymentUpdatedAt: now,
    updatedAt: now,
  }

  if (amount !== null) {
    orderUpdate.amountPaid = amount
  }

  if (isSuccess) {
    Object.assign(orderUpdate, paidFulfillmentUpdateFields(reference, storeId, fulfillmentType))
    orderUpdate.paymentStatus = 'paid'
    orderUpdate.payment_status = 'paid'
    orderUpdate.paidAt = data.paid_at ?? null
    orderUpdate.paymentConfirmedAt = now
    orderUpdate.syncStatus = 'pending'
    orderUpdate.syncRequestedAt = now
  } else {
    Object.assign(orderUpdate, paymentFailedFulfillmentUpdateFields(reference, storeId, fulfillmentType))
    orderUpdate.paymentStatus = 'failed'
    orderUpdate.payment_status = 'failed'
    orderUpdate.paymentFailedAt = now
  }

  const initialIdentifiers = [
    reference,
    toTrimmedString(data.reference),
    toTrimmedString(metadata.reference),
    toTrimmedString(metadata.paymentReference),
    toTrimmedString(metadata.payment_reference),
    toTrimmedString(metadata.clientOrderId),
    toTrimmedString(metadata.client_order_id),
    toTrimmedString(metadata.sedifexOrderId),
    toTrimmedString(metadata.sedifex_order_id),
    toTrimmedString(metadata.paystackReference),
    toTrimmedString(metadata.bookingId),
    toTrimmedString(metadata.booking_id),
  ]
  const storeOrderRefs = await findStoreIntegrationOrderRefs(storeId, initialIdentifiers)
  if (storeOrderRefs.length) {
    for (let index = 0; index < storeOrderRefs.length; index += 450) {
      const batch = defaultDb.batch()
      storeOrderRefs.slice(index, index + 450).forEach(ref => batch.set(ref, orderUpdate, { merge: true }))
      await batch.commit()
    }
  } else {
    await orderRef.set(orderUpdate, { merge: true })
  }

  const orderSnap = await orderRef.get()
  const orderData = (orderSnap.data() ?? {}) as Record<string, unknown>

  const candidateIdentifiers = [
    reference,
    toTrimmedString(data.reference),
    toTrimmedString(metadata.reference),
    toTrimmedString(metadata.paymentReference),
    toTrimmedString(metadata.payment_reference),
    toTrimmedString(metadata.clientOrderId),
    toTrimmedString(metadata.client_order_id),
    toTrimmedString(metadata.sedifexOrderId),
    toTrimmedString(metadata.sedifex_order_id),
    toTrimmedString(metadata.paystackReference),
    toTrimmedString(orderData.reference),
    toTrimmedString(orderData.clientOrderId),
    toTrimmedString(orderData.client_order_id),
    toTrimmedString(orderData.sedifexOrderId),
    toTrimmedString(orderData.sedifex_order_id),
    toTrimmedString(orderData.paymentReference),
    toTrimmedString(orderData.payment_reference),
    toTrimmedString(orderData.paystackReference),
    toTrimmedString(metadata.bookingId),
    toTrimmedString(metadata.booking_id),
    toTrimmedString(orderData.bookingId),
    toTrimmedString(orderData.booking_id),
  ].filter(Boolean)
  const identifiers = Array.from(new Set(candidateIdentifiers))
  const fieldsToMatch = [
    'reference',
    'paymentReference',
    'payment_reference',
    'clientOrderId',
    'client_order_id',
    'sedifexOrderId',
    'sedifex_order_id',
    'paystackReference',
    'bookingId',
    'booking_id',
  ]

  const topLevelMatched = new Map<string, FirebaseFirestore.DocumentReference>()
  for (const field of fieldsToMatch) {
    for (let i = 0; i < identifiers.length; i += 10) {
      const chunk = identifiers.slice(i, i + 10)
      if (!chunk.length) continue
      const snap = await defaultDb
        .collection('integrationOrders')
        .where(field, 'in', chunk)
        .get()
      snap.docs.forEach((doc) => {
        const docData = doc.data() as Record<string, unknown>
        const docStoreId = toTrimmedString(docData.storeId)
        const docMerchantId = toTrimmedString(docData.merchantId)
        if (
          !docStoreId ||
          !docMerchantId ||
          docStoreId === storeId ||
          docMerchantId === storeId
        ) {
          topLevelMatched.set(doc.ref.path, doc.ref)
        }
      })
    }
  }

  if (topLevelMatched.size > 0) {
    const topLevelUpdate: Record<string, unknown> = {
      provider: 'paystack',
      paymentProvider: 'paystack',
      paymentReference: reference,
      payment_reference: reference,
      paystackReference: reference,
      paystackStatus: data.status ?? (isSuccess ? 'success' : 'failed'),
      lastPaymentEvent: evtType,
      lastPaymentMetadata: metadata,
      paymentUpdatedAt: now,
      updatedAt: now,
    }

    if (isSuccess) {
      Object.assign(topLevelUpdate, paidFulfillmentUpdateFields(reference, storeId, fulfillmentType))
      topLevelUpdate.paymentStatus = 'paid'
      topLevelUpdate.payment_status = 'paid'
      topLevelUpdate.paystackChannel = data.channel ?? null
      topLevelUpdate.paystackFees = fees
      topLevelUpdate.amountPaid = amount
      topLevelUpdate.customerEmail = data.customer?.email ?? null
      topLevelUpdate.paymentConfirmedAt = now
      topLevelUpdate.syncStatus = 'pending'
      topLevelUpdate.syncRequestedAt = now
    } else {
      Object.assign(topLevelUpdate, paymentFailedFulfillmentUpdateFields(reference, storeId, fulfillmentType))
      topLevelUpdate.paymentStatus = 'failed'
      topLevelUpdate.payment_status = 'failed'
      topLevelUpdate.paymentFailedAt = now
    }

    const matchedRefs = Array.from(topLevelMatched.values())
    for (let i = 0; i < matchedRefs.length; i += 450) {
      const batch = defaultDb.batch()
      matchedRefs.slice(i, i + 450).forEach((docRef) => {
        batch.set(docRef, topLevelUpdate, { merge: true })
      })
      await batch.commit()
    }
  }

  functions.logger.info('Mirrored Paystack integration payment status to top-level integrationOrders', {
    storeId,
    reference,
    matchedCount: topLevelMatched.size,
    paymentStatus: isSuccess ? 'paid' : 'failed',
  })

  const bookingId = toTrimmedString(orderData.bookingId) || toTrimmedString(metadata.bookingId)

  if (bookingId) {
    const bookingUpdate: Record<string, unknown> = {
      paymentReference: reference,
      payment_reference: reference,
      sedifexOrderId: toTrimmedString(metadata.sedifexOrderId) || orderData.sedifexOrderId || null,
      clientOrderId: toTrimmedString(metadata.clientOrderId) || orderData.clientOrderId || null,
      paymentUpdatedAt: now,
      updatedAt: now,
    }

    if (isSuccess) {
      bookingUpdate.paymentStatus = 'paid'
      bookingUpdate.payment_status = 'paid'
      bookingUpdate.paymentConfirmedAt = now
    } else {
      bookingUpdate.paymentStatus = 'failed'
      bookingUpdate.payment_status = 'failed'
      bookingUpdate.paymentFailedAt = now
    }

    await defaultDb
      .collection('stores')
      .doc(storeId)
      .collection('integrationBookings')
      .doc(bookingId)
      .set(bookingUpdate, { merge: true })
  }

  await defaultDb
    .collection('stores')
    .doc(storeId)
    .collection('integrationPaymentEvents')
    .doc(`${reference}_${Date.now()}`)
    .set({
      event: evtType,
      reference,
      data,
      receivedAt: now,
    })

  functions.logger.info('Integration order Paystack status updated', {
    event: evtType,
    storeId,
    reference,
    paymentStatus: isSuccess ? 'paid' : 'failed',
    bookingId: bookingId || null,
  })

  return true
}

async function recordPaystackEvent(
  storeId: string,
  evtType: string,
  data: PaystackEventData,
) {
  try {
    await defaultDb
      .collection('subscriptions')
      .doc(storeId)
      .collection('events')
      .doc(String(Date.now()))
      .set({
        event: evtType,
        data,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
  } catch (e) {
    functions.logger.warn('Failed to store Paystack audit event', {
      e,
      evtType,
      storeId,
    })
  }
}

/**
 * Callable: initialize a Paystack checkout session
 *
 * Expected data:
 * {
 *   email: string,
 *   storeId: string,
 *   amount: number,
 *   plan?: string,
 *   planId?: string,
 *   redirectUrl?: string,
 *   metadata?: Record<string, any>
 * }
 */
export const createCheckout = functions.https.onCall(async (data, context) => {
  assertAuthenticated(context)

  const { secret: paystackSecret, publicKey: paystackPublicKey, appBaseUrl } =
    getPaystackConfig()

  if (!paystackSecret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Paystack secret is not configured',
    )
  }

  const email =
    typeof data?.email === 'string' ? data.email.trim().toLowerCase() : ''
  const storeId =
    typeof data?.storeId === 'string' ? data.storeId.trim() : ''

  const rawPlan =
    (typeof data?.plan === 'string' ? data.plan.trim() : '') ||
    (typeof data?.planId === 'string' ? data.planId.trim() : '')
  const plan: PlanId | null = rawPlan || null

  const redirectUrlRaw =
    typeof data?.redirectUrl === 'string' ? data.redirectUrl.trim() : ''
  const redirectUrl =
    redirectUrlRaw || (appBaseUrl ? `${appBaseUrl}/billing/verify` : undefined)

  const metadataIn =
    data?.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, any>)
      : {}

  const requestedAmount = Number(data?.amount)
  const configuredAmount = expectedYearlyAmount(plan)
  const amount = configuredAmount ?? requestedAmount
  const contractMonths = getContractMonths(metadataIn)

  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid email is required')
  }
  if (!storeId) {
    throw new functions.https.HttpsError('invalid-argument', 'storeId is required')
  }
  if (!plan || !configuredAmount) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Choose Business or Growth Website for yearly Paystack checkout.',
    )
  }
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Amount must be greater than zero',
    )
  }
  if (Math.round(requestedAmount) !== Math.round(configuredAmount)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid amount for ${plan}. Expected GHS ${configuredAmount}.`,
    )
  }

  const reference = `${storeId}_${Date.now()}`

  const payload = {
    email,
    amount: toKobo(amount),
    reference,
    callback_url: redirectUrl,
    metadata: {
      storeId,
      plan: plan,
      billingCadence: 'yearly',
      contractMonths,
      yearlyAmountGhs: amount,
      createdBy: context.auth!.uid,
      ...metadataIn,
    },
  }

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = (await resp.json()) as PaystackInitResponse

  if (!json?.status) {
    throw new functions.https.HttpsError(
      'internal',
      json?.message || 'Paystack init failed',
    )
  }

  const { authorization_url: authUrl } = json.data ?? {}

  try {
    await defaultDb
      .collection('subscriptions')
      .doc(storeId)
      .set(
        {
          provider: 'paystack',
          status: 'pending',
          plan,
          reference,
          amount,
          yearlyAmountGhs: amount,
          billingCadence: 'yearly',
          contractMonths,
          email,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: context.auth!.uid,
        },
        { merge: true },
      )
  } catch (e) {
    functions.logger.warn('Failed to write pending subscription doc', { e, storeId })
  }

  return {
    ok: true,
    authorizationUrl: authUrl,
    reference,
    publicKey: paystackPublicKey || null,
  }
})

/**
 * Callable: check if signup/workspace is unlocked after Paystack payment
 *
 * Reads subscriptions/<storeId> and returns whether status === 'active'
 */
export const checkSignupUnlock = functions.https.onCall(async (data, context) => {
  assertAuthenticated(context)

  const storeId =
    typeof data?.storeId === 'string' ? data.storeId.trim() : ''
  if (!storeId) {
    throw new functions.https.HttpsError('invalid-argument', 'storeId is required')
  }

  const subRef = defaultDb.collection('subscriptions').doc(storeId)
  const snap = await subRef.get()

  if (!snap.exists) {
    return {
      ok: true,
      unlocked: false,
      status: 'pending' as const,
    }
  }

  const sub = snap.data() as any
  const status = typeof sub.status === 'string'
    ? sub.status.toLowerCase()
    : 'pending'
  const unlocked = status === 'active'

  return {
    ok: true,
    unlocked,
    status,
    plan: sub.plan ?? null,
    provider: sub.provider ?? 'paystack',
    reference: sub.reference ?? null,
    lastEvent: sub.lastEvent ?? null,
  }
})

/**
 * HTTP Webhook: Paystack event receiver (authoritative status)
 *
 * Verifies x-paystack-signature using HMAC SHA512.
 */
export const paystackWebhook = functions.https.onRequest(
  async (req, res): Promise<void> => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed')
        return
      }

      const signature = req.get('x-paystack-signature') || ''
      const { secret } = getPaystackConfig()
      if (!secret) {
        res.status(500).send('Paystack secret not configured')
        return
      }

      const computed = crypto
        .createHmac('sha512', secret)
        .update(req.rawBody)
        .digest('hex')

      const safeEqual =
        signature.length === computed.length &&
        crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(computed),
        )

      if (!safeEqual) {
        res.status(401).send('Invalid signature')
        return
      }

      const event = req.body as PaystackEvent
      const evtType = event?.event || 'unknown'
      const data = event?.data || {}

      functions.logger.info('Paystack webhook received', {
        event: evtType,
        reference: data.reference,
        email: data.customer?.email,
        amount: data.amount,
        metadata: data.metadata,
      })

      switch (evtType) {
        case 'charge.success': {
          const donationHandled = await updateDonationTransactionFromPaystackEvent(evtType, data)
          if (donationHandled) break

          const integrationOrderHandled = await updateIntegrationOrderFromPaystackEvent(evtType, data)
          if (integrationOrderHandled) break

          const storeId: string | undefined = data.metadata?.storeId
          if (!storeId) break

          const rawPlan: string | undefined =
            data.metadata?.plan || data.plan || undefined
          const plan: PlanId | null = rawPlan || null
          const email = data.customer?.email || null
          const amount =
            typeof data.amount === 'number' ? data.amount / 100 : null
          const paidAt = data.paid_at || null
          const reference = data.reference || null
          const fees = typeof data.fees === 'number' ? data.fees / 100 : null
          const metadata = data.metadata || null
          const contractMonths = getContractMonths(metadata)
          const period = buildContractPeriod(paidAt, contractMonths)
          const posChannel =
            data.channel ||
            (typeof data.metadata?.channel === 'string'
              ? data.metadata.channel
              : null)

          await defaultDb
            .collection('subscriptions')
            .doc(storeId)
            .set(
              {
                provider: 'paystack',
                status: 'active',
                plan,
                customerEmail: email,
                reference,
                amount,
                yearlyAmountGhs: amount,
                billingCadence: 'yearly',
                contractMonths,
                currentPeriodStart: period.startTimestamp,
                currentPeriodEnd: period.endTimestamp,
                lastPaymentAt: paidAt ? admin.firestore.Timestamp.fromDate(new Date(paidAt)) : period.startTimestamp,
                currency: data.currency || 'GHS',
                channel: data.channel || null,
                posChannel,
                fees,
                metadata,
                paidAt,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastEvent: evtType,
              },
              { merge: true },
            )

          await defaultDb
            .collection('stores')
            .doc(storeId)
            .set(
              {
                contractStatus: 'active',
                billingPlan: plan,
                paymentProvider: 'paystack',
                billing: {
                  status: 'active',
                  planKey: plan,
                  provider: 'paystack',
                  cadence: 'yearly',
                  contractMonths,
                  currentPeriodStart: period.startTimestamp,
                  currentPeriodEnd: period.endTimestamp,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            )

          await recordPaystackEvent(storeId, evtType, data)
          break
        }

        case 'charge.failed': {
          const donationHandled = await updateDonationTransactionFromPaystackEvent(evtType, data)
          if (donationHandled) break

          const integrationOrderHandled = await updateIntegrationOrderFromPaystackEvent(evtType, data)
          if (integrationOrderHandled) break

          const storeId: string | undefined = data.metadata?.storeId
          const reference = data.reference || null
          const fees = typeof data.fees === 'number' ? data.fees / 100 : null

          if (storeId) {
            await defaultDb
              .collection('subscriptions')
              .doc(storeId)
              .set(
                {
                  provider: 'paystack',
                  status: 'failed',
                  plan: (data.metadata?.plan as PlanId | undefined) ?? null,
                  reference,
                  fees,
                  channel: data.channel || null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  lastEvent: evtType,
                },
                { merge: true },
              )

            await recordPaystackEvent(storeId, evtType, data)
          }
          break
        }

        default: {
          const storeId: string | undefined = data.metadata?.storeId
          if (storeId) {
            await recordPaystackEvent(storeId, evtType, data)
          }
          break
        }
      }

      res.status(200).send('ok')
    } catch (err) {
      functions.logger.error('paystackWebhook error', { err })
      res.status(500).send('error')
    }
  },
)

export const handlePaystackWebhook = paystackWebhook
export const createPaystackCheckout = createCheckout