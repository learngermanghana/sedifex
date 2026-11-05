import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  data: { storeId: 'ngo', amount: 100, currency: 'GHS', date: '2026-10-20', payment: { customerTotal: 102 } } as Record<string, any>,
  writes: [] as any[],
}))
vi.mock('./_firebase-admin.js', () => ({
  db: () => ({
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [{ ref: { id: 'gift' } }] }) }) }),
      doc: (id: string) => ({ id }),
    }),
    runTransaction: async (fn: any) => fn({
      get: async () => ({ data: () => state.data }),
      set: (...args: any[]) => { state.writes.push(args) },
    }),
  }),
}))
import { confirmDonation } from './_confirm-donation.js'

beforeEach(() => {
  state.writes = []
  state.data = { storeId: 'ngo', amount: 100, currency: 'GHS', date: '2026-10-20', payment: { customerTotal: 102 } }
  process.env.PAYSTACK_SECRET = 'test-secret'
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: true, data: { status: 'success', reference: 'DON-1', amount: 10200, currency: 'GHS', metadata: { storeId: 'ngo', fundTransactionId: 'gift' } } }),
  })))
})

describe('provider-verified donations', () => {
  it('records donation principal separately from provider fees and queues a receipt', async () => {
    await confirmDonation('DON-1', 'ngo')
    expect(state.writes[0][1]).toMatchObject({ confirmedAmount: 100, providerAmountPaid: 102, accountingConfirmed: true })
    expect(state.writes[1][0].id).toBe('donation_gift')
  })
  it('rejects a payment belonging to a different workspace', async () => {
    await expect(confirmDonation('DON-1', 'other')).rejects.toThrow('workspace mismatch')
    expect(state.writes).toHaveLength(0)
  })
  it('rejects the wrong amount or currency', async () => {
    state.data.amount = 200
    state.data.payment.customerTotal = 202
    await expect(confirmDonation('DON-1', 'ngo')).rejects.toThrow('mismatch')
    expect(state.writes).toHaveLength(0)
  })
  it('never trusts an unsuccessful provider response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      status: true, data: { status: 'failed', reference: 'DON-1', amount: 10200, currency: 'GHS' },
    }) })))
    await expect(confirmDonation('DON-1', 'ngo')).rejects.toThrow('successful')
    expect(state.writes).toHaveLength(0)
  })
  it('does not queue duplicate receipts after repeated confirmation', async () => {
    state.data.accountingConfirmed = true
    await confirmDonation('DON-1', 'ngo')
    expect(state.writes).toHaveLength(1)
  })
})
