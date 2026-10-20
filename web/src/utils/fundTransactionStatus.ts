type LedgerPayment = { status?: unknown; source?: unknown; payment?: { status?: unknown } }

// Legacy manual entries have no status. Online intents must be explicitly settled.
export function isPostedFundTransaction(tx: LedgerPayment): boolean {
  const status = String(tx.status ?? tx.payment?.status ?? '').trim().toLowerCase()
  if (status) return ['captured', 'paid', 'success', 'confirmed', 'completed'].includes(status)
  return !tx.payment && (!tx.source || tx.source === 'manual_fund_ledger')
}
