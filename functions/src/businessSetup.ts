import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'
type Row = Record<string, any>
const OPTIONAL = ['catalog', 'payout', 'public-page']
async function ownerStore(storeId: string, context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
  if (!storeId || storeId.includes('/')) throw new functions.https.HttpsError('invalid-argument', 'Select a workspace.')
  const uid = context.auth.uid
  const [store, member] = await Promise.all([defaultDb.collection('stores').doc(storeId).get(), defaultDb.collection('teamMembers').doc(uid).get()])
  if (!store.exists) throw new functions.https.HttpsError('not-found', 'Workspace not found.')
  const data = store.data() as Row
  const membership = member.data() || {}
  const validMember = membership.uid === uid && membership.role === 'owner' && (membership.storeId === storeId || membership.storeId && data.parentStoreId === membership.storeId)
  if (![data.ownerUid, data.ownerId, storeId].includes(uid) && !validMember) throw new functions.https.HttpsError('permission-denied', 'Only the workspace owner can manage setup.')
  return { ref: store.ref, data }
}
export function setupCompletion(store: Row) {
  const name = store.displayName || store.businessName || store.name
  return { profile: Boolean(typeof name === 'string' && name.trim() && (store.email || store.ownerEmail || store.phone)) }
}
export const getBusinessSetupChecklist = functions.https.onCall(async (data, context) => {
  const storeId = String(data?.storeId || '').trim()
  const store = await ownerStore(storeId, context)
  // The dashboard now needs only profile status: avoid an extra products query.
  return { ok: true, completion: setupCompletion(store.data), dismissed: store.data.setupChecklist?.profileDismissed === true }
})
export const setBusinessSetupStepSkipped = functions.https.onCall(async (data, context) => {
  const store = await ownerStore(String(data?.storeId || '').trim(), context)
  const step = String(data?.step || '')
  if (typeof data?.skipped !== 'boolean' || (step !== 'profile' && !OPTIONAL.includes(step))) throw new functions.https.HttpsError('invalid-argument', 'Choose a valid setup step.')
  if (step === 'profile') {
    await store.ref.update({ 'setupChecklist.profileDismissed': data.skipped })
  } else {
    // Keep the legacy optional-step contract for clients updating from an older release.
    await store.ref.update({ 'setupChecklist.skipped': data.skipped ? admin.firestore.FieldValue.arrayUnion(step) : admin.firestore.FieldValue.arrayRemove(step) })
  }
  return { ok: true }
})
