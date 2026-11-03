import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getAuth } from 'firebase-admin/auth'
import { db, getAdmin } from '../../api/_firebase-admin.js'
import { executeTool, requiredScope, ToolError, tools } from './chatgpt-tools.js'

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
function trustedKeys(url: string) {
  if (!keySets.has(url)) keySets.set(url, createRemoteJWKSet(new URL(url)))
  return keySets.get(url)!
}
const error = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | undefined
  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0') return res.status(400).json(error(null, -32600, 'Invalid request'))
  if (body.method === 'initialize') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sedifex', version: '0.2.0' } } })
  if (body.method === 'notifications/initialized') return res.status(202).end()
  if (body.method === 'ping') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: {} })
  if (body.method === 'tools/list') return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { tools } })
  if (body.method !== 'tools/call') return res.status(400).json(error(body.id, -32601, 'Unknown method'))
  const name = body.params?.name || '', security = requiredScope(name)
  if (!security) return res.json(error(body.id, -32602, 'Unknown tool'))
  const args = body.params?.arguments ?? {}
  const definition = tools.find(t => t.name === name)!
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !Object.prototype.hasOwnProperty.call(definition.inputSchema.properties, k)) || definition.inputSchema.required.some(k => !(k in args))) return res.json(error(body.id, -32602, 'Invalid tool arguments'))
  for (const [key, value] of Object.entries(args)) {
    const schema = definition.inputSchema.properties[key] as { type?: string; enum?: unknown[]; minimum?: number; maximum?: number }
    if ((schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) || (schema.enum && !schema.enum.includes(value)) || (typeof value === 'number' && (!Number.isFinite(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)))) return res.json(error(body.id, -32602, 'Invalid tool argument: ' + key))
  }
  let uid: string | undefined
  try {
    const firestore = db()
    if (security.type === 'oauth2') {
      const issuer = process.env.SEDIFEX_MCP_OAUTH_ISSUER?.replace(/\/$/, ''), audience = process.env.SEDIFEX_MCP_RESOURCE_URL?.replace(/\/$/, ''), jwks = process.env.SEDIFEX_MCP_JWKS_URL
      if (!issuer || !audience || !jwks) return res.status(503).json(error(body.id, -32000, 'OAuth provider not configured'))
      const challenge = 'Bearer resource_metadata="' + new URL('/.well-known/oauth-protected-resource', audience).toString() + '"'
      const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ''))
      try {
        if (!bearer) throw Error('login_required')
        const { payload } = await jwtVerify(bearer[1], trustedKeys(jwks), { issuer, audience, algorithms: ['RS256', 'ES256'] })
        if (typeof payload.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.sub)) throw Error('invalid_subject')
        uid = payload.sub
        if (issuer === process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/, '')) {
          if (typeof payload.sid !== 'string' || !/^[a-f0-9]{64}$/.test(payload.sid)) throw Error('invalid_session')
          const session = (await firestore.collection('chatgpt_oauth_sessions').doc(payload.sid).get()).data()
          const user = await getAuth(getAdmin()).getUser(uid)
          if (!session || session.uid !== uid || session.revoked || session.expiresAt <= Date.now() || user.disabled || Date.parse(user.tokensValidAfterTime || '') > session.authTime) throw Error('revoked_session')
        }
        const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : []
        if (security.scopes?.some(scope => !scopes.includes(scope))) return res.status(403).json(error(body.id, -32003, 'Insufficient permissions; reconnect with the required scope'))
      } catch {
        res.setHeader('WWW-Authenticate', challenge)
        return res.status(401).json(error(body.id, -32001, 'Connect Sedifex again; access token missing, expired or revoked'))
      }
      // Shared per-account limit across tools and serverless instances.
      const window = Math.floor(Date.now() / 60000), ref = firestore.collection('chatgpt_rate_limits').doc(uid! + '_' + window)
      const permitted = await firestore.runTransaction(async tx => {
        const data = (await tx.get(ref)).data(), count = data?.count || 0
        if (count >= 60) return false
        tx.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * 60000) })
        return true
      })
      if (!permitted) { res.setHeader('Retry-After', '60'); return res.status(429).json(error(body.id, -32029, 'Too many requests; try again in a minute')) }
    }
    const value = await executeTool(firestore, name, args, uid)
    return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value } })
  } catch (e) {
    if (e instanceof ToolError) return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { isError: true, content: [{ type: 'text', text: e.message }] } })
    return res.status(503).json(error(body.id, -32000, 'Tool temporarily unavailable'))
  }
}
