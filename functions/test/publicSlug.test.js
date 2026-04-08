const assert = require('assert')

function run() {
  const { buildPublicSlug, isReservedPublicSlug, normalizePublicSlugValue } = require('../lib/utils/publicSlug.js')

  assert.strictEqual(normalizePublicSlugValue(' Bright Mart '), 'bright-mart')

  assert.strictEqual(isReservedPublicSlug('dashboard'), true)
  assert.strictEqual(isReservedPublicSlug('promo'), true)

  assert.strictEqual(buildPublicSlug('dashboard', 'Bright Mart'), 'dashboard-store')
  assert.strictEqual(buildPublicSlug(null, 'Bright Mart'), 'bright-mart')
}

try {
  run()
  console.log('publicSlug tests passed')
} catch (error) {
  console.error(error)
  process.exit(1)
}
