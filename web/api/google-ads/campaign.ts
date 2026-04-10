import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../_firebase-admin.js'
import {
  createGoogleAdsCampaign,
  fetchGoogleAdsCampaignMetrics,
  getGoogleAdsAuthContext,
  parseCampaignBrief,
  requireStoreId,
  updateGoogleAdsCampaignStatus,
} from '../_google-ads.js'
import { requireApiUser, requireStoreMembership } from '../_api-auth.js'

type CampaignAction = 'create' | 'pause' | 'resume' | 'edit'

type CampaignCreateResponse = {
  ok: boolean
  status: string
  campaignCreatedInGoogleAds: boolean
  customerId: string
  loginCustomerId: string
  campaignId: string
  campaignResourceName: string
  budgetId?: string
  adGroupId?: string
  adGroupResourceName?: string
  warnings: string[]
}

function parseAction(raw: unknown): CampaignAction {
  if (raw === 'pause' || raw === 'resume' || raw === 'edit') return raw
  return 'create'
}

function makeCampaignName(storeId: string, goal: string): string {
  return `SFX ${storeId.slice(0, 20)} ${goal.toUpperCase()} ${new Date().toISOString().slice(0, 10)}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    const user = await requireApiUser(req)

    const storeId = requireStoreId(req.body?.storeId)
    await requireStoreMembership(user.uid, storeId)
    const action = parseAction(req.body?.action)
    const settingsRef = db().doc(`storeSettings/${storeId}`)
    const snapshot = await settingsRef.get()
    const settings = (snapshot.data() ?? {}) as Record<string, any>
    const googleAdsAutomation = (settings.googleAdsAutomation ?? {}) as Record<string, any>
    const connection = (googleAdsAutomation.connection ?? {}) as Record<string, any>
    const billing = (googleAdsAutomation.billing ?? {}) as Record<string, any>
    const existingCampaign = (googleAdsAutomation.campaign ?? {}) as Record<string, any>
    const existingMetrics = (googleAdsAutomation.metrics ?? {}) as Record<string, any>

    const auth = await getGoogleAdsAuthContext(storeId)
    const normalizedConfiguredCustomer = connection.customerId ? String(connection.customerId).replace(/\D/g, '') : ''
    console.info(
      JSON.stringify({
        event: 'google_ads_campaign.auth_context',
        storeId,
        action,
        configuredCustomerId: normalizedConfiguredCustomer || null,
        resolvedCustomerId: auth.customerId,
        loginCustomerId: auth.managerId || null,
        accessibleCustomerIds: auth.accessibleCustomerIds,
      }),
    )

    if (action === 'pause' || action === 'resume') {
      if (!existingCampaign.campaignId) {
        return res.status(400).json({ error: 'No live campaign exists yet.' })
      }

      await updateGoogleAdsCampaignStatus({
        customerId: auth.customerId,
        managerId: auth.managerId,
        accessToken: auth.accessToken,
        campaignId: String(existingCampaign.campaignId),
        enabled: action === 'resume',
      })

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

    let spend = typeof existingMetrics.spend === 'number' ? existingMetrics.spend : 0
    let leads = typeof existingMetrics.leads === 'number' ? existingMetrics.leads : 0
    let cpa = leads > 0 ? Number((spend / leads).toFixed(2)) : brief.dailyBudget

    const isCreate = action === 'create'
    let campaignId = typeof existingCampaign.campaignId === 'string' ? existingCampaign.campaignId : ''
    let adGroupName = typeof existingCampaign.adGroupName === 'string' ? existingCampaign.adGroupName : ''
    let createResponse: CampaignCreateResponse | null = null

    if (isCreate) {
      const warnings: string[] = []
      if (normalizedConfiguredCustomer && normalizedConfiguredCustomer !== auth.customerId) {
        warnings.push(
          `Selected customer ID ${normalizedConfiguredCustomer} differs from authenticated customer ID ${auth.customerId}.`,
        )
      }
      if (!auth.accessibleCustomerIds.includes(auth.customerId)) {
        warnings.push(`Authenticated customer ID ${auth.customerId} is not in accessible customer list.`)
      }

      const created = await createGoogleAdsCampaign({
        customerId: auth.customerId,
        managerId: auth.managerId,
        accessToken: auth.accessToken,
        brief,
        campaignName: makeCampaignName(storeId, brief.goal),
      })
      campaignId = created.campaignId
      adGroupName = created.adGroupName
      createResponse = {
        ok: true,
        status: 'live',
        campaignCreatedInGoogleAds: true,
        customerId: auth.customerId,
        loginCustomerId: auth.managerId || '',
        campaignId: created.campaignId,
        campaignResourceName: created.campaignResourceName,
        budgetId: created.budgetId,
        adGroupId: created.adGroupId,
        adGroupResourceName: created.adGroupResourceName,
        warnings,
      }
      console.info(
        JSON.stringify({
          event: 'google_ads_campaign.create_result',
          storeId,
          customerId: auth.customerId,
          loginCustomerId: auth.managerId || null,
          budgetResourceName: created.budgetResourceName,
          budgetId: created.budgetId,
          campaignResourceName: created.campaignResourceName,
          campaignId: created.campaignId,
          adGroupResourceName: created.adGroupResourceName,
          adGroupId: created.adGroupId,
          adResourceName: created.adResourceName,
          keywordResourceName: created.keywordResourceName,
          warnings,
        }),
      )
    }

    if (action === 'edit' && campaignId) {
      const metrics = await fetchGoogleAdsCampaignMetrics({
        customerId: auth.customerId,
        managerId: auth.managerId,
        accessToken: auth.accessToken,
        campaignId,
      })
      spend = metrics.spend
      leads = metrics.leads
      cpa = metrics.cpa ?? brief.dailyBudget
    }

    await settingsRef.set(
      {
        googleAdsAutomation: {
          brief,
          campaign: {
            status: isCreate ? 'live' : existingCampaign.status || 'draft',
            campaignId,
            adGroupName,
            customerId: isCreate ? auth.customerId : existingCampaign.customerId || auth.customerId,
            loginCustomerId: isCreate ? auth.managerId || '' : existingCampaign.loginCustomerId || auth.managerId || '',
            campaignResourceName:
              isCreate && createResponse ? createResponse.campaignResourceName : existingCampaign.campaignResourceName || '',
            adGroupId: isCreate && createResponse ? createResponse.adGroupId || '' : existingCampaign.adGroupId || '',
            adGroupResourceName:
              isCreate && createResponse ? createResponse.adGroupResourceName || '' : existingCampaign.adGroupResourceName || '',
            budgetId: isCreate && createResponse ? createResponse.budgetId || '' : existingCampaign.budgetId || '',
            updatedAt: FieldValue.serverTimestamp(),
          },
          metrics: {
            spend,
            leads,
            cpa,
            syncedAt: action === 'edit' ? FieldValue.serverTimestamp() : existingMetrics.syncedAt || null,
          },
        },
      },
      { merge: true },
    )

    if (isCreate && createResponse) {
      return res.status(200).json(createResponse)
    }

    return res.status(200).json({ ok: true, status: isCreate ? 'live' : 'edited', campaignId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'campaign-update-failed'
    console.error(
      JSON.stringify({
        event: 'google_ads_campaign.create_error',
        error: message,
        storeId: typeof req.body?.storeId === 'string' ? req.body.storeId : null,
        action: typeof req.body?.action === 'string' ? req.body.action : 'create',
      }),
    )
    if (message === 'missing-auth' || message === 'invalid-auth') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (message === 'store-access-denied') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    return res.status(400).json({ error: message })
  }
}
