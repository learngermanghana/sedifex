import * as admin from 'firebase-admin'

let app: admin.app.App | undefined

function loadServiceAccount(): admin.ServiceAccount {
  console.log('[api/_firebase-admin] service account env check', {
    hasAdminJson: !!process.env.ADMIN_SERVICE_ACCOUNT_JSON,
    hasFirebaseJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasFirebaseBase64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  })

  const rawJson =
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (rawJson && rawJson.trim().startsWith('{')) {
    return JSON.parse(rawJson)
  }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8')
    return JSON.parse(json)
  }

  throw new Error(
    'Missing service account: set ADMIN_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT_BASE64 in deployment env.',
  )
}

export function getAdmin(): admin.app.App {
  if (app) return app

  const creds = loadServiceAccount()
  const projectId = process.env.FIREBASE_PROJECT_ID || (creds as any).project_id

  app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId,
      })

  return app
}

export const db = () => getAdmin().firestore()
