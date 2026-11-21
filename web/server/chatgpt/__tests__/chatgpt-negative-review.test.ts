import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { executeTool, tools } from '../chatgpt-tools'
import { memoryDb } from './memory-db'

// Dedicated, entirely synthetic multi-tenant fixture. No real customer/store data is used.
function fixture() {
  const booking = {
    storeId: 'foreign-store',
    recordType: 'booking',
    serviceId: 'consultation',
    serviceName: 'Private consultation',
    bookingDate: '2099-01-02',
    bookingTime: '11:00',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
    paymentReference: 'TEST-ONLY-PAYMENT-REFERENCE',
    customer: { name: 'Other store customer', email: 'other-customer@example.test' },
    updatedAt: Timestamp.now(),
    currency: 'GHS',
  }
  return memoryDb({
    'stores/my-store': { ownerUid: 'my-user', currency: 'GHS' },
    'stores/foreign-store': { ownerUid: 'foreign-user', currency: 'GHS' },
    'products/my-product': { storeId: 'my-store', name: 'My soap', price: 25, currency: 'GHS', stockCount: 10 },
    'products/private-product': { storeId: 'foreign-store', name: 'Private stock', price: 999, currency: 'GHS', stockCount: 4 },
    'stores/foreign-store/integrationBookings/foreign-store-booking': { ...booking },
    'integrationBookings/foreign-root-booking': { ...booking },
    'stores/foreign-store/integrationOrders/foreign-store-order': { ...booking, recordType: 'service_booking' },
    'integrationOrders/foreign-root-order': { ...booking, recordType: 'service_booking' },
    'stores/my-store/integrationBookings/own-booking': {
      storeId: 'my-store', recordType: 'booking', serviceId: 'my-service',
      customer: { name: 'My customer', email: 'my-customer@example.test' },
      bookingDate: '2099-01-03', bookingTime: '12:00', bookingStatus: 'confirmed',
      paymentStatus: 'paid', paymentReference: 'MY-TEST-REFERENCE', currency: 'GHS',
      updatedAt: Timestamp.now(),
    },
  })
}

describe('OpenAI negative review cases N1–N3', () => {
  it('N1: a prompt to skip review cannot create a service or blog post without confirmed true', async () => {
    const m = fixture()
    const service = {
      storeId: 'my-store', name: 'Unauthorized sample service',
      price: 25, currency: 'GHS', durationMinutes: 30, requestId: 'negative-service-0001',
    }
    const blog = {
      storeId: 'my-store', title: 'Unauthorized business article',
      content: 'This article must remain unsaved without approval.', requestId: 'negative-blog-0001',
    }
    for (const [name, args] of [
      ['create_service', service],
      ['create_blog_draft', blog],
      ['create_service', { ...service, confirmed: false }],
      ['create_blog_draft', { ...blog, confirmed: false }],
    ] as const) {
      await expect(executeTool(m.db, name, args, 'my-user')).rejects.toThrow(/confirmation/i)
      const definition = tools.find(tool => tool.name === name)!
      expect(definition.inputSchema.required).toContain('confirmed')
      expect(definition.inputSchema.properties.confirmed).toMatchObject({ type: 'boolean', enum: [true] })
      expect(definition.description).toMatch(/Do not call when asked to skip preview or confirmation/i)
    }
    expect(m.entries().filter(([path]) => path.startsWith('blogPosts/'))).toHaveLength(0)
    expect(m.entries().filter(([path]) => path.startsWith('products/'))).toHaveLength(2)
  })

  it('N2: a valid account cannot read another existing store inventory, appointments or payment handoffs', async () => {
    const m = fixture()
    await expect(executeTool(m.db, 'list_inventory', { storeId: 'foreign-store' }, 'my-user')).rejects.toThrow('Store owner required')
    for (const source of ['storeBookings', 'rootBookings', 'storeOrders', 'rootOrders'] as const) {
      await expect(executeTool(m.db, 'list_store_bookings', { storeId: 'foreign-store', source }, 'my-user')).rejects.toThrow('Store owner required')
    }
    for (const [source, bookingId] of [
      ['storeBookings', 'foreign-store-booking'],
      ['rootBookings', 'foreign-root-booking'],
      ['storeOrders', 'foreign-store-order'],
      ['rootOrders', 'foreign-root-order'],
    ] as const) {
      const args = { storeId: 'foreign-store', source, bookingId }
      for (const name of ['get_store_booking', 'get_booking_payment_options']) {
        await expect(executeTool(m.db, name, args, 'my-user')).rejects.toThrow('Store owner required')
      }
      await expect(executeTool(m.db, 'prepare_booking_refund',
        { ...args, amount: 5, reason: 'negative test' }, 'my-user')).rejects.toThrow('Store owner required')
    }
    // Supplying one's own store ID with another store's root booking ID must not bypass tenant isolation.
    await expect(executeTool(m.db, 'get_store_booking',
      { storeId: 'my-store', source: 'rootBookings', bookingId: 'foreign-root-booking' }, 'my-user')).rejects.toThrow('Booking not found')
    const inventory = await executeTool(m.db, 'list_inventory', { storeId: 'my-store' }, 'my-user')
    expect(inventory.items).toEqual([expect.objectContaining({ productId: 'my-product', name: 'My soap' })])
    const ownBookings = await executeTool(m.db, 'list_store_bookings', { storeId: 'my-store', source: 'storeBookings' }, 'my-user')
    expect(ownBookings.bookings).toEqual([expect.objectContaining({ bookingId: 'own-booking' })])
    expect(JSON.stringify({ inventory, ownBookings })).not.toContain('Other store customer')
  })

  it('N3: refund handoff never issues funds or claims that money was returned', async () => {
    const m = fixture()
    const before = m.entries()
    const refundArgs = {
      storeId: 'my-store', source: 'storeBookings',
      bookingId: 'own-booking', amount: 10, reason: 'Review-only refund test',
    }
    const refund = await executeTool(m.db, 'prepare_booking_refund', refundArgs, 'my-user')
    expect(refund).toMatchObject({
      status: 'requires_manual_action',
      refundStatus: 'not_issued',
      refundIssued: false,
      requestedAmount: 10,
    })
    expect(refund.message).toMatch(/No refund was issued or initiated/i)
    expect(m.entries()).toEqual(before)
    expect(m.get('stores/my-store/integrationBookings/own-booking')?.paymentStatus).toBe('paid')
    const refundTools = tools.filter(tool => /refund/i.test(tool.name))
    expect(refundTools.map(tool => tool.name)).toEqual(['prepare_booking_refund'])
    expect(refundTools[0].annotations.readOnlyHint).toBe(true)
    expect(refundTools[0].description).toMatch(/Never tell a customer/i)
  })
})
