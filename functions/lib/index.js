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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckout = exports.createPaystackCheckout = exports.sendBulkEmail = exports.sendBulkMessage = exports.emitBookingWebhooks = exports.emitProductWebhooks = exports.enrichProductDataAfterSave = exports.syncPublicProducts = exports.integrationTopSelling = exports.integrationCustomers = exports.integrationGoogleMerchantFeed = exports.integrationPublicCatalog = exports.integrationTikTokVideos = exports.integrationGallery = exports.v1IntegrationBookings = exports.v1IntegrationAvailability = exports.v1IntegrationPromo = exports.integrationPromo = exports.v1IntegrationProducts = exports.integrationProducts = exports.v1Products = exports.tiktokOAuthCallback = exports.startTikTokConnect = exports.revokeWebhookEndpoint = exports.upsertWebhookEndpoint = exports.listWebhookEndpoints = exports.rotateIntegrationApiKey = exports.revokeIntegrationApiKey = exports.createIntegrationApiKey = exports.listIntegrationApiKeys = exports.listStoreProducts = exports.logPaymentReminder = exports.logReceiptShareAttempt = exports.logReceiptShare = exports.commitSale = exports.acceptStoreMasterInvite = exports.createStoreMasterInviteLink = exports.manageStaffAccount = exports.generateSocialPost = exports.generateAiAdvice = exports.resolveStoreAccess = exports.initializeStore = exports.handleUserCreate = exports.googleBusinessUploadLocationMedia = exports.googleBusinessLocations = exports.googleAdsMetricsSync = exports.googleAdsCampaign = exports.googleAdsOAuthCallback = exports.googleAdsOAuthStart = exports.checkSignupUnlock = void 0;
exports.__testing = exports.handlePaystackWebhook = exports.createBulkCreditsCheckout = exports.cancelPaystackSubscription = void 0;
// functions/src/index.ts
const functions = __importStar(require("firebase-functions/v1"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const firestore_1 = require("./firestore");
const phone_1 = require("./phone");
const publicSlug_1 = require("./utils/publicSlug");
var paystack_1 = require("./paystack");
Object.defineProperty(exports, "checkSignupUnlock", { enumerable: true, get: function () { return paystack_1.checkSignupUnlock; } });
var googleAds_1 = require("./googleAds");
Object.defineProperty(exports, "googleAdsOAuthStart", { enumerable: true, get: function () { return googleAds_1.googleAdsOAuthStart; } });
Object.defineProperty(exports, "googleAdsOAuthCallback", { enumerable: true, get: function () { return googleAds_1.googleAdsOAuthCallback; } });
Object.defineProperty(exports, "googleAdsCampaign", { enumerable: true, get: function () { return googleAds_1.googleAdsCampaign; } });
Object.defineProperty(exports, "googleAdsMetricsSync", { enumerable: true, get: function () { return googleAds_1.googleAdsMetricsSync; } });
__exportStar(require("./googleShopping"), exports);
var googleBusinessProfile_1 = require("./googleBusinessProfile");
Object.defineProperty(exports, "googleBusinessLocations", { enumerable: true, get: function () { return googleBusinessProfile_1.googleBusinessLocations; } });
Object.defineProperty(exports, "googleBusinessUploadLocationMedia", { enumerable: true, get: function () { return googleBusinessProfile_1.googleBusinessUploadLocationMedia; } });
const VALID_ROLES = new Set(['owner', 'staff']);
const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;
const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
const BULK_MESSAGE_LIMIT = 1000;
const BULK_MESSAGE_BATCH_LIMIT = 200;
const BULK_EMAIL_BATCH_LIMIT = 500;
const SMS_SEGMENT_SIZE = 160;
const OPENAI_API_KEY = (0, params_1.defineString)('OPENAI_API_KEY', { default: '' });
const OPENAI_MODEL = (0, params_1.defineString)('OPENAI_MODEL', { default: 'gpt-4o-mini' });
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const INTEGRATION_CONTRACT_VERSION = (0, params_1.defineString)('INTEGRATION_CONTRACT_VERSION', {
    default: '2026-04-13',
});
const SEDIFEX_INTEGRATION_API_KEY = (0, params_1.defineString)('SEDIFEX_INTEGRATION_API_KEY', { default: '' });
const BOOKING_DEFAULT_SERVICE_ID_ENV_KEY = 'BOOKING_DEFAULT_SERVICE_ID';
/** ============================================================================
 *  HELPERS
 * ==========================================================================*/
let openAiConfigWarned = false;
let integrationApiKeyWarned = false;
function getOpenAiConfig() {
    const apiKey = OPENAI_API_KEY.value()?.trim() || process.env.OPENAI_API_KEY?.trim() || '';
    const model = OPENAI_MODEL.value()?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    if (!apiKey && !openAiConfigWarned) {
        functions.logger.warn('OPENAI_API_KEY is missing. Set it via Firebase params before calling generateAiAdvice.');
        openAiConfigWarned = true;
    }
    return { apiKey, model };
}
function getBookingDefaultServiceId() {
    return process.env[BOOKING_DEFAULT_SERVICE_ID_ENV_KEY]?.trim() || '';
}
function getIntegrationMasterApiKey() {
    const apiKey = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() ||
        process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() ||
        '';
    if (!apiKey && !integrationApiKeyWarned) {
        functions.logger.warn('SEDIFEX_INTEGRATION_API_KEY is missing. Set it via Firebase params before calling integration HTTP endpoints.');
        integrationApiKeyWarned = true;
    }
    return apiKey;
}
function normalizeAiAdvicePayload(raw) {
    const question = typeof raw?.question === 'string' ? raw.question.trim() : '';
    if (!question)
        throw new functions.https.HttpsError('invalid-argument', 'Question is required');
    if (question.length > 2000) {
        throw new functions.https.HttpsError('invalid-argument', 'Question must be 2000 characters or less');
    }
    const storeId = typeof raw?.storeId === 'string' ? raw.storeId.trim() : '';
    const jsonContext = raw?.jsonContext && typeof raw.jsonContext === 'object'
        ? raw.jsonContext
        : {};
    return { question, storeId, jsonContext };
}
function normalizeSocialPostPayload(raw) {
    const storeId = typeof raw?.storeId === 'string' ? raw.storeId.trim() : '';
    const platformRaw = typeof raw?.platform === 'string' ? raw.platform.trim().toLowerCase() : '';
    const platform = platformRaw === 'tiktok' ? 'tiktok' : 'instagram';
    const productId = typeof raw?.productId === 'string' ? raw.productId.trim() : '';
    const productRaw = raw?.product && typeof raw.product === 'object'
        ? raw.product
        : {};
    const product = {
        id: typeof productRaw.id === 'string' ? productRaw.id.trim() : '',
        name: typeof productRaw.name === 'string' ? productRaw.name.trim() : '',
        category: typeof productRaw.category === 'string' ? productRaw.category.trim() : '',
        description: typeof productRaw.description === 'string' ? productRaw.description.trim() : '',
        price: typeof productRaw.price === 'number' && Number.isFinite(productRaw.price) ? productRaw.price : null,
        imageUrl: typeof productRaw.imageUrl === 'string' ? productRaw.imageUrl.trim() : '',
        itemType: productRaw.itemType === 'service' || productRaw.itemType === 'made_to_order'
            ? productRaw.itemType
            : 'product',
    };
    if (!productId && !product.id && !product.name) {
        throw new functions.https.HttpsError('invalid-argument', 'Choose a product or service to generate a post');
    }
    return { storeId, platform, productId, product };
}
async function verifyOwnerEmail(uid) {
    try {
        const user = await firestore_1.admin.auth().getUser(uid);
        if (!user.emailVerified) {
            await firestore_1.admin.auth().updateUser(uid, { emailVerified: true });
        }
    }
    catch (error) {
        console.warn('[auth] Unable to auto-verify owner email', error);
    }
}
function normalizeContactPayload(contact) {
    let hasPhone = false;
    let hasFirstSignupEmail = false;
    let phone;
    let firstSignupEmail;
    if (contact && typeof contact === 'object') {
        if ('phone' in contact) {
            hasPhone = true;
            const raw = contact.phone;
            if (raw === null || raw === undefined || raw === '') {
                phone = null;
            }
            else if (typeof raw === 'string') {
                const normalized = (0, phone_1.normalizePhoneE164)(raw);
                phone = normalized ? normalized : null;
            }
            else {
                throw new functions.https.HttpsError('invalid-argument', 'Phone must be a string when provided');
            }
        }
        if ('firstSignupEmail' in contact) {
            hasFirstSignupEmail = true;
            const raw = contact.firstSignupEmail;
            if (raw === null || raw === undefined || raw === '') {
                firstSignupEmail = null;
            }
            else if (typeof raw === 'string') {
                const trimmed = raw.trim().toLowerCase();
                firstSignupEmail = trimmed ? trimmed : null;
            }
            else {
                throw new functions.https.HttpsError('invalid-argument', 'First signup email must be a string when provided');
            }
        }
    }
    return { phone, hasPhone, firstSignupEmail, hasFirstSignupEmail };
}
// optional helper (ok if unused)
function normalizeStoreProfile(profile) {
    let businessName;
    let country;
    let city;
    let phone;
    if (profile && typeof profile === 'object') {
        if ('businessName' in profile) {
            const raw = profile.businessName;
            if (raw === null || raw === undefined || raw === '')
                businessName = null;
            else if (typeof raw === 'string')
                businessName = raw.trim() || null;
            else {
                throw new functions.https.HttpsError('invalid-argument', 'Business name must be a string when provided');
            }
        }
        if ('country' in profile) {
            const raw = profile.country;
            if (raw === null || raw === undefined || raw === '')
                country = null;
            else if (typeof raw === 'string')
                country = raw.trim() || null;
            else {
                throw new functions.https.HttpsError('invalid-argument', 'Country must be a string when provided');
            }
        }
        if ('city' in profile) {
            const raw = profile.city;
            if (raw === null || raw === undefined || raw === '')
                city = null;
            else if (typeof raw === 'string')
                city = raw.trim() || null;
            else {
                throw new functions.https.HttpsError('invalid-argument', 'City must be a string when provided');
            }
        }
        if ('phone' in profile) {
            const raw = profile.phone;
            if (raw === null || raw === undefined || raw === '')
                phone = null;
            else if (typeof raw === 'string')
                phone = (0, phone_1.normalizePhoneE164)(raw) || null;
            else {
                throw new functions.https.HttpsError('invalid-argument', 'Store phone must be a string when provided');
            }
        }
    }
    return { businessName, country, city, phone };
}
function normalizeBulkMessageChannel(value) {
    if (value === 'sms')
        return value;
    throw new functions.https.HttpsError('invalid-argument', 'Channel must be sms');
}
function normalizeBulkMessageRecipients(value) {
    if (!Array.isArray(value)) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipients must be an array');
    }
    return value.map((recipient, index) => {
        if (!recipient || typeof recipient !== 'object') {
            throw new functions.https.HttpsError('invalid-argument', `Recipient at index ${index} must be an object`);
        }
        const raw = recipient;
        const phone = typeof raw.phone === 'string' ? (0, phone_1.normalizePhoneE164)(raw.phone) : '';
        const name = typeof raw.name === 'string' ? raw.name.trim() : undefined;
        if (!phone) {
            throw new functions.https.HttpsError('invalid-argument', `Recipient at index ${index} is missing a phone number`);
        }
        return {
            id: typeof raw.id === 'string' ? raw.id : undefined,
            name,
            phone,
        };
    });
}
function normalizeDialCode(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    return null;
}
function normalizeSmsRateTable(data) {
    if (!data || typeof data !== 'object') {
        throw new functions.https.HttpsError('failed-precondition', 'Bulk SMS rate table is not configured.');
    }
    const defaultGroup = typeof data.defaultGroup === 'string' && data.defaultGroup.trim()
        ? data.defaultGroup.trim()
        : 'ROW';
    const dialCodeToGroup = {};
    if (data.dialCodeToGroup && typeof data.dialCodeToGroup === 'object') {
        Object.entries(data.dialCodeToGroup).forEach(([dialCode, group]) => {
            const normalizedDial = normalizeDialCode(dialCode);
            if (!normalizedDial || typeof group !== 'string' || !group.trim())
                return;
            dialCodeToGroup[normalizedDial] = group.trim();
        });
    }
    const sms = {};
    if (data.sms && typeof data.sms === 'object') {
        Object.entries(data.sms).forEach(([group, rate]) => {
            if (!rate || typeof rate !== 'object')
                return;
            const perSegment = rate.perSegment;
            if (typeof perSegment !== 'number' || !Number.isFinite(perSegment))
                return;
            if (typeof group === 'string' && group.trim()) {
                sms[group.trim()] = { perSegment };
            }
        });
    }
    return { defaultGroup, dialCodeToGroup, sms };
}
function resolveGroupFromPhone(phone, dialCodeToGroup, defaultGroup) {
    if (!phone)
        return defaultGroup;
    const digits = phone.replace(/\D/g, '');
    if (!digits)
        return defaultGroup;
    let matchedGroup = null;
    let matchedLength = 0;
    Object.entries(dialCodeToGroup).forEach(([dialCode, group]) => {
        const normalizedDial = dialCode.replace(/\D/g, '');
        if (!normalizedDial)
            return;
        if (digits.startsWith(normalizedDial) && normalizedDial.length > matchedLength) {
            matchedGroup = group;
            matchedLength = normalizedDial.length;
        }
    });
    return matchedGroup ?? defaultGroup;
}
function normalizeBulkMessagePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new functions.https.HttpsError('invalid-argument', 'Payload is required');
    }
    const storeId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'Store id is required');
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message)
        throw new functions.https.HttpsError('invalid-argument', 'Message is required');
    if (message.length > BULK_MESSAGE_LIMIT) {
        throw new functions.https.HttpsError('invalid-argument', `Message must be ${BULK_MESSAGE_LIMIT} characters or less`);
    }
    const channel = normalizeBulkMessageChannel(payload.channel);
    const recipients = normalizeBulkMessageRecipients(payload.recipients);
    if (recipients.length > BULK_MESSAGE_BATCH_LIMIT) {
        throw new functions.https.HttpsError('invalid-argument', `Recipient list is limited to ${BULK_MESSAGE_BATCH_LIMIT} contacts per send`);
    }
    return { storeId, channel, message, recipients };
}
function normalizeBulkEmailPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new functions.https.HttpsError('invalid-argument', 'Payload is required');
    }
    const storeId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'Store id is required');
    const fromName = typeof payload.fromName === 'string' ? payload.fromName.trim() : '';
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const html = typeof payload.html === 'string' ? payload.html.trim() : '';
    if (!subject)
        throw new functions.https.HttpsError('invalid-argument', 'Email subject is required');
    if (!html)
        throw new functions.https.HttpsError('invalid-argument', 'Email content is required');
    const recipientsRaw = Array.isArray(payload.recipients) ? payload.recipients : [];
    const recipients = recipientsRaw
        .map(item => {
        const row = item && typeof item === 'object' ? item : {};
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
        if (!email)
            return null;
        return { id, name, email };
    })
        .filter(Boolean);
    if (!recipients.length) {
        throw new functions.https.HttpsError('invalid-argument', 'Select at least one recipient');
    }
    if (recipients.length > BULK_EMAIL_BATCH_LIMIT) {
        throw new functions.https.HttpsError('invalid-argument', `Recipient list is limited to ${BULK_EMAIL_BATCH_LIMIT} contacts per send`);
    }
    return {
        storeId,
        fromName: fromName || 'Sedifex Campaign',
        subject,
        html,
        recipients,
    };
}
function calculateDaysRemaining(target, now) {
    if (!target || typeof target.toMillis !== 'function')
        return null;
    const diffMs = target.toMillis() - now.toMillis();
    return Math.ceil(diffMs / MILLIS_PER_DAY);
}
function getRoleFromToken(token) {
    const role = typeof token?.role === 'string' ? token.role : null;
    return role && VALID_ROLES.has(role) ? role : null;
}
function assertAuthenticated(context) {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
}
function assertOwnerAccess(context) {
    assertAuthenticated(context);
    const role = getRoleFromToken(context.auth.token);
    if (role !== 'owner') {
        throw new functions.https.HttpsError('permission-denied', 'Owner access required');
    }
}
async function verifyOwnerForStore(uid, storeId) {
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const memberData = (memberSnap.data() ?? {});
    const memberRole = typeof memberData.role === 'string' ? memberData.role : '';
    const memberStoreId = typeof memberData.storeId === 'string' ? memberData.storeId : '';
    if (memberRole === 'owner' && memberStoreId === storeId) {
        return;
    }
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    const storeData = (storeSnap.data() ?? {});
    const ownerUid = typeof storeData.ownerUid === 'string' ? storeData.ownerUid : '';
    if (ownerUid && ownerUid === uid) {
        await memberRef.set({
            uid,
            role: 'owner',
            storeId,
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
    }
    throw new functions.https.HttpsError('permission-denied', 'Owner permission for this workspace is required');
}
function assertStaffAccess(context) {
    assertAuthenticated(context);
    const role = getRoleFromToken(context.auth.token);
    if (!role)
        throw new functions.https.HttpsError('permission-denied', 'Staff access required');
}
async function resolveStaffStoreId(uid) {
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const memberData = (memberSnap.data() ?? {});
    const storeIdRaw = typeof memberData.storeId === 'string' ? memberData.storeId.trim() : '';
    if (!storeIdRaw) {
        throw new functions.https.HttpsError('failed-precondition', 'No store associated with this account');
    }
    return storeIdRaw;
}
async function updateUserClaims(uid, role) {
    const userRecord = await firestore_1.admin.auth().getUser(uid).catch(() => null);
    const existingClaims = (userRecord?.customClaims ?? {});
    const nextClaims = { ...existingClaims, role };
    delete nextClaims.stores;
    delete nextClaims.activeStoreId;
    delete nextClaims.storeId;
    delete nextClaims.roleByStore;
    await firestore_1.admin.auth().setCustomUserClaims(uid, nextClaims);
    return nextClaims;
}
function normalizeManageStaffPayload(data) {
    const storeIdRaw = data.storeId;
    const storeId = typeof storeIdRaw === 'string' ? storeIdRaw.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const role = typeof data.role === 'string' ? data.role.trim() : '';
    const passwordRaw = data.password;
    let password;
    if (passwordRaw === null || passwordRaw === undefined || passwordRaw === '')
        password = undefined;
    else if (typeof passwordRaw === 'string')
        password = passwordRaw;
    else {
        throw new functions.https.HttpsError('invalid-argument', 'Password must be a string when provided');
    }
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'A storeId is required');
    if (!email)
        throw new functions.https.HttpsError('invalid-argument', 'A valid email is required');
    if (!role)
        throw new functions.https.HttpsError('invalid-argument', 'A role is required');
    if (!VALID_ROLES.has(role))
        throw new functions.https.HttpsError('invalid-argument', 'Unsupported role requested');
    const actionRaw = typeof data.action === 'string' ? data.action.trim() : 'invite';
    const action = ['invite', 'reset', 'deactivate'].includes(actionRaw)
        ? actionRaw
        : 'invite';
    return { storeId, email, role, password, action };
}
function normalizeCreateStoreMasterInvitePayload(data) {
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    if (!storeId)
        throw new functions.https.HttpsError('invalid-argument', 'A storeId is required');
    const roleRaw = typeof data?.role === 'string' ? data.role.trim().toLowerCase() : 'staff';
    const role = roleRaw === 'owner' ? 'owner' : 'staff';
    const expiresInHoursRaw = typeof data?.expiresInHours === 'number' && Number.isFinite(data.expiresInHours)
        ? Math.floor(data.expiresInHours)
        : 168;
    const expiresInHours = Math.min(Math.max(expiresInHoursRaw, 1), 24 * 30);
    const maxUsesRaw = typeof data?.maxUses === 'number' && Number.isFinite(data.maxUses)
        ? Math.floor(data.maxUses)
        : 1;
    const maxUses = Math.min(Math.max(maxUsesRaw, 1), 200);
    return { storeId, role, expiresInHours, maxUses };
}
function extractInviteToken(tokenOrUrl) {
    const value = tokenOrUrl.trim();
    if (!value)
        return '';
    if (value.includes('://')) {
        try {
            const parsed = new URL(value);
            const token = parsed.searchParams.get('token') || parsed.searchParams.get('invite');
            return token ? token.trim() : '';
        }
        catch {
            return '';
        }
    }
    return value;
}
function normalizeAcceptStoreMasterInvitePayload(data) {
    const tokenOrUrl = typeof data?.tokenOrUrl === 'string' ? data.tokenOrUrl : '';
    const token = extractInviteToken(tokenOrUrl);
    const childStoreId = typeof data?.childStoreId === 'string' ? data.childStoreId.trim() : '';
    const confirmOverwrite = data?.confirmOverwrite === true;
    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid invite token is required');
    }
    if (!childStoreId) {
        throw new functions.https.HttpsError('invalid-argument', 'A childStoreId is required');
    }
    return { token, childStoreId, confirmOverwrite };
}
function normalizeListProductsPayload(data) {
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    const requestedLimit = typeof data?.limit === 'number' && Number.isFinite(data.limit)
        ? Math.floor(data.limit)
        : 200;
    const limit = Math.min(Math.max(requestedLimit, 1), 500);
    return { storeId, limit };
}
function timestampDaysFromNow(days) {
    const now = new Date();
    now.setDate(now.getDate() + days);
    return firestore_1.admin.firestore.Timestamp.fromDate(now);
}
function normalizeStoreProfilePayload(profile) {
    let phone;
    let ownerName;
    let businessName;
    let country;
    let city;
    let addressLine1;
    if (profile && typeof profile === 'object') {
        const normalize = (value) => {
            if (value === null || value === undefined || value === '')
                return null;
            if (typeof value === 'string')
                return value.trim() || null;
            throw new functions.https.HttpsError('invalid-argument', 'Profile fields must be strings when provided');
        };
        if ('phone' in profile) {
            const normalized = normalize(profile.phone);
            phone = normalized ? (0, phone_1.normalizePhoneE164)(normalized) || null : null;
        }
        if ('ownerName' in profile)
            ownerName = normalize(profile.ownerName);
        if ('businessName' in profile)
            businessName = normalize(profile.businessName);
        if ('country' in profile)
            country = normalize(profile.country);
        if ('city' in profile)
            city = normalize(profile.city);
        if (!city && 'town' in profile)
            city = normalize(profile.town);
        if ('addressLine1' in profile)
            addressLine1 = normalize(profile.addressLine1);
        if (!addressLine1 && 'address' in profile)
            addressLine1 = normalize(profile.address);
    }
    return { phone, ownerName, businessName, country, city, addressLine1 };
}
/** ============================================================================
 *  AUTH TRIGGER: seed teamMembers on first user creation
 * ==========================================================================*/
exports.handleUserCreate = functions.auth.user().onCreate(async (user) => {
    const uid = user.uid;
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await firestore_1.defaultDb.collection('teamMembers').doc(uid).set({
        uid,
        email: user.email ?? null,
        phone: user.phoneNumber ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
    }, { merge: true });
});
/** ============================================================================
 *  CALLABLE: initializeStore
 * ==========================================================================*/
exports.initializeStore = functions.https.onCall(async (data, context) => {
    assertAuthenticated(context);
    const uid = context.auth.uid;
    const token = context.auth.token;
    const email = typeof token.email === 'string' ? token.email : null;
    const tokenPhone = typeof token.phone_number === 'string' ? token.phone_number : null;
    const payload = (data ?? {});
    const contact = normalizeContactPayload(payload.contact);
    const profile = normalizeStoreProfilePayload(payload.profile);
    const requestedStoreIdRaw = payload.storeId;
    const requestedStoreId = typeof requestedStoreIdRaw === 'string' ? requestedStoreIdRaw.trim() : '';
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const existingData = (memberSnap.data() ?? {});
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    let existingStoreId = null;
    if (typeof existingData.storeId === 'string' &&
        existingData.storeId.trim() !== '') {
        existingStoreId = existingData.storeId;
    }
    let storeId = existingStoreId;
    if (!storeId) {
        storeId = requestedStoreId || uid;
    }
    // --- Determine role ---
    const role = requestedStoreId ? 'staff' : 'owner';
    const workspaceSlug = storeId;
    // --- Validate store existence when joining as team-member ---
    const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
    const storeSnap = await storeRef.get();
    if (requestedStoreId && !storeSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'No company was found with that Store ID. Please check with your admin.');
    }
    // --- Determine contact info for teamMembers ---
    const existingPhone = typeof existingData.phone === 'string' ? existingData.phone : null;
    const resolvedPhone = contact.hasPhone
        ? contact.phone ?? null
        : existingPhone || tokenPhone || null;
    const existingFirstSignupEmail = typeof existingData.firstSignupEmail === 'string'
        ? existingData.firstSignupEmail
        : null;
    const resolvedFirstSignupEmail = contact.hasFirstSignupEmail
        ? contact.firstSignupEmail ?? null
        : existingFirstSignupEmail || (email ? email.toLowerCase() : null);
    // --- Save team member info ---
    const memberData = {
        uid,
        email,
        role,
        storeId,
        phone: resolvedPhone,
        firstSignupEmail: resolvedFirstSignupEmail,
        invitedBy: existingData.invitedBy || uid,
        updatedAt: timestamp,
    };
    if (!memberSnap.exists)
        memberData.createdAt = timestamp;
    await memberRef.set(memberData, { merge: true });
    // --- If owner, create/merge store + workspace profile info ---
    if (role === 'owner') {
        const baseStoreData = storeSnap.data() ?? {};
        const previousBilling = (baseStoreData.billing || {});
        const nowTs = firestore_1.admin.firestore.Timestamp.now();
        const trialEndsAt = previousBilling.trialEndsAt ||
            previousBilling.trialEnd ||
            timestampDaysFromNow(TRIAL_DAYS);
        const graceEndsAt = previousBilling.graceEndsAt ||
            previousBilling.graceEnd ||
            timestampDaysFromNow(TRIAL_DAYS + GRACE_DAYS);
        const billingStatus = previousBilling.status === 'active' ||
            previousBilling.status === 'past_due'
            ? previousBilling.status
            : 'trial';
        const billingData = {
            planKey: previousBilling.planKey || 'standard',
            status: billingStatus,
            trialEndsAt,
            graceEndsAt,
            paystackCustomerCode: previousBilling.paystackCustomerCode !== undefined
                ? previousBilling.paystackCustomerCode
                : null,
            paystackSubscriptionCode: previousBilling.paystackSubscriptionCode !== undefined
                ? previousBilling.paystackSubscriptionCode
                : null,
            paystackEmailToken: previousBilling.paystackEmailToken !== undefined
                ? previousBilling.paystackEmailToken
                : null,
            paystackPlanCode: previousBilling.paystackPlanCode !== undefined
                ? previousBilling.paystackPlanCode
                : null,
            currentPeriodEnd: previousBilling.currentPeriodEnd !== undefined
                ? previousBilling.currentPeriodEnd
                : null,
            lastEventAt: nowTs,
            lastChargeReference: previousBilling.lastChargeReference !== undefined
                ? previousBilling.lastChargeReference
                : null,
        };
        const displayName = baseStoreData.displayName ||
            profile.businessName ||
            profile.ownerName ||
            null;
        const storeData = {
            id: storeId,
            storeId,
            ownerUid: baseStoreData.ownerUid || uid,
            ownerEmail: baseStoreData.ownerEmail || email || null,
            email: baseStoreData.email || email || null,
            // profile fields
            name: baseStoreData.name || profile.businessName || null,
            displayName,
            phone: profile.phone ?? baseStoreData.phone ?? resolvedPhone ?? null,
            whatsappNumber: (0, phone_1.normalizePhoneForWhatsApp)(profile.phone ?? baseStoreData.phone ?? resolvedPhone ?? '') || null,
            country: profile.country ?? baseStoreData.country ?? null,
            city: profile.city ?? baseStoreData.city ?? null,
            addressLine1: profile.addressLine1 ?? baseStoreData.addressLine1 ?? null,
            status: baseStoreData.status || 'active',
            workspaceSlug,
            contractStatus: baseStoreData.contractStatus || 'trial',
            productCount: typeof baseStoreData.productCount === 'number'
                ? baseStoreData.productCount
                : 0,
            totalStockCount: typeof baseStoreData.totalStockCount === 'number'
                ? baseStoreData.totalStockCount
                : 0,
            createdAt: baseStoreData.createdAt || timestamp,
            updatedAt: timestamp,
            billing: billingData,
        };
        await storeRef.set(storeData, { merge: true });
        const wsRef = firestore_1.defaultDb.collection('workspaces').doc(storeId);
        const wsSnap = await wsRef.get();
        const wsBase = wsSnap.data() ?? {};
        const workspaceData = {
            id: storeId,
            slug: wsBase.slug || workspaceSlug,
            storeId,
            ownerUid: wsBase.ownerUid || uid,
            ownerEmail: wsBase.ownerEmail || email || null,
            status: wsBase.status || 'active',
            createdAt: wsBase.createdAt || timestamp,
            updatedAt: timestamp,
        };
        await wsRef.set(workspaceData, { merge: true });
        await verifyOwnerEmail(uid);
    }
    // --- Update custom claims with role ---
    const claims = await updateUserClaims(uid, role);
    return {
        ok: true,
        storeId,
        workspaceSlug,
        role,
        claims,
    };
});
/** ============================================================================
 *  CALLABLE: resolveStoreAccess
 * ==========================================================================*/
