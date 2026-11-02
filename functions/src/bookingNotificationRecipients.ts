import { admin, defaultDb } from './firestore'

function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ? email : ''
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

type VerifiedMember = { email: string; role: 'owner' | 'staff' }

/**
 * An arbitrary address from notifications.adminEmails is NOT sufficient
 * authorization to receive customers' confidential booking details.
 * The address must belong to a verified Firebase Auth account that is
 * currently an owner/staff member of the booking's store.
 */
export function selectAuthorizedBookingRecipients(
  members: VerifiedMember[],
  configuredEmails: unknown[],
): string[] {
  const configured = new Set(configuredEmails.map(normalizeEmail).filter(Boolean))
  const recipients = new Set<string>()
  for (const member of members) {
    const address = normalizeEmail(member.email)
    if (!address) continue
    if (member.role === 'owner' || (member.role === 'staff' && configured.has(address))) {
      recipients.add(address)
    }
  }
  return [...recipients].slice(0, 10)
}

export async function bookingStoreRecipients(storeId: string, configuredEmails: unknown[]): Promise<string[]> {
  if (!storeId) return []
  const storeSnap = await defaultDb.collection('stores').doc(storeId).get()
  if (!storeSnap.exists) return []

  const store = storeSnap.data() || {}
  const storeParent = text(store.parentStoreId)
  const ownerUid = text(store.ownerUid)
  const direct = await defaultDb.collection('teamMembers').where('storeId', '==', storeId).limit(50).get()

  const candidates = new Map<string, 'owner' | 'staff'>()
  // The immutable store owner reference is trusted even for legacy
  // workspaces missing a matching teamMembers row.
  if (ownerUid) candidates.set(ownerUid, 'owner')
  for (const doc of direct.docs) {
    const data = doc.data()
    const uid = text(data.uid) || doc.id
    if (text(data.storeId) !== storeId) continue
    if (data.role === 'owner') candidates.set(uid, 'owner')
    else if (data.role === 'staff' && candidates.get(uid) !== 'owner') candidates.set(uid, 'staff')
  }

  // Linked child locations can be managed by the parent store owner.
  if (storeParent && storeParent !== storeId) {
    const parent = await defaultDb.collection('stores').doc(storeParent).get()
    const parentOwnerUid = text(parent.data()?.ownerUid)
    if (parentOwnerUid) candidates.set(parentOwnerUid, 'owner')
  }

  const verified = await Promise.all([...candidates.entries()].slice(0, 50).map(async ([uid, role]) => {
    try {
      const identity = await admin.auth().getUser(uid)
      const address = normalizeEmail(identity.email)
      // Never send patient/client details to an unverified mailbox.
      return identity.emailVerified && address ? { email: address, role } : null
    } catch {
      return null
    }
  }))

  return selectAuthorizedBookingRecipients(
    verified.filter((v): v is VerifiedMember => v !== null),
    configuredEmails,
  )
}
