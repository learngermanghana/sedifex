import type { ServiceAccount, app as AdminApp } from 'firebase-admin'
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let app: AdminApp.App | undefined

type RawServiceAccount = {
  project_id?: unknown
  projectId?: unknown
  client_email?: unknown
  clientEmail?: unknown
  private_key?: unknown
  privateKey?: unknown
}

function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: RawServiceAccount

  try {
    parsed = JSON.parse(raw) as RawServiceAccount
  } catch (error) {
    throw new Error(
      `Service account JSON could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const projectId =
    typeof parsed.projectId === 'string'
      ? parsed.projectId
      : typeof parsed.project_id === 'string'
        ? parsed.project_id
        : ''

  const clientEmail =
    typeof parsed.clientEmail === 'string'
      ? parsed.clientEmail
      : typeof parsed.client_email === 'string'
        ? parsed.client_email
        : ''

  const privateKeySource =
    typeof parsed.privateKey === 'string'
      ? parsed.privateKey
      : typeof parsed.private_key === 'string'
        ? parsed.private_key
        : ''

  const privateKey = privateKeySource.replace(/\\n/g, '\n')

  if (!projectId) {
    throw new Error('Service account is missing project_id/projectId')
  }

  if (!clientEmail) {
    throw new Error('Service account is missing client_email/clientEmail')
  }

  if (!privateKey) {
    throw new Error('Service account is missing private_key/privateKey')
  }

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Service account private key is malformed')
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  }
}

function loadServiceAccount(): ServiceAccount {
  console.log('[api/_firebase-admin] service account env check', {
    hasAdminJson: !!process.env.ADMIN_SERVICE_ACCOUNT_JSON,
    hasAdminBase64: !!process.env.ADMIN_SERVICE_ACCOUNT_BASE64,
    hasFirebaseJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasFirebaseBase64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  })

  const rawJson =
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (rawJson && rawJson.trim().startsWith('{')) {
    return parseServiceAccount(rawJson)
  }

  const b64 =
    process.env.ADMIN_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64

  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8')
    return parseServiceAccount(json)
  }

  throw new Error(
    'Missing service account: set ADMIN_SERVICE_ACCOUNT_JSON, ADMIN_SERVICE_ACCOUNT_BASE64, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT_BASE64 in deployment env.',
  )
}

export function getAdmin(): AdminApp.App {
  if (app) return app

  const creds = loadServiceAccount()

  app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(creds),
        projectId: creds.projectId,
      })

  return app
}

export const db = () => getFirestore(getAdmin())
