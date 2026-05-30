import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'
import { upsertStoreCustomerFromCheckout } from './customerUpsert'

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isCashLike(data: Record<string, unknown>) {
  const metadata = getRecord(data.metadata)
  const payment = getRecord(data.payment)
  const joined = [
    data.paymentCollectionMode,
    data.payment_collection_mode,
    data.paymentMethod,
    data.payment_method,
    data.paymentProvider,
    data.payment_provider,
    data.paymentStatus,
    data.payment_status,
    data.sourceChannel,
    data.source_channel,
    metadata.sourceChannel,
    payment.mode,
    payment.provider,
  ].map(value => clean(value, 120).toLowerCase()).join(' ')

  return data.storeOnly === true || data.excludedFromSedifexSettlement === true || joined.includes('quick_pay_cash') || joined.includes('cash')
}

function firstItem(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? data.items : []
  const first = items[0]
  return getRecord(first)
}

function readAmount(data: Record<string, unknown>) {
  const payment = getRecord(data.payment)
  const amountMinor = asNumber(data.amountMinor, 0)
  if (amountMinor > 0) return amountMinor / 100
  return asNumber(data.amountPaid ?? data.amount_paid ?? data.confirmedAmount ?? data.amount ?? data.total ?? data.grandTotal ?? payment.amount ?? payment.customerTotal, 0)
}

async function repairOrderCustomer(orderId: string, data: Record<string, unknown>, storeId: string) {
  const customer = getRecord(data.customer)
  const metadata = getRecord(data.metadata)
  const item = firstItem(data)
  const result = await upsertStoreCustomerFromCheckout({
    storeId,
    customer: {
      name: clean(customer.name ?? data.customerName ?? metadata.customerName, 220),
      email: clean(customer.email ?? data.customerEmail ?? metadata.customerEmail, 220),
      phone: clean(customer.phone ?? data.customerPhone ?? metadata.customerPhone, 80),
    },
    reference: clean(data.reference ?? data.paymentReference ?? data.payment_reference ?? orderId, 220),
    sourceChannel: clean(data.sourceChannel ?? data.source_channel ?? metadata.sourceChannel, 80) || 'data_consistency_repair',
    sourceLabel: clean(data.sourceLabel ?? data.source_label ?? metadata.sourceLabel, 120) || 'Data consistency repair',
    paymentMethod: clean(data.paymentMethod ?? data.payment_method ?? data.paymentCollectionMode ?? data.payment_collection_mode, 80),
    paymentStatus: clean(data.paymentStatus ?? data.payment_status, 80),
    orderStatus: clean(data.orderStatus ?? data.order_status, 80),
    amount: readAmount(data),
    currency: clean(data.currency, 20) || 'GHS',
    itemName: clean(data.itemName ?? data.productName ?? data.serviceName ?? item.name ?? item.itemName, 260),
  }).catch(error => {
    functions.logger.warn('Data consistency customer repair failed', { orderId, storeId, error })
    return null
  })
  return result?.customerId || null
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sedifex-Admin-Repair-Token')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function isAllowed(req: functions.https.Request) {
  const expected = functions.config().sedifex?.admin_repair_token || process.env.SEDIFEX_ADMIN_REPAIR_TOKEN || ''
  if (!expected) return false
  const received = clean(req.get('x-sedifex-admin-repair-token') || req.get('authorization')?.replace(/^Bearer\s+/i, ''), 300)
  return received === expected
}

export const repairDataConsistency = functions.runWith({ timeoutSeconds: 540, memory: '512MB' }).https.onRequest(async (req, res): Promise<void> => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }
  if (!isAllowed(req)) {
    res.status(403).json({ error: 'repair-token-required' })
    return
  }

  const body = getRecord(req.body)
  const dryRun = body.dryRun !== false
  const limit = Math.min(Math.max(asNumber(body.limit, 250), 1), 1000)
  const specificStoreId = clean(body.storeId, 180)

  let inspected = 0
  let cashLikeFound = 0
  let copiedToCashOrders = 0
  let markedExcluded = 0
  let customersRepaired = 0
  const examples: Array<Record<string, unknown>> = []

  try {
    let query: FirebaseFirestore.Query = defaultDb.collection('integrationOrders').limit(limit)
    if (specificStoreId) query = defaultDb.collection('integrationOrders').where('storeId', '==', specificStoreId).limit(limit)
    const snapshot = await query.get()
    const batch = defaultDb.batch()
    let batchWrites = 0

    for (const docSnap of snapshot.docs) {
      inspected += 1
      const data = docSnap.data() as Record<string, unknown>
      const storeId = clean(data.storeId ?? data.merchantId, 180)
      if (!storeId || !isCashLike(data)) continue
      cashLikeFound += 1
      const reference = clean(data.reference ?? data.paymentReference ?? data.payment_reference, 220) || docSnap.id
      const cashRef = defaultDb.collection('stores').doc(storeId).collection('cashOrders').doc(reference)
      const customerId = dryRun ? null : await repairOrderCustomer(docSnap.id, data, storeId)
      if (customerId) customersRepaired += 1

      if (!dryRun) {
        batch.set(cashRef, {
          ...data,
          reference,
          customerId: customerId || data.customerId || null,
          storeOnly: true,
          excludedFromSedifexSettlement: true,
          settlementScope: 'store_only_cash',
          migratedFromIntegrationOrders: true,
          migratedFromIntegrationOrderId: docSnap.id,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
        batch.set(docSnap.ref, {
          storeOnly: true,
          excludedFromSedifexSettlement: true,
          settlementScope: 'store_only_cash',
          copiedToStoreCashOrders: true,
          storeCashOrderReference: reference,
          customerId: customerId || data.customerId || null,
          dataConsistencyRepairedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
        batchWrites += 2
      }
      copiedToCashOrders += 1
      markedExcluded += 1
      if (examples.length < 10) examples.push({ storeId, integrationOrderId: docSnap.id, reference, amount: readAmount(data) })
    }

    if (!dryRun && batchWrites > 0) await batch.commit()

    res.status(200).json({
      ok: true,
      dryRun,
      inspected,
      cashLikeFound,
      copiedToCashOrders,
      markedExcluded,
      customersRepaired,
      examples,
      note: dryRun ? 'Dry run only. Send { dryRun: false } to apply repair.' : 'Repair applied.',
    })
  } catch (error) {
    functions.logger.error('repairDataConsistency failed', { error })
    res.status(500).json({ error: error instanceof Error ? error.message : 'repair-failed' })
  }
})
