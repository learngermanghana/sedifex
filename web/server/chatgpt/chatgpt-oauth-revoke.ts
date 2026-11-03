import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'node:crypto'
import { db } from '../../api/_firebase-admin.js'
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {}
  if (!process.env.SEDIFEX_OAUTH_CLIENT_ID || body.client_id !== process.env.SEDIFEX_OAUTH_CLIENT_ID || typeof body.token !== 'string') return res.status(400).json({ error: 'invalid_request' })
  try {
    const firestore = db(), ref = firestore.collection('chatgpt_oauth_refresh').doc(createHash('sha256').update(body.token).digest('hex'))
    await firestore.runTransaction(async tx => {
      const token = (await tx.get(ref)).data()
      if (token?.clientId === body.client_id) {
        tx.update(firestore.collection('chatgpt_oauth_sessions').doc(token.sid), { revoked: true })
        tx.delete(ref)
      }
    })
    return res.status(200).end()
  } catch { return res.status(503).json({ error: 'server_unavailable' }) }
}
