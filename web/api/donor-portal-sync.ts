import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './_firebase-admin.js'

function text(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  const storeId = text(req.body?.storeId, 120)
  const name = text(req.body?.donor?.name, 120)
  const email = text(req.body?.donor?.email, 120).toLowerCase()
  const phone = text(req.body?.donor?.phone, 40)
  const amount = Number(req.body?.amount)
  const currency = text(req.body?.currency, 10) || 'GHS'
  const initializePayment = Boolean(req.body?.initializePayment)

  if (!storeId || !name || (!email && !phone)) {
    return res.status(400).json({ error: 'storeId, donor name, and email or phone are required.' })
  }

  const firestore = db()
  const donorRef = await firestore.collection('donor_profiles').add({
    storeId, name, email: email || null, phone: phone || null,
    source: 'website', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })

  let payment: Record<string, unknown> | null = null
  if (initializePayment) {
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valid amount is required for payment.' })
    const reference = `DON-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await firestore.collection('fund_transactions').add({
      storeId, donorId: donorRef.id, direction: 'inflow', amount, currency, status: 'pending', reference,
      source: 'website', date: new Date().toISOString().slice(0, 10), createdAt: FieldValue.serverTimestamp(),
    })

    const secret = process.env.PAYSTACK_SECRET || ''
    if (secret) {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || `${reference}@noemail.local`, amount: Math.round(amount * 100), reference, currency }),
      })
      const body = await response.json()
      payment = {
        provider: 'paystack',
        reference,
        ok: response.ok,
        authorizationUrl: body?.data?.authorization_url ?? null,
        accessCode: body?.data?.access_code ?? null,
      }
    }
  }

  return res.status(200).json({ ok: true, donorId: donorRef.id, payment })
}