exports.resolveStoreAccess = functions.https.onCall(async (data, context) => {
    assertAuthenticated(context);
    const uid = context.auth.uid;
    const token = context.auth.token;
    const email = typeof token.email === 'string' ? token.email : null;
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const payload = (data ?? {});
    const requestedStoreIdRaw = payload.storeId;
    const requestedStoreId = typeof requestedStoreIdRaw === 'string' ? requestedStoreIdRaw.trim() : '';
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const memberData = (memberSnap.data() ?? {});
    let existingStoreId = null;
    if (typeof memberData.storeId === 'string' && memberData.storeId.trim() !== '') {
        existingStoreId = memberData.storeId;
    }
    const storeId = requestedStoreId || existingStoreId || uid;
    let role;
    if (typeof memberData.role === 'string' &&
        (memberData.role === 'owner' || memberData.role === 'staff')) {
        role = memberData.role;
    }
    else {
        role = requestedStoreId ? 'staff' : 'owner';
    }
    const workspaceSlug = storeId;
    const nextMemberData = {
        uid,
        email: memberData.email || email || null,
        storeId,
        role,
        updatedAt: timestamp,
    };
    if (!memberSnap.exists) {
        nextMemberData.createdAt = timestamp;
    }
    await memberRef.set(nextMemberData, { merge: true });
    const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
    const storeSnap = await storeRef.get();
    const baseStore = storeSnap.data() ?? {};
    const previousBilling = (baseStore.billing || {});
    const nowTs = firestore_1.admin.firestore.Timestamp.now();
    const paymentStatusRaw = typeof baseStore.paymentStatus === 'string' ? baseStore.paymentStatus : null;
    const trialEndsAt = previousBilling.trialEndsAt ||
        previousBilling.trialEnd ||
        timestampDaysFromNow(TRIAL_DAYS);
    const graceEndsAt = previousBilling.graceEndsAt ||
        previousBilling.graceEnd ||
        timestampDaysFromNow(TRIAL_DAYS + GRACE_DAYS);
    const contractStatusRaw = typeof baseStore.contractStatus === 'string'
        ? baseStore.contractStatus.trim()
        : null;
    const normalizedContractStatus = contractStatusRaw && contractStatusRaw !== ''
        ? contractStatusRaw.toLowerCase()
        : null;
    const billingStatus = previousBilling.status === 'active' || previousBilling.status === 'past_due'
        ? previousBilling.status
        : 'trial';
    const trialDaysRemaining = calculateDaysRemaining(trialEndsAt, nowTs);
    const graceDaysRemaining = calculateDaysRemaining(graceEndsAt, nowTs);
    const contractEndRaw = baseStore.contractEnd ||
        previousBilling.currentPeriodEnd ||
        previousBilling.contractEnd ||
        null;
    const contractEndTs = contractEndRaw && typeof contractEndRaw.toDate === 'function' ? contractEndRaw : null;
    const contractExpired = !!contractEndTs &&
        typeof contractEndTs.toMillis === 'function' &&
        contractEndTs.toMillis() <= nowTs.toMillis();
    const trialExpired = (normalizedContractStatus === 'trial' || billingStatus === 'trial') &&
        paymentStatusRaw !== 'active' &&
        trialDaysRemaining !== null &&
        trialDaysRemaining <= 0;
    const normalizedBillingStatus = contractExpired
        ? 'inactive'
        : trialExpired
            ? 'past_due'
            : billingStatus;
    const normalizedPaymentStatus = contractExpired
        ? 'inactive'
        : trialExpired
            ? 'past_due'
            : paymentStatusRaw === 'active'
                ? 'active'
                : paymentStatusRaw === 'past_due'
                    ? 'past_due'
                    : billingStatus;
    const graceExpired = normalizedPaymentStatus === 'past_due' &&
        graceDaysRemaining !== null &&
        graceDaysRemaining <= 0;
    const billingData = {
        planKey: previousBilling.planKey || 'standard',
        status: normalizedBillingStatus,
        trialEndsAt,
        graceEndsAt,
        paystackCustomerCode: previousBilling.paystackCustomerCode !== undefined
            ? previousBilling.paystackCustomerCode
            : null,
        paystackSubscriptionCode: previousBilling.paystackSubscriptionCode !== undefined
            ? previousBilling.paystackSubscriptionCode
            : null,
        paystackEmailToken: previousBilling.paystackEmailToken !== undefined
            ? previousBilling.paystackEmailToken
            : null,
        paystackPlanCode: previousBilling.paystackPlanCode !== undefined
            ? previousBilling.paystackPlanCode
            : null,
        currentPeriodEnd: previousBilling.currentPeriodEnd !== undefined
            ? previousBilling.currentPeriodEnd
            : null,
        lastEventAt: nowTs,
        lastChargeReference: previousBilling.lastChargeReference !== undefined
            ? previousBilling.lastChargeReference
            : null,
    };
    const storeData = {
        id: storeId,
        ownerUid: baseStore.ownerUid || (role === 'owner' ? uid : baseStore.ownerUid || uid),
        ownerEmail: baseStore.ownerEmail || email || null,
        status: baseStore.status || 'active',
        workspaceSlug: baseStore.workspaceSlug || workspaceSlug,
        contractStatus: contractExpired
            ? 'inactive'
            : contractStatusRaw || baseStore.contractStatus || 'trial',
        productCount: typeof baseStore.productCount === 'number' ? baseStore.productCount : 0,
        totalStockCount: typeof baseStore.totalStockCount === 'number' ? baseStore.totalStockCount : 0,
        createdAt: baseStore.createdAt || timestamp,
        updatedAt: timestamp,
        paymentStatus: normalizedPaymentStatus,
        billing: billingData,
    };
    await storeRef.set(storeData, { merge: true });
    const wsRef = firestore_1.defaultDb.collection('workspaces').doc(storeId);
    const wsSnap = await wsRef.get();
    const wsBase = wsSnap.data() ?? {};
    const workspaceData = {
        id: storeId,
        slug: wsBase.slug || workspaceSlug,
        storeId,
        ownerUid: wsBase.ownerUid || storeData.ownerUid,
        ownerEmail: wsBase.ownerEmail || storeData.ownerEmail,
        status: wsBase.status || 'active',
        createdAt: wsBase.createdAt || timestamp,
        updatedAt: timestamp,
    };
    await wsRef.set(workspaceData, { merge: true });
    if (role === 'owner') {
        await verifyOwnerEmail(uid);
    }
    const billingSummary = {
        status: normalizedBillingStatus,
        paymentStatus: normalizedPaymentStatus,
        trialEndsAt: trialEndsAt && typeof trialEndsAt.toMillis === 'function'
            ? trialEndsAt.toMillis()
            : null,
        trialDaysRemaining: trialDaysRemaining === null ? null : Math.max(trialDaysRemaining, 0),
    };
    if (trialExpired) {
        const endDate = trialEndsAt && typeof trialEndsAt.toDate === 'function'
            ? trialEndsAt.toDate().toISOString().slice(0, 10)
            : 'your trial end date';
        throw new functions.https.HttpsError('permission-denied', `Your free trial ended on ${endDate}. Please upgrade to continue.`);
    }
    if (graceExpired) {
        const graceEndDate = graceEndsAt && typeof graceEndsAt.toDate === 'function'
            ? graceEndsAt.toDate().toISOString().slice(0, 10)
            : 'the end of your billing grace period';
        throw new functions.https.HttpsError('permission-denied', `Your Sedifex subscription is past due and access was suspended on ${graceEndDate}. Update your payment method to regain access.`);
    }
    const claims = await updateUserClaims(uid, role);
    return {
        ok: true,
        storeId,
        workspaceSlug,
        role,
        claims,
        billing: billingSummary,
    };
});
/** ============================================================================
 *  CALLABLE: generateAiAdvice
 * ==========================================================================*/
exports.generateAiAdvice = functions.https.onCall(async (rawData, context) => {
    assertAuthenticated(context);
    const { apiKey, model } = getOpenAiConfig();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'AI advisor is not configured yet. Missing OPENAI_API_KEY.');
    }
    const uid = context.auth.uid;
    const { question, storeId: requestedStoreId, jsonContext } = normalizeAiAdvicePayload((rawData ?? {}));
    const memberSnap = await firestore_1.defaultDb.collection('teamMembers').doc(uid).get();
    const memberData = (memberSnap.data() ?? {});
    const memberStoreId = typeof memberData.storeId === 'string' ? memberData.storeId.trim() : '';
    const storeId = requestedStoreId || memberStoreId;
    if (!storeId) {
        throw new functions.https.HttpsError('failed-precondition', 'No workspace found for this account. Initialize your workspace first.');
    }
    if (requestedStoreId && memberStoreId && requestedStoreId !== memberStoreId) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to the requested workspace.');
    }
    const contextJson = JSON.stringify(jsonContext, null, 2).slice(0, 6000);
    const systemPrompt = 'You are an operations advisor for retail and POS businesses. Give concise, practical recommendations the owner can execute this week. Use short bullet points and include risks when relevant.';
    const userPrompt = [
        `Workspace: ${storeId}`,
        'Question:',
        question,
        '',
        'Context JSON:',
        contextJson,
    ].join('\n');
    const aiResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 500,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });
    const payload = (await aiResponse.json().catch(() => null));
    if (!aiResponse.ok) {
        const apiMessage = payload?.error?.message && payload.error.message.trim() !== ''
            ? payload.error.message
            : `OpenAI request failed with status ${aiResponse.status}`;
        functions.logger.error('[generateAiAdvice] OpenAI error', {
            status: aiResponse.status,
            apiMessage,
        });
        throw new functions.https.HttpsError('internal', 'Unable to generate AI advice right now.');
    }
    const advice = payload?.choices?.[0]?.message?.content?.trim() || '';
    if (!advice) {
        throw new functions.https.HttpsError('internal', 'AI returned an empty response.');
    }
    return {
        advice,
        storeId,
        dataPreview: jsonContext,
    };
});
/** ============================================================================
 *  CALLABLE: generateSocialPost
 * ==========================================================================*/
exports.generateSocialPost = functions.https.onCall(async (rawData, context) => {
    assertAuthenticated(context);
    const { apiKey, model } = getOpenAiConfig();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'Social media generator is not configured yet. Missing OPENAI_API_KEY.');
    }
    const uid = context.auth.uid;
    const { storeId: requestedStoreId, platform, productId, product } = normalizeSocialPostPayload((rawData ?? {}));
    const memberSnap = await firestore_1.defaultDb.collection('teamMembers').doc(uid).get();
    const memberData = (memberSnap.data() ?? {});
    const memberStoreId = typeof memberData.storeId === 'string' ? memberData.storeId.trim() : '';
    const storeId = requestedStoreId || memberStoreId;
    if (!storeId) {
        throw new functions.https.HttpsError('failed-precondition', 'No workspace found for this account. Initialize your workspace first.');
    }
    if (requestedStoreId && memberStoreId && requestedStoreId !== memberStoreId) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to the requested workspace.');
    }
    let selectedProduct = product;
    const resolvedProductId = productId || product.id || '';
    if (resolvedProductId) {
        const productSnap = await firestore_1.defaultDb.collection('products').doc(resolvedProductId).get();
        const productData = (productSnap.data() ?? {});
        const productStoreId = typeof productData.storeId === 'string' ? productData.storeId.trim() : '';
        if (!productSnap.exists || productStoreId !== storeId) {
            throw new functions.https.HttpsError('not-found', 'Product or service not found for your workspace.');
        }
        selectedProduct = {
            id: resolvedProductId,
            name: typeof productData.name === 'string' ? productData.name.trim() : '',
            category: typeof productData.category === 'string' ? productData.category.trim() : '',
            description: typeof productData.description === 'string' ? productData.description.trim() : '',
            price: typeof productData.price === 'number' && Number.isFinite(productData.price) ? productData.price : null,
            imageUrl: typeof productData.imageUrl === 'string' ? productData.imageUrl.trim() : '',
            itemType: productData.itemType === 'service' || productData.itemType === 'made_to_order'
                ? productData.itemType
                : 'product',
        };
    }
    if (!selectedProduct.name) {
        throw new functions.https.HttpsError('invalid-argument', 'Product name is required to generate content.');
    }
    const promptProduct = {
        id: selectedProduct.id || null,
        name: selectedProduct.name,
        category: selectedProduct.category || null,
        description: selectedProduct.description || null,
        price: selectedProduct.price,
        imageUrl: selectedProduct.imageUrl || null,
        itemType: selectedProduct.itemType,
    };
    const systemPrompt = 'You are a social media strategist for retail and POS merchants. Return strict JSON only, no markdown. Keep copy concise, conversion-focused, and realistic.';
    const userPrompt = [
        `Workspace: ${storeId}`,
        `Platform: ${platform}`,
        'Return JSON schema:',
        '{"platform":"instagram|tiktok","caption":"string","hashtags":["#tag"],"imagePrompt":"string","cta":"string","designSpec":{"aspectRatio":"string","safeTextZones":["string"],"visualStyle":"string"},"disclaimer":"string|null"}',
        'Rules:',
        '- caption max 220 chars for instagram, 150 chars for tiktok.',
        '- hashtags: 5 to 10 relevant hashtags.',
        '- include clear CTA.',
        '- if price or measurable claim appears, add disclaimer; else null.',
        '- designSpec must be practical for mobile-safe text placement.',
        'Product JSON:',
        JSON.stringify(promptProduct).slice(0, 3000),
    ].join('\n');
    const aiResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            temperature: 0.4,
            max_tokens: 700,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });
    const payload = (await aiResponse.json().catch(() => null));
    if (!aiResponse.ok) {
        const apiMessage = payload?.error?.message && payload.error.message.trim() !== ''
            ? payload.error.message
            : `OpenAI request failed with status ${aiResponse.status}`;
        functions.logger.error('[generateSocialPost] OpenAI error', {
            status: aiResponse.status,
            apiMessage,
        });
        throw new functions.https.HttpsError('internal', 'Unable to generate social post right now.');
    }
    const content = payload?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
        throw new functions.https.HttpsError('internal', 'AI returned an empty response.');
    }
    let parsed = null;
    try {
        parsed = JSON.parse(content);
    }
    catch (_error) {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start >= 0 && end > start) {
            parsed = JSON.parse(content.slice(start, end + 1));
        }
    }
    if (!parsed) {
        throw new functions.https.HttpsError('internal', 'AI returned invalid JSON for social post.');
    }
    const safePlatform = parsed.platform === 'tiktok' ? 'tiktok' : 'instagram';
    const safeHashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags
            .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
            .filter(Boolean)
            .slice(0, 10)
        : [];
    return {
        storeId,
        productId: resolvedProductId || null,
        product: promptProduct,
        post: {
            platform: safePlatform,
            caption: typeof parsed.caption === 'string' ? parsed.caption.trim() : '',
            hashtags: safeHashtags,
            imagePrompt: typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt.trim() : '',
            cta: typeof parsed.cta === 'string' ? parsed.cta.trim() : '',
            designSpec: {
                aspectRatio: parsed.designSpec &&
                    typeof parsed.designSpec === 'object' &&
                    typeof parsed.designSpec.aspectRatio === 'string'
                    ? parsed.designSpec.aspectRatio.trim()
                    : '',
                safeTextZones: parsed.designSpec &&
                    typeof parsed.designSpec === 'object' &&
                    Array.isArray(parsed.designSpec.safeTextZones)
                    ? parsed.designSpec.safeTextZones
                        .map(item => (typeof item === 'string' ? item.trim() : ''))
                        .filter(Boolean)
                        .slice(0, 6)
                    : [],
                visualStyle: parsed.designSpec &&
                    typeof parsed.designSpec === 'object' &&
                    typeof parsed.designSpec.visualStyle === 'string'
                    ? parsed.designSpec.visualStyle.trim()
                    : '',
            },
            disclaimer: typeof parsed.disclaimer === 'string' && parsed.disclaimer.trim()
                ? parsed.disclaimer.trim()
                : null,
        },
    };
});
/** ============================================================================
 *  CALLABLE: manageStaffAccount (owner only)
 * ==========================================================================*/
async function logStaffAudit(entry) {
    const auditRef = firestore_1.defaultDb.collection('staffAudit').doc();
    const payload = {
        ...entry,
        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await auditRef.set(payload);
    }
    catch (error) {
        console.error('[staff-audit] Failed to record audit entry', error);
    }
}
async function ensureAuthUser(email, password) {
    try {
        const record = await firestore_1.admin.auth().getUserByEmail(email);
        if (password) {
            await firestore_1.admin.auth().updateUser(record.uid, { password });
        }
        return { record, created: false };
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found') {
            if (!password) {
                throw new functions.https.HttpsError('invalid-argument', 'A password is required when creating a new staff account');
            }
            const record = await firestore_1.admin.auth().createUser({
                email,
                password,
                emailVerified: false,
            });
            return { record, created: true };
        }
        throw error;
    }
}
exports.manageStaffAccount = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const { storeId, email, role, password, action } = normalizeManageStaffPayload(data);
    const actorUid = context.auth.uid;
    const actorEmail = typeof context.auth?.token?.email === 'string'
        ? context.auth.token.email
        : null;
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const getUserOrThrow = async () => {
        try {
            return await firestore_1.admin.auth().getUserByEmail(email);
        }
        catch (error) {
            if (error?.code === 'auth/user-not-found') {
                throw new functions.https.HttpsError('not-found', 'No account found for that email');
            }
            throw error;
        }
    };
    const auditBase = {
        action,
        storeId,
        actorUid,
        actorEmail,
        targetEmail: email,
    };
    try {
        await verifyOwnerForStore(actorUid, storeId);
        let record;
        let created = false;
        let claims;
        if (action === 'invite') {
            const ensured = await ensureAuthUser(email, password);
            record = ensured.record;
            created = ensured.created;
            await firestore_1.admin.auth().updateUser(record.uid, { disabled: false });
            const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(record.uid);
            const memberSnap = await memberRef.get();
            const memberData = {
                uid: record.uid,
                email,
                storeId,
                role,
                invitedBy: actorUid,
                status: 'active',
                updatedAt: timestamp,
            };
            if (!memberSnap.exists) {
                memberData.createdAt = timestamp;
            }
            await memberRef.set(memberData, { merge: true });
            claims = await updateUserClaims(record.uid, role);
        }
        else if (action === 'reset') {
            if (!password) {
                throw new functions.https.HttpsError('invalid-argument', 'A new password is required to reset staff credentials');
            }
            record = await getUserOrThrow();
            await firestore_1.admin.auth().updateUser(record.uid, { password, disabled: false });
            const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(record.uid);
            await memberRef.set({ uid: record.uid, email, storeId, role, status: 'active', updatedAt: timestamp }, { merge: true });
            claims = await updateUserClaims(record.uid, role);
        }
        else {
            // deactivate
            record = await getUserOrThrow();
            await firestore_1.admin.auth().updateUser(record.uid, { disabled: true });
            const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(record.uid);
            await memberRef.set({ uid: record.uid, email, storeId, role, status: 'inactive', updatedAt: timestamp }, { merge: true });
            created = false;
        }
        await logStaffAudit({
            ...auditBase,
            targetUid: record.uid,
            outcome: 'success',
            errorMessage: null,
        });
        return { ok: true, role, email, uid: record.uid, created, storeId, claims };
    }
    catch (error) {
        await logStaffAudit({
            ...auditBase,
            outcome: 'failure',
            targetUid: null,
            errorMessage: typeof error?.message === 'string' ? error.message : 'Unknown error',
        });
        throw error;
    }
});
exports.createStoreMasterInviteLink = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const { storeId, role, expiresInHours, maxUses } = normalizeCreateStoreMasterInvitePayload(data);
    const actorUid = context.auth.uid;
    await verifyOwnerForStore(actorUid, storeId);
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const expiresAt = firestore_1.admin.firestore.Timestamp.fromMillis(now + expiresInHours * 60 * 60 * 1000);
    const inviteRef = firestore_1.defaultDb.collection('storeMasterInvites').doc();
    await inviteRef.set({
        storeId,
        role,
        tokenHash,
        status: 'active',
        maxUses,
        usesCount: 0,
        createdBy: actorUid,
        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
    });
    const projectId = process.env.GCLOUD_PROJECT || '';
    const inviteUrl = projectId
        ? `https://${projectId}.web.app/store-link/accept?token=${encodeURIComponent(token)}`
        : `store-link://accept?token=${encodeURIComponent(token)}`;
    return {
        ok: true,
        storeId,
        role,
        inviteToken: token,
        inviteUrl,
        maxUses,
        expiresAt: expiresAt.toDate().toISOString(),
    };
});
exports.acceptStoreMasterInvite = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const { token, childStoreId, confirmOverwrite } = normalizeAcceptStoreMasterInvitePayload(data);
    const actorUid = context.auth.uid;
    await verifyOwnerForStore(actorUid, childStoreId);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const inviteSnap = await firestore_1.defaultDb
        .collection('storeMasterInvites')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get();
    if (inviteSnap.empty) {
        throw new functions.https.HttpsError('not-found', 'Invite link is invalid or no longer available');
    }
    const inviteDoc = inviteSnap.docs[0];
    const inviteData = (inviteDoc.data() ?? {});
    const parentStoreId = typeof inviteData.storeId === 'string' ? inviteData.storeId.trim() : '';
    const role = inviteData.role === 'owner' ? 'owner' : 'staff';
    const status = typeof inviteData.status === 'string' ? inviteData.status : 'active';
    const maxUses = typeof inviteData.maxUses === 'number' ? inviteData.maxUses : 1;
    const usesCount = typeof inviteData.usesCount === 'number' ? inviteData.usesCount : 0;
    const expiresAt = inviteData.expiresAt instanceof firestore_1.admin.firestore.Timestamp ? inviteData.expiresAt : null;
    if (!parentStoreId) {
        throw new functions.https.HttpsError('failed-precondition', 'Invite parent store is missing');
    }
    if (status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Invite link is no longer active');
    }
    if (expiresAt && expiresAt.toMillis() <= Date.now()) {
        throw new functions.https.HttpsError('deadline-exceeded', 'Invite link has expired');
    }
    if (maxUses > 0 && usesCount >= maxUses) {
        throw new functions.https.HttpsError('resource-exhausted', 'Invite link has reached its usage limit');
    }
    if (parentStoreId === childStoreId) {
        throw new functions.https.HttpsError('invalid-argument', 'You cannot link a workspace to itself as a sub-store');
    }
    const childRef = firestore_1.defaultDb.collection('stores').doc(childStoreId);
    const inviteRef = inviteDoc.ref;
    const eventRef = firestore_1.defaultDb.collection('storeLinkAudit').doc();
    const overwritten = await firestore_1.defaultDb.runTransaction(async (transaction) => {
        const childSnap = await transaction.get(childRef);
        const childData = (childSnap.data() ?? {});
        const currentParent = typeof childData.parentStoreId === 'string' ? childData.parentStoreId.trim() : '';
        if (currentParent && currentParent !== parentStoreId && !confirmOverwrite) {
            throw new functions.https.HttpsError('failed-precondition', 'This workspace is already linked to a different mother store. Confirm overwrite to continue.');
        }
        const nextUsesCount = usesCount + 1;
        transaction.set(childRef, {
            parentStoreId,
            parentLinkRole: role,
            parentLinkedBy: actorUid,
            parentLinkedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(inviteRef, {
            usesCount: nextUsesCount,
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            status: maxUses > 0 && nextUsesCount >= maxUses ? 'consumed' : 'active',
        }, { merge: true });
        transaction.set(eventRef, {
            parentStoreId,
            childStoreId,
            role,
            actorUid,
            inviteId: inviteDoc.id,
            previousParentStoreId: currentParent || null,
            overwritten: Boolean(currentParent && currentParent !== parentStoreId),
            createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        });
        return Boolean(currentParent && currentParent !== parentStoreId);
    });
    return {
        ok: true,
        parentStoreId,
        childStoreId,
        role,
        overwritten,
    };
});
/** ============================================================================
 *  CALLABLE: commitSale (staff)
 * ==========================================================================*/
exports.commitSale = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const { branchId, items, totals, cashierId, saleId: saleIdRaw, payment, customer, } = data || {};
    const saleId = typeof saleIdRaw === 'string' ? saleIdRaw.trim() : '';
    if (!saleId) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid saleId is required');
    }
    const normalizedBranchIdRaw = typeof branchId === 'string' ? branchId.trim() : '';
    if (!normalizedBranchIdRaw) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid branch identifier is required');
    }
    const normalizedBranchId = normalizedBranchIdRaw;
    const storeRef = firestore_1.defaultDb.collection('stores').doc(normalizedBranchId);
    function resolveDailySalesLimit(input) {
        const billingStatus = input.billingStatus?.toLowerCase() ?? null;
        const paymentStatus = input.paymentStatus?.toLowerCase() ?? null;
        const planKey = input.planKey?.toLowerCase() ?? null;
        if (billingStatus === 'trial' || paymentStatus === 'trial')
            return 10;
        if (!planKey)
            return 10;
        if (planKey.includes('scale'))
            return null;
        if (planKey.includes('growth'))
            return 500;
        if (planKey.includes('starter') || planKey.includes('standard'))
            return 100;
        if (planKey.includes('free') || planKey.includes('trial'))
            return 10;
        return 10;
    }
    const storeSnap = await storeRef.get();
    const storeData = storeSnap.data();
    const billingData = storeData?.billing && typeof storeData.billing === 'object'
        ? storeData.billing
        : {};
    const dailySalesLimit = resolveDailySalesLimit({
        billingStatus: typeof billingData.status === 'string'
            ? billingData.status
            : typeof storeData?.contractStatus === 'string'
                ? storeData.contractStatus
                : null,
        paymentStatus: typeof billingData.paymentStatus === 'string' ? billingData.paymentStatus : null,
        planKey: typeof billingData.planKey === 'string'
            ? billingData.planKey
            : typeof storeData?.billingPlan === 'string'
                ? storeData.billingPlan
                : null,
    });
    if (dailySalesLimit !== null) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const salesCountSnapshot = await firestore_1.defaultDb
            .collection('sales')
            .where('storeId', '==', normalizedBranchId)
            .where('createdAt', '>=', firestore_1.admin.firestore.Timestamp.fromDate(start))
            .where('createdAt', '<', firestore_1.admin.firestore.Timestamp.fromDate(end))
            .count()
            .get();
        const dailySalesCount = salesCountSnapshot.data().count;
        if (dailySalesCount >= dailySalesLimit) {
            throw new functions.https.HttpsError('resource-exhausted', `Daily sales limit reached (${dailySalesLimit}/day). Upgrade your plan in Account to continue selling today.`);
        }
    }
    // Normalize items ONCE outside the transaction
    const normalizedItems = Array.isArray(items)
        ? items.map((it) => {
            const productId = typeof it?.productId === 'string' ? it.productId.trim() : null;
            const name = typeof it?.name === 'string' ? it.name : null;
            const qty = Number(it?.qty ?? 0) || 0;
            const price = Number(it?.price ?? 0) || 0;
            const taxRate = Number(it?.taxRate ?? 0) || 0;
            const typeRaw = typeof it?.type === 'string' ? it.type.trim().toLowerCase() : null;
            const type = typeRaw === 'service'
                ? 'service'
                : typeRaw === 'made_to_order'
                    ? 'made_to_order'
                    : typeRaw === 'product'
                        ? 'product'
                        : null;
            const isService = it?.isService === true || type === 'service';
            const prepDate = typeof it?.prepDate === 'string' && it.prepDate.trim() ? it.prepDate : null;
            return { productId, name, qty, price, taxRate, type, isService, prepDate };
        })
        : [];
    // Validate products before we even touch Firestore
    for (const it of normalizedItems) {
        if (!it.productId) {
            throw new functions.https.HttpsError('failed-precondition', 'Bad product');
        }
    }
    const saleRef = firestore_1.defaultDb.collection('sales').doc(saleId);
    const saleItemsRef = firestore_1.defaultDb.collection('saleItems');
    const normalizedCustomer = customer && typeof customer === 'object'
        ? {
            id: typeof customer.id === 'string' ? customer.id.trim() || null : null,
            name: typeof customer.name === 'string' ? customer.name.trim() || null : null,
            phone: typeof customer.phone === 'string' ? customer.phone.trim() || null : null,
        }
        : null;
    const customerRef = normalizedCustomer?.id ? firestore_1.defaultDb.collection('customers').doc(normalizedCustomer.id) : null;
    await firestore_1.defaultDb.runTransaction(async (tx) => {
        // 1️⃣ ALL READS FIRST
        // prevent duplicates
        const existingSale = await tx.get(saleRef);
        if (existingSale.exists) {
            throw new functions.https.HttpsError('already-exists', 'Sale has already been committed');
        }
        // product docs
        const productSnaps = {};
        const productRefs = {};
        for (const it of normalizedItems) {
            const productId = it.productId;
            const pRef = firestore_1.defaultDb.collection('products').doc(productId);
            productRefs[productId] = pRef;
            const pSnap = await tx.get(pRef);
            if (!pSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Bad product');
            }
            productSnaps[productId] = pSnap;
        }
        // 2️⃣ THEN ALL WRITES
        const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
        tx.set(saleRef, {
            branchId: normalizedBranchId,
            storeId: normalizedBranchId,
            cashierId,
            total: totals?.total ?? 0,
            taxTotal: totals?.taxTotal ?? 0,
            payment: payment ?? null,
            customer: normalizedCustomer,
            customerId: normalizedCustomer?.id ?? null,
            customerName: normalizedCustomer?.name ?? null,
            customerPhone: normalizedCustomer?.phone ?? null,
            items: normalizedItems,
            createdBy: context.auth?.uid ?? null,
            createdAt: timestamp,
        });
        for (const it of normalizedItems) {
            const productId = it.productId;
            // saleItems row
            const itemId = firestore_1.defaultDb.collection('_').doc().id;
            tx.set(saleItemsRef.doc(itemId), {
                saleId,
                productId,
                qty: it.qty,
                price: it.price,
                taxRate: it.taxRate,
                type: it.type,
                isService: it.isService === true,
                prepDate: it.prepDate ?? null,
                storeId: normalizedBranchId,
                createdAt: timestamp,
            });
            const isInventoryTracked = it.type !== 'service' && it.type !== 'made_to_order';
            if (isInventoryTracked) {
                const pRef = productRefs[productId];
                const pSnap = productSnaps[productId];
                const curr = Number(pSnap.get('stockCount') || 0);
                const next = curr - Math.abs(it.qty || 0);
                tx.update(pRef, { stockCount: next, updatedAt: timestamp });
                const ledgerId = firestore_1.defaultDb.collection('_').doc().id;
                tx.set(firestore_1.defaultDb.collection('ledger').doc(ledgerId), {
                    productId,
                    qtyChange: -Math.abs(it.qty || 0),
                    type: 'sale',
                    refId: saleId,
                    storeId: normalizedBranchId,
                    createdAt: timestamp,
                });
            }
        }
        const saleTotal = Number(totals?.total ?? 0);
        const amountPaid = Number(payment?.amountPaid ?? saleTotal);
        const shortfallAmount = Math.max(0, saleTotal - amountPaid);
        const shortfallCents = Math.round(shortfallAmount * 100);
        if (customerRef && shortfallCents > 0) {
            const customerSnap = await tx.get(customerRef);
            if (customerSnap.exists) {
                const customerData = customerSnap.data();
                const customerStoreId = typeof customerData.storeId === 'string' ? customerData.storeId.trim() : null;
                if (!customerStoreId || customerStoreId === normalizedBranchId) {
                    const existingDebt = customerData.debt && typeof customerData.debt === 'object'
                        ? customerData.debt
                        : null;
                    const existingOutstandingRaw = Number(existingDebt?.outstandingCents ?? 0);
                    const existingOutstanding = Number.isFinite(existingOutstandingRaw)
                        ? Math.max(0, Math.round(existingOutstandingRaw))
                        : 0;
                    const nextOutstanding = existingOutstanding + shortfallCents;
                    tx.update(customerRef, {
                        debt: {
                            outstandingCents: nextOutstanding,
                            dueDate: existingDebt?.dueDate ?? null,
                            lastReminderAt: existingDebt?.lastReminderAt ?? null,
                        },
                        updatedAt: timestamp,
                    });
                }
            }
        }
    });
    return { ok: true, saleId };
});
/** ============================================================================
 *  CALLABLE: logReceiptShare (staff)
 * ==========================================================================*/
