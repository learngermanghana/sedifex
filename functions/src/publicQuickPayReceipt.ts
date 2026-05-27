import * as functions from 'firebase-functions/v1'
import { defaultDb } from './firestore'

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getFirstItem(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? data.items : []
  const first = items[0]
  return getRecord(first)
}

function dateToIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (typeof (value as any)?.toDate === 'function') {
    const parsed = (value as any).toDate()
    return parsed instanceof Date ? parsed.toISOString() : null
  }
  return null
}

function readAmount(data: Record<string, unknown>) {
  const pricingSnapshot = getRecord(data.pricingSnapshot)
  const pricingSnapshotSnake = getRecord(data.pricing_snapshot)
  const amountMinor = asNumber(data.amountMinor, 0)
  const finalTotal = asNumber(pricingSnapshot.final_total ?? pricingSnapshot.finalTotal ?? pricingSnapshotSnake.final_total ?? pricingSnapshotSnake.finalTotal, 0)
  const direct = asNumber(data.amountPaid ?? data.amount_paid ?? data.confirmedAmount ?? data.amount ?? data.total ?? data.grandTotal, 0)
  if (direct > 0) return direct
  if (amountMinor > 0) return amountMinor / 100
  if (finalTotal > 0) return finalTotal > 999 ? finalTotal / 100 : finalTotal
  return 0
}

function isPaidStatus(status: string, orderStatus: string, cashConfirmed: boolean) {
  const joined = `${status} ${orderStatus}`.toLowerCase()
  return cashConfirmed || ['paid', 'paid_cash', 'success', 'confirmed', 'captured', 'completed'].some(token => joined.includes(token))
}

function mapReceipt(reference: string, storeId: string, data: Record<string, unknown>, collection: string) {
  const customer = getRecord(data.customer)
  const item = getFirstItem(data)
  const paymentStatus = clean(data.paymentStatus ?? data.payment_status, 80) || 'pending'
  const orderStatus = clean(data.orderStatus ?? data.order_status, 80) || 'pending'
  const cashConfirmed = data.cashConfirmed === true || getRecord(data.cashPayment).cashConfirmed === true
  const paid = isPaidStatus(paymentStatus, orderStatus, cashConfirmed)
  const sourceChannel = clean(data.sourceChannel ?? data.source_channel, 80)
  const storeOnly = data.storeOnly === true || collection.includes('/cashOrders')

  return {
    ok: true,
    reference,
    storeId,
    collection,
    storeOnly,
    receiptType: paid ? 'paid_receipt' : 'activity_slip',
    title: paid ? 'Payment Receipt' : 'Activity Slip',
    statusLabel: paid ? 'Paid / Confirmed' : 'Pending confirmation',
    paid,
    paymentStatus,
    orderStatus,
    cashConfirmed,
    paymentMethod: clean(data.paymentMethod ?? data.payment_method, 80) || (storeOnly ? 'CASH' : 'ONLINE'),
    paymentProvider: clean(data.paymentProvider ?? data.payment_provider, 80) || (storeOnly ? 'cash' : ''),
    paymentCollectionMode: clean(data.paymentCollectionMode ?? data.payment_collection_mode, 80),
    currency: clean(data.currency, 20) || 'GHS',
    amount: readAmount(data),
    customer: {
      name: clean(customer.name ?? data.customerName, 220) || 'Customer',
      phone: clean(customer.phone ?? data.customerPhone, 80),
      email: clean(customer.email ?? data.customerEmail, 220),
    },
    item: {
      name: clean(data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName ?? item.productName, 260) || 'Payment activity',
      category: clean(item.category ?? data.category, 160),
      quantity: asNumber(item.qty ?? item.quantity, 1) || 1,
      type: clean(item.quickPayType ?? item.type ?? data.recordType ?? data.orderType, 80),
    },
    sourceChannel,
    sourceLabel: clean(data.sourceLabel ?? data.source_label, 120) || (sourceChannel === 'quick_pay_cash' ? 'Sedifex Quick Pay Cash' : 'Sedifex Quick Pay'),
    createdAt: dateToIso(data.createdAtServer ?? data.createdAt),
    updatedAt: dateToIso(data.updatedAt),
    confirmedAt: dateToIso(data.cashConfirmedAt ?? data.completedAt ?? data.deliveredAt),
    note: paid
      ? 'This receipt is proof that the payment/activity has been confirmed in Sedifex.'
      : 'This is proof that the activity was recorded. It is not a paid receipt until the store/payment system confirms payment.',
  }
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

export const publicQuickPayReceipt = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    const storeId = clean(req.query.storeId, 180)
    const reference = clean(req.query.reference, 220)
    if (!storeId || !reference) {
      res.status(400).json({ error: 'missing-store-id-or-reference' })
      return
    }

    const cashRef = defaultDb.collection('stores').doc(storeId).collection('cashOrders').doc(reference)
    const storeOrderRef = defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(reference)
    const centralOrderRef = defaultDb.collection('integrationOrders').doc(reference)

    const [cashSnap, storeOrderSnap, centralOrderSnap] = await Promise.all([
      cashRef.get(),
      storeOrderRef.get(),
      centralOrderRef.get(),
    ])

    if (cashSnap.exists) {
      res.status(200).json(mapReceipt(reference, storeId, cashSnap.data() || {}, `stores/${storeId}/cashOrders`))
      return
    }

    if (storeOrderSnap.exists) {
      res.status(200).json(mapReceipt(reference, storeId, storeOrderSnap.data() || {}, `stores/${storeId}/integrationOrders`))
      return
    }

    if (centralOrderSnap.exists) {
      const data = centralOrderSnap.data() || {}
      const dataStoreId = clean(data.storeId ?? data.merchantId, 180)
      if (dataStoreId && dataStoreId !== storeId) {
        res.status(404).json({ error: 'receipt-not-found' })
        return
      }
      res.status(200).json(mapReceipt(reference, storeId, data, 'integrationOrders'))
      return
    }

    res.status(404).json({ error: 'receipt-not-found' })
  } catch (error) {
    functions.logger.error('publicQuickPayReceipt failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'receipt-load-failed' })
  }
})
