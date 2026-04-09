import { randomBytes, createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'openid',
  'email',
  'profile',
]

export type CampaignGoal = 'leads' | 'sales' | 'traffic' | 'calls' | 'awareness'
export type CampaignStatus = 'draft' | 'live' | 'paused'

export type CampaignBrief = {
  goal: CampaignGoal
  location: string
  dailyBudget: number
  landingPageUrl: string
  headline: string
  description: string
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function getOAuthClientConfig() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || ''
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI?.trim() || ''

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REDIRECT_URI are required.',
    )
  }

  return { clientId, clientSecret, redirectUri }
}

export function buildOAuthStartUrl(params: { storeId: string; uid: string }): { url: string; rawState: string } {
  const { clientId, redirectUri } = getOAuthClientConfig()

  const rawState = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString('hex'),
      storeId: params.storeId,
      uid: params.uid,
      issuedAt: Date.now(),
    }),
    'utf8',
  ).toString('base64url')

  const url = new URL(GOOGLE_OAUTH_BASE)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('state', rawState)

  return { url: url.toString(), rawState }
}

export async function persistOAuthState(params: {
  uid: string
  storeId: string
  rawState: string
  customerId: string
  managerId?: string
  email?: string
}) {
  const hashedState = hashSecret(params.rawState)
  await db().collection('googleAdsOAuthStates').doc(hashedState).set({
    uid: params.uid,
    storeId: params.storeId,
    customerId: params.customerId,
    managerId: params.managerId || '',
    email: params.email || '',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  })
}

export async function consumeOAuthState(rawState: string): Promise<{
  uid: string
  storeId: string
  customerId: string
  managerId: string
  email: string
}> {
  const stateHash = hashSecret(rawState)
  const stateRef = db().collection('googleAdsOAuthStates').doc(stateHash)
  const stateSnap = await stateRef.get()
  if (!stateSnap.exists) throw new Error('invalid-state')

  const data = stateSnap.data() as Record<string, unknown>
  await stateRef.delete()

  const expiresAt = data.expiresAt
  if (!expiresAt || typeof (expiresAt as Timestamp).toMillis !== 'function') {
    throw new Error('invalid-state')
  }
  if ((expiresAt as Timestamp).toMillis() < Date.now()) {
    throw new Error('expired-state')
  }

  const uid = typeof data.uid === 'string' ? data.uid : ''
  const storeId = typeof data.storeId === 'string' ? data.storeId : ''
  const customerId = typeof data.customerId === 'string' ? data.customerId : ''
  const managerId = typeof data.managerId === 'string' ? data.managerId : ''
  const email = typeof data.email === 'string' ? data.email : ''
  if (!uid || !storeId || !customerId) throw new Error('invalid-state')

  return { uid, storeId, customerId, managerId, email }
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getOAuthClientConfig()

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = (await response.json()) as Record<string, unknown>

  if (!response.ok) {
    throw new Error(
      `token-exchange-failed:${typeof payload.error === 'string' ? payload.error : response.status}`,
    )
  }

  return payload
}

export async function storeGoogleTokens(params: {
  storeId: string
  uid: string
  email: string
  customerId: string
  managerId?: string
  tokenPayload: Record<string, unknown>
}) {
  const tokenType = typeof params.tokenPayload.token_type === 'string' ? params.tokenPayload.token_type : ''
  const accessToken = typeof params.tokenPayload.access_token === 'string' ? params.tokenPayload.access_token : ''
  const refreshToken = typeof params.tokenPayload.refresh_token === 'string' ? params.tokenPayload.refresh_token : ''
  const scope = typeof params.tokenPayload.scope === 'string' ? params.tokenPayload.scope : ''
  const expiresIn =
    typeof params.tokenPayload.expires_in === 'number'
      ? params.tokenPayload.expires_in
      : Number(params.tokenPayload.expires_in || 0)

  if (!accessToken || !tokenType) {
    throw new Error('missing-access-token')
  }

  const settingsRef = db().doc(`storeSettings/${params.storeId}`)
  await settingsRef.set(
    {
      googleAdsAutomation: {
        connection: {
          connected: true,
          accountEmail: params.email,
          customerId: params.customerId,
          managerId: params.managerId || '',
          connectedAt: FieldValue.serverTimestamp(),
          tokenScope: scope,
          tokenType,
          tokenUpdatedAt: FieldValue.serverTimestamp(),
          tokenExpiresAt: expiresIn > 0 ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null,
          oauthUserId: params.uid,
        },
      },
      integrations: {
        googleAds: {
          accessToken,
          refreshToken,
          tokenType,
          scope,
          expiresAt: expiresIn > 0 ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null,
          updatedAt: FieldValue.serverTimestamp(),
          connectedByUid: params.uid,
          connectedEmail: params.email,
          customerId: params.customerId,
          managerId: params.managerId || '',
        },
      },
    },
    { merge: true },
  )
}

export function parseCampaignBrief(raw: unknown): CampaignBrief {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  const goalRaw = source.goal
  const goal: CampaignGoal =
    goalRaw === 'sales' || goalRaw === 'traffic' || goalRaw === 'calls' || goalRaw === 'awareness'
      ? goalRaw
      : 'leads'

  const dailyBudgetRaw = typeof source.dailyBudget === 'number' ? source.dailyBudget : Number(source.dailyBudget || 0)

  return {
    goal,
    location: typeof source.location === 'string' ? source.location.trim() : '',
    dailyBudget: Number.isFinite(dailyBudgetRaw) ? Math.max(1, Math.round(dailyBudgetRaw * 100) / 100) : 1,
    landingPageUrl: typeof source.landingPageUrl === 'string' ? source.landingPageUrl.trim() : '',
    headline: typeof source.headline === 'string' ? source.headline.trim() : '',
    description: typeof source.description === 'string' ? source.description.trim() : '',
  }
}

export function requireStoreId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid-store-id')
  return raw.trim()
}

export function requireCustomerId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid-customer-id')
  return raw.trim()
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
  const { clientId, clientSecret } = getOAuthClientConfig()
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(
      `token-refresh-failed:${typeof payload.error === 'string' ? payload.error : response.status}`,
    )
  }

  return payload
}
