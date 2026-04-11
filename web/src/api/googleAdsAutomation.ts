import { auth } from '../firebase'

type CampaignGoal = 'leads' | 'sales' | 'traffic' | 'calls' | 'awareness'

export type CampaignBriefPayload = {
  goal: CampaignGoal
  location: string
  dailyBudget: number
  landingPageUrl: string
  headline: string
  description: string
}

async function getAuthHeaders() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')

  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

async function parseApiResult<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : 'Request failed'
    throw new Error(message)
  }

  return payload as T
}

export async function beginGoogleAdsOAuth(input: {
  storeId: string
  customerId?: string
  managerId?: string
  accountEmail?: string
}) {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/google/oauth-start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...input, integrations: ['ads'] }),
  })

  return parseApiResult<{ url: string }>(response)
}

export async function saveCampaignBrief(input: { storeId: string; brief: CampaignBriefPayload }) {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/google-ads/campaign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      action: 'edit',
      brief: input.brief,
    }),
  })

  return parseApiResult<{ ok: boolean; status: string }>(response)
}

export async function createOrUpdateCampaign(input: { storeId: string; brief: CampaignBriefPayload }) {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/google-ads/campaign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      action: 'create',
      brief: input.brief,
    }),
  })

  return parseApiResult<{
    ok: boolean
    status: string
    campaignCreatedInGoogleAds?: boolean
    customerId?: string
    loginCustomerId?: string
    campaignId?: string
    campaignResourceName?: string
    adGroupId?: string
    adGroupResourceName?: string
    warnings?: string[]
  }>(response)
}

export async function pauseOrResumeCampaign(input: { storeId: string; resume: boolean }) {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/google-ads/campaign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      action: input.resume ? 'resume' : 'pause',
    }),
  })

  return parseApiResult<{ ok: boolean; status: string }>(response)
}

export async function importExistingCampaign(input: { storeId: string; campaignId: string }) {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/google-ads/campaign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      action: 'import',
      campaignId: input.campaignId,
    }),
  })

  return parseApiResult<{
    ok: boolean
    status: string
    importedCampaignId: string
    importedCampaignName: string
  }>(response)
}
