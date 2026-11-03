import { chatgptScopes } from '../../shared/chatgpt-scopes.js'
import { permittedSedifexCallback } from './chatgpt-oauth-client.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { db, getAdmin } from '../../api/_firebase-admin.js'
import { getAuth } from 'firebase-admin/auth'

// Private-pilot authorization-code issuer. Requires an authenticated Firebase ID token.
// The client sends its Firebase ID token in Authorization, never a password.
const origin = () => process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/, '')
const hash = (s: string) => createHash('sha256').update(s).digest('base64url')
const permitted = (uid: string) => (process.env.SEDIFEX_MCP_TEST_UIDS || '').split(',').map(x => x.trim()).includes(uid)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') query.set(key, value)
    return res.redirect(302, '/chatgpt/connect?' + query.toString())
  }
  if (req.method !== 'POST') return res.status(405).end()
  const { client_id, redirect_uri, code_challenge, code_challenge_method, scope, state, resource } = req.body || {}
  if (!origin() || !process.env.SEDIFEX_MCP_RESOURCE_URL) return res.status(503).json({error:'OAuth not configured'})
  if (!(await permittedSedifexCallback(client_id, redirect_uri)) || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge || '') || code_challenge_method !== 'S256' || typeof state !== 'string' || !state || resource !== process.env.SEDIFEX_MCP_RESOURCE_URL) return res.status(400).json({error:'invalid_request'})
  const scopes = String(scope || '').split(' ').filter(Boolean)
  if (!scopes.length || scopes.some(s => !chatgptScopes.includes(s))) return res.status(400).json({error:'invalid_scope'})
  const match = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))
  if (!match) return res.status(401).json({error:'login_required'})
  try {
    const decoded = await getAuth(getAdmin()).verifyIdToken(match[1], true)
    if (!permitted(decoded.uid)) return res.status(403).json({error:'account_not_enrolled'})
    const code = randomBytes(32).toString('base64url')
    await db().collection('chatgpt_oauth_codes').doc(hash(code)).create({uid:decoded.uid,authTime:decoded.auth_time * 1000,clientId:client_id,redirectUri:redirect_uri,challenge:code_challenge,scope:scopes.join(' '),resource,expiresAt:Date.now()+120000,createdAt:Date.now()})
    const redirect = new URL(redirect_uri)
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', state)
    redirect.searchParams.set('iss', origin()!)
    return res.status(200).json({redirect_url:redirect.toString()})
  } catch { return res.status(401).json({error:'invalid_login'}) }
}