const RECEIPT_CHANNELS = new Set(['email', 'sms', 'whatsapp']);
const RECEIPT_STATUSES = new Set(['attempt', 'failed', 'sent']);
const RECEIPT_SHARE_CHANNELS = new Set(['email', 'sms', 'whatsapp']);
const RECEIPT_SHARE_STATUSES = new Set(['success', 'failure']);
const REMINDER_CHANNELS = new Set(['email', 'telegram', 'whatsapp']);
const REMINDER_STATUSES = new Set(['attempt', 'failed', 'sent']);
exports.logReceiptShare = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    const saleId = typeof data?.saleId === 'string' ? data.saleId.trim() : '';
    const channel = typeof data?.channel === 'string' ? data.channel.trim() : '';
    const status = typeof data?.status === 'string' ? data.status.trim() : '';
    if (!storeId || !saleId) {
        throw new functions.https.HttpsError('invalid-argument', 'storeId and saleId are required');
    }
    if (!RECEIPT_CHANNELS.has(channel)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid channel');
    }
    if (!RECEIPT_STATUSES.has(status)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
    }
    const contactRaw = data?.contact;
    const contact = contactRaw === null || contactRaw === undefined
        ? null
        : typeof contactRaw === 'string'
            ? contactRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'contact must be a string when provided');
            })();
    const customerIdRaw = data?.customerId;
    const customerId = customerIdRaw === null || customerIdRaw === undefined
        ? null
        : typeof customerIdRaw === 'string'
            ? customerIdRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'customerId must be a string when provided');
            })();
    const customerNameRaw = data?.customerName;
    const customerName = customerNameRaw === null || customerNameRaw === undefined
        ? null
        : typeof customerNameRaw === 'string'
            ? customerNameRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'customerName must be a string when provided');
            })();
    const errorMessageRaw = data?.errorMessage;
    const errorMessage = errorMessageRaw === null || errorMessageRaw === undefined
        ? null
        : typeof errorMessageRaw === 'string'
            ? errorMessageRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'errorMessage must be a string when provided');
            })();
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const payload = {
        storeId,
        saleId,
        channel,
        status,
        contact,
        customerId,
        customerName,
        errorMessage,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const ref = await firestore_1.defaultDb.collection('receiptShareLogs').add(payload);
    return { ok: true, shareId: ref.id };
});
/** ============================================================================
 *  CALLABLE: logReceiptShareAttempt (staff)
 * ==========================================================================*/
function maskDestination(destination) {
    const trimmed = destination.trim();
    if (!trimmed)
        return null;
    const last4 = trimmed.slice(-4);
    if (trimmed.length <= 4)
        return { masked: `****${last4}`, last4 };
    const mask = '*'.repeat(Math.max(0, trimmed.length - 4));
    return { masked: `${mask}${last4}`, last4 };
}
exports.logReceiptShareAttempt = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    const saleId = typeof data?.saleId === 'string' ? data.saleId.trim() : '';
    const receiptId = typeof data?.receiptId === 'string' ? data.receiptId.trim() : '';
    const channel = typeof data?.channel === 'string' ? data.channel.trim() : '';
    const status = typeof data?.status === 'string' ? data.status.trim() : '';
    const destination = typeof data?.destination === 'string' ? data.destination.trim() : '';
    if (!saleId && !receiptId) {
        throw new functions.https.HttpsError('invalid-argument', 'saleId or receiptId is required');
    }
    if (!RECEIPT_SHARE_CHANNELS.has(channel)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid channel');
    }
    if (!RECEIPT_SHARE_STATUSES.has(status)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
    }
    if (!destination) {
        throw new functions.https.HttpsError('invalid-argument', 'destination is required');
    }
    const errorMessageRaw = data?.errorMessage;
    const errorMessage = errorMessageRaw === null || errorMessageRaw === undefined
        ? null
        : typeof errorMessageRaw === 'string'
            ? errorMessageRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'errorMessage must be a string when provided');
            })();
    const masked = maskDestination(destination);
    if (!masked) {
        throw new functions.https.HttpsError('invalid-argument', 'destination is required');
    }
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const payload = {
        storeId,
        saleId: saleId || null,
        receiptId: receiptId || null,
        channel,
        status,
        destinationMasked: masked.masked,
        destinationLast4: masked.last4,
        errorMessage,
        actorUid: uid,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const ref = firestore_1.defaultDb
        .collection('stores')
        .doc(storeId)
        .collection('receiptShareAttempts')
        .doc();
    await ref.set(payload);
    return { ok: true, attemptId: ref.id };
});
/** ============================================================================
 *  CALLABLE: logPaymentReminder (staff)
 * ==========================================================================*/
exports.logPaymentReminder = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const storeId = typeof data?.storeId === 'string' ? data.storeId.trim() : '';
    const customerId = typeof data?.customerId === 'string' ? data.customerId.trim() : '';
    const channel = typeof data?.channel === 'string' ? data.channel.trim() : '';
    const status = typeof data?.status === 'string' ? data.status.trim() : '';
    if (!storeId || !customerId) {
        throw new functions.https.HttpsError('invalid-argument', 'storeId and customerId are required');
    }
    if (!REMINDER_CHANNELS.has(channel)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid channel');
    }
    if (!REMINDER_STATUSES.has(status)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
    }
    const customerNameRaw = data?.customerName;
    const customerName = customerNameRaw === null || customerNameRaw === undefined
        ? null
        : typeof customerNameRaw === 'string'
            ? customerNameRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'customerName must be a string when provided');
            })();
    const templateIdRaw = data?.templateId;
    const templateId = templateIdRaw === null || templateIdRaw === undefined
        ? null
        : typeof templateIdRaw === 'string'
            ? templateIdRaw.trim() || null
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'templateId must be a string when provided');
            })();
    const amountCentsRaw = data?.amountCents;
    const amountCents = amountCentsRaw === null || amountCentsRaw === undefined
        ? null
        : Number.isFinite(Number(amountCentsRaw))
            ? Number(amountCentsRaw)
            : (() => {
                throw new functions.https.HttpsError('invalid-argument', 'amountCents must be a number when provided');
            })();
    const dueDateRaw = data?.dueDate;
    const dueDate = (() => {
        if (dueDateRaw === null || dueDateRaw === undefined)
            return null;
        if (typeof dueDateRaw === 'string' || typeof dueDateRaw === 'number') {
            const parsed = new Date(dueDateRaw);
            if (Number.isNaN(parsed.getTime())) {
                throw new functions.https.HttpsError('invalid-argument', 'dueDate must be a valid date');
            }
            return firestore_1.admin.firestore.Timestamp.fromDate(parsed);
        }
        throw new functions.https.HttpsError('invalid-argument', 'dueDate must be a string or number when provided');
    })();
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const payload = {
        storeId,
        customerId,
        customerName,
        templateId,
        channel,
        status,
        amountCents,
        dueDate,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const ref = await firestore_1.defaultDb.collection('paymentReminderLogs').add(payload);
    return { ok: true, reminderId: ref.id };
});
/** ============================================================================
 *  CALLABLE: listStoreProducts (staff, read-only)
 * ==========================================================================*/
exports.listStoreProducts = functions.https.onCall(async (data, context) => {
    assertStaffAccess(context);
    const uid = context.auth.uid;
    const { storeId: requestedStoreId, limit } = normalizeListProductsPayload(data);
    const resolvedStoreId = await resolveStaffStoreId(uid);
    if (requestedStoreId && requestedStoreId !== resolvedStoreId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only read products from your assigned store.');
    }
    const snapshot = await firestore_1.defaultDb
        .collection('products')
        .where('storeId', '==', resolvedStoreId)
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get();
    const products = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled item';
        const itemType = data.itemType === 'service'
            ? 'service'
            : data.itemType === 'made_to_order'
                ? 'made_to_order'
                : 'product';
        return {
            id: docSnap.id,
            storeId: resolvedStoreId,
            name,
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            description: typeof data.description === 'string' && data.description.trim()
                ? data.description.trim()
                : null,
            price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : null,
            stockCount: typeof data.stockCount === 'number' && Number.isFinite(data.stockCount)
                ? data.stockCount
                : null,
            itemType,
            ...extractProductImageSet(data),
            updatedAt: data.updatedAt instanceof firestore_1.admin.firestore.Timestamp ? data.updatedAt : null,
        };
    });
    return { storeId: resolvedStoreId, products };
});
/** ============================================================================
 *  CALLABLES: integration API keys (owner)
 * ==========================================================================*/
function normalizeIntegrationApiKeyName(nameRaw) {
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
    if (!name)
        throw new functions.https.HttpsError('invalid-argument', 'Key name is required.');
    if (name.length > 80) {
        throw new functions.https.HttpsError('invalid-argument', 'Key name must be 80 characters or less.');
    }
    return name;
}
function normalizeIntegrationApiKeyId(keyIdRaw) {
    const keyId = typeof keyIdRaw === 'string' ? keyIdRaw.trim() : '';
    if (!keyId)
        throw new functions.https.HttpsError('invalid-argument', 'keyId is required.');
    return keyId;
}
function generateIntegrationSecret() {
    return crypto.randomBytes(24).toString('hex');
}
function hashIntegrationSecret(secret) {
    return crypto.createHash('sha256').update(secret).digest('hex');
}
function normalizeOptionalStoreId(value) {
    const storeId = typeof value === 'string' ? value.trim() : '';
    return storeId || null;
}
function normalizeWebhookEndpointId(endpointIdRaw) {
    const endpointId = typeof endpointIdRaw === 'string' ? endpointIdRaw.trim() : '';
    if (!endpointId)
        throw new functions.https.HttpsError('invalid-argument', 'endpointId is required.');
    return endpointId;
}
function normalizeWebhookUrl(urlRaw) {
    const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
    if (!url)
        throw new functions.https.HttpsError('invalid-argument', 'Endpoint URL is required.');
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new functions.https.HttpsError('invalid-argument', 'Endpoint URL must be a valid URL.');
    }
    if (parsed.protocol !== 'https:') {
        throw new functions.https.HttpsError('invalid-argument', 'Endpoint URL must use https://');
    }
    return parsed.toString();
}
function normalizeWebhookSecret(secretRaw) {
    const secret = typeof secretRaw === 'string' ? secretRaw.trim() : '';
    if (secret.length < 8) {
        throw new functions.https.HttpsError('invalid-argument', 'Webhook secret must be at least 8 characters long.');
    }
    if (secret.length > 256) {
        throw new functions.https.HttpsError('invalid-argument', 'Webhook secret must be 256 characters or less.');
    }
    return secret;
}
const ALLOWED_WEBHOOK_EVENTS = new Set([
    'booking.created',
    'booking.updated',
    'booking.cancelled',
    'booking.confirmed',
    'booking.approved',
    'product.created',
    'product.updated',
    'product.deleted',
]);
function normalizeWebhookEvents(eventsRaw) {
    const source = Array.isArray(eventsRaw) ? eventsRaw : [];
    const normalized = Array.from(new Set(source
        .map(value => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(eventType => eventType && ALLOWED_WEBHOOK_EVENTS.has(eventType))));
    if (normalized.length === 0) {
        return ['booking.created', 'booking.updated', 'booking.cancelled', 'booking.confirmed'];
    }
    return normalized;
}
function shortMask(value) {
    if (value.length <= 8)
        return '••••••••';
    return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
function isFirestoreMissingIndexError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const code = 'code' in error ? error.code : undefined;
    const message = 'message' in error ? error.message : undefined;
    if (typeof code === 'number' && code === 9)
        return true;
    if (typeof code === 'string' && code.toLowerCase().includes('failed-precondition'))
        return true;
    if (typeof message === 'string' && message.toLowerCase().includes('index'))
        return true;
    return false;
}
function toMillisOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'object' && value !== null) {
        const toMillis = value.toMillis;
        if (typeof toMillis === 'function') {
            const millis = toMillis.call(value);
            return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
        }
    }
    return null;
}
exports.listIntegrationApiKeys = functions.https.onCall(async (_data, context) => {
    let uid = null;
    let storeId = null;
    try {
        assertOwnerAccess(context);
        uid = context.auth.uid;
        storeId = await resolveStaffStoreId(uid);
        await verifyOwnerForStore(uid, storeId);
        let snapshot;
        try {
            snapshot = await firestore_1.defaultDb
                .collection('integrationApiKeys')
                .where('storeId', '==', storeId)
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
        }
        catch (queryError) {
            if (!isFirestoreMissingIndexError(queryError))
                throw queryError;
            console.warn('[integrations] listIntegrationApiKeys fallback to non-indexed query due to missing index', queryError);
            snapshot = await firestore_1.defaultDb.collection('integrationApiKeys').where('storeId', '==', storeId).limit(200).get();
        }
        const keys = snapshot.docs
            .map(docSnap => {
            const data = docSnap.data();
            const lastUsedAt = toMillisOrNull(data.lastUsedAt);
            const createdAt = toMillisOrNull(data.createdAt);
            const updatedAt = toMillisOrNull(data.updatedAt);
            const revokedAt = toMillisOrNull(data.revokedAt);
            return {
                id: docSnap.id,
                name: typeof data.name === 'string' ? data.name : 'Unnamed key',
                status: data.status === 'revoked' ? 'revoked' : 'active',
                keyPreview: typeof data.keyPreview === 'string' && data.keyPreview.trim()
                    ? data.keyPreview
                    : '••••••••',
                lastUsedAt,
                createdAt,
                updatedAt,
                revokedAt,
            };
        })
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            .slice(0, 50);
        return { storeId, keys };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError)
            throw error;
        const code = error?.code;
        const message = error?.message;
        const stack = error?.stack;
        const diagnostics = {
            uid,
            storeId,
            code: typeof code === 'string' || typeof code === 'number' ? code : null,
            message: typeof message === 'string' ? message : 'Unknown error',
        };
        console.error('[integrations] listIntegrationApiKeys failed', diagnostics, stack);
        throw new functions.https.HttpsError('failed-precondition', 'Unable to list integration API keys. Verify store ownership, Firestore indexes, and permissions.', diagnostics);
    }
});
exports.createIntegrationApiKey = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    const name = normalizeIntegrationApiKeyName(data?.name);
    const secret = generateIntegrationSecret();
    const token = `sedx_${secret}`;
    const keyHash = hashIntegrationSecret(token);
    const keyPreview = shortMask(token);
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const keyRef = firestore_1.defaultDb.collection('integrationApiKeys').doc();
    await keyRef.set({
        storeId,
        name,
        status: 'active',
        keyHash,
        keyPreview,
        createdBy: uid,
        createdAt: timestamp,
        updatedAt: timestamp,
        revokedAt: null,
        lastUsedAt: null,
    });
    await firestore_1.defaultDb.collection('integrationAuditLogs').add({
        storeId,
        action: 'api_key.created',
        actorUid: uid,
        targetId: keyRef.id,
        metadata: { name },
        createdAt: timestamp,
    });
    return {
        key: {
            id: keyRef.id,
            name,
            status: 'active',
            keyPreview,
        },
        token,
    };
});
exports.revokeIntegrationApiKey = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    const keyId = normalizeIntegrationApiKeyId(data?.keyId);
    const keyRef = firestore_1.defaultDb.collection('integrationApiKeys').doc(keyId);
    const keySnap = await keyRef.get();
    if (!keySnap.exists)
        throw new functions.https.HttpsError('not-found', 'Integration key not found.');
    const keyData = (keySnap.data() ?? {});
    if (keyData.storeId !== storeId) {
        throw new functions.https.HttpsError('permission-denied', 'Key does not belong to this store.');
    }
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await keyRef.set({
        status: 'revoked',
        revokedAt: timestamp,
        updatedAt: timestamp,
        revokedBy: uid,
    }, { merge: true });
    await firestore_1.defaultDb.collection('integrationAuditLogs').add({
        storeId,
        action: 'api_key.revoked',
        actorUid: uid,
        targetId: keyId,
        createdAt: timestamp,
    });
    return { ok: true, keyId };
});
exports.rotateIntegrationApiKey = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    const keyId = normalizeIntegrationApiKeyId(data?.keyId);
    const keyRef = firestore_1.defaultDb.collection('integrationApiKeys').doc(keyId);
    const keySnap = await keyRef.get();
    if (!keySnap.exists)
        throw new functions.https.HttpsError('not-found', 'Integration key not found.');
    const keyData = (keySnap.data() ?? {});
    if (keyData.storeId !== storeId) {
        throw new functions.https.HttpsError('permission-denied', 'Key does not belong to this store.');
    }
    const replacementName = typeof keyData.name === 'string' && keyData.name.trim()
        ? keyData.name.trim()
        : 'Rotated key';
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await keyRef.set({
        status: 'revoked',
        revokedAt: timestamp,
        updatedAt: timestamp,
        revokedBy: uid,
    }, { merge: true });
    const secret = generateIntegrationSecret();
    const token = `sedx_${secret}`;
    const keyHash = hashIntegrationSecret(token);
    const keyPreview = shortMask(token);
    const replacementRef = firestore_1.defaultDb.collection('integrationApiKeys').doc();
    await replacementRef.set({
        storeId,
        name: replacementName,
        status: 'active',
        keyHash,
        keyPreview,
        createdBy: uid,
        rotatedFrom: keyId,
        createdAt: timestamp,
        updatedAt: timestamp,
        revokedAt: null,
        lastUsedAt: null,
    });
    await firestore_1.defaultDb.collection('integrationAuditLogs').add({
        storeId,
        action: 'api_key.rotated',
        actorUid: uid,
        targetId: keyId,
        metadata: { replacementId: replacementRef.id },
        createdAt: timestamp,
    });
    return {
        ok: true,
        revokedKeyId: keyId,
        replacement: {
            id: replacementRef.id,
            name: replacementName,
            status: 'active',
            keyPreview,
        },
        token,
    };
});
/** ============================================================================
 *  CALLABLES: webhook endpoints (owner)
 * ==========================================================================*/
exports.listWebhookEndpoints = functions.https.onCall(async (_data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    let snapshot;
    try {
        snapshot = await firestore_1.defaultDb
            .collection('webhookEndpoints')
            .where('storeId', '==', storeId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
    }
    catch (queryError) {
        if (!isFirestoreMissingIndexError(queryError))
            throw queryError;
        snapshot = await firestore_1.defaultDb.collection('webhookEndpoints').where('storeId', '==', storeId).limit(200).get();
    }
    const endpoints = snapshot.docs
        .map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            url: typeof data.url === 'string' ? data.url : '',
            status: data.status === 'revoked' ? 'revoked' : 'active',
            events: Array.isArray(data.events)
                ? data.events.filter(item => typeof item === 'string')
                : [],
            createdAt: data.createdAt instanceof firestore_1.admin.firestore.Timestamp ? data.createdAt : null,
            updatedAt: data.updatedAt instanceof firestore_1.admin.firestore.Timestamp ? data.updatedAt : null,
            revokedAt: data.revokedAt instanceof firestore_1.admin.firestore.Timestamp ? data.revokedAt : null,
            hasSecret: typeof data.secret === 'string' && data.secret.trim().length > 0,
        };
    })
        .filter(endpoint => endpoint.id && endpoint.url)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
        .slice(0, 50);
    return { storeId, endpoints };
});
exports.upsertWebhookEndpoint = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    const url = normalizeWebhookUrl(data?.url);
    const secret = normalizeWebhookSecret(data?.secret);
    const events = normalizeWebhookEvents(data?.events);
    const endpointId = normalizeOptionalStoreId(data?.endpointId);
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    let endpointRef;
    if (endpointId) {
        endpointRef = firestore_1.defaultDb.collection('webhookEndpoints').doc(endpointId);
        const existing = await endpointRef.get();
        if (!existing.exists) {
            throw new functions.https.HttpsError('not-found', 'Webhook endpoint not found.');
        }
        const existingData = (existing.data() ?? {});
        if (existingData.storeId !== storeId) {
            throw new functions.https.HttpsError('permission-denied', 'Endpoint does not belong to this store.');
        }
    }
    else {
        endpointRef = firestore_1.defaultDb.collection('webhookEndpoints').doc();
    }
    const endpointPayload = {
        storeId,
        url,
        secret,
        events,
        status: 'active',
        updatedAt: timestamp,
        revokedAt: null,
    };
    if (!endpointId) {
        endpointPayload.createdAt = timestamp;
        endpointPayload.createdBy = uid;
    }
    await endpointRef.set(endpointPayload, { merge: true });
    await firestore_1.defaultDb.collection('integrationAuditLogs').add({
        storeId,
        action: endpointId ? 'webhook.updated' : 'webhook.created',
        actorUid: uid,
        targetId: endpointRef.id,
        metadata: { url, events },
        createdAt: timestamp,
    });
    return {
        endpoint: {
            id: endpointRef.id,
            url,
            events,
            status: 'active',
        },
    };
});
exports.revokeWebhookEndpoint = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const storeId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, storeId);
    const endpointId = normalizeWebhookEndpointId(data?.endpointId);
    const endpointRef = firestore_1.defaultDb.collection('webhookEndpoints').doc(endpointId);
    const endpointSnapshot = await endpointRef.get();
    if (!endpointSnapshot.exists) {
        throw new functions.https.HttpsError('not-found', 'Webhook endpoint not found.');
    }
    const endpointData = (endpointSnapshot.data() ?? {});
    if (endpointData.storeId !== storeId) {
        throw new functions.https.HttpsError('permission-denied', 'Endpoint does not belong to this store.');
    }
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await endpointRef.set({
        status: 'revoked',
        revokedAt: timestamp,
        updatedAt: timestamp,
        revokedBy: uid,
    }, { merge: true });
    await firestore_1.defaultDb.collection('integrationAuditLogs').add({
        storeId,
        action: 'webhook.revoked',
        actorUid: uid,
        targetId: endpointId,
        createdAt: timestamp,
    });
    return { ok: true, endpointId };
});
/** ============================================================================
 *  CALLABLES: TikTok OAuth connect (owner)
 * ==========================================================================*/
