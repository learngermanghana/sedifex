import { describe, expect, it } from 'vitest'
import { isPostedFundTransaction } from './fundTransactionStatus'

describe('posted fund transactions', () => {
  it('excludes unsuccessful online donations from spendable balances', () => {
    for (const status of ['pending_payment', 'pending_confirmation', 'failed', 'refunded', 'cancelled']) {
      expect(isPostedFundTransaction({ status, source: 'website' })).toBe(false)
    }
    expect(isPostedFundTransaction({ source: 'website' })).toBe(false)
    expect(isPostedFundTransaction({ payment: { status: 'pending' } })).toBe(false)
  })
  it('includes confirmed donations and historical manual ledger records', () => {
    expect(isPostedFundTransaction({ status: 'captured', source: 'website' })).toBe(true)
    expect(isPostedFundTransaction({ payment: { status: 'paid' } })).toBe(true)
    expect(isPostedFundTransaction({ source: 'manual_fund_ledger' })).toBe(true)
    expect(isPostedFundTransaction({})).toBe(true)
  })
  it('does not allow nested payment state to override a failed transaction', () => {
    expect(isPostedFundTransaction({ status: 'failed', payment: { status: 'captured' } })).toBe(false)
  })
})
