const admin = require('firebase-admin')

const uid = (process.argv[2] ?? '').trim()
const nextEmail = (process.argv[3] ?? '').trim().toLowerCase()

if (!uid || !nextEmail) {
  console.error('Usage: npm run force-update-owner-email -- <uid> <new-email>')
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp()
}

const auth = admin.auth()
const db = admin.firestore()
const timestamp = admin.firestore.FieldValue.serverTimestamp()

async function updateAuthEmail() {
  const userRecord = await auth.getUser(uid)
  const currentEmail = (userRecord.email ?? '').trim().toLowerCase()

  if (currentEmail === nextEmail) {
    console.log(`[force-update-owner-email] Auth already set to ${nextEmail} for uid=${uid}`)
    return
  }

  await auth.updateUser(uid, {
    email: nextEmail,
    emailVerified: false,
  })

  console.log(`[force-update-owner-email] Updated Auth email ${currentEmail || '(none)'} -> ${nextEmail} for uid=${uid}`)
}

async function patchCollectionByUid(collectionName) {
  const snapshot = await db.collection(collectionName).where('ownerUid', '==', uid).get()
  if (snapshot.empty) {
    return 0
  }

  let updated = 0
  let batch = db.batch()
  let writes = 0

  for (const doc of snapshot.docs) {
    batch.set(
      doc.ref,
      {
        ownerEmail: nextEmail,
        email: nextEmail,
        updatedAt: timestamp,
      },
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

  if (writes > 0) {
    await batch.commit()
  }

  return updated
}

async function patchCollectionByOwnerId(collectionName) {
  const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get()
  if (snapshot.empty) {
    return 0
  }

  let updated = 0
  let batch = db.batch()
  let writes = 0

  for (const doc of snapshot.docs) {
    batch.set(
      doc.ref,
      {
        ownerEmail: nextEmail,
        email: nextEmail,
        updatedAt: timestamp,
      },
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

  if (writes > 0) {
    await batch.commit()
  }

  return updated
}

async function patchTeamMembers() {
  const uidRef = db.collection('teamMembers').doc(uid)
  const uidDoc = await uidRef.get()

  if (uidDoc.exists) {
    await uidRef.set(
      {
        uid,
        email: nextEmail,
        firstSignupEmail: nextEmail,
        updatedAt: timestamp,
      },
      { merge: true },
    )
  }

  const querySnapshot = await db.collection('teamMembers').where('uid', '==', uid).get()

  if (querySnapshot.empty) {
    return uidDoc.exists ? 1 : 0
  }

  let updated = uidDoc.exists ? 1 : 0
  let batch = db.batch()
  let writes = 0

  for (const doc of querySnapshot.docs) {
    if (doc.id === uid && uidDoc.exists) {
      continue
    }

    batch.set(
      doc.ref,
      {
        uid,
        email: nextEmail,
        firstSignupEmail: nextEmail,
        updatedAt: timestamp,
      },
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

  if (writes > 0) {
    await batch.commit()
  }

  return updated
}

async function run() {
  await updateAuthEmail()

  const [teamMembersUpdated, storesByUid, storesByOwnerId, workspacesByUid, workspacesByOwnerId] = await Promise.all([
    patchTeamMembers(),
    patchCollectionByUid('stores'),
    patchCollectionByOwnerId('stores'),
    patchCollectionByUid('workspaces'),
    patchCollectionByOwnerId('workspaces'),
  ])

  console.log('[force-update-owner-email] Done', {
    uid,
    email: nextEmail,
    teamMembersUpdated,
    storesUpdated: storesByUid + storesByOwnerId,
    workspacesUpdated: workspacesByUid + workspacesByOwnerId,
  })
}

run().catch(error => {
  console.error('[force-update-owner-email] Failed', error)
  process.exit(1)
})
