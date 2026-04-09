import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../_firebase-admin.js'
import { parseCampaignBrief, requireStoreId } from '../_google-ads.js'
import { requireApiUser } from '../_api-auth.js'

type CampaignAction = 'create' | 'pause' | 'resume' | 'edit'

function parseAction(raw: unknown): CampaignAction {
  if (raw === 'pause' || raw === 'resume' || raw === 'edit') return raw
  return 'create'
}

function makeCampaignId() {
  return `SFX-${Date.now().toString().slice(-6)}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    await requireApiUser(req)

    const storeId = requireStoreId(req.body?.storeId)
    const action = parseAction(req.body?.action)
    const settingsRef = db().doc(`storeSettings/${storeId}`)
    const snapshot = await settingsRef.get()
    const settings = (snapshot.data() ?? {}) as Record<string, any>
    const googleAdsAutomation = (settings.googleAdsAutomation ?? {}) as Record<string, any>
    const connection = (googleAdsAutomation.connection ?? {}) as Record<string, any>
    const billing = (googleAdsAutomation.billing ?? {}) as Record<string, any>
    const existingCampaign = (googleAdsAutomation.campaign ?? {}) as Record<string, any>
    const existingMetrics = (googleAdsAutomation.metrics ?? {}) as Record<string, any>

    if (action === 'pause' || action === 'resume') {
      if (!existingCampaign.campaignId) {
        return res.status(400).json({ error: 'No live campaign exists yet.' })
      }

      await settingsRef.set(
        {
          googleAdsAutomation: {
            campaign: {
              ...existingCampaign,
              status: action === 'pause' ? 'paused' : 'live',
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true },
      )

      return res.status(200).json({ ok: true, status: action === 'pause' ? 'paused' : 'live' })
    }

    const brief = parseCampaignBrief(req.body?.brief)
    if (!brief.location || !brief.landingPageUrl || !brief.headline || !brief.description) {
      return res.status(400).json({ error: 'Complete all campaign brief fields before launch.' })
    }
    if (action === 'create' && connection.connected !== true) {
      return res.status(400).json({ error: 'Connect Google Ads first.' })
    }
    if (action === 'create' && billing.confirmed !== true) {
      return res.status(400).json({ error: 'Confirm billing ownership first.' })
    }

    const spend = typeof existingMetrics.spend === 'number' ? existingMetrics.spend : 0
    const leads = typeof existingMetrics.leads === 'number' ? existingMetrics.leads : 0

    const isCreate = action === 'create'

    await settingsRef.set(
      {
        googleAdsAutomation: {
          brief,
          campaign: {
            status: isCreate ? 'live' : existingCampaign.status || 'draft',
            campaignId: existingCampaign.campaignId || (isCreate ? makeCampaignId() : ''),
            adGroupName:
              existingCampaign.adGroupName || (isCreate ? `${brief.goal.toUpperCase()}-Primary` : ''),
            updatedAt: FieldValue.serverTimestamp(),
          },
          metrics: {
            spend,
            leads,
            cpa: leads > 0 ? Number((spend / leads).toFixed(2)) : brief.dailyBudget,
          },
        },
      },
      { merge: true },
    )

    return res.status(200).json({ ok: true, status: isCreate ? 'live' : 'edited' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'campaign-update-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    return res.status(400).json({ error: message })
  }
}
