import * as functions from 'firebase-functions/v1'
import { randomBytes, createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { admin, defaultDb as db } from './firestore'

type GoogleShoppingSyncMode = 'full' | 'incremental'

type IntegrationProduct = {
  id: string
  storeId: string
  name: string
  category: string | null
  description: string | null
  price: number | null
  stockCount: number | null
  imageUrl?: string | null
  sku?: string | null
  barcode?: string | null
  manufacturerName?: string | null
}

type MerchantProductInput = {
  offerId: string
  title: string
  description: string
  googleProductCategory: string
  availability: 'in stock' | 'out of stock'
  price: { value: string; currency: string }
  channel: 'online'
  contentLanguage: 'en'
  targetCountry: 'US'
  imageLink: string
  brand?: string
  gtin?: string
  mpn?: string
}

type SyncSummary = {
  mode: GoogleShoppingSyncMode
  totalProducts: number
  eligibleProducts: number
  invalidProducts: number
  createdOrUpdated: number
  removed: number
  disapproved: number
  errors: Array<{ productId: string; reason: string }>
}

type PendingMerchantAccount = {
  id: string
  displayName: string
  accountName: string
}

type ApiUser = {
  uid: string
  email: string
}

const GOOGLE_MERCHANT_API_BASE = 'https://shoppingcontent.googleapis.com/content/v2.1'
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_MERCHANT_SCOPES = ['https://www.googleapis.com/auth/content', 'openid', 'email', 'profile']
const DEFAULT_INTEGRATION_BASE_URL = 'https://us-central1-sedifex-web.cloudfunctions.net'

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

function getOAuthClientConfig() {
  const clientId = process.env.GOOGLE_MERCHANT_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_MERCHANT_CLIENT_SECRET?.trim() || ''
  const redirectUri = canonicalizeSedifexUrl(process.env.GOOGLE_MERCHANT_REDIRECT_URI?.trim() || '')

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('google-merchant-oauth-config-missing')
  }

  return { clientId, clientSecret, redirectUri }
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseTokenExpiry(tokenPayload: Record<string, unknown>): Timestamp | null {
  const expiresInRaw = tokenPayload.expires_in
  const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : Number(expiresInRaw || 0)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return Timestamp.fromMillis(Date.now() + expiresIn * 1000)
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

function oauthCallbackDoneUrl(params: {
  ok: boolean
  message: string
  storeId?: string
  connectedMerchantId?: string
  pendingSelectionId?: string
  refreshTokenMissing?: boolean
}) {
  const appOrigin = canonicalizeSedifexUrl(process.env.APP_BASE_URL?.trim() || '')
  if (!appOrigin) return null

  const callbackUrl = new URL('/google-shopping', appOrigin)
  callbackUrl.searchParams.set('googleMerchantOAuth', params.ok ? 'success' : 'failed')
  callbackUrl.searchParams.set('message', params.message)
  if (params.storeId) callbackUrl.searchParams.set('storeId', params.storeId)
  if (params.connectedMerchantId) callbackUrl.searchParams.set('merchantId', params.connectedMerchantId)
  if (params.pendingSelectionId) callbackUrl.searchParams.set('pendingSelectionId', params.pendingSelectionId)
  if (params.refreshTokenMissing) callbackUrl.searchParams.set('refreshTokenMissing', '1')
  return callbackUrl.toString()
}

function buildOAuthStartUrl(params: { storeId: string; uid: string }): { url: string; rawState: string } {
  const { clientId, redirectUri } = getOAuthClientConfig()

  const rawState = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString('hex'),
      uid: params.uid,
      storeId: params.storeId,
      issuedAt: Date.now(),
    }),
    'utf8',
  ).toString('base64url')

  const url = new URL(GOOGLE_OAUTH_BASE)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_MERCHANT_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', rawState)

  return { url: url.toString(), rawState }
}

