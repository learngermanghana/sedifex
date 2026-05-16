import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { admin, defaultDb } from './firestore'

const PAYSTACK_SECRET = defineString('PAYSTACK_SECRET_KEY')
const DEFAULT_COMMISSION_PERCENT = defineString('SEDIFEX_DEFAULT_PAYSTACK_COMMISSION_PERCENT', {
  default: '3',
})

type PaystackSubaccountInput = {
  storeId?: unknown
  businessName?: unknown
  settlementBank?: unknown
  bankCode?: unknown
  accountNumber?: unknown
  percentageCharge?: unknown
  description?: unknown
  primaryContactEmail?: unknown
  primaryContactName?: unknown
  primaryContactPhone?: unknown
}

type PaystackSubaccountResponse = {
  status: boolean
  message?: string
  data?: {
    id?: number
    business_name?: string
    account_number?: string
    account_name?: string
    subaccount_code?: string
    percentage_charge?: number
    settlement_bank?: string
    bank_id?: number
    currency?: string
    active?: boolean | number
    is_verified?: boolean
    domain?: string
    createdAt?: string
    updatedAt?: string
  }
}

function getPaystackSecret() {
  const secret = PAYSTACK_SECRET.value()?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || ''
  if (!secret) {
    throw new functions.https.HttpsError('failed-precondition', 'PAYSTACK_SECRET_KEY is not configured.')
  }
  return secret
}

function cleanText(value: unknown, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanPercentage(value: unknown) {
  const fallback = Number(DEFAULT_COMMISSION_PERCENT.value() || process.env.SEDIFEX_DEFAULT_PAYSTACK_COMMISSION_PERCENT || 3)
  const parsed = Number(value)
  const percentage = Number.isFinite(parsed) ? parsed : fallback
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'percentageCharge must be between 0 and 100.')
  }
  return Math.round(percentage * 100) / 100
}

function assertAuthenticated(context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
}

async function assertStoreOwner(context: functions.https.CallableContext, storeId: string) {
  assertAuthenticated(context)
  const uid = context.auth!.uid
  const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
  const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
  const ownerUid = cleanText(storeData.ownerUid, 180)
  const storeOwnerEmail = cleanText(storeData.ownerEmail ?? storeData.email, 220).toLowerCase()
  const authEmail = cleanText(context.auth!.token.email, 220).toLowerCase()

  if (storeId === uid || ownerUid === uid || (storeOwnerEmail && authEmail && storeOwnerEmail === authEmail)) {
    return storeData
  }

  const memberSnap = await defaultDb.collection('teamMembers').doc(uid).get()
  const memberData = (memberSnap.data() ?? {}) as Record<string, unknown>
  const memberStoreId = cleanText(memberData.storeId, 180)
  const role = cleanText(memberData.role, 40).toLowerCase()
  if (memberStoreId === storeId && role === 'owner') return storeData

  throw new functions.https.HttpsError('permission-denied', 'Only the workspace owner can manage Paystack settlement.')
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPaystackSecret()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => null)) as T & { message?: string; status?: boolean }
  if (!response.ok || (payload && typeof payload.status === 'boolean' && !payload.status)) {
    const message = payload?.message || `Paystack request failed (${response.status})`
    throw new functions.https.HttpsError('internal', message)
  }
  return payload
}

function buildSubaccountDoc(input: {
  storeId: string
  request: Record<string, unknown>
  data: NonNullable<PaystackSubaccountResponse['data']>
  percentageCharge: number
  actorUid: string
}) {
  const now = admin.firestore.FieldValue.serverTimestamp()
  return {
    storeId: input.storeId,
    provider: 'paystack',
    status: 'active',
    subaccountCode: input.data.subaccount_code ?? null,
    subaccountId: input.data.id ?? null,
    businessName: input.data.business_name ?? input.request.business_name ?? null,
    accountName: input.data.account_name ?? null,
    accountNumberLast4: input.data.account_number ? String(input.data.account_number).slice(-4) : null,
    settlementBank: input.data.settlement_bank ?? input.request.settlement_bank ?? null,
    percentageCharge: input.data.percentage_charge ?? input.percentageCharge,
    currency: input.data.currency ?? 'GHS',
    active: input.data.active ?? true,
    isVerified: input.data.is_verified ?? false,
    domain: input.data.domain ?? null,
    lastPayload: input.data,
    updatedBy: input.actorUid,
    updatedAt: now,
    createdAt: now,
  }
}

