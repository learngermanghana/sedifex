import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, createPrivateKey, randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import { getAuth } from 'firebase-admin/auth'
import { db, getAdmin } from '../../api/_firebase-admin.js'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const challengeHash = (s: string) => createHash('sha256').update(s).digest('base64url')
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {}
  const { grant_type, code, code_verifier, client_id, redirect_uri, refresh_token, resource } = body
  const issuer = process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/, ''), audience = process.env.SEDIFEX_MCP_RESOURCE_URL
  const pem = process.env.SEDIFEX_OAUTH_PRIVATE_KEY?.replace(/\\n/g, '\n'), kid = process.env.SEDIFEX_OAUTH_KEY_ID
  if (!issuer || !audience || !pem || !kid || !process.env.SEDIFEX_OAUTH_CLIENT_ID) return res.status(503).json({ error: 'server_unavailable' })
  if (client_id !== process.env.SEDIFEX_OAUTH_CLIENT_ID || !['authorization_code', 'refresh_token'].includes(grant_type) || (resource !== undefined && resource !== audience)) return res.status(400).json({ error: 'invalid_request' })
  const refresh = randomBytes(32).toString('base64url'), refreshHash = hash(refresh)
  const firestore = db(), newSessionId = hash(randomBytes(32).toString('hex'))
  try {
    // Validate signing configuration before consuming one-time credentials.
    const signingKey = createPrivateKey(pem)
    const identity = await firestore.runTransaction(async tx => {
      let uid: string, scope: string, sid: string, authTime: number
      if (grant_type === 'authorization_code') {
        if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier) || typeof redirect_uri !== 'string') throw Error('invalid_grant')
        // Authorization codes retain their existing base64url hash key format.
        const ref = firestore.collection('chatgpt_oauth_codes').doc(challengeHash(code)), data = (await tx.get(ref)).data()
        if (!data || data.expiresAt <= Date.now() || data.clientId !== client_id || data.redirectUri !== redirect_uri || data.challenge !== challengeHash(code_verifier) || data.resource !== audience) throw Error('invalid_grant')
        uid = data.uid; scope = data.scope; sid = newSessionId; authTime = data.authTime
        const user = await getAuth(getAdmin()).getUser(uid)
        if (user.disabled || !Number.isFinite(authTime) || Date.parse(user.tokensValidAfterTime || '') > authTime) throw Error('invalid_grant')
        if (!(process.env.SEDIFEX_MCP_TEST_UIDS || '').split(',').map(s => s.trim()).includes(uid)) throw Error('invalid_grant')
        tx.delete(ref)
        tx.create(firestore.collection('chatgpt_oauth_sessions').doc(sid), { uid, scope, clientId: client_id, authTime, revoked: false, refreshHash, expiresAt: Date.now() + 30 * 86400000 })
      } else {
        if (typeof refresh_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(refresh_token)) throw Error('invalid_grant')
        const oldRef = firestore.collection('chatgpt_oauth_refresh').doc(hash(refresh_token)), old = (await tx.get(oldRef)).data()
        if (!old || old.clientId !== client_id || old.expiresAt <= Date.now()) throw Error('invalid_grant')
        const sessionRef = firestore.collection('chatgpt_oauth_sessions').doc(old.sid), session = (await tx.get(sessionRef)).data()
        if (!session || session.revoked || session.expiresAt <= Date.now() || session.refreshHash !== hash(refresh_token)) throw Error('invalid_grant')
        uid = session.uid; scope = session.scope; sid = old.sid; authTime = session.authTime
        const user = await getAuth(getAdmin()).getUser(uid)
        if (user.disabled || Date.parse(user.tokensValidAfterTime || '') > authTime || !(process.env.SEDIFEX_MCP_TEST_UIDS || '').split(',').map(s => s.trim()).includes(uid)) throw Error('invalid_grant')
        tx.delete(oldRef)
        tx.update(sessionRef, { refreshHash })
      }
      tx.create(firestore.collection('chatgpt_oauth_refresh').doc(refreshHash), { sid, clientId: client_id, expiresAt: Date.now() + 30 * 86400000 })
      return { uid, scope, sid }
    })
    const token = await new SignJWT({ scope: identity.scope, sid: identity.sid }).setProtectedHeader({ alg: 'RS256', kid }).setIssuer(issuer).setAudience(audience).setSubject(identity.uid).setIssuedAt().setExpirationTime('15m').sign(signingKey)
    return res.json({ access_token: token, refresh_token: refresh, token_type: 'Bearer', expires_in: 900, scope: identity.scope })
  } catch { return res.status(400).json({ error: 'invalid_grant' }) }
}
