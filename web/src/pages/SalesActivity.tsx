import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './SalesActivity.css'

type Status = 'voided' | 'verified' | 'cash_recorded' | 'recorded_unverified'
type Sale = {
  id: string
  receiptNo: string
  cashierId: string
  createdAt: number | null
  customerName: string
  amount: number
  method: string
  status: Status
  providerStatus: string | null
  items: { name: string; qty: number }[]
  review: { status: string; reason: string; reportedAt: number | null; resolution: string } | null
  voidReason: string
}
type ActivityResponse = { role: 'owner' | 'staff'; sales: Sale[]; limit: number }
type Range = 'today' | '7d' | '30d' | 'all'

function money(amount: number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount)
}

function when(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleString() : 'Date not available'
}

const statusLabels: Record<Status, string> = {
  voided: 'Voided',
  verified: 'Payment verified',
  cash_recorded: 'Cash recorded',
  recorded_unverified: 'Recorded · payment not verified',
}

export default function SalesActivity() {
  const { storeId } = useActiveStore()
  const [data, setData] = useState<ActivityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<Range>('7d')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!storeId) {
      setData(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await httpsCallable<{ storeId: string }, ActivityResponse>(functions, 'listSalesActivity')({ storeId })
      setData(result.data)
    } catch (cause) {
      setData(null)
      setError(cause instanceof Error ? cause.message : 'Unable to load sales activity')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    let active = true
    if (!storeId) {
      setData(null)
      return
    }
    setData(null)
    setLoading(true)
    setError('')
    httpsCallable<{ storeId: string }, ActivityResponse>(functions, 'listSalesActivity')({ storeId })
      .then(result => { if (active) setData(result.data) })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load sales activity')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [storeId])

  const visible = useMemo(() => {
    const now = Date.now()
    const from = range === 'today' ? new Date().setHours(0, 0, 0, 0)
      : range === '7d' ? now - 7 * 86400000
      : range === '30d' ? now - 30 * 86400000 : 0
    const needle = search.toLowerCase().trim()
    return (data?.sales || []).filter(sale => {
      if (sale.createdAt !== null && sale.createdAt < from) return false
      if (onlyFlagged && sale.review?.status !== 'open') return false
      if (!needle) return true
      return [sale.receiptNo, sale.customerName, sale.cashierId, sale.id,
        ...sale.items.map(item => item.name)].join(' ').toLowerCase().includes(needle)
    })
  }, [data, range, search, onlyFlagged])

  const stats = useMemo(() => ({
    recorded: visible.filter(sale => sale.status === 'cash_recorded' || sale.status === 'recorded_unverified').length,
    verified: visible.filter(sale => sale.status === 'verified').length,
    voided: visible.filter(sale => sale.status === 'voided').length,
    flagged: visible.filter(sale => sale.review?.status === 'open').length,
  }), [visible])

  async function report(sale: Sale) {
    if (!storeId || busyId) return
    const reason = window.prompt('What went wrong with this sale? The owner will review your report.')?.trim()
    if (!reason) return
    if (reason.length < 5 || reason.length > 500) {
      setError('Please enter 5–500 characters explaining the mistake.')
      return
    }
    setBusyId(sale.id)
    setError('')
    try {
      await httpsCallable(functions, 'flagSaleForReview')({ storeId, saleId: sale.id, reason })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to report the mistake')
    } finally {
      setBusyId(null)
    }
  }

  async function resolve(sale: Sale) {
    if (!storeId || busyId || data?.role !== 'owner') return
    const resolution = window.prompt('Explain how the issue was resolved. This will be saved to the audit log.')?.trim()
    if (!resolution) return
    if (resolution.length < 5 || resolution.length > 500) {
      setError('Please enter 5–500 characters explaining the resolution.')
      return
    }
    setBusyId(sale.id)
    setError('')
    try {
      await httpsCallable(functions, 'resolveSaleReview')({ storeId, saleId: sale.id, resolution })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resolve the review')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="sales-activity workspace-page">
      <header className="sales-activity__header">
        <div>
          <h1>{data?.role === 'owner' ? 'Team Activity' : 'My Activity'}</h1>
          <p className="workspace-muted">Track POS sales, check recorded payment status, and report errors without changing completed transactions.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => void load()} disabled={loading || !storeId}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      <p className="sales-activity__notice">A recorded POS sale is not proof that an electronic payment succeeded. Only verified provider records are shown as payment verified. Offline sales appear after they sync.</p>
      {error && <p className="sales-activity__error" role="alert">{error}</p>}
      {!storeId && <p>Select your workspace to see activity.</p>}

      {data && (
        <>
          <div className="sales-activity__metrics" aria-label="Activity summary">
            <div><strong>{stats.recorded}</strong><span>Recorded</span></div>
            <div><strong>{stats.verified}</strong><span>Verified</span></div>
            <div><strong>{stats.flagged}</strong><span>Needs review</span></div>
            <div><strong>{stats.voided}</strong><span>Voided</span></div>
          </div>

          <div className="sales-activity__filters">
            <label>Period
              <select value={range} onChange={event => setRange(event.target.value as Range)}>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All loaded dates</option>
              </select>
            </label>
            <label>Find a transaction
              <input type="search" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Receipt, customer, item, cashier…" />
            </label>
            <label className="sales-activity__check">
              <input type="checkbox" checked={onlyFlagged} onChange={event => setOnlyFlagged(event.target.checked)} />
              Open reviews only
            </label>
          </div>

          <div className="sales-activity__list">
            {visible.length === 0 && <p className="sales-activity__empty">No matching sales. Try another date or search.</p>}
            {visible.map(sale => (
              <article key={sale.id} className="sales-activity__item">
                <div className="sales-activity__sale-head">
                  <div>
                    <strong>{sale.receiptNo}</strong>
                    <p>{when(sale.createdAt)} · {sale.customerName}</p>
                    {data.role === 'owner' && <p>Staff ID: {sale.cashierId || 'Not recorded'}</p>}
                  </div>
                  <div className="sales-activity__amount">
                    <strong>{money(sale.amount)}</strong>
                    <span className={`sales-activity__status sales-activity__status--${sale.status}`}>{statusLabels[sale.status] || 'Unknown'}</span>
                  </div>
                </div>

                {sale.review?.status === 'open' && <p className="sales-activity__flag">Needs owner review: {sale.review.reason}</p>}
                {sale.review?.status === 'resolved' && <p className="sales-activity__resolved">Review resolved: {sale.review.resolution}</p>}
                <div className="sales-activity__actions">
                  <button type="button" className="button button--secondary button--small"
                    onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}>
                    {expanded === sale.id ? 'Hide details' : 'View details'}
                  </button>
                  <Link to={`/receipt/${encodeURIComponent(sale.id)}`} className="button button--secondary button--small">Receipt</Link>
                  {sale.status !== 'voided' && sale.review?.status !== 'open' && (
                    <button type="button" className="button button--secondary button--small"
                      disabled={busyId !== null} onClick={() => void report(sale)}>Report mistake</button>
                  )}
                  {data.role === 'owner' && sale.review?.status === 'open' && (
                    <>
                      <button type="button" className="button button--secondary button--small"
                        disabled={busyId !== null} onClick={() => void resolve(sale)}>Mark resolved</button>
                      <Link to="/reports/pos-sales" className="button button--secondary button--small">Open POS report</Link>
                    </>
                  )}
                </div>
                {expanded === sale.id && (
                  <div className="sales-activity__details">
                    <p><strong>Payment method:</strong> {sale.method.replace(/_/g, ' ')}</p>
                    <p><strong>Provider status:</strong> {sale.providerStatus || 'Not independently confirmed'}</p>
                    {sale.voidReason && <p><strong>Void reason:</strong> {sale.voidReason}</p>}
                    <p><strong>Items:</strong> {sale.items.length
                      ? sale.items.map(item => `${item.name} × ${item.qty}`).join(', ') : 'Not available'}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className="workspace-muted">Showing {visible.length} of {data.sales.length} loaded sales (latest {data.limit} per workspace/staff). Older transactions remain available in the owner reports. Staff see only their own attributed POS sales.</p>
        </>
      )}
      {loading && !data && <p role="status">Loading sales activity…</p>}
      {data?.role === 'staff' && <p className="workspace-muted">Need a correction or refund? Flag the sale. Only the workspace owner can void completed sales or process a refund.</p>}
    </main>
  )
}
