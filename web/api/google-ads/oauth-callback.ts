import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  consumeOAuthState,
  discoverGoogleAdsCustomerId,
  exchangeCodeForTokens,
  storeGoogleTokens,
  getOAuthClientConfig,
} from '../_google-ads.js'

function callbackDoneUrl(params: { ok: boolean; message: string; storeId?: string }) {
  const appOrigin = process.env.APP_BASE_URL?.trim() || ''
  if (!appOrigin) return null

  const url = new URL('/ads', appOrigin)
  url.searchParams.set('googleOAuth', params.ok ? 'success' : 'failed')
  url.searchParams.set('message', params.message)
  if (params.storeId) url.searchParams.set('storeId', params.storeId)
  return url.toString()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    getOAuthClientConfig()

    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const oauthError = typeof req.query.error === 'string' ? req.query.error : ''

    if (oauthError) {
      const target = callbackDoneUrl({ ok: false, message: oauthError })
      if (target) return res.redirect(302, target)
      return res.status(400).json({ error: oauthError })
    }

    if (!state || !code) {
      return res.status(400).json({ error: 'state and code are required' })
    }

    const statePayload = await consumeOAuthState(state)
    const tokenPayload = await exchangeCodeForTokens(code)
    const accessToken =
      typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : ''
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
    if (target) return res.redirect(302, target)

    return res.status(200).json({ ok: true, storeId: statePayload.storeId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth-callback-failed'
    const target = callbackDoneUrl({ ok: false, message })
    if (target) return res.redirect(302, target)

    return res.status(400).json({ error: message })
  }
}
