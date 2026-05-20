import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'
import { queueBrandedNotification } from './notifications'

const SEDIFEX_INTERNAL_ALERT_EMAILS = defineString('SEDIFEX_INTERNAL_ALERT_EMAILS', { default: 'sedifexbiz@gmail.com' })

type AnyRecord = Record<string, unknown>

type CustomerInfo = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

function text(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function email(value: unknown) {
  const cleaned = text(value, 220).toLowerCase()
  return cleaned.includes('@') ? cleaned : ''
}

function getRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {}
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(value => email(value)).filter(Boolean)))
}

function internalAlertEmails() {
  const configured = SEDIFEX_INTERNAL_ALERT_EMAILS.value()?.trim() || process.env.SEDIFEX_INTERNAL_ALERT_EMAILS || process.env.SEDIFEX_INTERNAL_ALERT_EMAIL || 'sedifexbiz@gmail.com'
  return uniqueEmails(configured.split(',').map(value => value.trim()))
}

function isSettled(value: unknown) {
  const normalized = text(value, 80).toLowerCase().replace(/\s+/g, '_')
  return ['paid', 'success', 'confirmed', 'captured', 'completed'].includes(normalized)
}

function hasAlreadySettled(before: AnyRecord | null) {
  if (!before) return false
  const payment = getRecord(before.payment)
  return isSettled(before.status) || isSettled(before.paymentStatus) || isSettled(before.payment_status) || isSettled(payment.status)
}

function customerFromRecord(data: AnyRecord): CustomerInfo {
  const customer = getRecord(data.customer)
  const person = getRecord(data.person)
  const donor = getRecord(data.donor)
  return {
    name: text(customer.name ?? person.name ?? donor.name ?? data.customerName ?? data.name, 160) || null,
    email: email(customer.email ?? person.email ?? donor.email ?? data.customerEmail ?? data.email) || null,
    phone: text(customer.phone ?? person.phone ?? donor.phone ?? data.customerPhone ?? data.phone, 80) || null,
  }
}

async function ensureNgoAlertRecipients(storeId: string) {
  if (!storeId) return []
  const [storeSnap, settingsSnap] = await Promise.all([
    defaultDb.collection('stores').doc(storeId).get(),
    defaultDb.collection('storeSettings').doc(storeId).get(),
  ])

  const store = storeSnap.data() ?? {}
  const settings = settingsSnap.data() ?? {}
  const notifications = getRecord(settings.notifications)
  const existingAdminEmails = Array.isArray(notifications.adminEmails) ? notifications.adminEmails.map(email).filter(Boolean) : []
  const ngoEmail = email(store.email) || email(store.ownerEmail) || email(store.firstSignupEmail) || email(notifications.replyToEmail)
  const adminEmails = uniqueEmails([...existingAdminEmails, ngoEmail, ...internalAlertEmails()])

  if (adminEmails.length) {
    await defaultDb.collection('storeSettings').doc(storeId).set({
      notifications: {
        customerEmailEnabled: notifications.customerEmailEnabled !== false,
        storeAlertEnabled: true,
        adminEmails,
        replyToEmail: email(notifications.replyToEmail) || ngoEmail || adminEmails[0] || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  return adminEmails
}

export const notifyNgoVolunteerApplicationReceived = functions.firestore
  .document('volunteer_applications/{applicationId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as AnyRecord
    const storeId = text(data.storeId, 180)
    if (!storeId) return
    await ensureNgoAlertRecipients(storeId)
    const details = getRecord(data.data)
    await queueBrandedNotification({
      eventType: 'volunteer.created',
      storeId,
      reference: context.params.applicationId,
      customer: customerFromRecord(data),
      data: {
        skill: text(details.skill, 180),
        availability: text(details.availability, 180),
        preferredProject: text(details.preferredProject, 180),
        location: text(details.location, 180),
        notes: text(details.notes, 1000),
      },
      forceStoreAlert: true,
    })
  })

export const notifyNgoSupportRequestReceived = functions.firestore
  .document('support_requests/{requestId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as AnyRecord
    const storeId = text(data.storeId, 180)
    if (!storeId) return
    await ensureNgoAlertRecipients(storeId)
    const details = getRecord(data.data)
    await queueBrandedNotification({
      eventType: 'support_request.created',
      storeId,
      reference: context.params.requestId,
      customer: customerFromRecord(data),
      data: {
        supportType: text(details.supportType, 180),
        needSummary: text(details.needSummary, 1000),
        location: text(details.location, 180),
        notes: text(details.notes, 1000),
      },
      forceStoreAlert: true,
    })
  })

export const notifyNgoDonationSubmitted = functions.firestore
  .document('fund_transactions/{transactionId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as AnyRecord
    const storeId = text(data.storeId, 180)
    const direction = text(data.direction, 40).toLowerCase()
    const payment = getRecord(data.payment)
    const status = text(data.status ?? payment.status, 80)
    if (!storeId || direction === 'outflow' || isSettled(status)) return

    await ensureNgoAlertRecipients(storeId)
    await queueBrandedNotification({
      eventType: 'donation.created',
      storeId,
      reference: text(data.reference ?? data.paymentReference ?? payment.reference, 220) || context.params.transactionId,
      customer: customerFromRecord(data),
      payment: {
        status: status || 'pending',
        amount: numberValue(data.amount ?? payment.amount ?? payment.customerTotal),
        currency: text(data.currency ?? payment.currency, 20) || 'GHS',
        method: text(payment.provider ?? data.paymentMethod, 80) || 'paystack',
        reference: text(data.reference ?? data.paymentReference ?? payment.reference, 220) || null,
      },
      data: {
        project: text(data.project, 220),
        category: text(data.category, 220) || 'Donation',
        notes: text(data.description, 1000),
      },
      forceStoreAlert: true,
    })
  })

export const notifyNgoDonationConfirmed = functions.firestore
  .document('fund_transactions/{transactionId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return
    const data = change.after.data() as AnyRecord
    const before = change.before.exists ? (change.before.data() as AnyRecord) : null
    const storeId = text(data.storeId, 180)
    const direction = text(data.direction, 40).toLowerCase()
    const payment = getRecord(data.payment)
    const status = text(data.status ?? payment.status, 80)
    if (!storeId || direction === 'outflow') return
    if (!isSettled(status) || hasAlreadySettled(before)) return

    await ensureNgoAlertRecipients(storeId)
    await queueBrandedNotification({
      eventType: 'donation.confirmed',
      storeId,
      reference: text(data.paymentReference ?? data.providerReference ?? data.reference ?? payment.reference, 220) || context.params.transactionId,
      customer: customerFromRecord(data),
      payment: {
        status,
        amount: numberValue(data.confirmedAmount ?? data.amount ?? payment.amountPaid ?? payment.amount),
        currency: text(data.currency ?? payment.currency, 20) || 'GHS',
        method: text(payment.provider, 80) || 'paystack',
        reference: text(data.paymentReference ?? data.providerReference ?? data.reference ?? payment.reference, 220) || null,
      },
      data: {
        project: text(data.project, 220),
        category: text(data.category, 220) || 'Donation',
        notes: text(data.description, 1000),
      },
      forceStoreAlert: true,
    })
  })
