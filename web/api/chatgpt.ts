import type { VercelRequest, VercelResponse } from '@vercel/node'
import createService from '../server/chatgpt/chatgpt-create-service.js'
import listServices from '../server/chatgpt/chatgpt-list-services.js'
import mcp from '../server/chatgpt/chatgpt-mcp.js'
import authorize from '../server/chatgpt/chatgpt-oauth-authorize.js'
import jwks from '../server/chatgpt/chatgpt-oauth-jwks.js'
import metadata from '../server/chatgpt/chatgpt-oauth-metadata.js'
import resource from '../server/chatgpt/chatgpt-oauth-resource.js'
import token from '../server/chatgpt/chatgpt-oauth-token.js'

// Single Vercel serverless function. Public paths are rewritten here so the
// Hobby deployment stays below its 12-function limit without changing APIs.
const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'create-service': createService,
  'list-services': listServices,
  'mcp': mcp,
  'oauth-authorize': authorize,
  'oauth-jwks': jwks,
  'oauth-metadata': metadata,
  'oauth-resource': resource,
  'oauth-token': token,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.endpoint === 'openai-domain-challenge') {
    // The OpenAI submission portal requires the *exact* generated token as
    // plain text at /.well-known/openai-apps-challenge on the MCP domain.
    // Reuse this function so the Vercel Hobby function count does not grow.
    if (req.method !== 'GET') return res.status(405).end()
    const token = process.env.SEDIFEX_OPENAI_DOMAIN_CHALLENGE
    if (!token || /[\r\n]/.test(token)) return res.status(404).end()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.status(200).send(token)
  }
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : ''
  const selected = Object.prototype.hasOwnProperty.call(handlers, endpoint) ? handlers[endpoint] : undefined
  if (!selected) return res.status(404).json({ error: 'Unknown Sedifex integration endpoint' })
  return await selected(req, res)
}