const TIKTOK_CLIENT_KEY = (0, params_1.defineString)('TIKTOK_CLIENT_KEY');
const TIKTOK_CLIENT_SECRET = (0, params_1.defineString)('TIKTOK_CLIENT_SECRET');
const TIKTOK_REDIRECT_URI = (0, params_1.defineString)('TIKTOK_REDIRECT_URI');
const TIKTOK_SUCCESS_REDIRECT_URL = (0, params_1.defineString)('TIKTOK_SUCCESS_REDIRECT_URL');
const TIKTOK_ERROR_REDIRECT_URL = (0, params_1.defineString)('TIKTOK_ERROR_REDIRECT_URL');
const DEFAULT_TIKTOK_SCOPES = 'user.info.basic,video.list';
const TIKTOK_STATE_TTL_MILLIS = 1000 * 60 * 15;
exports.startTikTokConnect = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const uid = context.auth.uid;
    const ownerStoreId = await resolveStaffStoreId(uid);
    await verifyOwnerForStore(uid, ownerStoreId);
    const requestedStoreId = normalizeOptionalStoreId(data?.storeId);
    const storeId = requestedStoreId ?? ownerStoreId;
    if (storeId !== ownerStoreId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only connect TikTok for your active owner store.');
    }
    const clientKey = TIKTOK_CLIENT_KEY.value().trim();
    const redirectUri = TIKTOK_REDIRECT_URI.value().trim();
    if (!clientKey || !redirectUri) {
        throw new functions.https.HttpsError('failed-precondition', 'TikTok connection is not configured. Ask support to set TikTok env vars.');
    }
    const state = crypto.randomBytes(24).toString('hex');
    const createdAt = firestore_1.admin.firestore.Timestamp.now();
    await firestore_1.defaultDb.collection('tiktokOAuthStates').doc(state).set({
        storeId,
        createdBy: uid,
        createdAt,
        status: 'pending',
    });
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', DEFAULT_TIKTOK_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    return {
        ok: true,
        authorizationUrl: authUrl.toString(),
    };
});
function buildTikTokRedirectTarget(baseUrl, params) {
    if (!baseUrl)
        return null;
    try {
        const url = new URL(baseUrl);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        return url.toString();
    }
    catch {
        console.warn('[tiktok] Invalid redirect URL configured', { baseUrl });
        return null;
    }
}
function sendTikTokHtmlResponse(res, title, message, isError) {
    const statusCode = isError ? 400 : 200;
    const safeTitle = title.replace(/[<>&]/g, '');
    const safeMessage = message.replace(/[<>&]/g, '');
    res.status(statusCode).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 560px; margin: 64px auto; padding: 28px; background: #111827; border-radius: 14px; }
      h1 { margin: 0 0 10px; font-size: 1.3rem; }
      p { margin: 0 0 12px; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <p>You can close this window and return to Sedifex.</p>
    </main>
  </body>
</html>`);
}
exports.tiktokOAuthCallback = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'Method not allowed.' });
        return;
    }
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const error = typeof req.query.error === 'string' ? req.query.error.trim() : '';
    const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description.trim() : '';
    const successRedirectBase = TIKTOK_SUCCESS_REDIRECT_URL.value().trim() || null;
    const errorRedirectBase = TIKTOK_ERROR_REDIRECT_URL.value().trim() || null;
    function handleError(message, reason) {
        const target = buildTikTokRedirectTarget(errorRedirectBase, {
            tiktokConnect: 'error',
            reason,
        });
        if (target) {
            res.redirect(302, target);
            return;
        }
        sendTikTokHtmlResponse(res, 'TikTok connection failed', message, true);
    }
    if (!state) {
        handleError('Missing OAuth state. Please retry from Account Overview.', 'missing_state');
        return;
    }
    if (error) {
        const detail = errorDescription || error;
        handleError(`TikTok authorization was not completed: ${detail}.`, 'authorization_denied');
        return;
    }
    if (!code) {
        handleError('Missing authorization code from TikTok. Please retry.', 'missing_code');
        return;
    }
    const stateRef = firestore_1.defaultDb.collection('tiktokOAuthStates').doc(state);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
        handleError('This TikTok connection session has expired. Start again from Sedifex.', 'invalid_state');
        return;
    }
    const stateData = (stateSnap.data() ?? {});
    const storeId = typeof stateData.storeId === 'string' ? stateData.storeId.trim() : '';
    const createdAt = stateData.createdAt instanceof firestore_1.admin.firestore.Timestamp ? stateData.createdAt : null;
    const isAlreadyUsed = stateData.status === 'completed';
    const isExpired = !createdAt || Date.now() - createdAt.toMillis() > TIKTOK_STATE_TTL_MILLIS;
    if (!storeId || isAlreadyUsed || isExpired) {
        await stateRef.set({
            status: isExpired ? 'expired' : 'invalid',
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        handleError('This TikTok connection session is no longer valid. Please retry.', 'expired_state');
        return;
    }
    const clientKey = TIKTOK_CLIENT_KEY.value().trim();
    const clientSecret = TIKTOK_CLIENT_SECRET.value().trim();
    const redirectUri = TIKTOK_REDIRECT_URI.value().trim();
    if (!clientKey || !clientSecret || !redirectUri) {
        handleError('TikTok environment variables are missing on the server.', 'missing_server_config');
        return;
    }
    try {
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }),
        });
        const tokenJson = (await tokenResponse.json());
        if (!tokenResponse.ok || !tokenJson.access_token) {
            console.error('[tiktok] OAuth token exchange failed', {
                status: tokenResponse.status,
                payload: tokenJson,
            });
            handleError('TikTok token exchange failed. Please retry.', 'token_exchange_failed');
            return;
        }
        const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
        const expiresInSeconds = typeof tokenJson.expires_in === 'number' && Number.isFinite(tokenJson.expires_in)
            ? tokenJson.expires_in
            : null;
        const refreshExpiresInSeconds = typeof tokenJson.refresh_expires_in === 'number' && Number.isFinite(tokenJson.refresh_expires_in)
            ? tokenJson.refresh_expires_in
            : null;
        const tiktokRef = firestore_1.defaultDb.collection('stores').doc(storeId).collection('integrations').doc('tiktok');
        await tiktokRef.set({
            provider: 'tiktok',
            status: 'connected',
            openId: typeof tokenJson.open_id === 'string' ? tokenJson.open_id : null,
            scope: typeof tokenJson.scope === 'string' ? tokenJson.scope : DEFAULT_TIKTOK_SCOPES,
            tokenType: typeof tokenJson.token_type === 'string' ? tokenJson.token_type : 'Bearer',
            accessToken: tokenJson.access_token,
            refreshToken: typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : null,
            accessTokenExpiresInSeconds: expiresInSeconds,
            refreshTokenExpiresInSeconds: refreshExpiresInSeconds,
            accessTokenExpiresAt: expiresInSeconds !== null
                ? firestore_1.admin.firestore.Timestamp.fromMillis(Date.now() + expiresInSeconds * 1000)
                : null,
            refreshTokenExpiresAt: refreshExpiresInSeconds !== null
                ? firestore_1.admin.firestore.Timestamp.fromMillis(Date.now() + refreshExpiresInSeconds * 1000)
                : null,
            connectedAt: now,
            updatedAt: now,
        }, { merge: true });
        await firestore_1.defaultDb.collection('stores').doc(storeId).set({
            tiktokConnectionStatus: 'connected',
            tiktokConnectedAt: now,
            updatedAt: now,
        }, { merge: true });
        await stateRef.set({
            status: 'completed',
            updatedAt: now,
        }, { merge: true });
        const successTarget = buildTikTokRedirectTarget(successRedirectBase, {
            tiktokConnect: 'success',
        });
        if (successTarget) {
            res.redirect(302, successTarget);
            return;
        }
        sendTikTokHtmlResponse(res, 'TikTok connected', 'Your TikTok account is now connected. Sedifex can now store tokens for feed sync.', false);
    }
    catch (tokenError) {
        console.error('[tiktok] Unexpected OAuth callback failure', tokenError);
        handleError('Unexpected error while connecting TikTok. Please retry.', 'unexpected_error');
    }
});
function setIntegrationResponseHeaders(res) {
    const configuredApiBaseUrl = SEDIFEX_API_BASE_URL.value().trim();
    const contractVersion = INTEGRATION_CONTRACT_VERSION.value().trim() || '2026-04-13';
    const requestId = crypto.randomUUID();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-API-Key,X-Sedifex-Contract-Version');
    res.setHeader('x-sedifex-contract-version', contractVersion);
    res.setHeader('x-sedifex-request-id', requestId);
    if (configuredApiBaseUrl) {
        res.setHeader('x-sedifex-api-base-url', configuredApiBaseUrl);
    }
}
function validateIntegrationContractVersionOrReply(req, res) {
    const requestedVersion = typeof req.headers['x-sedifex-contract-version'] === 'string'
        ? req.headers['x-sedifex-contract-version'].trim()
        : '';
    if (!requestedVersion)
        return true;
    const currentVersion = INTEGRATION_CONTRACT_VERSION.value().trim() || '2026-04-13';
    if (requestedVersion === currentVersion)
        return true;
    res.status(400).json({
        error: 'contract-version-mismatch',
        expectedVersion: currentVersion,
        receivedVersion: requestedVersion,
    });
    return false;
}
function getIntegrationAuthContext(req) {
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKey = typeof apiKeyHeader === 'string'
        ? apiKeyHeader.trim()
        : Array.isArray(apiKeyHeader) && typeof apiKeyHeader[0] === 'string'
            ? apiKeyHeader[0].trim()
            : '';
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
    return { apiKey, storeId };
}
function getPromoSlugFromRequest(req) {
    return (0, publicSlug_1.normalizePublicSlugValue)(typeof req.query.slug === 'string' ? req.query.slug : '');
}
function buildStoreSlugCandidates(data) {
    const candidates = new Set();
    const rawCandidates = [
        data.promoSlug,
        data.slug,
        data.workspaceSlug,
        data.displayName,
        data.name,
    ];
    for (const value of rawCandidates) {
        if (typeof value !== 'string')
            continue;
        const normalized = (0, publicSlug_1.normalizePublicSlugValue)(value);
        if (!normalized)
            continue;
        candidates.add(normalized);
    }
    return [...candidates];
}
async function findStoreByNormalizedSlugFallback(promoSlug) {
    const pageSize = 500;
    let storesCursor = null;
    while (true) {
        let storesQuery = firestore_1.defaultDb
            .collection('stores')
            .orderBy(firestore_1.admin.firestore.FieldPath.documentId())
            .limit(pageSize);
        if (storesCursor) {
            storesQuery = storesQuery.startAfter(storesCursor);
        }
        const storesSnapshot = await storesQuery.get();
        if (storesSnapshot.empty) {
            break;
        }
        for (const storeDoc of storesSnapshot.docs) {
            const storeData = (storeDoc.data() ?? {});
            const slugCandidates = buildStoreSlugCandidates(storeData);
            if (!slugCandidates.includes(promoSlug)) {
                continue;
            }
            return {
                storeId: storeDoc.id,
                data: storeData,
            };
        }
        storesCursor = storesSnapshot.docs[storesSnapshot.docs.length - 1];
    }
    let workspaceCursor = null;
    while (true) {
        let workspacesQuery = firestore_1.defaultDb
            .collection('workspaces')
            .orderBy(firestore_1.admin.firestore.FieldPath.documentId())
            .limit(pageSize);
        if (workspaceCursor) {
            workspacesQuery = workspacesQuery.startAfter(workspaceCursor);
        }
        const workspacesSnapshot = await workspacesQuery.get();
        if (workspacesSnapshot.empty) {
            break;
        }
        for (const workspaceDoc of workspacesSnapshot.docs) {
            const workspaceData = (workspaceDoc.data() ?? {});
            const workspaceSlug = typeof workspaceData.slug === 'string' ? (0, publicSlug_1.normalizePublicSlugValue)(workspaceData.slug) : '';
            if (!workspaceSlug || workspaceSlug !== promoSlug) {
                continue;
            }
            const workspaceStoreId = typeof workspaceData.storeId === 'string' && workspaceData.storeId.trim()
                ? workspaceData.storeId.trim()
                : workspaceDoc.id;
            const storeByWorkspace = await firestore_1.defaultDb.collection('stores').doc(workspaceStoreId).get();
            if (!storeByWorkspace.exists) {
                continue;
            }
            return {
                storeId: storeByWorkspace.id,
                data: (storeByWorkspace.data() ?? {}),
            };
        }
        workspaceCursor = workspacesSnapshot.docs[workspacesSnapshot.docs.length - 1];
    }
    return null;
}
function toTrimmedStringOrNull(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function pickStoreCity(storeData) {
    return toTrimmedStringOrNull(storeData.city) ?? toTrimmedStringOrNull(storeData.town);
}
function buildStorePublicMeta(storeData) {
    const promoSlug = toTrimmedStringOrNull(storeData.promoSlug);
    return {
        storeName: toTrimmedStringOrNull(storeData.displayName) ?? toTrimmedStringOrNull(storeData.name),
        storeCity: pickStoreCity(storeData),
        storePhone: toTrimmedStringOrNull(storeData.phone) ??
            toTrimmedStringOrNull(storeData.phoneNumber) ??
            toTrimmedStringOrNull(storeData.contactPhone),
        websiteLink: toTrimmedStringOrNull(storeData.websiteLink) ??
            toTrimmedStringOrNull(storeData.promoWebsiteUrl) ??
            (promoSlug ? `https://www.sedifex.com/${encodeURIComponent(promoSlug)}` : null),
    };
}
async function resolveStorePublicMetaByStoreId(storeId) {
    const normalizedStoreId = typeof storeId === 'string' ? storeId.trim() : '';
    if (!normalizedStoreId)
        return null;
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(normalizedStoreId).get();
    if (!storeSnap.exists)
        return null;
    return buildStorePublicMeta((storeSnap.data() ?? {}));
}
async function fetchStoreMetaByStoreId(storeIds) {
    const normalizedStoreIds = Array.from(new Set(storeIds
        .map(storeId => (typeof storeId === 'string' ? storeId.trim() : ''))
        .filter(Boolean)));
    const storeMeta = new Map();
    if (normalizedStoreIds.length === 0) {
        return storeMeta;
    }
    const storeRefs = normalizedStoreIds.map(storeId => firestore_1.defaultDb.collection('stores').doc(storeId));
    const storeSnapshots = await firestore_1.defaultDb.getAll(...storeRefs);
    for (const storeSnapshot of storeSnapshots) {
        if (!storeSnapshot.exists)
            continue;
        const data = (storeSnapshot.data() ?? {});
        storeMeta.set(storeSnapshot.id, {
            storeName: toTrimmedStringOrNull(data.displayName) ?? toTrimmedStringOrNull(data.name),
            storeCity: pickStoreCity(data),
        });
    }
    return storeMeta;
}
function extractYoutubeVideoId(value) {
    if (!value)
        return null;
    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'youtu.be') {
            const id = parsed.pathname.replace(/^\/+/, '').split('/')[0]?.trim();
            return id || null;
        }
        if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com') {
            const watchId = parsed.searchParams.get('v')?.trim();
            if (watchId)
                return watchId;
            const parts = parsed.pathname.split('/').filter(Boolean);
            const embedIndex = parts.findIndex(part => part === 'embed' || part === 'shorts');
            if (embedIndex >= 0 && parts[embedIndex + 1]) {
                return parts[embedIndex + 1].trim() || null;
            }
        }
    }
    catch {
        return null;
    }
    return null;
}
function toYoutubeEmbedUrl(value) {
    const videoId = extractYoutubeVideoId(value);
    if (!videoId)
        return null;
    return `https://www.youtube.com/embed/${videoId}`;
}
function extractXmlTag(source, tagName) {
    const match = source.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    if (!match || typeof match[1] !== 'string')
        return null;
    const value = match[1].trim();
    return value || null;
}
async function fetchYoutubeChannelVideos(channelId, limit = 5) {
    const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const response = await fetch(feedUrl, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`YouTube feed request failed with status ${response.status}`);
    }
    const xml = await response.text();
    const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
    const videos = [];
    for (const entry of entryMatches.slice(0, safeLimit)) {
        const videoId = extractXmlTag(entry, 'yt:videoId');
        if (!videoId)
            continue;
        const title = extractXmlTag(entry, 'title');
        const publishedAt = extractXmlTag(entry, 'published');
        videos.push({
            videoId,
            title,
            publishedAt,
            watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
            thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        });
    }
    return videos;
}
function toYoutubeChannelIdOrNull(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (/^UC[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const channelIndex = parts.findIndex(segment => segment === 'channel');
        if (channelIndex >= 0 && parts[channelIndex + 1] && /^UC[a-zA-Z0-9_-]{10,}$/.test(parts[channelIndex + 1])) {
            return parts[channelIndex + 1];
        }
    }
    catch {
        return null;
    }
    return null;
}
const DEFAULT_PRODUCT_IMAGE_URL = 'https://storage.googleapis.com/sedifeximage/stores/Y5ivjrJUBtWl7KzoR0aVszFu1c93/logo.jpg?v=1775656136764';
function normalizeProductName(value) {
    if (typeof value !== 'string')
        return '';
    return value
        .trim()
        .toLowerCase()
        .replace(/\b[a-z]/g, character => character.toUpperCase());
}
function toTrimmedStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const unique = new Set();
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const trimmed = item.trim();
        if (!trimmed)
            continue;
        unique.add(trimmed);
    }
    return [...unique];
}
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function toGoogleMerchantAvailability(stockCount) {
    return typeof stockCount === 'number' && Number.isFinite(stockCount) && stockCount > 0 ? 'in stock' : 'out of stock';
}
function toGoogleMerchantCondition(value) {
    if (typeof value !== 'string')
        return 'new';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'used' || normalized === 'refurbished')
        return normalized;
    return 'new';
}
function extractProductImageSet(data) {
    const primaryImageUrl = toTrimmedStringOrNull(data.imageUrl);
    const imageUrls = toTrimmedStringArray(data.imageUrls);
    if (primaryImageUrl && !imageUrls.includes(primaryImageUrl)) {
        imageUrls.unshift(primaryImageUrl);
    }
    const fallbackImageUrl = imageUrls[0] ?? primaryImageUrl ?? DEFAULT_PRODUCT_IMAGE_URL;
    if (!imageUrls.length) {
        imageUrls.push(fallbackImageUrl);
    }
    return {
        imageUrl: fallbackImageUrl,
        imageUrls,
        imageAlt: toTrimmedStringOrNull(data.imageAlt),
    };
}
async function resolvePromoStoreForRead(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method-not-allowed' });
        return null;
    }
    const { apiKey, storeId } = getIntegrationAuthContext(req);
    if (apiKey || storeId) {
        const authContext = await validateIntegrationTokenOrReply(req, res);
        if (!authContext) {
            return null;
        }
        if (!authContext.storeId) {
            res.status(400).json({ error: 'missing-store-id' });
            return null;
        }
        const storeSnap = await firestore_1.defaultDb.collection('stores').doc(authContext.storeId).get();
        if (!storeSnap.exists) {
            res.status(404).json({ error: 'store-not-found' });
            return null;
        }
        return {
            storeId: authContext.storeId,
            data: (storeSnap.data() ?? {}),
        };
    }
    const promoSlug = getPromoSlugFromRequest(req);
    if (!promoSlug) {
        res.status(400).json({ error: 'missing-promo-slug' });
        return null;
    }
    const activeStoreByPromoSlug = await firestore_1.defaultDb
        .collection('stores')
        .where('promoSlug', '==', promoSlug)
        .where('promoEnabled', '==', true)
        .limit(1)
        .get();
    if (!activeStoreByPromoSlug.empty) {
        const matchedStoreDoc = activeStoreByPromoSlug.docs[0];
        return {
            storeId: matchedStoreDoc.id,
            data: (matchedStoreDoc.data() ?? {}),
        };
    }
    const storeByPromoSlug = await firestore_1.defaultDb
        .collection('stores')
        .where('promoSlug', '==', promoSlug)
        .limit(1)
        .get();
    if (!storeByPromoSlug.empty) {
        const matchedStoreDoc = storeByPromoSlug.docs[0];
        return {
            storeId: matchedStoreDoc.id,
            data: (matchedStoreDoc.data() ?? {}),
        };
    }
    const legacySlugFields = ['slug', 'workspaceSlug'];
    for (const legacySlugField of legacySlugFields) {
        const storeByLegacySlug = await firestore_1.defaultDb
            .collection('stores')
            .where(legacySlugField, '==', promoSlug)
            .limit(1)
            .get();
        if (storeByLegacySlug.empty) {
            continue;
        }
        const matchedStoreDoc = storeByLegacySlug.docs[0];
        return {
            storeId: matchedStoreDoc.id,
            data: (matchedStoreDoc.data() ?? {}),
        };
    }
    const workspaceByExactSlug = await firestore_1.defaultDb
        .collection('workspaces')
        .where('slug', '==', promoSlug)
        .limit(1)
        .get();
    if (!workspaceByExactSlug.empty) {
        const workspaceDoc = workspaceByExactSlug.docs[0];
        const workspaceData = (workspaceDoc.data() ?? {});
        const workspaceStoreId = typeof workspaceData.storeId === 'string' && workspaceData.storeId.trim()
            ? workspaceData.storeId.trim()
            : workspaceDoc.id;
        const storeByWorkspace = await firestore_1.defaultDb.collection('stores').doc(workspaceStoreId).get();
        if (storeByWorkspace.exists) {
            return {
                storeId: storeByWorkspace.id,
                data: (storeByWorkspace.data() ?? {}),
            };
        }
    }
    const normalizedFallbackMatch = await findStoreByNormalizedSlugFallback(promoSlug);
    if (normalizedFallbackMatch) {
        return normalizedFallbackMatch;
    }
    res.status(404).json({ error: 'promo-not-found' });
    return null;
}
function normalizeTimestampIso(value) {
    if (value instanceof firestore_1.admin.firestore.Timestamp) {
        return value.toDate().toISOString();
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    if (typeof value === 'string') {
        const millis = Date.parse(value);
        return Number.isNaN(millis) ? null : new Date(millis).toISOString();
    }
    return null;
}
function toIsoStringOrNull(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const millis = Date.parse(trimmed);
    if (Number.isNaN(millis))
        return null;
    return new Date(millis).toISOString();
}
function toFiniteNumber(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function toPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value;
}
const BOOKING_ATTRIBUTE_MAX_KEYS = 40;
const BOOKING_ATTRIBUTE_MAX_VALUE_LENGTH = 500;
const DEFAULT_BOOKING_ALIASES = {
    customerName: ['name', 'fullName', 'customerName', 'clientName'],
    customerPhone: ['phone', 'customerPhone', 'phoneNumber', 'mobile', 'whatsapp'],
    customerEmail: ['email', 'customerEmail', 'emailAddress'],
    serviceName: ['serviceName', 'productName', 'service_note_name', 'internalServiceName'],
    bookingDate: ['date', 'bookingDate'],
    bookingTime: ['time', 'bookingTime'],
    branchLocationId: ['branchLocationId', 'branchId', 'locationId', 'storeBranchId'],
    branchLocationName: ['branchLocationName', 'branchName', 'storeBranch', 'locationName', 'branch'],
    eventLocation: ['eventLocation', 'eventVenue', 'venue', 'eventAddress'],
    customerStayLocation: ['customerStayLocation', 'stayLocation', 'hotelLocation', 'guestLocation'],
    preferredBranch: ['preferredBranch', 'branch', 'branchName'],
    preferredContactMethod: ['preferredContactMethod', 'contactMethod'],
    paymentAmount: ['paymentAmount', 'amount', 'total', 'price'],
    depositAmount: ['depositAmount', 'depositPaid', 'amountPaid'],
    paymentMethod: ['paymentMethod'],
};
const DEFAULT_BOOKING_SHEET_HEADERS = {
    customerName: 'Customer Name',
    customerPhone: 'Customer Phone',
    customerEmail: 'Customer Email',
    serviceName: 'Service',
    bookingDate: 'Booking Date',
    bookingTime: 'Booking Time',
    branchLocationId: 'Branch Location ID',
    branchLocationName: 'Branch Location Name',
    eventLocation: 'Event Location',
    customerStayLocation: 'Customer Stay Location',
    preferredBranch: 'Preferred Branch',
    preferredContactMethod: 'Preferred Contact Method',
    paymentAmount: 'Payment Amount',
    paymentMethod: 'Payment Method',
    depositAmount: 'Deposit Amount',
    status: 'Status',
    quantity: 'Quantity',
};
function normalizeBookingAliasList(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(item => item.length > 0)
        .slice(0, 40);
}
function normalizeBookingHeaderMap(value) {
    const objectValue = toPlainObject(value);
    const normalized = {};
    for (const [key, header] of Object.entries(objectValue)) {
        if (typeof header !== 'string')
            continue;
        const normalizedHeader = header.trim().slice(0, 120);
        if (!normalizedHeader)
            continue;
        normalized[key.trim()] = normalizedHeader;
    }
    return normalized;
}
async function loadBookingIngestionConfig(storeId) {
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    const storeData = (storeSnap.data() ?? {});
    const integrationConfig = toPlainObject(storeData.integrationBookingConfig);
    const fieldAliases = toPlainObject(integrationConfig.fieldAliases);
    const aliases = {
        customerName: [...DEFAULT_BOOKING_ALIASES.customerName, ...normalizeBookingAliasList(fieldAliases.customerName)],
        customerPhone: [...DEFAULT_BOOKING_ALIASES.customerPhone, ...normalizeBookingAliasList(fieldAliases.customerPhone)],
        customerEmail: [...DEFAULT_BOOKING_ALIASES.customerEmail, ...normalizeBookingAliasList(fieldAliases.customerEmail)],
        serviceName: [...DEFAULT_BOOKING_ALIASES.serviceName, ...normalizeBookingAliasList(fieldAliases.serviceName)],
        bookingDate: [...DEFAULT_BOOKING_ALIASES.bookingDate, ...normalizeBookingAliasList(fieldAliases.bookingDate)],
        bookingTime: [...DEFAULT_BOOKING_ALIASES.bookingTime, ...normalizeBookingAliasList(fieldAliases.bookingTime)],
        branchLocationId: [
            ...DEFAULT_BOOKING_ALIASES.branchLocationId,
            ...normalizeBookingAliasList(fieldAliases.branchLocationId),
        ],
        branchLocationName: [
            ...DEFAULT_BOOKING_ALIASES.branchLocationName,
            ...normalizeBookingAliasList(fieldAliases.branchLocationName),
        ],
        eventLocation: [...DEFAULT_BOOKING_ALIASES.eventLocation, ...normalizeBookingAliasList(fieldAliases.eventLocation)],
        customerStayLocation: [
            ...DEFAULT_BOOKING_ALIASES.customerStayLocation,
            ...normalizeBookingAliasList(fieldAliases.customerStayLocation),
        ],
        preferredBranch: [...DEFAULT_BOOKING_ALIASES.preferredBranch, ...normalizeBookingAliasList(fieldAliases.preferredBranch)],
        preferredContactMethod: [
            ...DEFAULT_BOOKING_ALIASES.preferredContactMethod,
            ...normalizeBookingAliasList(fieldAliases.preferredContactMethod),
        ],
        paymentAmount: [...DEFAULT_BOOKING_ALIASES.paymentAmount, ...normalizeBookingAliasList(fieldAliases.paymentAmount)],
        depositAmount: [...DEFAULT_BOOKING_ALIASES.depositAmount, ...normalizeBookingAliasList(fieldAliases.depositAmount)],
        paymentMethod: [...DEFAULT_BOOKING_ALIASES.paymentMethod, ...normalizeBookingAliasList(fieldAliases.paymentMethod)],
    };
    return {
        mappingVersion: toTrimmedStringOrNull(integrationConfig.mappingVersion) ?? 'v1',
        aliases,
        sheetHeaders: {
            ...DEFAULT_BOOKING_SHEET_HEADERS,
            ...normalizeBookingHeaderMap(integrationConfig.sheetHeaders),
        },
    };
}
function canonicalizeBookingKey(key) {
    return key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function buildBookingValueLookup(source) {
    const lookup = new Map();
    for (const [key, value] of Object.entries(source)) {
        const normalized = canonicalizeBookingKey(key);
        if (!normalized || lookup.has(normalized))
            continue;
        lookup.set(normalized, value);
    }
    return lookup;
}
function pickBookingValueFromAliases(options) {
    for (const alias of options.aliases) {
        const normalizedAlias = canonicalizeBookingKey(alias);
        if (!normalizedAlias)
            continue;
        for (const lookup of options.lookups) {
            if (lookup.has(normalizedAlias)) {
                return lookup.get(normalizedAlias);
            }
        }
    }
    return null;
}
function sanitizeBookingAttributes(raw) {
    const sanitized = {};
    const truncatedKeys = [];
    const droppedKeys = [];
    const rawEntries = Object.entries(raw);
    const keptEntries = rawEntries.slice(0, BOOKING_ATTRIBUTE_MAX_KEYS);
    for (const [key, value] of keptEntries) {
        const normalizedKey = key.trim().slice(0, 80);
        if (!normalizedKey) {
            droppedKeys.push(key);
            continue;
        }
        if (value === null || typeof value === 'number' || typeof value === 'boolean') {
            sanitized[normalizedKey] = value;
            continue;
        }
        if (typeof value === 'string') {
            const nextValue = value.trim().slice(0, BOOKING_ATTRIBUTE_MAX_VALUE_LENGTH);
            if (nextValue.length < value.trim().length)
                truncatedKeys.push(normalizedKey);
            sanitized[normalizedKey] = nextValue;
            continue;
        }
        if (Array.isArray(value)) {
            if (value.length > 20)
                truncatedKeys.push(normalizedKey);
            sanitized[normalizedKey] = value.slice(0, 20);
            continue;
        }
        if (value && typeof value === 'object') {
            const stringified = JSON.stringify(value);
            const nextValue = stringified.slice(0, BOOKING_ATTRIBUTE_MAX_VALUE_LENGTH);
            if (nextValue.length < stringified.length)
                truncatedKeys.push(normalizedKey);
            sanitized[normalizedKey] = nextValue;
            continue;
        }
        const fallback = String(value);
        const nextValue = fallback.slice(0, BOOKING_ATTRIBUTE_MAX_VALUE_LENGTH);
        if (nextValue.length < fallback.length)
            truncatedKeys.push(normalizedKey);
        sanitized[normalizedKey] = nextValue;
    }
    if (rawEntries.length > BOOKING_ATTRIBUTE_MAX_KEYS) {
        droppedKeys.push(...rawEntries.slice(BOOKING_ATTRIBUTE_MAX_KEYS).map(([key]) => key));
    }
    return {
        attributes: sanitized,
        meta: {
            totalReceived: rawEntries.length,
            totalStored: Object.keys(sanitized).length,
            truncatedKeys,
            droppedKeys,
        },
    };
}
function formatDateParts(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function normalizeBookingDateForSheet(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, yearRaw, monthRaw, dayRaw] = isoMatch;
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        const day = Number(dayRaw);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year &&
            date.getUTCMonth() + 1 === month &&
            date.getUTCDate() === day) {
            return formatDateParts(year, month, day);
        }
        return null;
    }
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) {
        return null;
    }
    return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}
