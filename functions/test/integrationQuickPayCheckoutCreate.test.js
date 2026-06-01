const assert = require('assert')
const Module = require('module')
const { MockFirestore } = require('./helpers/mockFirestore')

let currentDefaultDb
const apps = []
const originalLoad = Module._load
let paystackPayloads = []

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'firebase-admin') {
    const firestore = () => currentDefaultDb
    firestore.FieldValue = {
      serverTimestamp: () => ({ __mockServerTimestamp: true }),
      increment: value => ({ __mockIncrement: value }),
    }
    firestore.Timestamp = {
      now: () => ({ __mockTimestamp: true }),
      fromDate: value => value,
    }

    return {
      initializeApp: () => {
        const app = { name: 'mock-app' }
        apps[0] = app
        return app
      },
      app: () => apps[0] || null,
      apps,
      firestore,
      auth: () => ({ getUser: async () => null, setCustomUserClaims: async () => {} }),
    }
  }

  if (request === 'firebase-functions/v1') {
    class HttpsError extends Error {
      constructor(code, message) {
        super(message)
        this.code = code
      }
    }

    return {
      https: {
        onCall: fn => {
          const handler = (...args) => fn(...args)
          handler.run = fn
          return handler
        },
        onRequest: fn => {
          const handler = (req, res) => fn(req, res)
          handler.run = fn
          return handler
        },
        HttpsError,
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    }
  }

  if (request === 'firebase-functions/params') {
    return {
      defineString: (name, options = {}) => ({
        value: () => process.env[name] || options.default || '',
      }),
    }
  }

  return originalLoad(request, parent, isMain)
}

global.fetch = async (_url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  paystackPayloads.push(payload)
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: true,
      data: {
        authorization_url: `https://checkout.paystack.test/${payload.reference}`,
        access_code: `access_${payload.reference}`,
        reference: payload.reference,
      },
    }),
  }
}

function resetModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/functions/lib/')) delete require.cache[key]
  }
}

function loadQuickPayModule() {
  resetModules()
  return require('../lib/integrationQuickPayCheckoutCreate.js')
}

function loadCashModule() {
  resetModules()
  return require('../lib/integrationCashCheckout.js')
}

function makeResponse() {
  const state = { statusCode: 0, body: null, headers: {} }
  const res = {
    set(name, value) {
      state.headers[name] = value
      return res
    },
    status(code) {
      state.statusCode = code
      return res
    },
    json(payload) {
      state.body = payload
      return res
    },
    send(payload) {
      state.body = payload
      return res
    },
  }
  return { res, state }
}

async function post(handler, body) {
  const { res, state } = makeResponse()
  const req = {
    method: 'POST',
    body,
    get: () => '',
  }
  await handler(req, res)
  return state
}

const quickPayBody = overrides => ({
  storeId: 'store-123',
  reference: overrides?.reference || `ref_${Date.now()}`,
  amount: 1000,
  currency: 'GHS',
  customer: { email: 'customer@example.com', name: 'Ama', phone: '+233200000000' },
  sourceChannel: 'quick_pay_qr',
  sourceLabel: 'Sedifex Quick Pay',
  quickPayType: 'SERVICE',
  accountingType: 'service',
  metadata: { quickPay: true, itemName: 'Spa package' },
  items: [{ item_id: 'svc-1', name: 'Spa package', type: 'SERVICE', qty: 1 }],
  ...(overrides || {}),
})

async function runQuickPayStoreRoutingTest() {
  currentDefaultDb = new MockFirestore({
    'stores/store-123': {
      paymentRouting: {
        paystackSubaccountCode: 'ACCT_store_nested',
        percentageCharge: 3,
        settlementMode: 'subaccount',
        status: 'active',
      },
    },
    'storeSettings/store-123': {
      paymentRouting: {
        paystackSubaccountCode: 'ACCT_settings_should_not_win',
        percentageCharge: 10,
        settlementMode: 'subaccount',
        status: 'active',
      },
    },
  })
  process.env.PAYSTACK_SECRET_KEY = 'test_secret'
  paystackPayloads = []

  const { integrationCheckoutCreate } = loadQuickPayModule()
  const state = await post(integrationCheckoutCreate, quickPayBody({ reference: 'qp_store_routing' }))

  assert.strictEqual(state.statusCode, 200)
  assert.strictEqual(paystackPayloads.length, 1)
  const payload = paystackPayloads[0]
  assert.strictEqual(payload.subaccount, 'ACCT_store_nested')
  assert.strictEqual(payload.amount, 101989)
  assert.strictEqual(payload.transaction_charge, 3000)
  assert.strictEqual(payload.bearer, 'subaccount')
  assert.strictEqual(payload.metadata.baseTotalMinor, 100000)
  assert.strictEqual(payload.metadata.processingFeeMinor, 1989)
  assert.strictEqual(payload.metadata.customerTotalMinor, 101989)
  assert.strictEqual(payload.metadata.sedifexCommissionMinor, 3000)
  assert.strictEqual(payload.metadata.splitEnabled, true)

  const order = currentDefaultDb.getDoc('integrationOrders/qp_store_routing')
  assert.ok(order, 'Expected integration order to be stored')
  assert.deepStrictEqual(order.pricingSnapshot, {
    baseTotalMinor: 100000,
    processingFeeMinor: 1989,
    customerTotalMinor: 101989,
    sedifexCommissionMinor: 3000,
    customerPaysProcessingFee: true,
    merchantPaysCommission: true,
  })
  assert.strictEqual(order.paymentRouting.source, 'stores.paymentRouting')
  assert.strictEqual(order.paystackSplit.subaccount, 'ACCT_store_nested')
  assert.strictEqual(order.paystackSplit.transactionChargeMinor, 3000)
  assert.strictEqual(state.body.paystackSplit.enabled, true)
}

