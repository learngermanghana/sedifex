import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'
import { isEmailAutomationEnabled, loadAutomationSettings } from './automationSettings'
import { bookingStoreRecipients } from './bookingNotificationRecipients'

// One Sedifex-owned Apps Script deploy, shared by every merchant. Never use
// the merchant's bulkEmailIntegration webAppUrl for transactional notifications.
const SEDIFEX_NOTIFICATION_WEBHOOK_URL = defineString('SEDIFEX_NOTIFICATION_WEBHOOK_URL', { default: '' })
const SEDIFEX_NOTIFICATION_SHARED_SECRET = defineString('SEDIFEX_NOTIFICATION_SHARED_SECRET', { default: '' })

type RecordMap = Record<string, unknown>

export type TransactionalEmailDeliveryInput = {
  storeId: string
  eventType: string
  reference: string
  recipientType: string
  to: string
  subject: string
  html: string
  text: string
  brand?: RecordMap | null
  customer?: RecordMap | null
  payment?: RecordMap | null
  data?: RecordMap | null
  webhookPayload?: RecordMap | null
}

export type TransactionalEmailDeliveryResult = {
  attempted: boolean
  ok: boolean
  status: number | null
  channel: 'sedifex_notification' | 'outbox_only'
  deliveryStatus: 'sent' | 'queued' | 'duplicate' | 'failed' | 'outbox'
  senderName: string
  senderEmail: string
  replyToEmail: string
  reason?: string
  receiptNumber?: string
  receiptUrl?: string
}

function text(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function email(value: unknown): string {
  const cleaned = text(value, 220).toLowerCase()
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(cleaned) ? cleaned : ''
}

/**
 * All Sedifex transactional email, including scheduled booking reminders, uses
 * the platform-owned Apps Script. Legacy delivery preferences are ignored.
 */
export function useCentralBookingSender(eventType: string, _preference?: string): boolean {
  return Boolean(eventType.trim())
}

/** The existing Sedifex Apps Script responds with {sent:true} or
 * {skipped:true,reason:'duplicate'}, unlike the newer sample script.
 */
export function interpretSedifexNotificationResponse(body: RecordMap) {
  return {
    sent: body.sent === true || body.sent === 1,
    duplicate: body.duplicate === true || (body.skipped === true && body.reason === 'duplicate'),
  }
}

function notDelivered(
  storeName: string,
  replyToEmail: string,
  reason: string,
  attempted = false,
): TransactionalEmailDeliveryResult {
  return {
    attempted,
    ok: false,
    status: null,
    channel: 'sedifex_notification',
    deliveryStatus: 'failed',
    senderName: `Sedifex · ${storeName}`,
    senderEmail: '',
    replyToEmail,
    reason,
  }
}

/**
 * A 200 from an Apps Script web app isn't evidence of a sent email: doPost
 * returns HTTP 200 even when its JSON body is {ok:false}. Check both.
 */
export async function deliverTransactionalEmail(
  input: TransactionalEmailDeliveryInput,
): Promise<TransactionalEmailDeliveryResult> {
  const settings = await loadAutomationSettings(input.storeId)
  const storeSnapshot = await defaultDb.collection('stores').doc(input.storeId).get()
  const store = storeSnapshot.data() ?? {}
  const storeName = text(store.displayName, 180)
    || text(store.businessName, 180)
    || text(store.name, 180) || 'Sedifex Business'

  if (!storeSnapshot.exists) return notDelivered(storeName, '', 'store-not-found')
  if (!isEmailAutomationEnabled(settings, input.eventType)) {
    return {
      attempted: false,
      ok: true,
      status: null,
      channel: 'outbox_only',
      deliveryStatus: 'outbox',
      senderName: `Sedifex · ${storeName}`,
      senderEmail: '',
      replyToEmail: '',
      reason: 'automation-disabled',
    }
  }

  // Store/admin recipients are derived from verified Firebase Auth membership,
  // not from user-editable adminEmails, store.email or a merchant Apps Script.
  const { adminEmails } = (await defaultDb.collection('storeSettings').doc(input.storeId).get())
    .data()?.notifications || {}
  const approvedStoreRecipients = await bookingStoreRecipients(
    input.storeId, Array.isArray(adminEmails) ? adminEmails : [],
  )
  const replyTo = (await bookingStoreRecipients(input.storeId, []))[0] || ''
  const recipient = email(input.to)

  if (!recipient || (input.recipientType !== 'customer' && input.recipientType !== 'store')) {
    return notDelivered(storeName, replyTo, 'invalid-recipient')
  }
  if (input.recipientType === 'store' && !approvedStoreRecipients.includes(recipient)) {
    return notDelivered(storeName, replyTo, 'unverified-or-cross-store-recipient')
  }

  // Reuse the already deployed Sedifex Central Notification Web App and its
  // existing Firebase environment variables; no second Gmail script needed.
  const url = SEDIFEX_NOTIFICATION_WEBHOOK_URL.value()?.trim()
    || process.env.SEDIFEX_NOTIFICATION_WEBHOOK_URL?.trim() || ''
  const secret = SEDIFEX_NOTIFICATION_SHARED_SECRET.value()?.trim()
    || process.env.SEDIFEX_NOTIFICATION_SHARED_SECRET?.trim() || ''

  // Only a Google Apps Script /exec deployment belonging to the Sedifex
  // project is accepted by configuration. The deployed script must also
  // validate the 32+ character shared secret in its Script Properties.
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/i.test(url)
    || secret.length < 32) {
    return notDelivered(storeName, replyTo, 'sedifex-notification-web-app-not-configured')
  }
  if (!input.storeId || !input.eventType || !input.reference || !input.subject
    || !(input.text || input.html)) {
    return notDelivered(storeName, replyTo, 'missing-required-email-fields')
  }

  const base = notDelivered(storeName, replyTo, 'sedifex-apps-script-error', true)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret,
        storeId: input.storeId,
        eventType: input.eventType,
        reference: input.reference,
        recipientType: input.recipientType,
        to: recipient,
        subject: input.subject,
        html: input.html,
        text: input.text,
        storeName,
        replyTo: replyTo || null,
        // The existing Sedifex script generates branded PDF receipts from
        // brand/customer/payment/data. Keep its original payload contract.
        brand: { ...(input.brand || {}), storeName, email: replyTo || '' },
        customer: input.customer || null,
        payment: input.payment || null,
        data: input.data || null,
      }),
    })
    const body = await response.json().catch(() => ({})) as RecordMap
    const { duplicate, sent } = interpretSedifexNotificationResponse(body)
    const accepted = response.ok && body.ok === true && (sent || duplicate)
    return {
      ...base,
      ok: accepted,
      status: response.status,
      deliveryStatus: accepted ? (duplicate ? 'duplicate' : 'sent') : 'failed',
      receiptNumber: accepted ? text(body.receiptNumber, 180) || undefined : undefined,
      receiptUrl: accepted ? text(body.receiptUrl, 1200) || undefined : undefined,
      reason: accepted ? undefined : text(body.error, 180) || `sedifex-apps-script-http-${response.status}`,
    }
  } catch (error) {
    return {
      ...base,
      reason: error instanceof Error ? error.message : 'sedifex-apps-script-network-failure',
    }
  }
}
