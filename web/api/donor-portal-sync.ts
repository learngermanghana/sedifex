import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'
import { calculateCheckoutFees, toPaystackMinorAmount } from './_checkout-fees.js'

function text(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function nullableText(value: unknown, max = 500) {
  const cleaned = text(value, max)
  return cleaned || null
}

function resolveReturnUrl(req: VercelRequest) {
  const explicit = text(req.body?.returnUrl ?? req.body?.redirectUrl, 500)
  if (explicit) return explicit
  const origin = text(req.headers.origin, 500)
  if (origin) return `${origin.replace(/\/$/, '')}/donation-success`
  return undefined
}

function getPaystackSecret() {
  return (
    process.env.PAYSTACK_SECRET ||
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET_KEY_LIVE ||
    ''
  ).trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  const storeId = text(req.body?.storeId, 120)
  const name = text(req.body?.donor?.name, 120)
  const email = text(req.body?.donor?.email, 120).toLowerCase()
  const phone = text(req.body?.donor?.phone, 40)
  const amount = Number(req.body?.amount ?? req.body?.donation?.amount)
  const currency = text(req.body?.currency ?? req.body?.donation?.currency, 10) || 'GHS'
  const initializePayment = Boolean(req.body?.initializePayment)
  const sourceChannel = text(req.body?.sourceChannel, 120) || 'website'
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata as Record<string, unknown> : {}

  if (!storeId || !name || (!email && !phone)) {
    return res.status(400).json({ error: 'storeId, donor name, and email or phone are required.' })
  }

  const firestore = db()
  const now = FieldValue.serverTimestamp()
  const donorRef = await firestore.collection('donor_profiles').add({
    storeId,
    name,
    email: email || null,
    phone: phone || null,
    source: sourceChannel,
    latestDonationAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
    latestDonationCurrency: currency,
    createdAt: now,
    updatedAt: now,
  })

  let payment: Record<string, unknown> | null = null
  let donationTransactionId: string | null = null

  if (initializePayment) {
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valid amount is required for payment.' })
    const reference = `DON-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const feePolicy = calculateCheckoutFees({ amount, currency, useCase: 'donation' })
    const returnUrl = resolveReturnUrl(req)

    const txRef = await firestore.collection('fund_transactions').add({
      storeId,
      donorId: donorRef.id,
      direction: 'inflow',
      amount,
      currency,
      status: 'pending_payment',
      reference,
      paymentReference: reference,
      source: sourceChannel,
      category: 'Donation',
      project: text(req.body?.pageId, 120) || 'donate',
      description: nullableText(metadata.message, 1000) || 'Website donation intent',
      date: new Date().toISOString().slice(0, 10),
      payment: {
        provider: 'paystack',
        status: 'pending',
        amount,
        currency,
        reference,
        feePolicy,
        customerTotal: feePolicy.customerTotalMajor,
        sedifexCommission: feePolicy.sedifexCommissionMajor,
        merchantNet: feePolicy.merchantNetMajor,
      },
      donor: {
        name,
        email: email || null,
        phone: phone || null,
        anonymous: Boolean(metadata.anonymous),
      },
      metadata: {
        ...metadata,
        source: metadata.source || sourceChannel,
        returnUrl: returnUrl || null,
      },
      createdAt: now,
      updatedAt: now,
    })
    donationTransactionId = txRef.id

    const secret = getPaystackSecret()
    if (secret) {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || `${reference}@noemail.local`,
          amount: toPaystackMinorAmount(feePolicy),
          reference,
          currency,
          callback_url: returnUrl,
          metadata: {
            storeId,
            donorId: donorRef.id,
            fundTransactionId: txRef.id,
            pageType: 'donation',
            sourceChannel,
            feePolicy,
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      const authorizationUrl = body?.data?.authorization_url ?? null
      payment = {
        provider: 'paystack',
        reference,
        ok: response.ok && Boolean(authorizationUrl),
        authorizationUrl,
        accessCode: body?.data?.access_code ?? null,
        feePolicy,
        error: response.ok && authorizationUrl ? null : body?.message || 'Paystack did not return a checkout URL',
      }

      await txRef.set({
        'payment.initializeOk': response.ok && Boolean(authorizationUrl),
        'payment.authorizationUrl': authorizationUrl,
        'payment.accessCode': body?.data?.access_code ?? null,
        'payment.initializeRaw': response.ok && authorizationUrl ? null : body,
        'payment.initializeError': response.ok && authorizationUrl ? null : body?.message || 'Paystack did not return a checkout URL',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      if (!response.ok || !authorizationUrl) {
        return res.status(502).json({
          ok: false,
          error: body?.message || 'Unable to start Paystack checkout.',
          donorId: donorRef.id,
          donationTransactionId,
          payment,
        })
      }
    } else {
      payment = { provider: 'paystack', reference, ok: false, authorizationUrl: null, accessCode: null, feePolicy, error: 'PAYSTACK_SECRET or PAYSTACK_SECRET_KEY missing' }
      await txRef.set({ 'payment.initializeOk': false, 'payment.initializeError': 'PAYSTACK_SECRET or PAYSTACK_SECRET_KEY missing', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return res.status(500).json({
        ok: false,
        error: 'Paystack secret is not configured on Sedifex.',
        donorId: donorRef.id,
        donationTransactionId,
        payment,
      })
    }
  }

  return res.status(200).json({ ok: true, donorId: donorRef.id, donationTransactionId, payment })
}
