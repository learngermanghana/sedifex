const admin = require('firebase-admin')

function unwrapAngleBrackets(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const subjectId = unwrapAngleBrackets(process.argv[2])
const nextEmail = unwrapAngleBrackets(process.argv[3]).toLowerCase()

if (!subjectId || !nextEmail) {
  console.error('Usage: npm run force-update-owner-email -- UID_OR_STORE_ID NEW_EMAIL')
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp()
}

const auth = admin.auth()
const db = admin.firestore()
const timestamp = admin.firestore.FieldValue.serverTimestamp()
let effectiveUid = subjectId

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function resolveUidFromStoreOrWorkspace() {
  const [storeSnap, workspaceSnap] = await Promise.all([
    db.collection('stores').doc(subjectId).get(),
    db.collection('workspaces').doc(subjectId).get(),
  ])

  const candidates = []
  for (const snap of [storeSnap, workspaceSnap]) {
    if (!snap.exists) continue
    const data = snap.data() || {}
    const ownerUid = normalizeString(data.ownerUid)
    const ownerId = normalizeString(data.ownerId)
    if (ownerUid) candidates.push(ownerUid)
    if (ownerId) candidates.push(ownerId)
  }

  const first = candidates.find(Boolean)
  if (first) {
    effectiveUid = first
    if (effectiveUid !== subjectId) {
      console.log(`[force-update-owner-email] Using resolved owner UID ${effectiveUid} from store/workspace ${subjectId}`)
    }
  }
}

async function updateAuthEmail() {
  try {
    const userRecord = await auth.getUser(effectiveUid)
    const currentEmail = (userRecord.email ?? '').trim().toLowerCase()

    if (currentEmail === nextEmail) {
      console.log(`[force-update-owner-email] Auth already set to ${nextEmail} for uid=${effectiveUid}`)
      return { status: 'unchanged' }
    }

    await auth.updateUser(effectiveUid, {
      email: nextEmail,
      emailVerified: false,
    })

    console.log(
      `[force-update-owner-email] Updated Auth email ${currentEmail || '(none)'} -> ${nextEmail} for uid=${effectiveUid}`,
    )
    return { status: 'updated' }
  } catch (error) {
    if (error && typeof error === 'object' && error.errorInfo && error.errorInfo.code === 'auth/user-not-found') {
      const projectId =
        admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'unknown-project'
      console.warn(
        `[force-update-owner-email] Auth user not found for uid=${effectiveUid} in project=${projectId}. Continuing with Firestore-only update.`,
      )
      return { status: 'missing' }
    }
    throw error
  }
}

async function patchCollectionByUid(collectionName) {
  const snapshot = await db.collection(collectionName).where('ownerUid', '==', effectiveUid).get()
  if (snapshot.empty) {
    return 0
  }

  let updated = 0
  let batch = db.batch()
  let writes = 0

  for (const doc of snapshot.docs) {
    batch.set(doc.ref, { ownerEmail: nextEmail, email: nextEmail, updatedAt: timestamp }, { merge: true })
    writes += 1
    updated += 1

    if (writes >= 400) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  if (writes > 0) await batch.commit()
  return updated
}

async function patchCollectionByOwnerId(collectionName) {
  const snapshot = await db.collection(collectionName).where('ownerId', '==', effectiveUid).get()
  if (snapshot.empty) {
    return 0
  }

  let updated = 0
  let batch = db.batch()
  let writes = 0

  for (const doc of snapshot.docs) {
    batch.set(doc.ref, { ownerEmail: nextEmail, email: nextEmail, updatedAt: timestamp }, { merge: true })
    writes += 1
    updated += 1

    if (writes >= 400) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  if (writes > 0) await batch.commit()
  return updated
}

async function patchDirectStoreWorkspaceDocs() {
  let updated = 0
  for (const collectionName of ['stores', 'workspaces']) {
    const docRef = db.collection(collectionName).doc(subjectId)
    const snap = await docRef.get()
    if (!snap.exists) continue

    await docRef.set({ ownerEmail: nextEmail, email: nextEmail, updatedAt: timestamp }, { merge: true })
    updated += 1
  }
  return updated
}

async function patchTeamMembers() {
  const idsToPatch = Array.from(new Set([effectiveUid, subjectId]))
  let updated = 0

  for (const id of idsToPatch) {
    const docRef = db.collection('teamMembers').doc(id)
    const docSnap = await docRef.get()
    if (!docSnap.exists) continue

    await docRef.set({ uid: effectiveUid, email: nextEmail, firstSignupEmail: nextEmail, updatedAt: timestamp }, { merge: true })
    updated += 1
  }

  const querySnapshot = await db.collection('teamMembers').where('uid', '==', effectiveUid).get()
  if (querySnapshot.empty) return updated

  let batch = db.batch()
  let writes = 0

  for (const doc of querySnapshot.docs) {
    if (idsToPatch.includes(doc.id)) continue

    batch.set(
      doc.ref,
      { uid: effectiveUid, email: nextEmail, firstSignupEmail: nextEmail, updatedAt: timestamp },
      { merge: true },
    )
    writes += 1
    updated += 1

    if (writes >= 400) {
      await batch.commit()
      batch = db.batch()
      writes = 0
    }
  }

  if (writes > 0) await batch.commit()
  return updated
}

async function run() {
  await resolveUidFromStoreOrWorkspace()
  const authResult = await updateAuthEmail()

  const [teamMembersUpdated, storesByUid, storesByOwnerId, workspacesByUid, workspacesByOwnerId, directDocsUpdated] =
    await Promise.all([
      patchTeamMembers(),
      patchCollectionByUid('stores'),
      patchCollectionByOwnerId('stores'),
      patchCollectionByUid('workspaces'),
      patchCollectionByOwnerId('workspaces'),
      patchDirectStoreWorkspaceDocs(),
    ])

  console.log('[force-update-owner-email] Done', {
    subjectId,
    effectiveUid,
    email: nextEmail,
    authStatus: authResult.status,
    teamMembersUpdated,
    storesUpdated: storesByUid + storesByOwnerId,
    workspacesUpdated: workspacesByUid + workspacesByOwnerId,
    directDocsUpdated,
  })
}

run().catch(error => {
  console.error('[force-update-owner-email] Failed', error)
  process.exit(1)
})
