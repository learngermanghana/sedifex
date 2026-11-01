import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

// Configure a trusted OAuth 2.1/OIDC issuer with a JWT JWKS endpoint.
// No configuration means all account-specific tools fail closed.
const issuer = process.env.SEDIFEX_MCP_OAUTH_ISSUER?.replace(/\/$/, '')
const audience = process.env.SEDIFEX_MCP_RESOURCE_URL?.replace(/\/$/, '')
const jwksUrl = process.env.SEDIFEX_MCP_JWKS_URL
const keys = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null

function result(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}
function error(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}
const tools = [
  { name: 'list_services', description: 'List services owned by the connected Sedifex merchant.', inputSchema: { type: 'object', properties: { storeId: { type: 'string' } }, required: ['storeId'], additionalProperties: false }, securitySchemes: [{ type: 'oauth2', scopes: ['services:read'] }] },
  { name: 'create_service', description: 'Create an unpublished service in the connected Sedifex merchant account. Ask for user confirmation before invoking.', inputSchema: { type: 'object', properties: { storeId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' }, currency: { type: 'string', enum: ['GHS', 'USD'] }, durationMinutes: { type: 'integer' } }, required: ['storeId', 'name', 'price', 'durationMinutes'], additionalProperties: false }, securitySchemes: [{ type: 'oauth2', scopes: ['services:write'] }] },
]
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | undefined
  if (!body || body.jsonrpc !== '2.0') return res.status(400).json(error(null, -32600, 'Invalid request'))
  if (body.method === 'initialize') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sedifex', version: '0.1.0' } } })
  if (body.method === 'notifications/initialized') return res.status(202).end()
  if (body.method === 'ping') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: {} })
  if (body.method === 'tools/list') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { tools } })
  if (body.method !== 'tools/call') return res.status(400).json(error(body.id, -32601, 'Unknown method'))
  if (!issuer || !audience || !keys) return res.status(503).json(error(body.id, -32000, 'OAuth provider not configured'))
  const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ''))
  const challenge = 'Bearer resource_metadata="' + audience + '/.well-known/oauth-protected-resource"'
  if (!bearer) {
    res.setHeader('WWW-Authenticate', challenge)
    return res.status(401).json(error(body.id, -32001, 'Authentication required'))
  }
  try {
    const { payload } = await jwtVerify(bearer[1], keys, { issuer, audience, algorithms: ['RS256', 'ES256'] })
    const tool = body.params?.name
    const scope = tool === 'create_service' ? 'services:write' : 'services:read'
    const granted = typeof payload.scope === 'string' ? payload.scope.split(' ') : []
    if (!granted.includes(scope) || typeof payload.sub !== 'string') return res.status(403).json(error(body.id, -32003, 'Insufficient permissions'))
    if (!tools.some(t => t.name === tool)) return res.json(error(body.id, -32602, 'Unknown tool'))
    const args = body.params?.arguments ?? {}
    const storeId = typeof args.storeId === 'string' ? args.storeId.trim() : ''
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storeId)) return res.json(error(body.id, -32602, 'Invalid store'))
    const firestore = db()
    const store = await firestore.collection('stores').doc(storeId).get()
    if (!store.exists) return res.json(error(body.id, -32602, 'Store not found'))
    const owner = store.data() ?? {}
    // OAuth subject MUST be the verified Sedifex Firebase UID, not an email.
    const uid = payload.sub
    if (owner.ownerUid !== uid && owner.ownerId !== uid && storeId !== uid) return res.status(403).json(error(body.id, -32003, 'Store owner required'))
    if (tool === 'list_services') {
      const snapshot = await firestore.collection('products').where('storeId', '==', storeId).limit(250).get()
      const services = snapshot.docs.filter(d => d.data().itemType === 'service' || d.data().type === 'SERVICE').map(d => ({ id: d.id, name: d.data().name, price: d.data().price, currency: d.data().currency, durationMinutes: d.data().durationMinutes, isPublished: d.data().isPublished === true }))
      return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: result({ services }) })
    }
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    const description = typeof args.description === 'string' ? args.description.trim() : ''
    const price = args.price
    const duration = args.durationMinutes
    if (!name || name.length > 120 || description.length > 2000 || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000000 || typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 10080 || (args.currency !== undefined && args.currency !== 'GHS' && args.currency !== 'USD')) return res.json(error(body.id, -32602, 'Invalid service details'))
    const ref = firestore.collection('products').doc()
    await ref.create({ storeId, name, description, price, currency: args.currency || 'GHS', durationMinutes: duration, itemType: 'service', type: 'SERVICE', category: 'General Services', isPublished: false, isWebsiteVisible: false, stockCount: null, source: 'chatgpt-mcp', createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: result({ ok: true, serviceId: ref.id, name, published: false }) })
  } catch {
    res.setHeader('WWW-Authenticate', challenge)
    return res.status(401).json(error(body.id, -32001, 'Authentication failed'))
  }
}
