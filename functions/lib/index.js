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
exports.googleAdsMetricsSync = exports.googleAdsCampaign = exports.googleAdsOAuthCallback = exports.googleAdsOAuthStart = exports.sendBrandedNotificationPreview = exports.notifyDonationCaptured = exports.notifySupportRequestCreated = exports.notifyVolunteerApplicationCreated = exports.notifyStudentRegistrationCreated = exports.notifyIntegrationOrderStatus = exports.initializeStoreNotificationDefaults = exports.supportRequestIntake = exports.volunteerIntake = exports.v1IntegrationAvailability = exports.integrationCheckoutCreate = exports.fetchPaystackSettlementBanks = exports.fetchPaystackMerchantSubaccount = exports.createPaystackMerchantSubaccount = exports.checkSignupUnlock = void 0;
// functions/src/index.ts
const functions = __importStar(require("firebase-functions/v1"));
const params_1 = require("firebase-functions/params");
var paystack_1 = require("./paystack");
Object.defineProperty(exports, "checkSignupUnlock", { enumerable: true, get: function () { return paystack_1.checkSignupUnlock; } });
var paystackSubaccounts_1 = require("./paystackSubaccounts");
Object.defineProperty(exports, "createPaystackMerchantSubaccount", { enumerable: true, get: function () { return paystackSubaccounts_1.createPaystackMerchantSubaccount; } });
Object.defineProperty(exports, "fetchPaystackMerchantSubaccount", { enumerable: true, get: function () { return paystackSubaccounts_1.fetchPaystackMerchantSubaccount; } });
Object.defineProperty(exports, "fetchPaystackSettlementBanks", { enumerable: true, get: function () { return paystackSubaccounts_1.fetchPaystackSettlementBanks; } });
var integrationCheckout_1 = require("./integrationCheckout");
Object.defineProperty(exports, "integrationCheckoutCreate", { enumerable: true, get: function () { return integrationCheckout_1.integrationCheckoutCreate; } });
var integrationAvailability_1 = require("./integrationAvailability");
Object.defineProperty(exports, "v1IntegrationAvailability", { enumerable: true, get: function () { return integrationAvailability_1.v1IntegrationAvailability; } });
var ngoIntake_1 = require("./ngoIntake");
Object.defineProperty(exports, "volunteerIntake", { enumerable: true, get: function () { return ngoIntake_1.volunteerIntake; } });
Object.defineProperty(exports, "supportRequestIntake", { enumerable: true, get: function () { return ngoIntake_1.supportRequestIntake; } });
var notifications_1 = require("./notifications");
Object.defineProperty(exports, "initializeStoreNotificationDefaults", { enumerable: true, get: function () { return notifications_1.initializeStoreNotificationDefaults; } });
Object.defineProperty(exports, "notifyIntegrationOrderStatus", { enumerable: true, get: function () { return notifications_1.notifyIntegrationOrderStatus; } });
Object.defineProperty(exports, "notifyStudentRegistrationCreated", { enumerable: true, get: function () { return notifications_1.notifyStudentRegistrationCreated; } });
Object.defineProperty(exports, "notifyVolunteerApplicationCreated", { enumerable: true, get: function () { return notifications_1.notifyVolunteerApplicationCreated; } });
Object.defineProperty(exports, "notifySupportRequestCreated", { enumerable: true, get: function () { return notifications_1.notifySupportRequestCreated; } });
Object.defineProperty(exports, "notifyDonationCaptured", { enumerable: true, get: function () { return notifications_1.notifyDonationCaptured; } });
Object.defineProperty(exports, "sendBrandedNotificationPreview", { enumerable: true, get: function () { return notifications_1.sendBrandedNotificationPreview; } });
var googleAds_1 = require("./googleAds");
Object.defineProperty(exports, "googleAdsOAuthStart", { enumerable: true, get: function () { return googleAds_1.googleAdsOAuthStart; } });
Object.defineProperty(exports, "googleAdsOAuthCallback", { enumerable: true, get: function () { return googleAds_1.googleAdsOAuthCallback; } });
Object.defineProperty(exports, "googleAdsCampaign", { enumerable: true, get: function () { return googleAds_1.googleAdsCampaign; } });
Object.defineProperty(exports, "googleAdsMetricsSync", { enumerable: true, get: function () { return googleAds_1.googleAdsMetricsSync; } });
__exportStar(require("./googleShopping"), exports);
__exportStar(require("./reporting"), exports);
const VALID_ROLES = new Set(['owner', 'staff']);
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
function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}
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
        functions.logger.warn('SEDIFEX_INTEGRATION_API_KEY is missing. Integration HTTP endpoints will reject requests until it is configured.');
        integrationApiKeyWarned = true;
    }
    return apiKey;
}
