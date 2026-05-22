// functions/src/index.ts
import * as functions from 'firebase-functions/v1'
import * as crypto from 'crypto'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb as db } from './firestore'
import { normalizePhoneE164, normalizePhoneForWhatsApp } from './phone'
import { normalizePublicSlugValue } from './utils/publicSlug'
import type { ProductReadModel } from './types/product'
import { normalizeCatalogPublicationFields, resolvePublicationTimestampCandidate } from './catalogPublication'
export { checkSignupUnlock, createCheckout, paystackWebhook } from './paystack'
export { handlePaystackWebhook } from './marketplacePaystackWebhook'
export {
  createPaystackMerchantSubaccount,
  fetchPaystackMerchantSubaccount,
  fetchPaystackSettlementBanks,
} from './paystackSubaccounts'
export {
  integrationCheckoutCreate,
  integrationCheckoutPreview,
  integrationOrderStatus,
} from './integrationCheckout'
export { v1IntegrationAvailability } from './integrationAvailability'
export { v1IntegrationBookings } from './integrationBookings'
export { v1IntegrationStudentRegistrations } from './integrationStudentRegistrations'
export { publicQuickPayCatalog, publicQuickPayStores, syncQuickPayStoreIndex } from './quickPay'
export { volunteerIntake, supportRequestIntake } from './ngoIntake'
export {
  notifyNgoVolunteerApplicationReceived,
  notifyNgoSupportRequestReceived,
  notifyNgoDonationSubmitted,
  notifyNgoDonationConfirmed,
} from './ngoNotificationAlerts'
export {
  initializeStoreNotificationDefaults,
  notifyIntegrationOrderStatus,
  notifyStudentRegistrationCreated,
  sendBrandedNotificationPreview,
} from './notifications'
export {
  googleAdsOAuthStart,
  googleAdsOAuthCallback,
  googleAdsCampaign,
  googleAdsMetricsSync,
} from './googleAds'
export * from './googleShopping'
export * from './googleBusinessProfile'

const OPENAI_MODEL = defineString('OPENAI_MODEL', { default: 'gpt-4o-mini' })
const DEFAULT_STORE_ID = defineString('DEFAULT_STORE_ID', { default: '' })
const DEFAULT_PUBLIC_PAGE_BASE_URL = defineString('DEFAULT_PUBLIC_PAGE_BASE_URL', { default: '' })
const GOOGLE_ADS_CLIENT_ID = defineString('GOOGLE_ADS_CLIENT_ID', { default: '' })
const GOOGLE_ADS_CLIENT_SECRET = defineString('GOOGLE_ADS_CLIENT_SECRET', { default: '' })
const GOOGLE_ADS_REDIRECT_URI = defineString('GOOGLE_ADS_REDIRECT_URI', { default: '' })
const GOOGLE_ADS_DEVELOPER_TOKEN = defineString('GOOGLE_ADS_DEVELOPER_TOKEN', { default: '' })
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = defineString('GOOGLE_ADS_LOGIN_CUSTOMER_ID', { default: '' })
