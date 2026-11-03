import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

test('hashed assets are served locally after the first request; APIs bypass caching', async () => {
  const listeners = {}
  const entries = new Map()
  let requests = 0
  const response = { status: 200, type: 'basic', clone() { return this } }
  const ctx = vm.createContext({
    self: { location: new URL('https://sedifex.example/sw.js'), addEventListener: (name, fn) => { listeners[name] = fn } },
    URL, console,
    fetch: async () => { requests++; return response },
    caches: { open: async () => ({ match: async req => entries.get(req.url), put: async (req, res) => entries.set(req.url, res) }) },
  })
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), ctx)
  const request = { method: 'GET', url: 'https://sedifex.example/assets/index-abc.js' }
  for (let i = 0; i < 2; i++) {
    let pending
    listeners.fetch({ request, respondWith: promise => { pending = promise } })
    assert.equal(await pending, response)
  }
  assert.equal(requests, 1)
  listeners.fetch({ request: { ...request, url: 'https://sedifex.example/api/public-blog?storeId=1' }, respondWith() { assert.fail('API must bypass service worker caching') } })
})
