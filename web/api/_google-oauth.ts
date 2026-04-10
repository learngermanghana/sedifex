import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

export type GoogleIntegration = 'business' | 'ads' | 'merchant'

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHARED_CALLBACK_PATH = '/api/google/oauth-callback'

const INTEGRATION_SCOPES: Record<GoogleIntegration, string> = {
  business: 'https://www.googleapis.com/auth/business.manage',
  ads: 'https://www.googleapis.com/auth/adwords',
  merchant: 'https://www.googleapis.com/auth/content',
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || ''

  const appBase = process.env.APP_BASE_URL?.trim() || ''
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || (appBase ? new URL(SHARED_CALLBACK_PATH, appBase).toString() : '')

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('google-oauth-config-missing')
  }

  return { clientId, clientSecret, redirectUri }
}

function normalizeIntegrations(raw: unknown): GoogleIntegration[] {
  const entries = Array.isArray(raw) ? raw : [raw]
  const unique = new Set<GoogleIntegration>()

  for (const entry of entries) {
    if (entry === 'business' || entry === 'ads' || entry === 'merchant') unique.add(entry)
  }

  if (!unique.size) throw new Error('invalid-google-integration')
  return Array.from(unique)
}

export function getRequiredScopesForIntegrations(integrations: GoogleIntegration[]): string[] {
  const scopes = new Set<string>()
  for (const integration of integrations) scopes.add(INTEGRATION_SCOPES[integration])
  return Array.from(scopes)
}

export function parseGrantedScopes(scopeValue: unknown): Set<string> {
  if (typeof scopeValue !== 'string') return new Set()
  return new Set(scopeValue.split(/\s+/).map(v => v.trim()).filter(Boolean))
}

export function hasScope(granted: Set<string>, requiredScope: string): boolean {
  return granted.has(requiredScope)
}

export async function getGrantedScopesForStore(storeId: string): Promise<Set<string>> {
  const snap = await db().doc(`storeSettings/${storeId}`).get()
  const data = (snap.data() ?? {}) as Record<string, any>
  const oauth = (data.integrations?.googleOAuth ?? {}) as Record<string, unknown>
  return parseGrantedScopes(oauth.scope)
}

export async function buildGoogleOAuthStartUrl(params: {
  uid: string
  storeId: string
  integrations: unknown
  csrfToken?: string
  adsCustomerId?: string
  adsManagerId?: string
  accountEmail?: string
}) {
  const integrations = normalizeIntegrations(params.integrations)
  const { clientId, redirectUri } = getOAuthConfig()
  const existingScopes = await getGrantedScopesForStore(params.storeId)
  const requestedScopes = getRequiredScopesForIntegrations(integrations)
  const scopes = new Set<string>(['openid', 'email', 'profile', ...requestedScopes, ...existingScopes])

  const statePayload = {
    nonce: randomBytes(12).toString('hex'),
    uid: params.uid,
    storeId: params.storeId,
    integrations,
    csrfToken: (params.csrfToken || randomBytes(16).toString('hex')).trim(),
    adsCustomerId: params.adsCustomerId || '',
    adsManagerId: params.adsManagerId || '',
    accountEmail: params.accountEmail || '',
    issuedAt: Date.now(),
  }

  const rawState = Buffer.from(JSON.stringify(statePayload), 'utf8').toString('base64url')
  const stateHash = hashSecret(rawState)

  await db().collection('googleOAuthStates').doc(stateHash).set({
    ...statePayload,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  })

  const url = new URL(GOOGLE_OAUTH_BASE)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', Array.from(scopes).join(' '))
  url.searchParams.set('state', rawState)

  return { url: url.toString(), csrfToken: statePayload.csrfToken }
}

