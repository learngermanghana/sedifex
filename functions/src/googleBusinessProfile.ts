import * as functions from 'firebase-functions/v1'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { admin, defaultDb as db } from './firestore'

type ApiUser = {
  uid: string
  email: string
}

type GoogleBusinessTokens = {
  accessToken: string
  refreshToken: string
  tokenType: string
  scope: string
  expiresAt: Timestamp | null
  refreshTokenSource: 'googleBusinessProfile' | 'googleOAuth'
}

type ParsedUploadFile = {
  filename: string
  mimeType: string
  size: number
  buffer: Buffer
}

type ParsedMultipartRequest = {
  fields: Record<string, string>
  file: ParsedUploadFile | null
}

type GoogleBusinessLocation = {
  name: string
  title: string
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ACCOUNT_API_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const GOOGLE_BUSINESS_INFO_API_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const GOOGLE_BUSINESS_MEDIA_API_BASE = 'https://mybusiness.googleapis.com/v4'
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown-error'
}

function setCors(res: functions.Response<any>) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function sanitizeFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() || 'upload-image'
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function tokenExpiryMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object') {
    const candidate = value as { toMillis?: () => number }
    if (typeof candidate.toMillis === 'function') return candidate.toMillis()
  }
  return 0
}

function parseTokenExpiry(tokenPayload: Record<string, unknown>): Timestamp | null {
  const expiresInRaw = tokenPayload.expires_in
  const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : Number(expiresInRaw || 0)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return Timestamp.fromMillis(Date.now() + expiresIn * 1000)
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
    const normalized = normalizeString(candidate)
    if (normalized) return normalized
  }

  return ''
}

