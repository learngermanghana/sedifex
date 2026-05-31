import { admin } from './firestore'

type HistoryInput = {
  status: string
  orderStatus: string
  fulfillmentStatus: string
  deliveryStatus: string
  actor?: string
  source?: string
  note?: string
  reference?: string
  storeId?: string
}

function historyEntry(input: HistoryInput) {
  return {
    status: input.status,
    orderStatus: input.orderStatus,
    fulfillmentStatus: input.fulfillmentStatus,
    deliveryStatus: input.deliveryStatus,
    actor: input.actor || 'system',
    source: input.source || 'sedifex_system',
    note: input.note || null,
    reference: input.reference || null,
    storeId: input.storeId || null,
    createdAt: new Date().toISOString(),
  }
}

export function checkoutCreatedFulfillmentFields(reference: string, storeId: string, fulfillmentType = 'delivery') {
  const orderStatus = 'pending_payment'
  const fulfillmentStatus = 'pending_payment'
  const deliveryStatus = fulfillmentType === 'pickup' ? 'not_started' : 'not_started'

  return {
    status: orderStatus,
    orderStatus,
    order_status: orderStatus,
    fulfillmentType,
    fulfillment_type: fulfillmentType,
    fulfillmentStatus,
    fulfillment_status: fulfillmentStatus,
    deliveryStatus,
    delivery_status: deliveryStatus,
    storeConfirmationStatus: 'not_ready',
    store_confirmation_status: 'not_ready',
    customerDeliveryConfirmationStatus: 'not_ready',
    customer_delivery_confirmation_status: 'not_ready',
    deliveredAt: null,
    deliveredBy: null,
    deliveryProof: null,
    statusHistory: [historyEntry({
      status: orderStatus,
      orderStatus,
      fulfillmentStatus,
      deliveryStatus,
      source: 'integrationCheckoutCreate',
      note: 'Checkout created. Waiting for payment confirmation.',
      reference,
      storeId,
    })],
  }
}

export function paidFulfillmentUpdateFields(reference: string, storeId: string, fulfillmentType = 'delivery') {
  const orderStatus = 'pending_store_confirmation'
  const fulfillmentStatus = 'pending_store_confirmation'
  const deliveryStatus = fulfillmentType === 'pickup' ? 'not_started' : 'not_started'
  const entry = historyEntry({
    status: orderStatus,
    orderStatus,
    fulfillmentStatus,
    deliveryStatus,
    source: 'paystackWebhook',
    note: 'Payment confirmed. Waiting for store confirmation while payment_status remains paid.',
    reference,
    storeId,
  })

  return {
    status: orderStatus,
    orderStatus,
    order_status: orderStatus,
    fulfillmentType,
    fulfillment_type: fulfillmentType,
    fulfillmentStatus,
    fulfillment_status: fulfillmentStatus,
    deliveryStatus,
    delivery_status: deliveryStatus,
    storeConfirmationStatus: 'pending',
    store_confirmation_status: 'pending',
    customerDeliveryConfirmationStatus: 'not_ready',
    customer_delivery_confirmation_status: 'not_ready',
    storeNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    fulfillmentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusHistory: admin.firestore.FieldValue.arrayUnion(entry),
  }
}

export function paymentFailedFulfillmentUpdateFields(reference: string, storeId: string, fulfillmentType = 'delivery') {
  const orderStatus = 'payment_failed'
  const fulfillmentStatus = 'payment_failed'
  const deliveryStatus = 'not_started'
  const entry = historyEntry({
    status: orderStatus,
    orderStatus,
    fulfillmentStatus,
    deliveryStatus,
    source: 'paystackWebhook',
    note: 'Payment failed. Order cannot be fulfilled until payment is successful.',
    reference,
    storeId,
  })

  return {
    status: orderStatus,
    orderStatus,
    order_status: orderStatus,
    fulfillmentType,
    fulfillment_type: fulfillmentType,
    fulfillmentStatus,
    fulfillment_status: fulfillmentStatus,
    deliveryStatus,
    delivery_status: deliveryStatus,
    storeConfirmationStatus: 'not_ready',
    store_confirmation_status: 'not_ready',
    customerDeliveryConfirmationStatus: 'not_ready',
    customer_delivery_confirmation_status: 'not_ready',
    fulfillmentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusHistory: admin.firestore.FieldValue.arrayUnion(entry),
  }
}
