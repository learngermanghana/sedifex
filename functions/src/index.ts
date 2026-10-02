// functions/src/index.ts
export { checkSignupUnlock, createCheckout, paystackWebhook } from './paystack'
export { handlePaystackWebhook } from './marketplacePaystackWebhook'
export {
  createPaystackMerchantSubaccount,
  fetchPaystackMerchantSubaccount,
  fetchPaystackSettlementBanks,
  syncPaystackMerchantSubaccountOnStoreWrite,
} from './paystackSubaccounts'
export { integrationCheckoutCreate } from './integrationQuickPayCheckoutCreate'
export {
  integrationCheckoutPreview,
  integrationOrderStatus,
} from './integrationCheckout'
export { integrationCashCheckoutCreate } from './integrationCashCheckout'
export { publicQuickPayReceipt } from './publicQuickPayReceipt'
export { syncIntegrationOrderCustomer } from './integrationOrderCustomerSync'
export {
  syncStoreBookingCustomerIdentity,
  syncRootBookingCustomerIdentity,
  syncInvoiceCustomerIdentity,
  syncReceiptCustomerIdentity,
  syncStudentRegistrationCustomerIdentity,
  syncExternalStudentRegistrationCustomerIdentity,
  syncStoreStudentRegistrationCustomerIdentity,
  syncStudentCustomerIdentity,
  syncStoreOrderCustomerIdentity,
  syncSaleCustomerIdentity,
} from './customerIdentitySync'
export { repairDataConsistency, repairDuplicateBookingOrders } from './dataConsistency'
export { cleanPendingReportData, onSaleReportingAggregate } from './reporting'
export { v1IntegrationAvailability } from './integrationAvailability'
export { v1IntegrationHeroSlides } from './integrationHeroSlides'
export { v1IntegrationBookings } from './integrationBookings'

// Recurring Cloud Scheduler jobs and automatic SMS pipelines are intentionally
// not exported. Sedifex keeps manual/user-triggered communication paths while
// avoiding background Cloud Run invocations when the product is lightly used.
export {
  getAutomationCenterState,
  saveAutomationCenterSettings,
} from './automationCenter'
export { runEventCommunicationsNow } from './eventCommunications'
export { notifyUnpaidBookingCreated } from './bookingEmailNotifications'
export { automateBookingEmailOnWrite } from './bookingEmailAutomation'
export {
  sendEventContractForSignature,
  getPublicEventContract,
  getPublicEventContractPdf,
  requestPublicEventContractChanges,
  signPublicEventContract,
} from './eventContractSigning'
export { getEventEmailDeliveryProfile } from './eventEmailDeliveryProfile'
export {
  shareEventClientPortal,
  eventClientPortal,
} from './eventClientCollaboration'
export {
  shareCustomerPortal,
  revokeCustomerPortal,
  getCustomerPortal,
} from './customerPortal'
export {
  getCustomerPortalSelfServiceState,
  submitCustomerPortalBookingRequest,
  reviewCustomerPortalBookingRequest,
  createCustomerPortalPaymentCheckout,
} from './customerPortalSelfService'
export {
  mutateEventProgram,
  prepareEventProgramRevision,
  resolveEventProgramChangeRequest,
} from './eventProgramCollaboration'
export { approveEventProgram, publishEventProgram } from './eventProgramApproval'
export { syncEventPlanningCustomer } from './eventCustomerSync'
export { auditEventPlanningWrite } from './eventAudit'
export { v1IntegrationProducts } from './integrationProducts'
export { v1IntegrationSocialSettings } from './integrationSocialSettings'
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
  googleMerchantPendingAccounts,
  googleMerchantSelectAccount,
  googleShoppingSync,
} from './googleShopping'
export * from './googleBusinessProfile'

export { createIntegrationApiKey, listIntegrationApiKeys } from './integrationApiKeys'
export { getPricingPlans } from './pricingPlans'

export { commitSale } from './pos/commitSale'
export { receiveStock } from './pos/receiveStock'
export { voidSale } from './pos/voidSale'
