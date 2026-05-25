import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from '../firestore'

const VALID_ROLES = new Set(['owner', 'staff'])

type SaleLineInput = {
  productId?: unknown
  name?: unknown
  qty?: unknown
  price?: unknown
  taxRate?: unknown
  type?: unknown
  isService?: unknown
}

function getRoleFromToken(token: Record<string, unknown> | undefined) {
  const role = typeof token?.role === 'string' ? (token.role as string) : null
  return role && VALID_ROLES.has(role) ? (role as 'owner' | 'staff') : null
}

function assertStaffAccess(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required')
  }

  const role = getRoleFromToken(context.auth.token as Record<string, unknown>)
  if (!role) {
    throw new functions.https.HttpsError('permission-denied', 'Staff access required')
  }
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export const commitSale = functions.https.onCall(async (data, context) => {
  assertStaffAccess(context)

  const branchId = asTrimmedString(data?.branchId)
  const saleId = asTrimmedString(data?.saleId)
  if (!branchId) {
    throw new functions.https.HttpsError('invalid-argument', 'Workspace/branch is required')
  }
  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'Sale ID is required')
  }

  const itemsRaw = Array.isArray(data?.items) ? (data.items as SaleLineInput[]) : []
  if (!itemsRaw.length) {
    throw new functions.https.HttpsError('invalid-argument', 'At least one item is required')
  }

  const normalizedItems = itemsRaw.map((item, index) => {
    const qty = asFiniteNumber(item.qty)
    const price = asFiniteNumber(item.price)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: quantity must be greater than zero`)
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: price must be zero or greater`)
    }

    const type = asTrimmedString(item.type) || 'product'
    const isService = Boolean(item.isService) || type === 'service'
    const productId = asTrimmedString(item.productId)
    if (!isService && !productId) {
      throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: product ID is required for non-service items`)
    }

    return {
      productId: productId || null,
      name: asTrimmedString(item.name) || 'Item',
      qty,
      price,
      taxRate: asFiniteNumber(item.taxRate),
      type,
      isService,
      lineTotal: Math.round((qty * price + Number.EPSILON) * 100) / 100,
    }
  })

  const totalsRaw = (data?.totals ?? {}) as Record<string, unknown>
  const paymentRaw = (data?.payment ?? {}) as Record<string, unknown>
  const customerRaw = (data?.customer ?? null) as Record<string, unknown> | null

  const totals = {
    subTotal: asFiniteNumber(totalsRaw.subTotal),
    taxTotal: asFiniteNumber(totalsRaw.taxTotal),
    discount: asFiniteNumber(totalsRaw.discount),
    total: asFiniteNumber(totalsRaw.total),
  }

  if (totals.total < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Sale total cannot be negative')
  }

  const now = admin.firestore.FieldValue.serverTimestamp()
  const saleRef = defaultDb.collection('sales').doc(saleId)

  await defaultDb.runTransaction(async tx => {
    const existingSale = await tx.get(saleRef)
    if (existingSale.exists) {
      throw new functions.https.HttpsError('already-exists', 'Sale already exists')
    }

    const inventoryLines = normalizedItems.filter(line => !line.isService && line.productId)
    for (const line of inventoryLines) {
      const productRef = defaultDb.collection('products').doc(String(line.productId))
      const productSnap = await tx.get(productRef)
      if (!productSnap.exists) {
        throw new functions.https.HttpsError('failed-precondition', `Product not found for ${line.name}`)
      }

      const productStoreId = asTrimmedString(productSnap.get('storeId'))
      if (productStoreId && productStoreId !== branchId) {
        throw new functions.https.HttpsError('permission-denied', `Item ${line.name} does not belong to this workspace`)
      }

      const currentStock = asFiniteNumber(productSnap.get('stockCount'), 0)
      const nextStock = currentStock - line.qty
      if (nextStock < 0) {
        throw new functions.https.HttpsError('failed-precondition', `Insufficient stock for ${line.name}`)
      }

      tx.update(productRef, {
        stockCount: nextStock,
        updatedAt: now,
        lastSoldAt: now,
        lastSoldQty: line.qty,
      })

      const ledgerRef = defaultDb.collection('ledger').doc()
      tx.set(ledgerRef, {
        productId: line.productId,
        qtyChange: -line.qty,
        type: 'sale',
        refId: saleId,
        storeId: branchId,
        createdAt: now,
      })
    }

    tx.set(saleRef, {
      id: saleId,
      saleId,
      storeId: branchId,
      branchId,
      items: normalizedItems,
      totals,
      subTotal: totals.subTotal,
      taxTotal: totals.taxTotal,
      discount: totals.discount,
      total: totals.total,
      cashierId: asTrimmedString(data?.cashierId) || (context.auth?.uid ?? null),
      payment: {
        method: asTrimmedString(paymentRaw.method) || null,
        amountPaid: asFiniteNumber(paymentRaw.amountPaid),
        changeDue: asFiniteNumber(paymentRaw.changeDue),
        tenders: Array.isArray(paymentRaw.tenders) ? paymentRaw.tenders : [],
      },
      customer: customerRaw
        ? {
            id: asTrimmedString(customerRaw.id) || null,
            name: asTrimmedString(customerRaw.name) || null,
            phone: asTrimmedString(customerRaw.phone) || null,
          }
        : null,
      source: 'pos',
      createdAt: now,
      updatedAt: now,
      committedBy: context.auth?.uid ?? null,
    })
  })

  return { ok: true, saleId }
})