function normalizeBookingTimeForSheet(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const twentyFourHourMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (twentyFourHourMatch) {
        const [, hourRaw, minuteRaw] = twentyFourHourMatch;
        return `${String(Number(hourRaw)).padStart(2, '0')}:${minuteRaw}`;
    }
    const meridiemMatch = trimmed.match(/^([1-9]|1[0-2])(?::([0-5]\d))?\s*([ap]m)$/i);
    if (meridiemMatch) {
        const [, hourRaw, minuteRaw, meridiemRaw] = meridiemMatch;
        const hour = Number(hourRaw);
        const minute = minuteRaw ?? '00';
        const meridiem = meridiemRaw.toLowerCase();
        const normalizedHour = meridiem === 'pm' ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
        return `${String(normalizedHour).padStart(2, '0')}:${minute}`;
    }
    return null;
}
function mapAvailabilitySlotDoc(docSnap) {
    const data = docSnap.data();
    const storeId = toTrimmedStringOrNull(data.storeId);
    const serviceId = toTrimmedStringOrNull(data.serviceId);
    const startAt = normalizeTimestampIso(data.startAt);
    const endAt = normalizeTimestampIso(data.endAt);
    if (!storeId || !serviceId || !startAt || !endAt) {
        return null;
    }
    const capacityRaw = toFiniteNumberOrNull(data.capacity);
    const capacity = capacityRaw !== null && capacityRaw >= 0 ? Math.floor(capacityRaw) : null;
    const seatsBookedRaw = toFiniteNumber(data.seatsBooked, 0);
    const seatsBooked = Math.max(0, Math.floor(seatsBookedRaw));
    const seatsRemaining = capacity === null ? null : Math.max(0, capacity - seatsBooked);
    const statusRaw = toTrimmedStringOrNull(data.status)?.toLowerCase();
    const status = statusRaw === 'closed' || statusRaw === 'cancelled'
        ? statusRaw
        : 'open';
    return {
        id: docSnap.id,
        storeId,
        serviceId,
        startAt,
        endAt,
        timezone: toTrimmedStringOrNull(data.timezone),
        capacity,
        seatsBooked,
        seatsRemaining,
        status,
        attributes: toPlainObject(data.attributes),
        updatedAt: normalizeTimestampIso(data.updatedAt),
    };
}
function mapIntegrationBookingDoc(docSnap) {
    const data = (docSnap.data() ?? {});
    const storeId = toTrimmedStringOrNull(data.storeId);
    const serviceId = toTrimmedStringOrNull(data.serviceId);
    if (!storeId || !serviceId) {
        return null;
    }
    const statusRaw = toTrimmedStringOrNull(data.status)?.toLowerCase();
    const status = statusRaw === 'pending' || statusRaw === 'cancelled' || statusRaw === 'checked_in'
        ? statusRaw
        : 'confirmed';
    const customer = toPlainObject(data.customer);
    const quantityRaw = toFiniteNumber(data.quantity, 1);
    const attributesMetaRaw = toPlainObject(data.attributesMeta);
    const sheetSyncRaw = toPlainObject(data.sheetSync);
    const sheetColumnsRaw = toPlainObject(sheetSyncRaw.columns);
    const sheetColumns = {};
    for (const [header, value] of Object.entries(sheetColumnsRaw)) {
        if (value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
            sheetColumns[header] = value;
        }
    }
    return {
        id: docSnap.id,
        storeId,
        serviceId,
        slotId: toTrimmedStringOrNull(data.slotId),
        status,
        customer: {
            name: toTrimmedStringOrNull(customer.name),
            phone: toTrimmedStringOrNull(customer.phone),
            email: toTrimmedStringOrNull(customer.email),
        },
        quantity: Math.max(1, Math.floor(quantityRaw)),
        notes: toTrimmedStringOrNull(data.notes),
        importantFields: {
            serviceName: toTrimmedStringOrNull(data.serviceName),
            bookingDate: toTrimmedStringOrNull(data.date),
            bookingTime: toTrimmedStringOrNull(data.time),
            branchLocationId: toTrimmedStringOrNull(data.branchLocationId),
            branchLocationName: toTrimmedStringOrNull(data.branchLocationName),
            eventLocation: toTrimmedStringOrNull(data.eventLocation),
            customerStayLocation: toTrimmedStringOrNull(data.customerStayLocation),
            preferredBranch: toTrimmedStringOrNull(data.preferredBranch),
            preferredContactMethod: toTrimmedStringOrNull(data.preferredContactMethod),
            paymentMethod: toTrimmedStringOrNull(data.paymentMethod),
            paymentAmount: typeof data.paymentAmount === 'number' && Number.isFinite(data.paymentAmount)
                ? data.paymentAmount
                : toTrimmedStringOrNull(data.paymentAmount),
            depositAmount: typeof data.depositAmount === 'number' && Number.isFinite(data.depositAmount)
                ? data.depositAmount
                : toTrimmedStringOrNull(data.depositAmount),
        },
        sheetSync: {
            mappingVersion: toTrimmedStringOrNull(sheetSyncRaw.mappingVersion) ?? 'v1',
            columns: sheetColumns,
        },
        attributesMeta: {
            totalReceived: Math.max(0, Math.floor(toFiniteNumber(attributesMetaRaw.totalReceived, 0))),
            totalStored: Math.max(0, Math.floor(toFiniteNumber(attributesMetaRaw.totalStored, 0))),
            truncatedKeys: Array.isArray(attributesMetaRaw.truncatedKeys)
                ? attributesMetaRaw.truncatedKeys
                    .map(key => (typeof key === 'string' ? key.trim() : ''))
                    .filter(Boolean)
                    .slice(0, 100)
                : [],
            droppedKeys: Array.isArray(attributesMetaRaw.droppedKeys)
                ? attributesMetaRaw.droppedKeys
                    .map(key => (typeof key === 'string' ? key.trim() : ''))
                    .filter(Boolean)
                    .slice(0, 100)
                : [],
        },
        attributes: toPlainObject(data.attributes),
        createdAt: normalizeTimestampIso(data.createdAt),
        updatedAt: normalizeTimestampIso(data.updatedAt),
    };
}
function normalizeIdentityValue(value) {
    if (!value)
        return null;
    return value.trim().toLowerCase();
}
function normalizePhoneValue(value) {
    if (!value)
        return null;
    const normalized = value.replace(/\s+/g, '').trim();
    return normalized || null;
}
async function upsertBookingCustomerProfile(options) {
    const { storeId, customerName, customerPhone, customerEmail, bookingId } = options;
    const normalizedPhone = normalizePhoneValue(customerPhone);
    const normalizedEmail = normalizeIdentityValue(customerEmail);
    if (!normalizedPhone && !normalizedEmail) {
        return;
    }
    const customerLookupSnapshots = await Promise.all([
        normalizedPhone
            ? firestore_1.defaultDb
                .collection('customers')
                .where('storeId', '==', storeId)
                .where('phone', '==', normalizedPhone)
                .limit(1)
                .get()
            : Promise.resolve(null),
        normalizedEmail
            ? firestore_1.defaultDb
                .collection('customers')
                .where('storeId', '==', storeId)
                .where('email', '==', normalizedEmail)
                .limit(1)
                .get()
            : Promise.resolve(null),
    ]);
    const existingCustomerDoc = customerLookupSnapshots[0]?.docs?.[0] ?? customerLookupSnapshots[1]?.docs?.[0] ?? null;
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const nameToPersist = customerName ?? customerEmail ?? customerPhone ?? 'Booking customer';
    if (existingCustomerDoc) {
        const existingData = (existingCustomerDoc.data() ?? {});
        const updates = {
            updatedAt: now,
            lastBookingId: bookingId,
            lastBookingAt: now,
            lastBookingSource: 'integrationBooking',
            bookingCount: firestore_1.admin.firestore.FieldValue.increment(1),
        };
        if (!toTrimmedStringOrNull(existingData.name) && customerName) {
            updates.name = customerName;
        }
        if (!toTrimmedStringOrNull(existingData.displayName) && customerName) {
            updates.displayName = customerName;
        }
        if (!toTrimmedStringOrNull(existingData.phone) && normalizedPhone) {
            updates.phone = normalizedPhone;
        }
        if (!toTrimmedStringOrNull(existingData.email) && normalizedEmail) {
            updates.email = normalizedEmail;
        }
        await existingCustomerDoc.ref.set(updates, { merge: true });
        return;
    }
    const customerRef = firestore_1.defaultDb.collection('customers').doc();
    await customerRef.set({
        storeId,
        name: nameToPersist,
        displayName: nameToPersist,
        phone: normalizedPhone,
        email: normalizedEmail,
        createdAt: now,
        updatedAt: now,
        source: 'integrationBooking',
        firstBookingId: bookingId,
        lastBookingId: bookingId,
        lastBookingAt: now,
        bookingCount: 1,
    });
}
async function validateIntegrationTokenOrReply(req, res, options) {
    const allowedMethods = options?.allowedMethods ?? ['GET'];
    if (!allowedMethods.includes(req.method ?? '')) {
        res.status(405).json({ error: 'method-not-allowed' });
        return null;
    }
    const requireStoreId = options?.requireStoreId !== false;
    const { apiKey, storeId } = getIntegrationAuthContext(req);
    if (!apiKey) {
        res.status(400).json({ error: 'missing-api-key' });
        return null;
    }
    const expectedApiKey = getIntegrationMasterApiKey();
    if (expectedApiKey && apiKey === expectedApiKey) {
        if (requireStoreId && !storeId) {
            res.status(400).json({ error: 'missing-store-id' });
            return null;
        }
        return { storeId: storeId || null, isMasterKey: true };
    }
    if (!storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return null;
    }
    const tokenHash = hashIntegrationSecret(apiKey);
    const keySnapshot = await firestore_1.defaultDb
        .collection('integrationApiKeys')
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .where('keyHash', '==', tokenHash)
        .limit(1)
        .get();
    if (keySnapshot.empty) {
        res.status(401).json({ error: 'invalid-api-key' });
        return null;
    }
    const keyDoc = keySnapshot.docs[0];
    await keyDoc.ref.set({
        lastUsedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { storeId, isMasterKey: false };
}
function toFiniteNumberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function getSortMode(value) {
    if (value === 'price' || value === 'featured' || value === 'store-diverse')
        return value;
    return 'newest';
}
function compareByFeaturedThenUpdated(a, b) {
    if (a.featuredRank !== b.featuredRank)
        return b.featuredRank - a.featuredRank;
    if (!a.updatedAt && !b.updatedAt)
        return 0;
    if (!a.updatedAt)
        return 1;
    if (!b.updatedAt)
        return -1;
    return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
}
function isMarketplaceVisibleProduct(data, name) {
    if (!name)
        return false;
    if (data.deleted === true || data.isDeleted === true)
        return false;
    if (data.archived === true || data.isArchived === true)
        return false;
    if (data.hidden === true || data.isHidden === true)
        return false;
    if (data.visible === false || data.isVisible === false)
        return false;
    return true;
}
function interleaveStoreDiverse(products) {
    const byStore = new Map();
    for (const product of products) {
        const rows = byStore.get(product.storeId) ?? [];
        rows.push(product);
        byStore.set(product.storeId, rows);
    }
    const stores = [...byStore.keys()].sort((a, b) => a.localeCompare(b));
    for (const storeId of stores) {
        const rows = byStore.get(storeId);
        if (!rows)
            continue;
        rows.sort(compareByFeaturedThenUpdated);
    }
    const interleaved = [];
    let keepGoing = true;
    while (keepGoing) {
        keepGoing = false;
        for (const storeId of stores) {
            const rows = byStore.get(storeId);
            if (!rows || rows.length === 0)
                continue;
            const next = rows.shift();
            if (!next)
                continue;
            interleaved.push(next);
            keepGoing = true;
        }
    }
    return interleaved;
}
function paginateProducts(products, page, pageSize, maxPerStore) {
    if (!maxPerStore) {
        const start = (page - 1) * pageSize;
        return products.slice(start, start + pageSize);
    }
    const pages = [];
    let currentPage = [];
    let perStoreCounter = new Map();
    for (const product of products) {
        if (currentPage.length >= pageSize) {
            pages.push(currentPage);
            currentPage = [];
            perStoreCounter = new Map();
        }
        const currentStoreCount = perStoreCounter.get(product.storeId) ?? 0;
        if (currentStoreCount >= maxPerStore) {
            continue;
        }
        currentPage.push(product);
        perStoreCounter.set(product.storeId, currentStoreCount + 1);
    }
    if (currentPage.length)
        pages.push(currentPage);
    return pages[page - 1] ?? [];
}
exports.v1Products = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method-not-allowed' });
        return;
    }
    const sort = getSortMode(req.query.sort);
    const pageRaw = Number(req.query.page ?? 1);
    const requestedPage = Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1;
    const page = Math.max(1, requestedPage);
    const pageSizeRaw = Number(req.query.pageSize ?? req.query.limit ?? 24);
    const requestedPageSize = Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 24;
    const pageSize = Math.min(Math.max(requestedPageSize, 1), 60);
    const maxPerStoreRaw = Number(req.query.maxPerStore ?? 0);
    const maxPerStoreCandidate = Number.isFinite(maxPerStoreRaw) ? Math.floor(maxPerStoreRaw) : 0;
    const maxPerStore = maxPerStoreCandidate > 0 ? maxPerStoreCandidate : null;
    let productsSnap;
    try {
        productsSnap = await firestore_1.defaultDb.collection('products').orderBy('updatedAt', 'desc').limit(2000).get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex)
            throw error;
        productsSnap = await firestore_1.defaultDb.collection('products').limit(2000).get();
    }
    const visibleProducts = productsSnap.docs
        .map(docSnap => {
        const data = docSnap.data();
        const storeId = typeof data.storeId === 'string' ? data.storeId.trim() : '';
        const name = normalizeProductName(data.name);
        if (!storeId || !isMarketplaceVisibleProduct(data, name))
            return null;
        return {
            id: docSnap.id,
            storeId,
            name: name || 'Untitled item',
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
            price: typeof data.price === 'number' ? data.price : null,
            stockCount: typeof data.stockCount === 'number' ? data.stockCount : null,
            itemType: data.itemType === 'service'
                ? 'service'
                : data.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            ...extractProductImageSet(data),
            featuredRank: toFiniteNumberOrNull(data.featuredRank) ?? 0,
            updatedAt: normalizeTimestampIso(data.updatedAt),
        };
    })
        .filter((item) => item !== null);
    const sortedProducts = sort === 'store-diverse'
        ? interleaveStoreDiverse(visibleProducts)
        : [...visibleProducts].sort((a, b) => {
            if (sort === 'featured')
                return compareByFeaturedThenUpdated(a, b);
            if (sort === 'price') {
                const aPrice = typeof a.price === 'number' ? a.price : Number.POSITIVE_INFINITY;
                const bPrice = typeof b.price === 'number' ? b.price : Number.POSITIVE_INFINITY;
                if (aPrice !== bPrice)
                    return aPrice - bPrice;
            }
            if (!a.updatedAt && !b.updatedAt)
                return 0;
            if (!a.updatedAt)
                return 1;
            if (!b.updatedAt)
                return -1;
            return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
        });
    const products = paginateProducts(sortedProducts, page, pageSize, maxPerStore);
    res.status(200).json({
        sort,
        page,
        pageSize,
        maxPerStore,
        total: sortedProducts.length,
        products,
    });
});
exports.integrationProducts = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    const authContext = await validateIntegrationTokenOrReply(req, res, { requireStoreId: false });
    if (!authContext) {
        return;
    }
    const mapProductDoc = (docSnap) => {
        const data = docSnap.data();
        const normalizedName = normalizeProductName(data.name);
        const storeId = typeof data.storeId === 'string' && data.storeId.trim() ? data.storeId.trim() : null;
        if (!storeId)
            return null;
        return {
            id: docSnap.id,
            storeId,
            storeName: null,
            storeCity: null,
            name: normalizedName || 'Untitled item',
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            description: typeof data.description === 'string' && data.description.trim()
                ? data.description.trim()
                : null,
            price: typeof data.price === 'number' ? data.price : null,
            stockCount: typeof data.stockCount === 'number' ? data.stockCount : null,
            itemType: data.itemType === 'service'
                ? 'service'
                : data.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            ...extractProductImageSet(data),
            updatedAt: data.updatedAt instanceof firestore_1.admin.firestore.Timestamp ? data.updatedAt.toDate().toISOString() : null,
        };
    };
    let productsSnap;
    const scopeStoreId = authContext.storeId;
    const isAllStoresRead = authContext.isMasterKey && !scopeStoreId;
    try {
        if (isAllStoresRead) {
            productsSnap = await firestore_1.defaultDb.collection('products').orderBy('updatedAt', 'desc').limit(2000).get();
        }
        else {
            if (!scopeStoreId) {
                res.status(400).json({ error: 'missing-store-id' });
                return;
            }
            productsSnap = await firestore_1.defaultDb
                .collection('products')
                .where('storeId', '==', scopeStoreId)
                .orderBy('updatedAt', 'desc')
                .limit(200)
                .get();
        }
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        if (isAllStoresRead) {
            console.warn('[integrationProducts] Missing Firestore index for all-store ordered product query; falling back to unordered fetch', {
                code,
            });
            productsSnap = await firestore_1.defaultDb.collection('products').limit(2000).get();
        }
        else {
            console.warn('[integrationProducts] Missing Firestore index for ordered product query; falling back to unordered fetch', {
                storeId: scopeStoreId,
                code,
            });
            productsSnap = await firestore_1.defaultDb.collection('products').where('storeId', '==', scopeStoreId).limit(200).get();
        }
    }
    const products = productsSnap.docs
        .map(mapProductDoc)
        .filter(item => item !== null)
        .sort((a, b) => {
        if (!a.updatedAt && !b.updatedAt)
            return 0;
        if (!a.updatedAt)
            return 1;
        if (!b.updatedAt)
            return -1;
        return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
    });
    const storeMetaByStoreId = await fetchStoreMetaByStoreId(products.map(product => product.storeId));
    const enrichedProducts = products.map(product => {
        const storeMeta = storeMetaByStoreId.get(product.storeId);
        return {
            ...product,
            storeName: storeMeta?.storeName ?? null,
            storeCity: storeMeta?.storeCity ?? null,
        };
    });
    res.status(200).json({
        storeId: scopeStoreId ?? null,
        scope: isAllStoresRead ? 'all-stores' : 'store',
        products: enrichedProducts,
    });
});
exports.v1IntegrationProducts = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    const authContext = await validateIntegrationTokenOrReply(req, res, { requireStoreId: false });
    if (!authContext) {
        return;
    }
    const mapProductDoc = (docSnap) => {
        const data = docSnap.data();
        const normalizedName = normalizeProductName(data.name);
        const storeId = typeof data.storeId === 'string' && data.storeId.trim() ? data.storeId.trim() : null;
        if (!storeId)
            return null;
        return {
            id: docSnap.id,
            storeId,
            storeName: null,
            storeCity: null,
            name: normalizedName || 'Untitled item',
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            description: typeof data.description === 'string' && data.description.trim()
                ? data.description.trim()
                : null,
            price: typeof data.price === 'number' ? data.price : null,
            stockCount: typeof data.stockCount === 'number' ? data.stockCount : null,
            itemType: data.itemType === 'service'
                ? 'service'
                : data.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            ...extractProductImageSet(data),
            updatedAt: data.updatedAt instanceof firestore_1.admin.firestore.Timestamp ? data.updatedAt.toDate().toISOString() : null,
        };
    };
    let productsSnap;
    const scopeStoreId = authContext.storeId;
    const isAllStoresRead = authContext.isMasterKey && !scopeStoreId;
    try {
        if (isAllStoresRead) {
            productsSnap = await firestore_1.defaultDb.collection('products').orderBy('updatedAt', 'desc').limit(2000).get();
        }
        else {
            if (!scopeStoreId) {
                res.status(400).json({ error: 'missing-store-id' });
                return;
            }
            productsSnap = await firestore_1.defaultDb
                .collection('products')
                .where('storeId', '==', scopeStoreId)
                .orderBy('updatedAt', 'desc')
                .limit(200)
                .get();
        }
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        if (isAllStoresRead) {
            console.warn('[v1IntegrationProducts] Missing Firestore index for all-store ordered product query; falling back to unordered fetch', {
                code,
            });
            productsSnap = await firestore_1.defaultDb.collection('products').limit(2000).get();
        }
        else {
            console.warn('[v1IntegrationProducts] Missing Firestore index for ordered product query; falling back to unordered fetch', {
                storeId: scopeStoreId,
                code,
            });
            productsSnap = await firestore_1.defaultDb.collection('products').where('storeId', '==', scopeStoreId).limit(200).get();
        }
    }
    const products = productsSnap.docs
        .map(mapProductDoc)
        .filter(item => item !== null)
        .sort((a, b) => {
        if (!a.updatedAt && !b.updatedAt)
            return 0;
        if (!a.updatedAt)
            return 1;
        if (!b.updatedAt)
            return -1;
        return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
    });
    const storeMetaByStoreId = await fetchStoreMetaByStoreId(products.map(product => product.storeId));
    const enrichedProducts = products.map(product => {
        const storeMeta = storeMetaByStoreId.get(product.storeId);
        return {
            ...product,
            storeName: storeMeta?.storeName ?? null,
            storeCity: storeMeta?.storeCity ?? null,
        };
    });
    res.status(200).json({
        storeId: scopeStoreId ?? null,
        scope: isAllStoresRead ? 'all-stores' : 'store',
        products: enrichedProducts,
    });
});
exports.integrationPromo = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const storeContext = await resolvePromoStoreForRead(req, res);
    if (!storeContext) {
        return;
    }
    const { storeId, data } = storeContext;
    const youtubeUrl = toTrimmedStringOrNull(data.promoYoutubeUrl);
    const youtubeChannelId = toYoutubeChannelIdOrNull(toTrimmedStringOrNull(data.promoYoutubeChannelId));
    let youtubeVideos = [];
    if (youtubeChannelId) {
        try {
            youtubeVideos = await fetchYoutubeChannelVideos(youtubeChannelId, 5);
        }
        catch (error) {
            console.warn('[integrationPromo] Unable to fetch YouTube channel videos', {
                storeId,
                youtubeChannelId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    res.status(200).json({
        storeId,
        promo: {
            enabled: data.promoEnabled === true,
            slug: toTrimmedStringOrNull(data.promoSlug),
            title: toTrimmedStringOrNull(data.promoTitle),
            summary: toTrimmedStringOrNull(data.promoSummary),
            startDate: toTrimmedStringOrNull(data.promoStartDate),
            endDate: toTrimmedStringOrNull(data.promoEndDate),
            websiteUrl: toTrimmedStringOrNull(data.promoWebsiteUrl),
            youtubeUrl,
            youtubeEmbedUrl: toYoutubeEmbedUrl(youtubeUrl),
            youtubeChannelId,
            youtubeVideos,
            imageUrl: toTrimmedStringOrNull(data.promoImageUrl),
            imageAlt: toTrimmedStringOrNull(data.promoImageAlt),
            phone: toTrimmedStringOrNull(data.whatsappNumber) ?? toTrimmedStringOrNull(data.phone),
            storeName: toTrimmedStringOrNull(data.displayName) ?? toTrimmedStringOrNull(data.name) ?? 'Sedifex Store',
            updatedAt: normalizeTimestampIso(data.updatedAt),
        },
    });
});
exports.v1IntegrationPromo = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const storeContext = await resolvePromoStoreForRead(req, res);
    if (!storeContext) {
        return;
    }
    const { storeId, data } = storeContext;
    const youtubeUrl = toTrimmedStringOrNull(data.promoYoutubeUrl);
    const youtubeChannelId = toYoutubeChannelIdOrNull(toTrimmedStringOrNull(data.promoYoutubeChannelId));
    let youtubeVideos = [];
    if (youtubeChannelId) {
        try {
            youtubeVideos = await fetchYoutubeChannelVideos(youtubeChannelId, 5);
        }
        catch (error) {
            console.warn('[v1IntegrationPromo] Unable to fetch YouTube channel videos', {
                storeId,
                youtubeChannelId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    res.status(200).json({
        storeId,
        promo: {
            enabled: data.promoEnabled === true,
            slug: toTrimmedStringOrNull(data.promoSlug),
            title: toTrimmedStringOrNull(data.promoTitle),
            summary: toTrimmedStringOrNull(data.promoSummary),
            startDate: toTrimmedStringOrNull(data.promoStartDate),
            endDate: toTrimmedStringOrNull(data.promoEndDate),
            websiteUrl: toTrimmedStringOrNull(data.promoWebsiteUrl),
            youtubeUrl,
            youtubeEmbedUrl: toYoutubeEmbedUrl(youtubeUrl),
            youtubeChannelId,
            youtubeVideos,
            imageUrl: toTrimmedStringOrNull(data.promoImageUrl),
            imageAlt: toTrimmedStringOrNull(data.promoImageAlt),
            phone: toTrimmedStringOrNull(data.whatsappNumber) ?? toTrimmedStringOrNull(data.phone),
            storeName: toTrimmedStringOrNull(data.displayName) ?? toTrimmedStringOrNull(data.name) ?? 'Sedifex Store',
            updatedAt: normalizeTimestampIso(data.updatedAt),
        },
    });
});
exports.v1IntegrationAvailability = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const authContext = await validateIntegrationTokenOrReply(req, res);
    if (!authContext) {
        return;
    }
    if (!authContext.storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return;
    }
    const serviceIdFilter = toTrimmedStringOrNull(req.query.serviceId);
    const fromFilter = toIsoStringOrNull(req.query.from);
    const toFilter = toIsoStringOrNull(req.query.to);
    let slotsSnapshot;
    try {
        slotsSnapshot = await firestore_1.defaultDb
            .collection('stores')
            .doc(authContext.storeId)
            .collection('serviceAvailability')
            .orderBy('startAt', 'asc')
            .limit(500)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        slotsSnapshot = await firestore_1.defaultDb
            .collection('stores')
            .doc(authContext.storeId)
            .collection('serviceAvailability')
            .limit(500)
            .get();
    }
    const slots = slotsSnapshot.docs
        .map(mapAvailabilitySlotDoc)
        .filter((slot) => slot !== null)
        .filter(slot => {
        if (serviceIdFilter && slot.serviceId !== serviceIdFilter) {
            return false;
        }
        if (fromFilter && slot.endAt < fromFilter) {
            return false;
        }
        if (toFilter && slot.startAt > toFilter) {
            return false;
        }
        return true;
    })
        .sort((a, b) => (a.startAt > b.startAt ? 1 : a.startAt < b.startAt ? -1 : 0));
    res.status(200).json({
        storeId: authContext.storeId,
        serviceId: serviceIdFilter,
        from: fromFilter,
        to: toFilter,
        slots,
    });
});
async function resolveIntegrationBookingServiceId(options) {
    const { storeId, payload } = options;
    const explicitServiceId = toTrimmedStringOrNull(payload.serviceId) ??
        toTrimmedStringOrNull(payload.serviceID) ??
        toTrimmedStringOrNull(payload.service_id);
    if (explicitServiceId)
        return explicitServiceId;
    const slotId = toTrimmedStringOrNull(payload.slotId) ??
        toTrimmedStringOrNull(payload.slotID) ??
        toTrimmedStringOrNull(payload.slot_id);
    if (slotId) {
        const slotSnapshot = await firestore_1.defaultDb
            .collection('stores')
            .doc(storeId)
            .collection('serviceAvailability')
            .doc(slotId)
            .get();
        if (slotSnapshot.exists) {
            const slotData = (slotSnapshot.data() ?? {});
            const slotServiceId = toTrimmedStringOrNull(slotData.serviceId);
            if (slotServiceId)
                return slotServiceId;
        }
    }
    const defaultServiceId = getBookingDefaultServiceId();
    if (defaultServiceId)
        return defaultServiceId;
    const serviceNameFallback = toTrimmedStringOrNull(payload.productName) ??
        toTrimmedStringOrNull(payload.product_name) ??
        toTrimmedStringOrNull(payload.serviceName) ??
        toTrimmedStringOrNull(payload.service_name) ??
        toTrimmedStringOrNull(payload.name) ??
        toTrimmedStringOrNull(payload.title);
    if (serviceNameFallback) {
        const normalized = serviceNameFallback
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
        if (normalized) {
            return `name:${normalized}`;
        }
    }
    return 'unspecified-service';
}
exports.v1IntegrationBookings = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (!validateIntegrationContractVersionOrReply(req, res)) {
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method === 'GET') {
        const authContext = await validateIntegrationTokenOrReply(req, res);
        if (!authContext) {
            return;
        }
        if (!authContext.storeId) {
            res.status(400).json({ error: 'missing-store-id' });
            return;
        }
        const limitRaw = Number(req.query.limit ?? 50);
        const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 200);
        let bookingsSnapshot;
        try {
            bookingsSnapshot = await firestore_1.defaultDb
                .collection('stores')
                .doc(authContext.storeId)
                .collection('integrationBookings')
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
        }
        catch (error) {
            const code = error?.code;
            const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
            if (!isMissingIndex) {
                throw error;
            }
            bookingsSnapshot = await firestore_1.defaultDb
                .collection('stores')
                .doc(authContext.storeId)
                .collection('integrationBookings')
                .limit(limit)
                .get();
        }
        const statusFilter = toTrimmedStringOrNull(req.query.status)?.toLowerCase() ?? null;
        const serviceIdFilter = toTrimmedStringOrNull(req.query.serviceId);
        const bookings = bookingsSnapshot.docs
            .map(mapIntegrationBookingDoc)
            .filter((booking) => booking !== null)
            .filter(booking => {
            if (statusFilter && booking.status !== statusFilter)
                return false;
            if (serviceIdFilter && booking.serviceId !== serviceIdFilter)
                return false;
            return true;
        });
        res.status(200).json({
            storeId: authContext.storeId,
            bookings,
        });
        return;
    }
    const authContext = await validateIntegrationTokenOrReply(req, res, {
        allowedMethods: ['POST'],
    });
    if (!authContext) {
        return;
    }
    if (!authContext.storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return;
    }
    const payload = toPlainObject(req.body);
    const bookingConfig = await loadBookingIngestionConfig(authContext.storeId);
    const serviceId = await resolveIntegrationBookingServiceId({
        storeId: authContext.storeId,
        payload,
    });
    if (!serviceId) {
        res.status(400).json({
            error: 'service-not-resolved',
            message: 'Service could not be resolved. Configure BOOKING_DEFAULT_SERVICE_ID, provide serviceId, or include product/service name.',
        });
        return;
    }
    const slotId = toTrimmedStringOrNull(payload.slotId) ??
        toTrimmedStringOrNull(payload.slotID) ??
        toTrimmedStringOrNull(payload.slot_id);
    const sanitizedAttributesResult = sanitizeBookingAttributes(toPlainObject(payload.attributes));
    const payloadAttributes = sanitizedAttributesResult.attributes;
    const payloadLookup = buildBookingValueLookup(payload);
    const attributesLookup = buildBookingValueLookup(payloadAttributes);
    const customer = toPlainObject(payload.customer);
    const customerLookup = buildBookingValueLookup(customer);
    const pickBookingString = (...values) => {
        for (const value of values) {
            const normalized = toTrimmedStringOrNull(value);
            if (normalized)
                return normalized;
        }
        return null;
    };
    const pickBookingAmount = (...values) => {
        for (const value of values) {
            const numeric = toFiniteNumberOrNull(value);
            if (numeric !== null)
                return numeric;
            const normalized = toTrimmedStringOrNull(value);
            if (normalized)
                return normalized;
        }
        return null;
    };
    const pickBookingBoolean = (...values) => {
        for (const value of values) {
            if (typeof value === 'boolean')
                return value;
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (normalized === 'true' || normalized === 'yes')
                    return true;
                if (normalized === 'false' || normalized === 'no')
                    return false;
            }
        }
        return null;
    };
    const bookingDateRaw = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.bookingDate,
        lookups: [payloadLookup, attributesLookup],
    }), payload.date, payload.bookingDate, payloadAttributes.date, payloadAttributes.bookingDate);
    const bookingTimeRaw = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.bookingTime,
        lookups: [payloadLookup, attributesLookup],
    }), payload.time, payload.bookingTime, payloadAttributes.time, payloadAttributes.bookingTime);
    const bookingDate = normalizeBookingDateForSheet(bookingDateRaw) ?? bookingDateRaw;
    const bookingTime = normalizeBookingTimeForSheet(bookingTimeRaw) ?? bookingTimeRaw;
    const branchLocationId = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.branchLocationId,
        lookups: [payloadLookup, attributesLookup],
    }), payload.branchLocationId, payload.branchId, payload.locationId, payloadAttributes.branchLocationId, payloadAttributes.branchId, payloadAttributes.locationId);
    const branchLocationName = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.branchLocationName,
        lookups: [payloadLookup, attributesLookup],
    }), payload.branchLocationName, payload.branchName, payload.branch, payloadAttributes.branchLocationName, payloadAttributes.branchName, payloadAttributes.branch);
    const eventLocation = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.eventLocation,
        lookups: [payloadLookup, attributesLookup],
    }), payload.eventLocation, payload.eventVenue, payload.venue, payloadAttributes.eventLocation, payloadAttributes.eventVenue, payloadAttributes.venue);
    const customerStayLocation = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.customerStayLocation,
        lookups: [payloadLookup, attributesLookup],
    }), payload.customerStayLocation, payload.stayLocation, payload.hotelLocation, payloadAttributes.customerStayLocation, payloadAttributes.stayLocation, payloadAttributes.hotelLocation);
    const preferredBranch = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.preferredBranch,
        lookups: [payloadLookup, attributesLookup],
    }), payload.preferredBranch, payload.branch, payload.branchName, payloadAttributes.preferredBranch, payloadAttributes.branch, payloadAttributes.branchName);
    const sessionType = pickBookingString(payload.sessionType, payload.duration, payload.sessionDuration, payloadAttributes.sessionType, payloadAttributes.duration, payloadAttributes.sessionDuration);
    const therapistPreference = pickBookingString(payload.therapistPreference, payload.preferredTherapist, payloadAttributes.therapistPreference, payloadAttributes.preferredTherapist);
    const preferredContactMethod = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.preferredContactMethod,
        lookups: [payloadLookup, attributesLookup],
    }), payload.preferredContactMethod, payload.contactMethod, payloadAttributes.preferredContactMethod, payloadAttributes.contactMethod);
    const depositAmount = pickBookingAmount(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.depositAmount,
        lookups: [payloadLookup, attributesLookup],
    }), payload.depositAmount, payload.depositPaid, payload.amountPaid, payloadAttributes.depositAmount, payloadAttributes.depositPaid, payloadAttributes.amountPaid);
    const paymentAmount = pickBookingAmount(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.paymentAmount,
        lookups: [payloadLookup, attributesLookup],
    }), payload.paymentAmount, payload.amount, payload.total, payload.price, payloadAttributes.paymentAmount, payloadAttributes.amount, payloadAttributes.total, payloadAttributes.price);
    const paymentMethod = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.paymentMethod,
        lookups: [payloadLookup, attributesLookup],
    }), payload.paymentMethod, payloadAttributes.paymentMethod);
    const paymentScreenshotUrl = pickBookingString(payload.paymentScreenshotUrl, payload.screenshotUrl, payloadAttributes.paymentScreenshotUrl, payloadAttributes.screenshotUrl);
    const paymentScreenshotReady = pickBookingBoolean(payload.paymentScreenshotReady, payloadAttributes.paymentScreenshotReady);
    const noRefundAccepted = pickBookingBoolean(payload.noRefundAccepted, payload.agreeNoRefundPolicy, payloadAttributes.noRefundAccepted, payloadAttributes.agreeNoRefundPolicy);
    const serviceName = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.serviceName,
        lookups: [payloadLookup, attributesLookup],
    }), payload.serviceName, payload.productName, payload.service_note_name, payload.internalServiceName, payloadAttributes.serviceName, payloadAttributes.productName, payloadAttributes.service_note_name, payloadAttributes.internalServiceName);
    const quantityRaw = toFiniteNumber(payload.quantity, 1);
    const quantity = Math.max(1, Math.floor(quantityRaw));
    const customerName = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.customerName,
        lookups: [customerLookup, payloadLookup, attributesLookup],
    }));
    const customerPhone = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.customerPhone,
        lookups: [customerLookup, payloadLookup, attributesLookup],
    }));
    const customerEmail = pickBookingString(pickBookingValueFromAliases({
        aliases: bookingConfig.aliases.customerEmail,
        lookups: [customerLookup, payloadLookup, attributesLookup],
    }));
    if (!customerName && !customerPhone && !customerEmail) {
        res.status(400).json({ error: 'missing-customer-identity' });
        return;
    }
    const bookingRef = firestore_1.defaultDb
        .collection('stores')
        .doc(authContext.storeId)
        .collection('integrationBookings')
        .doc();
    const now = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    const importantFields = {
        serviceName,
        bookingDate,
        bookingTime,
        branchLocationId,
        branchLocationName,
        eventLocation,
        customerStayLocation,
        preferredBranch,
        preferredContactMethod,
        paymentMethod,
        paymentAmount,
        depositAmount,
    };
    const sheetColumns = {};
    const sheetValueByCanonicalKey = {
        customerName,
        customerPhone,
        customerEmail,
        serviceName,
        bookingDate,
        bookingTime,
        branchLocationId,
        branchLocationName,
        eventLocation,
        customerStayLocation,
        preferredBranch,
        preferredContactMethod,
        paymentMethod,
        paymentAmount: typeof paymentAmount === 'number' && Number.isFinite(paymentAmount) ? paymentAmount : paymentAmount ?? null,
        depositAmount: typeof depositAmount === 'number' && Number.isFinite(depositAmount) ? depositAmount : depositAmount ?? null,
        status: 'confirmed',
        quantity,
    };
    for (const [canonicalKey, header] of Object.entries(bookingConfig.sheetHeaders)) {
        if (!header)
            continue;
        if (!Object.prototype.hasOwnProperty.call(sheetValueByCanonicalKey, canonicalKey))
            continue;
        sheetColumns[header] = sheetValueByCanonicalKey[canonicalKey] ?? null;
    }
    const bookingData = {
        storeId: authContext.storeId,
        serviceId,
        slotId: slotId ?? null,
        status: 'confirmed',
        customer: {
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
        },
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        serviceName: importantFields.serviceName,
        date: importantFields.bookingDate,
        time: importantFields.bookingTime,
        branchLocationId: importantFields.branchLocationId,
        branchLocationName: importantFields.branchLocationName,
        eventLocation: importantFields.eventLocation,
        customerStayLocation: importantFields.customerStayLocation,
        preferredBranch: importantFields.preferredBranch,
        sessionType,
        therapistPreference,
        preferredContactMethod: importantFields.preferredContactMethod,
        depositAmount: importantFields.depositAmount,
        paymentMethod: importantFields.paymentMethod,
        paymentAmount: importantFields.paymentAmount,
        paymentScreenshotUrl,
        paymentScreenshotReady,
        noRefundAccepted,
        quantity,
        notes: toTrimmedStringOrNull(payload.notes),
        attributes: payloadAttributes,
        attributesMeta: sanitizedAttributesResult.meta,
        sheetSync: {
            mappingVersion: bookingConfig.mappingVersion,
            columns: sheetColumns,
        },
        source: 'website',
        createdAt: now,
        updatedAt: now,
    };
    if (!slotId) {
        await bookingRef.set(bookingData);
        const bookingSnap = await bookingRef.get();
        const booking = mapIntegrationBookingDoc(bookingSnap);
        await upsertBookingCustomerProfile({
            storeId: authContext.storeId,
            customerName,
            customerPhone,
            customerEmail,
            bookingId: bookingRef.id,
        });
        res.status(201).json({
            booking,
        });
        return;
    }
    const slotRef = firestore_1.defaultDb
        .collection('stores')
        .doc(authContext.storeId)
        .collection('serviceAvailability')
        .doc(slotId);
    try {
        await firestore_1.defaultDb.runTransaction(async (transaction) => {
            const slotSnap = await transaction.get(slotRef);
            if (!slotSnap.exists) {
                throw new Error('slot-not-found');
            }
            const slotData = (slotSnap.data() ?? {});
            const slotServiceId = toTrimmedStringOrNull(slotData.serviceId);
            if (!slotServiceId || slotServiceId !== serviceId) {
                throw new Error('slot-service-mismatch');
            }
            const status = toTrimmedStringOrNull(slotData.status)?.toLowerCase();
            if (status === 'closed' || status === 'cancelled') {
                throw new Error('slot-unavailable');
            }
            const capacityRaw = toFiniteNumberOrNull(slotData.capacity);
            const capacity = capacityRaw !== null && capacityRaw >= 0 ? Math.floor(capacityRaw) : null;
            const existingSeatsBooked = Math.max(0, Math.floor(toFiniteNumber(slotData.seatsBooked, 0)));
            if (capacity !== null && existingSeatsBooked + quantity > capacity) {
                throw new Error('slot-capacity-exceeded');
            }
            transaction.set(bookingRef, bookingData);
            transaction.set(slotRef, {
                seatsBooked: existingSeatsBooked + quantity,
                updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'slot-not-found' ||
            message === 'slot-service-mismatch' ||
            message === 'slot-unavailable' ||
            message === 'slot-capacity-exceeded') {
            res.status(409).json({ error: message });
            return;
        }
        throw error;
    }
    const bookingSnap = await bookingRef.get();
    const booking = mapIntegrationBookingDoc(bookingSnap);
    await upsertBookingCustomerProfile({
        storeId: authContext.storeId,
        customerName,
        customerPhone,
        customerEmail,
        bookingId: bookingRef.id,
    });
    res.status(201).json({
        booking,
    });
});
exports.integrationGallery = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const storeContext = await resolvePromoStoreForRead(req, res);
    if (!storeContext) {
        return;
    }
    const { storeId } = storeContext;
    const gallerySnapshot = await firestore_1.defaultDb
        .collection('stores')
        .doc(storeId)
        .collection('promoGallery')
        .orderBy('sortOrder', 'asc')
        .limit(200)
        .get();
    const gallery = gallerySnapshot.docs
        .map(itemDoc => {
        const data = itemDoc.data();
        if (data.isPublished !== true)
            return null;
        const url = typeof data.url === 'string' ? data.url.trim() : '';
        if (!url)
            return null;
        return {
            id: itemDoc.id,
            url,
            alt: typeof data.alt === 'string' && data.alt.trim() ? data.alt.trim() : null,
            caption: typeof data.caption === 'string' && data.caption.trim() ? data.caption.trim() : null,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            isPublished: true,
            createdAt: normalizeTimestampIso(data.createdAt),
            updatedAt: normalizeTimestampIso(data.updatedAt),
        };
    })
        .filter(item => item !== null);
    res.status(200).json({ storeId, gallery });
});
exports.integrationTikTokVideos = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    const authContext = await validateIntegrationTokenOrReply(req, res);
    if (!authContext) {
        return;
    }
    const { storeId } = authContext;
    if (!storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return;
    }
    let videosSnapshot;
    try {
        videosSnapshot = await firestore_1.defaultDb
            .collection('stores')
            .doc(storeId)
            .collection('tiktokVideos')
            .orderBy('sortOrder', 'asc')
            .orderBy('updatedAt', 'desc')
            .limit(200)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        console.warn('[integrationTikTokVideos] Missing Firestore index for ordered tiktok video query; falling back to unordered fetch', {
            storeId,
            code,
        });
        videosSnapshot = await firestore_1.defaultDb
            .collection('stores')
            .doc(storeId)
            .collection('tiktokVideos')
            .limit(200)
            .get();
    }
    const videos = videosSnapshot.docs
        .map(docSnap => {
        const data = docSnap.data();
        const videoId = typeof data.videoId === 'string' ? data.videoId.trim() : '';
        const embedUrl = typeof data.embedUrl === 'string' ? data.embedUrl.trim() : '';
        const permalink = typeof data.permalink === 'string' ? data.permalink.trim() : '';
        const publishedAt = normalizeTimestampIso(data.publishedAt);
        const updatedAt = normalizeTimestampIso(data.updatedAt);
        const createdAt = normalizeTimestampIso(data.createdAt);
        const isPublished = data.isPublished !== false;
        if (!isPublished) {
            return null;
        }
        if (!videoId && !embedUrl && !permalink) {
            return null;
        }
        return {
            id: docSnap.id,
            videoId: videoId || null,
            embedUrl: embedUrl || null,
            permalink: permalink || null,
            caption: typeof data.caption === 'string' && data.caption.trim() ? data.caption.trim() : null,
            thumbnailUrl: typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim() ? data.thumbnailUrl.trim() : null,
            duration: typeof data.duration === 'number' && Number.isFinite(data.duration) ? Math.max(0, data.duration) : null,
            viewCount: typeof data.viewCount === 'number' && Number.isFinite(data.viewCount)
                ? Math.max(0, Math.floor(data.viewCount))
                : null,
            likeCount: typeof data.likeCount === 'number' && Number.isFinite(data.likeCount)
                ? Math.max(0, Math.floor(data.likeCount))
                : null,
            commentCount: typeof data.commentCount === 'number' && Number.isFinite(data.commentCount)
                ? Math.max(0, Math.floor(data.commentCount))
                : null,
            shareCount: typeof data.shareCount === 'number' && Number.isFinite(data.shareCount)
                ? Math.max(0, Math.floor(data.shareCount))
                : null,
            sortOrder: typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
            publishedAt,
            createdAt,
            updatedAt,
        };
    })
        .filter(video => video !== null)
        .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder)
            return a.sortOrder - b.sortOrder;
        if (!a.updatedAt && !b.updatedAt)
            return 0;
        if (!a.updatedAt)
            return 1;
        if (!b.updatedAt)
            return -1;
        return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
    });
    res.status(200).json({
        storeId,
        videos,
    });
});
exports.integrationPublicCatalog = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const storeContext = await resolvePromoStoreForRead(req, res);
    if (!storeContext) {
        return;
    }
    const { storeId } = storeContext;
    let productsSnapshot;
    try {
        productsSnapshot = await firestore_1.defaultDb
            .collection('products')
            .where('storeId', '==', storeId)
            .orderBy('updatedAt', 'desc')
            .limit(200)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        productsSnapshot = await firestore_1.defaultDb.collection('products').where('storeId', '==', storeId).limit(200).get();
    }
    const products = productsSnapshot.docs
        .map(docSnap => {
        const data = docSnap.data();
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        if (!name)
            return null;
        return {
            id: docSnap.id,
            name,
            description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            price: typeof data.price === 'number' ? data.price : null,
            ...extractProductImageSet(data),
            itemType: data.itemType === 'service'
                ? 'service'
                : data.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            updatedAt: normalizeTimestampIso(data.updatedAt),
        };
    })
        .filter(item => item !== null);
    res.status(200).json({ storeId, products });
});
exports.integrationGoogleMerchantFeed = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const storeContext = await resolvePromoStoreForRead(req, res);
    if (!storeContext) {
        return;
    }
    const { storeId, data: storeData } = storeContext;
    let productsSnapshot;
    try {
        productsSnapshot = await firestore_1.defaultDb
            .collection('products')
            .where('storeId', '==', storeId)
            .orderBy('updatedAt', 'desc')
            .limit(200)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        productsSnapshot = await firestore_1.defaultDb.collection('products').where('storeId', '==', storeId).limit(200).get();
    }
    const storeName = toTrimmedStringOrNull(storeData.displayName) ?? toTrimmedStringOrNull(storeData.name) ?? 'Sedifex Store';
    const promoSlug = toTrimmedStringOrNull(storeData.promoSlug);
    const storeUrl = toTrimmedStringOrNull(storeData.promoWebsiteUrl) ??
        (promoSlug ? `https://www.sedifex.com/${encodeURIComponent(promoSlug)}` : 'https://www.sedifex.com');
    const itemsXml = productsSnapshot.docs
        .map(docSnap => {
        const productData = docSnap.data();
        const name = toTrimmedStringOrNull(productData.name);
        if (!name)
            return null;
        const { imageUrl } = extractProductImageSet(productData);
        const description = toTrimmedStringOrNull(productData.description) ?? name;
        const category = toTrimmedStringOrNull(productData.category);
        const productLink = `${storeUrl.replace(/\/$/, '')}?product=${encodeURIComponent(docSnap.id)}`;
        const priceValue = typeof productData.price === 'number' && Number.isFinite(productData.price) && productData.price >= 0
            ? productData.price
            : 0;
        const content = [
            '<item>',
            `<g:id>${escapeXml(docSnap.id)}</g:id>`,
            `<title>${escapeXml(name)}</title>`,
            `<description>${escapeXml(description)}</description>`,
            `<link>${escapeXml(productLink)}</link>`,
            `<g:price>${escapeXml(priceValue.toFixed(2))} GHS</g:price>`,
            `<g:availability>${escapeXml(toGoogleMerchantAvailability(productData.stockCount))}</g:availability>`,
            `<g:condition>${escapeXml(toGoogleMerchantCondition(productData.condition))}</g:condition>`,
            `<g:brand>${escapeXml(storeName)}</g:brand>`,
        ];
        if (imageUrl) {
            content.push(`<g:image_link>${escapeXml(imageUrl)}</g:image_link>`);
        }
        if (category) {
            content.push(`<g:product_type>${escapeXml(category)}</g:product_type>`);
        }
        content.push('</item>');
        return content.join('');
    })
        .filter((item) => Boolean(item))
        .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(storeName)}</title>
    <link>${escapeXml(storeUrl)}</link>
    <description>${escapeXml(`${storeName} product feed for Google Merchant Center`)}</description>
    ${itemsXml}
  </channel>
