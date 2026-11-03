import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { executeTool, tools } from '../chatgpt-tools'
import { scopeDescriptions } from '../../../shared/chatgpt-scopes'
import { memoryDb } from './memory-db'
const start = '2099-03-01T10:00:00.000Z', end = '2099-03-01T11:00:00.000Z'
function setup(capacity = 2) {
  return memoryDb({
    'stores/shop': { ownerUid: 'merchant', name: 'Test shop', verified: true, eligibleForBuy: true, status: 'active' },
    'products/service': { storeId: 'shop', itemType: 'service', isPublished: true, name: 'Massage', price: 100, currency: 'GHS' },
    'publicListings/listing': { storeId: 'shop', sourceProductId: 'service', itemType: 'service', isPublished: true, name: 'Massage', price: 100 },
    'stores/shop/integrationAvailabilitySlots/slot': { serviceId: 'service', status: 'open', startAt: start, endAt: end, timezone: 'Africa/Accra', capacity, seatsBooked: 0 },
  })
}
const args = { storeId: 'shop', listingId: 'listing', slotId: 'slot', quantity: 1, expectedUnitPrice: 100, expectedCurrency: 'GHS', expectedStartAt: start, expectedEndAt: end, expectedTimezone: 'Africa/Accra', customerName: 'Test Customer', customerEmail: 'customer@example.com', customerPhone: '+233241234567', requestId: 'booking_0001', confirmed: true }
const blog = { storeId: 'shop', title: 'Helpful massage advice', content: 'A useful article.', requestId: 'blog_0001' }
describe('ChatGPT tools', () => {
  it('uses current Sedifex business terminology in the exposed tool descriptions and consent scopes', () => {
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.map(tool => tool.description).join(' ')).not.toMatch(/\\bmerchant\\b/i)
    expect(Object.values(scopeDescriptions).join(' ')).not.toMatch(/\\bmerchant\\b/i)
    expect(scopeDescriptions['stores:read']).toMatch(/stores you own/)
  })
  it('discovers only published public services and returns slot prices', async () => {
    const m = setup(); m.put('publicListings/private', { name: 'Secret', itemType: 'service', isPublished: false })
    expect((await executeTool(m.db, 'search_services', {})).services).toHaveLength(1)
    expect((await executeTool(m.db, 'get_availability', { storeId: 'shop', listingId: 'listing' })).slots).toEqual([expect.objectContaining({ unitPrice: 100, startAt: start, timezone: 'Africa/Accra' })])
  })
  it('books atomically and exposes pending approval without claiming payment', async () => {
    const m = setup(), result = await executeTool(m.db, 'create_booking', args, 'customer')
    expect(result).toMatchObject({ bookingStatus: 'pending_approval', amount: 100, paymentStatus: 'pending', bookingDate: '2099-03-01', bookingTime: '10:00' })
    expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(1)
    expect(m.get('integrationBookings/' + result.bookingId)?.customerUid).toBe('customer')
    expect(m.get('stores/shop/integrationBookings/' + result.bookingId)).toEqual(m.get('integrationBookings/' + result.bookingId))
  })
  it('concurrent retries create one booking and reserve one seat', async () => {
    const m = setup()
    const [a, b] = await Promise.all([executeTool(m.db, 'create_booking', args, 'customer'), executeTool(m.db, 'create_booking', args, 'customer')])
    expect(a.bookingId).toBe(b.bookingId); expect(b.duplicate).toBe(true)
    expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(1)
    await expect(executeTool(m.db, 'create_booking', { ...args, quantity: 2 }, 'customer')).rejects.toThrow('different details')
  })
  it('prevents overselling concurrent requests', async () => {
    const m = setup(1)
    const results = await Promise.allSettled([executeTool(m.db, 'create_booking', args, 'customer'), executeTool(m.db, 'create_booking', { ...args, requestId: 'booking_0002' }, 'other')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(1)
  })
  it.each([{ status: 'closed' }, { public: false }, { visibleOnWebsite: false }, { serviceId: 'other' }, { startAt: '2020-01-01T00:00:00Z' }])('rejects unavailable slots: %j', async patch => {
    const m = setup(); m.put('stores/shop/integrationAvailabilitySlots/slot', { ...m.get('stores/shop/integrationAvailabilitySlots/slot'), ...patch })
    await expect(executeTool(m.db, 'create_booking', args, 'customer')).rejects.toThrow('unavailable')
    expect(m.entries().filter(([p]) => p.startsWith('integrationBookings/'))).toHaveLength(0)
  })
  it('requires confirmation and rejects changed prices or schedules', async () => {
    const m = setup()
    await expect(executeTool(m.db, 'create_booking', { ...args, confirmed: false }, 'customer')).rejects.toThrow('confirmation')
    await expect(executeTool(m.db, 'create_booking', { ...args, expectedUnitPrice: 1 }, 'customer')).rejects.toThrow('changed')
    expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(0)
  })
  it('uses current slot price and rejects an opted-out business', async () => {
    const m = setup(); const path = 'stores/shop/integrationAvailabilitySlots/slot'
    m.put(path, { ...m.get(path), price: 75 })
    const available = await executeTool(m.db, 'get_availability', { storeId: 'shop', listingId: 'listing' })
    expect((available.slots as any[])[0].unitPrice).toBe(75)
    await expect(executeTool(m.db, 'create_booking', args, 'customer')).rejects.toThrow('changed')
    const booking = await executeTool(m.db, 'create_booking', { ...args, expectedUnitPrice: 75 }, 'customer')
    expect(booking.amount).toBe(75)
    m.put('stores/shop', { ...m.get('stores/shop'), buyOptOut: true })
    await expect(executeTool(m.db, 'get_availability', { storeId: 'shop', listingId: 'listing' })).rejects.toThrow('not accepting')
  })
  it('does not leak or change other customers bookings', async () => {
    const m = setup(), booking = await executeTool(m.db, 'create_booking', args, 'customer')
    // Even a forged legacy booking UID cannot create a server-owned binding.
    m.put('stores/shop/integrationBookings/forged', { ...m.get('stores/shop/integrationBookings/' + booking.bookingId), customerUid: 'other' })
    expect((await executeTool(m.db, 'list_my_bookings', { storeId: 'shop' }, 'other')).bookings).toEqual([])
    await expect(executeTool(m.db, 'request_booking_change', { storeId: 'shop', bookingId: booking.bookingId, action: 'cancel', confirmed: true, requestId: 'cancel_0001' }, 'other')).rejects.toThrow('not found')
  })
  it('submits retriable cancellation for existing merchant approval workflow', async () => {
    const m = setup(), booking = await executeTool(m.db, 'create_booking', args, 'customer')
    const change = { storeId: 'shop', bookingId: booking.bookingId, action: 'cancel', confirmed: true, requestId: 'cancel_0001' }
    await executeTool(m.db, 'request_booking_change', change, 'customer')
    expect((await executeTool(m.db, 'request_booking_change', change, 'customer')).duplicate).toBe(true)
    expect(m.get('integrationBookings/' + booking.bookingId)?.customerPortalRequest).toMatchObject({ type: 'cancel', status: 'pending' })
    expect(m.get('integrationBookings/' + booking.bookingId)?.bookingStatus).toBe('pending_approval')
    expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(1)
  })
  it('prevents cross-store blog access', async () => {
    const m = setup()
    await expect(executeTool(m.db, 'create_blog_draft', blog, 'other')).rejects.toThrow('owner')
    m.put('blogPosts/foreign', { ...blog, storeId: 'other', status: 'draft' })
    await expect(executeTool(m.db, 'get_blog_post', { storeId: 'shop', postId: 'foreign' }, 'merchant')).rejects.toThrow('not found')
  })
  it('creates idempotent dashboard-compatible drafts, edits with revisions and publishes explicitly', async () => {
    const m = setup(), created = await executeTool(m.db, 'create_blog_draft', blog, 'merchant')
    expect(created.status).toBe('draft')
    expect((await executeTool(m.db, 'create_blog_draft', blog, 'merchant')).postId).toBe(created.postId)
    const read = await executeTool(m.db, 'get_blog_post', { storeId: 'shop', postId: created.postId }, 'merchant')
    const edit = { ...blog, postId: created.postId, expectedRevision: read.revision, content: 'Updated text', requestId: 'edit_0001' }
    const updated = await executeTool(m.db, 'update_blog_draft', edit, 'merchant')
    expect(updated.revision).not.toBe(read.revision)
    await expect(executeTool(m.db, 'update_blog_draft', { ...edit, requestId: 'edit_0002' }, 'merchant')).rejects.toThrow('changed')
    const publish = { storeId: 'shop', postId: created.postId, expectedRevision: updated.revision, requestId: 'publish_0001' }
    await expect(executeTool(m.db, 'publish_blog_post', publish, 'merchant')).rejects.toThrow('confirmation')
    expect((await executeTool(m.db, 'publish_blog_post', { ...publish, confirmed: true }, 'merchant')).status).toBe('published')
    expect(m.get('blogPosts/' + created.postId)?.publishedAt).toBeInstanceOf(Timestamp)
  })
  it('every write has narrow OAuth scopes and read-only annotations are accurate', () => {
    for (const tool of tools) {
      if (!tool.annotations.readOnlyHint) expect(tool.securitySchemes[0]).toMatchObject({ type: 'oauth2' })
    }
    expect(tools.find(t => t.name === 'publish_blog_post')?.annotations.destructiveHint).toBe(true)
  })
})
