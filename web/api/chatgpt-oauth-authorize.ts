import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { db, getAdmin } from './_firebase-admin.js'

// Private-pilot authorization-code issuer. Requires an authenticated Firebase ID token.
// The client sends its Firebase ID token in Authorization, never a password.
const origin = () => process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/, '')
const hash = (s: string) => createHash('sha256').update(s).digest('base64url')
const permitted = (uid: string) => (process.env.SEDIFEX_MCP_TEST_UIDS || '').split(',').map(x => x.trim()).includes(uid)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const { client_id, redirect_uri, code_challenge, code_challenge_method, scope, state, resource } = req.body || {}
  if (!origin() || !process.env.SEDIFEX_OAUTH_CLIENT_ID || !process.env.SEDIFEX_MCP_RESOURCE_URL) return res.status(503).json({error:'OAuth not configured'})
  if (client_id !== process.env.SEDIFEX_OAUTH_CLIENT_ID || typeof redirect_uri !== 'string' || !redirect_uri.startsWith('https://chatgpt.com/connector/oauth/') || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge || '') || code_challenge_method !== 'S256' || typeof state !== 'string' || !state || resource !== process.env.SEDIFEX_MCP_RESOURCE_URL) return res.status(400).json({error:'invalid_request'})
  const scopes = String(scope || '').split(' ').filter(Boolean)
  if (!scopes.length || scopes.some(s => !['services:read','services:write'].includes(s))) return res.status(400).json({error:'invalid_scope'})
  const match = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))
  if (!match) return res.status(401).json({error:'login_required'})
  try {
    const decoded = await getAdmin().auth().verifyIdToken(match[1], true)
    if (!permitted(decoded.uid)) return res.status(403).json({error:'account_not_enrolled'})
    const code = randomBytes(32).toString('base64url')
    await db().collection('chatgpt_oauth_codes').doc(hash(code)).create({uid:decoded.uid,clientId:client_id,redirectUri:redirect_uri,challenge:code_challenge,scope:scopes.join(' '),resource,expiresAt:Date.now()+120000,createdAt:Date.now()})
    return res.status(200).json({redirect_url:redirect_uri+'?code='+encodeURIComponent(code)+'&state='+encodeURIComponent(state)})
  } catch { return res.status(401).json({error:'invalid_login'}) }
}
