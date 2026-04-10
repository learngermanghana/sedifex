import type { VercelRequest, VercelResponse } from '@vercel/node'
import { consumeGoogleOAuthState, exchangeGoogleCode, storeUnifiedGoogleTokens } from '../_google-oauth.js'

function callbackDoneUrl(params: { ok: boolean; message: string; storeId?: string; integrations?: string[] }) {
  const appOrigin = process.env.APP_BASE_URL?.trim() || ''
  if (!appOrigin) return null

  const url = new URL('/account?tab=integrations', appOrigin)
  url.searchParams.set('googleOAuth', params.ok ? 'success' : 'failed')
  url.searchParams.set('message', params.message)
  if (params.storeId) url.searchParams.set('storeId', params.storeId)
  if (params.integrations?.length) url.searchParams.set('integrations', params.integrations.join(','))
  return url.toString()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const oauthError = typeof req.query.error === 'string' ? req.query.error : ''

    if (oauthError) {
      const target = callbackDoneUrl({ ok: false, message: oauthError })
      if (target) return res.redirect(302, target)
      return res.status(400).json({ error: oauthError })
    }
    if (!state || !code) return res.status(400).json({ error: 'state and code are required' })

    const statePayload = await consumeGoogleOAuthState(state)
    const tokenPayload = await exchangeGoogleCode(code)

    await storeUnifiedGoogleTokens({
      storeId: statePayload.storeId,
      uid: statePayload.uid,
      tokenPayload,
      integrationHints: statePayload.integrations,
      adsCustomerId: statePayload.adsCustomerId,
      adsManagerId: statePayload.adsManagerId,
      accountEmail: statePayload.accountEmail,
    })

    const target = callbackDoneUrl({ ok: true, message: 'Google connected', storeId: statePayload.storeId, integrations: statePayload.integrations })
    if (target) return res.redirect(302, target)

    return res.status(200).json({ ok: true, storeId: statePayload.storeId, integrations: statePayload.integrations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth-callback-failed'
    const target = callbackDoneUrl({ ok: false, message })
    if (target) return res.redirect(302, target)
    return res.status(400).json({ error: message })
  }
}
