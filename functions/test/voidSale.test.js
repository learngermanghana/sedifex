const assert = require('assert')
const Module = require('module')
const { MockFirestore, MockTimestamp } = require('./helpers/mockFirestore')

let currentDb
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'firebase-admin') {
    const apps = []
    const firestore = () => currentDb
    firestore.FieldValue = { serverTimestamp: () => ({ __mockServerTimestamp: true }) }
    firestore.Timestamp = MockTimestamp
    return {
      initializeApp: () => { const app = { name: 'mock-app' }; apps[0] = app; return app },
      app: () => apps[0] || null,
      apps,
      firestore,
      auth: () => ({}),
    }
  }
  if (request === 'firebase-admin/firestore') return { getFirestore: () => currentDb }
  return originalLoad(request, parent, isMain)
}

async function run() {
  currentDb = new MockFirestore({
    'teamMembers/owner-1': { uid: 'owner-1', storeId: 'store-1', role: 'owner' },
    'teamMembers/staff-1': { uid: 'staff-1', storeId: 'store-1', role: 'staff' },
    'teamMembers/linked-owner': { uid: 'linked-owner', storeId: 'parent-store', role: 'owner' },
    'stores/child-store': { storeId: 'child-store', parentStoreId: 'parent-store' },
    'products/product-1': { storeId: 'store-1', stockCount: 7 },
    'products/child-product': { storeId: 'child-store', stockCount: 4 },
    'sales/child-sale': {
      storeId: 'child-store',
      status: 'completed',
      items: [{ productId: 'child-product', qty: 1, type: 'product' }],
    },
    'sales/sale-1': {
      storeId: 'store-1',
      status: 'completed',
      total: 50,
      items: [
        { productId: 'product-1', qty: 2, type: 'product' },
        { productId: null, qty: 1, type: 'service', isService: true },
      ],
    },
  })

  delete require.cache[require.resolve('../lib/index.js')]
  const { voidSale } = require('../lib/index.js')
  const ownerContext = { auth: { uid: 'owner-1', token: { email: 'owner@example.com' } } }

  const result = await voidSale.run({ storeId: 'store-1', saleId: 'sale-1', reason: 'Wrong quantity entered' }, ownerContext)
  assert.deepStrictEqual(result, { ok: true, saleId: 'sale-1', status: 'voided' })
  assert.strictEqual(currentDb.getDoc('products/product-1').stockCount, 9)
  assert.strictEqual(currentDb.getDoc('sales/sale-1').status, 'voided')
  assert.strictEqual(currentDb.getDoc('sales/sale-1').voidReason, 'Wrong quantity entered')

  const linkedOwnerResult = await voidSale.run(
    { storeId: 'child-store', saleId: 'child-sale', reason: 'Correct child store sale' },
    { auth: { uid: 'linked-owner', token: { email: 'owner@example.com' } } },
  )
  assert.deepStrictEqual(linkedOwnerResult, { ok: true, saleId: 'child-sale', status: 'voided' })
  assert.strictEqual(currentDb.getDoc('products/child-product').stockCount, 5)

  const reversals = currentDb.listCollection('ledger')
  assert.strictEqual(reversals.length, 2)
  const originalSaleReversal = reversals.find(entry => entry.data.refId === 'sale-1')
  assert.strictEqual(originalSaleReversal.data.type, 'sale_void')
  assert.strictEqual(originalSaleReversal.data.qtyChange, 2)
  assert.strictEqual(currentDb.listCollection('activity').length, 2)

  await assert.rejects(
    () => voidSale.run({ storeId: 'store-1', saleId: 'sale-1', reason: 'Try twice' }, ownerContext),
    error => error.code === 'already-exists',
  )
  assert.strictEqual(currentDb.getDoc('products/product-1').stockCount, 9, 'a repeated void must not restore stock twice')

  currentDb.setRaw('sales/sale-2', { storeId: 'store-1', status: 'completed', items: [] })
  await assert.rejects(
    () => voidSale.run(
      { storeId: 'store-1', saleId: 'sale-2', reason: 'Staff correction attempt' },
      { auth: { uid: 'staff-1', token: { email: 'staff@example.com' } } },
    ),
    error => error.code === 'permission-denied',
  )
  assert.strictEqual(currentDb.getDoc('sales/sale-2').status, 'completed')

  console.log('voidSale tests passed')
}

run()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => { Module._load = originalLoad })
