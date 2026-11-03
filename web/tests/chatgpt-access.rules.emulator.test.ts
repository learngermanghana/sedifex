import { describe, test, expect } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
const enabled = process.env.RUN_CHATGPT_EMULATOR_TESTS === '1'
async function user() {
  const app = initializeApp({ projectId: 'sedifex-ci', apiKey: 'fake', authDomain: 'sedifex-ci.firebaseapp.com' }, 'chatgpt-' + Math.random())
  const auth = getAuth(app), db = getFirestore(app)
  connectAuthEmulator(auth, 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'), { disableWarnings: true })
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')
  connectFirestoreEmulator(db, host, Number(port))
  const credential = await signInAnonymously(auth)
  return { app, db, uid: credential.user.uid }
}
const denied = async (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'permission-denied' })
;(enabled ? describe : describe.skip)('ChatGPT client access boundaries', () => {
  test('denies OAuth and identity records, scopes blogs and bookings, and protects customerUid', async () => {
    const owner = await user(), outsider = await user(), storeId = owner.uid
    try {
      await setDoc(doc(owner.db, 'teamMembers', owner.uid), { uid: owner.uid, storeId, role: 'owner' })
      await setDoc(doc(owner.db, 'stores', storeId), { storeId, ownerUid: owner.uid })
      for (const collection of ['chatgpt_oauth_codes', 'chatgpt_oauth_sessions', 'chatgpt_oauth_refresh', 'chatgpt_tool_requests', 'chatgpt_rate_limits', 'chatgpt_booking_accounts']) {
        const ref = doc(owner.db, collection, 'secret')
        await denied(getDoc(ref)); await denied(setDoc(ref, { uid: owner.uid })); await denied(deleteDoc(ref))
      }
      await denied(getDoc(doc(owner.db, 'chatgpt_booking_accounts', owner.uid, 'bookings', 'forged')))
      await denied(setDoc(doc(owner.db, 'chatgpt_booking_accounts', owner.uid, 'bookings', 'forged'), { storeId, uid: owner.uid }))
      const blog = doc(owner.db, 'blogPosts', 'blog-' + owner.uid)
      await setDoc(blog, { storeId, title: 'Test', status: 'draft' })
      await denied(getDoc(doc(outsider.db, 'blogPosts', blog.id)))
      await denied(updateDoc(doc(outsider.db, 'blogPosts', blog.id), { content: 'changed' }))
      await denied(updateDoc(blog, { storeId: outsider.uid }))
      for (const path of [['integrationBookings', 'root-' + owner.uid], ['stores', storeId, 'integrationBookings', 'nested-' + owner.uid]]) {
        const ref = doc(owner.db, path[0], ...path.slice(1)), external = doc(outsider.db, path[0], ...path.slice(1))
        await setDoc(ref, { storeId, status: 'pending' })
        await updateDoc(ref, { status: 'confirmed' })
        await denied(getDoc(external)); await denied(updateDoc(external, { status: 'cancelled' }))
        await denied(updateDoc(ref, { customerUid: outsider.uid }))
        await deleteDoc(ref)
        await denied(setDoc(ref, { storeId, customerUid: owner.uid }))
      }
    } finally { await deleteApp(owner.app); await deleteApp(outsider.app) }
  }, 30000)
})