async function requireApiUser(req: functions.https.Request): Promise<ApiUser> {
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

async function requireStoreMembership(uid: string, storeId: string): Promise<void> {
  if (!storeId) throw new Error('invalid-store-id')

  const membershipSnaps = await db.collection('teamMembers').where('uid', '==', uid).limit(50).get()
  const hasMembership = membershipSnaps.docs.some((docSnap) => {
    const data = asRecord(docSnap.data())
    return extractStoreId(data) === storeId
  })

  if (!hasMembership) throw new Error('store-access-denied')
}

async function getGoogleBusinessTokensForUser(userId: string, storeId: string): Promise<GoogleBusinessTokens> {
  const settingsSnap = await db.collection('storeSettings').doc(storeId).get()
  const settingsData = asRecord(settingsSnap.data())
  const integrations = asRecord(settingsData.integrations)
  const googleBusinessProfile = asRecord(integrations.googleBusinessProfile)
  const googleOAuth = asRecord(integrations.googleOAuth)
  const googleMerchant = asRecord(integrations.googleMerchant)

  const oauthUserId = normalizeString(googleBusinessProfile.oauthUserId)
  if (!oauthUserId || oauthUserId !== userId) {
    throw new Error('google-business-not-connected')
  }

  const businessRefreshToken = normalizeString(googleBusinessProfile.refreshToken)
  const oauthRefreshToken = normalizeString(googleOAuth.refreshToken)
  const merchantRefreshToken = normalizeString(googleMerchant.refreshToken)

  const refreshToken = businessRefreshToken || oauthRefreshToken
  const refreshTokenSource: GoogleBusinessTokens['refreshTokenSource'] = businessRefreshToken ? 'googleBusinessProfile' : 'googleOAuth'

  const businessAccessToken = normalizeString(googleBusinessProfile.accessToken)
  const oauthAccessToken = normalizeString(googleOAuth.accessToken)
  const accessToken = businessAccessToken || oauthAccessToken

  functions.logger.info('[googleBusiness] token source inspection', {
    storeId,
    oauthUserId,
    refreshTokenSource,
    hasBusinessRefreshToken: Boolean(businessRefreshToken),
    hasOAuthRefreshToken: Boolean(oauthRefreshToken),
    hasMerchantRefreshToken: Boolean(merchantRefreshToken),
    businessEqualsOAuth: Boolean(businessRefreshToken) && businessRefreshToken === oauthRefreshToken,
    businessEqualsMerchant: Boolean(businessRefreshToken) && businessRefreshToken === merchantRefreshToken,
    oauthEqualsMerchant: Boolean(oauthRefreshToken) && oauthRefreshToken === merchantRefreshToken,
  })

  if (!refreshToken || !accessToken) {
    throw new Error('google-business-missing-tokens')
  }

  return {
    accessToken,
    refreshToken,
    tokenType: normalizeString(googleBusinessProfile.tokenType) || 'Bearer',
    scope: normalizeString(googleBusinessProfile.scope),
    expiresAt: googleBusinessProfile.expiresAt instanceof Timestamp ? googleBusinessProfile.expiresAt : null,
    refreshTokenSource,
  }
}

function getGoogleBusinessRefreshOAuthConfig(): { clientId: string; clientSecret: string; source: string } {
  const sharedClientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim() || ''
  const sharedClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || ''
  if (sharedClientId && sharedClientSecret) {
    return { clientId: sharedClientId, clientSecret: sharedClientSecret, source: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET' }
  }

  const businessClientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() || ''
  const businessClientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim() || ''
  if (businessClientId && businessClientSecret) {
    return {
      clientId: businessClientId,
      clientSecret: businessClientSecret,
      source: 'GOOGLE_BUSINESS_CLIENT_ID/GOOGLE_BUSINESS_CLIENT_SECRET',
    }
  }

  throw new Error('google-business-oauth-config-missing')
}

async function markGoogleBusinessDisconnected(params: { storeId: string; reason: string }) {
  await db.collection('storeSettings').doc(params.storeId).set(
    {
      integrations: {
        googleBusinessProfile: {
          accessToken: FieldValue.delete(),
          refreshToken: FieldValue.delete(),
          expiresAt: FieldValue.delete(),
          connectedAccountIds: FieldValue.delete(),
          disconnected: true,
          disconnectedReason: params.reason,
          disconnectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
    },
    { merge: true },
  )
}

async function refreshGoogleAccessTokenIfNeeded(params: {
  storeId: string
  tokens: GoogleBusinessTokens
}): Promise<GoogleBusinessTokens> {
  const expiryMs = tokenExpiryMillis(params.tokens.expiresAt)
  if (expiryMs > Date.now() + 30_000) {
    return params.tokens
  }

  const { clientId, clientSecret, source } = getGoogleBusinessRefreshOAuthConfig()

  functions.logger.info('[googleBusiness] attempting token refresh', {
    storeId: params.storeId,
    refreshTokenSource: params.tokens.refreshTokenSource,
    oauthClientId: clientId,
    oauthClientIdSource: source,
  })

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: params.tokens.refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  const payload = asRecord(await response.json().catch(() => ({})))
  functions.logger.info('[googleBusiness] token refresh response', {
    storeId: params.storeId,
    status: response.status,
    ok: response.ok,
    responseBody: payload,
  })

  if (!response.ok) {
    const refreshErrorCode = normalizeString(payload.error)
    const refreshErrorDescription = normalizeString(payload.error_description)
    const refreshFailureReason = refreshErrorDescription || refreshErrorCode || String(response.status)

    if (refreshErrorCode === 'invalid_grant' || refreshErrorCode === 'unauthorized_client') {
      await markGoogleBusinessDisconnected({ storeId: params.storeId, reason: refreshFailureReason })
      throw new Error('google-business-reconnect-required')
    }

    throw new Error(`google-business-refresh-failed:${refreshFailureReason}`)
  }

  const refreshed: GoogleBusinessTokens = {
    accessToken: normalizeString(payload.access_token) || params.tokens.accessToken,
    refreshToken: params.tokens.refreshToken,
    tokenType: normalizeString(payload.token_type) || params.tokens.tokenType || 'Bearer',
    scope: normalizeString(payload.scope) || params.tokens.scope,
    expiresAt: parseTokenExpiry(payload),
    refreshTokenSource: params.tokens.refreshTokenSource,
  }

  await db.collection('storeSettings').doc(params.storeId).set(
    {
      integrations: {
        googleBusinessProfile: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenType: refreshed.tokenType,
          scope: refreshed.scope,
          expiresAt: refreshed.expiresAt,
          disconnected: false,
          disconnectedReason: FieldValue.delete(),
          disconnectedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
    },
    { merge: true },
  )

  return refreshed
}

function parseMultipartForm(req: functions.https.Request): ParsedMultipartRequest {
  const contentType = normalizeString(req.headers['content-type'])
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i)
  if (!boundaryMatch?.[1]) {
    throw new Error('invalid-multipart-request')
  }

  const boundary = `--${boundaryMatch[1]}`
  const raw = req.rawBody
  if (!raw || raw.length === 0) throw new Error('empty-upload')

  const parts = raw.toString('binary').split(boundary)
  const fields: Record<string, string> = {}
  let file: ParsedUploadFile | null = null

  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part || part === '--') continue

    const headerEndIdx = part.indexOf('\r\n\r\n')
    if (headerEndIdx <= 0) continue

    const headerText = part.slice(0, headerEndIdx)
    const bodyBinary = part.slice(headerEndIdx + 4).replace(/\r\n--$/, '')

    const disposition = headerText.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i)
    if (!disposition?.[1]) continue

    const fieldName = disposition[1]
    const filename = disposition[2]
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i)

    if (!filename) {
      fields[fieldName] = Buffer.from(bodyBinary, 'binary').toString('utf8').trim()
      continue
    }

    const mimeType = normalizeString(contentTypeMatch?.[1])
    const fileBuffer = Buffer.from(bodyBinary, 'binary')
    file = {
      filename: sanitizeFilename(filename),
      mimeType,
      size: fileBuffer.length,
      buffer: fileBuffer,
    }
  }

  return { fields, file }
}