export async function consumeGoogleOAuthState(rawState: string) {
  const stateHash = hashSecret(rawState)
  const ref = db().collection('googleOAuthStates').doc(stateHash)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('invalid-state')
  const payload = (snap.data() ?? {}) as Record<string, any>
  await ref.delete()

  const expiresAt = payload.expiresAt as Timestamp | undefined
  if (!expiresAt || expiresAt.toMillis() < Date.now()) throw new Error('expired-state')

  return {
    uid: typeof payload.uid === 'string' ? payload.uid : '',
    storeId: typeof payload.storeId === 'string' ? payload.storeId : '',
    integrations: normalizeIntegrations(payload.integrations),
    csrfToken: typeof payload.csrfToken === 'string' ? payload.csrfToken : '',
    adsCustomerId: typeof payload.adsCustomerId === 'string' ? payload.adsCustomerId : '',
    adsManagerId: typeof payload.adsManagerId === 'string' ? payload.adsManagerId : '',
    accountEmail: typeof payload.accountEmail === 'string' ? payload.accountEmail : '',
  }
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig()
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
  if (!response.ok) throw new Error(`token-exchange-failed:${String(payload.error || response.status)}`)
  return payload
}

function parseTokenExpiry(payload: Record<string, unknown>): Timestamp | null {
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in || 0)
  return expiresIn > 0 ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null
}

export async function storeUnifiedGoogleTokens(params: {
  storeId: string
  uid: string
  tokenPayload: Record<string, unknown>
  integrationHints: GoogleIntegration[]
  adsCustomerId?: string
  adsManagerId?: string
  accountEmail?: string
}) {
  const accessToken = typeof params.tokenPayload.access_token === 'string' ? params.tokenPayload.access_token : ''
  const refreshToken = typeof params.tokenPayload.refresh_token === 'string' ? params.tokenPayload.refresh_token : ''
  const tokenType = typeof params.tokenPayload.token_type === 'string' ? params.tokenPayload.token_type : 'Bearer'
  const scope = typeof params.tokenPayload.scope === 'string' ? params.tokenPayload.scope : ''
  if (!accessToken) throw new Error('missing-access-token')

  const integrations: Record<string, unknown> = {
    googleOAuth: {
      accessToken,
      refreshToken: refreshToken || FieldValue.delete(),
      tokenType,
      scope,
      grantedScopes: Array.from(parseGrantedScopes(scope)),
      oauthUserId: params.uid,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: parseTokenExpiry(params.tokenPayload),
    },
  }

  if (params.integrationHints.includes('business')) {
    integrations.googleBusinessProfile = {
      accessToken,
      refreshToken: refreshToken || FieldValue.delete(),
      tokenType,
      scope,
      oauthUserId: params.uid,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: parseTokenExpiry(params.tokenPayload),
    }
  }
  if (params.integrationHints.includes('ads')) {
    integrations.googleAds = {
      accessToken,
      refreshToken: refreshToken || FieldValue.delete(),
      tokenType,
      scope,
      connectedByUid: params.uid,
      customerId: params.adsCustomerId || '',
      managerId: params.adsManagerId || '',
      connectedEmail: params.accountEmail || '',
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: parseTokenExpiry(params.tokenPayload),
    }
  }
  if (params.integrationHints.includes('merchant')) {
    integrations.googleMerchant = {
      accessToken,
      refreshToken: refreshToken || FieldValue.delete(),
      tokenType,
      scope,
      oauthUserId: params.uid,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: parseTokenExpiry(params.tokenPayload),
    }
  }

  const updatePayload: Record<string, unknown> = { integrations }
  if (params.integrationHints.includes('ads')) {
    updatePayload.googleAdsAutomation = {
      connection: {
        connected: true,
        accountEmail: params.accountEmail || '',
        customerId: params.adsCustomerId || '',
        managerId: params.adsManagerId || '',
        connectedAt: FieldValue.serverTimestamp(),
        oauthUserId: params.uid,
      },
    }
  }

  await db().doc(`storeSettings/${params.storeId}`).set(updatePayload, { merge: true })
}

export const GOOGLE_REQUIRED_SCOPE = INTEGRATION_SCOPES
