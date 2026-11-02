import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from '../firestore'

const MAX_SALES = 100

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function milliseconds(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}

// Never trust a role, cashier ID, or workspace ID sent from the browser.
async function memberRole(uid: string, storeId: string): Promise<'owner' | 'staff'> {
  const [members, directDoc] = await Promise.all([
    defaultDb.collection('teamMembers').where('uid', '==', uid).limit(100).get(),
    defaultDb.collection('teamMembers').doc(uid).get(),
  ])
  const rows = members.docs.map(doc => doc.data())
  if (directDoc.exists && (!asText(directDoc.get('uid')) || asText(directDoc.get('uid')) === uid)) {
    rows.push(directDoc.data() || {})
  }
  const sameWorkspace = rows.filter(member => asText(member.storeId) === storeId)
  if (sameWorkspace.some(member => asText(member.role) === 'owner')) return 'owner'
  if (sameWorkspace.some(member => asText(member.role) === 'staff')) return 'staff'

  // Owners may also administer explicitly linked child workspaces.
  const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
  const parentId = storeSnap.exists ? asText(storeSnap.get('parentStoreId')) : ''
  if (parentId && rows.some(member => asText(member.storeId) === parentId && asText(member.role) === 'owner')) {
    return 'owner'
  }

  throw new functions.https.HttpsError('permission-denied', 'You do not have access to this workspace')
}

function requireSession(context: functions.https.CallableContext, storeId: string) {
  if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first')
  if (!storeId || storeId.length > 180) throw new functions.https.HttpsError('invalid-argument', 'A valid workspace is required')
  return context.auth.uid
}

function presentSale(snapshot: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = snapshot.data() || {}
  const payment = asRecord(data.payment)
  const customer = asRecord(data.customer)
  const review = asRecord(data.staffReview)
  const items = Array.isArray(data.items) ? data.items : []
  const tenderMethods = Array.isArray(payment.tenders)
    ? payment.tenders.map(tender => asText(asRecord(tender).method)).filter(Boolean)
    : []
  const method = tenderMethods.length ? Array.from(new Set(tenderMethods)).join(' + ') : asText(payment.method) || 'unspecified'
  const isCashOnly = method === 'cash' || (tenderMethods.length > 0 && tenderMethods.every(value => value === 'cash'))
  const providerStatus = asText(payment.status ?? data.paymentStatus).toLowerCase()
  const hasVerifiedProviderPayment = Boolean(payment.verifiedAt ?? data.paymentVerifiedAt)
    || ['paid', 'success', 'succeeded', 'verified'].includes(providerStatus)
  const status = asText(data.status).toLowerCase() === 'voided'
    ? 'voided'
    : hasVerifiedProviderPayment ? 'verified'
    : isCashOnly ? 'cash_recorded' : 'recorded_unverified'

  return {
    id: snapshot.id,
    receiptNo: asText(data.receiptNo ?? data.receiptNumber ?? data.reference) || snapshot.id,
    cashierId: asText(data.committedBy ?? data.cashierId ?? data.createdBy),
    createdAt: milliseconds(data.createdAt),
    customerName: asText(customer.name ?? data.customerName) || 'Walk-in customer',
    amount: asNumber(data.total ?? asRecord(data.totals).total),
    method,
    status,
    providerStatus: providerStatus || null,
    items: items.slice(0, 30).map(item => {
      const row = asRecord(item)
      return { name: asText(row.name ?? row.productName) || 'Item', qty: asNumber(row.qty ?? row.quantity) }
    }),
    review: asText(review.status) ? {
      status: asText(review.status),
      reason: asText(review.reason),
      reportedAt: milliseconds(review.reportedAt),
      resolution: asText(review.resolution),
    } : null,
    voidReason: asText(data.voidReason),
  }
}

export const listSalesActivity = functions.https.onCall(async (data, context) => {
  const storeId = asText(data?.storeId)
  const uid = requireSession(context, storeId)
  const role = await memberRole(uid, storeId)

  // A paginated server query, not an unbounded real-time Firestore listener.
  // Staff results use the authenticated UID, never a client-provided cashierId.
  let salesQuery: FirebaseFirestore.Query = defaultDb.collection('sales').where('storeId', '==', storeId)
  if (role === 'staff') salesQuery = salesQuery.where('committedBy', '==', uid)
  const snapshot = await salesQuery.orderBy('createdAt', 'desc').limit(MAX_SALES).get()
  return { role, sales: snapshot.docs.map(presentSale), limit: MAX_SALES }
})

export const flagSaleForReview = functions.https.onCall(async (data, context) => {
  const storeId = asText(data?.storeId)
  const saleId = asText(data?.saleId)
  const reason = asText(data?.reason)
  const uid = requireSession(context, storeId)
  const role = await memberRole(uid, storeId)
  if (!saleId || saleId.length > 240 || saleId.includes('/')) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid sale is required')
  }
  if (reason.length < 5 || reason.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'Describe the mistake in 5–500 characters')
  }

  const saleRef = defaultDb.collection('sales').doc(saleId)
  const now = admin.firestore.FieldValue.serverTimestamp()
  await defaultDb.runTransaction(async tx => {
    const sale = await tx.get(saleRef)
    if (!sale.exists || asText(sale.get('storeId')) !== storeId) {
      throw new functions.https.HttpsError('not-found', 'Sale not found in this workspace')
    }
    if (role === 'staff' && asText(sale.get('committedBy')) !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'You can flag only your own sales')
    }
    const review = asRecord(sale.get('staffReview'))
    if (asText(review.status) === 'open') {
      throw new functions.https.HttpsError('already-exists', 'This sale already has an open review request')
    }
    tx.update(saleRef, {
      staffReview: { status: 'open', reason, reportedBy: uid, reportedAt: now },
    })
    tx.set(defaultDb.collection('activity').doc(), {
      storeId, type: 'sale.review_requested', refId: saleId,
      summary: 'Sale flagged for review', detail: reason,
      actor: uid, actorUid: uid, createdAt: now,
    })
  })
  return { ok: true }
})

export const resolveSaleReview = functions.https.onCall(async (data, context) => {
  const storeId = asText(data?.storeId)
  const saleId = asText(data?.saleId)
  const resolution = asText(data?.resolution)
  const uid = requireSession(context, storeId)
  if (await memberRole(uid, storeId) !== 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Owner approval required')
  }
  if (!saleId || saleId.length > 240 || saleId.includes('/')) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid sale is required')
  }
  if (resolution.length < 5 || resolution.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter a resolution in 5–500 characters')
  }
  const saleRef = defaultDb.collection('sales').doc(saleId)
  const now = admin.firestore.FieldValue.serverTimestamp()
  await defaultDb.runTransaction(async tx => {
    const sale = await tx.get(saleRef)
    if (!sale.exists || asText(sale.get('storeId')) !== storeId) {
      throw new functions.https.HttpsError('not-found', 'Sale not found in this workspace')
    }
    const review = asRecord(sale.get('staffReview'))
    if (asText(review.status) !== 'open') {
      throw new functions.https.HttpsError('failed-precondition', 'This sale has no open review')
    }
    tx.update(saleRef, {
      staffReview: { ...review, status: 'resolved', resolution, resolvedBy: uid, resolvedAt: now },
    })
    tx.set(defaultDb.collection('activity').doc(), {
      storeId, type: 'sale.review_resolved', refId: saleId,
      summary: 'Sale review resolved', detail: resolution,
      actor: uid, actorUid: uid, createdAt: now,
    })
  })
  return { ok: true }
})