</rss>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
});
exports.integrationCustomers = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    const authContext = await validateIntegrationTokenOrReply(req, res);
    if (!authContext) {
        return;
    }
    const { storeId } = authContext;
    if (!storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return;
    }
    let customersSnap;
    try {
        customersSnap = await firestore_1.defaultDb
            .collection('customers')
            .where('storeId', '==', storeId)
            .orderBy('updatedAt', 'desc')
            .limit(500)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        console.warn('[integrationCustomers] Missing Firestore index for ordered customer query; falling back to unordered fetch', {
            storeId,
            code,
        });
        customersSnap = await firestore_1.defaultDb.collection('customers').where('storeId', '==', storeId).limit(500).get();
    }
    const customers = customersSnap.docs
        .map(docSnap => {
        const data = docSnap.data();
        const debt = typeof data.debt === 'object' && data.debt !== null ? data.debt : null;
        return {
            id: docSnap.id,
            storeId,
            name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
            displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : null,
            phone: typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null,
            email: typeof data.email === 'string' && data.email.trim() ? data.email.trim() : null,
            notes: typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null,
            tags: Array.isArray(data.tags)
                ? data.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim())
                : [],
            birthdate: typeof data.birthdate === 'string' && data.birthdate.trim()
                ? data.birthdate.trim()
                : normalizeTimestampIso(data.birthdate),
            createdAt: normalizeTimestampIso(data.createdAt),
            updatedAt: normalizeTimestampIso(data.updatedAt),
            debt: debt
                ? {
                    outstandingCents: typeof debt.outstandingCents === 'number' && Number.isFinite(debt.outstandingCents)
                        ? debt.outstandingCents
                        : null,
                    dueDate: normalizeTimestampIso(debt.dueDate),
                    lastReminderAt: normalizeTimestampIso(debt.lastReminderAt),
                }
                : null,
        };
    })
        .sort((a, b) => {
        if (!a.updatedAt && !b.updatedAt)
            return 0;
        if (!a.updatedAt)
            return 1;
        if (!b.updatedAt)
            return -1;
        return a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0;
    });
    res.status(200).json({ storeId, customers });
});
exports.integrationTopSelling = functions.https.onRequest(async (req, res) => {
    setIntegrationResponseHeaders(res);
    const authContext = await validateIntegrationTokenOrReply(req, res);
    if (!authContext) {
        return;
    }
    const { storeId } = authContext;
    if (!storeId) {
        res.status(400).json({ error: 'missing-store-id' });
        return;
    }
    const limitRaw = Number(req.query.limit ?? 10);
    const requestedLimit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const daysRaw = Number(req.query.days ?? 30);
    const requestedDays = Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 30;
    const days = Math.min(Math.max(requestedDays, 1), 365);
    const windowStartDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let saleItemsSnapshot;
    try {
        saleItemsSnapshot = await firestore_1.defaultDb
            .collection('saleItems')
            .where('storeId', '==', storeId)
            .where('createdAt', '>=', windowStartDate)
            .orderBy('createdAt', 'desc')
            .limit(5000)
            .get();
    }
    catch (error) {
        const code = error?.code;
        const isMissingIndex = code === 9 || code === '9' || code === 'failed-precondition';
        if (!isMissingIndex) {
            throw error;
        }
        console.warn('[integrationTopSelling] Missing Firestore index for ordered saleItems query; falling back to unordered fetch', {
            storeId,
            code,
        });
        saleItemsSnapshot = await firestore_1.defaultDb.collection('saleItems').where('storeId', '==', storeId).limit(5000).get();
    }
    const topSellingByProduct = new Map();
    for (const docSnap of saleItemsSnapshot.docs) {
        const data = docSnap.data();
        const productId = typeof data.productId === 'string' ? data.productId.trim() : '';
        if (!productId)
            continue;
        const createdAtIso = normalizeTimestampIso(data.createdAt);
        if (createdAtIso) {
            const createdAtMillis = Date.parse(createdAtIso);
            if (!Number.isNaN(createdAtMillis) && createdAtMillis < windowStartDate.getTime()) {
                continue;
            }
        }
        const qtyRaw = Number(data.qty ?? 0);
        const qty = Number.isFinite(qtyRaw) ? Math.max(0, Math.abs(qtyRaw)) : 0;
        if (qty <= 0)
            continue;
        const priceRaw = Number(data.price ?? 0);
        const price = Number.isFinite(priceRaw) ? Math.max(0, priceRaw) : 0;
        const grossSales = qty * price;
        const existing = topSellingByProduct.get(productId) ?? {
            qtySold: 0,
            grossSales: 0,
            lastSoldAt: null,
        };
        const nextLastSoldAt = existing.lastSoldAt && createdAtIso && existing.lastSoldAt > createdAtIso
            ? existing.lastSoldAt
            : createdAtIso ?? existing.lastSoldAt;
        topSellingByProduct.set(productId, {
            qtySold: existing.qtySold + qty,
            grossSales: existing.grossSales + grossSales,
            lastSoldAt: nextLastSoldAt,
        });
    }
    const sortedRows = [...topSellingByProduct.entries()]
        .map(([productId, aggregate]) => ({ productId, ...aggregate }))
        .sort((a, b) => {
        if (b.qtySold !== a.qtySold)
            return b.qtySold - a.qtySold;
        if (b.grossSales !== a.grossSales)
            return b.grossSales - a.grossSales;
        if (!a.lastSoldAt && !b.lastSoldAt)
            return 0;
        if (!a.lastSoldAt)
            return 1;
        if (!b.lastSoldAt)
            return -1;
        return a.lastSoldAt > b.lastSoldAt ? -1 : a.lastSoldAt < b.lastSoldAt ? 1 : 0;
    })
        .slice(0, limit);
    const productIds = sortedRows.map(row => row.productId);
    const productInfoById = new Map();
    if (productIds.length > 0) {
        const productRefs = productIds.map(productId => firestore_1.defaultDb.collection('products').doc(productId));
        const productSnaps = await firestore_1.defaultDb.getAll(...productRefs);
        for (const productSnap of productSnaps) {
            if (!productSnap.exists)
                continue;
            const data = (productSnap.data() ?? {});
            productInfoById.set(productSnap.id, {
                name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
                category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
                ...extractProductImageSet(data),
                itemType: data.itemType === 'service'
                    ? 'service'
                    : data.itemType === 'made_to_order'
                        ? 'made_to_order'
                        : 'product',
            });
        }
    }
    const topSelling = sortedRows.map(row => {
        const productInfo = productInfoById.get(row.productId);
        return {
            productId: row.productId,
            name: productInfo?.name ?? null,
            category: productInfo?.category ?? null,
            imageUrl: productInfo?.imageUrl ?? null,
            imageUrls: productInfo?.imageUrls ?? [],
            imageAlt: productInfo?.imageAlt ?? null,
            itemType: productInfo?.itemType ?? 'product',
            qtySold: row.qtySold,
            grossSales: row.grossSales,
            lastSoldAt: row.lastSoldAt,
        };
    });
    res.status(200).json({
        storeId,
        windowDays: days,
        generatedAt: new Date().toISOString(),
        topSelling,
    });
});
/** ============================================================================
 *  WEBHOOKS: product.created / product.updated / product.deleted
 * ==========================================================================*/
