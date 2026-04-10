import * as functions from 'firebase-functions/v1'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { admin, defaultDb as db } from './firestore'

type ApiAuthedUser = {
  uid: string
  email: string
}

type CampaignGoal = 'leads' | 'sales' | 'traffic' | 'calls' | 'awareness'
type CampaignStatus = 'draft' | 'live' | 'paused'
type CampaignAction = 'create' | 'pause' | 'resume' | 'edit'

type CampaignBrief = {
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

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getEncryptionKey(): { key: Buffer; keyVersion: string } {
  const raw = process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY?.trim() || ''
  if (!raw) throw new Error('GOOGLE_ADS_TOKEN_ENCRYPTION_KEY is required')

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

function getOAuthClientConfig() {
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

function requireStoreId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid-store-id')
  return raw.trim()
}

function parseAction(raw: unknown): CampaignAction {
  if (raw === 'pause' || raw === 'resume' || raw === 'edit') return raw
  return 'create'
}

function parseCampaignBrief(raw: unknown): CampaignBrief {
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

async function requireApiUser(req: functions.https.Request): Promise<ApiAuthedUser> {
  const authHeader = req.headers.authorization
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw new Error('missing-auth')
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) throw new Error('missing-auth')

  const decoded = await admin.auth().verifyIdToken(token)
  if (!decoded.uid) throw new Error('invalid-auth')

  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : '',
  }
}

function normalizeStoreIdCandidate(candidate: unknown): string {
  if (typeof candidate !== 'string') return ''
  return candidate.trim()
}

function extractStoreId(record: Record<string, unknown>): string {
  const candidates = [
    record.storeId,
    record.storeID,
    record.store_id,
    record.workspaceSlug,
    record.workspaceId,
    record.workspace_id,
    record.workspaceUid,
    record.workspace_uid,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeStoreIdCandidate(candidate)
    if (normalized) return normalized
  }

  return ''
}

async function requireStoreMembership(uid: string, storeId: string): Promise<void> {
  const normalizedStoreId = storeId.trim()
  if (!normalizedStoreId) throw new Error('invalid-store-id')

  const membershipSnaps = await db
    .collection('teamMembers')
    .where('uid', '==', uid)
    .limit(50)
    .get()

  const hasMembership = membershipSnaps.docs.some((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>
    return extractStoreId(data) === normalizedStoreId
  })

  if (!hasMembership) throw new Error('store-access-denied')
}

function buildOAuthStartUrl(params: { storeId: string; uid: string }): { url: string; rawState: string } {
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

async function persistOAuthState(params: {
  uid: string
  storeId: string
  rawState: string
  customerId?: string
  managerId?: string
  email?: string
}) {
  const hashedState = hashSecret(params.rawState)
  await db.collection('googleAdsOAuthStates').doc(hashedState).set({
    uid: params.uid,
    storeId: params.storeId,
    customerId: params.customerId || '',
    managerId: params.managerId || '',
    email: params.email || '',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  })
}

async function consumeOAuthState(rawState: string): Promise<{
  uid: string
  storeId: string
  customerId: string
  managerId: string
  email: string
}> {
  const stateHash = hashSecret(rawState)
  const stateRef = db.collection('googleAdsOAuthStates').doc(stateHash)
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

async function exchangeCodeForTokens(code: string) {
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

async function discoverGoogleAdsCustomerId(params: {
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

function parseTokenExpiry(payload: Record<string, unknown>): Timestamp | null {
  const expiresIn =
    typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in || 0)

  return expiresIn > 0 ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null
}

async function storeGoogleTokens(params: {
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

  if (!accessToken || !tokenType) throw new Error('missing-access-token')

  const settingsRef = db.doc(`storeSettings/${params.storeId}`)
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

function toMillis(value: GoogleAdsIntegrationDoc['expiresAt']): number {
  if (!value || typeof value.toMillis !== 'function') return 0
  return value.toMillis()
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
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

async function getGoogleAdsAuthContext(storeId: string): Promise<{
  customerId: string
  managerId: string
  accessToken: string
}> {
  const settingsRef = db.doc(`storeSettings/${storeId}`)
  const snap = await settingsRef.get()
  const data = (snap.data() ?? {}) as Record<string, any>
  const googleAds = (data.integrations?.googleAds ?? {}) as GoogleAdsIntegrationDoc

  const customerId = typeof googleAds.customerId === 'string' ? googleAds.customerId.trim() : ''
  const managerId = typeof googleAds.managerId === 'string' ? googleAds.managerId.trim() : ''
  let accessToken = decryptToken(googleAds.secrets?.accessTokenCipher)
  let refreshToken = decryptToken(googleAds.secrets?.refreshTokenCipher)

  if (!accessToken && typeof googleAds.accessToken === 'string') accessToken = googleAds.accessToken
  if (!refreshToken && typeof googleAds.refreshToken === 'string') refreshToken = googleAds.refreshToken

  if (!customerId || !accessToken) throw new Error('google-ads-not-connected')

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

async function googleAdsMutate(params: {
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

async function createGoogleAdsCampaign(params: {
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

  return { campaignId, adGroupName }
}

function buildCampaignResource(customerId: string, campaignId: string): string {
  const normalizedCustomer = normalizeCustomerId(customerId)
  return campaignId.startsWith('customers/')
    ? campaignId
    : `customers/${normalizedCustomer}/campaigns/${campaignId}`
}

async function updateGoogleAdsCampaignStatus(params: {
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

async function fetchGoogleAdsCampaignMetrics(params: {
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

function callbackDoneUrl(params: { ok: boolean; message: string; storeId?: string }) {
  const appOrigin = canonicalizeSedifexUrl(process.env.APP_BASE_URL?.trim() || '')
  if (!appOrigin) return null

  const url = new URL('/ads', appOrigin)
  url.searchParams.set('googleOAuth', params.ok ? 'success' : 'failed')
  url.searchParams.set('message', params.message)
  if (params.storeId) url.searchParams.set('storeId', params.storeId)
  return url.toString()
}

function makeCampaignName(storeId: string, goal: string): string {
  return `SFX ${storeId.slice(0, 20)} ${goal.toUpperCase()} ${new Date().toISOString().slice(0, 10)}`
}

async function runMetricsSyncJob() {
  const settingsSnaps = await db
    .collection('storeSettings')
    .where('googleAdsAutomation.connection.connected', '==', true)
    .get()

  let scanned = 0
  let updated = 0

  for (const docSnap of settingsSnaps.docs) {
    scanned += 1

    const storeId = docSnap.id
    const settingsRef = db.doc(`storeSettings/${storeId}`)
    const settingsData = (docSnap.data() ?? {}) as Record<string, any>
    const campaign = (settingsData.googleAdsAutomation?.campaign ?? {}) as Record<string, any>

    try {
      const auth = await getGoogleAdsAuthContext(storeId)
      const metrics = await fetchGoogleAdsCampaignMetrics({
        customerId: auth.customerId,
        managerId: auth.managerId,
        accessToken: auth.accessToken,
        campaignId: typeof campaign.campaignId === 'string' ? campaign.campaignId : undefined,
      })

      await settingsRef.set(
        {
          googleAdsAutomation: {
            metrics: {
              spend: metrics.spend,
              leads: metrics.leads,
              cpa: metrics.cpa,
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
    } catch (storeError) {
      await settingsRef.set(
        {
          googleAdsAutomation: {
            jobs: {
              metricsSync: {
                lastRunAt: FieldValue.serverTimestamp(),
                status: 'error',
                message: storeError instanceof Error ? storeError.message.slice(0, 300) : 'sync-failed',
              },
            },
          },
        },
        { merge: true },
      )
    }
  }

  return { scanned, updated }
}

export const googleAdsOAuthStart = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  try {
    const user = await requireApiUser(req)
    const storeId = requireStoreId(req.body?.storeId)
    await requireStoreMembership(user.uid, storeId)

    const customerId = typeof req.body?.customerId === 'string' ? req.body.customerId.trim() : ''
    const managerId = typeof req.body?.managerId === 'string' ? req.body.managerId.trim() : ''
    const accountEmail = typeof req.body?.accountEmail === 'string' ? req.body.accountEmail.trim() : ''

    const { url, rawState } = buildOAuthStartUrl({ storeId, uid: user.uid })
    await persistOAuthState({
      uid: user.uid,
      storeId,
      rawState,
      customerId,
      managerId,
      email: accountEmail || user.email,
    })

    res.status(200).json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth-start-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleAdsOAuthCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' })
    return
  }

  try {
    getOAuthClientConfig()

    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const oauthError = typeof req.query.error === 'string' ? req.query.error : ''

    if (oauthError) {
      const target = callbackDoneUrl({ ok: false, message: oauthError })
      if (target) {
        res.redirect(302, target)
        return
      }
      res.status(400).json({ error: oauthError })
      return
    }

    if (!state || !code) {
      res.status(400).json({ error: 'state and code are required' })
      return
    }

    const statePayload = await consumeOAuthState(state)
    const tokenPayload = await exchangeCodeForTokens(code)
    const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : ''
    const customerId =
      statePayload.customerId ||
      (accessToken
        ? await discoverGoogleAdsCustomerId({
            accessToken,
            managerId: statePayload.managerId,
          })
        : '')

    await storeGoogleTokens({
      storeId: statePayload.storeId,
      uid: statePayload.uid,
      email: statePayload.email,
      customerId,
      managerId: statePayload.managerId,
      tokenPayload,
    })

    const target = callbackDoneUrl({
      ok: true,
      message: 'Google Ads connected',
      storeId: statePayload.storeId,
    })

    if (target) {
      res.redirect(302, target)
      return
    }

    res.status(200).json({ ok: true, storeId: statePayload.storeId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth-callback-failed'
    const target = callbackDoneUrl({ ok: false, message })
    if (target) {
      res.redirect(302, target)
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleAdsCampaign = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  try {
    const user = await requireApiUser(req)
    const storeId = requireStoreId(req.body?.storeId)
    await requireStoreMembership(user.uid, storeId)
    const action = parseAction(req.body?.action)

    const settingsRef = db.doc(`storeSettings/${storeId}`)
    const snapshot = await settingsRef.get()
    const settings = (snapshot.data() ?? {}) as Record<string, any>
    const googleAdsAutomation = (settings.googleAdsAutomation ?? {}) as Record<string, any>
    const connection = (googleAdsAutomation.connection ?? {}) as Record<string, any>
    const billing = (googleAdsAutomation.billing ?? {}) as Record<string, any>
    const existingCampaign = (googleAdsAutomation.campaign ?? {}) as Record<string, any>
    const existingMetrics = (googleAdsAutomation.metrics ?? {}) as Record<string, any>

    const auth = await getGoogleAdsAuthContext(storeId)

    if (action === 'pause' || action === 'resume') {
      if (!existingCampaign.campaignId) {
        res.status(400).json({ error: 'No live campaign exists yet.' })
        return
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

      res.status(200).json({ ok: true, status: action === 'pause' ? 'paused' : 'live' })
      return
    }

    const brief = parseCampaignBrief(req.body?.brief)
    if (!brief.location || !brief.landingPageUrl || !brief.headline || !brief.description) {
      res.status(400).json({ error: 'Complete all campaign brief fields before launch.' })
      return
    }
    if (action === 'create' && connection.connected !== true) {
      res.status(400).json({ error: 'Connect Google Ads first.' })
      return
    }
    if (action === 'create' && billing.confirmed !== true) {
      res.status(400).json({ error: 'Confirm billing ownership first.' })
      return
    }

    let spend = typeof existingMetrics.spend === 'number' ? existingMetrics.spend : 0
    let leads = typeof existingMetrics.leads === 'number' ? existingMetrics.leads : 0
    let cpa = leads > 0 ? Number((spend / leads).toFixed(2)) : brief.dailyBudget

    const isCreate = action === 'create'
    let campaignId = typeof existingCampaign.campaignId === 'string' ? existingCampaign.campaignId : ''
    let adGroupName = typeof existingCampaign.adGroupName === 'string' ? existingCampaign.adGroupName : ''

    if (isCreate) {
      const created = await createGoogleAdsCampaign({
        customerId: auth.customerId,
        managerId: auth.managerId,
        accessToken: auth.accessToken,
        brief,
        campaignName: makeCampaignName(storeId, brief.goal),
      })
      campaignId = created.campaignId
      adGroupName = created.adGroupName
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

    res.status(200).json({ ok: true, status: isCreate ? 'live' : 'edited', campaignId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'campaign-update-failed'
    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    res.status(400).json({ error: message })
  }
})

function requireCronSecret(req: functions.https.Request) {
  const expected = process.env.GOOGLE_ADS_SYNC_SECRET?.trim() || ''
  if (!expected) throw new Error('GOOGLE_ADS_SYNC_SECRET not set')

  const incoming =
    (typeof req.headers['x-google-ads-sync-secret'] === 'string' && req.headers['x-google-ads-sync-secret']) ||
    (typeof req.query.secret === 'string' && req.query.secret) ||
    ''

  if (incoming !== expected) throw new Error('unauthorized')
}

export const googleAdsMetricsSync = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  try {
    requireCronSecret(req)
    const result = await runMetricsSyncJob()
    res.status(200).json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'metrics-sync-failed'
    const code = message === 'unauthorized' ? 401 : 400
    res.status(code).json({ error: message })
  }
})

export const googleAdsMetricsSyncScheduled = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    await runMetricsSyncJob()
    return null
  })
