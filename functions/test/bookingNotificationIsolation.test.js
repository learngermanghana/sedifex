const assert = require('node:assert/strict')
const { selectAuthorizedBookingRecipients } = require('../lib/bookingNotificationRecipients')
const { useCentralBookingSender } = require('../lib/emailDelivery')

const verifiedMembers = [
  { role: 'owner', email: 'owner@glittering.example' },
  { role: 'staff', email: 'staff@glittering.example' },
  { role: 'staff', email: 'second@glittering.example' },
]
assert.deepEqual(
  selectAuthorizedBookingRecipients(
    verifiedMembers,
    ['onconurse@example.com', 'staff@glittering.example'],
  ),
  ['owner@glittering.example', 'staff@glittering.example'],
  'wrong-store BCC must never be added from stale store settings',
)
assert.deepEqual(
  selectAuthorizedBookingRecipients(verifiedMembers, []),
  ['owner@glittering.example'],
  'owner should always receive booking store alert',
)
assert.deepEqual(
  selectAuthorizedBookingRecipients([], ['onconurse@example.com']),
  [],
  'no verified store member must mean no store email',
)

for (const event of [
  'booking.received', 'booking.confirmed', 'booking.cancelled',
  'booking.payment_confirmed', 'booking.rescheduled',
  'booking.reminder_1d', 'booking.reminder_3d',
  'order.confirmed', 'student_registration.paid', 'donation.confirmed',
]) {
  for (const preference of ['automatic', 'sedifex', 'store_email', 'custom_webhook']) {
    assert.equal(useCentralBookingSender(event, preference), true,
      `${event} must always use Sedifex's own script, not ${preference}`)
  }
}
assert.equal(useCentralBookingSender(''), false, 'empty event is not an email')
console.log('store-isolated transactional email routing tests passed')

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const sent = []
const rows = []
const props = {
  SEDIFEX_EMAIL_APPS_SCRIPT_SECRET: 'a'.repeat(40),
  SEDIFEX_EMAIL_LOG_SHEET_ID: 'sedifex-private-ledger',
}
const sheet = {
  getLastRow: () => rows.length,
  appendRow: row => rows.push(row),
  setFrozenRows: () => {},
  getRange: (a, b, count) => ({
    createTextFinder: key => ({
      matchEntireCell() { return this },
      findAll: () => rows.slice(a - 1, a - 1 + count)
        .map((row, i) => row[b - 1] === key ? { getRow: () => i + a } : null).filter(Boolean),
    }),
    getValue: () => rows[a - 1]?.[b - 1],
  }),
}
const sandbox = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: name => props[name] || '' }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
  GmailApp: { sendEmail: (to, subject, plain, options) => sent.push({ to, subject, plain, options }) },
  MailApp: { getRemainingDailyQuota: () => 80 },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_algorithm, data) => [...crypto.createHash('sha256').update(data).digest()],
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: body => ({ body, setMimeType() { return this } }),
  },
  console: { error: () => {} },
}
const script = fs.readFileSync(path.join(__dirname, '../../scripts/sedifex-transactional-email.gs'), 'utf8')
vm.runInNewContext(script, sandbox)
function post(payload) {
  return JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).body)
}
const msg = {
  secret: props.SEDIFEX_EMAIL_APPS_SCRIPT_SECRET,
  storeId: 'glittering-store',
  eventType: 'booking.confirmed',
  reference: 'booking-123',
  recipientType: 'customer',
  to: 'customer@example.com',
  subject: 'Booking confirmed',
  text: 'Your appointment is confirmed',
  html: '<b>Confirmed</b>',
  storeName: 'Glittering Med-Spa',
  replyTo: 'owner@glittering.example',
  bcc: 'onconurse@example.com',
}
assert.equal(post({ ...msg, secret: 'invalid' }).ok, false, 'wrong secret must reject')
assert.equal(sent.length, 0)
assert.equal(post(msg).ok, true, 'central script should accept authorized recipient')
assert.equal(sent.length, 1)
assert.equal(sent[0].options.bcc, undefined, 'caller-supplied cross-store BCC is forbidden')
assert.equal(sent[0].options.replyTo, 'owner@glittering.example')
assert.equal(post(msg).duplicate, true, 'idempotent event + recipient must send once')
assert.equal(sent.length, 1)
assert.equal(post({ ...msg, recipientType: 'store', to: 'owner@glittering.example' }).ok, true)
assert.equal(sent.length, 2, 'store notification is a separate auditable email')
assert.equal(sent[1].options.bcc, undefined)
console.log('Sedifex Apps Script delivery/security tests passed')