async function persistOAuthState(params: { uid: string; storeId: string; rawState: string }) {
  const stateHash = hashValue(params.rawState)
  await db.collection('googleMerchantOAuthStates').doc(stateHash).set({
    uid: params.uid,
    storeId: params.storeId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  })
}

async function consumeOAuthState(rawState: string): Promise<{ uid: string; storeId: string }> {
  const stateHash = hashValue(rawState)
  const stateRef = db.collection('googleMerchantOAuthStates').doc(stateHash)
  const stateSnap = await stateRef.get()
  if (!stateSnap.exists) throw new Error('invalid-state')

  const stateData = asRecord(stateSnap.data())
  await stateRef.delete()

  const uid = normalizeString(stateData.uid)
  const storeId = normalizeString(stateData.storeId)
  const expiresAt = stateData.expiresAt as Timestamp | undefined

  if (!uid || !storeId || !expiresAt || expiresAt.toMillis() < Date.now()) {
    throw new Error('expired-state')
  }

  return { uid, storeId }
}

async function exchangeCodeForTokens(code: string): Promise<Record<string, unknown>> {
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

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(`token-exchange-failed:${normalizeString(payload.error) || response.status}`)
  }

  return payload
}

async function refreshGoogleMerchantAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
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

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(`token-refresh-failed:${normalizeString(payload.error) || response.status}`)
  }

  return payload
}