async function googleApiRequest<T>(params: {
  url: string
  accessToken: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
}): Promise<T> {
  const response = await fetch(params.url, {
    method: params.method || 'GET',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
      ...(params.headers || {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const bodyRecord = asRecord(payload)
    const message = normalizeString(bodyRecord.error_description || bodyRecord.error || bodyRecord.message)
    throw new Error(message ? `google-business-api-failed:${message}` : `google-business-api-failed:${response.status}`)
  }

  return payload as T
}

async function startGoogleBusinessMediaUpload(params: {
  accessToken: string
  accountId: string
  locationId: string
}): Promise<{ uploadUrl: string }> {
  const parent = `accounts/${params.accountId}/locations/${params.locationId}`
  const payload = await googleApiRequest<Record<string, unknown>>({
    url: `${GOOGLE_BUSINESS_MEDIA_API_BASE}/${parent}/media:startUpload`,
    method: 'POST',
    accessToken: params.accessToken,
    body: {},
  })

  const uploadUrl = normalizeString(payload.uploadUrl || payload.upload_url)
  if (!uploadUrl) throw new Error('google-business-upload-start-failed')
  return { uploadUrl }
}

async function uploadBytesToGoogleBusiness(params: {
  uploadUrl: string
  mimeType: string
  fileName: string
  bytes: Buffer
}): Promise<{ mediaItemDataRef: string }> {
  // GBP uses a 2-step upload where raw bytes are sent directly to an upload URL.
  const response = await fetch(params.uploadUrl, {
    method: 'POST',
    headers: {
      'content-type': params.mimeType,
      'x-goog-upload-protocol': 'raw',
      'x-goog-upload-file-name': params.fileName,
    },
    body: new Uint8Array(params.bytes),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const bodyRecord = asRecord(payload)
    const message = normalizeString(bodyRecord.error || bodyRecord.message)
    throw new Error(message ? `google-business-upload-bytes-failed:${message}` : 'google-business-upload-bytes-failed')
  }

  const bodyRecord = asRecord(payload)
  const mediaItemDataRef = normalizeString(bodyRecord.mediaItemDataRef || bodyRecord.media_item_data_ref || bodyRecord.resourceName)
  if (!mediaItemDataRef) throw new Error('google-business-upload-bytes-missing-data-ref')
  return { mediaItemDataRef }
}

async function createGoogleBusinessMediaItem(params: {
  accessToken: string
  accountId: string
  locationId: string
  category: string
  mediaItemDataRef: string
}): Promise<Record<string, unknown>> {
  const parent = `accounts/${params.accountId}/locations/${params.locationId}`

  const requestBody = {
    mediaFormat: 'PHOTO',
    locationAssociation: {
      category: params.category,
    },
    mediaItemDataRef: params.mediaItemDataRef,
  }

  try {
    return await googleApiRequest<Record<string, unknown>>({
      url: `${GOOGLE_BUSINESS_MEDIA_API_BASE}/${parent}/media`,
      method: 'POST',
      accessToken: params.accessToken,
      body: requestBody,
    })
  } catch {
    // Keep compatibility with tenants still expecting `dataRef`.
    return googleApiRequest<Record<string, unknown>>({
      url: `${GOOGLE_BUSINESS_MEDIA_API_BASE}/${parent}/media`,
      method: 'POST',
      accessToken: params.accessToken,
      body: {
        mediaFormat: 'PHOTO',
        locationAssociation: { category: params.category },
        dataRef: params.mediaItemDataRef,
      },
    })
  }
}

async function listGoogleBusinessAccountsAndLocations(params: {
  accessToken: string
  accountId?: string
}): Promise<{ accounts: Array<{ accountId: string; accountName: string; locations: GoogleBusinessLocation[] }> }> {
  const accountsPayload = await googleApiRequest<{ accounts?: Array<Record<string, unknown>> }>({
    url: `${GOOGLE_ACCOUNT_API_BASE}/accounts`,
    accessToken: params.accessToken,
  })

  const accountsRaw = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts : []

  const accounts = await Promise.all(
    accountsRaw.map(async (account) => {
      const accountNamePath = normalizeString(account.name)
      const accountId = accountNamePath.split('/')[1] || ''
      if (!accountId) return null
      if (params.accountId && params.accountId !== accountId) return null

      const locationsPayload = await googleApiRequest<{ locations?: Array<Record<string, unknown>> }>({
        url: `${GOOGLE_BUSINESS_INFO_API_BASE}/accounts/${accountId}/locations?readMask=name,title`,
        accessToken: params.accessToken,
      })

      const locations = (Array.isArray(locationsPayload.locations) ? locationsPayload.locations : []).map((loc) => ({
        name: normalizeString(loc.name),
        title: normalizeString(loc.title),
      }))

      return {
        accountId,
        accountName: normalizeString(account.accountName || accountNamePath),
        locations,
      }
    }),
  )

  return { accounts: accounts.filter(Boolean) as Array<{ accountId: string; accountName: string; locations: GoogleBusinessLocation[] }> }
}

async function saveGoogleBusinessMediaMetadata(params: {
  userId: string
  storeId: string
  accountId: string
  locationId: string
  category: string
  file: ParsedUploadFile
  media: Record<string, unknown>
}) {
  await db.collection('users').doc(params.userId).collection('googleBusinessMedia').add({
    userId: params.userId,
    storeId: params.storeId,
    accountId: params.accountId,
    locationId: params.locationId,
    googleMediaName: normalizeString(params.media.name),
    googleUrl: normalizeString(params.media.googleUrl || params.media.sourceUrl || params.media.url),
    thumbnailUrl: normalizeString(params.media.thumbnailUrl),
    mediaFormat: normalizeString(params.media.mediaFormat) || 'PHOTO',
    category: params.category,
    originalFilename: params.file.filename,
    mimeType: params.file.mimeType,
    fileSize: params.file.size,
    status: normalizeString(params.media.mediaState || 'ACTIVE'),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

function getUploadMaxBytes(): number {
  const raw = Number(process.env.GOOGLE_BUSINESS_MEDIA_MAX_SIZE_BYTES || DEFAULT_MAX_UPLOAD_BYTES)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_UPLOAD_BYTES
  return Math.round(raw)
}

export const googleBusinessLocations = functions.https.onRequest(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    const user = await requireApiUser(req)
    const body = asRecord(req.body)
    const storeId = normalizeString(body.storeId)
    const accountId = normalizeString(body.accountId)

    await requireStoreMembership(user.uid, storeId)

    const tokens = await getGoogleBusinessTokensForUser(user.uid, storeId)
    const refreshed = await refreshGoogleAccessTokenIfNeeded({ storeId, tokens })

    const result = await listGoogleBusinessAccountsAndLocations({
      accessToken: refreshed.accessToken,
      accountId,
    })

    await db.collection('storeSettings').doc(storeId).set(
      {
        integrations: {
          googleBusinessProfile: {
            connectedAccountIds: result.accounts.map((item) => item.accountId),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
      },
      { merge: true },
    )

    res.status(200).json(result)
  } catch (error) {
    const message = normalizeError(error)
    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'not-authenticated' })
      return
    }
    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'store-access-denied' })
      return
    }
    if (message === 'google-business-reconnect-required') {
      res.status(401).json({ error: 'Google Business connection expired or is invalid. Please reconnect Google.' })
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleBusinessUploadLocationMedia = functions.https.onRequest(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    const user = await requireApiUser(req)
    const { fields, file } = parseMultipartForm(req)

    const storeId = normalizeString(fields.storeId)
    const accountId = normalizeString(fields.accountId)
    const locationId = normalizeString(fields.locationId)
    const category = normalizeString(fields.category)

    if (!storeId) throw new Error('missing-store-id')
    if (!accountId) throw new Error('missing-account-id')
    if (!locationId) throw new Error('missing-location-id')
    if (!category) throw new Error('missing-category')

    await requireStoreMembership(user.uid, storeId)

    if (!file) throw new Error('missing-file')
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) throw new Error('unsupported-mime-type')

    const maxUploadBytes = getUploadMaxBytes()
    if (file.size > maxUploadBytes) throw new Error('file-too-large')

    const tokens = await getGoogleBusinessTokensForUser(user.uid, storeId)
    const refreshed = await refreshGoogleAccessTokenIfNeeded({ storeId, tokens })

    const settingsSnap = await db.collection('storeSettings').doc(storeId).get()
    const settingsData = asRecord(settingsSnap.data())
    const integrations = asRecord(settingsData.integrations)
    const gbp = asRecord(integrations.googleBusinessProfile)
    const connectedAccountIds = Array.isArray(gbp.connectedAccountIds)
      ? gbp.connectedAccountIds.map((value) => normalizeString(value)).filter(Boolean)
      : []

    if (connectedAccountIds.length > 0 && !connectedAccountIds.includes(accountId)) {
      throw new Error('invalid-account-id')
    }

    // 1) Request a media upload URL for this location.
    const startedUpload = await startGoogleBusinessMediaUpload({
      accessToken: refreshed.accessToken,
      accountId,
      locationId,
    })

    // 2) Upload raw bytes directly to Google (no Firebase Storage persistence).
    const uploadResult = await uploadBytesToGoogleBusiness({
      uploadUrl: startedUpload.uploadUrl,
      mimeType: file.mimeType,
      fileName: file.filename,
      bytes: file.buffer,
    })

    // 3) Create the location media record from the uploaded bytes reference.
    const media = await createGoogleBusinessMediaItem({
      accessToken: refreshed.accessToken,
      accountId,
      locationId,
      category,
      mediaItemDataRef: uploadResult.mediaItemDataRef,
    })

    await saveGoogleBusinessMediaMetadata({
      userId: user.uid,
      storeId,
      accountId,
      locationId,
      category,
      file,
      media,
    })

    res.status(200).json({ media })
  } catch (error) {
    const message = normalizeError(error)

    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'not-authenticated' })
      return
    }
    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'store-access-denied' })
      return
    }
    if (message === 'unsupported-mime-type') {
      res.status(415).json({ error: 'unsupported-mime-type' })
      return
    }
    if (message === 'file-too-large') {
      res.status(413).json({ error: 'file-too-large' })
      return
    }
    if (message === 'google-business-reconnect-required') {
      res.status(401).json({ error: 'Google Business connection expired or is invalid. Please reconnect Google.' })
      return
    }

    res.status(400).json({ error: message })
  }
})
