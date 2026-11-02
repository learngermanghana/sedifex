import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from '../firestore'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Cloud Functions bypass Firestore client rules, so check workspace ownership
// against stored membership records rather than trusting custom token claims.
async function assertInventoryOwner(uid: string, storeId: string) {
  const [direct, matches] = await Promise.all([
    defaultDb.collection('teamMembers').doc(uid).get(),
    defaultDb.collection('teamMembers').where('uid', '==', uid).get(),
  ])
  const members = matches.docs.map(snapshot => snapshot.data())
  if (direct.exists && (!text(direct.get('uid')) || text(direct.get('uid')) === uid)) {
    members.push(direct.data() || {})
  }
  if (members.some(member => text(member.storeId) === storeId && text(member.role) === 'owner')) return

  // Owners of a parent workspace may receive stock for a linked child store.
  const store = await defaultDb.collection('stores').doc(storeId).get()
  const parentStoreId = store.exists ? text(store.get('parentStoreId')) : ''
  if (parentStoreId && members.some(member => text(member.storeId) === parentStoreId && text(member.role) === 'owner')) return

  throw new functions.https.HttpsError('permission-denied', 'Only a workspace owner can receive stock')
}

export const receiveStock = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required')
  }

  const { productId, qty, supplier, reference, unitCost } = data || {}
  const productIdStr = typeof productId === 'string' ? productId : null
  if (!productIdStr) {
    throw new functions.https.HttpsError('invalid-argument', 'A product must be selected')
  }

  const amount = Number(qty)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Quantity must be greater than zero')
  }

  const normalizedSupplier = typeof supplier === 'string' ? supplier.trim() : ''
  if (!normalizedSupplier) {
    throw new functions.https.HttpsError('invalid-argument', 'Supplier is required')
  }

  const normalizedReference = typeof reference === 'string' ? reference.trim() : ''
  if (!normalizedReference) {
    throw new functions.https.HttpsError('invalid-argument', 'Reference number is required')
  }

  let normalizedUnitCost: number | null = null
  if (unitCost !== undefined && unitCost !== null && unitCost !== '') {
    const parsedCost = Number(unitCost)
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Cost must be zero or greater when provided',
      )
    }
    normalizedUnitCost = parsedCost
  }

  const productRef = defaultDb.collection('products').doc(productIdStr)
  const initialProduct = await productRef.get()
  if (!initialProduct.exists) {
    throw new functions.https.HttpsError('not-found', 'Product not found')
  }
  const authorizedStoreId = text(initialProduct.get('storeId'))
  if (!authorizedStoreId) {
    throw new functions.https.HttpsError('failed-precondition', 'Product is missing its workspace')
  }
  await assertInventoryOwner(context.auth.uid, authorizedStoreId)

  const receiptRef = defaultDb.collection('receipts').doc()
  const ledgerRef = defaultDb.collection('ledger').doc()

  await defaultDb.runTransaction(async tx => {
    const pSnap = await tx.get(productRef)
    if (!pSnap.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Bad product')
    }

    const productStoreIdRaw = pSnap.get('storeId')
    const productStoreId =
      typeof productStoreIdRaw === 'string' ? productStoreIdRaw.trim() : null

    if (productStoreId !== authorizedStoreId) {
      throw new functions.https.HttpsError('permission-denied', 'Product workspace changed')
    }

    const currentStock = Number(pSnap.get('stockCount') || 0)
    const nextStock = currentStock + amount
    const timestamp = admin.firestore.FieldValue.serverTimestamp()

    tx.update(productRef, {
      stockCount: nextStock,
      updatedAt: timestamp,
      lastReceivedAt: timestamp,
      lastReceivedQty: amount,
      lastReceivedCost: normalizedUnitCost,
    })

    const totalCost =
      normalizedUnitCost === null
        ? null
        : Math.round((normalizedUnitCost * amount + Number.EPSILON) * 100) / 100

    tx.set(receiptRef, {
      productId: productIdStr,
      qty: amount,
      supplier: normalizedSupplier,
      reference: normalizedReference,
      unitCost: normalizedUnitCost,
      totalCost,
      receivedBy: context.auth?.uid ?? null,
      createdAt: timestamp,
      storeId: productStoreId,
    })

    tx.set(ledgerRef, {
      productId: productIdStr,
      qtyChange: amount,
      type: 'receipt',
      refId: receiptRef.id,
      storeId: productStoreId,
      createdAt: timestamp,
    })
  })

  return { ok: true, receiptId: receiptRef.id }
})