async function listMerchantAccounts(accessToken: string): Promise<PendingMerchantAccount[]> {
  const authInfoRes = await fetch(`${GOOGLE_MERCHANT_API_BASE}/accounts/authinfo`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  })

  const authInfoPayload = (await authInfoRes.json().catch(() => ({}))) as Record<string, unknown>
  if (!authInfoRes.ok) {
    throw new Error(`merchant-authinfo-failed:${normalizeString(authInfoPayload.error) || authInfoRes.status}`)
  }

  const identifiers = Array.isArray(authInfoPayload.accountIdentifiers)
    ? authInfoPayload.accountIdentifiers
    : []

  const merchantIds = Array.from(
    new Set(
      identifiers
        .map((item) => {
          const entry = asRecord(item)
          const directMerchantId = normalizeString(entry.merchantId)
          if (directMerchantId) return directMerchantId
          const nested = asRecord(entry.accountIdentifier)
          return normalizeString(nested.merchantId)
        })
        .filter(Boolean),
    ),
  )

  const accounts = await Promise.all(
    merchantIds.map(async (merchantId) => {
      const detailsRes = await fetch(`${GOOGLE_MERCHANT_API_BASE}/${merchantId}/accounts/${merchantId}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
      })

      const detailsPayload = (await detailsRes.json().catch(() => ({}))) as Record<string, unknown>
      const accountName = normalizeString(detailsPayload.name)
      const websiteUrl = normalizeString(detailsPayload.websiteUrl)
      const displayName = accountName || websiteUrl || `Merchant account ${merchantId}`

      return {
        id: merchantId,
        displayName,
        accountName,
      }
    }),
  )

  return accounts
}

async function saveGoogleMerchantConnection(params: {
  storeId: string
  uid: string
  merchantId: string
  tokenPayload: Record<string, unknown>
}) {
  const settingsRef = db.collection('storeSettings').doc(params.storeId)
  const settingsSnap = await settingsRef.get()
  const settingsData = asRecord(settingsSnap.data())
  const googleShopping = asRecord(settingsData.googleShopping)
  const catalogSync = asRecord(googleShopping.catalogSync)

  const accessToken = normalizeString(params.tokenPayload.access_token)
  const refreshToken = normalizeString(params.tokenPayload.refresh_token)
  const tokenType = normalizeString(params.tokenPayload.token_type)
  const scope = normalizeString(params.tokenPayload.scope)
  const tokenExpiry = parseTokenExpiry(params.tokenPayload)

  const existingIntegrationApiKey = normalizeString(catalogSync.integrationApiKey)
  const existingIntegrationBaseUrl = normalizeString(catalogSync.integrationBaseUrl)
  const existingAutoSyncEnabled = catalogSync.autoSyncEnabled === false ? false : true

  const catalogSyncUpdate: Record<string, unknown> = {
    accessToken,
    tokenType: tokenType || 'Bearer',
    tokenScope: scope,
    tokenUpdatedAt: FieldValue.serverTimestamp(),
    autoSyncEnabled: existingAutoSyncEnabled,
    integrationBaseUrl: existingIntegrationBaseUrl || DEFAULT_INTEGRATION_BASE_URL,
    integrationApiKey: existingIntegrationApiKey,
    ...(tokenExpiry ? { tokenExpiry } : {}),
  }

  if (refreshToken) {
    catalogSyncUpdate.refreshToken = refreshToken
  }

  await settingsRef.set(
    {
      googleShopping: {
        connection: {
          connected: true,
          merchantId: params.merchantId,
          connectedAt: FieldValue.serverTimestamp(),
          connectedByUid: params.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        catalogSync: catalogSyncUpdate,
        status: {
          state: 'idle',
          message: 'Google Merchant is connected and ready for sync.',
          updatedAt: FieldValue.serverTimestamp(),
          refreshTokenMissing: !refreshToken,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  )

  return { refreshTokenStored: Boolean(refreshToken) }
}

async function persistPendingSelection(params: {
  uid: string
  storeId: string
  accounts: PendingMerchantAccount[]
  tokenPayload: Record<string, unknown>
}): Promise<string> {
  const pendingId = randomBytes(20).toString('hex')
  await db.collection('googleMerchantPendingSelections').doc(pendingId).set({
    uid: params.uid,
    storeId: params.storeId,
    accounts: params.accounts,
    tokenPayload: params.tokenPayload,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  })
  return pendingId
}

async function resolveGoogleMerchantAuth(storeId: string): Promise<{ accessToken: string }> {
  const settingsRef = db.collection('storeSettings').doc(storeId)
  const settingsSnap = await settingsRef.get()
  const settingsData = asRecord(settingsSnap.data())
  const googleShopping = asRecord(settingsData.googleShopping)
  const connection = asRecord(googleShopping.connection)
  const catalogSync = asRecord(googleShopping.catalogSync)

  const merchantId = normalizeString(connection.merchantId)
  if (connection.connected !== true || !merchantId) {
    throw new Error('merchant-not-connected')
  }

  let accessToken = normalizeString(catalogSync.accessToken)
  const refreshToken = normalizeString(catalogSync.refreshToken)
  const tokenExpiryRaw = catalogSync.tokenExpiry

  const expiryMillis = tokenExpiryMillis(tokenExpiryRaw)
  const tokenExpiringSoon = expiryMillis > 0 && expiryMillis <= Date.now() + 30_000

  if (!accessToken || tokenExpiringSoon) {
    if (!refreshToken) {
      throw new Error('missing-merchant-refresh-token')
    }

    const refreshed = await refreshGoogleMerchantAccessToken(refreshToken)
    const refreshedAccessToken = normalizeString(refreshed.access_token)
    if (!refreshedAccessToken) {
      throw new Error('token-refresh-missing-access-token')
    }

    accessToken = refreshedAccessToken
    const refreshedTokenType = normalizeString(refreshed.token_type)
    const refreshedScope = normalizeString(refreshed.scope)
    const refreshedTokenExpiry = parseTokenExpiry(refreshed)

    await settingsRef.set(
      {
        googleShopping: {
          catalogSync: {
            accessToken: refreshedAccessToken,
            tokenType: refreshedTokenType || 'Bearer',
            tokenScope: refreshedScope,
            tokenUpdatedAt: FieldValue.serverTimestamp(),
            ...(refreshedTokenExpiry ? { tokenExpiry: refreshedTokenExpiry } : {}),
          },
          status: {
            updatedAt: FieldValue.serverTimestamp(),
            refreshTokenMissing: false,
          },
        },
      },
      { merge: true },
    )
  }

  return { accessToken }
}

function isLikelyGtin(value: string): boolean {
  return /^\d{8}(\d{4})?(\d{1})?$/.test(value)
}

function resolveGoogleProductCategory(category: string | null): string {
  if (!category) return '222'
  const normalized = category.toLowerCase()
  if (normalized.includes('shoe') || normalized.includes('cloth') || normalized.includes('fashion')) return '166'
  if (normalized.includes('food') || normalized.includes('drink')) return '412'
  if (normalized.includes('phone') || normalized.includes('electronics')) return '293'
  return '222'
}

async function fetchIntegrationProducts(params: {
  storeId: string
  integrationApiKey: string
  integrationBaseUrl?: string
}): Promise<IntegrationProduct[]> {
  const baseUrl = normalizeString(params.integrationBaseUrl) || DEFAULT_INTEGRATION_BASE_URL
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/integrationProducts`)
  url.searchParams.set('storeId', params.storeId)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${params.integrationApiKey}`,
      'content-type': 'application/json',
    },
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(normalizeString(payload.error) || `integration-fetch-failed:${response.status}`)

  const products = Array.isArray(payload.products) ? payload.products : []
  return products.map((product) => {
    const entry = asRecord(product)
    return {
      id: normalizeString(entry.id),
      storeId: normalizeString(entry.storeId),
      name: normalizeString(entry.name),
      category: normalizeString(entry.category) || null,
      description: normalizeString(entry.description) || null,
      price: typeof entry.price === 'number' ? entry.price : Number(entry.price),
      stockCount: typeof entry.stockCount === 'number' ? entry.stockCount : Number(entry.stockCount),
      imageUrl: normalizeString(entry.imageUrl) || null,
      sku: normalizeString(entry.sku) || null,
      barcode: normalizeString(entry.barcode) || null,
      manufacturerName: normalizeString(entry.manufacturerName) || null,
    }
  })
}

function validateAndTransform(product: IntegrationProduct):
  | { valid: true; merchantProduct: MerchantProductInput }
  | { valid: false; reason: string } {
  const title = normalizeString(product.name)
  const description = normalizeString(product.description)
  const imageLink = normalizeString(product.imageUrl)
  const brand = normalizeString(product.manufacturerName)
  const barcode = normalizeString(product.barcode)
  const sku = normalizeString(product.sku)

  const missing: string[] = []
  if (!title) missing.push('title')
  if (!description) missing.push('description')
  if (!imageLink) missing.push('image')
  if (!(typeof product.price === 'number' && Number.isFinite(product.price) && product.price > 0)) missing.push('price')
  if (!brand) missing.push('brand')
  if (!barcode && !sku) missing.push('gtin_or_mpn')

  if (missing.length > 0) return { valid: false, reason: `missing:${missing.join(',')}` }

  return {
    valid: true,
    merchantProduct: {
      offerId: product.id,
      title,
      description,
      googleProductCategory: resolveGoogleProductCategory(product.category),
      availability: typeof product.stockCount === 'number' && product.stockCount > 0 ? 'in stock' : 'out of stock',
      price: { value: Number(product.price).toFixed(2), currency: 'USD' },
      channel: 'online',
      contentLanguage: 'en',
      targetCountry: 'US',
      imageLink,
      brand,
      ...(isLikelyGtin(barcode) ? { gtin: barcode } : {}),
      ...(!isLikelyGtin(barcode) && sku ? { mpn: sku } : {}),
    },
  }
}

async function upsertMerchantProduct(params: { merchantId: string; accessToken: string; product: MerchantProductInput }) {
  const endpoint = `${GOOGLE_MERCHANT_API_BASE}/${params.merchantId}/products`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params.product),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(normalizeString(payload.error) || `merchant-upsert-failed:${response.status}`)
  }
}

async function deleteMerchantProduct(params: { merchantId: string; accessToken: string; offerId: string }) {
  const googleProductId = `online:en:US:${params.offerId}`
  const endpoint = `${GOOGLE_MERCHANT_API_BASE}/${params.merchantId}/products/${encodeURIComponent(googleProductId)}`
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${params.accessToken}` },
  })

  if (!response.ok && response.status !== 404) {
    throw new Error(`merchant-delete-failed:${response.status}`)
  }
}

