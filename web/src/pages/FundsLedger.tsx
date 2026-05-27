import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
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

  const [editingFundId, setEditingFundId] = useState('')
  const [fundName, setFundName] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [restrictionType, setRestrictionType] = useState<'restricted' | 'unrestricted'>('restricted')
  const [openingBalance, setOpeningBalance] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reportDueDate, setReportDueDate] = useState('')

  const [editingTransactionId, setEditingTransactionId] = useState('')
  const [fundId, setFundId] = useState('')
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
    }, err => {
      console.error('[funds-ledger] funds snapshot failed', err)
      setError('Unable to load fund buckets. Please check your connection and permissions.')
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
    }, err => {
      console.error('[funds-ledger] transactions snapshot failed', err)
      setError('Unable to load fund transactions. Please check your connection and permissions.')
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

  const fundNameById = useMemo(() => new Map(funds.map(fund => [fund.id, fund.fundName])), [funds])
  const totals = useMemo(() => {
    const opening = funds.reduce((sum, fund) => sum + fund.openingBalance, 0)
    const inflows = transactions.filter(tx => tx.direction === 'inflow').reduce((sum, tx) => sum + tx.amount, 0)
    const outflows = transactions.filter(tx => tx.direction === 'outflow').reduce((sum, tx) => sum + tx.amount, 0)
    return { opening, inflows, outflows, remaining: opening + inflows - outflows }
  }, [funds, transactions])

  function resetFundForm() {
    setEditingFundId('')
    setFundName('')
    setSourceName('')
    setRestrictionType('restricted')
    setOpeningBalance('')
    setEndDate('')
    setReportDueDate('')
  }

  function resetTransactionForm() {
    setEditingTransactionId('')
    setFundId('')
    setDirection('inflow')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setProject('')
    setCategory('')
    setDescription('')
  }

  async function createFund(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!storeId) {
      setError('Select a workspace before saving a fund bucket.')
      return
    }
    if (!user) {
      setError('Your account is still loading. Please wait a moment and try again.')
      return
    }
    if (!fundName.trim() || !sourceName.trim()) {
      setError('Enter the fund name and donor/source before saving.')
      return
    }

    const parsedOpeningBalance = Number(openingBalance)
    if (openingBalance.trim() && (!Number.isFinite(parsedOpeningBalance) || parsedOpeningBalance < 0)) {
      setError('Opening balance must be zero or a positive amount.')
      return
    }

    const payload = {
      storeId,
      fundName: fundName.trim(),
      sourceName: sourceName.trim(),
      restrictionType,
      openingBalance: Number(openingBalance) || 0,
      openingBalanceMeaning: 'balance_already_available_before_tracking',
      endDate: endDate || null,
      reportDueDate: reportDueDate || null,
      status: 'active',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }

    try {
      if (editingFundId) {
        await updateDoc(doc(db, 'funds', editingFundId), payload)
        setMessage('Fund bucket updated. It will show in Fund Ledger and Reports > Funds.')
      } else {
        await addDoc(collection(db, 'funds'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
        setMessage('Fund bucket saved. Add donor money as an inflow transaction if this is a new donation received today.')
      }
      resetFundForm()
    } catch (saveError) {
      console.error('[funds-ledger] save fund failed', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Unable to save fund bucket.')
    }
  }

  function startEditFund(fund: Fund) {
    setEditingFundId(fund.id)
    setFundName(fund.fundName)
    setSourceName(fund.sourceName)
    setRestrictionType(fund.restrictionType)
    setOpeningBalance(String(fund.openingBalance || ''))
    setEndDate(fund.endDate || '')
    setReportDueDate(fund.reportDueDate || '')
    setMessage('Editing fund bucket. Opening balance is the old balance before tracking, not a new donation.')
  }

  async function deleteFund(fund: Fund) {
    if (!storeId) return
    const relatedTransactions = transactions.filter(tx => tx.fundId === fund.id)
    const confirmed = window.confirm(
      relatedTransactions.length > 0
        ? `Delete ${fund.fundName} and ${relatedTransactions.length} related transaction(s)? This cannot be undone.`
        : `Delete ${fund.fundName}? This cannot be undone.`,
    )
    if (!confirmed) return

    await Promise.all([
      ...relatedTransactions.map(tx => deleteDoc(doc(db, 'fund_transactions', tx.id))),
      deleteDoc(doc(db, 'funds', fund.id)),
    ])

    if (editingFundId === fund.id) resetFundForm()
    if (fundId === fund.id) resetTransactionForm()
    setMessage('Fund bucket deleted.')
  }

  function remainingBeforeTransaction(targetFund: Fund, transactionIdToIgnore = '') {
    const fundTransactions = transactions.filter(tx => tx.fundId === targetFund.id && tx.id !== transactionIdToIgnore)
    const totals = fundTransactions.reduce(
      (current, tx) => {
        if (tx.direction === 'inflow') current.inflows += tx.amount
        else current.outflows += tx.amount
        return current
      },
      { inflows: 0, outflows: 0 },
    )
    return targetFund.openingBalance + totals.inflows - totals.outflows
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!storeId) {
      setError('Select a workspace before saving a transaction.')
      return
    }
    if (!user) {
      setError('Your account is still loading. Please wait a moment and try again.')
      return
    }
    if (!fundId || Number(amount) <= 0) {
      setError('Select a fund and enter a valid amount.')
      return
    }

    const targetFund = funds.find(item => item.id === fundId)
    if (!targetFund) {
      setError('Selected fund could not be found. Refresh and try again.')
      return
    }

    const remainingBefore = remainingBeforeTransaction(targetFund, editingTransactionId)
    if (direction === 'outflow' && Number(amount) > remainingBefore) {
      setError('Outflow exceeds remaining fund balance.')
      return
    }

    const payload = {
      storeId,
      fundId,
      fundName: targetFund.fundName,
      direction,
      amount: Number(amount),
      date,
      project: project.trim(),
      category: category.trim(),
      description: description.trim(),
      source: 'manual_fund_ledger',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }

    try {
      if (editingTransactionId) {
        await updateDoc(doc(db, 'fund_transactions', editingTransactionId), payload)
        setMessage('Fund transaction updated.')
      } else {
        await addDoc(collection(db, 'fund_transactions'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
        setMessage(direction === 'inflow' ? 'Inflow saved. This is where donor money received should be recorded.' : 'Outflow saved.')
      }
      resetTransactionForm()
    } catch (saveError) {
      console.error('[funds-ledger] save transaction failed', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Unable to save fund transaction.')
    }
  }

  function startEditTransaction(tx: FundTransaction) {
    setEditingTransactionId(tx.id)
    setFundId(tx.fundId)
    setDirection(tx.direction)
    setAmount(String(tx.amount || ''))
    setDate(tx.date || new Date().toISOString().slice(0, 10))
    setProject(tx.project || '')
    setCategory(tx.category || '')
    setDescription(tx.description || '')
  }

  async function deleteTransaction(tx: FundTransaction) {
    const confirmed = window.confirm('Delete this fund transaction? This cannot be undone.')
    if (!confirmed) return
    await deleteDoc(doc(db, 'fund_transactions', tx.id))
    if (editingTransactionId === tx.id) resetTransactionForm()
    setMessage('Fund transaction deleted.')
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>Funds & Grants Ledger</h1>
        <p className="form__hint">Track fund buckets, donor/source inflows, expenses, and remaining balances.</p>
      </header>

      <section className="workspace-grid workspace-grid--four" style={{ marginBottom: 16 }}>
        <article className="card" style={{ padding: 14 }}><strong>GHS {totals.opening.toFixed(2)}</strong><span>Opening balance total</span></article>
        <article className="card" style={{ padding: 14 }}><strong>GHS {totals.inflows.toFixed(2)}</strong><span>Donor/source inflows</span></article>
        <article className="card" style={{ padding: 14 }}><strong>GHS {totals.outflows.toFixed(2)}</strong><span>Outflows / expenses</span></article>
        <article className="card" style={{ padding: 14 }}><strong>GHS {totals.remaining.toFixed(2)}</strong><span>Remaining balance</span></article>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '5px solid #4f46e5' }}>
        <strong>Opening balance means money already in this fund before you started tracking it here.</strong>
        <p className="form__hint" style={{ marginTop: 6 }}>If a donor gives money today, create the fund bucket first, then record the money under Add transaction as <strong>Inflow / donation received</strong>.</p>
      </section>

      {message ? <p className="form__hint" style={{ color: '#047857', fontWeight: 800 }}>{message}</p> : null}
      {error ? <p style={{ color: 'crimson', fontWeight: 800 }}>{error}</p> : null}

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2>{editingFundId ? 'Edit fund bucket' : 'Create fund bucket'}</h2>
        <form onSubmit={createFund} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <input value={fundName} onChange={e => setFundName(e.target.value)} placeholder="Fund bucket name e.g. Scholarship Fund" required />
          <input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="Donor / source name" required />
          <select value={restrictionType} onChange={e => setRestrictionType(e.target.value as 'restricted' | 'unrestricted')}>
            <option value="restricted">Restricted to specific purpose</option>
            <option value="unrestricted">Unrestricted / general use</option>
          </select>
          <input value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="Opening balance already available" type="number" min="0" step="0.01" />
          <input value={endDate} onChange={e => setEndDate(e.target.value)} type="date" title="Fund end date" />
          <input value={reportDueDate} onChange={e => setReportDueDate(e.target.value)} type="date" title="Report due date" />
          <button className="button button--primary" type="submit">{editingFundId ? 'Update fund' : 'Save fund bucket'}</button>
          {editingFundId ? <button className="button button--secondary" type="button" onClick={resetFundForm}>Cancel edit</button> : null}
        </form>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2>{editingTransactionId ? 'Edit transaction' : 'Add transaction'}</h2>
        <p className="form__hint">Use inflow for donor money received. Use outflow for money spent from the selected fund.</p>
        <form onSubmit={addTransaction} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <select value={fundId} onChange={e => setFundId(e.target.value)} required>
            <option value="">Select fund bucket</option>
            {funds.map(fund => <option key={fund.id} value={fund.id}>{fund.fundName}</option>)}
          </select>
          <select value={direction} onChange={e => setDirection(e.target.value as 'inflow' | 'outflow')}>
            <option value="inflow">Inflow / donation received</option>
            <option value="outflow">Outflow / expense</option>
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount" required />
          <input value={date} onChange={e => setDate(e.target.value)} type="date" required />
          <input value={project} onChange={e => setProject(e.target.value)} placeholder="Project / campaign" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category e.g. Donation, Food, School fees" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
          <button className="button button--primary" type="submit">{editingTransactionId ? 'Update transaction' : 'Save transaction'}</button>
          {editingTransactionId ? <button className="button button--secondary" type="button" onClick={resetTransactionForm}>Cancel edit</button> : null}
        </form>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2>Fund buckets</h2>
        <p className="form__hint">Saved fund buckets show here immediately. Opening is starting balance; inflows are donor/source money added after tracking starts.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fund</th><th>Source</th><th>Type</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Remaining</th><th>End</th><th>Report due</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {funds.length === 0 ? <tr><td colSpan={10}>No fund buckets saved yet.</td></tr> : null}
              {funds.map(fund => {
                const totals = stats.get(fund.id) || { inflows: 0, outflows: 0 }
                const remaining = fund.openingBalance + totals.inflows - totals.outflows
                return (
                  <tr key={fund.id}>
                    <td>{fund.fundName}</td>
                    <td>{fund.sourceName}</td>
                    <td>{fund.restrictionType}</td>
                    <td>{fund.openingBalance.toFixed(2)}</td>
                    <td>{totals.inflows.toFixed(2)}</td>
                    <td>{totals.outflows.toFixed(2)}</td>
                    <td>{remaining.toFixed(2)}</td>
                    <td>{fund.endDate || '-'}</td>
                    <td>{fund.reportDueDate || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="button button--secondary" onClick={() => startEditFund(fund)}>Edit</button>
                        <button type="button" className="button button--secondary" onClick={() => void deleteFund(fund)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Transaction history</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Fund</th><th>Type</th><th>Amount</th><th>Project</th><th>Category</th><th>Description</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? <tr><td colSpan={8}>No fund transactions yet.</td></tr> : null}
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>{tx.date || '-'}</td>
                  <td>{fundNameById.get(tx.fundId) || '-'}</td>
                  <td>{tx.direction === 'inflow' ? 'Inflow / donation received' : 'Outflow / expense'}</td>
                  <td>{tx.amount.toFixed(2)}</td>
                  <td>{tx.project || '-'}</td>
                  <td>{tx.category || '-'}</td>
                  <td>{tx.description || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="button button--secondary" onClick={() => startEditTransaction(tx)}>Edit</button>
                      <button type="button" className="button button--secondary" onClick={() => void deleteTransaction(tx)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
