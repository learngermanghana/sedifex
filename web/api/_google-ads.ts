import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto'
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

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com'
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || 'v18'

function canonicalizeSedifexUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname === 'sedifex.com') parsed.hostname = 'www.sedifex.com'
    return parsed.toString()
  } catch {
    return trimmed
  }
}

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

type GoogleAdsSecretsCipher = {
  keyVersion: string
  iv: string
  authTag: string
  cipherText: string
}

type GoogleAdsIntegrationDoc = {
  refreshToken?: string
  accessToken?: string
  tokenType?: string
  scope?: string
  expiresAt?: Timestamp | { toMillis?: () => number } | null
  secrets?: {
    refreshTokenCipher?: GoogleAdsSecretsCipher
    accessTokenCipher?: GoogleAdsSecretsCipher
  }
  customerId?: string
  managerId?: string
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getEncryptionKey(): { key: Buffer; keyVersion: string } {
  const raw = process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY?.trim() || ''
  if (!raw) {
    throw new Error('GOOGLE_ADS_TOKEN_ENCRYPTION_KEY is required')
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('GOOGLE_ADS_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64)')
  }

  return {
    key,
    keyVersion: process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY_VERSION?.trim() || 'v1',
  }
}

function encryptToken(value: string): GoogleAdsSecretsCipher {
  const { key, keyVersion } = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    keyVersion,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    cipherText: encrypted.toString('base64'),
  }
}

function decryptToken(payload: GoogleAdsSecretsCipher | undefined): string {
  if (!payload) return ''
  const { key } = getEncryptionKey()

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function getOAuthClientConfig() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || ''
  const redirectUri = canonicalizeSedifexUrl(process.env.GOOGLE_ADS_REDIRECT_URI?.trim() || '')

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
  customerId?: string
  managerId?: string
  email?: string
}) {
  const hashedState = hashSecret(params.rawState)
  await db().collection('googleAdsOAuthStates').doc(hashedState).set({
    uid: params.uid,
    storeId: params.storeId,
    customerId: params.customerId || '',
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
  if (!uid || !storeId) throw new Error('invalid-state')

  return { uid, storeId, customerId, managerId, email }
}

export async function discoverGoogleAdsCustomerId(params: {
  accessToken: string
  managerId?: string
}): Promise<string> {
  const url = `${GOOGLE_ADS_API_BASE}/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`
  const response = await fetch(url, {
    method: 'GET',
    headers: googleAdsHeaders({
      accessToken: params.accessToken,
      managerId: params.managerId || '',
    }),
  })

  if (!response.ok) return ''

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  const names = Array.isArray(payload.resourceNames) ? payload.resourceNames : []
  const first = typeof names[0] === 'string' ? names[0] : ''
  if (!first) return ''

  const parts = first.split('/')
  const candidate = parts[parts.length - 1] || ''
  return candidate.trim()
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

function parseTokenExpiry(payload: Record<string, unknown>): Timestamp | null {
  const expiresIn =
    typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in || 0)

  return expiresIn > 0 ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null
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
          tokenExpiresAt: parseTokenExpiry(params.tokenPayload),
          oauthUserId: params.uid,
        },
      },
      integrations: {
        googleAds: {
          secrets: {
            accessTokenCipher: encryptToken(accessToken),
            refreshTokenCipher: refreshToken ? encryptToken(refreshToken) : FieldValue.delete(),
          },
          tokenType,
          scope,
          expiresAt: parseTokenExpiry(params.tokenPayload),
          updatedAt: FieldValue.serverTimestamp(),
          connectedByUid: params.uid,
          connectedEmail: params.email,
          customerId: params.customerId,
          managerId: params.managerId || '',
          accessToken: FieldValue.delete(),
          refreshToken: FieldValue.delete(),
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

function toMillis(value: GoogleAdsIntegrationDoc['expiresAt']): number {
  if (!value || typeof value.toMillis !== 'function') return 0
  return value.toMillis()
}

export async function getGoogleAdsAuthContext(storeId: string): Promise<{
  customerId: string
  managerId: string
  accessToken: string
}> {
  const settingsRef = db().doc(`storeSettings/${storeId}`)
  const snap = await settingsRef.get()
  const data = (snap.data() ?? {}) as Record<string, any>
  const googleAds = (data.integrations?.googleAds ?? {}) as GoogleAdsIntegrationDoc
  const sharedGoogle = (data.integrations?.googleOAuth ?? {}) as GoogleAdsIntegrationDoc

  const customerId = typeof googleAds.customerId === 'string' ? googleAds.customerId.trim() : ''
  const managerId = typeof googleAds.managerId === 'string' ? googleAds.managerId.trim() : ''
  let accessToken = decryptToken(googleAds.secrets?.accessTokenCipher)
  let refreshToken = decryptToken(googleAds.secrets?.refreshTokenCipher)

  if (!accessToken && typeof googleAds.accessToken === 'string') {
    accessToken = googleAds.accessToken
  }
  if (!refreshToken && typeof googleAds.refreshToken === 'string') {
    refreshToken = googleAds.refreshToken
  }
  if (!accessToken && typeof sharedGoogle.accessToken === 'string') {
    accessToken = sharedGoogle.accessToken
  }
  if (!refreshToken && typeof sharedGoogle.refreshToken === 'string') {
    refreshToken = sharedGoogle.refreshToken
  }

  if (!customerId || !accessToken) {
    throw new Error('google-ads-not-connected')
  }

  const expired = toMillis(googleAds.expiresAt) <= Date.now() + 15_000
  if (expired) {
    if (!refreshToken) throw new Error('google-ads-refresh-token-missing')

    const refreshed = await refreshGoogleAccessToken(refreshToken)
    accessToken = typeof refreshed.access_token === 'string' ? refreshed.access_token : accessToken
    const refreshedType = typeof refreshed.token_type === 'string' ? refreshed.token_type : 'Bearer'
    const refreshedScope = typeof refreshed.scope === 'string' ? refreshed.scope : googleAds.scope || ''

    await settingsRef.set(
      {
        integrations: {
          googleOAuth: {
            accessToken,
            refreshToken,
            tokenType: refreshedType,
            scope: refreshedScope,
            expiresAt: parseTokenExpiry(refreshed),
            updatedAt: FieldValue.serverTimestamp(),
          },
          googleAds: {
            secrets: {
              accessTokenCipher: encryptToken(accessToken),
              refreshTokenCipher: encryptToken(refreshToken),
            },
            tokenType: refreshedType,
            scope: refreshedScope,
            expiresAt: parseTokenExpiry(refreshed),
            updatedAt: FieldValue.serverTimestamp(),
            accessToken: FieldValue.delete(),
            refreshToken: FieldValue.delete(),
          },
        },
      },
      { merge: true },
    )
  }

  return { customerId, managerId, accessToken }
}

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, '').trim()
}

function googleAdsHeaders(params: { accessToken: string; managerId: string }) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || ''
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is required')

  const headers: Record<string, string> = {
    authorization: `Bearer ${params.accessToken}`,
    'developer-token': developerToken,
    'content-type': 'application/json',
  }

  if (params.managerId) {
    headers['login-customer-id'] = normalizeCustomerId(params.managerId)
  }

  return headers
}

