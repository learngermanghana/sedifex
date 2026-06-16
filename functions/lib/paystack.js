"use strict";
// functions/src/paystack.ts
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
exports.createPaystackCheckout = exports.handlePaystackWebhook = exports.paystackWebhook = exports.checkSignupUnlock = exports.createCheckout = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const firestore_1 = require("./firestore");
const orderFulfillment_1 = require("./orderFulfillment");
/**
 * Config
 */
const PAYSTACK_SECRET = (0, params_1.defineString)('PAYSTACK_SECRET_KEY');
const PAYSTACK_PUBLIC = (0, params_1.defineString)('PAYSTACK_PUBLIC_KEY');
const APP_BASE_URL = (0, params_1.defineString)('APP_BASE_URL');
const YEARLY_CONTRACT_MONTHS = 12;
const YEARLY_PLAN_AMOUNTS_GHS = {
    business: 999,
    growth_website: 1999,
};
let paystackConfigLogged = false;
function getPaystackConfig() {
    const secret = PAYSTACK_SECRET.value();
    const publicKey = PAYSTACK_PUBLIC.value();
    const appBaseUrl = APP_BASE_URL.value();
    if (!paystackConfigLogged && !secret) {
        functions.logger.warn('Paystack secret not set. Configure PAYSTACK_SECRET_KEY via params (e.g. firebase functions:config:set PAYSTACK_SECRET_KEY="sk_live_xxx")');
        paystackConfigLogged = true;
    }
    return { secret, publicKey, appBaseUrl };
}
/**
 * Util: kobo conversion (Paystack expects amounts in kobo)
 */
const toKobo = (amount) => Math.round(Math.abs(amount) * 100);
/**
 * Helper: ensure user is authenticated for callables
 */
