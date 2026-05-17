import * as functions from 'firebase-functions/v1'
import * as crypto from 'crypto'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { paystackWebhook } from './paystack'

const PAYSTACK_SECRET = defineString('PAYSTACK_SECRET_KEY')

type PaystackEventData = {
  reference?: string
  amount?: number
  currency?: string
  status?: string
  paid_at?: string
  channel?: string
  fees?: number
  customer?: { email?: string; phone?: string }
  metadata?: Record<string, unknown>
}

type PaystackEvent = {
  event?: string
  data?: PaystackEventData
}

type MerchantOrder = {
  merchantId?: string
  storeId?: string
  childReference?: string
  reference?: string
}

function verifySignature(req: functions.https.Request) {
  const secret = PAYSTACK_SECRET.value()?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || ''
  const signature = req.get('x-paystack-signature') || ''
  if (!secret || !signature) return false
  const computed = crypto.createHmac('sha512', secret).update(req.rawBody).digest('hex')
  return signature.length === computed.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))
}

function isMarketplaceMasterReference(reference: string) {
  return reference.startsWith('market_')
}

function buildPaymentUpdate(evtType: string, data: PaystackEventData) {
  const now = admin.firestore.FieldValue.serverTimestamp()
  const success = evtType === 'charge.success' || data.status === 'success'
  const failed = evtType === 'charge.failed' || ['failed', 'abandoned'].includes(String(data.status ?? '').toLowerCase())
  const amountPaid = typeof data.amount === 'number' ? data.amount / 100 : null
  const fees = typeof data.fees === 'number' ? data.fees / 100 : null

  const base: Record<string, unknown> = {
    provider: 'paystack',
    paymentProvider: 'paystack',
    paystackStatus: data.status ?? null,
    paystackChannel: data.channel ?? null,
    paystackFees: fees,
    amountPaid,
    customerEmail: data.customer?.email ?? null,
    lastPaymentEvent: evtType,
    lastPaymentMetadata: data.metadata ?? null,
    paymentUpdatedAt: now,
    updatedAt: now,
  }

  if (success) {
    return {
      ...base,
      paymentStatus: 'success',
      payment_status: 'success',
      orderStatus: 'confirmed',
      order_status: 'confirmed',
      status: 'confirmed',
      paidAt: data.paid_at ?? null,
      paymentConfirmedAt: now,
      syncStatus: 'pending',
      syncRequestedAt: now,
    }
  }

  if (failed) {
    return {
      ...base,
      paymentStatus: 'failed',
      payment_status: 'failed',
      orderStatus: 'payment_failed',
      order_status: 'payment_failed',
      status: 'payment_failed',
      paymentFailedAt: now,
    }
  }

  return base
}

async function updateTopLevelIntegrationOrders(reference: string, childReferences: string[], update: Record<string, unknown>) {
  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  const identifiers = Array.from(new Set([reference, ...childReferences].filter(Boolean)))
  const fields = ['reference', 'paymentReference', 'payment_reference', 'masterReference', 'parentReference', 'clientOrderId', 'sedifexOrderId']

  for (const field of fields) {
    for (let index = 0; index < identifiers.length; index += 10) {
      const chunk = identifiers.slice(index, index + 10)
      if (!chunk.length) continue
      const snap = await defaultDb.collection('integrationOrders').where(field, 'in', chunk).get()
      snap.docs.forEach(docSnap => refs.set(docSnap.ref.path, docSnap.ref))
    }
  }

  for (let index = 0; index < refs.size; index += 450) {
    const batch = defaultDb.batch()
    Array.from(refs.values()).slice(index, index + 450).forEach(ref => batch.set(ref, update, { merge: true }))
    await batch.commit()
  }

  return refs.size
}

