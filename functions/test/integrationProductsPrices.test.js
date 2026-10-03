const assert = require('node:assert/strict')
const Module = require('node:module')
const { MockFirestore } = require('./helpers/mockFirestore')
const db = new MockFirestore()
const originalLoad = Module._load
Module._load = function (name, parent, isMain) {
  if (name === 'firebase-functions/v1') return { https: { onRequest: fn => fn }, logger: { error: console.error, info() {}, warn() {} } }
  if (name === 'firebase-functions/params') return { defineString: (key, options) => ({ value: () => key === 'SEDIFEX_INTEGRATION_API_KEY' ? 'test-key' : options?.default ?? '' }) }
  if (name === './firestore') return { defaultDb: db, admin: { firestore: { Timestamp: { now: () => ({ toDate: () => new Date() }) } } } }
  if (name === './integrationAuth') return {
    cleanIntegrationText: value => typeof value === 'string' ? value.trim() : '',
    isIntegrationRequestAuthorized: async () => true,
    redactIntegrationApiKey: () => '', resolveIntegrationApiKey: () => '',
  }
  return originalLoad.call(this, name, parent, isMain)
}
const { v1IntegrationProducts } = require('../lib/integrationProducts')
const { integrationCheckoutPreview } = require('../lib/integrationCheckout')
Module._load = originalLoad

async function run() {
  const prices = [{ currencyCode: 'GHS', amount: 500 }, { currencyCode: 'USD', amount: 40 }, { currencyCode: 'XOF', currencyName: 'CFA Franc', symbol: 'CFA', amount: 25000 }]
  await db.collection('products').doc('service').set({ storeId: 'store-1', name: 'Hair treatment', itemType: 'service', price: 999, prices })
  await db.collection('products').doc('legacy').set({ storeId: 'store-1', name: 'Old item', price: 75 })
  await db.collection('products').doc('usd-only').set({ storeId: 'store-1', name: 'USD only', price: 999, prices: [{ currencyCode: 'USD', amount: 40 }] })
  await db.collection('products').doc('other-store').set({ storeId: 'store-2', name: 'Other store', price: 1 })
  let body, status
  const res = { set() {}, status(value) { status = value; return this }, json(value) { body = value }, send() {} }
  await v1IntegrationProducts({ method: 'GET', query: { storeId: 'store-1' }, get: () => '' }, res)
  assert.equal(status, 200)
  assert.equal(body.products.length, 3)
  const service = body.publicServices.find(row => row.id === 'service')
  assert.deepEqual(service.pricesByCurrency, { GHS: 500, USD: 40, XOF: 25000 })
  assert.deepEqual(service.availableCurrencies, ['GHS', 'USD', 'XOF'])
  assert.equal(service.price, 500)
  assert.equal(service.priceMinor, 50000)
  assert.equal(service.prices[2].symbol, 'CFA')
  assert.equal(body.products.find(row => row.id === 'legacy').pricesByCurrency.GHS, 75)
  const usd = body.products.find(row => row.id === 'usd-only')
  assert.equal(usd.price, null)
  assert.equal(usd.priceMinor, null)
  assert.deepEqual(usd.pricesByCurrency, { USD: 40 })
  async function preview(currency, itemId) {
    await integrationCheckoutPreview({ method: 'POST', body: { storeId: 'store-1', currency, items: [{ itemId, quantity: 2 }] }, get: name => name === 'x-api-key' ? 'test-key' : '' }, res)
  }
  await preview('GHS', 'service')
  assert.equal(status, 200)
  assert.equal(body.final_total, 100000)
  assert.equal(body.currency, 'GHS')
  await preview('USD', 'service')
  assert.equal(status, 400)
  assert.equal(body.error, 'unsupported-checkout-currency')
  await preview('GHS', 'usd-only')
  assert.equal(status, 400)
  assert.equal(body.error, 'checkout-item-price-missing')
  console.log('integrationProductsPrices: authenticated catalogue mapping, legacy fallback and GHS compatibility passed')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