async function runMissingSubaccountTest() {
  currentDefaultDb = new MockFirestore({ 'stores/store-123': { name: 'No routing store' } })
  process.env.PAYSTACK_SECRET_KEY = 'test_secret'
  paystackPayloads = []

  const { integrationCheckoutCreate } = loadQuickPayModule()
  const state = await post(integrationCheckoutCreate, quickPayBody({ reference: 'qp_no_subaccount' }))

  assert.strictEqual(state.statusCode, 200)
  const payload = paystackPayloads[0]
  assert.strictEqual(payload.subaccount, undefined)
  assert.strictEqual(payload.transaction_charge, undefined)
  assert.strictEqual(payload.metadata.splitEnabled, false)
  assert.strictEqual(payload.metadata.splitDisabledReason, 'missing_paystack_subaccount')
  const order = currentDefaultDb.getDoc('integrationOrders/qp_no_subaccount')
  assert.strictEqual(order.paystackSplit.enabled, false)
  assert.strictEqual(order.paystackSplit.splitDisabledReason, 'missing_paystack_subaccount')
}

async function runExternalBodySubaccountCompatibilityTest() {
  currentDefaultDb = new MockFirestore({})
  process.env.PAYSTACK_SECRET_KEY = 'test_secret'
  paystackPayloads = []

  const { integrationCheckoutCreate } = loadQuickPayModule()
  const state = await post(integrationCheckoutCreate, {
    storeId: 'external-store',
    reference: 'external_body_subaccount',
    amount: 1000,
    currency: 'GHS',
    customer: { email: 'buyer@example.com' },
    sourceChannel: 'integration_checkout',
    subaccount: 'ACCT_from_body',
    splitPayment: { transactionChargeMinor: 2500 },
    metadata: { quickPay: false },
  })

  assert.strictEqual(state.statusCode, 200)
  const payload = paystackPayloads[0]
  assert.strictEqual(payload.amount, 100000)
  assert.strictEqual(payload.subaccount, 'ACCT_from_body')
  assert.strictEqual(payload.transaction_charge, 2500)
  assert.strictEqual(payload.metadata.processingFeeMinor, 0)
  assert.strictEqual(payload.metadata.customerPaysProcessingFee, false)
}

async function runCashQuickPayNoProcessingFeeTest() {
  currentDefaultDb = new MockFirestore({ 'stores/store-123': {} })
  const { integrationCashCheckoutCreate } = loadCashModule()
  const state = await post(integrationCashCheckoutCreate, {
    storeId: 'store-123',
    reference: 'cash_quickpay',
    amount: 1000,
    currency: 'GHS',
    customer: { email: 'cash@example.com', name: 'Cash Buyer' },
    sourceChannel: 'quick_pay_cash',
    metadata: { quickPay: true },
    items: [{ item_id: 'svc-1', name: 'Service', qty: 1 }],
  })

  assert.strictEqual(state.statusCode, 200)
  const cashOrder = currentDefaultDb.getDoc('stores/store-123/cashOrders/cash_quickpay')
  assert.ok(cashOrder, 'Expected cash order to be stored')
  assert.strictEqual(cashOrder.amountMinor, 100000)
  assert.strictEqual(cashOrder.processingFeeMinor, undefined)
  assert.deepStrictEqual(cashOrder.paystackSplit, { enabled: false, reason: 'store_only_cash_checkout' })
}

async function run() {
  await runQuickPayStoreRoutingTest()
  await runMissingSubaccountTest()
  await runExternalBodySubaccountCompatibilityTest()
  await runCashQuickPayNoProcessingFeeTest()
}

run()
  .then(() => console.log('integrationQuickPayCheckoutCreate tests passed'))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
