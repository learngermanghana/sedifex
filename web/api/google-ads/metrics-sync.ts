import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../_firebase-admin.js'
import { refreshGoogleAccessToken } from '../_google-ads.js'

type GoogleAdsIntegrationDoc = {
  refreshToken?: string
  accessToken?: string
  tokenType?: string
  expiresAt?: { toMillis?: () => number } | null
}

function isExpired(expiresAt: GoogleAdsIntegrationDoc['expiresAt']): boolean {
  if (!expiresAt || typeof expiresAt.toMillis !== 'function') return true
  return expiresAt.toMillis() <= Date.now() + 15_000
}

function requireCronSecret(req: VercelRequest) {
  const expected = process.env.GOOGLE_ADS_SYNC_SECRET?.trim() || ''
  if (!expected) throw new Error('GOOGLE_ADS_SYNC_SECRET not set')

  const incoming =
    (typeof req.headers['x-google-ads-sync-secret'] === 'string' && req.headers['x-google-ads-sync-secret']) ||
    (typeof req.query.secret === 'string' && req.query.secret) ||
    ''

  if (incoming !== expected) throw new Error('unauthorized')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    requireCronSecret(req)

    const settingsSnaps = await db()
      .collection('storeSettings')
      .where('googleAdsAutomation.connection.connected', '==', true)
      .get()

    let scanned = 0
    let updated = 0

    for (const docSnap of settingsSnaps.docs) {
      scanned += 1

      const storeId = docSnap.id
      const integrationRef = db().doc(`storeSettings/${storeId}`)
      const integrationSnap = await integrationRef.get()
      const integrationData = integrationSnap.data() as Record<string, any> | undefined
      const googleAds = (integrationData?.integrations?.googleAds ?? {}) as GoogleAdsIntegrationDoc
      const refreshToken = typeof googleAds.refreshToken === 'string' ? googleAds.refreshToken : ''

      if (!refreshToken) continue

      let accessToken = typeof googleAds.accessToken === 'string' ? googleAds.accessToken : ''
      let expiresAt = googleAds.expiresAt

      if (!accessToken || isExpired(expiresAt)) {
        const refreshed = await refreshGoogleAccessToken(refreshToken)
        accessToken = typeof refreshed.access_token === 'string' ? refreshed.access_token : accessToken
        const expiresIn =
          typeof refreshed.expires_in === 'number' ? refreshed.expires_in : Number(refreshed.expires_in || 0)

        await integrationRef.set(
          {
            integrations: {
              googleAds: {
                accessToken,
                tokenType: typeof refreshed.token_type === 'string' ? refreshed.token_type : 'Bearer',
                expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
                updatedAt: FieldValue.serverTimestamp(),
              },
            },
          },
          { merge: true },
        )
      }

      // Placeholder while Google Ads reporting pull is integrated.
      // We still record job heartbeat and preserve existing metric values.
      await integrationRef.set(
        {
          googleAdsAutomation: {
            metrics: {
              syncedAt: FieldValue.serverTimestamp(),
            },
            jobs: {
              metricsSync: {
                lastRunAt: FieldValue.serverTimestamp(),
                status: 'ok',
              },
            },
          },
        },
        { merge: true },
      )

      updated += 1
    }

    return res.status(200).json({ ok: true, scanned, updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'metrics-sync-failed'
    const code = message === 'unauthorized' ? 401 : 400
    return res.status(code).json({ error: message })
  }
}
