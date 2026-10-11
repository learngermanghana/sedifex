import { randomBytes } from 'crypto'
import { admin, defaultDb } from './firestore'
import { hashPublicContractToken } from './eventContractSigningCore'

const BASE = (process.env.SEDIFEX_CUSTOMER_PORTAL_BASE_URL || 'https://pay.sedifex.com').replace(/\/$/, '')
/** Reuse or issue a portal only for the matched customer receiving the reminder. */
export async function bookingReminderPortal(storeId: string, bookingId: string, booking: Record<string, any>, recipientEmail: string) {
  if (!recipientEmail) return null
  const customerId = String(booking.customerId || booking.customer_id || booking.customer?.id || '').trim()
  const ref = customerId ? defaultDb.collection('customers').doc(customerId) : null
  const snapshot = ref ? await ref.get() : (await defaultDb.collection('customers').where('storeId', '==', storeId).where('email', '==', recipientEmail).limit(2).get()).docs
  const customerSnapshot = Array.isArray(snapshot) ? snapshot.length === 1 ? snapshot[0] : null : snapshot
  if (!customerSnapshot?.exists) return null
  const customerRef = customerSnapshot.ref
  const token = randomBytes(32).toString('hex')
  const hash = hashPublicContractToken(token)
  const url = `${BASE}/customer-portal/${token}`
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 86400000)
  const portalUrl = await defaultDb.runTransaction(async tx => {
    const current = await tx.get(customerRef)
    const customer = current.data() || {}
    if (customer.storeId !== storeId || String(customer.email || '').trim().toLowerCase() !== recipientEmail) return null
    const portal = customer.portal || {}
    // A revoked portal remains revoked until the business chooses to share it again.
    if (portal.status === 'revoked') return null
    if (portal.status === 'active' && portal.publicUrl && portal.expiresAt?.toMillis?.() > Date.now()) {
      let savedUrl: URL
      try { savedUrl = new URL(String(portal.publicUrl)) } catch { return null }
      const match = savedUrl.pathname.match(/^\/customer-portal\/([a-f0-9]{64})$/)
      if (savedUrl.origin !== new URL(BASE).origin || !match || hashPublicContractToken(match[1]) !== portal.publicLinkHash) return null
      const linkRef = defaultDb.collection('eventClientLinks').doc(portal.publicLinkHash || 'missing')
      const link = (await tx.get(linkRef)).data()
      if (link?.linkKind === 'customer_portal' && link.status === 'active' && link.storeId === storeId && link.customerId === customerSnapshot.id && link.expiresAt?.toMillis?.() > Date.now()) return String(portal.publicUrl)
    }
    const now = admin.firestore.FieldValue.serverTimestamp()
    if (portal.publicLinkHash) tx.set(defaultDb.collection('eventClientLinks').doc(portal.publicLinkHash), { status: 'revoked', updatedAt: now }, { merge: true })
    tx.set(defaultDb.collection('eventClientLinks').doc(hash), { linkKind: 'customer_portal', storeId, customerId: customerSnapshot.id, status: 'active', expiresAt, createdAt: now, updatedAt: now, createdBy: 'booking_reminder' })
    tx.update(customerRef, { portal: { status: 'active', publicLinkHash: hash, linkCollection: 'eventClientLinks', publicUrl: url, expiresAt, sharedAt: now, sharedBy: 'booking_reminder' }, updatedAt: now })
    return url
  })
  if (!portalUrl) return null
  const target = new URL(portalUrl)
  if (target.origin !== new URL(BASE).origin || !target.pathname.startsWith('/customer-portal/')) return null
  target.searchParams.set('booking', bookingId)
  return target.toString()
}
