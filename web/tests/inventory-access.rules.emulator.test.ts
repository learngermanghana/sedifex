import { describe, test } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, signOut, type Auth } from 'firebase/auth'
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, query, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore'

const shouldRun = process.env.RUN_EVENT_PLANNING_EMULATOR_TESTS === '1'
const projectId = process.env.GCLOUD_PROJECT ?? 'sedifex-ci'
const [firestoreHost, firestorePortRaw] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'

type Context = { app: FirebaseApp; db: Firestore; auth: Auth; uid: string }

async function createUser(): Promise<Context> {
  const app = initializeApp({
    projectId,
    apiKey: 'fake-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
  }, `inventory-${Math.random().toString(36).slice(2)}`)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePortRaw))
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  return { app, db, auth, uid: user.uid }
}

async function dispose(context: Context) {
  await signOut(context.auth).catch(() => {})
  await deleteApp(context.app)
}

async function denied<T>(task: Promise<T>, name: string) {
  try {
    await task
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: string }).code : ''
    if (code === 'permission-denied') return
    throw new Error(`${name}: expected permission-denied, got ${String(error)}`)
  }
  throw new Error(`${name}: operation incorrectly succeeded`)
}

const describeOrSkip = shouldRun ? describe : describe.skip

describeOrSkip('staff inventory permissions', () => {
  test('staff read only their own store stock, while owner can edit', async () => {
    const owner = await createUser()
    const staff = await createUser()
    const outsider = await createUser()
    const storeId = owner.uid
    try {
      await setDoc(doc(owner.db, 'teamMembers', owner.uid), { uid: owner.uid, storeId, role: 'owner' })
      await setDoc(doc(owner.db, 'stores', storeId), { storeId, ownerUid: owner.uid })
      await setDoc(doc(owner.db, 'teamMembers', staff.uid), { uid: staff.uid, storeId, role: 'staff' })

      const productId = `inventory-test-${owner.uid}`
      const ownerRef = doc(owner.db, 'products', productId)
      const staffRef = doc(staff.db, 'products', productId)
      await setDoc(ownerRef, { storeId, name: 'Test soap', itemType: 'product', stockCount: 10, price: 20 })
      const product = await getDoc(staffRef)
      if (!product.exists() || product.data().stockCount !== 10) throw new Error('Staff must read its stock level')

      const matches = await getDocs(query(collection(staff.db, 'products'), where('storeId', '==', storeId)))
      if (!matches.docs.some(row => row.id === productId)) throw new Error('Staff inventory query must return store products')

      await denied(updateDoc(staffRef, { stockCount: 500 }), 'staff stock change')
      await denied(updateDoc(staffRef, { price: 1 }), 'staff price change')
      await denied(deleteDoc(staffRef), 'staff product delete')
      await denied(setDoc(doc(staff.db, 'products', `created-by-${staff.uid}`), {
        storeId, name: 'Staff-added product', stockCount: 10,
      }), 'staff product creation')
      await denied(getDoc(doc(outsider.db, 'products', productId)), 'outside user read')
      await denied(getDocs(query(collection(outsider.db, 'products'), where('storeId', '==', storeId))), 'outside user query')
      await denied(updateDoc(ownerRef, { storeId: 'another-store' }), 'owner store transfer')

      await updateDoc(ownerRef, { stockCount: 8 })
      const updated = await getDoc(staffRef)
      if (updated.data()?.stockCount !== 8) throw new Error('Staff must see owner changes')
      await deleteDoc(ownerRef)
    } finally {
      await dispose(outsider)
      await dispose(staff)
      await dispose(owner)
    }
  })
})
