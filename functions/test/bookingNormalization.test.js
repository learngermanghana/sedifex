const assert = require('assert')
const Module = require('module')

let currentDefaultDb = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ data: () => ({}) }),
    }),
  }),
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'firebase-admin') {
    const firestore = () => currentDefaultDb
    firestore.FieldValue = {
      serverTimestamp: () => ({ __mockServerTimestamp: true }),
      increment: value => ({ __mockIncrement: value }),
    }
    firestore.Timestamp = {
      fromDate: value => value,
    }

    return {
      initializeApp: () => ({ name: 'mock-app' }),
      app: () => ({ name: 'mock-app' }),
      apps: [{ name: 'mock-app' }],
      firestore,
      auth: () => ({
        getUser: async () => null,
        setCustomUserClaims: async () => {},
      }),
    }
  }

  if (request === 'firebase-admin/firestore') {
    return {
      getFirestore: () => currentDefaultDb,
    }
  }

  return originalLoad(request, parent, isMain)
}

function loadFunctionsModule() {
  delete require.cache[require.resolve('../lib/index.js')]
  return require('../lib/index.js')
}

function runCanonicalKeyTests(testing) {
  assert.strictEqual(testing.canonicalizeBookingKey(' Customer_Name '), 'customername')
  assert.strictEqual(testing.canonicalizeBookingKey('customer-name'), 'customername')
}

function runLookupTests(testing) {
  const lookup = testing.buildBookingValueLookup({
    Customer_Name: 'Ama',
    customerPhone: '+233123',
  })

  const name = testing.pickBookingValueFromAliases({
    aliases: ['customerName'],
    lookups: [lookup],
  })
  assert.strictEqual(name, 'Ama')
}

function runSanitizeTests(testing) {
  const raw = {
    short: 'ok',
    long: 'x'.repeat(800),
    list: new Array(50).fill('a'),
  }
  const result = testing.sanitizeBookingAttributes(raw)

  assert.strictEqual(typeof result.attributes.short, 'string')
  assert.strictEqual(result.attributes.long.length, 500)
  assert.strictEqual(result.attributes.list.length, 20)
  assert.ok(result.meta.truncatedKeys.includes('long'))
  assert.ok(result.meta.truncatedKeys.includes('list'))
  assert.strictEqual(result.meta.totalReceived, 3)
  assert.strictEqual(result.meta.totalStored, 3)
}

function runDateFormattingTests(testing) {
  assert.strictEqual(testing.normalizeBookingDateForSheet('2026-04-29'), '2026-04-29')
  assert.strictEqual(testing.normalizeBookingDateForSheet('April 29, 2026'), '2026-04-29')
  assert.strictEqual(testing.normalizeBookingDateForSheet(''), null)
  assert.strictEqual(testing.normalizeBookingDateForSheet('2026-02-30'), null)
}

function runTimeFormattingTests(testing) {
  assert.strictEqual(testing.normalizeBookingTimeForSheet('19:00'), '19:00')
  assert.strictEqual(testing.normalizeBookingTimeForSheet('7pm'), '19:00')
  assert.strictEqual(testing.normalizeBookingTimeForSheet('7:05 PM'), '19:05')
  assert.strictEqual(testing.normalizeBookingTimeForSheet('12am'), '00:00')
  assert.strictEqual(testing.normalizeBookingTimeForSheet(''), null)
}

function runMerchantTokenLookupTests(testing) {
  assert.strictEqual(
    testing.normalizeMerchantIdForEnvSuffix('37mJqg20MjOriggaIaOOuahDsgj1'),
    '37MJQG20MJORIGGAIAOOUAHDSGJ1',
  )
  assert.strictEqual(testing.normalizeMerchantIdForEnvSuffix('store-abc.123'), 'STORE_ABC_123')

  const json = JSON.stringify({
    rQYE4FQGVZPcUpdptdgeRo5A80G2: 'sdfx_a',
    '37mJqg20MjOriggaIaOOuahDsgj1': 'sdfx_b',
  })
  assert.strictEqual(testing.getMerchantTokenFromJsonMap(json, 'rQYE4FQGVZPcUpdptdgeRo5A80G2'), 'sdfx_a')
  assert.strictEqual(testing.getMerchantTokenFromJsonMap('not-json', 'merchant'), '')

  process.env.SEDIFEX_MERCHANT_TOKENS_JSON = json
  process.env.SEDIFEX_MERCHANT_TOKEN_STORE_ABC = 'legacy_token'
  assert.strictEqual(testing.getMerchantIntegrationToken('37mJqg20MjOriggaIaOOuahDsgj1'), 'sdfx_b')
  assert.strictEqual(testing.getMerchantIntegrationToken('store-abc'), 'legacy_token')

  delete process.env.SEDIFEX_MERCHANT_TOKENS_JSON
  delete process.env.SEDIFEX_MERCHANT_TOKEN_STORE_ABC
}

function run() {
  const module = loadFunctionsModule()
  assert.ok(module.__testing, 'Expected __testing exports')

  runCanonicalKeyTests(module.__testing)
  runLookupTests(module.__testing)
  runSanitizeTests(module.__testing)
  runDateFormattingTests(module.__testing)
  runTimeFormattingTests(module.__testing)
  runMerchantTokenLookupTests(module.__testing)
}

run()
console.log('bookingNormalization tests passed')
