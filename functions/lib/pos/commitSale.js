"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitSale = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const firestore_1 = require("../firestore");
const VALID_ROLES = new Set(['owner', 'staff']);
function getRoleFromToken(token) {
    const role = typeof token?.role === 'string' ? token.role : null;
    return role && VALID_ROLES.has(role) ? role : null;
}
function assertStaffAccess(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const role = getRoleFromToken(context.auth.token);
    if (!role) {
        throw new functions.https.HttpsError('permission-denied', 'Staff access required');
    }
}
function asFiniteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
exports.commitSale = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const branchId = asTrimmedString(data?.branchId);
    const saleId = asTrimmedString(data?.saleId);
    if (!branchId) {
        throw new functions.https.HttpsError('invalid-argument', 'Workspace/branch is required');
    }
    if (!saleId) {
        throw new functions.https.HttpsError('invalid-argument', 'Sale ID is required');
    }
    const itemsRaw = Array.isArray(data?.items) ? data.items : [];
    if (!itemsRaw.length) {
        throw new functions.https.HttpsError('invalid-argument', 'At least one item is required');
    }
    const normalizedItems = itemsRaw.map((item, index) => {
        const qty = asFiniteNumber(item.qty);
        const price = asFiniteNumber(item.price);
        if (!Number.isFinite(qty) || qty <= 0) {
            throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: quantity must be greater than zero`);
        }
        if (!Number.isFinite(price) || price < 0) {
            throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: price must be zero or greater`);
        }
        const type = asTrimmedString(item.type) || 'product';
        const isService = Boolean(item.isService) || type === 'service';
        const productId = asTrimmedString(item.productId);
        if (!isService && !productId) {
            throw new functions.https.HttpsError('invalid-argument', `Item ${index + 1}: product ID is required for non-service items`);
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
        };
    });
    const totalsRaw = (data?.totals ?? {});
    const paymentRaw = (data?.payment ?? {});
    const customerRaw = (data?.customer ?? null);
    const totals = {
        subTotal: asFiniteNumber(totalsRaw.subTotal),
        taxTotal: asFiniteNumber(totalsRaw.taxTotal),
        discount: asFiniteNumber(totalsRaw.discount),
        total: asFiniteNumber(totalsRaw.total),
    };
    if (totals.total < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Sale total cannot be negative');
    }
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const saleRef = firestore_1.defaultDb.collection('sales').doc(saleId);
    await firestore_1.defaultDb.runTransaction(async (tx) => {
        const existingSale = await tx.get(saleRef);
        if (existingSale.exists) {
            throw new functions.https.HttpsError('already-exists', 'Sale already exists');
        }
        const inventoryLines = normalizedItems.filter(line => !line.isService && line.productId);
        for (const line of inventoryLines) {
            const productRef = firestore_1.defaultDb.collection('products').doc(String(line.productId));
            const productSnap = await tx.get(productRef);
            if (!productSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', `Product not found for ${line.name}`);
            }
            const productStoreId = asTrimmedString(productSnap.get('storeId'));
            if (productStoreId && productStoreId !== branchId) {
                throw new functions.https.HttpsError('permission-denied', `Item ${line.name} does not belong to this workspace`);
            }
            const currentStock = asFiniteNumber(productSnap.get('stockCount'), 0);
            const nextStock = currentStock - line.qty;
            if (nextStock < 0) {
                throw new functions.https.HttpsError('failed-precondition', `Insufficient stock for ${line.name}`);
            }
            tx.update(productRef, {
                stockCount: nextStock,
                updatedAt: now,
                lastSoldAt: now,
                lastSoldQty: line.qty,
            });
            const ledgerRef = firestore_1.defaultDb.collection('ledger').doc();
            tx.set(ledgerRef, {
                productId: line.productId,
                qtyChange: -line.qty,
                type: 'sale',
                refId: saleId,
                storeId: branchId,
                createdAt: now,
            });
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
        });
    });
    return { ok: true, saleId };
});
