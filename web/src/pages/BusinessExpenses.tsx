import React, { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'

type PaymentSource = 'bank' | 'mobile_money' | 'store_cash' | 'petty_cash' | 'owner_staff_personal' | 'fund_ledger' | 'other'
type ReimbursementStatus = 'not_applicable' | 'not_reimbursed' | 'partly_reimbursed' | 'reimbursed'

type ExpenseRecord = {
  id: string
  storeId: string
  title: string
  category: string
  amount: number
  expenseDate: string
  paymentSource: PaymentSource
  payerName?: string
  reimbursementStatus: ReimbursementStatus
  reimbursedAmount: number
  notes?: string
  receiptUrl?: string
  createdAt?: Timestamp | string | null
  updatedAt?: Timestamp | string | null
}

type ExpenseForm = {
  title: string
  category: string
  amount: string
  expenseDate: string
  paymentSource: PaymentSource
  payerName: string
  reimbursementStatus: ReimbursementStatus
  reimbursedAmount: string
  notes: string
  receiptUrl: string
}

const initialForm: ExpenseForm = {
  title: '',
  category: '',
  amount: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  paymentSource: 'petty_cash',
  payerName: '',
  reimbursementStatus: 'not_applicable',
  reimbursedAmount: '',
  notes: '',
  receiptUrl: '',
}

const paymentSourceLabels: Record<PaymentSource, string> = {
  bank: 'Bank account',
  mobile_money: 'Mobile Money',
  store_cash: 'Store cash',
  petty_cash: 'Petty cash',
  owner_staff_personal: 'Owner/staff paid personally',
  fund_ledger: 'Donor/Fund Ledger',
  other: 'Other source',
}

const reimbursementLabels: Record<ReimbursementStatus, string> = {
  not_applicable: 'Not applicable',
  not_reimbursed: 'Not reimbursed',
  partly_reimbursed: 'Partly reimbursed',
  reimbursed: 'Reimbursed',
}

function money(value: number, currency = 'GHS') {
  return `${currency} ${Number(value || 0).toFixed(2)}`
}

function parseAmount(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function sourceTone(source: PaymentSource) {
  if (source === 'bank' || source === 'mobile_money') return { background: '#DBEAFE', color: '#1D4ED8' }
  if (source === 'petty_cash' || source === 'store_cash') return { background: '#FEF3C7', color: '#92400E' }
  if (source === 'owner_staff_personal') return { background: '#FCE7F3', color: '#BE185D' }
  if (source === 'fund_ledger') return { background: '#DCFCE7', color: '#166534' }
  return { background: '#E2E8F0', color: '#334155' }
}

function statusTone(status: ReimbursementStatus) {
  if (status === 'reimbursed') return { background: '#DCFCE7', color: '#166534' }
  if (status === 'partly_reimbursed') return { background: '#FEF3C7', color: '#92400E' }
  if (status === 'not_reimbursed') return { background: '#FEE2E2', color: '#991B1B' }
  return { background: '#E2E8F0', color: '#334155' }
}

export default function BusinessExpenses() {
  const { storeId } = useActiveStore()
  const user = useAuthUser()
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [form, setForm] = useState<ExpenseForm>(initialForm)
  const [editingId, setEditingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | PaymentSource>('all')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) {
      setExpenses([])
      return undefined
    }
    const expensesQuery = query(collection(db, 'expenses'), where('storeId', '==', storeId), orderBy('expenseDate', 'desc'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(expensesQuery, snapshot => {
      setExpenses(snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Record<string, unknown>
        const source = typeof data.paymentSource === 'string' && data.paymentSource in paymentSourceLabels ? data.paymentSource as PaymentSource : 'other'
        const reimbursementStatus = typeof data.reimbursementStatus === 'string' && data.reimbursementStatus in reimbursementLabels ? data.reimbursementStatus as ReimbursementStatus : 'not_applicable'
        return {
          id: docSnap.id,
          storeId: typeof data.storeId === 'string' ? data.storeId : '',
          title: typeof data.title === 'string' ? data.title : '',
          category: typeof data.category === 'string' ? data.category : '',
          amount: Number(data.amount) || 0,
          expenseDate: typeof data.expenseDate === 'string' ? data.expenseDate : '',
          paymentSource: source,
          payerName: typeof data.payerName === 'string' ? data.payerName : '',
          reimbursementStatus,
          reimbursedAmount: Number(data.reimbursedAmount) || 0,
          notes: typeof data.notes === 'string' ? data.notes : '',
          receiptUrl: typeof data.receiptUrl === 'string' ? data.receiptUrl : '',
          createdAt: data.createdAt as Timestamp | string | null,
          updatedAt: data.updatedAt as Timestamp | string | null,
        }
      }))
    }, err => {
      console.error('[expenses] snapshot failed', err)
      setError('Unable to load expenses. If this is the first time, deploy Firestore indexes/rules and try again.')
    })
    return () => unsubscribe()
  }, [storeId])

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    return expenses
      .filter(expense => sourceFilter === 'all' || expense.paymentSource === sourceFilter)
      .filter(expense => {
        if (!term) return true
        return [expense.title, expense.category, expense.payerName, expense.notes, paymentSourceLabels[expense.paymentSource], reimbursementLabels[expense.reimbursementStatus]].join(' ').toLowerCase().includes(term)
      })
  }, [expenses, search, sourceFilter])

  const totals = useMemo(() => {
    const total = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    const pettyCash = filteredExpenses.filter(expense => expense.paymentSource === 'petty_cash').reduce((sum, expense) => sum + expense.amount, 0)
    const storeCash = filteredExpenses.filter(expense => expense.paymentSource === 'store_cash').reduce((sum, expense) => sum + expense.amount, 0)
    const personallyPaid = filteredExpenses.filter(expense => expense.paymentSource === 'owner_staff_personal').reduce((sum, expense) => sum + expense.amount, 0)
    const reimbursementDue = filteredExpenses
      .filter(expense => expense.paymentSource === 'owner_staff_personal')
      .reduce((sum, expense) => sum + Math.max(expense.amount - expense.reimbursedAmount, 0), 0)
    return { total, pettyCash, storeCash, personallyPaid, reimbursementDue }
  }, [filteredExpenses])

  function resetForm() {
    setEditingId('')
    setForm({ ...initialForm, expenseDate: new Date().toISOString().slice(0, 10) })
  }

  function startEdit(expense: ExpenseRecord) {
    setEditingId(expense.id)
    setForm({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount || ''),
      expenseDate: expense.expenseDate || new Date().toISOString().slice(0, 10),
      paymentSource: expense.paymentSource,
      payerName: expense.payerName || '',
      reimbursementStatus: expense.reimbursementStatus,
      reimbursedAmount: String(expense.reimbursedAmount || ''),
      notes: expense.notes || '',
      receiptUrl: expense.receiptUrl || '',
    })
    setMessage('Editing expense. Save changes when done.')
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!storeId) return setError('Select a workspace before saving expenses.')
    if (!user) return setError('Your account is still loading. Please wait a moment and try again.')
    if (!form.title.trim() || !form.category.trim()) return setError('Enter expense title and category.')
    const amount = parseAmount(form.amount)
    if (!amount || amount <= 0) return setError('Enter a valid expense amount.')

    const reimbursedAmount = parseAmount(form.reimbursedAmount) ?? 0
    if (reimbursedAmount > amount) return setError('Reimbursed amount cannot be more than the expense amount.')

    const reimbursementStatus: ReimbursementStatus = form.paymentSource === 'owner_staff_personal'
      ? form.reimbursementStatus === 'not_applicable' ? 'not_reimbursed' : form.reimbursementStatus
      : 'not_applicable'

    const payload = {
      storeId,
      title: form.title.trim(),
      category: form.category.trim(),
      amount,
      expenseDate: form.expenseDate || new Date().toISOString().slice(0, 10),
      paymentSource: form.paymentSource,
      paymentSourceLabel: paymentSourceLabels[form.paymentSource],
      payerName: form.payerName.trim() || null,
      reimbursementStatus,
      reimbursedAmount: form.paymentSource === 'owner_staff_personal' ? reimbursedAmount : 0,
      reimbursementDue: form.paymentSource === 'owner_staff_personal' ? Math.max(amount - reimbursedAmount, 0) : 0,
      notes: form.notes.trim() || null,
      receiptUrl: form.receiptUrl.trim() || null,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), payload)
        setMessage('Expense updated.')
      } else {
        await addDoc(collection(db, 'expenses'), { ...payload, createdAt: serverTimestamp(), createdBy: user.uid })
        setMessage('Expense saved.')
      }
      resetForm()
    } catch (saveError) {
      console.error('[expenses] save failed', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Unable to save expense.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteExpense(expense: ExpenseRecord) {
    if (!window.confirm(`Delete expense “${expense.title}”?`)) return
    try {
      await deleteDoc(doc(db, 'expenses', expense.id))
      if (editingId === expense.id) resetForm()
      setMessage('Expense deleted.')
    } catch (deleteError) {
      console.error('[expenses] delete failed', deleteError)
      setError('Unable to delete expense.')
    }
  }

  return (
    <main className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Expenses</p>
        <h1>Business & Petty Expenses</h1>
        <p className="workspace-muted">Record daily expenses even when they do not come from the bank account. Choose Bank, MoMo, Store Cash, Petty Cash, Owner/Staff paid personally, or Fund Ledger.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{money(totals.total)}</strong><span>Total expenses</span></article>
        <article className="workspace-card"><strong>{money(totals.pettyCash)}</strong><span>Petty cash spent</span></article>
        <article className="workspace-card"><strong>{money(totals.storeCash)}</strong><span>Store cash spent</span></article>
        <article className="workspace-card"><strong>{money(totals.reimbursementDue)}</strong><span>Reimbursement due</span></article>
      </section>

      <section className="workspace-card" style={{ borderLeft: '5px solid #4f46e5' }}>
        <strong>Petty expense rule</strong>
        <p className="workspace-muted">If the business spent it, record it as an expense. If it did not come from the bank, select the correct payment source so bank, cash, and reimbursement reports stay clean.</p>
      </section>

      {message ? <p style={{ color: '#047857', fontWeight: 800 }}>{message}</p> : null}
      {error ? <p style={{ color: '#b91c1c', fontWeight: 800 }}>{error}</p> : null}

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>{editingId ? 'Edit expense' : 'Add expense'}</h2>
            <p className="workspace-muted">Use Owner/Staff paid personally when someone used their own money and needs reimbursement later.</p>
          </div>
        </div>
        <form onSubmit={saveExpense} className="workspace-grid workspace-grid--three">
          <label><span>Expense title</span><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="e.g. Fuel, soap, printing" required /></label>
          <label><span>Category</span><input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="e.g. Transport, Cleaning, Office" required /></label>
          <label><span>Amount</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} required /></label>
          <label><span>Date</span><input type="date" value={form.expenseDate} onChange={event => setForm({ ...form, expenseDate: event.target.value })} required /></label>
          <label><span>Payment source</span><select value={form.paymentSource} onChange={event => { const nextSource = event.target.value as PaymentSource; setForm({ ...form, paymentSource: nextSource, reimbursementStatus: nextSource === 'owner_staff_personal' ? 'not_reimbursed' : 'not_applicable', reimbursedAmount: nextSource === 'owner_staff_personal' ? form.reimbursedAmount : '' }) }}>{Object.entries(paymentSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Paid by / staff name</span><input value={form.payerName} onChange={event => setForm({ ...form, payerName: event.target.value })} placeholder="Optional" /></label>
          {form.paymentSource === 'owner_staff_personal' ? <><label><span>Reimbursement status</span><select value={form.reimbursementStatus} onChange={event => setForm({ ...form, reimbursementStatus: event.target.value as ReimbursementStatus })}><option value="not_reimbursed">Not reimbursed</option><option value="partly_reimbursed">Partly reimbursed</option><option value="reimbursed">Reimbursed</option></select></label><label><span>Reimbursed amount</span><input type="number" min="0" step="0.01" value={form.reimbursedAmount} onChange={event => setForm({ ...form, reimbursedAmount: event.target.value })} /></label></> : null}
          <label><span>Receipt URL</span><input value={form.receiptUrl} onChange={event => setForm({ ...form, receiptUrl: event.target.value })} placeholder="Optional image/file link" /></label>
          <label style={{ gridColumn: '1 / -1' }}><span>Notes</span><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Optional details" style={{ minHeight: 90 }} /></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update expense' : 'Save expense'}</button>{editingId ? <button type="button" className="button button--secondary" onClick={resetForm} disabled={saving}>Cancel edit</button> : null}</div>
        </form>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Expense history</h2><p className="workspace-muted">Filter and review all expenses by payment source.</p></div>
        </div>
        <div className="workspace-toolbar">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, category, staff, notes…" />
          <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value as 'all' | PaymentSource)}><option value="all">All payment sources</option>{Object.entries(paymentSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Amount</th><th>Payment source</th><th>Reimbursement</th><th>Paid by</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredExpenses.length === 0 ? <tr><td colSpan={8}>No expenses saved yet.</td></tr> : null}
              {filteredExpenses.map(expense => {
                const sourceColors = sourceTone(expense.paymentSource)
                const reimbursementColors = statusTone(expense.reimbursementStatus)
                return <tr key={expense.id}><td>{expense.expenseDate || '—'}</td><td><strong>{expense.title}</strong>{expense.notes ? <><br /><small>{expense.notes}</small></> : null}{expense.receiptUrl ? <><br /><a href={expense.receiptUrl} target="_blank" rel="noreferrer">Receipt</a></> : null}</td><td>{expense.category || '—'}</td><td>{money(expense.amount)}</td><td><span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900, ...sourceColors }}>{paymentSourceLabels[expense.paymentSource]}</span></td><td><span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900, ...reimbursementColors }}>{reimbursementLabels[expense.reimbursementStatus]}</span>{expense.reimbursementStatus !== 'not_applicable' ? <><br /><small>Due: {money(Math.max(expense.amount - expense.reimbursedAmount, 0))}</small></> : null}</td><td>{expense.payerName || '—'}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="button button--secondary" onClick={() => startEdit(expense)}>Edit</button><button type="button" className="button button--secondary" onClick={() => void deleteExpense(expense)}>Delete</button></div></td></tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
