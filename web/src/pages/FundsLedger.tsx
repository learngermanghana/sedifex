import React, { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'

type Fund = {
  id: string
  storeId: string
  fundName: string
  sourceName: string
  restrictionType: 'restricted' | 'unrestricted'
  openingBalance: number
  endDate?: string
  reportDueDate?: string
  status: 'active' | 'closed'
}

type FundTransaction = {
  id: string
  storeId: string
  fundId: string
  direction: 'inflow' | 'outflow'
  amount: number
  date: string
  project: string
  category: string
  description: string
}

export default function FundsLedger() {
  const { storeId } = useActiveStore()
  const user = useAuthUser()

  const [funds, setFunds] = useState<Fund[]>([])
  const [transactions, setTransactions] = useState<FundTransaction[]>([])

  const [fundName, setFundName] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [restrictionType, setRestrictionType] = useState<'restricted' | 'unrestricted'>('restricted')
  const [openingBalance, setOpeningBalance] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reportDueDate, setReportDueDate] = useState('')

  const [fundId, setFundId] = useState('')
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) return
    const fundsQuery = query(collection(db, 'funds'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const txQuery = query(
      collection(db, 'fund_transactions'),
      where('storeId', '==', storeId),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc'),
    )

    const unsubFunds = onSnapshot(fundsQuery, snapshot => {
      setFunds(
        snapshot.docs.map(docSnap => {
          const data = docSnap.data() as any
          return {
            id: docSnap.id,
            storeId: data.storeId,
            fundName: data.fundName || '',
            sourceName: data.sourceName || '',
            restrictionType: data.restrictionType === 'unrestricted' ? 'unrestricted' : 'restricted',
            openingBalance: Number(data.openingBalance) || 0,
            endDate: data.endDate || '',
            reportDueDate: data.reportDueDate || '',
            status: data.status === 'closed' ? 'closed' : 'active',
          }
        }),
      )
    })

    const unsubTx = onSnapshot(txQuery, snapshot => {
      setTransactions(
        snapshot.docs.map(docSnap => {
          const data = docSnap.data() as any
          return {
            id: docSnap.id,
            storeId: data.storeId,
            fundId: data.fundId,
            direction: data.direction === 'outflow' ? 'outflow' : 'inflow',
            amount: Number(data.amount) || 0,
            date: data.date || '',
            project: data.project || '',
            category: data.category || '',
            description: data.description || '',
          }
        }),
      )
    })

    return () => {
      unsubFunds()
      unsubTx()
    }
  }, [storeId])

  const stats = useMemo(() => {
    const byFund = new Map<string, { inflows: number; outflows: number }>()
    transactions.forEach(tx => {
      const current = byFund.get(tx.fundId) || { inflows: 0, outflows: 0 }
      if (tx.direction === 'inflow') current.inflows += tx.amount
      else current.outflows += tx.amount
      byFund.set(tx.fundId, current)
    })
    return byFund
  }, [transactions])

  async function createFund(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId || !user) return
    if (!fundName.trim() || !sourceName.trim()) return

    await addDoc(collection(db, 'funds'), {
      storeId,
      fundName: fundName.trim(),
      sourceName: sourceName.trim(),
      restrictionType,
      openingBalance: Number(openingBalance) || 0,
      endDate: endDate || null,
      reportDueDate: reportDueDate || null,
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })

    setFundName('')
    setSourceName('')
    setOpeningBalance('')
    setEndDate('')
    setReportDueDate('')
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId || !user || !fundId || Number(amount) <= 0) return

    const targetFund = funds.find(item => item.id === fundId)
    if (!targetFund) return

    const fundTotals = stats.get(fundId) || { inflows: 0, outflows: 0 }
    const remainingBefore = targetFund.openingBalance + fundTotals.inflows - fundTotals.outflows
    if (direction === 'outflow' && Number(amount) > remainingBefore) {
      setError('Outflow exceeds remaining fund balance.')
      return
    }

    setError(null)
    await addDoc(collection(db, 'fund_transactions'), {
      storeId,
      fundId,
      direction,
      amount: Number(amount),
      date,
      project: project.trim(),
      category: category.trim(),
      description: description.trim(),
      source: 'manual',
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })

    setAmount('')
    setProject('')
    setCategory('')
    setDescription('')
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>Funds & Grants Ledger</h1>
        <p className="form__hint">Track donor funds, tranches, outflows, and remaining balances.</p>
      </header>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2>Create fund bucket</h2>
        <form onSubmit={createFund} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <input value={fundName} onChange={e => setFundName(e.target.value)} placeholder="Fund name" required />
          <input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="Source / donor" required />
          <select value={restrictionType} onChange={e => setRestrictionType(e.target.value as 'restricted' | 'unrestricted')}>
            <option value="restricted">Restricted</option>
            <option value="unrestricted">Unrestricted</option>
          </select>
          <input value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="Opening balance" type="number" min="0" step="0.01" />
          <input value={endDate} onChange={e => setEndDate(e.target.value)} type="date" />
          <input value={reportDueDate} onChange={e => setReportDueDate(e.target.value)} type="date" />
          <button className="button button--primary" type="submit">Save fund</button>
        </form>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2>Add transaction</h2>
        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        <form onSubmit={addTransaction} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <select value={fundId} onChange={e => setFundId(e.target.value)} required>
            <option value="">Select fund</option>
            {funds.map(fund => <option key={fund.id} value={fund.id}>{fund.fundName}</option>)}
          </select>
          <select value={direction} onChange={e => setDirection(e.target.value as 'inflow' | 'outflow')}>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount" required />
          <input value={date} onChange={e => setDate(e.target.value)} type="date" required />
          <input value={project} onChange={e => setProject(e.target.value)} placeholder="Project / campaign" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
          <button className="button button--primary" type="submit">Save transaction</button>
        </form>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Funds summary</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fund</th><th>Source</th><th>Type</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Remaining</th><th>End</th><th>Report due</th>
              </tr>
            </thead>
            <tbody>
              {funds.map(fund => {
                const totals = stats.get(fund.id) || { inflows: 0, outflows: 0 }
                const remaining = fund.openingBalance + totals.inflows - totals.outflows
                return <tr key={fund.id}><td>{fund.fundName}</td><td>{fund.sourceName}</td><td>{fund.restrictionType}</td><td>{fund.openingBalance.toFixed(2)}</td><td>{totals.inflows.toFixed(2)}</td><td>{totals.outflows.toFixed(2)}</td><td>{remaining.toFixed(2)}</td><td>{fund.endDate || '-'}</td><td>{fund.reportDueDate || '-'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
