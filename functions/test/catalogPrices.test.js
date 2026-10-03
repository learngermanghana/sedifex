const assert = require('node:assert/strict')
const { normalizeCatalogPrices, readCatalogPrices, catalogPriceFields } = require('../lib/catalogPrices')

const rows = [{ currencyCode: 'ghs', amount: '500' }, { currencyCode: 'USD', amount: 40 }, { currencyCode: ' xof ', currencyName: 'CFA Franc', symbol: 'CFA', amount: 25000 }]
const saved = normalizeCatalogPrices(rows, true)
assert.deepEqual(catalogPriceFields({ prices: saved }).pricesByCurrency, { GHS: 500, USD: 40, XOF: 25000 })
assert.equal(saved[0].symbol, 'GH₵')
assert.equal(saved[2].custom, true)
assert.deepEqual(readCatalogPrices({ prices: JSON.parse(JSON.stringify(saved)) }), saved)
assert.equal(readCatalogPrices({ price: 25 })[0].currencyCode, 'GHS')
assert.equal(readCatalogPrices({ price: 25, currency: 'USD' })[0].currencyCode, 'USD')
assert.deepEqual(readCatalogPrices({ price: null }), [])
assert.deepEqual(readCatalogPrices({ price: 500, prices: [] }), [])
assert.deepEqual(catalogPriceFields({ prices: saved.slice(1), price: 500 }).pricesByCurrency, { USD: 40, XOF: 25000 })
assert.equal(normalizeCatalogPrices([{ currencyCode: 'USD', amount: 0 }], true)[0].amount, 0)
assert.throws(() => normalizeCatalogPrices([...rows, { currencyCode: ' usd ', amount: 90 }], true), /Only one USD/)
for (const amount of ['', ' ', null, undefined, -1, Infinity, 'NaN', {}, true]) {
  assert.throws(() => normalizeCatalogPrices([{ currencyCode: 'USD', amount }], true), /valid price/)
}
assert.throws(() => normalizeCatalogPrices([{ currencyCode: 'XOF', amount: 10 }], true), /currency name/)
assert.throws(() => normalizeCatalogPrices([{ currencyCode: '__PROTO__', amount: 10 }], true), /currency code/)
console.log('catalogPrices: normalization, round-trip, legacy, removal, custom and validation passed')
