const assert = require('assert')
const fs = require('fs')
const path = require('path')

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
}

function includesAll(text, needles, label) {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label}: expected source to include ${JSON.stringify(needle)}`)
  }
}

function runNotificationCopyChecks() {
  const notifications = source('notifications.ts')
  includesAll(notifications, [
    'Booking received – payment pending',
    'not confirmed until payment is received and verified',
    'Pay securely with Paystack',
    "parsed.protocol === 'https:'",
  ], 'notifications')
}

function runPendingPaymentChecks() {
  const immediate = source('bookingEmailNotifications.ts')
  includesAll(immediate, [
    "'awaiting_verification'",
    "'manual_review'",
    "'pending_verification'",
    'data.paymentUrl',
    'data.checkoutUrl',
  ], 'bookingEmailNotifications')

  const automation = source('bookingEmailAutomation.ts')
  includesAll(automation, [
    "if (!verifiedPaid(data) && status !== 'partial') return 0",
    "if (!verifiedPaid(data) && status !== 'partial') return totalAmount(data)",
    "if (!isCreate && afterPaymentStatus === 'awaiting_verification'",
    'data.paymentUrl',
    'data.checkoutUrl',
  ], 'bookingEmailAutomation')
}

function runAutomaticCheckoutChecks() {
  const bookings = source('integrationBookings.ts')
  includesAll(bookings, [
    'initializePayment?: unknown',
    'shouldInitializeBookingPayment',
    "return explicit === true && input.paymentAmount > 0 && Boolean(input.customerEmail)",
    'initializeBookingCheckout',
    '/integrationCheckoutCreate',
    "paymentInitializationStatus: initializePayment ? (initializedPayment ? 'initialized' : 'failed') : 'not_requested'",
    'paymentUrl: initializedPayment?.paymentUrl || null',
    'paymentReference: initializedPayment?.paymentReference || null',
    "functions.logger.error('Automatic booking checkout initialization failed'",
  ], 'integrationBookings')

  assert.ok(!bookings.includes('return modes.some'), 'integrationBookings: payment mode fields must not implicitly initialize checkout')
  assert.ok(!bookings.includes('normalizedPaymentMode('), 'integrationBookings: legacy payment modes must not be used as checkout opt-in')
}

function runBookingEmailReliabilityChecks() {
  const notifications = source('notifications.ts')
  const automation = source('bookingEmailAutomation.ts')
  const immediate = source('bookingEmailNotifications.ts')
  const delivery = source('emailDelivery.ts')
  includesAll(notifications, [
    "prior?.status !== 'queued_no_live_sender'",
    "Number(prior.deliveryAttempts || 1) >= 3",
    "if (!claim) return { created: false, webhook: null }",
    "payload.data?.paymentVerified === true",
  ], 'safe duplicate and retry protection')
  includesAll(automation, [
    'const contactAdded =',
    'queueUnpaidBookingEmails(storeId, bookingId, after, originalReference)',
    "beforeBookingStatus !== 'confirmed' || contactAdded",
  ], 'late contact recovery')
  includesAll(immediate, ["'checkout_created'", "'partially_paid'", 'originalReference ||'], 'pending booking states')
  includesAll(delivery, ["body.ok === false", "body.success === false", "const accepted = response.ok && !explicitlyRejected"], 'sender rejection')
}

runBookingEmailReliabilityChecks()
runNotificationCopyChecks()
runPendingPaymentChecks()
runAutomaticCheckoutChecks()

console.log('booking pending-payment regression checks passed')
