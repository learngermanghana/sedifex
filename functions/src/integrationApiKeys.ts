import * as crypto from 'crypto'
import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'

type CreateIntegrationApiKeyRequest = {
  storeId?: unknown
  name?: unknown
  purpose?: unknown
}

type ListIntegrationApiKeysRequest = {
  storeId?: unknown
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function redact(value: string) {
  if (!value) return null
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function hashToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function canManageStore(authUid: string, storeId: string) {
  return defaultDb.collection('teamMembers').doc(authUid).get().then(snap => {
    if (!snap.exists) return false
    const data = (snap.data() ?? {}) as Record<string, unknown>
    return clean(data.storeId, 180) === storeId
  })
}

function getKeyPreview(data: Record<string, unknown>) {
  const explicitPreview = clean(data.keyPreview ?? data.preview ?? data.keyHint, 80)
  if (explicitPreview) return explicitPreview

  const token = clean(data.token ?? data.key ?? data.apiKey ?? data.value, 1000)
  return redact(token) ?? 'sedx...'
}

export const createIntegrationApiKey = functions.https.onCall(async (rawData: unknown, context) => {
  const uid = context.auth?.uid
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')

  const body = (rawData ?? {}) as CreateIntegrationApiKeyRequest
  const explicitStoreId = clean(body.storeId, 180)
  const purpose = clean(body.purpose, 80).toLowerCase() || 'website'
  const name = clean(body.name, 180) || `${purpose}-key`

  const teamSnap = await defaultDb.collection('teamMembers').doc(uid).get()
  const teamData = (teamSnap.data() ?? {}) as Record<string, unknown>
  const storeId = explicitStoreId || clean(teamData.storeId, 180)

  if (!storeId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No store is assigned to this account. Please refresh your workspace or contact support.',
    )
  }
  if (!(await canManageStore(uid, storeId))) {
    throw new functions.https.HttpsError('permission-denied', 'You cannot create keys for this store.')
  }

  const token = `sedx_${crypto.randomBytes(24).toString('hex')}`
  const tokenHash = hashToken(token)
  const now = admin.firestore.FieldValue.serverTimestamp()

  const keyRecord = {
    storeId,
    name,
    purpose,
    token,
    tokenHash,
    key: token,
    apiKey: token,
    value: token,
    keyPreview: redact(token),
    createdBy: uid,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  const globalRef = defaultDb.collection('integrationApiKeys').doc()
  const storeRef = defaultDb.collection('stores').doc(storeId).collection('integrationApiKeys').doc(globalRef.id)
  const settingsRef = defaultDb.collection('storeSettings').doc(storeId).collection('integrationApiKeys').doc(globalRef.id)

  const topLevelKeyFields = {
    integrationApiKey: token,
    integrationKey: token,
    integrationToken: token,
    updatedAt: now,
  }

  await Promise.all([
    globalRef.set(keyRecord, { merge: true }),
    storeRef.set(keyRecord, { merge: true }),
    settingsRef.set(keyRecord, { merge: true }),
    defaultDb.collection('stores').doc(storeId).set(topLevelKeyFields, { merge: true }),
    defaultDb.collection('storeSettings').doc(storeId).set(topLevelKeyFields, { merge: true }),
  ])

  functions.logger.info('Created integration API key', { storeId, uid, purpose, keyHint: redact(token) })

  return {
    ok: true,
    token,
    keyHint: redact(token),
    keyId: globalRef.id,
    storeId,
    purpose,
  }
})

export const listIntegrationApiKeys = functions.https.onCall(async (rawData: unknown, context) => {
  const uid = context.auth?.uid
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')

  const body = (rawData ?? {}) as ListIntegrationApiKeysRequest
  const explicitStoreId = clean(body.storeId, 180)

  const teamSnap = await defaultDb.collection('teamMembers').doc(uid).get()
  const teamData = (teamSnap.data() ?? {}) as Record<string, unknown>
  const storeId = explicitStoreId || clean(teamData.storeId, 180)

  if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
  if (!(await canManageStore(uid, storeId))) {
    throw new functions.https.HttpsError('permission-denied', 'You cannot view keys for this store.')
  }

  const snapshot = await defaultDb
    .collection('integrationApiKeys')
    .where('storeId', '==', storeId)
    .limit(50)
    .get()

  const keys = snapshot.docs
    .map(doc => {
      const data = (doc.data() ?? {}) as Record<string, unknown>
      return {
        id: doc.id,
        name: clean(data.name, 180) || 'Website integration key',
        purpose: clean(data.purpose, 80) || 'website',
        status: clean(data.status, 40) || 'active',
        keyPreview: getKeyPreview(data),
        createdAt: data.createdAt ?? null,
        updatedAt: data.updatedAt ?? null,
      }
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))

  return { ok: true, storeId, keys }
})
