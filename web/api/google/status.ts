import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_firebase-admin.js'
import { requireApiUser, requireStoreMembership } from '../_api-auth.js'
import { GOOGLE_REQUIRED_SCOPE, hasScope, parseGrantedScopes } from '../_google-oauth.js'

function requireStoreId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid-store-id')
  return raw.trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })

  try {
    const user = await requireApiUser(req)
    const storeId = requireStoreId(req.body?.storeId)
    await requireStoreMembership(user.uid, storeId)

    const snap = await db().doc(`storeSettings/${storeId}`).get()
    const data = (snap.data() ?? {}) as Record<string, any>
    const oauth = (data.integrations?.googleOAuth ?? {}) as Record<string, unknown>
    const granted = parseGrantedScopes(oauth.scope)

    const adsTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim())

    return res.status(200).json({
      business: hasScope(granted, GOOGLE_REQUIRED_SCOPE.business) ? 'Connected' : 'Needs permission',
      ads: hasScope(granted, GOOGLE_REQUIRED_SCOPE.ads)
        ? adsTokenConfigured
          ? 'Connected'
          : 'Developer token required'
        : 'Needs permission',
      merchant: hasScope(granted, GOOGLE_REQUIRED_SCOPE.merchant) ? 'Connected' : 'Needs permission',
      grantedScopes: Array.from(granted),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'status-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') return res.status(401).json({ error: 'Unauthorized' })
    if (message === 'store-access-denied') return res.status(403).json({ error: 'Forbidden' })
    return res.status(400).json({ error: message })
  }
}
