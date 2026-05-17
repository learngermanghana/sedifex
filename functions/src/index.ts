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
export { integrationCheckoutCreate } from './integrationCheckout'
export { v1IntegrationAvailability } from './integrationAvailability'
export { volunteerIntake, supportRequestIntake } from './ngoIntake'
export {
  initializeStoreNotificationDefaults,
  notifyIntegrationOrderStatus,
  notifyStudentRegistrationCreated,
  notifyVolunteerApplicationCreated,
  notifySupportRequestCreated,
  notifyDonationCaptured,
  sendBrandedNotificationPreview,
} from './notifications'
export {
  googleAdsOAuthStart,
  googleAdsOAuthCallback,
  googleAdsCampaign,
  googleAdsMetricsSync,
} from './googleAds'
export * from './googleShopping'
export * from './reporting'

/**
 * SINGLE FIRESTORE INSTANCE
 */
// Firestore instance is provided by the shared firestore module to avoid
// repeated admin initialization during function discovery.

/** ============================================================================
 *  TYPES
 * ==========================================================================*/

type ContactPayload = {
  phone?: unknown
  firstSignupEmail?: unknown
}

type StoreProfilePayload = {
  phone?: unknown
  ownerName?: unknown
  businessName?: unknown
  country?: unknown
  town?: unknown
  city?: unknown
  addressLine1?: unknown
  address?: unknown
}

type InitializeStorePayload = {
  contact?: ContactPayload
  profile?: StoreProfilePayload
  storeId?: unknown
}

type BulkMessageChannel = 'sms'

type BulkMessageRecipient = {
  id?: string
  name?: string
  phone?: string
}

type BulkMessagePayload = {
  storeId?: unknown
  channel?: unknown
  message?: unknown
  recipients?: unknown
}

type BulkEmailRecipient = {
  id: string
  name: string
  email: string
}

type BulkEmailPayload = {
  storeId?: unknown
  fromName?: unknown
  subject?: unknown
  html?: unknown
  recipients?: unknown
}

type SmsRateTable = {
  defaultGroup: string
  dialCodeToGroup: Record<string, string>
  sms: Record<string, { perSegment: number }>
}

type ManageStaffPayload = {
  storeId?: unknown
  email?: unknown
  role?: unknown
  password?: unknown
  action?: unknown
}

type CreateStoreMasterInvitePayload = {
  storeId?: unknown
  role?: unknown
  expiresInHours?: unknown
  maxUses?: unknown
}

type AcceptStoreMasterInvitePayload = {
  tokenOrUrl?: unknown
  childStoreId?: unknown
  confirmOverwrite?: unknown
}

type BillingStatus = 'trial' | 'active' | 'past_due' | 'inactive'

type CreateCheckoutPayload = {
  email?: unknown
  storeId?: unknown
  amount?: unknown
  plan?: unknown
  planId?: unknown
  metadata?: unknown
  returnUrl?: unknown
  redirectUrl?: unknown
}

type BulkCreditsCheckoutPayload = {
  storeId?: unknown
  package?: unknown
  returnUrl?: unknown
  redirectUrl?: unknown
  metadata?: unknown
}

type ListStoreProductsPayload = {
  storeId?: unknown
  limit?: unknown
}

type CreateIntegrationApiKeyPayload = {
  name?: unknown
}

type RotateIntegrationApiKeyPayload = {
  keyId?: unknown
}

type RevokeIntegrationApiKeyPayload = {
  keyId?: unknown
}

type ListWebhookEndpointsPayload = {
  storeId?: unknown
}

type UpsertWebhookEndpointPayload = {
  endpointId?: unknown
  url?: unknown
  secret?: unknown
  events?: unknown
}

type RevokeWebhookEndpointPayload = {
  endpointId?: unknown
}

type DeleteWebhookEndpointPayload = {
  endpointId?: unknown
}

type StartTikTokConnectPayload = {
  storeId?: unknown
}

type GenerateAiAdvicePayload = {
  question?: unknown
  storeId?: unknown
  jsonContext?: unknown
}

type GenerateSocialPostPayload = {
  storeId?: unknown
  platform?: unknown
  productId?: unknown
  product?: unknown
}

const VALID_ROLES = new Set(['owner', 'staff'])
const GRACE_DAYS = 7
const MILLIS_PER_DAY = 1000 * 60 * 60 * 24
const BULK_MESSAGE_LIMIT = 1000
const BULK_MESSAGE_BATCH_LIMIT = 200
const BULK_EMAIL_BATCH_LIMIT = 500
const SMS_SEGMENT_SIZE = 160
const OPENAI_API_KEY = defineString('OPENAI_API_KEY', { default: '' })
const OPENAI_MODEL = defineString('OPENAI_MODEL', { default: 'gpt-4o-mini' })
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})
const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })
const BOOKING_DEFAULT_SERVICE_ID_ENV_KEY = 'BOOKING_DEFAULT_SERVICE_ID'
/** ============================================================================
 *  HELPERS
 * ==========================================================================*/

let openAiConfigWarned = false
let integrationApiKeyWarned = false

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getOpenAiConfig() {
  const apiKey = OPENAI_API_KEY.value()?.trim() || process.env.OPENAI_API_KEY?.trim() || ''
  const model = OPENAI_MODEL.value()?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  if (!apiKey && !openAiConfigWarned) {
    functions.logger.warn(
      'OPENAI_API_KEY is missing. Set it via Firebase params before calling generateAiAdvice.',
    )
    openAiConfigWarned = true
  }

  return { apiKey, model }
}

function getBookingDefaultServiceId() {
  return process.env[BOOKING_DEFAULT_SERVICE_ID_ENV_KEY]?.trim() || ''
}

function getIntegrationMasterApiKey(): string {
  const apiKey =
    SEDIFEX_INTEGRATION_API_KEY.value()?.trim() ||
    process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() ||
    ''

  if (!apiKey && !integrationApiKeyWarned) {
    functions.logger.warn(
      'SEDIFEX_INTEGRATION_API_KEY is missing. Integration HTTP endpoints will reject requests until it is configured.',
    )
    integrationApiKeyWarned = true
  }

  return apiKey
}
