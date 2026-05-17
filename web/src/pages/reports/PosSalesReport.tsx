import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, toDate } from './reportUtils'

type SaleRow = {
  id: string
  receiptNo: string
  customerName: string
  total: number
  cashTotal: number
  cardTotal: number
  momoTotal: number
  unitsSold: number
  paymentSummary: string
  createdAt: Date | null
}

function mapSale(id: string, data: Record<string, unknown>): SaleRow {
  const tenders = getNestedObject(data, 'tenders')
  const customer = getNestedObject(data, 'customer')
  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
  const cashTotal = asNumber(tenders.cash, 0)
  const cardTotal = asNumber(tenders.card, 0)
  const momoTotal = asNumber(tenders.momo ?? tenders.mobileMoney ?? tenders.mobile_money, 0)
  const unitsSold = items.reduce((sum, item) => sum + asNumber(item.qty ?? item.quantity, 0), 0)
  const paymentParts = [
    cashTotal > 0 ? `Cash ${formatMoney(cashTotal)}` : '',
    cardTotal > 0 ? `Card ${formatMoney(cardTotal)}` : '',
    momoTotal > 0 ? `MoMo ${formatMoney(momoTotal)}` : '',
  ].filter(Boolean)

  return {
    id,
    receiptNo: asText(data.receiptNo ?? data.receiptNumber ?? data.reference, id),
    customerName: asText(customer.name ?? data.customerName, 'Walk-in customer'),
    total: asNumber(data.total ?? data.grandTotal ?? data.amount, 0),
    cashTotal,
    cardTotal,
    momoTotal,
    unitsSold,
    paymentSummary: paymentParts.join(' · ') || 'Not specified',
    createdAt: toDate(data.createdAt),
  }
}

export default function PosSalesReport() {
  const { storeId } = useActiveStore()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [range, setRange] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setSales([])
      return undefined
    }

    const unsubscribe = onSnapshot(query(collection(db, 'sales'), where('storeId', '==', storeId)), snapshot => {
      setSales(snapshot.docs.map(docSnap => mapSale(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })

    return unsubscribe
  }, [storeId])

  const filtered = useMemo(() => {
    if (range === 'all') return sales
    const now = new Date()
    const start = new Date(now)
    if (range === 'today') start.setHours(0, 0, 0, 0)
    if (range === '7') start.setDate(start.getDate() - 7)
    if (range === '30') start.setDate(start.getDate() - 30)
    return sales.filter(sale => sale.createdAt && sale.createdAt >= start)
  }, [range, sales])

  const totals = useMemo(() => ({
    count: filtered.length,
    revenue: filtered.reduce((sum, sale) => sum + sale.total, 0),
    units: filtered.reduce((sum, sale) => sum + sale.unitsSold, 0),
    cash: filtered.reduce((sum, sale) => sum + sale.cashTotal, 0),
  }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-pos-sales-report.csv', filtered.map(sale => ({
      receiptNo: sale.receiptNo,
      customer: sale.customerName,
      total: sale.total,
      cash: sale.cashTotal,
      card: sale.cardTotal,
      momo: sale.momoTotal,
      unitsSold: sale.unitsSold,
      createdAt: formatDate(sale.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'POS sales report',
      subtitle: 'Detailed POS sales with receipts, payment split, units sold, and totals.',
      summary: [
        { label: 'Sales', value: totals.count },
        { label: 'Sales value', value: formatMoney(totals.revenue) },
        { label: 'Units sold', value: totals.units },
        { label: 'Cash collected', value: formatMoney(totals.cash) },
      ],
      rows: filtered.map(sale => ({
        receiptNo: sale.receiptNo,
        customer: sale.customerName,
        total: sale.total,
        cash: sale.cashTotal,
        card: sale.cardTotal,
        momo: sale.momoTotal,
        unitsSold: sale.unitsSold,
        paymentSummary: sale.paymentSummary,
        createdAt: formatDate(sale.createdAt),
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / POS sales</p>
        <h1>Internal sales report</h1>
        <p className="workspace-muted">Detailed POS sales recorded through Sell, including receipt totals, payment split, units sold, and CSV export.</p>
      </section>
      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.count}</strong><span>Sales</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.revenue)}</strong><span>Total sales value</span></article>
        <article className="workspace-card"><strong>{totals.units}</strong><span>Units sold</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.cash)}</strong><span>Cash collected</span></article>
      </section>
      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Sale details</h2><p className="workspace-muted">Filter by period and export sales.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead><tr><th>Receipt</th><th>Customer</th><th>Total</th><th>Payment</th><th>Units</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map(sale => (
                <tr key={sale.id}>
                  <td>{sale.receiptNo}</td>
                  <td>{sale.customerName}</td>
                  <td>{formatMoney(sale.total)}</td>
                  <td>{sale.paymentSummary}</td>
                  <td>{sale.unitsSold}</td>
                  <td>{formatDate(sale.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