function assertAuthenticated(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
    }
}
const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');
async function findStoreIntegrationOrderRefs(storeId, identifiers) {
    const unique = Array.from(new Set(identifiers.map(value => toTrimmedString(value)).filter(Boolean)));
    const refs = new Map();
    for (const identifier of unique) {
        const direct = firestore_1.defaultDb.collection('stores').doc(storeId).collection('integrationOrders').doc(identifier);
        const snap = await direct.get();
        if (snap.exists)
            refs.set(direct.path, direct);
    }
    const fields = ['booking_id', 'bookingId', 'payment_reference', 'paymentReference', 'reference', 'clientOrderId', 'client_order_id', 'sedifexOrderId', 'sedifex_order_id', 'paystackReference'];
    for (const field of fields) {
        for (let index = 0; index < unique.length; index += 10) {
            const chunk = unique.slice(index, index + 10);
            const snap = await firestore_1.defaultDb.collection('stores').doc(storeId).collection('integrationOrders').where(field, 'in', chunk).get();
            snap.docs.forEach(docSnap => refs.set(docSnap.ref.path, docSnap.ref));
        }
    }
    return Array.from(refs.values());
}
async function loadCheckoutIntent(reference, storeId) {
    if (!reference)
        return null;
    const snap = await firestore_1.defaultDb.collection('checkoutIntents').doc(reference).get();
    if (!snap.exists)
        return null;
    const data = (snap.data() ?? {});
    const intentStoreId = toTrimmedString(data.storeId) || toTrimmedString(data.merchantId);
    if (intentStoreId && intentStoreId !== storeId)
        return null;
    return data;
}
function getFulfillmentTypeFromMetadata(metadata) {
    const value = toTrimmedString(metadata.fulfillmentType || metadata.fulfillment_type || metadata.deliveryMethod || metadata.delivery_method).toLowerCase();
    return ['pickup', 'self_pickup', 'collection'].includes(value) ? 'pickup' : 'delivery';
}
function isIntegrationCheckoutEvent(data) {
    const metadata = data.metadata ?? {};
    const channel = toTrimmedString(metadata.channel);
    return Boolean(channel === 'client-website' ||
        toTrimmedString(metadata.sedifexOrderId) ||
        toTrimmedString(metadata.clientOrderId) ||
        toTrimmedString(metadata.orderType));
}
function isDonationEvent(data) {
    const metadata = data.metadata ?? {};
    return Boolean(toTrimmedString(metadata.pageType) === 'donation' ||
        toTrimmedString(metadata.fundTransactionId) ||
        toTrimmedString(data.reference).startsWith('DON-'));
}
function getContractMonths(metadata) {
    const raw = Number(metadata?.contractMonths);
    if (Number.isFinite(raw) && raw > 0)
        return Math.max(1, Math.min(36, Math.floor(raw)));
    return YEARLY_CONTRACT_MONTHS;
}
function buildContractPeriod(paidAt, months) {
    const start = paidAt ? new Date(paidAt) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    return {
        startTimestamp: firestore_1.admin.firestore.Timestamp.fromDate(start),
        endTimestamp: firestore_1.admin.firestore.Timestamp.fromDate(end),
    };
}
function expectedYearlyAmount(plan) {
    if (!plan)
        return null;
    return YEARLY_PLAN_AMOUNTS_GHS[plan] ?? null;
}
async function updateDonationTransactionFromPaystackEvent(evtType, data) {
    if (!isDonationEvent(data))
        return false;
    const metadata = data.metadata ?? {};
    const reference = toTrimmedString(data.reference);
    const storeId = toTrimmedString(metadata.storeId);
    const fundTransactionId = toTrimmedString(metadata.fundTransactionId);
    const isSuccess = evtType === 'charge.success';
    const isFailure = evtType === 'charge.failed';
    if (!reference || (!isSuccess && !isFailure))
        return false;
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const amount = typeof data.amount === 'number' ? data.amount / 100 : null;
    const fees = typeof data.fees === 'number' ? data.fees / 100 : null;
    const status = isSuccess ? 'captured' : 'failed';
    const updatePayload = {
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
    };
    const matchedRefs = new Map();
    if (fundTransactionId) {
        const directRef = firestore_1.defaultDb.collection('fund_transactions').doc(fundTransactionId);
        const directSnap = await directRef.get();
        if (directSnap.exists)
            matchedRefs.set(directRef.path, directRef);
    }
    const fields = ['reference', 'paymentReference', 'payment.reference'];
    for (const field of fields) {
        let snap;
        if (storeId) {
            snap = await firestore_1.defaultDb
                .collection('fund_transactions')
                .where('storeId', '==', storeId)
                .where(field, '==', reference)
                .limit(10)
                .get();
        }
        else {
            snap = await firestore_1.defaultDb
                .collection('fund_transactions')
                .where(field, '==', reference)
                .limit(10)
                .get();
        }
        snap.docs.forEach(docSnap => matchedRefs.set(docSnap.ref.path, docSnap.ref));
    }
    if (matchedRefs.size === 0) {
        functions.logger.warn('Donation Paystack event had no matching fund transaction', {
            event: evtType,
            storeId,
            reference,
            fundTransactionId,
            metadata,
        });
        return true;
    }
    const batch = firestore_1.defaultDb.batch();
    Array.from(matchedRefs.values()).forEach(ref => batch.set(ref, updatePayload, { merge: true }));
    await batch.commit();
    if (isSuccess) {
        for (const ref of matchedRefs.values()) {
            const snap = await ref.get();
            const txData = snap.data() ?? {};
            const donorId = toTrimmedString(txData.donorId);
            if (donorId) {
                await firestore_1.defaultDb.collection('donor_profiles').doc(donorId).set({
                    lastDonationAmount: amount,
                    lastDonationCurrency: data.currency || 'GHS',
                    lastDonationReference: reference,
                    lastDonationStatus: 'captured',
                    lastDonationAt: now,
                    updatedAt: now,
                }, { merge: true });
            }
        }
    }
    functions.logger.info('Donation Paystack status updated', {
        event: evtType,
        storeId,
        reference,
        matchedCount: matchedRefs.size,
        status,
    });
    return true;
}
async function updateIntegrationOrderFromPaystackEvent(evtType, data) {
    if (!isIntegrationCheckoutEvent(data))
        return false;
    const metadata = data.metadata ?? {};
    const storeId = toTrimmedString(metadata.storeId);
    const reference = toTrimmedString(data.reference);
    if (!storeId || !reference) {
        functions.logger.warn('Integration Paystack event missing storeId/reference', {
            event: evtType,
            storeId,
            reference,
            metadata,
        });
        return false;
    }
    const isSuccess = evtType === 'charge.success';
    const isFailure = evtType === 'charge.failed';
    if (!isSuccess && !isFailure)
        return false;
    const amount = typeof data.amount === 'number' ? data.amount / 100 : null;
    const fees = typeof data.fees === 'number' ? data.fees / 100 : null;
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const fulfillmentType = getFulfillmentTypeFromMetadata(metadata);
    const orderRef = firestore_1.defaultDb
        .collection('stores')
        .doc(storeId)
        .collection('integrationOrders')
        .doc(reference);
    const orderUpdate = {
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
    };
    if (amount !== null) {
        orderUpdate.amountPaid = amount;
    }
    if (isSuccess) {
        Object.assign(orderUpdate, (0, orderFulfillment_1.paidFulfillmentUpdateFields)(reference, storeId, fulfillmentType));
        orderUpdate.paymentStatus = 'paid';
        orderUpdate.payment_status = 'paid';
        orderUpdate.paidAt = data.paid_at ?? null;
        orderUpdate.paymentConfirmedAt = now;
        orderUpdate.syncStatus = 'pending';
        orderUpdate.syncRequestedAt = now;
    }
    else {
        Object.assign(orderUpdate, (0, orderFulfillment_1.paymentFailedFulfillmentUpdateFields)(reference, storeId, fulfillmentType));
        orderUpdate.paymentStatus = 'failed';
        orderUpdate.payment_status = 'failed';
        orderUpdate.paymentFailedAt = now;
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
    ];
    const checkoutIntent = await loadCheckoutIntent(reference, storeId);
    const storeOrderRefs = await findStoreIntegrationOrderRefs(storeId, initialIdentifiers);
    if (storeOrderRefs.length) {
        for (let index = 0; index < storeOrderRefs.length; index += 450) {
            const batch = firestore_1.defaultDb.batch();
            storeOrderRefs.slice(index, index + 450).forEach(ref => batch.set(ref, orderUpdate, { merge: true }));
            await batch.commit();
        }
    }
    else if (isSuccess) {
        await orderRef.set({ ...(checkoutIntent ?? {}), ...orderUpdate, checkoutIntent: false, persistedAsOrder: true }, { merge: true });
    }
    else {
        await firestore_1.defaultDb.collection('checkoutIntents').doc(reference).set({ ...orderUpdate, persistedAsOrder: false }, { merge: true });
    }
    const orderSnap = await orderRef.get();
    const orderData = (orderSnap.data() ?? {});
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
    ].filter(Boolean);
    const identifiers = Array.from(new Set(candidateIdentifiers));
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
    ];
    const topLevelMatched = new Map();
    for (const field of fieldsToMatch) {
        for (let i = 0; i < identifiers.length; i += 10) {
            const chunk = identifiers.slice(i, i + 10);
            if (!chunk.length)
                continue;
            const snap = await firestore_1.defaultDb
                .collection('integrationOrders')
                .where(field, 'in', chunk)
                .get();
            snap.docs.forEach((doc) => {
                const docData = doc.data();
                const docStoreId = toTrimmedString(docData.storeId);
                const docMerchantId = toTrimmedString(docData.merchantId);
                if (!docStoreId ||
                    !docMerchantId ||
                    docStoreId === storeId ||
                    docMerchantId === storeId) {
                    topLevelMatched.set(doc.ref.path, doc.ref);
                }
            });
        }
    }
    if (topLevelMatched.size > 0 || isSuccess) {
        const topLevelUpdate = {
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
        };
        if (isSuccess) {
            Object.assign(topLevelUpdate, (0, orderFulfillment_1.paidFulfillmentUpdateFields)(reference, storeId, fulfillmentType));
            topLevelUpdate.paymentStatus = 'paid';
            topLevelUpdate.payment_status = 'paid';
            topLevelUpdate.paystackChannel = data.channel ?? null;
            topLevelUpdate.paystackFees = fees;
            topLevelUpdate.amountPaid = amount;
            topLevelUpdate.customerEmail = data.customer?.email ?? null;
            topLevelUpdate.paymentConfirmedAt = now;
            topLevelUpdate.syncStatus = 'pending';
            topLevelUpdate.syncRequestedAt = now;
        }
        else {
            Object.assign(topLevelUpdate, (0, orderFulfillment_1.paymentFailedFulfillmentUpdateFields)(reference, storeId, fulfillmentType));
            topLevelUpdate.paymentStatus = 'failed';
            topLevelUpdate.payment_status = 'failed';
            topLevelUpdate.paymentFailedAt = now;
        }
        if (topLevelMatched.size === 0 && isSuccess) {
            topLevelMatched.set(firestore_1.defaultDb.collection('integrationOrders').doc(reference).path, firestore_1.defaultDb.collection('integrationOrders').doc(reference));
        }
        const matchedRefs = Array.from(topLevelMatched.values());
        for (let i = 0; i < matchedRefs.length; i += 450) {
            const batch = firestore_1.defaultDb.batch();
            matchedRefs.slice(i, i + 450).forEach((docRef) => {
                batch.set(docRef, { ...(checkoutIntent ?? {}), ...topLevelUpdate, checkoutIntent: false, persistedAsOrder: true }, { merge: true });
            });
            await batch.commit();
        }
    }
    functions.logger.info('Mirrored Paystack integration payment status to top-level integrationOrders', {
        storeId,
        reference,
        matchedCount: topLevelMatched.size,
        paymentStatus: isSuccess ? 'paid' : 'failed',
    });
    const bookingId = toTrimmedString(orderData.bookingId) || toTrimmedString(metadata.bookingId);
    if (bookingId) {
        const bookingUpdate = {
            paymentReference: reference,
            payment_reference: reference,
            sedifexOrderId: toTrimmedString(metadata.sedifexOrderId) || orderData.sedifexOrderId || null,
            clientOrderId: toTrimmedString(metadata.clientOrderId) || orderData.clientOrderId || null,
            paymentUpdatedAt: now,
            updatedAt: now,
        };
        if (isSuccess) {
            bookingUpdate.paymentStatus = 'paid';
            bookingUpdate.payment_status = 'paid';
            bookingUpdate.paymentConfirmedAt = now;
        }
        else {
            bookingUpdate.paymentStatus = 'failed';
            bookingUpdate.payment_status = 'failed';
            bookingUpdate.paymentFailedAt = now;
        }
        await firestore_1.defaultDb
            .collection('stores')
            .doc(storeId)
            .collection('integrationBookings')
            .doc(bookingId)
            .set(bookingUpdate, { merge: true });
    }
    await firestore_1.defaultDb
        .collection('stores')
        .doc(storeId)
        .collection('integrationPaymentEvents')
        .doc(`${reference}_${Date.now()}`)
        .set({
        event: evtType,
        reference,
        data,
        receivedAt: now,
    });
    functions.logger.info('Integration order Paystack status updated', {
        event: evtType,
        storeId,
        reference,
        paymentStatus: isSuccess ? 'paid' : 'failed',
        bookingId: bookingId || null,
    });
    return true;
}
async function recordPaystackEvent(storeId, evtType, data) {
    try {
        await firestore_1.defaultDb
            .collection('subscriptions')
            .doc(storeId)
            .collection('events')
            .doc(String(Date.now()))
            .set({
            event: evtType,
            data,
            receivedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        functions.logger.warn('Failed to store Paystack audit event', {
            e,
            evtType,
            storeId,
        });
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
exports.createCheckout = functions.https.onCall(async (data, context) => {
    assertAuthenticated(context);
    const { secret: paystackSecret, publicKey: paystackPublicKey, appBaseUrl } = getPaystackConfig();
    if (!paystackSecret) {
        throw new functions.https.HttpsError('failed-precondition', 'Paystack secret is not configured');
    }
    const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    const rawPlan = (typeof data?.plan === 'string' ? data.plan.trim() : '') ||
        (typeof data?.planId === 'string' ? data.planId.trim() : '');
    const plan = rawPlan || null;
    const redirectUrlRaw = typeof data?.redirectUrl === 'string' ? data.redirectUrl.trim() : '';
    const redirectUrl = redirectUrlRaw || (appBaseUrl ? `${appBaseUrl}/billing/verify` : undefined);
    const metadataIn = data?.metadata && typeof data.metadata === 'object'
        ? data.metadata
        : {};
    const requestedAmount = Number(data?.amount);
    const configuredAmount = expectedYearlyAmount(plan);
    const amount = configuredAmount ?? requestedAmount;
    const contractMonths = getContractMonths(metadataIn);
    if (!email) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid email is required');
    }
    if (!storeId) {
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required');
    }
    if (!plan || !configuredAmount) {
        throw new functions.https.HttpsError('invalid-argument', 'Choose Business or Growth Website for yearly Paystack checkout.');
    }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Amount must be greater than zero');
    }
    if (Math.round(requestedAmount) !== Math.round(configuredAmount)) {
        throw new functions.https.HttpsError('invalid-argument', `Invalid amount for ${plan}. Expected GHS ${configuredAmount}.`);
    }
    const reference = `${storeId}_${Date.now()}`;
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
            createdBy: context.auth.uid,
            ...metadataIn,
        },
    };
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${paystackSecret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const json = (await resp.json());
    if (!json?.status) {
        throw new functions.https.HttpsError('internal', json?.message || 'Paystack init failed');
    }
    const { authorization_url: authUrl } = json.data ?? {};
    try {
        await firestore_1.defaultDb
            .collection('subscriptions')
            .doc(storeId)
            .set({
            provider: 'paystack',
            status: 'pending',
            plan,
            reference,
            amount,
            yearlyAmountGhs: amount,
            billingCadence: 'yearly',
            contractMonths,
            email,
            createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid,
        }, { merge: true });
    }
    catch (e) {
        functions.logger.warn('Failed to write pending subscription doc', { e, storeId });
    }
    return {
        ok: true,
        authorizationUrl: authUrl,
        reference,
        publicKey: paystackPublicKey || null,
    };
});
/**
 * Callable: check if signup/workspace is unlocked after Paystack payment
 *
 * Reads subscriptions/<storeId> and returns whether status === 'active'
 */
exports.checkSignupUnlock = functions.https.onCall(async (data, context) => {
    assertAuthenticated(context);
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    if (!storeId) {
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required');
    }
    const subRef = firestore_1.defaultDb.collection('subscriptions').doc(storeId);
    const snap = await subRef.get();
    if (!snap.exists) {
        return {
            ok: true,
            unlocked: false,
            status: 'pending',
        };
    }
    const sub = snap.data();
    const status = typeof sub.status === 'string'
        ? sub.status.toLowerCase()
        : 'pending';
    const unlocked = status === 'active';
    return {
        ok: true,
        unlocked,
        status,
        plan: sub.plan ?? null,
        provider: sub.provider ?? 'paystack',
        reference: sub.reference ?? null,
        lastEvent: sub.lastEvent ?? null,
    };
});
/**
 * HTTP Webhook: Paystack event receiver (authoritative status)
 *
 * Verifies x-paystack-signature using HMAC SHA512.
 */
exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const signature = req.get('x-paystack-signature') || '';
        const { secret } = getPaystackConfig();
        if (!secret) {
            res.status(500).send('Paystack secret not configured');
            return;
        }
        const computed = crypto
            .createHmac('sha512', secret)
            .update(req.rawBody)
            .digest('hex');
        const safeEqual = signature.length === computed.length &&
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
        if (!safeEqual) {
            res.status(401).send('Invalid signature');
            return;
        }
        const event = req.body;
        const evtType = event?.event || 'unknown';
        const data = event?.data || {};
        functions.logger.info('Paystack webhook received', {
            event: evtType,
            reference: data.reference,
            email: data.customer?.email,
            amount: data.amount,
            metadata: data.metadata,
        });
        switch (evtType) {
            case 'charge.success': {
                const donationHandled = await updateDonationTransactionFromPaystackEvent(evtType, data);
                if (donationHandled)
                    break;
                const integrationOrderHandled = await updateIntegrationOrderFromPaystackEvent(evtType, data);
                if (integrationOrderHandled)
                    break;
                const storeId = data.metadata?.storeId;
                if (!storeId)
                    break;
                const rawPlan = data.metadata?.plan || data.plan || undefined;
                const plan = rawPlan || null;
                const email = data.customer?.email || null;
                const amount = typeof data.amount === 'number' ? data.amount / 100 : null;
                const paidAt = data.paid_at || null;
                const reference = data.reference || null;
                const fees = typeof data.fees === 'number' ? data.fees / 100 : null;
                const metadata = data.metadata || null;
                const contractMonths = getContractMonths(metadata);
                const period = buildContractPeriod(paidAt, contractMonths);
                const posChannel = data.channel ||
                    (typeof data.metadata?.channel === 'string'
                        ? data.metadata.channel
                        : null);
                await firestore_1.defaultDb
                    .collection('subscriptions')
                    .doc(storeId)
                    .set({
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
                    lastPaymentAt: paidAt ? firestore_1.admin.firestore.Timestamp.fromDate(new Date(paidAt)) : period.startTimestamp,
                    currency: data.currency || 'GHS',
                    channel: data.channel || null,
                    posChannel,
                    fees,
                    metadata,
                    paidAt,
                    updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                    lastEvent: evtType,
                }, { merge: true });
                await firestore_1.defaultDb
                    .collection('stores')
                    .doc(storeId)
                    .set({
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
                        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                    },
                    updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                await recordPaystackEvent(storeId, evtType, data);
                break;
            }
            case 'charge.failed': {
                const donationHandled = await updateDonationTransactionFromPaystackEvent(evtType, data);
                if (donationHandled)
                    break;
                const integrationOrderHandled = await updateIntegrationOrderFromPaystackEvent(evtType, data);
                if (integrationOrderHandled)
                    break;
                const storeId = data.metadata?.storeId;
                const reference = data.reference || null;
                const fees = typeof data.fees === 'number' ? data.fees / 100 : null;
                if (storeId) {
                    await firestore_1.defaultDb
                        .collection('subscriptions')
                        .doc(storeId)
                        .set({
                        provider: 'paystack',
                        status: 'failed',
                        plan: data.metadata?.plan ?? null,
                        reference,
                        fees,
                        channel: data.channel || null,
                        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                        lastEvent: evtType,
                    }, { merge: true });
                    await recordPaystackEvent(storeId, evtType, data);
                }
                break;
            }
            default: {
                const storeId = data.metadata?.storeId;
                if (storeId) {
                    await recordPaystackEvent(storeId, evtType, data);
                }
                break;
            }
        }
        res.status(200).send('ok');
    }
    catch (err) {
        functions.logger.error('paystackWebhook error', { err });
        res.status(500).send('error');
    }
});
exports.handlePaystackWebhook = exports.paystackWebhook;
exports.createPaystackCheckout = exports.createCheckout;
