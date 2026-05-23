import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'

const SEDIFEX_INTEGRATION_API_KEY = defineString('SEDIFEX_INTEGRATION_API_KEY', { default: '' })

export function cleanIntegrationText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function queryHasMatch(collectionPath: FirebaseFirestore.CollectionReference, field: string, apiKey: string) {
  const snapshot = await collectionPath.where(field, '==', apiKey).limit(1).get()
  return !snapshot.empty
}

async function queryStoreSettingsByStoreId(storeId: string) {
  const snapshot = await defaultDb.collection('storeSettings').where('storeId', '==', storeId).limit(5).get()
  return snapshot.docs
}

function nestedRecordContainsKey(value: unknown, apiKey: string, depth = 0): boolean {
  if (!value || depth > 6) return false

  if (Array.isArray(value)) {
    return value.some(item => nestedRecordContainsKey(item, apiKey, depth + 1))
  }

  if (typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  for (const [field, fieldValue] of Object.entries(record)) {
    const looksLikeCredential = /api.?key|integration.?key|token|secret|credential|authorization/i.test(field)
    if (looksLikeCredential && cleanIntegrationText(fieldValue, 1000) === apiKey) return true
    if (fieldValue && typeof fieldValue === 'object' && nestedRecordContainsKey(fieldValue, apiKey, depth + 1)) return true
  }

  return false
}

function recordContainsKey(record: Record<string, unknown>, apiKey: string) {
  const candidates = [
    record.integrationApiKey,
    record.integrationKey,
    record.integrationToken,
    record.apiKey,
    record.token,
    record.key,
    record.value,
  ]

  return candidates.some(value => cleanIntegrationText(value, 1000) === apiKey) || nestedRecordContainsKey(record, apiKey)
}

export function resolveIntegrationApiKey(req: functions.https.Request) {
  const bearer = cleanIntegrationText(req.get('authorization'), 1000).replace(/^Bearer\s+/i, '')
  return (
    cleanIntegrationText(req.get('x-api-key'), 1000)
    || cleanIntegrationText(req.get('x-sedifex-api-key'), 1000)
    || cleanIntegrationText(req.get('api-key'), 1000)
    || cleanIntegrationText(req.query.apiKey, 1000)
    || cleanIntegrationText(req.query.api_key, 1000)
    || bearer
  )
}

export function redactIntegrationApiKey(apiKey: string) {
  if (!apiKey) return null
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`
}

export async function isIntegrationRequestAuthorized(req: functions.https.Request, storeId: string) {
  const apiKey = resolveIntegrationApiKey(req)
  if (!apiKey) return false

  const master = SEDIFEX_INTEGRATION_API_KEY.value()?.trim() || process.env.SEDIFEX_INTEGRATION_API_KEY?.trim() || ''
  if (master && apiKey === master) return true

  try {
    const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
    const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(storeData, apiKey)) return true

    const settingsSnap = await defaultDb.collection('storeSettings').doc(storeId).get()
    const settingsData = (settingsSnap.data() ?? {}) as Record<string, unknown>
    if (recordContainsKey(settingsData, apiKey)) return true

    const matchingSettingsDocs = await queryStoreSettingsByStoreId(storeId)
    for (const settingsDoc of matchingSettingsDocs) {
      const data = (settingsDoc.data() ?? {}) as Record<string, unknown>
      if (recordContainsKey(data, apiKey)) return true

      const nestedCollection = defaultDb.collection('storeSettings').doc(settingsDoc.id).collection('integrationApiKeys')
      for (const field of ['token', 'key', 'apiKey', 'value']) {
        if (await queryHasMatch(nestedCollection, field, apiKey)) return true
      }
    }

    const storeKeyCollections = [
      defaultDb.collection('stores').doc(storeId).collection('integrationApiKeys'),
      defaultDb.collection('storeSettings').doc(storeId).collection('integrationApiKeys'),
    ]

    for (const keyCollection of storeKeyCollections) {
      for (const field of ['token', 'key', 'apiKey', 'value']) {
        if (await queryHasMatch(keyCollection, field, apiKey)) return true
      }
    }

    for (const field of ['token', 'key', 'apiKey', 'value']) {
      const snapshot = await defaultDb
        .collection('integrationApiKeys')
        .where('storeId', '==', storeId)
        .where(field, '==', apiKey)
        .limit(1)
        .get()
      if (!snapshot.empty) return true
    }
  } catch (error) {
    functions.logger.warn('integration auth lookup failed', {
      storeId,
      apiKeyHint: redactIntegrationApiKey(apiKey),
      error,
    })
  }

  return false
}
