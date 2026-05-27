import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatMoney } from './reportUtils'

type Fund = { id: string; fundName: string; sourceName: string; restrictionType: string; openingBalance: number; endDate?: string; reportDueDate?: string; status: string }
type Tx = { id: string; fundId: string; fundName?: string; direction: 'inflow' | 'outflow'; amount: number; date: string; project: string; category: string; description: string }

type FundSummary = Fund & { inflows: number; outflows: number; remaining: number }

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
      return { id: docSnap.id, fundId: asText(data.fundId, ''), fundName: asText(data.fundName, ''), direction: data.direction === 'outflow' ? 'outflow' : 'inflow', amount: asNumber(data.amount, 0), date: asText(data.date, ''), project: asText(data.project, ''), category: asText(data.category, ''), description: asText(data.description, '') }
    })))
    return () => { unsubFunds(); unsubTx() }
  }, [storeId])

  const fundNameById = useMemo(() => new Map(funds.map(fund => [fund.id, fund.fundName])), [funds])
  const fundSummaries = useMemo<FundSummary[]>(() => funds.map(fund => {
    const fundTx = transactions.filter(tx => tx.fundId === fund.id)
    const inflows = fundTx.filter(tx => tx.direction === 'inflow').reduce((sum, tx) => sum + tx.amount, 0)
    const outflows = fundTx.filter(tx => tx.direction === 'outflow').reduce((sum, tx) => sum + tx.amount, 0)
    return { ...fund, inflows, outflows, remaining: fund.openingBalance + inflows - outflows }
  }), [funds, transactions])
  const filteredFundSummaries = useMemo(() => fundFilter === 'all' ? fundSummaries : fundSummaries.filter(fund => fund.id === fundFilter), [fundFilter, fundSummaries])
  const filteredTx = useMemo(() => fundFilter === 'all' ? transactions : transactions.filter(tx => tx.fundId === fundFilter), [fundFilter, transactions])
  const totals = useMemo(() => {
    const opening = filteredFundSummaries.reduce((sum, fund) => sum + fund.openingBalance, 0)
    const inflows = filteredFundSummaries.reduce((sum, fund) => sum + fund.inflows, 0)
    const outflows = filteredFundSummaries.reduce((sum, fund) => sum + fund.outflows, 0)
    return { funds: filteredFundSummaries.length, opening, inflows, outflows, remaining: opening + inflows - outflows }
  }, [filteredFundSummaries])

  const fundRows = filteredFundSummaries.map(fund => ({ fund: fund.fundName, source: fund.sourceName, type: fund.restrictionType, openingBalance: fund.openingBalance, inflows: fund.inflows, outflows: fund.outflows, remaining: fund.remaining, endDate: fund.endDate, reportDueDate: fund.reportDueDate, status: fund.status }))
  const reportRows = filteredTx.map(tx => ({ fund: fundNameById.get(tx.fundId) || tx.fundName || tx.fundId, date: tx.date, direction: tx.direction, amount: tx.amount, project: tx.project, category: tx.category, description: tx.description }))

  function exportFunds() { downloadCsv('sedifex-fund-buckets-report.csv', fundRows) }
  function exportRows() { downloadCsv('sedifex-funds-transactions-report.csv', reportRows) }
  function exportPdf() {
    exportReportPdf({ title: 'Funds report', subtitle: 'Fund buckets and manual ledger transactions. Opening balance means the balance already available before tracking; donor money received later should be an inflow transaction.', summary: [
      { label: 'Funds', value: totals.funds }, { label: 'Opening balances', value: formatMoney(totals.opening) }, { label: 'Inflows', value: formatMoney(totals.inflows) }, { label: 'Outflows', value: formatMoney(totals.outflows) }, { label: 'Remaining', value: formatMoney(totals.remaining) },
    ], rows: fundRows })
  }

  return <div className="workspace-page">
    <section className="workspace-card"><p className="workspace-eyebrow">Reports / Funds</p><h1>Funds report</h1><p className="workspace-muted">Funds ledger report for fund buckets, opening balances, donor/source inflows, outflows, remaining balances, CSV export, and PDF export.</p></section>
    <section className="workspace-card" style={{ borderLeft: '5px solid #4f46e5' }}><strong>Opening balance is not the donor amount.</strong><p className="workspace-muted">Opening balance means the money already inside that fund before you started tracking it in Sedifex. If a donor gives money now, record it as an inflow transaction.</p></section>
    <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.funds}</strong><span>Funds</span></article><article className="workspace-card"><strong>{formatMoney(totals.inflows)}</strong><span>Donor/source inflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.outflows)}</strong><span>Outflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.remaining)}</strong><span>Remaining</span></article></section>
    <section className="workspace-card"><div className="workspace-section-header"><div><h2>Fund buckets</h2><p className="workspace-muted">Saved funds show here even before any transaction is added.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filteredFundSummaries.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportFunds} disabled={!filteredFundSummaries.length}>Export fund CSV</button></div></div><div className="workspace-toolbar"><select value={fundFilter} onChange={event => setFundFilter(event.target.value)}><option value="all">All funds</option>{funds.map(fund => <option key={fund.id} value={fund.id}>{fund.fundName}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Fund</th><th>Source / donor</th><th>Type</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Remaining</th><th>End</th><th>Report due</th></tr></thead><tbody>{filteredFundSummaries.length === 0 ? <tr><td colSpan={9}>No fund buckets saved yet.</td></tr> : null}{filteredFundSummaries.map(fund => <tr key={fund.id}><td>{fund.fundName}</td><td>{fund.sourceName || '—'}</td><td>{fund.restrictionType}</td><td>{formatMoney(fund.openingBalance)}</td><td>{formatMoney(fund.inflows)}</td><td>{formatMoney(fund.outflows)}</td><td>{formatMoney(fund.remaining)}</td><td>{fund.endDate || '—'}</td><td>{fund.reportDueDate || '—'}</td></tr>)}</tbody></table></div></section>
    <section className="workspace-card"><div className="workspace-section-header"><div><h2>Fund transactions</h2><p className="workspace-muted">These are donor/source inflows and expenses/outflows linked to the selected fund.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--primary" onClick={exportRows} disabled={!filteredTx.length}>Export transactions CSV</button></div></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Date</th><th>Fund</th><th>Direction</th><th>Amount</th><th>Project</th><th>Category</th><th>Description</th></tr></thead><tbody>{filteredTx.length === 0 ? <tr><td colSpan={7}>No transactions for this fund yet.</td></tr> : null}{filteredTx.map(tx => <tr key={tx.id}><td>{tx.date || '—'}</td><td>{fundNameById.get(tx.fundId) || tx.fundName || '—'}</td><td>{tx.direction === 'inflow' ? 'Inflow / donation received' : 'Outflow / expense'}</td><td>{formatMoney(tx.amount)}</td><td>{tx.project || '—'}</td><td>{tx.category || '—'}</td><td>{tx.description || '—'}</td></tr>)}</tbody></table></div></section>
  </div>
}
