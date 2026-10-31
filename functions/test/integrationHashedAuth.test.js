const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const Module = require('node:module')
const { MockFirestore } = require('./helpers/mockFirestore')

let db
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './firestore' && parent?.filename?.endsWith('/integrationAuth.js')) {
    return { defaultDb: db }
  }
  if (request === 'firebase-functions/v1' && parent?.filename?.endsWith('/integrationAuth.js')) {
    return { logger: { warn: () => {} } }
  }
  if (request === 'firebase-functions/params' && parent?.filename?.endsWith('/integrationAuth.js')) {
    return { defineString: () => ({ value: () => '' }) }
  }
  return originalLoad(request, parent, isMain)
}

const { getHashedIntegrationApiKeyAuthorization, isIntegrationRequestAuthorized } = require('../lib/integrationAuth.js')
Module._load = originalLoad

function req(key) {
  return {
    get: header => header.toLowerCase() === 'x-api-key' ? key : '',
    query: {},
  }
}

function hash(key) {
  return createHash('sha256').update(key).digest('hex')
}

async function run() {
  const activeKey = 'sedx_active_test_key'
  const revokedKey = 'sedx_revoked_test_key'
  db = new MockFirestore({
    'integrationApiKeys/active-key': {
      storeId: 'store-a',
      tokenHash: hash(activeKey),
      status: 'active',
    },
    'integrationApiKeys/revoked-key': {
      storeId: 'store-a',
      tokenHash: hash(revokedKey),
      status: 'revoked',
    },
    // Even if old plaintext mirrors exist, a revoked hashed record denies it.
    'stores/store-a': {
      integrationApiKey: revokedKey,
    },
  })

  assert.equal(await getHashedIntegrationApiKeyAuthorization(req(activeKey), 'store-a'), true)
  assert.equal(await isIntegrationRequestAuthorized(req(activeKey), 'store-a'), true)
  assert.equal(await isIntegrationRequestAuthorized(req(activeKey), 'store-b'), false)
  assert.equal(await getHashedIntegrationApiKeyAuthorization(req(revokedKey), 'store-a'), false)
  assert.equal(await isIntegrationRequestAuthorized(req(revokedKey), 'store-a'), false)
  assert.equal(await getHashedIntegrationApiKeyAuthorization(req('unknown'), 'store-a'), null)
  assert.equal(await isIntegrationRequestAuthorized(req('unknown'), 'store-a'), false)

  db = new MockFirestore({
    'stores/store-legacy': { integrationApiKey: 'old-plain-key' },
  })
  assert.equal(await isIntegrationRequestAuthorized(req('old-plain-key'), 'store-legacy'), true)
  assert.equal(await isIntegrationRequestAuthorized(req('old-plain-key'), 'store-other'), false)

  console.log('integration hashed key auth tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
