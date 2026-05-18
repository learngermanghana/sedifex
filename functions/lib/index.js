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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAdsMetricsSync = exports.googleAdsCampaign = exports.googleAdsOAuthCallback = exports.googleAdsOAuthStart = exports.sendBrandedNotificationPreview = exports.notifyDonationCaptured = exports.notifySupportRequestCreated = exports.notifyVolunteerApplicationCreated = exports.notifyStudentRegistrationCreated = exports.notifyIntegrationOrderStatus = exports.initializeStoreNotificationDefaults = exports.supportRequestIntake = exports.volunteerIntake = exports.v1IntegrationAvailability = exports.integrationOrderStatus = exports.integrationCheckoutPreview = exports.integrationCheckoutCreate = exports.fetchPaystackSettlementBanks = exports.fetchPaystackMerchantSubaccount = exports.createPaystackMerchantSubaccount = exports.handlePaystackWebhook = exports.paystackWebhook = exports.createCheckout = exports.checkSignupUnlock = void 0;
const params_1 = require("firebase-functions/params");
var paystack_1 = require("./paystack");
Object.defineProperty(exports, "checkSignupUnlock", { enumerable: true, get: function () { return paystack_1.checkSignupUnlock; } });
Object.defineProperty(exports, "createCheckout", { enumerable: true, get: function () { return paystack_1.createCheckout; } });
Object.defineProperty(exports, "paystackWebhook", { enumerable: true, get: function () { return paystack_1.paystackWebhook; } });
var marketplacePaystackWebhook_1 = require("./marketplacePaystackWebhook");
Object.defineProperty(exports, "handlePaystackWebhook", { enumerable: true, get: function () { return marketplacePaystackWebhook_1.handlePaystackWebhook; } });
var paystackSubaccounts_1 = require("./paystackSubaccounts");
Object.defineProperty(exports, "createPaystackMerchantSubaccount", { enumerable: true, get: function () { return paystackSubaccounts_1.createPaystackMerchantSubaccount; } });
Object.defineProperty(exports, "fetchPaystackMerchantSubaccount", { enumerable: true, get: function () { return paystackSubaccounts_1.fetchPaystackMerchantSubaccount; } });
Object.defineProperty(exports, "fetchPaystackSettlementBanks", { enumerable: true, get: function () { return paystackSubaccounts_1.fetchPaystackSettlementBanks; } });
var integrationCheckout_1 = require("./integrationCheckout");
Object.defineProperty(exports, "integrationCheckoutCreate", { enumerable: true, get: function () { return integrationCheckout_1.integrationCheckoutCreate; } });
Object.defineProperty(exports, "integrationCheckoutPreview", { enumerable: true, get: function () { return integrationCheckout_1.integrationCheckoutPreview; } });
Object.defineProperty(exports, "integrationOrderStatus", { enumerable: true, get: function () { return integrationCheckout_1.integrationOrderStatus; } });
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