export const createPaystackMerchantSubaccount = functions.https.onCall(
  async (rawData: PaystackSubaccountInput | undefined, context) => {
    const storeId = cleanText(rawData?.storeId, 180)
    if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
    const storeData = await assertStoreOwner(context, storeId)

    const businessName = cleanText(rawData?.businessName, 120) || cleanText(storeData.name ?? storeData.displayName, 120)
    const settlementBank = cleanText(rawData?.settlementBank ?? rawData?.bankCode, 30)
    const accountNumber = cleanText(rawData?.accountNumber, 30)
    const percentageCharge = cleanPercentage(rawData?.percentageCharge)
    const primaryContactEmail = cleanText(rawData?.primaryContactEmail, 220) || cleanText(storeData.ownerEmail ?? storeData.email, 220)
    const primaryContactName = cleanText(rawData?.primaryContactName, 160) || cleanText(storeData.displayName ?? storeData.name, 160)
    const primaryContactPhone = cleanText(rawData?.primaryContactPhone, 80) || cleanText(storeData.phone, 80)
    const description = cleanText(rawData?.description, 220) || `Sedifex settlement account for ${businessName || storeId}`

    if (!businessName) throw new functions.https.HttpsError('invalid-argument', 'businessName is required.')
    if (!settlementBank) throw new functions.https.HttpsError('invalid-argument', 'settlementBank/bankCode is required.')
    if (!accountNumber) throw new functions.https.HttpsError('invalid-argument', 'accountNumber is required.')

    const requestPayload = {
      business_name: businessName,
      settlement_bank: settlementBank,
      account_number: accountNumber,
      percentage_charge: percentageCharge,
      description,
      primary_contact_email: primaryContactEmail || undefined,
      primary_contact_name: primaryContactName || undefined,
      primary_contact_phone: primaryContactPhone || undefined,
      metadata: JSON.stringify({
        storeId,
        platform: 'sedifex',
        source: 'sedifex_dashboard',
      }),
    }

    const response = await paystackRequest<PaystackSubaccountResponse>('/subaccount', {
      method: 'POST',
      body: JSON.stringify(requestPayload),
    })

    if (!response.data?.subaccount_code) {
      throw new functions.https.HttpsError('internal', 'Paystack did not return a subaccount code.')
    }

    const docPayload = buildSubaccountDoc({
      storeId,
      request: requestPayload,
      data: response.data,
      percentageCharge,
      actorUid: context.auth!.uid,
    })

    await defaultDb.collection('paystackSubaccounts').doc(storeId).set(docPayload, { merge: true })
    await defaultDb.collection('stores').doc(storeId).set(
      {
        paymentRouting: {
          provider: 'paystack',
          settlementMode: 'subaccount',
          paystackSubaccountCode: response.data.subaccount_code,
          percentageCharge: docPayload.percentageCharge,
          accountName: docPayload.accountName,
          accountNumberLast4: docPayload.accountNumberLast4,
          settlementBank: docPayload.settlementBank,
          status: 'active',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        paystackSubaccountCode: response.data.subaccount_code,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return {
      ok: true,
      storeId,
      subaccountCode: response.data.subaccount_code,
      accountName: response.data.account_name ?? null,
      accountNumberLast4: docPayload.accountNumberLast4,
      settlementBank: docPayload.settlementBank,
      percentageCharge: docPayload.percentageCharge,
      isVerified: docPayload.isVerified,
      message: response.message ?? 'Subaccount created',
    }
  },
)

export const fetchPaystackMerchantSubaccount = functions.https.onCall(
  async (rawData: { storeId?: unknown } | undefined, context) => {
    const storeId = cleanText(rawData?.storeId, 180)
    if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
    await assertStoreOwner(context, storeId)

    const storedSnap = await defaultDb.collection('paystackSubaccounts').doc(storeId).get()
    const stored = (storedSnap.data() ?? {}) as Record<string, unknown>
    const subaccountCode = cleanText(stored.subaccountCode, 80)

    if (!subaccountCode) {
      return { ok: true, configured: false, storeId }
    }

    let liveData: PaystackSubaccountResponse['data'] | null = null
    try {
      const live = await paystackRequest<PaystackSubaccountResponse>(`/subaccount/${encodeURIComponent(subaccountCode)}`, {
        method: 'GET',
      })
      liveData = live.data ?? null
      if (liveData) {
        await defaultDb.collection('paystackSubaccounts').doc(storeId).set(
          {
            lastPayload: liveData,
            accountName: liveData.account_name ?? stored.accountName ?? null,
            active: liveData.active ?? stored.active ?? true,
            isVerified: liveData.is_verified ?? stored.isVerified ?? false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
    } catch (error) {
      functions.logger.warn('Unable to fetch live Paystack subaccount', { storeId, subaccountCode, error })
    }

    return {
      ok: true,
      configured: true,
      storeId,
      subaccountCode,
      accountName: liveData?.account_name ?? stored.accountName ?? null,
      accountNumberLast4: stored.accountNumberLast4 ?? null,
      settlementBank: liveData?.settlement_bank ?? stored.settlementBank ?? null,
      percentageCharge: liveData?.percentage_charge ?? stored.percentageCharge ?? null,
      active: liveData?.active ?? stored.active ?? null,
      isVerified: liveData?.is_verified ?? stored.isVerified ?? null,
      currency: liveData?.currency ?? stored.currency ?? null,
    }
  },
)
