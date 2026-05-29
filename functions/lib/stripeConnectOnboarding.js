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
exports.rejectStripePaymentSettings = exports.approveStripePaymentSettings = exports.disconnectStripeAccount = exports.stripeConnectCallback = exports.startStripeConnectOnboarding = exports.APP_BASE_URL = exports.STRIPE_CONNECT_REDIRECT_URL = exports.STRIPE_CONNECT_CLIENT_ID = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const crypto_1 = require("crypto");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("./firestore");
const stripeConnect_1 = require("./stripeConnect");
exports.STRIPE_CONNECT_CLIENT_ID = (0, params_1.defineString)('STRIPE_CONNECT_CLIENT_ID', { default: '' });
exports.STRIPE_CONNECT_REDIRECT_URL = (0, params_1.defineString)('STRIPE_CONNECT_REDIRECT_URL', { default: '' });
exports.APP_BASE_URL = (0, params_1.defineString)('APP_BASE_URL', { default: '' });
const STATE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_RETURN_PATH = '/settlement';
const STRIPE_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
const STRIPE_TOKEN_URL = 'https://connect.stripe.com/oauth/token';
const STRIPE_DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize';
function cleanText(value, max = 300) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function getStripeSecret() {
    const key = stripeConnect_1.STRIPE_SECRET_KEY.value()?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || '';
    if (!key)
        throw new functions.https.HttpsError('failed-precondition', 'STRIPE_SECRET_KEY is not configured.');
    return key;
}
function getStripeConnectClientId() {
    const clientId = exports.STRIPE_CONNECT_CLIENT_ID.value()?.trim() || process.env.STRIPE_CONNECT_CLIENT_ID?.trim() || '';
    if (!clientId)
        throw new functions.https.HttpsError('failed-precondition', 'STRIPE_CONNECT_CLIENT_ID is not configured.');
    return clientId;
}
function getStripeConnectRedirectUrl() {
    const redirectUrl = exports.STRIPE_CONNECT_REDIRECT_URL.value()?.trim() || process.env.STRIPE_CONNECT_REDIRECT_URL?.trim() || '';
    if (!redirectUrl)
        throw new functions.https.HttpsError('failed-precondition', 'STRIPE_CONNECT_REDIRECT_URL is not configured.');
    return redirectUrl;
}
function getAppBaseUrl() {
    const configured = exports.APP_BASE_URL.value()?.trim() || process.env.APP_BASE_URL?.trim() || '';
    return configured || 'https://www.sedifex.com';
}
function getClaims(auth) {
    return asRecord(auth?.token);
}
function isSedifexAdmin(auth) {
    const token = getClaims(auth);
    const role = cleanText(token.role, 80).toLowerCase();
    const sedifexRole = cleanText(token.sedifexRole ?? token.sedifex_role, 80).toLowerCase();
    return token.admin === true || token.sedifexAdmin === true || role === 'admin' || sedifexRole === 'admin' || sedifexRole === 'team';
}
function assertAuthenticated(context) {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
}
async function isSedifexTeamMember(uid) {
    const [adminSnap, teamSnap] = await Promise.all([
        firestore_1.defaultDb.collection('sedifexAdmins').doc(uid).get().catch(() => null),
        firestore_1.defaultDb.collection('sedifexTeam').doc(uid).get().catch(() => null),
    ]);
    return adminSnap?.exists === true || teamSnap?.exists === true;
}
async function assertSedifexAdminOrTeam(context) {
    assertAuthenticated(context);
    if (isSedifexAdmin(context.auth) || await isSedifexTeamMember(context.auth.uid))
        return;
    throw new functions.https.HttpsError('permission-denied', 'Sedifex admin access required.');
}
function ownsStoreFromData(storeId, uid, auth, storeData) {
    const authEmail = cleanText(auth.token.email, 220).toLowerCase();
    const ownerUid = cleanText(storeData.ownerUid ?? storeData.userId ?? storeData.createdBy ?? storeData.id, 180);
    const ownerEmail = cleanText(storeData.ownerEmail ?? storeData.email, 220).toLowerCase();
    return storeId === uid || ownerUid === uid || Boolean(authEmail && ownerEmail && authEmail === ownerEmail);
}
async function hasOwnerMembership(uid, storeId) {
    const directSnap = await firestore_1.defaultDb.collection('teamMembers').doc(uid).get();
    const directData = asRecord(directSnap.data());
    if (cleanText(directData.storeId, 180) === storeId && cleanText(directData.role, 40).toLowerCase() === 'owner')
        return true;
    const membershipSnaps = await firestore_1.defaultDb.collection('teamMembers').where('uid', '==', uid).limit(50).get();
    return membershipSnaps.docs.some((docSnap) => {
        const data = asRecord(docSnap.data());
        return cleanText(data.storeId, 180) === storeId && cleanText(data.role, 40).toLowerCase() === 'owner';
    });
}
async function assertCanManageStorePayments(context, storeId) {
    assertAuthenticated(context);
    const uid = context.auth.uid;
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    const storeData = asRecord(storeSnap.data());
    if (isSedifexAdmin(context.auth) || await isSedifexTeamMember(uid))
        return storeData;
    if (ownsStoreFromData(storeId, uid, context.auth, storeData) || await hasOwnerMembership(uid, storeId))
        return storeData;
    throw new functions.https.HttpsError('permission-denied', 'Store owner or Sedifex admin access required.');
}
function normalizeReturnPath(value) {
    const requested = cleanText(value, 800) || DEFAULT_RETURN_PATH;
    if (!requested.startsWith('/') || requested.startsWith('//'))
        return DEFAULT_RETURN_PATH;
    try {
        const parsed = new URL(requested, 'https://sedifex.local');
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    catch {
        return DEFAULT_RETURN_PATH;
    }
}
function buildAppRedirect(returnPath, params) {
    const url = new URL(normalizeReturnPath(returnPath), getAppBaseUrl());
    for (const [key, value] of Object.entries(params)) {
        if (value)
            url.searchParams.set(key, value);
    }
    return url.toString();
}
function timestampToMillis(value) {
    if (value instanceof firestore_1.admin.firestore.Timestamp)
        return value.toMillis();
    if (value && typeof value === 'object' && typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    if (value instanceof Date)
        return value.getTime();
    return 0;
}
async function markStateFailed(state, description) {
    if (!state)
        return null;
    const ref = firestore_1.defaultDb.collection('stripeConnectStates').doc(state);
    const snap = await ref.get();
    const data = snap.exists ? asRecord(snap.data()) : null;
    if (cleanText(data?.status, 40) !== 'completed') {
        await ref.set({
            status: 'failed',
            error: description,
            failedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return data;
}
async function exchangeCodeForConnectedAccount(code) {
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    const response = await fetch(STRIPE_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getStripeSecret()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
        throw new Error(payload?.error_description || payload?.error || `stripe-oauth-token-failed-${response.status}`);
    }
    return payload;
}
async function deauthorizeStripeAccount(connectedAccountId) {
    const params = new URLSearchParams();
    params.set('client_id', getStripeConnectClientId());
    params.set('stripe_user_id', connectedAccountId);
    const response = await fetch(STRIPE_DEAUTHORIZE_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getStripeSecret()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error_description || payload?.error || `stripe-deauthorize-failed-${response.status}`);
    }
}
exports.startStripeConnectOnboarding = functions.https.onCall(async (data, context) => {
    assertAuthenticated(context);
    const storeId = cleanText(data?.storeId, 180);
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required.');
    await assertCanManageStorePayments(context, storeId);
    const clientId = getStripeConnectClientId();
    const redirectUri = getStripeConnectRedirectUrl();
    const state = (0, crypto_1.randomBytes)(32).toString('base64url');
    const returnPath = normalizeReturnPath(data?.returnPath);
    const nowMs = Date.now();
    const expiresAt = firestore_1.admin.firestore.Timestamp.fromMillis(nowMs + STATE_TTL_MS);
    await firestore_1.defaultDb.collection('stripeConnectStates').doc(state).set({
        storeId,
        requestedByUid: context.auth.uid,
        returnPath,
        status: 'pending',
        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
    });
    const url = new URL(STRIPE_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'read_write');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return { ok: true, url: url.toString() };
});
exports.stripeConnectCallback = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).send('method-not-allowed');
        return;
    }
    const state = cleanText(req.query.state, 500);
    const error = cleanText(req.query.error, 300);
    const errorDescription = cleanText(req.query.error_description, 800);
    try {
        if (error) {
            const stateData = await markStateFailed(state, errorDescription || error);
            res.redirect(302, buildAppRedirect(stateData?.returnPath, { stripe: 'error', error }));
            return;
        }
        const code = cleanText(req.query.code, 800);
        if (!state || !code)
            throw new Error('missing-state-or-code');
        const stateRef = firestore_1.defaultDb.collection('stripeConnectStates').doc(state);
        const stateSnap = await stateRef.get();
        if (!stateSnap.exists)
            throw new Error('invalid-state');
        const stateData = asRecord(stateSnap.data());
        if (cleanText(stateData.status, 40) !== 'pending')
            throw new Error('state-not-pending');
        if (timestampToMillis(stateData.expiresAt) <= Date.now())
            throw new Error('state-expired');
        const storeId = cleanText(stateData.storeId, 180);
        if (!storeId)
            throw new Error('state-missing-store-id');
        const tokenPayload = await exchangeCodeForConnectedAccount(code);
        const stripeConnectedAccountId = cleanText(tokenPayload.stripe_user_id, 120);
        if (!stripeConnectedAccountId)
            throw new Error('stripe-user-id-missing');
        const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
        const requestedByUid = cleanText(stateData.requestedByUid, 180) || 'stripe_callback';
        await firestore_1.defaultDb.runTransaction(async (tx) => {
            tx.set(firestore_1.defaultDb.collection('stores').doc(storeId), {
                'paymentSettings.enabled': false,
                'paymentSettings.approvalStatus': 'pending_review',
                'paymentSettings.region': 'europe',
                'paymentSettings.provider': 'stripe',
                'paymentSettings.platformFeePercent': 3,
                'paymentSettings.feePaidBy': 'seller',
                'paymentSettings.stripeConnectedAccountId': stripeConnectedAccountId,
                'paymentSettings.managedBy': 'sedifex',
                'paymentSettings.updatedBy': requestedByUid,
                'paymentSettings.updatedAt': now,
                'paymentSettings.stripeConnectedAt': now,
                stripeConnectedAccountId,
                paymentProvider: 'stripe',
                paymentRegion: 'europe',
                updatedAt: now,
            }, { merge: true });
            tx.set(stateRef, {
                status: 'completed',
                stripeConnectedAccountId,
                completedAt: now,
                updatedAt: now,
            }, { merge: true });
        });
        res.redirect(302, buildAppRedirect(stateData.returnPath, { stripe: 'connected' }));
    }
    catch (callbackError) {
        const message = callbackError instanceof Error ? callbackError.message : 'stripe-connect-callback-failed';
        functions.logger.error('[stripeConnectCallback] failed', { state, message });
        const stateData = await markStateFailed(state, message).catch(() => null);
        res.redirect(302, buildAppRedirect(stateData?.returnPath, { stripe: 'error', error: message }));
    }
});
exports.disconnectStripeAccount = functions.https.onCall(async (data, context) => {
    const storeId = cleanText(data?.storeId, 180);
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required.');
    const storeData = await assertCanManageStorePayments(context, storeId);
    const paymentSettings = asRecord(storeData.paymentSettings);
    const stripeConnectedAccountId = cleanText(paymentSettings.stripeConnectedAccountId ?? storeData.stripeConnectedAccountId, 120);
    let deauthorized = false;
    let deauthorizeError = '';
    if (stripeConnectedAccountId && isSedifexAdmin(context.auth)) {
        try {
            await deauthorizeStripeAccount(stripeConnectedAccountId);
            deauthorized = true;
        }
        catch (error) {
            deauthorizeError = error instanceof Error ? error.message : 'stripe-deauthorize-failed';
            functions.logger.warn('[disconnectStripeAccount] Stripe deauthorize failed', { storeId, stripeConnectedAccountId, deauthorizeError });
        }
    }
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await firestore_1.defaultDb.collection('stores').doc(storeId).set({
        'paymentSettings.approvalStatus': 'disabled',
        'paymentSettings.enabled': false,
        'paymentSettings.disabledAt': now,
        'paymentSettings.updatedAt': now,
        'paymentSettings.updatedBy': context.auth?.uid ?? 'stripe_disconnect',
        updatedAt: now,
    }, { merge: true });
    return {
        ok: true,
        storeId,
        deauthorized,
        deauthorizeError: deauthorizeError || null,
    };
});
exports.approveStripePaymentSettings = functions.https.onCall(async (data, context) => {
    await assertSedifexAdminOrTeam(context);
    const storeId = cleanText(data?.storeId, 180);
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required.');
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    const storeData = asRecord(storeSnap.data());
    const paymentSettings = asRecord(storeData.paymentSettings);
    const stripeConnectedAccountId = cleanText(paymentSettings.stripeConnectedAccountId ?? storeData.stripeConnectedAccountId, 120);
    if (!stripeConnectedAccountId) {
        throw new functions.https.HttpsError('failed-precondition', 'Store has no Stripe connected account.');
    }
    const requestedFee = Number(data?.platformFeePercent);
    const existingFee = Number(paymentSettings.platformFeePercent);
    const platformFeePercent = Number.isFinite(requestedFee)
        ? requestedFee
        : Number.isFinite(existingFee)
            ? existingFee
            : 3;
    const normalizedFee = Math.min(25, Math.max(0, Math.round(platformFeePercent * 100) / 100));
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await firestore_1.defaultDb.collection('stores').doc(storeId).set({
        'paymentSettings.enabled': true,
        'paymentSettings.approvalStatus': 'active',
        'paymentSettings.provider': 'stripe',
        'paymentSettings.region': 'europe',
        'paymentSettings.platformFeePercent': normalizedFee,
        'paymentSettings.feePaidBy': 'seller',
        'paymentSettings.approvedAt': now,
        'paymentSettings.updatedAt': now,
        'paymentSettings.updatedBy': context.auth.uid,
        paymentProvider: 'stripe',
        paymentRegion: 'europe',
        updatedAt: now,
    }, { merge: true });
    return { ok: true, storeId, platformFeePercent: normalizedFee };
});
exports.rejectStripePaymentSettings = functions.https.onCall(async (data, context) => {
    await assertSedifexAdminOrTeam(context);
    const storeId = cleanText(data?.storeId, 180);
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required.');
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await firestore_1.defaultDb.collection('stores').doc(storeId).set({
        'paymentSettings.enabled': false,
        'paymentSettings.approvalStatus': 'rejected',
        'paymentSettings.rejectionReason': cleanText(data?.reason, 800) || null,
        'paymentSettings.updatedAt': now,
        'paymentSettings.updatedBy': context.auth.uid,
        updatedAt: now,
    }, { merge: true });
    return { ok: true, storeId };
});