async function handleMarketplaceMasterEvent(evtType: string, data: PaystackEventData) {
  const reference = String(data.reference ?? '').trim()
  if (!reference || !isMarketplaceMasterReference(reference)) return false
  if (!['charge.success', 'charge.failed'].includes(evtType)) return true

  const masterRef = defaultDb.collection('marketplaceOrders').doc(reference)
  const masterSnap = await masterRef.get()
  if (!masterSnap.exists) {
    functions.logger.warn('Marketplace master Paystack event had no matching order', { reference, evtType })
    return true
  }

  const master = masterSnap.data() as Record<string, unknown>
  const merchantOrders = Array.isArray(master.merchantOrders) ? master.merchantOrders as MerchantOrder[] : []
  const customerUid = typeof master.customerUid === 'string' ? master.customerUid : ''
  const childReferences = merchantOrders.map(order => String(order.childReference || order.reference || '').trim()).filter(Boolean)
  const update = buildPaymentUpdate(evtType, data)
  const settlementStatus = update.paymentStatus === 'success'
    ? 'pending_settlement'
    : update.paymentStatus === 'failed'
      ? 'payment_failed'
      : 'pending_payment'

  const batch = defaultDb.batch()
  batch.set(masterRef, {
    ...update,
    paymentReference: reference,
    payment_reference: reference,
    paystackReference: reference,
  }, { merge: true })
  batch.set(defaultDb.collection('sedifexAdmin').doc('marketplace').collection('orders').doc(reference), {
    ...update,
    paymentReference: reference,
    payment_reference: reference,
    paystackReference: reference,
  }, { merge: true })

  if (customerUid) {
    batch.set(defaultDb.collection('marketCustomers').doc(customerUid).collection('orders').doc(reference), {
      ...update,
      paymentReference: reference,
      payment_reference: reference,
      paystackReference: reference,
    }, { merge: true })
  }

  merchantOrders.forEach((merchantOrder) => {
    const merchantId = String(merchantOrder.merchantId || merchantOrder.storeId || '').trim()
    const childReference = String(merchantOrder.childReference || merchantOrder.reference || '').trim()
    if (!merchantId || !childReference) return
    const childUpdate = {
      ...update,
      masterReference: reference,
      parentReference: reference,
      paymentReference: reference,
      payment_reference: reference,
      paystackReference: reference,
      settlementStatus,
    }
    batch.set(defaultDb.collection('stores').doc(merchantId).collection('integrationOrders').doc(childReference), childUpdate, { merge: true })
    batch.set(defaultDb.collection('marketplaceOrders').doc(reference).collection('merchantOrders').doc(merchantId), childUpdate, { merge: true })
  })

  await batch.commit()
  const topLevelMatched = await updateTopLevelIntegrationOrders(reference, childReferences, {
    ...update,
    masterReference: reference,
    parentReference: reference,
    paymentReference: reference,
    payment_reference: reference,
    paystackReference: reference,
    settlementStatus,
  })

  await defaultDb.collection('marketplacePaymentEvents').doc(`${reference}_${Date.now()}`).set({
    event: evtType,
    reference,
    data,
    childReferences,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  functions.logger.info('Marketplace master Paystack status updated', {
    event: evtType,
    reference,
    childCount: childReferences.length,
    topLevelMatched,
    paymentStatus: update.paymentStatus ?? null,
  })

  return true
}

export const handlePaystackWebhook = functions.https.onRequest(async (req, res): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    const event = req.body as PaystackEvent
    const reference = String(event?.data?.reference ?? '').trim()

    if (!isMarketplaceMasterReference(reference)) {
      await (paystackWebhook as unknown as (req: functions.https.Request, res: functions.Response) => Promise<void> | void)(req, res)
      return
    }

    if (!verifySignature(req)) {
      res.status(401).send('Invalid signature')
      return
    }

    const handled = await handleMarketplaceMasterEvent(event.event || 'unknown', event.data || {})
    if (!handled) {
      res.status(400).send('Unhandled marketplace payment')
      return
    }

    res.status(200).send('ok')
  } catch (err) {
    functions.logger.error('handlePaystackWebhook marketplace wrapper error', { err })
    res.status(500).send('error')
  }
})
