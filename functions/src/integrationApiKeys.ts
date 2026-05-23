import * as crypto from 'crypto'
import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'

type CreateIntegrationApiKeyRequest = {
  storeId?: unknown
  name?: unknown
  purpose?: unknown
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


async function getSettingsDocsForStore(storeId: string) {
  const directRef = defaultDb.collection('storeSettings').doc(storeId)
  const directSnap = await directRef.get()
  const byFieldSnap = await defaultDb.collection('storeSettings').where('storeId', '==', storeId).limit(20).get()

  const refs = new Map<string, FirebaseFirestore.DocumentReference>()
  if (directSnap.exists) refs.set(directRef.id, directRef)
  byFieldSnap.docs.forEach(doc => refs.set(doc.id, doc.ref))
  if (!refs.size) refs.set(directRef.id, directRef)
  return Array.from(refs.values())
}

function canManageStore(authUid: string, storeId: string) {
  return defaultDb.collection('teamMembers').doc(authUid).get().then(snap => {
    if (!snap.exists) return false
    const data = (snap.data() ?? {}) as Record<string, unknown>
    return clean(data.storeId, 180) === storeId
  })
}

export const createIntegrationApiKey = functions.https.onCall(async (rawData: unknown, context) => {
  const uid = context.auth?.uid
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')

  const body = (rawData ?? {}) as CreateIntegrationApiKeyRequest
  const storeId = clean(body.storeId, 180)
  const purpose = clean(body.purpose, 80).toLowerCase() || 'general'
  const name = clean(body.name, 180) || `${purpose}-key`

  if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
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
    createdBy: uid,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  const globalRef = defaultDb.collection('integrationApiKeys').doc()
  const storeRef = defaultDb.collection('stores').doc(storeId).collection('integrationApiKeys').doc(globalRef.id)

  const topLevelKeyFields = {
    integrationApiKey: token,
    integrationKey: token,
    integrationToken: token,
    updatedAt: now,
  }

  const settingsDocRefs = await getSettingsDocsForStore(storeId)

  const integrationApiPatch = {
    integrationApi: {
      enabled: true,
      latestPurpose: purpose,
      latestIntegrationApiKeyPreview: 'masked preview only',
      updatedAt: now,
    },
    latestIntegrationApiKeyPreview: 'masked preview only',
    latestIntegrationApiKeyPurpose: purpose,
  }

  const writes: Array<Promise<FirebaseFirestore.WriteResult>> = [
    globalRef.set(keyRecord, { merge: true }),
    storeRef.set(keyRecord, { merge: true }),
    defaultDb.collection('stores').doc(storeId).set(topLevelKeyFields, { merge: true }),
  ]

  for (const settingsDocRef of settingsDocRefs) {
    writes.push(settingsDocRef.collection('integrationApiKeys').doc(globalRef.id).set(keyRecord, { merge: true }))
    writes.push(settingsDocRef.set({ ...topLevelKeyFields, ...integrationApiPatch, storeId }, { merge: true }))
  }

  await Promise.all(writes)

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
