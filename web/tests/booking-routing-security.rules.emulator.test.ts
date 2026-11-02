import { describe, it } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, signOut, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getFirestore, setDoc, updateDoc, type Firestore } from 'firebase/firestore'

const enabled = process.env.RUN_EVENT_PLANNING_EMULATOR_TESTS === '1'
const projectId = process.env.GCLOUD_PROJECT ?? 'sedifex-ci'
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'

type Session = { app: FirebaseApp; auth: Auth; db: Firestore; uid: string }

async function session(): Promise<Session> {
  const app = initializeApp({
    projectId, apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`,
  }, `routing-${Math.random().toString(36).slice(2)}`)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, host, Number(port))
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  return { app, auth, db, uid: user.uid }
}

async function dispose(ctx: Session) {
  await signOut(ctx.auth).catch(() => {})
  await deleteApp(ctx.app)
}

async function denied(operation: Promise<unknown>, description: string) {
  try {
    await operation
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return
    throw new Error(`${description}: unexpected error ${String(error)}`)
  }
  throw new Error(`${description}: incorrectly permitted`)
}

;(enabled ? describe : describe.skip)('booking endpoint isolation', () => {
  it('only owner can change Apps Script and notification routes for a store', async () => {
    const owner = await session()
    const staff = await session()
    const outsider = await session()
    const storeId = owner.uid
    try {
      await setDoc(doc(owner.db, 'stores', storeId), { storeId, ownerUid: owner.uid, name: 'Shop A' })
      await setDoc(doc(owner.db, 'teamMembers', owner.uid), { uid: owner.uid, storeId, role: 'owner' })
      await setDoc(doc(owner.db, 'teamMembers', staff.uid), { uid: staff.uid, storeId, role: 'staff' })
      const endpoint = { webAppUrl: 'https://example.com/shop-a' }

      await updateDoc(doc(owner.db, 'stores', storeId), { bookingSync: endpoint })
      await setDoc(doc(owner.db, 'storeSettings', storeId), { bookingSync: endpoint })

      await denied(updateDoc(doc(staff.db, 'stores', storeId), {
        bookingSync: { webAppUrl: 'https://example.com/other' },
      }), 'staff should not redirect store webhook')
      await denied(updateDoc(doc(outsider.db, 'stores', storeId), {
        bookingSync: { webAppUrl: 'https://example.com/other' },
      }), 'other store user should not redirect store webhook')
      await denied(updateDoc(doc(staff.db, 'storeSettings', storeId), {
        bulkEmailIntegration: { webAppUrl: 'https://example.com/other' },
      }), 'staff should not redirect customer emails')
      await denied(updateDoc(doc(outsider.db, 'storeSettings', storeId), {
        bookingSync: { webAppUrl: 'https://example.com/other' },
      }), 'other store should not redirect booking script')
      await denied(setDoc(doc(staff.db, 'storeSettings', outsider.uid), {
        bookingSync: { webAppUrl: 'https://example.com/other' },
      }), 'staff should not create foreign store settings')

      await updateDoc(doc(owner.db, 'stores', storeId), {
        bookingSync: { webAppUrl: 'https://example.com/shop-a-new' },
      })
      await updateDoc(doc(owner.db, 'storeSettings', storeId), {
        bulkEmailIntegration: { webAppUrl: 'https://example.com/shop-a-email' },
      })
    } finally {
      await dispose(outsider)
      await dispose(staff)
      await dispose(owner)
    }
  })
})