export async function googleAdsMutate(params: {
  customerId: string
  managerId: string
  accessToken: string
  operations: Array<Record<string, unknown>>
}): Promise<Record<string, unknown>> {
  const customerId = normalizeCustomerId(params.customerId)
  const url = `${GOOGLE_ADS_API_BASE}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:mutate`

  const response = await fetch(url, {
    method: 'POST',
    headers: googleAdsHeaders({ accessToken: params.accessToken, managerId: params.managerId }),
    body: JSON.stringify({ mutateOperations: params.operations }),
  })

  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(
      `google-ads-mutate-failed:${typeof payload.message === 'string' ? payload.message : response.status}`,
    )
  }

  return payload
}

function parseResourceName(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function createGoogleAdsCampaign(params: {
  customerId: string
  managerId: string
  accessToken: string
  brief: CampaignBrief
  campaignName: string
}): Promise<{ campaignId: string; adGroupName: string }> {
  const normalizedCustomerId = normalizeCustomerId(params.customerId)
  const micros = Math.max(1_000_000, Math.round(params.brief.dailyBudget * 1_000_000))
  const campaignName = params.campaignName.slice(0, 120)
  const adGroupName = `${params.brief.goal.toUpperCase()} Primary`.slice(0, 120)

  const payload = await googleAdsMutate({
    customerId: params.customerId,
    managerId: params.managerId,
    accessToken: params.accessToken,
    operations: [
      {
        campaignBudgetOperation: {
          create: {
            name: `${campaignName} Budget`,
            amountMicros: micros.toString(),
            deliveryMethod: 'STANDARD',
          },
        },
      },
      {
        campaignOperation: {
          create: {
            name: campaignName,
            status: 'ENABLED',
            advertisingChannelType: 'SEARCH',
            manualCpc: {},
            campaignBudget: `customers/${normalizedCustomerId}/campaignBudgets/-1`,
          },
        },
      },
      {
        adGroupOperation: {
          create: {
            name: adGroupName,
            campaign: `customers/${normalizedCustomerId}/campaigns/-2`,
            cpcBidMicros: '1000000',
            status: 'ENABLED',
            type: 'SEARCH_STANDARD',
          },
        },
      },
      {
        adGroupAdOperation: {
          create: {
            adGroup: `customers/${normalizedCustomerId}/adGroups/-3`,
            status: 'ENABLED',
            ad: {
              finalUrls: [params.brief.landingPageUrl],
              responsiveSearchAd: {
                headlines: [{ text: params.brief.headline }],
                descriptions: [{ text: params.brief.description }],
              },
            },
          },
        },
      },
    ],
  })

  const mutateResponses = Array.isArray(payload.mutateOperationResponses)
    ? payload.mutateOperationResponses
    : []

  const campaignResourceName = parseResourceName(
    (mutateResponses[1] as Record<string, any> | undefined)?.campaignResult?.resourceName,
  )

  const match = campaignResourceName.match(/\/campaigns\/(\d+)/)
  const campaignId = match?.[1] || campaignResourceName || `SFX-${Date.now().toString().slice(-6)}`

  return {
    campaignId,
    adGroupName,
  }
}

function buildCampaignResource(customerId: string, campaignId: string): string {
  const normalizedCustomer = normalizeCustomerId(customerId)
  return campaignId.startsWith('customers/')
    ? campaignId
    : `customers/${normalizedCustomer}/campaigns/${campaignId}`
}

export async function updateGoogleAdsCampaignStatus(params: {
  customerId: string
  managerId: string
  accessToken: string
  campaignId: string
  enabled: boolean
}) {
  const resourceName = buildCampaignResource(params.customerId, params.campaignId)

  await googleAdsMutate({
    customerId: params.customerId,
    managerId: params.managerId,
    accessToken: params.accessToken,
    operations: [
      {
        campaignOperation: {
          update: {
            resourceName,
            status: params.enabled ? 'ENABLED' : 'PAUSED',
          },
          updateMask: 'status',
        },
      },
    ],
  })
}

export async function fetchGoogleAdsCampaignMetrics(params: {
  customerId: string
  managerId: string
  accessToken: string
  campaignId?: string
}): Promise<{ spend: number; leads: number; cpa: number | null }> {
  const customerId = normalizeCustomerId(params.customerId)
  const url = `${GOOGLE_ADS_API_BASE}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`

  const whereCampaign = params.campaignId
    ? ` AND campaign.id = ${params.campaignId.replace(/\D/g, '') || '0'}`
    : ''

  const query = `
    SELECT
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE campaign.status != REMOVED${whereCampaign}
    DURING LAST_30_DAYS
  `.replace(/\s+/g, ' ')

  const response = await fetch(url, {
    method: 'POST',
    headers: googleAdsHeaders({ accessToken: params.accessToken, managerId: params.managerId }),
    body: JSON.stringify({ query }),
  })

  const payload = (await response.json()) as Array<Record<string, any>> | Record<string, unknown>
  if (!response.ok) {
    const message = Array.isArray(payload)
      ? JSON.stringify(payload[0] || {})
      : typeof (payload as Record<string, unknown>).message === 'string'
        ? ((payload as Record<string, unknown>).message as string)
        : response.status.toString()
    throw new Error(`google-ads-metrics-failed:${message}`)
  }

  const batches = Array.isArray(payload) ? payload : []
  let spend = 0
  let leads = 0

  for (const batch of batches) {
    const results = Array.isArray(batch.results) ? batch.results : []
    for (const result of results) {
      const metrics = (result.metrics ?? {}) as Record<string, unknown>
      const costMicros = Number(metrics.costMicros ?? metrics.cost_micros ?? 0)
      const conversions = Number(metrics.conversions ?? 0)
      if (Number.isFinite(costMicros)) spend += costMicros / 1_000_000
      if (Number.isFinite(conversions)) leads += conversions
    }
  }

  return {
    spend: Number(spend.toFixed(2)),
    leads: Number(leads.toFixed(2)),
    cpa: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
  }
}
