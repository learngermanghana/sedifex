import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildOAuthStartUrl,
  persistOAuthState,
  requireStoreId,
} from '../_google-ads.js'
import { requireApiUser, requireStoreMembership } from '../_api-auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    const user = await requireApiUser(req)
    const storeId = requireStoreId(req.body?.storeId)
    await requireStoreMembership(user.uid, storeId)
    const customerId =
      typeof req.body?.customerId === 'string' ? req.body.customerId.trim() : ''
    const managerId =
      typeof req.body?.managerId === 'string' ? req.body.managerId.trim() : ''
    const accountEmail =
      typeof req.body?.accountEmail === 'string' ? req.body.accountEmail.trim() : ''
    const { url, rawState } = buildOAuthStartUrl({ storeId, uid: user.uid })

    await persistOAuthState({
      uid: user.uid,
      storeId,
      rawState,
      customerId,
      managerId,
      email: accountEmail || user.email,
    })

    return res.status(200).json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth-start-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (message === 'store-access-denied') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    return res.status(400).json({ error: message })
  }
}
