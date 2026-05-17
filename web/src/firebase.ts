// web/src/firebase.ts
import { initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier } from 'firebase/auth'
import {
  initializeFirestore,
  enableMultiTabIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

type FirebaseEnvKey =
  | 'VITE_FB_API_KEY'
  | 'VITE_FB_AUTH_DOMAIN'
  | 'VITE_FB_PROJECT_ID'
  | 'VITE_FB_STORAGE_BUCKET'
  | 'VITE_FB_APP_ID'
  | 'VITE_FB_FUNCTIONS_REGION'

const envAliases: Record<FirebaseEnvKey, readonly string[]> = {
  VITE_FB_API_KEY: ['NEXT_PUBLIC_FB_API_KEY', 'FB_API_KEY'],
  VITE_FB_AUTH_DOMAIN: ['NEXT_PUBLIC_FB_AUTH_DOMAIN', 'FB_AUTH_DOMAIN'],
  VITE_FB_PROJECT_ID: ['NEXT_PUBLIC_FB_PROJECT_ID', 'FB_PROJECT_ID'],
  VITE_FB_STORAGE_BUCKET: ['NEXT_PUBLIC_FB_STORAGE_BUCKET', 'FB_STORAGE_BUCKET'],
  VITE_FB_APP_ID: ['NEXT_PUBLIC_FB_APP_ID', 'FB_APP_ID'],
  VITE_FB_FUNCTIONS_REGION: ['NEXT_PUBLIC_FB_FUNCTIONS_REGION', 'FB_FUNCTIONS_REGION'],
}

function getEnvValue(key: FirebaseEnvKey): string | undefined {
  const keys = [key, ...envAliases[key]]
  for (const candidate of keys) {
    const rawValue = import.meta.env[candidate]
    if (typeof rawValue === 'string' && rawValue.trim()) {
      return rawValue.trim()
    }
  }

  return undefined
}

function requireEnv(key: FirebaseEnvKey): string {
  const value = getEnvValue(key)
  if (value) return value

  const aliases = envAliases[key].join(', ')
  throw new Error(
    `[firebase] Missing ${key}. Also checked aliases: ${aliases}. Add one in your env (local and Vercel).`
  )
}

export const firebaseConfig = {
  apiKey: requireEnv('VITE_FB_API_KEY'),
  authDomain: requireEnv('VITE_FB_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FB_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FB_STORAGE_BUCKET'),
  appId: requireEnv('VITE_FB_APP_ID'),
}

// ----- Core app instances -----
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const storage = getStorage(app)

// Region defaults to us-central1 (where your functions are deployed)
const FUNCTIONS_REGION = getEnvValue('VITE_FB_FUNCTIONS_REGION') ?? 'us-central1'

export const functions = getFunctions(app, FUNCTIONS_REGION)

// ----- Firestore -----
const FIRESTORE_SETTINGS = { ignoreUndefinedProperties: true }

// Default Firestore database
export const db: Firestore = initializeFirestore(app, FIRESTORE_SETTINGS)

// ----- Offline persistence (browser only) -----
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch(() => {
    // Persistence may be unsupported in this browser; safe to ignore.
  })
}

// ----- Helpers -----
export function setupRecaptcha(containerId = 'recaptcha-container') {
  // v9/v10 signature: new RecaptchaVerifier(auth, container, options)
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
}
