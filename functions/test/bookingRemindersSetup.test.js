const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')
function load(name, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code, { exports, require: id => id in mocks ? mocks[id] : require(id), process, URL, Date, console })
  return exports
}
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code } }
const functions = { https: { onCall: handler => handler, HttpsError } }
const hash = token => crypto.createHash('sha256').update(token).digest('hex')
const admin = { firestore: { FieldValue: { serverTimestamp: () => 'saved', arrayUnion: x => [x], arrayRemove: x => ({ remove: x }) }, Timestamp: { fromMillis: x => ({ toMillis: () => x }) } } }
function database(rows) {
  const writes = []
  const snapshot = ref => ({ exists: !!rows[ref.path], data: () => rows[ref.path], ref, id: ref.path.split('/').pop() })
  const collection = path => ({ doc: id => ref(`${path}/${id}`), where() { return this }, limit(n) { assert.ok(n <= 2); return this }, get: async () => ({ empty: true, docs: [] }) })
  const ref = path => ({ path, id: path.split('/').pop(), collection: child => collection(`${path}/${child}`), get: async () => snapshot(ref(path)), update: async data => { writes.push({ path, data }); Object.assign(rows[path], data) } })
  const db = { collection, writes, beforeTransaction: null, runTransaction: async handler => { db.beforeTransaction?.(); return handler({ get: async r => snapshot(r), set: (r, data) => { writes.push({ path: r.path, data }); rows[r.path] = { ...rows[r.path], ...data } }, update: async (r, data) => { writes.push({ path: r.path, data }); Object.assign(rows[r.path], data) } }) } }
  return db
}
const core = load('bookingReminderCore')
const approved = { customerId: 'c', storeId: 's', bookingStatus: 'confirmed', bookingDate: '2026-10-12', bookingTime: '10:00', paymentStatus: 'unpaid' }
assert.equal(core.canConfirmAttendance(approved), true)
for (const status of ['pending', 'cancelled', 'completed']) assert.equal(core.canConfirmAttendance({ ...approved, bookingStatus: status }), false)
assert.equal(core.canConfirmAttendance({ ...approved, customerPortalRequest: { status: 'pending' } }), false)
assert.equal(core.hasAttendanceConfirmation({ ...approved, customerAttendanceConfirmation: { date: approved.bookingDate, time: approved.bookingTime, confirmedAt: 'saved' } }), true)
assert.equal(core.hasAttendanceConfirmation({ ...approved, bookingTime: '11:00', customerAttendanceConfirmation: { date: approved.bookingDate, time: approved.bookingTime, confirmedAt: 'saved' } }), false)
async function run() {
  const token = 'a'.repeat(64), tokenHash = hash(token)
  function fixture() { return { [`eventClientLinks/${tokenHash}`]: { linkKind: 'customer_portal', status: 'active', storeId: 's', customerId: 'c', expiresAt: { toMillis: () => Date.now() + 60000 } }, 'customers/c': { storeId: 's', email: 'customer@example.com', portal: { status: 'active', publicLinkHash: tokenHash } }, 'stores/s/integrationBookings/b': { ...approved }, 'integrationBookings/b': { ...approved } } }
  function portalModule(db) { return load('customerPortalSelfService', { 'firebase-functions/v1': functions, './firestore': { admin, defaultDb: db }, './bookingReminderCore': core, './eventContractSigningCore': { hashPublicContractToken: hash }, './emailDelivery': {}, './bookingEmailAutomation': {} }) }
  const payload = { token, bookingId: 'b', bookingDate: approved.bookingDate, bookingTime: approved.bookingTime }
  let rows = fixture(), db = database(rows), portal = portalModule(db)
  await portal.confirmCustomerPortalBookingAttendance(payload)
  assert.equal(db.writes.length, 2)
  assert.equal(rows['stores/s/integrationBookings/b'].paymentStatus, 'unpaid')
  assert.equal(rows['stores/s/integrationBookings/b'].bookingStatus, 'confirmed')
  await portal.confirmCustomerPortalBookingAttendance(payload)
  assert.equal(db.writes.length, 2, 'confirmation is idempotent')
  for (const mutation of [r => { r['stores/s/integrationBookings/b'].customerId = 'someone-else' }, r => { r['stores/s/integrationBookings/b'].bookingTime = '11:00' }, r => { r['stores/s/integrationBookings/b'].bookingStatus = 'pending' }, r => { r[`eventClientLinks/${tokenHash}`].status = 'revoked' }]) {
    rows = fixture(); mutation(rows); db = database(rows)
    await assert.rejects(portalModule(db).confirmCustomerPortalBookingAttendance(payload))
    assert.equal(db.writes.length, 0)
  }
  rows = fixture(); db = database(rows); db.beforeTransaction = () => { rows['customers/c'].portal.status = 'revoked' }
  await assert.rejects(portalModule(db).confirmCustomerPortalBookingAttendance(payload), e => e.code === 'permission-denied')
  assert.equal(db.writes.length, 0, 'concurrent revocation blocks writes')
  rows = fixture(); rows['integrationBookings/b'].storeId = 'different'; db = database(rows)
  await portalModule(db).confirmCustomerPortalBookingAttendance(payload)
  assert.equal(db.writes.length, 1, 'unrelated mirror is never updated')
  rows = fixture(); Object.assign(rows['customers/c'].portal, { publicUrl: `https://pay.sedifex.com/customer-portal/${token}`, expiresAt: { toMillis: () => Date.now() + 60000 } }); db = database(rows)
  const reminder = load('bookingReminderPortal', { './firestore': { admin, defaultDb: db }, './eventContractSigningCore': { hashPublicContractToken: hash } })
  assert.equal(await reminder.bookingReminderPortal('s', 'b', approved, 'customer@example.com'), `https://pay.sedifex.com/customer-portal/${token}?booking=b`)
  assert.equal(db.writes.length, 0, 'existing active link is reused')
  assert.equal(await reminder.bookingReminderPortal('s', 'b', approved, 'wrong@example.com'), null)
  rows['customers/c'].portal.publicUrl = `https://pay.sedifex.com/customer-portal/${'b'.repeat(64)}`
  assert.equal(await reminder.bookingReminderPortal('s', 'b', approved, 'customer@example.com'), null, 'URL must match stored token hash')
  rows['customers/c'].portal.status = 'revoked'
  assert.equal(await reminder.bookingReminderPortal('s', 'b', approved, 'customer@example.com'), null)
  db = database({ 'stores/s': { ownerUid: 'owner', name: 'Shop', email: 'owner@example.com', paymentRouting: { paystackSubaccountCode: 'ACCT_1' }, promoEnabled: true, promoSlug: 'shop', setupChecklist: { skipped: ['payout', 'catalog'] } } })
  const setup = load('businessSetup', { 'firebase-functions/v1': functions, './firestore': { admin, defaultDb: db } })
  await assert.rejects(setup.getBusinessSetupChecklist({ storeId: 's' }, {}), e => e.code === 'unauthenticated')
  await assert.rejects(setup.getBusinessSetupChecklist({ storeId: 's' }, { auth: { uid: 'staff' } }), e => e.code === 'permission-denied')
  const result = await setup.getBusinessSetupChecklist({ storeId: 's' }, { auth: { uid: 'owner' } })
  assert.equal(result.completion.profile, true)
  assert.equal(result.dismissed, false)
  assert.equal(result.publicUrl, undefined, 'retired public page links are no longer returned')
  await setup.setBusinessSetupStepSkipped({ storeId: 's', step: 'profile', skipped: true }, { auth: { uid: 'owner' } })
  assert.equal(db.writes.length, 1)
  assert.deepEqual(db.writes[0].data, { 'setupChecklist.profileDismissed': true })
  rows['stores/s'].setupChecklist.profileDismissed = true
  assert.equal((await setup.getBusinessSetupChecklist({ storeId: 's' }, { auth: { uid: 'owner' } })).dismissed, true)
  await assert.rejects(setup.setBusinessSetupStepSkipped({ storeId: 's', step: 'invalid', skipped: true }, { auth: { uid: 'owner' } }), e => e.code === 'invalid-argument')
  console.log('Booking reminder and setup behavior checks passed')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
