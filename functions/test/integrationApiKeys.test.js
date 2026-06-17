const assert = require('assert')
const Module = require('module')
const { MockFirestore } = require('./helpers/mockFirestore')

let currentDefaultDb
const apps = []

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'firebase-admin') {
    const firestore = () => currentDefaultDb
    firestore.FieldValue = {
      serverTimestamp: () => ({ __mockServerTimestamp: true }),
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
    }
  }

  if (request === 'firebase-admin/firestore') {
    return {
      getFirestore: () => currentDefaultDb,
    }
  }

  return originalLoad(request, parent, isMain)
}

function loadIntegrationApiKeysModule(initialData = {}) {
  apps.length = 0
  currentDefaultDb = new MockFirestore(initialData)
  delete require.cache[require.resolve('../lib/firestore.js')]
  delete require.cache[require.resolve('../lib/integrationApiKeys.js')]
  return require('../lib/integrationApiKeys.js')
}

function authContext(uid = 'owner-uid') {
  return { auth: { uid } }
}

async function assertHttpsError(promise, expectedCode, expectedMessage) {
  try {
    await promise
    assert.fail(`Expected ${expectedCode} error`)
  } catch (error) {
    assert.strictEqual(error.code, expectedCode)
    if (expectedMessage) assert.strictEqual(error.message, expectedMessage)
  }
}

async function runExplicitStoreIdTest() {
  const { createIntegrationApiKey } = loadIntegrationApiKeysModule({
    'teamMembers/owner-uid': { storeId: 'store-a' },
  })

  const result = await createIntegrationApiKey.run(
    { storeId: ' store-a ', name: ' Website prod ', purpose: ' Website ' },
    authContext(),
  )

  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.storeId, 'store-a')
  assert.strictEqual(result.purpose, 'website')
  assert.ok(result.token.startsWith('sedx_'))
  assert.ok(currentDefaultDb.getDoc(`integrationApiKeys/${result.keyId}`))
  assert.ok(currentDefaultDb.getDoc(`stores/store-a/integrationApiKeys/${result.keyId}`))
  assert.ok(currentDefaultDb.getDoc(`storeSettings/store-a/integrationApiKeys/${result.keyId}`))
}

async function runTeamMemberFallbackTest() {
  const { createIntegrationApiKey } = loadIntegrationApiKeysModule({
    'teamMembers/owner-uid': { storeId: 'store-from-team' },
  })

  const result = await createIntegrationApiKey.run(
    { name: 'Fallback key', purpose: 'website' },
    authContext(),
  )

  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.storeId, 'store-from-team')
  const record = currentDefaultDb.getDoc(`integrationApiKeys/${result.keyId}`)
  assert.strictEqual(record.storeId, 'store-from-team')
}

async function runMissingStoreTest() {
  const { createIntegrationApiKey } = loadIntegrationApiKeysModule({
    'teamMembers/owner-uid': { role: 'owner' },
  })

  await assertHttpsError(
    createIntegrationApiKey.run({ name: 'Missing store' }, authContext()),
    'failed-precondition',
    'No store is assigned to this account. Please refresh your workspace or contact support.',
  )
}

async function runOtherStoreDeniedTest() {
  const { createIntegrationApiKey } = loadIntegrationApiKeysModule({
    'teamMembers/owner-uid': { storeId: 'store-a' },
  })

  await assertHttpsError(
    createIntegrationApiKey.run({ storeId: 'store-b', name: 'Wrong store' }, authContext()),
    'permission-denied',
    'You cannot create keys for this store.',
  )
}

async function runUnauthenticatedTest() {
  const { createIntegrationApiKey } = loadIntegrationApiKeysModule({
    'teamMembers/owner-uid': { storeId: 'store-a' },
  })

  await assertHttpsError(
    createIntegrationApiKey.run({ storeId: 'store-a', name: 'No auth' }, {}),
    'unauthenticated',
    'Sign in required.',
  )
}

async function run() {
  await runExplicitStoreIdTest()
  await runTeamMemberFallbackTest()
  await runMissingStoreTest()
  await runOtherStoreDeniedTest()
  await runUnauthenticatedTest()
}

run()
  .then(() => {
    console.log('integrationApiKeys tests passed')
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