function computeWebhookSignature(secret, payload) {
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${digest}`;
}
function shouldDeliverWebhookEvent(endpointEventsRaw, eventType) {
    if (!Array.isArray(endpointEventsRaw) || endpointEventsRaw.length === 0)
        return true;
    const endpointEvents = endpointEventsRaw
        .map(value => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean);
    return endpointEvents.includes(eventType.toLowerCase());
}
const PRODUCT_CATEGORY_RULES = [
    { category: 'Beverages', keywords: ['drink', 'juice', 'soda', 'water', 'coffee', 'tea'] },
    { category: 'Snacks', keywords: ['chips', 'biscuit', 'cookie', 'cracker', 'chocolate'] },
    { category: 'Dairy', keywords: ['milk', 'cheese', 'yoghurt', 'yogurt', 'butter'] },
    { category: 'Bakery', keywords: ['bread', 'cake', 'muffin', 'croissant', 'donut'] },
    { category: 'Personal Care', keywords: ['soap', 'shampoo', 'toothpaste', 'lotion'] },
    { category: 'Cleaning', keywords: ['detergent', 'bleach', 'cleaner', 'disinfectant'] },
];
const MANUFACTURER_RULES = [
    { manufacturerName: 'Coca-Cola', keywords: ['coca cola', 'coke'] },
    { manufacturerName: 'PepsiCo', keywords: ['pepsi', '7up', 'mirinda'] },
    { manufacturerName: 'Nestlé', keywords: ['nestle', 'milo', 'nescafe'] },
    { manufacturerName: 'Unilever', keywords: ['lux', 'closeup', 'omo', 'sunlight'] },
    { manufacturerName: 'PZ Cussons', keywords: ['morning fresh', 'cussons', 'imperial leather'] },
];
const CATEGORY_EMBEDDING_VOCAB = [
    { category: 'Beverages', keywords: ['drink', 'juice', 'soda', 'water', 'coffee', 'tea', 'energy'] },
    { category: 'Snacks', keywords: ['chips', 'biscuit', 'cookie', 'cracker', 'chocolate', 'nuts'] },
    { category: 'Dairy', keywords: ['milk', 'cheese', 'yoghurt', 'yogurt', 'butter', 'cream'] },
    { category: 'Bakery', keywords: ['bread', 'cake', 'muffin', 'croissant', 'donut', 'pastry'] },
    { category: 'Personal Care', keywords: ['soap', 'shampoo', 'toothpaste', 'lotion', 'deodorant'] },
    { category: 'Cleaning', keywords: ['detergent', 'bleach', 'cleaner', 'disinfectant', 'sanitizer'] },
];
function normalizeRuleText(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function inferCategoryFromText(productText) {
    for (const rule of PRODUCT_CATEGORY_RULES) {
        if (rule.keywords.some(keyword => productText.includes(keyword))) {
            return rule.category;
        }
    }
    return null;
}
function inferManufacturerFromText(productText) {
    for (const rule of MANUFACTURER_RULES) {
        if (rule.keywords.some(keyword => productText.includes(keyword))) {
            return rule.manufacturerName;
        }
    }
    return null;
}
function tokenizeForEmbedding(value) {
    if (!value)
        return [];
    return value
        .replace(/[^a-z0-9\s]/gi, ' ')
        .split(/\s+/)
        .map(token => token.trim().toLowerCase())
        .filter(token => token.length > 1);
}
function buildFrequencyMap(tokens) {
    const map = new Map();
    for (const token of tokens) {
        map.set(token, (map.get(token) ?? 0) + 1);
    }
    return map;
}
function cosineSimilarity(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (const value of a.values()) {
        magA += value * value;
    }
    for (const value of b.values()) {
        magB += value * value;
    }
    if (!magA || !magB)
        return 0;
    for (const [token, aValue] of a.entries()) {
        const bValue = b.get(token) ?? 0;
        dot += aValue * bValue;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
function inferCategoryByEmbedding(productText) {
    const productVector = buildFrequencyMap(tokenizeForEmbedding(productText));
    if (!productVector.size)
        return null;
    let best = null;
    for (const row of CATEGORY_EMBEDDING_VOCAB) {
        const categoryVector = buildFrequencyMap(row.keywords.flatMap(keyword => tokenizeForEmbedding(keyword)));
        const score = cosineSimilarity(productVector, categoryVector);
        if (!best || score > best.score) {
            best = { category: row.category, score };
        }
    }
    if (!best || best.score < 0.2)
        return null;
    return best;
}
function summarizeDescription(name, category, manufacturer) {
    const safeName = name.trim();
    if (!safeName)
        return null;
    const parts = [`${safeName} is a quality item`];
    if (category) {
        parts.push(`in the ${category} category`);
    }
    if (manufacturer) {
        parts.push(`from ${manufacturer}`);
    }
    return `${parts.join(' ')}.`;
}
function synthesizeImageAlt(name, category) {
    const safeName = name.trim();
    if (!safeName)
        return null;
    if (category)
        return `${safeName} (${category}) product image`;
    return `${safeName} product image`;
}
function isLowQualityText(value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return true;
    return normalized.length < 8 || /^(n\/a|na|none|test|item|product)$/.test(normalized);
}
function buildProductEnrichment(data) {
    const name = normalizeRuleText(data.name);
    if (!name)
        return null;
    const description = normalizeRuleText(data.description);
    const existingCategory = normalizeRuleText(data.category);
    const existingManufacturer = normalizeRuleText(data.manufacturerName);
    const existingImageAlt = normalizeRuleText(data.imageAlt);
    const merged = `${name} ${description}`.trim();
    const inferredByEmbedding = existingCategory ? null : inferCategoryByEmbedding(merged);
    const inferredCategory = existingCategory
        ? null
        : inferredByEmbedding?.category ?? inferCategoryFromText(merged);
    const inferredManufacturer = existingManufacturer ? null : inferManufacturerFromText(merged);
    const shouldImproveDescription = isLowQualityText(description);
    const shouldImproveImageAlt = isLowQualityText(existingImageAlt);
    const inferredDescription = shouldImproveDescription
        ? summarizeDescription(normalizeProductName(data.name), inferredCategory ?? (typeof data.category === 'string' ? data.category.trim() : null), inferredManufacturer ?? (typeof data.manufacturerName === 'string' ? data.manufacturerName.trim() : null))
        : null;
    const inferredImageAlt = shouldImproveImageAlt
        ? synthesizeImageAlt(normalizeProductName(data.name), inferredCategory ?? (typeof data.category === 'string' ? data.category.trim() : null))
        : null;
    const qualityFlags = [];
    if (shouldImproveDescription)
        qualityFlags.push('missing-or-low-quality-description');
    if (shouldImproveImageAlt)
        qualityFlags.push('missing-or-low-quality-image-alt');
    if (!existingCategory && !inferredCategory)
        qualityFlags.push('missing-category');
    if (!inferredCategory && !inferredManufacturer && !inferredDescription && !inferredImageAlt && !qualityFlags.length)
        return null;
    const matchCount = Number(Boolean(inferredCategory)) +
        Number(Boolean(inferredManufacturer)) +
        Number(Boolean(inferredDescription)) +
        Number(Boolean(inferredImageAlt));
    return {
        category: inferredCategory,
        manufacturerName: inferredManufacturer,
        description: inferredDescription,
        imageAlt: inferredImageAlt,
        confidence: matchCount >= 3 ? 'high' : matchCount >= 2 ? 'medium' : 'low',
        reason: inferredByEmbedding ? 'embedding + rule hybrid enrichment' : 'rule-based keyword enrichment',
        categoryMethod: inferredByEmbedding ? 'embedding' : 'rule',
        qualityFlags,
    };
}
function normalizeForDuplicateMatch(value) {
    if (typeof value !== 'string')
        return '';
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}
function levenshteinDistance(a, b) {
    if (a === b)
        return 0;
    if (!a)
        return b.length;
    if (!b)
        return a.length;
    const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
    const curr = Array.from({ length: b.length + 1 }, () => 0);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= b.length; j++) {
            prev[j] = curr[j];
        }
    }
    return prev[b.length];
}
function fuzzySimilarity(a, b) {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (!maxLength)
        return 1;
    return 1 - distance / maxLength;
}
function buildImageHash(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return null;
    return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}
async function detectPotentialDuplicateProduct(params) {
    const normalizedName = normalizeForDuplicateMatch(params.name);
    if (!normalizedName || !params.storeId)
        return null;
    const currentImageHash = buildImageHash(params.imageUrl);
    const snapshot = await firestore_1.defaultDb
        .collection('products')
        .where('storeId', '==', params.storeId)
        .limit(200)
        .get();
    let bestMatch = null;
    for (const doc of snapshot.docs) {
        if (doc.id === params.productId)
            continue;
        const data = (doc.data() ?? {});
        const candidateName = normalizeForDuplicateMatch(data.name);
        if (!candidateName)
            continue;
        const similarity = fuzzySimilarity(normalizedName, candidateName);
        const candidateImageHash = buildImageHash(data.imageUrl);
        const imageHashMatch = Boolean(currentImageHash && candidateImageHash && currentImageHash === candidateImageHash);
        const isLikelyDuplicate = similarity >= 0.91 || (similarity >= 0.8 && imageHashMatch);
        if (!isLikelyDuplicate)
            continue;
        if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = {
                duplicateProductId: doc.id,
                similarity,
                imageHashMatch,
            };
        }
    }
    return bestMatch;
}
function isFirestoreTimestampLike(value) {
    return (value instanceof firestore_1.admin.firestore.Timestamp ||
        (typeof value === 'object' &&
            value !== null &&
            'toDate' in value &&
            typeof value.toDate === 'function'));
}
function resolvePublicProductPublishedAt(source, existing) {
    const candidates = [
        source.publishedAt,
        existing?.publishedAt,
        source.createdAt,
        source.updatedAt,
        existing?.createdAt,
        existing?.updatedAt,
    ];
    for (const candidate of candidates) {
        if (isFirestoreTimestampLike(candidate) || typeof candidate === 'string') {
            return candidate;
        }
    }
    return firestore_1.admin.firestore.FieldValue.serverTimestamp();
}
function toPublicProductPayload(productId, source, existing, storeMeta) {
    const storeId = typeof source.storeId === 'string' ? source.storeId.trim() : '';
    const name = normalizeProductName(source.name);
    if (!storeId || !name) {
        return null;
    }
    return {
        sourceProductId: productId,
        storeId,
        storeName: toTrimmedStringOrNull(source.storeName) ?? storeMeta?.storeName ?? null,
        storeCity: toTrimmedStringOrNull(source.storeCity) ?? storeMeta?.storeCity ?? null,
        storePhone: toTrimmedStringOrNull(source.storePhone) ?? storeMeta?.storePhone ?? null,
        websiteLink: toTrimmedStringOrNull(source.websiteLink) ?? storeMeta?.websiteLink ?? null,
        name,
        description: typeof source.description === 'string' && source.description.trim() ? source.description.trim() : null,
        category: typeof source.category === 'string' && source.category.trim() ? source.category.trim() : null,
        sku: toTrimmedStringOrNull(source.sku),
        barcode: toTrimmedStringOrNull(source.barcode),
        manufacturerName: toTrimmedStringOrNull(source.manufacturerName),
        price: typeof source.price === 'number' ? source.price : null,
        stockCount: typeof source.stockCount === 'number' ? source.stockCount : null,
        reorderPoint: typeof source.reorderPoint === 'number' ? source.reorderPoint : null,
        taxRate: typeof source.taxRate === 'number' ? source.taxRate : null,
        productionDate: isFirestoreTimestampLike(source.productionDate) || typeof source.productionDate === 'string' ? source.productionDate : null,
        expiryDate: isFirestoreTimestampLike(source.expiryDate) || typeof source.expiryDate === 'string' ? source.expiryDate : null,
        batchNumber: toTrimmedStringOrNull(source.batchNumber),
        showOnReceipt: source.showOnReceipt === true,
        itemType: source.itemType === 'service'
            ? 'service'
            : source.itemType === 'made_to_order'
                ? 'made_to_order'
                : 'product',
        isPublished: source.isPublished !== false,
        ...extractProductImageSet(source),
        publishedAt: resolvePublicProductPublishedAt(source, existing),
        createdAt: source.createdAt ?? existing?.createdAt ?? firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        sourceUpdatedAt: source.updatedAt ?? null,
        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    };
}
exports.syncPublicProducts = functions.firestore
    .document('products/{productId}')
    .onWrite(async (change, context) => {
    const productId = context.params.productId;
    const publicProductRef = firestore_1.defaultDb.collection('publicProducts').doc(productId);
    if (!change.after.exists) {
        await publicProductRef.delete().catch(() => undefined);
        return;
    }
    const sourceData = (change.after.data() ?? {});
    const existingPublicProductSnap = await publicProductRef.get();
    const existingData = existingPublicProductSnap.exists
        ? existingPublicProductSnap.data()
        : null;
    const storeMeta = await resolveStorePublicMetaByStoreId(typeof sourceData.storeId === 'string' ? sourceData.storeId : '');
    const payload = toPublicProductPayload(productId, sourceData, existingData, storeMeta);
    if (!payload) {
        await publicProductRef.delete().catch(() => undefined);
        return;
    }
    await publicProductRef.set(payload, { merge: true });
});
exports.enrichProductDataAfterSave = functions.firestore
    .document('products/{productId}')
    .onWrite(async (change, context) => {
    if (!change.after.exists)
        return;
    const productId = context.params.productId;
    const afterData = (change.after.data() ?? {});
    const enrichment = buildProductEnrichment(afterData);
    const storeId = typeof afterData.storeId === 'string' ? afterData.storeId.trim() : '';
    const duplicateCandidate = typeof afterData.name === 'string' && storeId
        ? await detectPotentialDuplicateProduct({
            productId,
            storeId,
            name: afterData.name,
            imageUrl: typeof afterData.imageUrl === 'string' ? afterData.imageUrl : null,
        })
        : null;
    if (!enrichment && !duplicateCandidate)
        return;
    const updates = {
        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        enrichmentMeta: {
            source: 'product-enrichment-agent',
            lastRunAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
            confidence: enrichment?.confidence ?? 'low',
            reason: enrichment?.reason ?? 'duplicate-detection-only',
            categoryMethod: enrichment?.categoryMethod ?? null,
            qualityFlags: enrichment?.qualityFlags ?? [],
            eventId: context.eventId,
        },
    };
    if (enrichment?.category)
        updates.category = enrichment.category;
    if (enrichment?.manufacturerName)
        updates.manufacturerName = enrichment.manufacturerName;
    if (enrichment?.description)
        updates.description = enrichment.description;
    if (enrichment?.imageAlt)
        updates.imageAlt = enrichment.imageAlt;
    if (duplicateCandidate) {
        updates.catalogQuality = {
            duplicateRisk: 'high',
            duplicateProductId: duplicateCandidate.duplicateProductId,
            duplicateSimilarity: Number(duplicateCandidate.similarity.toFixed(4)),
            imageHashMatch: duplicateCandidate.imageHashMatch,
            checkedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        };
    }
    else {
        updates.catalogQuality = {
            duplicateRisk: 'low',
            checkedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        };
    }
    const currentCategory = typeof afterData.category === 'string' ? afterData.category.trim() : null;
    const currentManufacturer = typeof afterData.manufacturerName === 'string' ? afterData.manufacturerName.trim() : null;
    const currentDescription = typeof afterData.description === 'string' ? afterData.description.trim() : null;
    const currentImageAlt = typeof afterData.imageAlt === 'string' ? afterData.imageAlt.trim() : null;
    const currentDuplicateProductId = afterData.catalogQuality && typeof afterData.catalogQuality === 'object'
        ? toTrimmedStringOrNull(afterData.catalogQuality.duplicateProductId)
        : null;
    const nextDuplicateProductId = duplicateCandidate?.duplicateProductId ?? null;
    const shouldWrite = currentCategory !== (typeof updates.category === 'string' ? updates.category : currentCategory) ||
        currentManufacturer !== (typeof updates.manufacturerName === 'string' ? updates.manufacturerName : currentManufacturer) ||
        currentDescription !== (typeof updates.description === 'string' ? updates.description : currentDescription) ||
        currentImageAlt !== (typeof updates.imageAlt === 'string' ? updates.imageAlt : currentImageAlt) ||
        currentDuplicateProductId !== nextDuplicateProductId;
    if (!shouldWrite)
        return;
    await change.after.ref.set(updates, { merge: true });
});
exports.emitProductWebhooks = functions.firestore
    .document('products/{productId}')
    .onWrite(async (change, context) => {
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    if (!beforeExists && !afterExists)
        return;
    const productId = context.params.productId;
    const beforeData = (beforeExists ? change.before.data() : null);
    const afterData = (afterExists ? change.after.data() : null);
    const storeIdRaw = (typeof afterData?.storeId === 'string' && afterData.storeId) ||
        (typeof beforeData?.storeId === 'string' && beforeData.storeId) ||
        '';
    const storeId = storeIdRaw.trim();
    if (!storeId)
        return;
    const eventType = !beforeExists
        ? 'product.created'
        : !afterExists
            ? 'product.deleted'
            : 'product.updated';
    const payloadObject = {
        id: `evt_${context.eventId}`,
        type: eventType,
        occurredAt: new Date().toISOString(),
        storeId,
        data: {
            productId,
            before: beforeData,
            after: afterData,
        },
    };
    const payload = JSON.stringify(payloadObject);
    const endpointSnapshot = await firestore_1.defaultDb
        .collection('webhookEndpoints')
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .get();
    if (endpointSnapshot.empty)
        return;
    const results = await Promise.all(endpointSnapshot.docs.map(async (endpointDoc) => {
        const endpoint = endpointDoc.data();
        if (!shouldDeliverWebhookEvent(endpoint.events, eventType)) {
            return { endpointId: endpointDoc.id, ok: true, statusCode: 204, error: 'event filtered' };
        }
        const url = typeof endpoint.url === 'string' ? endpoint.url.trim() : '';
        const secret = typeof endpoint.secret === 'string' ? endpoint.secret : '';
        if (!url || !secret) {
            return { endpointId: endpointDoc.id, ok: false, statusCode: null, error: 'missing config' };
        }
        const signature = computeWebhookSignature(secret, payload);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-sedifex-signature': signature,
                    'x-sedifex-event': eventType,
                    'x-sedifex-event-id': `evt_${context.eventId}`,
                },
                body: payload,
            });
            return {
                endpointId: endpointDoc.id,
                ok: response.ok,
                statusCode: response.status,
                error: null,
            };
        }
        catch (error) {
            return {
                endpointId: endpointDoc.id,
                ok: false,
                statusCode: null,
                error: error instanceof Error ? error.message : 'unknown error',
            };
        }
    }));
    await Promise.all(results.map(result => firestore_1.defaultDb.collection('webhookDeliveries').add({
        storeId,
        endpointId: result.endpointId,
        eventType,
        productId,
        eventId: `evt_${context.eventId}`,
        ok: result.ok,
        statusCode: result.statusCode,
        error: result.error,
        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    })));
});
exports.emitBookingWebhooks = functions.firestore
    .document('stores/{storeId}/integrationBookings/{bookingId}')
    .onWrite(async (change, context) => {
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    if (!beforeExists && !afterExists)
        return;
    const storeId = typeof context.params.storeId === 'string' ? context.params.storeId.trim() : '';
    if (!storeId)
        return;
    const bookingId = typeof context.params.bookingId === 'string' ? context.params.bookingId.trim() : '';
    if (!bookingId)
        return;
    const beforeData = (beforeExists ? change.before.data() : null);
    const afterData = (afterExists ? change.after.data() : null);
    const beforeStatus = toTrimmedStringOrNull(beforeData?.status)?.toLowerCase() ?? null;
    const afterStatus = toTrimmedStringOrNull(afterData?.status)?.toLowerCase() ?? null;
    let eventType = 'booking.updated';
    if (!beforeExists && afterExists) {
        eventType = 'booking.created';
    }
    else if (beforeExists && !afterExists) {
        eventType = 'booking.cancelled';
    }
    else if (beforeStatus !== afterStatus) {
        if (afterStatus === 'cancelled' || afterStatus === 'canceled') {
            eventType = 'booking.cancelled';
        }
        else if (afterStatus === 'approved') {
            eventType = 'booking.approved';
        }
        else if (afterStatus === 'confirmed') {
            eventType = 'booking.confirmed';
        }
    }
    const payloadObject = {
        id: `evt_${context.eventId}`,
        type: eventType,
        occurredAt: new Date().toISOString(),
        storeId,
        data: {
            bookingId,
            before: beforeData,
            after: afterData,
        },
    };
    const payload = JSON.stringify(payloadObject);
    const endpointSnapshot = await firestore_1.defaultDb
        .collection('webhookEndpoints')
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .get();
    if (endpointSnapshot.empty)
        return;
    const results = await Promise.all(endpointSnapshot.docs.map(async (endpointDoc) => {
        const endpoint = endpointDoc.data();
        if (!shouldDeliverWebhookEvent(endpoint.events, eventType)) {
            return { endpointId: endpointDoc.id, ok: true, statusCode: 204, error: 'event filtered' };
        }
        const url = typeof endpoint.url === 'string' ? endpoint.url.trim() : '';
        const secret = typeof endpoint.secret === 'string' ? endpoint.secret : '';
        if (!url || !secret) {
            return { endpointId: endpointDoc.id, ok: false, statusCode: null, error: 'missing config' };
        }
        const signature = computeWebhookSignature(secret, payload);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-sedifex-signature': signature,
                    'x-sedifex-event': eventType,
                    'x-sedifex-event-id': `evt_${context.eventId}`,
                },
                body: payload,
            });
            return {
                endpointId: endpointDoc.id,
                ok: response.ok,
                statusCode: response.status,
                error: null,
            };
        }
        catch (error) {
            return {
                endpointId: endpointDoc.id,
                ok: false,
                statusCode: null,
                error: error instanceof Error ? error.message : 'unknown error',
            };
        }
    }));
    await Promise.all(results.map(result => firestore_1.defaultDb.collection('webhookDeliveries').add({
        storeId,
        endpointId: result.endpointId,
        eventType,
        bookingId,
        eventId: `evt_${context.eventId}`,
        ok: result.ok,
        statusCode: result.statusCode,
        error: result.error,
        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    })));
});
/** ============================================================================
 *  HUBTEL BULK MESSAGING
 * ==========================================================================*/
const HUBTEL_CLIENT_ID = (0, params_1.defineString)('HUBTEL_CLIENT_ID');
const HUBTEL_CLIENT_SECRET = (0, params_1.defineString)('HUBTEL_CLIENT_SECRET');
const HUBTEL_SENDER_ID = (0, params_1.defineString)('HUBTEL_SENDER_ID');
let hubtelConfigLogged = false;
function getHubtelConfig() {
    const clientId = HUBTEL_CLIENT_ID.value();
    const clientSecret = HUBTEL_CLIENT_SECRET.value();
    const senderId = HUBTEL_SENDER_ID.value();
    if (!hubtelConfigLogged) {
        console.log('[hubtel] startup config', {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            hasSenderId: !!senderId,
        });
        hubtelConfigLogged = true;
    }
    return { clientId, clientSecret, senderId };
}
function normalizeHubtelApiCredential(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
function ensureHubtelConfig() {
    const config = getHubtelConfig();
    const normalizedFallbackSenderId = normalizeHubtelSenderId(config.senderId);
    if (!normalizedFallbackSenderId) {
        throw new functions.https.HttpsError('failed-precondition', 'Hubtel sender ID is invalid or not configured.');
    }
    return {
        ...config,
        senderId: normalizedFallbackSenderId,
    };
}
function normalizeHubtelSenderId(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    // Hubtel sender IDs are typically alphanumeric and between 3-11 chars.
    if (!/^[a-zA-Z0-9]{3,11}$/.test(trimmed))
        return null;
    return trimmed;
}
function resolveHubtelSenderId(storeData, fallbackSenderId) {
    const senderCandidates = [
        storeData.hubtelApprovedSenderId,
        storeData.hubtelSenderId,
        storeData.smsSenderId,
        storeData.senderId,
    ];
    for (const candidate of senderCandidates) {
        const normalized = normalizeHubtelSenderId(candidate);
        if (normalized)
            return normalized;
    }
    return normalizeHubtelSenderId(fallbackSenderId) ?? fallbackSenderId;
}
function resolveHubtelCredentials(storeData, fallbackConfig) {
    const clientIdCandidates = [storeData.hubtelClientId, storeData.smsClientId, storeData.clientId];
    const clientSecretCandidates = [
        storeData.hubtelClientSecret,
        storeData.smsClientSecret,
        storeData.clientSecret,
    ];
    const storeClientId = clientIdCandidates.map(normalizeHubtelApiCredential).find(Boolean);
    const storeClientSecret = clientSecretCandidates.map(normalizeHubtelApiCredential).find(Boolean);
    const fallbackClientId = normalizeHubtelApiCredential(fallbackConfig.clientId);
    const fallbackClientSecret = normalizeHubtelApiCredential(fallbackConfig.clientSecret);
    const clientId = storeClientId ?? fallbackClientId;
    const clientSecret = storeClientSecret ?? fallbackClientSecret;
    if (!clientId || !clientSecret) {
        console.error('[hubtel] Missing client id or client secret for store', {
            hasStoreClientId: !!storeClientId,
            hasStoreClientSecret: !!storeClientSecret,
            hasFallbackClientId: !!fallbackClientId,
            hasFallbackClientSecret: !!fallbackClientSecret,
        });
        throw new functions.https.HttpsError('failed-precondition', 'Hubtel is not configured for this store. Please add Hubtel credentials in store settings.');
    }
    return { clientId, clientSecret };
}
function formatSmsAddress(phone) {
    const trimmed = phone.trim();
    if (!trimmed)
        return trimmed;
    const normalized = (0, phone_1.normalizePhoneE164)(trimmed);
    return normalized ?? '';
}
async function sendHubtelMessage(options) {
    const { clientId, clientSecret, to, from, body } = options;
    const url = new URL('https://smsc.hubtel.com/v1/messages/send');
    url.search = new URLSearchParams({
        clientid: clientId,
        clientsecret: clientSecret,
        from,
        to,
        content: body,
    }).toString();
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
        const errorText = await response.text();
        const details = errorText || response.statusText || 'Unknown error';
        throw new Error(`Hubtel error ${response.status}: ${details}`);
    }
    return response.json();
}
exports.sendBulkMessage = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const { storeId, channel, message, recipients } = normalizeBulkMessagePayload(data);
    await verifyOwnerForStore(context.auth.uid, storeId);
    const rateSnap = await firestore_1.defaultDb.collection('config').doc('hubtelRates').get();
    const legacyRateSnap = rateSnap.exists
        ? null
        : await firestore_1.defaultDb.collection('config').doc('twilioRates').get();
    const rateTable = normalizeSmsRateTable(rateSnap.data() ?? legacyRateSnap?.data());
    const getSmsRate = (group) => {
        const rate = rateTable.sms[group]?.perSegment;
        if (typeof rate !== 'number' || !Number.isFinite(rate)) {
            throw new functions.https.HttpsError('failed-precondition', `SMS rate missing for group ${group}.`);
        }
        return rate;
    };
    const segments = Math.ceil(message.length / SMS_SEGMENT_SIZE);
    const getRecipientCost = (recipient) => {
        const group = resolveGroupFromPhone(recipient.phone, rateTable.dialCodeToGroup, rateTable.defaultGroup);
        return segments * getSmsRate(group);
    };
    const creditCosts = recipients.map(recipient => getRecipientCost(recipient));
    const creditsRequired = creditCosts.reduce((total, cost) => total + cost, 0);
    const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
    const config = ensureHubtelConfig();
    const fallbackSenderId = config.senderId;
    let senderIdForStore = fallbackSenderId;
    let hubtelClientIdForStore = normalizeHubtelApiCredential(config.clientId) ?? '';
    let hubtelClientSecretForStore = normalizeHubtelApiCredential(config.clientSecret) ?? '';
    // debit credits first
    await firestore_1.defaultDb.runTransaction(async (transaction) => {
        const storeSnap = await transaction.get(storeRef);
        if (!storeSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Store not found for this bulk messaging request.');
        }
        const storeData = storeSnap.data() ?? {};
        senderIdForStore = resolveHubtelSenderId(storeData, fallbackSenderId);
        const storeHubtelConfig = resolveHubtelCredentials(storeData, {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
        });
        hubtelClientIdForStore = storeHubtelConfig.clientId;
        hubtelClientSecretForStore = storeHubtelConfig.clientSecret;
        const rawCredits = storeData.bulkMessagingCredits;
        const currentCredits = typeof rawCredits === 'number' && Number.isFinite(rawCredits) ? rawCredits : 0;
        if (currentCredits < creditsRequired) {
            throw new functions.https.HttpsError('failed-precondition', 'You do not have enough bulk messaging credits. Please buy more to continue.');
        }
        transaction.update(storeRef, {
            bulkMessagingCredits: currentCredits - creditsRequired,
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    const from = senderIdForStore;
    const attempted = recipients.length;
    const results = await Promise.allSettled(recipients.map(async (recipient) => {
        const to = formatSmsAddress(recipient.phone ?? '');
        if (!to)
            throw new Error('Missing recipient phone');
        await sendHubtelMessage({
            clientId: hubtelClientIdForStore,
            clientSecret: hubtelClientSecretForStore,
            to,
            from,
            body: message,
        });
        return { phone: recipient.phone ?? '' };
    }));
    const failures = results
        .map((result, index) => {
        if (result.status === 'fulfilled')
            return null;
        const phone = recipients[index]?.phone ?? '';
        const errorMessage = result.reason instanceof Error
            ? result.reason.message
            : typeof result.reason === 'string'
                ? result.reason
                : 'Unknown error';
        return { phone, error: errorMessage, index };
    })
        .filter(Boolean);
    const sent = attempted - failures.length;
    // refund failed recipients
    const refundCredits = failures.reduce((total, failure) => total + (creditCosts[failure.index] ?? 0), 0);
    if (refundCredits > 0) {
        await storeRef.update({
            bulkMessagingCredits: firestore_1.admin.firestore.FieldValue.increment(refundCredits),
            updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    const deliveryStatus = sent === attempted ? 'all_sent' : sent === 0 ? 'all_failed' : 'partial_failure';
    try {
        await storeRef.collection('bulkMessageRuns').add({
            storeId,
            ownerUid: context.auth?.uid ?? null,
            channel,
            message,
            attempted,
            sent,
            failed: failures.length,
            deliveryStatus,
            creditsDebited: creditsRequired,
            creditsRefunded: refundCredits,
            recipients: recipients.map(recipient => ({
                id: recipient.id ?? null,
                name: recipient.name ?? null,
                phone: recipient.phone ?? null,
            })),
            failures: failures.map(({ phone, error }) => ({ phone, error })),
            createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (logError) {
        console.error('[bulk-messaging] Failed to write bulk message run log', logError);
    }
    return {
        ok: true,
        attempted,
        sent,
        failures: failures.map(({ phone, error }) => ({ phone, error })),
    };
});
exports.sendBulkEmail = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const { storeId, fromName, subject, html, recipients } = normalizeBulkEmailPayload(data);
    await verifyOwnerForStore(context.auth.uid, storeId);
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    if (!storeSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Store not found.');
    }
    const storeData = (storeSnap.data() ?? {});
    const integration = storeData.bulkEmailIntegration && typeof storeData.bulkEmailIntegration === 'object'
        ? storeData.bulkEmailIntegration
        : {};
    const webAppUrl = typeof integration.webAppUrl === 'string' ? integration.webAppUrl.trim() : '';
    const sharedToken = typeof integration.sharedToken === 'string' ? integration.sharedToken.trim() : '';
    if (!webAppUrl || !sharedToken) {
        throw new functions.https.HttpsError('failed-precondition', 'Email integration is incomplete. Open Account → Integrations → Email delivery.');
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(webAppUrl);
    }
    catch {
        throw new functions.https.HttpsError('failed-precondition', 'Configured Web App URL is invalid.');
    }
    if (parsedUrl.protocol !== 'https:') {
        throw new functions.https.HttpsError('failed-precondition', 'Configured Web App URL must use HTTPS.');
    }
    const payload = {
        token: sharedToken,
        campaignId: `cmp_${Date.now()}`,
        fromName,
        subject,
        html,
        recipients,
    };
    const response = await fetch(parsedUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const bodyText = await response.text();
    let body = {};
    try {
        body = bodyText ? JSON.parse(bodyText) : {};
    }
    catch {
        body = { ok: false, error: bodyText || 'invalid-json-response' };
    }
    if (!response.ok || body.ok === false) {
        const scriptError = typeof body.error === 'string' ? body.error : `send-failed (${response.status})`;
        throw new functions.https.HttpsError('internal', `Bulk email send failed: ${scriptError}`);
    }
    return body;
});
/** ============================================================================
 *  PAYSTACK HELPERS
 * ==========================================================================*/
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = (0, params_1.defineString)('PAYSTACK_SECRET_KEY');
const PAYSTACK_PUBLIC_KEY = (0, params_1.defineString)('PAYSTACK_PUBLIC_KEY');
const SEDIFEX_API_BASE_URL = (0, params_1.defineString)('SEDIFEX_API_BASE_URL');
// Legacy: was a single plan code for all checkouts. Kept for backwards compatibility.
const PAYSTACK_STANDARD_PLAN_CODE = (0, params_1.defineString)('PAYSTACK_STANDARD_PLAN_CODE');
// New: map frontend plan keys -> Paystack plan codes (optional).
const PAYSTACK_STARTER_PLAN_CODE = (0, params_1.defineString)('PAYSTACK_STARTER_PLAN_CODE');
const PAYSTACK_GROWTH_PLAN_CODE = (0, params_1.defineString)('PAYSTACK_GROWTH_PLAN_CODE');
const PAYSTACK_SCALE_PLAN_CODE = (0, params_1.defineString)('PAYSTACK_SCALE_PLAN_CODE');
const PAYSTACK_CURRENCY = (0, params_1.defineString)('PAYSTACK_CURRENCY');
// Fixed packages (GHS)
const BULK_CREDITS_PACKAGES = {
    '10000': { credits: 10000, amount: 50 },
    '50000': { credits: 50000, amount: 230 },
    '100000': { credits: 100000, amount: 430 },
};
let paystackConfigLogged = false;
function getPaystackConfig() {
    const secret = PAYSTACK_SECRET_KEY.value();
    const publicKey = PAYSTACK_PUBLIC_KEY.value();
    const currency = PAYSTACK_CURRENCY.value() || 'GHS';
    const starterPlan = PAYSTACK_STARTER_PLAN_CODE.value() || PAYSTACK_STANDARD_PLAN_CODE.value();
    const growthPlan = PAYSTACK_GROWTH_PLAN_CODE.value();
    const scalePlan = PAYSTACK_SCALE_PLAN_CODE.value();
    if (!paystackConfigLogged) {
        console.log('[paystack] startup config', {
            hasSecret: !!secret,
            hasPublicKey: !!publicKey,
            currency,
            hasStarterPlan: !!starterPlan,
            hasGrowthPlan: !!growthPlan,
            hasScalePlan: !!scalePlan,
        });
        paystackConfigLogged = true;
    }
    return {
        secret,
        publicKey,
        currency,
        plans: {
            starter: starterPlan,
            growth: growthPlan,
            scale: scalePlan,
        },
    };
}
function ensurePaystackConfig() {
    const config = getPaystackConfig();
    if (!config.secret) {
        console.error('[paystack] Missing PAYSTACK_SECRET_KEY env');
        throw new functions.https.HttpsError('failed-precondition', 'Paystack is not configured. Please contact support.');
    }
    return config;
}
function toMinorUnits(amount) {
    return Math.round(Math.abs(amount) * 100);
}
function resolvePlanKey(raw) {
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
}
function resolveBulkCreditsPackage(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const key = String(raw);
        return BULK_CREDITS_PACKAGES[key] ? key : null;
    }
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    return BULK_CREDITS_PACKAGES[trimmed] ? trimmed : null;
}
function resolvePlanMonths(_planKey) {
    return 1;
}
function resolvePlanDefaultAmount(planKey) {
    if (!planKey)
        return 20;
    const lower = planKey.toLowerCase();
    if (lower.includes('scale plus') || lower.includes('scale_plus'))
        return 2000;
    if (lower.includes('scale'))
        return 100;
    if (lower.includes('growth'))
        return 50;
    return 20;
}
function resolveContractGrossAmount(planKey, contractMonths) {
    if (!planKey)
        return toTwoDecimals(resolvePlanDefaultAmount(planKey) * contractMonths);
    const lower = planKey.toLowerCase();
    if (lower.includes('scale plus') || lower.includes('scale_plus')) {
        return 2000;
    }
    return toTwoDecimals(resolvePlanDefaultAmount(planKey) * contractMonths);
}
function toTwoDecimals(value) {
    return Math.round(value * 100) / 100;
}
function resolvePlanRank(planKey) {
    if (!planKey)
        return 0;
    const lower = planKey.toLowerCase();
    if (lower.includes('scale plus') || lower.includes('scale_plus'))
        return 4;
    if (lower.includes('scale'))
        return 3;
    if (lower.includes('growth'))
        return 2;
    if (lower.includes('starter'))
        return 1;
    return 0;
}
function resolveContractMonths(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value))
        return 1;
    const rounded = Math.floor(value);
    if (rounded <= 0)
        return 1;
    if (rounded > 24)
        return 24;
    return rounded;
}
function resolveContractQuote(input) {
    const grossAmount = resolveContractGrossAmount(input.targetPlanKey, input.contractMonths);
    const isUpgrade = resolvePlanRank(input.targetPlanKey) > resolvePlanRank(input.currentPlanKey);
    if (!isUpgrade) {
        return {
            grossAmount,
            creditAmount: 0,
            netAmount: grossAmount,
        };
    }
    const periodStart = input.currentPeriodStart?.toDate?.() ?? null;
    const periodEnd = input.currentPeriodEnd?.toDate?.() ?? null;
    const currentAmountPaid = typeof input.currentAmountPaid === 'number' && Number.isFinite(input.currentAmountPaid)
        ? input.currentAmountPaid
        : null;
    if (!periodStart || !periodEnd || !currentAmountPaid) {
        return {
            grossAmount,
            creditAmount: 0,
            netAmount: grossAmount,
        };
    }
    const totalMs = periodEnd.getTime() - periodStart.getTime();
    const remainingMs = periodEnd.getTime() - input.now.getTime();
    if (totalMs <= 0 || remainingMs <= 0) {
        return {
            grossAmount,
            creditAmount: 0,
            netAmount: grossAmount,
        };
    }
    const remainingRatio = Math.min(1, Math.max(0, remainingMs / totalMs));
    const creditAmount = toTwoDecimals(currentAmountPaid * remainingRatio);
    const netAmount = toTwoDecimals(Math.max(0, grossAmount - creditAmount));
    return {
        grossAmount,
        creditAmount,
        netAmount,
    };
}
function addMonths(base, months) {
    const d = new Date(base.getTime());
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < day)
        d.setDate(0);
    return d;
}
function resolvePaystackPlanCode(planKey, config) {
    if (!planKey)
        return undefined;
    const key = String(planKey).toLowerCase();
    return config.plans[key];
}
/** ============================================================================
 *  CALLABLE: createPaystackCheckout (subscription)
 * ==========================================================================*/
exports.createPaystackCheckout = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const paystackConfig = ensurePaystackConfig();
    const uid = context.auth.uid;
    const token = context.auth.token;
    const tokenEmail = typeof token.email === 'string' ? token.email : null;
    const payload = (data ?? {});
    const requestedStoreId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const memberData = (memberSnap.data() ?? {});
    let resolvedStoreId = '';
    if (requestedStoreId) {
        resolvedStoreId = requestedStoreId;
    }
    else if (typeof memberData.storeId === 'string' && memberData.storeId.trim() !== '') {
        resolvedStoreId = memberData.storeId;
    }
    else {
        resolvedStoreId = uid;
    }
    const storeId = resolvedStoreId;
    const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
    const storeSnap = await storeRef.get();
    const storeData = (storeSnap.data() ?? {});
    const billing = (storeData.billing || {});
    const emailInput = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const email = emailInput || tokenEmail || storeData.ownerEmail || null;
    if (!email) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing owner email. Please sign in again.');
    }
    const planKey = resolvePlanKey(payload.plan) ||
        resolvePlanKey(payload.planId) ||
        resolvePlanKey(payload.planKey) ||
        'starter';
    const contractMonths = resolveContractMonths(payload.contractMonths);
    const requestedAmountInput = Number(payload.amount);
    const requestedAmount = Number.isFinite(requestedAmountInput) && requestedAmountInput > 0
        ? requestedAmountInput
        : null;
    const currentPlanKey = resolvePlanKey(billing.planKey) || resolvePlanKey(storeData.billingPlan);
    const currentPeriodStart = billing.currentPeriodStart instanceof firestore_1.admin.firestore.Timestamp
        ? billing.currentPeriodStart
        : null;
    const currentPeriodEnd = billing.currentPeriodEnd instanceof firestore_1.admin.firestore.Timestamp
        ? billing.currentPeriodEnd
        : null;
    const currentAmountPaid = typeof billing.amountPaid === 'number' && Number.isFinite(billing.amountPaid)
        ? billing.amountPaid
        : null;
    const quote = resolveContractQuote({
        targetPlanKey: planKey,
        contractMonths,
        currentPlanKey,
        currentPeriodStart,
        currentPeriodEnd,
        currentAmountPaid,
        now: new Date(),
    });
    const amountGhs = requestedAmount ?? quote.netAmount;
    const amountMinorUnits = toMinorUnits(amountGhs);
    const reference = `${storeId}_${Date.now()}`;
    const callbackUrl = typeof payload.redirectUrl === 'string'
        ? payload.redirectUrl
        : typeof payload.returnUrl === 'string'
            ? payload.returnUrl
            : undefined;
    const metadataIn = payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};
    // ✅ UPDATED: only attach callback_url if it's provided
    const body = {
        email,
        amount: amountMinorUnits,
        currency: paystackConfig.currency,
        reference,
        metadata: {
            storeId,
            userId: uid,
            planKey,
            contractMonths,
            grossAmount: quote.grossAmount,
            creditAmount: quote.creditAmount,
            netAmount: amountGhs,
            currentPlanKey: currentPlanKey || null,
            ...metadataIn,
        },
    };
    if (callbackUrl) {
        body.callback_url = callbackUrl;
    }
    let responseJson;
    try {
        const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${paystackConfig.secret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        responseJson = await response.json();
        if (!response.ok || !responseJson.status) {
            console.error('[paystack] initialize failed', responseJson);
            throw new functions.https.HttpsError('unknown', 'Unable to start checkout with Paystack.');
        }
    }
    catch (error) {
        console.error('[paystack] initialize error', error);
        throw new functions.https.HttpsError('unknown', 'Unable to start checkout with Paystack.');
    }
    const authUrl = responseJson.data && typeof responseJson.data.authorization_url === 'string'
        ? responseJson.data.authorization_url
        : null;
    if (!authUrl) {
        throw new functions.https.HttpsError('unknown', 'Paystack did not return a valid authorization URL.');
    }
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await storeRef.set({
        billing: {
            ...(billing || {}),
            provider: 'paystack',
            planKey,
            status: typeof billing.status === 'string' && billing.status === 'active'
                ? billing.status
                : 'pending',
            currency: paystackConfig.currency,
            lastCheckoutUrl: authUrl,
            lastCheckoutAt: timestamp,
            lastChargeReference: reference,
            pendingContractMonths: contractMonths,
            pendingUpgradeCreditAmount: quote.creditAmount,
            pendingGrossAmount: quote.grossAmount,
            pendingNetAmount: amountGhs,
        },
        paymentProvider: 'paystack',
        paymentStatus: 'pending',
        contractStatus: 'pending',
    }, { merge: true });
    await firestore_1.defaultDb.collection('subscriptions').doc(storeId).set({
        provider: 'paystack',
        status: 'pending',
        plan: planKey,
        reference,
        amount: amountGhs,
        grossAmount: quote.grossAmount,
        creditAmount: quote.creditAmount,
        contractMonths,
        currency: paystackConfig.currency,
        email,
        lastCheckoutUrl: authUrl,
        lastCheckoutAt: timestamp,
        createdAt: timestamp,
        createdBy: uid,
    }, { merge: true });
    return {
        ok: true,
        authorizationUrl: authUrl,
        reference,
        publicKey: paystackConfig.publicKey || null,
    };
});
// Alias so frontend name still works
exports.createCheckout = exports.createPaystackCheckout;
/** ============================================================================
 *  CALLABLE: cancelPaystackSubscription
 * ==========================================================================*/
exports.cancelPaystackSubscription = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const paystackConfig = ensurePaystackConfig();
    const uid = context.auth.uid;
    const payload = (data ?? {});
    const requestedStoreId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
    const memberRef = firestore_1.defaultDb.collection('teamMembers').doc(uid);
    const memberSnap = await memberRef.get();
    const memberData = (memberSnap.data() ?? {});
    let resolvedStoreId = '';
    if (requestedStoreId) {
        resolvedStoreId = requestedStoreId;
    }
    else if (typeof memberData.storeId === 'string' && memberData.storeId.trim() !== '') {
        resolvedStoreId = memberData.storeId;
    }
    else {
        resolvedStoreId = uid;
    }
    const storeId = resolvedStoreId;
    await verifyOwnerForStore(uid, storeId);
    const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Store not found.');
    }
    const storeData = (storeSnap.data() ?? {});
    const billing = (storeData.billing ?? {});
    const subscriptionCode = typeof billing.paystackSubscriptionCode === 'string'
        ? billing.paystackSubscriptionCode
        : null;
    if (!subscriptionCode) {
        throw new functions.https.HttpsError('failed-precondition', 'No Paystack subscription was found for this workspace.');
    }
    let emailToken = typeof billing.paystackEmailToken === 'string' ? billing.paystackEmailToken : null;
    if (!emailToken) {
        try {
            const fetchResponse = await fetch(`${PAYSTACK_BASE_URL}/subscription/${subscriptionCode}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${paystackConfig.secret}`,
                    'Content-Type': 'application/json',
                },
            });
            const fetchJson = await fetchResponse.json();
            if (fetchResponse.ok && fetchJson?.status) {
                const token = fetchJson?.data && typeof fetchJson.data.email_token === 'string'
                    ? fetchJson.data.email_token
                    : null;
                if (token) {
                    emailToken = token;
                }
            }
            else {
                console.warn('[paystack] unable to fetch subscription token', fetchJson);
            }
        }
        catch (error) {
            console.error('[paystack] failed to fetch subscription token', error);
        }
    }
    if (!emailToken) {
        throw new functions.https.HttpsError('failed-precondition', 'Unable to locate the Paystack subscription token for cancellation.');
    }
    let responseJson;
    try {
        const response = await fetch(`${PAYSTACK_BASE_URL}/subscription/disable`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${paystackConfig.secret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
        });
        responseJson = await response.json();
        if (!response.ok || !responseJson.status) {
            console.error('[paystack] disable failed', responseJson);
            throw new functions.https.HttpsError('unknown', 'Unable to cancel the Paystack subscription.');
        }
    }
    catch (error) {
        console.error('[paystack] disable error', error);
        throw new functions.https.HttpsError('unknown', 'Unable to cancel the Paystack subscription.');
    }
    const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await storeRef.set({
        billing: {
            ...(billing || {}),
            status: 'inactive',
            paystackSubscriptionCode: subscriptionCode,
            paystackEmailToken: emailToken,
            canceledAt: timestamp,
            canceledBy: uid,
            lastEventAt: timestamp,
        },
        paymentStatus: 'inactive',
        contractStatus: 'canceled',
        updatedAt: timestamp,
    }, { merge: true });
    await firestore_1.defaultDb.collection('subscriptions').doc(storeId).set({
        provider: 'paystack',
        status: 'canceled',
        canceledAt: timestamp,
        canceledBy: uid,
        updatedAt: timestamp,
    }, { merge: true });
    return {
        ok: true,
        status: 'canceled',
    };
});
/** ============================================================================
 *  CALLABLE: createBulkCreditsCheckout (bulk messaging credits)
 * ==========================================================================*/
exports.createBulkCreditsCheckout = functions.https.onCall(async (data, context) => {
    assertOwnerAccess(context);
    const paystackConfig = ensurePaystackConfig();
    const payload = (data ?? {});
    const storeId = typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
    if (!storeId) {
        throw new functions.https.HttpsError('invalid-argument', 'storeId is required.');
    }
    await verifyOwnerForStore(context.auth.uid, storeId);
    const packageKey = resolveBulkCreditsPackage(payload.package);
    if (!packageKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid bulk credits package.');
    }
    const pkg = BULK_CREDITS_PACKAGES[packageKey];
    const storeSnap = await firestore_1.defaultDb.collection('stores').doc(storeId).get();
    const storeData = (storeSnap.data() ?? {});
    const token = context.auth.token;
    const tokenEmail = typeof token.email === 'string' ? token.email : null;
    const email = tokenEmail ||
        (typeof storeData.ownerEmail === 'string' ? storeData.ownerEmail : null);
    if (!email) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing owner email. Please sign in again.');
    }
    const reference = `${storeId}_bulk_credits_${Date.now()}`;
    const callbackUrl = typeof payload.redirectUrl === 'string'
        ? String(payload.redirectUrl)
        : typeof payload.returnUrl === 'string'
            ? String(payload.returnUrl)
            : undefined;
    const extraMetadata = payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};
    const body = {
        email,
        amount: toMinorUnits(pkg.amount),
        currency: paystackConfig.currency,
        reference,
        metadata: {
            storeId,
            userId: context.auth.uid,
            kind: 'bulk_credits',
            package: packageKey,
            credits: pkg.credits,
            ...extraMetadata,
        },
    };
    // Only attach callback_url if provided
    if (callbackUrl) {
        body.callback_url = callbackUrl;
    }
    // Optional: store a pending record for debugging + later idempotency
    const ts = firestore_1.admin.firestore.FieldValue.serverTimestamp();
    await firestore_1.defaultDb.collection('bulkCreditsPurchases').doc(reference).set({
        storeId,
        userId: context.auth.uid,
        email,
        package: packageKey,
        credits: pkg.credits,
        amount: pkg.amount,
        currency: paystackConfig.currency,
        status: 'pending',
        createdAt: ts,
        updatedAt: ts,
    }, { merge: true });
    let responseJson;
    try {
        const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${paystackConfig.secret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        responseJson = await response.json();
        if (!response.ok || !responseJson.status) {
            console.error('[paystack] bulk credits initialize failed', responseJson);
            throw new functions.https.HttpsError('unknown', 'Unable to start checkout with Paystack.');
        }
    }
    catch (error) {
        console.error('[paystack] bulk credits initialize error', error);
        throw new functions.https.HttpsError('unknown', 'Unable to start checkout with Paystack.');
    }
    const authUrl = responseJson.data && typeof responseJson.data.authorization_url === 'string'
        ? responseJson.data.authorization_url
        : null;
    if (!authUrl) {
        throw new functions.https.HttpsError('unknown', 'Paystack did not return a valid authorization URL.');
    }
    // Save checkout url for debugging
    await firestore_1.defaultDb.collection('bulkCreditsPurchases').doc(reference).set({
        checkoutUrl: authUrl,
        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        ok: true,
        authorizationUrl: authUrl,
        reference,
        package: packageKey,
        credits: pkg.credits,
    };
});
/** ============================================================================
 *  HTTP: handlePaystackWebhook
 * ==========================================================================*/
exports.handlePaystackWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const paystackConfig = getPaystackConfig();
    const paystackSecret = paystackConfig.secret;
    if (!paystackSecret) {
        console.error('[paystack] Missing PAYSTACK_SECRET_KEY for webhook');
        res.status(500).send('PAYSTACK_SECRET_KEY_NOT_CONFIGURED');
        return;
    }
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
        res.status(401).send('Missing signature');
        return;
    }
    const rawBody = req.rawBody;
    const hash = crypto.createHmac('sha512', paystackSecret).update(rawBody).digest('hex');
    if (hash !== signature) {
        console.error('[paystack] Signature mismatch');
        res.status(401).send('Invalid signature');
        return;
    }
    const event = req.body;
    const eventName = event && event.event;
    try {
        if (eventName === 'charge.success') {
            const data = event.data || {};
            const metadata = data.metadata || {};
            const reference = typeof data.reference === 'string' ? data.reference : null;
            const storeId = typeof metadata.storeId === 'string' ? metadata.storeId.trim() : '';
            const kind = typeof metadata.kind === 'string' ? metadata.kind.trim() : null;
            // ✅ BULK CREDITS FLOW
            if (kind === 'bulk_credits') {
                if (!storeId) {
                    console.warn('[paystack] bulk_credits missing storeId in metadata');
                    res.status(200).send('ok');
                    return;
                }
                const creditsRaw = metadata.credits;
                const credits = typeof creditsRaw === 'number' && Number.isFinite(creditsRaw) ? creditsRaw : Number(creditsRaw);
                if (!Number.isFinite(credits) || credits <= 0) {
                    console.warn('[paystack] bulk_credits missing/invalid credits in metadata', metadata);
                    res.status(200).send('ok');
                    return;
                }
                // idempotency (avoid double credit)
                const eventId = reference || `${storeId}_bulk_${Date.now()}`;
                const eventRef = firestore_1.defaultDb.collection('paystackEvents').doc(eventId);
                const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
                await firestore_1.defaultDb.runTransaction(async (tx) => {
                    const existing = await tx.get(eventRef);
                    if (existing.exists)
                        return;
                    tx.set(eventRef, {
                        kind: 'bulk_credits',
                        storeId,
                        credits,
                        reference: reference || null,
                        createdAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                    });
                    tx.set(storeRef, {
                        bulkMessagingCredits: firestore_1.admin.firestore.FieldValue.increment(credits),
                        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                });
                if (reference) {
                    await firestore_1.defaultDb.collection('bulkCreditsPurchases').doc(reference).set({
                        status: 'success',
                        paystackStatus: typeof data.status === 'string' ? data.status : 'success',
                        paidAt: typeof data.paid_at === 'string'
                            ? firestore_1.admin.firestore.Timestamp.fromDate(new Date(data.paid_at))
                            : firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                        amountPaid: typeof data.amount === 'number' ? data.amount / 100 : null,
                        updatedAt: firestore_1.admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                res.status(200).send('ok');
                return;
            }
            // ✅ SUBSCRIPTION FLOW (existing)
            if (!storeId) {
                console.warn('[paystack] charge.success missing storeId in metadata');
                res.status(200).send('ok');
                return;
            }
            const storeRef = firestore_1.defaultDb.collection('stores').doc(storeId);
            const timestamp = firestore_1.admin.firestore.FieldValue.serverTimestamp();
            const customer = data.customer || {};
            const subscription = data.subscription || {};
            const plan = data.plan || {};
            const contractMonths = resolveContractMonths(metadata.contractMonths);
            const paidAtDate = new Date(typeof data.paid_at === 'string' ? data.paid_at : Date.now());
            const contractEndDate = addMonths(paidAtDate, contractMonths);
            const amountPaid = typeof data.amount === 'number' ? toTwoDecimals(data.amount / 100) : null;
            await storeRef.set({
                billing: {
                    provider: 'paystack',
                    planKey: resolvePlanKey(metadata.planKey) ||
                        resolvePlanKey(metadata.plan) ||
                        resolvePlanKey(metadata.planId) ||
                        'starter',
                    status: 'active',
                    currency: paystackConfig.currency,
                    paystackCustomerCode: customer.customer_code || null,
                    paystackSubscriptionCode: null,
                    paystackEmailToken: null,
                    paystackPlanCode: (plan && typeof plan.plan_code === 'string' && plan.plan_code) ||
                        resolvePaystackPlanCode(resolvePlanKey(metadata.planKey) ||
                            resolvePlanKey(metadata.plan) ||
                            resolvePlanKey(metadata.planId), paystackConfig) ||
                        null,
                    currentPeriodStart: firestore_1.admin.firestore.Timestamp.fromDate(paidAtDate),
                    currentPeriodEnd: firestore_1.admin.firestore.Timestamp.fromDate(contractEndDate),
                    contractMonths,
                    lastPaymentAt: firestore_1.admin.firestore.Timestamp.fromDate(paidAtDate),
                    lastEventAt: timestamp,
                    lastChargeReference: data.reference || null,
                    amountPaid,
                    grossAmount: typeof metadata.grossAmount === 'number' && Number.isFinite(metadata.grossAmount)
                        ? metadata.grossAmount
                        : amountPaid,
                    creditAmount: typeof metadata.creditAmount === 'number' && Number.isFinite(metadata.creditAmount)
                        ? metadata.creditAmount
                        : 0,
                },
                paymentStatus: 'active',
                contractStatus: 'active',
                contractEnd: firestore_1.admin.firestore.Timestamp.fromDate(contractEndDate),
            }, { merge: true });
            await firestore_1.defaultDb.collection('subscriptions').doc(storeId).set({
                provider: 'paystack',
                status: 'active',
                plan: resolvePlanKey(metadata.planKey) ||
                    resolvePlanKey(metadata.plan) ||
                    resolvePlanKey(metadata.planId) ||
                    'starter',
                reference: data.reference || null,
                amount: amountPaid,
                grossAmount: typeof metadata.grossAmount === 'number' && Number.isFinite(metadata.grossAmount)
                    ? metadata.grossAmount
                    : amountPaid,
                creditAmount: typeof metadata.creditAmount === 'number' && Number.isFinite(metadata.creditAmount)
                    ? metadata.creditAmount
                    : 0,
                currency: paystackConfig.currency,
                paystackSubscriptionCode: null,
                paystackEmailToken: null,
                contractMonths,
                currentPeriodStart: firestore_1.admin.firestore.Timestamp.fromDate(paidAtDate),
                currentPeriodEnd: firestore_1.admin.firestore.Timestamp.fromDate(contractEndDate),
                lastPaymentAt: firestore_1.admin.firestore.Timestamp.fromDate(paidAtDate),
                updatedAt: timestamp,
                lastEvent: eventName,
            }, { merge: true });
        }
        res.status(200).send('ok');
    }
    catch (error) {
        console.error('[paystack] webhook handling error', error);
        res.status(500).send('error');
    }
});
exports.__testing = {
    canonicalizeBookingKey,
    buildBookingValueLookup,
    pickBookingValueFromAliases,
    sanitizeBookingAttributes,
    normalizeBookingDateForSheet,
    normalizeBookingTimeForSheet,
};
