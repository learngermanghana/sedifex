/**
 * ChatGPT public OAuth client identification (CIMD).
 *
 * Only ChatGPT's pinned HTTPS metadata endpoints are accepted. Never fetch an
 * arbitrary user-controlled URL, follow a redirect or accept an unverified
 * callback URI. The built-in Sedifex pilot client remains supported while
 * existing installed plugin versions are migrated.
 */
const STABLE_ID = 'https://chatgpt.com/oauth/client.json'
const STABLE_CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect'
const CALLBACK_ID = /^https:\/\/chatgpt\.com\/oauth\/([A-Za-z0-9_-]{8,128})\/client\.json$/
const cache = new Map<string, { until: number; redirects: string[] }>()

export function isSedifexOAuthClient(clientId: unknown) {
  return typeof clientId === 'string' &&
    (clientId === STABLE_ID || CALLBACK_ID.test(clientId) ||
      (Boolean(process.env.SEDIFEX_OAUTH_CLIENT_ID) && clientId === process.env.SEDIFEX_OAUTH_CLIENT_ID))
}

export async function permittedSedifexCallback(clientId: unknown, redirectUri: unknown): Promise<boolean> {
  if (!isSedifexOAuthClient(clientId) || typeof redirectUri !== 'string') return false
  const id = clientId as string
  if (id === process.env.SEDIFEX_OAUTH_CLIENT_ID) {
    return Boolean(process.env.SEDIFEX_OAUTH_REDIRECT_URI) &&
      redirectUri === process.env.SEDIFEX_OAUTH_REDIRECT_URI
  }

  // No outbound requests except these two fixed-format ChatGPT URL patterns.
  const expected = id === STABLE_ID ? STABLE_CALLBACK :
    'https://chatgpt.com/connector/oauth/' + CALLBACK_ID.exec(id)![1]
  if (redirectUri !== expected) return false

  const stored = cache.get(id)
  if (stored && stored.until > Date.now()) return stored.redirects.includes(redirectUri)
  try {
    const response = await fetch(id, {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return false
    const raw = await response.text()
    if (raw.length > 16384) return false
    const document = JSON.parse(raw) as Record<string, unknown>
    const methods = Array.isArray(document.token_endpoint_auth_methods_supported)
      ? document.token_endpoint_auth_methods_supported
      : [document.token_endpoint_auth_method]
    const redirects = document.redirect_uris
    const safe = document.client_id === id &&
      Array.isArray(redirects) && redirects.every(v => typeof v === 'string') &&
      redirects.includes(redirectUri) &&
      Array.isArray(document.grant_types) && document.grant_types.includes('authorization_code') &&
      Array.isArray(document.response_types) && document.response_types.includes('code') &&
      methods.includes('none')
    if (!safe) return false
    cache.set(id, { until: Date.now() + 5 * 60000, redirects: redirects as string[] })
    return true
  } catch {
    // Fail closed when the ChatGPT metadata cannot be verified.
    return false
  }
}

export function clearSedifexClientMetadataCacheForTests() {
  cache.clear()
}