async function persistSyncStatus(storeId: string, summary: SyncSummary, state: 'success' | 'error', message: string) {
  await db.collection('storeSettings').doc(storeId).set(
    {
      googleShopping: {
        status: {
          state,
          lastMode: summary.mode,
          lastRunAt: FieldValue.serverTimestamp(),
          ...(state === 'success' ? { lastSuccessfulAt: FieldValue.serverTimestamp() } : {}),
          successCount: summary.createdOrUpdated,
          errorCount: summary.errors.length,
          disapprovalCount: summary.disapproved,
          outOfStockMismatchCount: 0,
          message,
        },
      },
    },
    { merge: true },
  )
}

async function runSync(params: {
  storeId: string
  mode: GoogleShoppingSyncMode
  merchantId: string
  accessToken: string
  integrationApiKey: string
  integrationBaseUrl?: string
}): Promise<SyncSummary> {
  const products = await fetchIntegrationProducts({
    storeId: params.storeId,
    integrationApiKey: params.integrationApiKey,
    integrationBaseUrl: params.integrationBaseUrl,
  })

  const mapCollection = db.collection('storeSettings').doc(params.storeId).collection('googleShoppingProductMappings')
  const errors: Array<{ productId: string; reason: string }> = []
  let eligibleProducts = 0
  let createdOrUpdated = 0
  let removed = 0
  let disapproved = 0

  for (const product of products) {
    const transformed = validateAndTransform(product)
    if (!transformed.valid) {
      errors.push({ productId: product.id, reason: transformed.reason })
      continue
    }

    eligibleProducts += 1
    try {
      await upsertMerchantProduct({ merchantId: params.merchantId, accessToken: params.accessToken, product: transformed.merchantProduct })
      await mapCollection.doc(product.id).set(
        {
          sedifexProductId: product.id,
          googleOfferId: transformed.merchantProduct.offerId,
          availability: transformed.merchantProduct.availability,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      createdOrUpdated += 1
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'merchant-upsert-failed'
      errors.push({ productId: product.id, reason })
      if (reason.includes('disapproved')) disapproved += 1
    }
  }

  if (params.mode === 'full') {
    const currentIds = new Set(products.map((product) => product.id))
    const mappingSnap = await mapCollection.limit(1000).get()
    for (const mapped of mappingSnap.docs) {
      if (currentIds.has(mapped.id)) continue
      const mappedData = asRecord(mapped.data())
      const offerId = normalizeString(mappedData.googleOfferId) || mapped.id
      try {
        await deleteMerchantProduct({ merchantId: params.merchantId, accessToken: params.accessToken, offerId })
        await mapped.ref.delete()
        removed += 1
      } catch (error) {
        errors.push({ productId: mapped.id, reason: error instanceof Error ? error.message : 'merchant-delete-failed' })
      }
    }
  }

  return {
    mode: params.mode,
    totalProducts: products.length,
    eligibleProducts,
    invalidProducts: products.length - eligibleProducts,
    createdOrUpdated,
    removed,
    disapproved,
    errors,
  }
}

export const googleMerchantOAuthStart = functions.https.onRequest(async (req, res) => {
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
    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    await requireStoreMembership(user.uid, storeId)

    const { url, rawState } = buildOAuthStartUrl({ storeId, uid: user.uid })
    await persistOAuthState({ uid: user.uid, storeId, rawState })

    functions.logger.info('[googleMerchantOAuthStart] oauth start prepared', { uid: user.uid, storeId })
    res.status(200).json({ url })
  } catch (error) {
    const message = normalizeError(error)
    functions.logger.error('[googleMerchantOAuthStart] failed', { message })

    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleMerchantOAuthCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  try {
    getOAuthClientConfig()

    const state = normalizeString(req.query.state)
    const code = normalizeString(req.query.code)
    const oauthError = normalizeString(req.query.error)

    if (oauthError) {
      const target = oauthCallbackDoneUrl({ ok: false, message: oauthError })
      if (target) {
        res.redirect(302, target)
        return
      }
      res.status(400).json({ error: oauthError })
      return
    }

    if (!state || !code) {
      res.status(400).json({ error: 'missing-state-or-code' })
      return
    }

    const statePayload = await consumeOAuthState(state)
    const tokenPayload = await exchangeCodeForTokens(code)
    const accessToken = normalizeString(tokenPayload.access_token)
    if (!accessToken) throw new Error('missing-access-token')

    const accounts = await listMerchantAccounts(accessToken)
    functions.logger.info('[googleMerchantOAuthCallback] merchant accounts fetched', {
      storeId: statePayload.storeId,
      uid: statePayload.uid,
      count: accounts.length,
    })

    if (accounts.length === 0) {
      throw new Error('no-merchant-accounts-found')
    }

    if (accounts.length === 1) {
      const result = await saveGoogleMerchantConnection({
        storeId: statePayload.storeId,
        uid: statePayload.uid,
        merchantId: accounts[0].id,
        tokenPayload,
      })

      functions.logger.info('[googleMerchantOAuthCallback] merchant auto-connected', {
        storeId: statePayload.storeId,
        merchantId: accounts[0].id,
        refreshTokenStored: result.refreshTokenStored,
      })

      const target = oauthCallbackDoneUrl({
        ok: true,
        message: 'Google Merchant connected successfully.',
        storeId: statePayload.storeId,
        connectedMerchantId: accounts[0].id,
        refreshTokenMissing: !result.refreshTokenStored,
      })

      if (target) {
        res.redirect(302, target)
        return
      }

      res.status(200).json({ ok: true, mode: 'auto-connected', storeId: statePayload.storeId, merchantId: accounts[0].id })
      return
    }

    const pendingSelectionId = await persistPendingSelection({
      uid: statePayload.uid,
      storeId: statePayload.storeId,
      accounts,
      tokenPayload,
    })

    const target = oauthCallbackDoneUrl({
      ok: true,
      message: 'Multiple merchant accounts found. Choose one to finish setup.',
      storeId: statePayload.storeId,
      pendingSelectionId,
      refreshTokenMissing: !normalizeString(tokenPayload.refresh_token),
    })

    if (target) {
      res.redirect(302, target)
      return
    }

    res.status(200).json({
      ok: true,
      mode: 'select-account',
      storeId: statePayload.storeId,
      pendingSelectionId,
      accounts,
    })
  } catch (error) {
    const message = normalizeError(error)
    functions.logger.error('[googleMerchantOAuthCallback] failed', { message })

    const target = oauthCallbackDoneUrl({ ok: false, message })
    if (target) {
      res.redirect(302, target)
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleMerchantPendingAccounts = functions.https.onRequest(async (req, res) => {
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
    const pendingSelectionId = normalizeString(body.pendingSelectionId)
    if (!pendingSelectionId) {
      res.status(400).json({ error: 'missing-pending-selection-id' })
      return
    }

    const pendingRef = db.collection('googleMerchantPendingSelections').doc(pendingSelectionId)
    const pendingSnap = await pendingRef.get()
    if (!pendingSnap.exists) {
      res.status(404).json({ error: 'pending-selection-not-found' })
      return
    }

    const pendingData = asRecord(pendingSnap.data())
    if (normalizeString(pendingData.uid) !== user.uid) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const expiresAt = pendingData.expiresAt as Timestamp | undefined
    if (!expiresAt || expiresAt.toMillis() < Date.now()) {
      await pendingRef.delete()
      res.status(410).json({ error: 'pending-selection-expired' })
      return
    }

    const accountsRaw = Array.isArray(pendingData.accounts) ? pendingData.accounts : []
    const accounts = accountsRaw.map((entry) => {
      const item = asRecord(entry)
      return {
        id: normalizeString(item.id),
        displayName: normalizeString(item.displayName),
        accountName: normalizeString(item.accountName),
      }
    }).filter((entry) => entry.id)

    functions.logger.info('[googleMerchantPendingAccounts] loaded', { uid: user.uid, pendingSelectionId, count: accounts.length })

    res.status(200).json({
      pendingSelectionId,
      storeId: normalizeString(pendingData.storeId),
      accounts,
      refreshTokenMissing: !normalizeString(asRecord(pendingData.tokenPayload).refresh_token),
    })
  } catch (error) {
    const message = normalizeError(error)
    functions.logger.error('[googleMerchantPendingAccounts] failed', { message })

    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleMerchantSelectAccount = functions.https.onRequest(async (req, res) => {
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
    const pendingSelectionId = normalizeString(body.pendingSelectionId)
    const merchantId = normalizeString(body.merchantId)

    if (!pendingSelectionId || !merchantId) {
      res.status(400).json({ error: 'missing-selection-payload' })
      return
    }

    const pendingRef = db.collection('googleMerchantPendingSelections').doc(pendingSelectionId)
    const pendingSnap = await pendingRef.get()
    if (!pendingSnap.exists) {
      res.status(404).json({ error: 'pending-selection-not-found' })
      return
    }

    const pendingData = asRecord(pendingSnap.data())
    const storeId = normalizeString(pendingData.storeId)
    const pendingUid = normalizeString(pendingData.uid)
    if (pendingUid !== user.uid) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const expiresAt = pendingData.expiresAt as Timestamp | undefined
    if (!expiresAt || expiresAt.toMillis() < Date.now()) {
      await pendingRef.delete()
      res.status(410).json({ error: 'pending-selection-expired' })
      return
    }

    await requireStoreMembership(user.uid, storeId)

    const accountsRaw = Array.isArray(pendingData.accounts) ? pendingData.accounts : []
    const matched = accountsRaw.some((entry) => normalizeString(asRecord(entry).id) === merchantId)
    if (!matched) {
      res.status(400).json({ error: 'invalid-merchant-selection' })
      return
    }

    const tokenPayload = asRecord(pendingData.tokenPayload)
    const result = await saveGoogleMerchantConnection({
      storeId,
      uid: user.uid,
      merchantId,
      tokenPayload,
    })

    await pendingRef.delete()

    functions.logger.info('[googleMerchantSelectAccount] merchant selected and saved', {
      uid: user.uid,
      storeId,
      merchantId,
      refreshTokenStored: result.refreshTokenStored,
    })

    res.status(200).json({ ok: true, merchantId, refreshTokenMissing: !result.refreshTokenStored })
  } catch (error) {
    const message = normalizeError(error)
    functions.logger.error('[googleMerchantSelectAccount] failed', { message })

    if (message === 'missing-auth' || message === 'invalid-auth') {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    if (message === 'store-access-denied') {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    res.status(400).json({ error: message })
  }
})

export const googleShoppingSync = functions.https.onRequest(async (req, res) => {
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
    const mode: GoogleShoppingSyncMode = body.mode === 'incremental' ? 'incremental' : 'full'
    if (!storeId) {
      res.status(400).json({ error: 'missing-store-id' })
      return
    }

    await requireStoreMembership(user.uid, storeId)

    const settingsRef = db.collection('storeSettings').doc(storeId)
    const settingsSnap = await settingsRef.get()
    const googleShopping = asRecord(asRecord(settingsSnap.data()).googleShopping)
    const connection = asRecord(googleShopping.connection)
    const catalogSync = asRecord(googleShopping.catalogSync)

    const merchantId = normalizeString(connection.merchantId)
    const integrationApiKey = normalizeString(catalogSync.integrationApiKey)
    const integrationBaseUrl = normalizeString(catalogSync.integrationBaseUrl)

    if (connection.connected !== true || !merchantId) {
      res.status(400).json({ error: 'merchant-not-connected' })
      return
    }
    if (!integrationApiKey) {
      res.status(400).json({ error: 'missing-integration-api-key' })
      return
    }

    const authContext = await resolveGoogleMerchantAuth(storeId)

    await settingsRef.set(
      {
        googleShopping: {
          status: {
            state: 'running',
            lastMode: mode,
            lastRunAt: FieldValue.serverTimestamp(),
            message: mode === 'full' ? 'Running initial full catalog upload…' : 'Running incremental sync…',
          },
        },
      },
      { merge: true },
    )

    const summary = await runSync({
      storeId,
      mode,
      merchantId,
      accessToken: authContext.accessToken,
      integrationApiKey,
      integrationBaseUrl,
    })

    const statusMessage =
      summary.errors.length > 0 ? `Sync completed with ${summary.errors.length} issue(s).` : 'Sync completed successfully.'
    await persistSyncStatus(storeId, summary, summary.errors.length > 0 ? 'error' : 'success', statusMessage)

    if (summary.errors.length > 0) {
      const tasksRef = settingsRef.collection('googleShoppingFixTasks')
      await Promise.all(
        summary.errors.slice(0, 100).map((error) =>
          tasksRef.doc(error.productId).set(
            {
              productId: error.productId,
              reason: error.reason,
              status: 'open',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
        ),
      )
    }

    res.status(200).json({ ok: true, summary })
  } catch (error) {
    const message = normalizeError(error)
    functions.logger.error('[googleShoppingSync] failed', { message })
    res.status(500).json({ error: message })
  }
})

export const googleShoppingSyncScheduled = functions.pubsub.schedule('every 30 minutes').onRun(async () => {
  const settingsSnap = await db
    .collection('storeSettings')
    .where('googleShopping.catalogSync.autoSyncEnabled', '==', true)
    .limit(25)
    .get()

  for (const settingsDoc of settingsSnap.docs) {
    const storeId = settingsDoc.id
    const googleShopping = asRecord(asRecord(settingsDoc.data()).googleShopping)
    const connection = asRecord(googleShopping.connection)
    const catalogSync = asRecord(googleShopping.catalogSync)

    const merchantId = normalizeString(connection.merchantId)
    const integrationApiKey = normalizeString(catalogSync.integrationApiKey)
    const integrationBaseUrl = normalizeString(catalogSync.integrationBaseUrl)

    if (connection.connected !== true || !merchantId || !integrationApiKey) {
      continue
    }

    try {
      const authContext = await resolveGoogleMerchantAuth(storeId)
      const summary = await runSync({
        storeId,
        mode: 'incremental',
        merchantId,
        accessToken: authContext.accessToken,
        integrationApiKey,
        integrationBaseUrl,
      })
      const state = summary.errors.length > 0 ? 'error' : 'success'
      const message = summary.errors.length > 0 ? `Auto-sync: ${summary.errors.length} issue(s).` : 'Auto-sync successful.'
      await persistSyncStatus(storeId, summary, state, message)
    } catch (error) {
      await db.collection('storeSettings').doc(storeId).set(
        {
          googleShopping: {
            status: {
              state: 'error',
              lastMode: 'incremental',
              lastRunAt: FieldValue.serverTimestamp(),
              message: error instanceof Error ? error.message : 'scheduled-sync-failed',
            },
          },
        },
        { merge: true },
      )
    }
  }

  return null
})
