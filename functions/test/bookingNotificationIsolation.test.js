const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { selectAuthorizedBookingRecipients } = require('../lib/bookingNotificationRecipients')
const { useCentralBookingSender, interpretSedifexNotificationResponse } = require('../lib/emailDelivery')

const verifiedMembers = [
  { role: 'owner', email: 'owner@glittering.example' },
  { role: 'staff', email: 'staff@glittering.example' },
  { role: 'staff', email: 'second@glittering.example' },
]
assert.deepEqual(selectAuthorizedBookingRecipients(
  verifiedMembers, ['onconurse@example.com', 'staff@glittering.example'],
), ['owner@glittering.example', 'staff@glittering.example'])
assert.deepEqual(selectAuthorizedBookingRecipients(verifiedMembers, []), ['owner@glittering.example'])
assert.deepEqual(selectAuthorizedBookingRecipients([], ['onconurse@example.com']), [])

for (const eventType of [
  'booking.received', 'booking.confirmed', 'booking.cancelled', 'booking.payment_confirmed',
  'booking.rescheduled', 'booking.reminder_1d', 'booking.reminder_3d',
  'order.confirmed', 'student_registration.paid', 'donation.confirmed',
]) {
  for (const preference of ['automatic', 'sedifex', 'store_email', 'custom_webhook']) {
    assert.equal(useCentralBookingSender(eventType, preference), true,
      eventType + ' must not use client Gmail')
  }
}
assert.equal(useCentralBookingSender(''), false)
assert.deepEqual(interpretSedifexNotificationResponse({ ok: true, sent: true }),
  { sent: true, duplicate: false })
assert.deepEqual(interpretSedifexNotificationResponse({ ok: true, skipped: true, reason: 'duplicate' }),
  { sent: false, duplicate: true })
assert.deepEqual(interpretSedifexNotificationResponse({ ok: false, error: 'unauthorized' }),
  { sent: false, duplicate: false })

const rowsBySheet = new Map()
function fakeSheet(name) {
  const rows = []
  const sheet = {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0]?.length || 0,
    appendRow: row => rows.push(row),
    getRange: (r, c, n = 1, m = 1) => ({
      getValues: () => Array.from({ length: n }, (_, i) =>
        Array.from({ length: m }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: values => {
        values.forEach((valuesRow, i) => {
          while (rows.length < r + i) rows.push([])
          valuesRow.forEach((value, j) => { rows[r - 1 + i][c - 1 + j] = value })
        })
      },
    }),
  }
  rowsBySheet.set(name, sheet)
  return sheet
}
const sent = []
const props = {
  SEDIFEX_NOTIFICATION_SHARED_SECRET: 'a'.repeat(40),
}
const context = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => props[key] || '',
  }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: name => rowsBySheet.get(name) || null,
    insertSheet: name => fakeSheet(name),
  }) },
  GmailApp: { sendEmail: (to, subject, plain, options) => sent.push({ to, subject, plain, options }) },
  LockService: { getScriptLock: () => ({
    tryLock: () => true, releaseLock: () => {},
  }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: body => ({ body, setMimeType() { return this }, getContent() { return this.body } }),
  },
  console: { error: () => {} },
}
const source = fs.readFileSync(path.join(__dirname, '../../scripts/sedifex-transactional-email.gs'), 'utf8')
vm.runInNewContext(source, context)
// The receipt generator uses actual Google Drive and HTML-to-PDF APIs, which
// are out of scope for these sender isolation tests. Preserve the real
// production script in GitHub; stub only PDF creation in this test VM.
context.generateReceipt_ = (_payload, _meta) => ({
  blob: { testPDF: true }, receiptNumber: 'SEDIFEX-TEST-001', url: 'https://drive.google.com/test',
})
function post(payload) {
  return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) }, parameter: {} }).body)
}
const msg = {
  secret: props.SEDIFEX_NOTIFICATION_SHARED_SECRET,
  storeId: 'glittering-store',
  eventType: 'booking.confirmed',
  reference: 'booking-123',
  recipientType: 'customer',
  to: 'customer@example.com',
  subject: 'Booking confirmed',
  text: 'Your appointment is confirmed',
  html: '<b>Confirmed</b>',
  brand: { storeName: 'Glittering Med-Spa', email: 'onconurse@example.com' },
  replyTo: 'owner@glittering.example',
  customer: { email: 'customer@example.com', name: 'Example Customer' },
  payment: { status: 'paid', amount: 100, currency: 'GHS' },
  data: { serviceName: 'Facial' },
  bcc: 'onconurse@example.com',
}
assert.equal(post({ ...msg, secret: 'wrong' }).ok, false)
assert.equal(sent.length, 0)
assert.equal(post(msg).sent, true, 'already-existing script should send and return sent:true')
assert.equal(sent.length, 1)
assert.equal(sent[0].options.bcc, 'learngermanghana@gmail.com', 'only approved Sedifex tracking BCC is used')
assert.equal(sent[0].options.replyTo, 'owner@glittering.example')
assert.equal(sent[0].options.attachments.length, 1, 'existing PDF receipt attachment remains')
assert.equal(post(msg).skipped, true, 'existing script returns skipped:true on duplicate')
assert.equal(sent.length, 1)
assert.equal(post({ ...msg, recipientType: 'store', to: 'owner@glittering.example' }).sent, true)
assert.equal(sent.length, 2, 'owner alert is separate from customer email')
assert.equal(sent[1].options.bcc, 'learngermanghana@gmail.com', 'store alert also uses approved Sedifex tracking BCC')
props.SEDIFEX_NOTIFICATION_SHARED_SECRET = ''
assert.equal(post(msg).ok, false, 'missing script property must fail closed')
assert.equal(sent.length, 2)
// Stale tracking properties belonging to unrelated stores are not honored.
props.SEDIFEX_TRACKING_EMAIL = 'onconurse@example.com'
assert.equal(context.getTrackingEmail_(), 'learngermanghana@gmail.com')
console.log('Existing Sedifex Central Notification Web App is secure and compatible')
