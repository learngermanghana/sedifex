import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { generateKeyPairSync, createHash } from 'node:crypto'
import { jwtVerify } from 'jose'
import { memoryDb } from './memory-db'
const mock = vi.hoisted(() => ({ db: undefined as any, user: { uid: 'customer', disabled: false, tokensValidAfterTime: '2020-01-01T00:00:00Z' } }))
vi.mock('../../../api/_firebase-admin.js', () => ({ db: () => mock.db, getAdmin: () => ({}) }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: async () => mock.user, verifyIdToken: async () => ({ uid: 'customer', auth_time: Math.floor(Date.now() / 1000) }) }) }))
// Use real JWT signing and verification, but avoid external JWKS network calls.
vi.mock('jose', async importOriginal => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, createRemoteJWKSet: () => async () => publicKey }
})
import authorize from '../chatgpt-oauth-authorize'
import token from '../chatgpt-oauth-token'
import revoke from '../chatgpt-oauth-revoke'
import mcp from '../chatgpt-mcp'
import metadata from '../chatgpt-oauth-metadata'
import { clearSedifexClientMetadataCacheForTests } from '../chatgpt-oauth-client'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const issuer = 'https://sedifex.example', resource = issuer + '/api/chatgpt-mcp'
function response() {
  const r: any = { statusCode: 200, headers: {}, body: undefined, setHeader: (k: string, v: string) => { r.headers[k] = v }, status: (n: number) => { r.statusCode = n; return r }, json: (body: any) => { r.body = body; return r }, end: () => r, redirect: (code: number, url: string) => { r.statusCode = code; r.body = url; return r } }
  return r
}
async function call(handler: any, body: any, authorization?: string) {
  const res = response(); await handler({ method: 'POST', body, headers: { authorization }, query: {} }, res); return res
}
const sha = (s: string) => createHash('sha256').update(s).digest('base64url')
const verifier = 'a'.repeat(43)
async function connect(scope = 'bookings:read bookings:write') {
  const authorization = await call(authorize, { client_id: 'client', redirect_uri: 'https://chatgpt.example/callback?existing=1', code_challenge: sha(verifier), code_challenge_method: 'S256', scope, state: 'state', resource }, 'Bearer firebase-token')
  expect(authorization.statusCode).toBe(200)
  const url = new URL(authorization.body.redirect_url)
  expect(url.searchParams.get('existing')).toBe('1')
  const body = { grant_type: 'authorization_code', code: url.searchParams.get('code'), code_verifier: verifier, client_id: 'client', redirect_uri: 'https://chatgpt.example/callback?existing=1', resource }
  const result = await call(token, body)
  return { result, body }
}
beforeEach(() => {
  mock.db = memoryDb().db; mock.user.disabled = false
  for (const [k, v] of Object.entries({ SEDIFEX_OAUTH_ISSUER: issuer, SEDIFEX_MCP_OAUTH_ISSUER: issuer, SEDIFEX_MCP_RESOURCE_URL: resource, SEDIFEX_MCP_JWKS_URL: issuer + '/jwks', SEDIFEX_OAUTH_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), SEDIFEX_OAUTH_KEY_ID: 'test', SEDIFEX_OAUTH_CLIENT_ID: 'client', SEDIFEX_OAUTH_REDIRECT_URI: 'https://chatgpt.example/callback?existing=1', SEDIFEX_MCP_TEST_UIDS: 'customer' })) vi.stubEnv(k, v)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  clearSedifexClientMetadataCacheForTests()
})
describe('OAuth and MCP authorization', () => {
  it('advertises ChatGPT CIMD and issuer-bound OAuth callbacks', async () => {
    const r = response()
    metadata({ method: 'GET' } as any, r)
    expect(r.body.client_id_metadata_document_supported).toBe(true)
    expect(r.body.authorization_response_iss_parameter_supported).toBe(true)
    expect(r.body.token_endpoint_auth_methods_supported).toContain('none')
  })
  it('authorizes verified stable ChatGPT CIMD client with PKCE, issuer and token exchange', async () => {
    const clientId = 'https://chatgpt.com/oauth/client.json'
    const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
    const fetchMetadata = vi.fn(async () => ({
      ok: true, text: async () => JSON.stringify({
        client_id: clientId, redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
        token_endpoint_auth_method: 'private_key_jwt',
      }),
    }))
    vi.stubGlobal('fetch', fetchMetadata)
    vi.stubEnv('SEDIFEX_OAUTH_CLIENT_ID', '')
    const body = { response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
      code_challenge: sha(verifier), code_challenge_method: 'S256',
      scope: 'stores:read services:read', state: 'state-1', resource }
    const granted = await call(authorize, body, 'Bearer firebase-token')
    expect(granted.statusCode).toBe(200)
    const destination = new URL(granted.body.redirect_url)
    expect(destination.origin + destination.pathname).toBe(redirectUri)
    expect(destination.searchParams.get('iss')).toBe(issuer)
    expect(destination.searchParams.get('state')).toBe('state-1')
    expect(fetchMetadata).toHaveBeenCalledTimes(1)
    const exchange = await call(token, { grant_type: 'authorization_code',
      code: destination.searchParams.get('code'), client_id: clientId,
      redirect_uri: redirectUri, code_verifier: verifier, resource })
    expect(exchange.statusCode).toBe(200)
    const { payload } = await jwtVerify(exchange.body.access_token, publicKey, { issuer, audience: resource })
    expect(payload.sub).toBe('customer')
    expect(payload.scope).toBe('stores:read services:read')
    const refreshed = await call(token, { grant_type: 'refresh_token',
      client_id: clientId, refresh_token: exchange.body.refresh_token, resource })
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.body.refresh_token).not.toBe(exchange.body.refresh_token)
    expect((await call(revoke, { client_id: clientId, token: refreshed.body.refresh_token })).statusCode).toBe(200)
    expect((await call(token, { grant_type: 'refresh_token',
      client_id: clientId, refresh_token: refreshed.body.refresh_token, resource })).statusCode).toBe(400)
  })
  it('supports callback-ID-specific CIMD when ChatGPT publishes a matching verified document', async () => {
    const clientId = 'https://chatgpt.com/oauth/testcallbackid2026/client.json'
    const redirectUri = 'https://chatgpt.com/connector/oauth/testcallbackid2026'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true,
      text: async () => JSON.stringify({ client_id: clientId, redirect_uris: [redirectUri],
        grant_types: ['authorization_code'], response_types: ['code'],
        token_endpoint_auth_methods_supported: ['none'] }) })))
    const granted = await call(authorize, { client_id: clientId, redirect_uri: redirectUri,
      code_challenge: sha(verifier), code_challenge_method: 'S256',
      scope: 'bookings:read', state: 'state', resource }, 'Bearer firebase')
    expect(granted.statusCode).toBe(200)
    expect(new URL(granted.body.redirect_url).searchParams.get('iss')).toBe(issuer)
  })
  it('rejects unverified CIMD metadata, spoofed clients, redirect substitution and resource mismatch', async () => {
    const clientId = 'https://chatgpt.com/oauth/client.json'
    const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
    const candidate = { client_id: clientId, redirect_uri: redirectUri,
      code_challenge: sha(verifier), code_challenge_method: 'S256',
      scope: 'stores:read', state: 'state', resource }
    const fetchMetadata = vi.fn(async () => ({ ok: true,
      text: async () => JSON.stringify({ client_id: 'https://attacker.example/oauth',
        redirect_uris: [redirectUri], grant_types: ['authorization_code'], response_types: ['code'],
        token_endpoint_auth_methods_supported: ['none'] }) }))
    vi.stubGlobal('fetch', fetchMetadata)
    expect((await call(authorize, candidate, 'Bearer firebase')).statusCode).toBe(400)
    expect((await call(authorize, { ...candidate,
      client_id: 'https://attacker.example/oauth/client.json' }, 'Bearer firebase')).statusCode).toBe(400)
    expect((await call(authorize, { ...candidate,
      redirect_uri: 'https://attacker.example/oauth' }, 'Bearer firebase')).statusCode).toBe(400)
    expect((await call(authorize, { ...candidate,
      resource: 'https://attacker.example/mcp' }, 'Bearer firebase')).statusCode).toBe(400)
    expect(fetchMetadata).toHaveBeenCalledTimes(1)
  })
  it('exchanges one-time PKCE codes for scoped tokens and rotates refresh tokens', async () => {
    const { result, body } = await connect()
    expect(result.statusCode).toBe(200)
    const { payload } = await jwtVerify(result.body.access_token, publicKey, { issuer, audience: resource })
    expect(payload.sub).toBe('customer'); expect(payload.scope).toBe('bookings:read bookings:write')
    expect((await call(token, body)).statusCode).toBe(400)
    const refreshBody = { grant_type: 'refresh_token', refresh_token: result.body.refresh_token, client_id: 'client', resource }
    const refreshed = await call(token, refreshBody)
    expect(refreshed.statusCode).toBe(200); expect(refreshed.body.refresh_token).not.toBe(result.body.refresh_token)
    expect((await call(token, refreshBody)).statusCode).toBe(400)
  })
  it('rejects incorrect PKCE and never grants undeclared scopes', async () => {
    const authorization = await call(authorize, { client_id: 'client', redirect_uri: process.env.SEDIFEX_OAUTH_REDIRECT_URI, code_challenge: sha(verifier), code_challenge_method: 'S256', scope: 'bookings:read', state: 'state', resource }, 'Bearer firebase')
    const code = new URL(authorization.body.redirect_url).searchParams.get('code')
    const body = { grant_type: 'authorization_code', client_id: 'client', redirect_uri: process.env.SEDIFEX_OAUTH_REDIRECT_URI, code, code_verifier: 'b'.repeat(43), resource }
    expect((await call(token, body)).statusCode).toBe(400)
    expect((await call(token, { ...body, code_verifier: verifier })).statusCode).toBe(200)
    expect((await call(authorize, { client_id: 'client', redirect_uri: process.env.SEDIFEX_OAUTH_REDIRECT_URI, code_challenge: sha(verifier), code_challenge_method: 'S256', scope: 'admin:all', state: 'state', resource }, 'Bearer firebase')).body.error).toBe('invalid_scope')
  })
  it('enforces missing authentication, scope, allowlist, disabled users and revocation', async () => {
    const { result } = await connect()
    const read = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_my_bookings', arguments: { storeId: 'shop' } } }
    expect((await call(mcp, read)).statusCode).toBe(401)
    expect((await call(mcp, read, 'Bearer ' + result.body.access_token)).body.result.structuredContent.bookings).toEqual([])
    const blogRead = { ...read, params: { name: 'list_blog_posts', arguments: { storeId: 'shop' } } }
    expect((await call(mcp, blogRead, 'Bearer ' + result.body.access_token)).statusCode).toBe(403)
    mock.user.disabled = true
    expect((await call(mcp, read, 'Bearer ' + result.body.access_token)).statusCode).toBe(401)
    mock.user.disabled = false
    vi.stubEnv('SEDIFEX_MCP_TEST_UIDS', '')
    expect((await call(mcp, read, 'Bearer ' + result.body.access_token)).statusCode).toBe(403)
    vi.stubEnv('SEDIFEX_MCP_TEST_UIDS', 'customer')
    expect((await call(revoke, { client_id: 'client', token: result.body.refresh_token })).statusCode).toBe(200)
    expect((await call(mcp, read, 'Bearer ' + result.body.access_token)).statusCode).toBe(401)
    expect((await call(token, { grant_type: 'refresh_token', refresh_token: result.body.refresh_token, client_id: 'client' })).statusCode).toBe(400)
  })
  it('limits authenticated tool traffic across requests', async () => {
    const { result } = await connect('bookings:read')
    const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_my_bookings', arguments: { storeId: 'shop' } } }
    for (let i = 0; i < 60; i++) expect((await call(mcp, request, 'Bearer ' + result.body.access_token)).statusCode).toBe(200)
    expect((await call(mcp, request, 'Bearer ' + result.body.access_token)).statusCode).toBe(429)
  })
  it('lists tools and public services without exposing account data', async () => {
    expect((await call(mcp, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).body.result.tools).toHaveLength(13)
    expect((await call(mcp, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_services', arguments: {} } })).body.result.structuredContent.services).toEqual([])
    expect((await call(mcp, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_services', arguments: { maliciousExtra: true } } })).body.error.code).toBe(-32602)
  })
})
