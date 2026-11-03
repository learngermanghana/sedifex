import { chatgptScopes } from '../../shared/chatgpt-scopes.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Discovery for a separately configured OAuth authorization server.
// This endpoint does not issue tokens or create user sessions.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const resource = process.env.SEDIFEX_MCP_RESOURCE_URL?.replace(/\/$/, '')
  const issuer = process.env.SEDIFEX_MCP_OAUTH_ISSUER?.replace(/\/$/, '')
  if (!resource || !issuer || !resource.startsWith('https://') || !issuer.startsWith('https://')) {
    return res.status(503).json({ error: 'OAuth provider not configured' })
  }
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res.json({
    resource,
    authorization_servers: [issuer],
    scopes_supported: chatgptScopes,
  })
}
