import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
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

  const fundColumns: ReportColumn<FundSummary>[] = [
    { key: 'fund', label: 'Fund', sortable: true, value: fund => fund.fundName },
    { key: 'source', label: 'Source / donor', sortable: true, value: fund => fund.sourceName, render: fund => fund.sourceName || '—' },
    { key: 'type', label: 'Type', sortable: true, value: fund => fund.restrictionType },
    { key: 'opening', label: 'Opening', align: 'right', sortable: true, value: fund => fund.openingBalance, render: fund => formatMoney(fund.openingBalance) },
    { key: 'inflows', label: 'Inflows', align: 'right', sortable: true, value: fund => fund.inflows, render: fund => formatMoney(fund.inflows) },
    { key: 'outflows', label: 'Outflows', align: 'right', sortable: true, value: fund => fund.outflows, render: fund => formatMoney(fund.outflows) },
    { key: 'remaining', label: 'Remaining', align: 'right', sortable: true, value: fund => fund.remaining, render: fund => formatMoney(fund.remaining) },
    { key: 'endDate', label: 'End', sortable: true, value: fund => fund.endDate, render: fund => fund.endDate || '—' },
    { key: 'reportDueDate', label: 'Report due', sortable: true, value: fund => fund.reportDueDate, render: fund => fund.reportDueDate || '—' },
  ]

  const transactionColumns: ReportColumn<Tx>[] = [
    { key: 'date', label: 'Date', sortable: true, value: tx => tx.date, render: tx => tx.date || '—' },
    { key: 'fund', label: 'Fund', sortable: true, value: tx => fundNameById.get(tx.fundId) || tx.fundName || '', render: tx => fundNameById.get(tx.fundId) || tx.fundName || '—' },
    { key: 'direction', label: 'Direction', sortable: true, value: tx => tx.direction, render: tx => tx.direction === 'inflow' ? 'Inflow / donation received' : 'Outflow / expense' },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, value: tx => tx.amount, render: tx => formatMoney(tx.amount) },
    { key: 'project', label: 'Project', sortable: true, value: tx => tx.project, render: tx => tx.project || '—' },
    { key: 'category', label: 'Category', sortable: true, value: tx => tx.category, render: tx => tx.category || '—' },
    { key: 'description', label: 'Description', sortable: true, value: tx => tx.description, render: tx => tx.description || '—' },
  ]

  return <div className="workspace-page">
    <section className="workspace-card"><p className="workspace-eyebrow">Reports / Funds</p><h1>Funds report</h1><p className="workspace-muted">Funds ledger report for fund buckets, opening balances, donor/source inflows, outflows, remaining balances, CSV export, and PDF export.</p></section>
    <section className="workspace-card" style={{ borderLeft: '5px solid #4f46e5' }}><strong>Opening balance is not the donor amount.</strong><p className="workspace-muted">Opening balance means the money already inside that fund before you started tracking it in Sedifex. If a donor gives money now, record it as an inflow transaction.</p></section>
    <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.funds}</strong><span>Funds</span></article><article className="workspace-card"><strong>{formatMoney(totals.inflows)}</strong><span>Donor/source inflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.outflows)}</strong><span>Outflows</span></article><article className="workspace-card"><strong>{formatMoney(totals.remaining)}</strong><span>Remaining</span></article></section>
    <ReportDataTable title="Fund buckets" subtitle="Saved funds show here even before any transaction is added." rows={filteredFundSummaries} columns={fundColumns} getRowKey={fund => fund.id} searchPlaceholder="Search fund, source, or type…" actions={<><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filteredFundSummaries.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportFunds} disabled={!filteredFundSummaries.length}>Export fund CSV</button></>} filters={<select value={fundFilter} onChange={event => setFundFilter(event.target.value)}><option value="all">All funds</option>{funds.map(fund => <option key={fund.id} value={fund.id}>{fund.fundName}</option>)}</select>} />
    <ReportDataTable title="Fund transactions" subtitle="These are donor/source inflows and expenses/outflows linked to the selected fund." rows={filteredTx} columns={transactionColumns} getRowKey={tx => tx.id} searchPlaceholder="Search transaction date, fund, project, category, or description…" actions={<button type="button" className="button button--primary" onClick={exportRows} disabled={!filteredTx.length}>Export transactions CSV</button>} />
  </div>
}
