import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatMoney } from './reportUtils'

type Fund = { id: string; fundName: string; sourceName: string; restrictionType: string; openingBalance: number; endDate?: string; reportDueDate?: string; status: string }
type Tx = { id: string; fundId: string; direction: 'inflow' | 'outflow'; amount: number; date: string; project: string; category: string; description: string }

export default function FundsReport() {
  const { storeId } = useActiveStore()
  const [funds, setFunds] = useState<Fund[]>([])
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [fundFilter, setFundFilter] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setFunds([])
      setTransactions([])
      return undefined
    }
    const unsubFunds = onSnapshot(query(collection(db, 'funds'), where('storeId', '==', storeId)), snapshot => setFunds(snapshot.docs.map(docSnap => {
      const data = docSnap.data() as Record<string, unknown>
      return { id: docSnap.id, fundName: asText(data.fundName, 'Fund'), sourceName: asText(data.sourceName, ''), restrictionType: asText(data.restrictionType, 'restricted'), openingBalance: asNumber(data.openingBalance, 0), endDate: asText(data.endDate, ''), reportDueDate: asText(data.reportDueDate, ''), status: asText(data.status, 'active') }
    })))
    const unsubTx = onSnapshot(query(collection(db, 'fund_transactions'), where('storeId', '==', storeId)), snapshot => setTransactions(snapshot.docs.map(docSnap => {
      const data = docSnap.data() as Record<string, unknown>
      return { id: docSnap.id, fundId: asText(data.fundId, ''), direction: data.direction === 'outflow' ? 'outflow' : 'inflow', amount: asNumber(data.amount, 0), date: asText(data.date, ''), project: asText(data.project, ''), category: asText(data.category, ''), description: asText(data.description, '') }
    })))
    return () => { unsubFunds(); unsubTx() }
  }, [storeId])

  const fundNameById = useMemo(() => new Map(funds.map(fund => [fund.id, fund.fundName])), [funds])
  const filteredTx = useMemo(() => fundFilter === 'all' ? transactions : transactions.filter(tx => tx.fundId === fundFilter), [fundFilter, transactions])
  const totals = useMemo(() => {
    const opening = funds.reduce((sum, fund) => sum + fund.openingBalance, 0)
    const inflows = transactions.filter(tx => tx.direction === 'inflow').reduce((sum, tx) => sum + tx.amount, 0)
    const outflows = transactions.filter(tx => tx.direction === 'outflow').reduce((sum, tx) => sum + tx.amount, 0)
    return { funds: funds.length, opening, inflows, outflows, remaining: opening + inflows - outflows }
  }, [funds, transactions])

  const reportRows = filteredTx.map(tx => ({ fund: fundNameById.get(tx.fundId) || tx.fundId, date: tx.date, direction: tx.direction, amount: tx.amount, project: tx.project, category: tx.category, description: tx.description }))

  function exportRows() { downloadCsv('sedifex-funds-report.csv', reportRows) }
  function exportPdf() {
    exportReportPdf({ title: 'Funds report', subtitle: 'Manual funds and grants ledger transactions.', summary: [
      { label: 'Funds', value: totals.funds }, { label: 'Opening balances', value: formatMoney(totals.opening) }, { label: 'Inflows', value: formatMoney(totals.inflows) }, { label: 'Outflows', value: formatMoney(totals.outflows) }, { label: 'Remaining', value: formatMoney(totals.remaining) },
    ], rows: reportRows })
  }

  return <div className="workspace-page">
    <section className="workspace-card"><p className="workspace-eyebrow">Reports / Funds</p><h1>Funds report</h1><p className="workspace-muted">Funds ledger report for manual fund buckets, inflows, outflows, balances, CSV export, and PDF export.</p></section>
    <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.funds}</strong><span>Funds</span></article><article className="workspace-card"><strong>{formatMoney(totals.inflows)}</strong><span>Inflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.outflows)}</strong><span>Outflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.remaining)}</strong><span>Remaining</span></article></section>
    <section className="workspace-card"><div className="workspace-section-header"><div><h2>Fund transactions</h2><p className="workspace-muted">Filter by fund and export. Funds are manual, so no dashboard metric is shown.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filteredTx.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!filteredTx.length}>Export CSV</button></div></div><div className="workspace-toolbar"><select value={fundFilter} onChange={event => setFundFilter(event.target.value)}><option value="all">All funds</option>{funds.map(fund => <option key={fund.id} value={fund.id}>{fund.fundName}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Date</th><th>Fund</th><th>Direction</th><th>Amount</th><th>Project</th><th>Category</th><th>Description</th></tr></thead><tbody>{filteredTx.map(tx => <tr key={tx.id}><td>{tx.date || '—'}</td><td>{fundNameById.get(tx.fundId) || '—'}</td><td>{tx.direction}</td><td>{formatMoney(tx.amount)}</td><td>{tx.project || '—'}</td><td>{tx.category || '—'}</td><td>{tx.description || '—'}</td></tr>)}</tbody></table></div></section>
  </div>
}
