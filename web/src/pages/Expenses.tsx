// web/src/pages/Expenses.tsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  getDocs,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'

type Expense = {
  id: string
  storeId: string
  amount: number
  type: 'expense' | 'donation'
  category: string
  description: string
  name: string
  date: string // yyyy-mm-dd
  createdAt?: unknown
}
type CustomerOption = { id: string; name: string }

const ENTRY_TYPES = ['expense', 'donation'] as const
type EntryType = (typeof ENTRY_TYPES)[number]

const CATEGORY_OPTIONS: Record<EntryType, readonly string[]> = {
  expense: [
    'Rent',
    'Salaries & wages',
    'Utilities',
    'Supplies',
    'Transport',
    'Marketing',
    'Loan repayment',
    'Miscellaneous',
  ],
  donation: ['Cash donation', 'Food support', 'Goods support', 'Event support', 'Other'],
}

type ExpensesProps = {
  embedded?: boolean
}

export default function Expenses({ embedded = false }: ExpensesProps) {
  const { storeId } = useActiveStore()
  const user = useAuthUser()

  const [amount, setAmount] = useState('')
  const [type, setType] = useState<EntryType>('expense')
  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS.expense[0])
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const activityActor = user?.displayName || user?.email || 'Team member'

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [recordFilter, setRecordFilter] = useState<'all' | EntryType | 'data'>('all')
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  function currentMonthKey(dateValue: Date) {
    const year = dateValue.getFullYear()
    const month = String(dateValue.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  // Load expenses for this store
  useEffect(() => {
    if (!storeId) {
      setExpenses([])
      return
    }

    const q = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(q, snap => {
      const rows: Expense[] = snap.docs.map(docSnap => {
        const data = docSnap.data() as any
        return {
          id: docSnap.id,
          storeId: data.storeId,
          amount: Number(data.amount) || 0,
          type: data.type === 'donation' ? 'donation' : 'expense',
          category: data.category || 'Uncategorized',
          description: data.description || '',
          name: data.name || '',
          date: data.date || '',
          createdAt: data.createdAt,
        }
      })
      setExpenses(rows)
    })

    return unsubscribe
  }, [storeId])

  useEffect(() => {
    async function loadCustomers() {
      if (!storeId) {
        setCustomers([])
        return
      }
      const snap = await getDocs(query(collection(db, 'customers'), where('storeId', '==', storeId)))
      const rows = snap.docs
        .map(docSnap => {
          const data = docSnap.data() as any
          const customerName = String(data.displayName || data.name || '').trim()
          return customerName ? { id: docSnap.id, name: customerName } : null
        })
        .filter((row): row is CustomerOption => !!row)
      setCustomers(rows)
    }
    loadCustomers().catch(err => {
      console.warn('[expenses] Failed to load customers', err)
      setCustomers([])
    })
  }, [storeId])

  const totalMonthly = useMemo(() => {
    if (!expenses.length) return 0
    const currentMonth = currentMonthKey(new Date())
    return expenses
      .filter(exp => exp.date?.startsWith(currentMonth))
      .reduce((sum, exp) => sum + exp.amount, 0)
  }, [expenses])

  const totalAllTime = useMemo(
    () => expenses.reduce((sum, exp) => sum + exp.amount, 0),
    [expenses],
  )

  const totalDonations = useMemo(
    () =>
      expenses
        .filter(exp => exp.type === 'donation')
        .reduce((sum, exp) => sum + exp.amount, 0),
    [expenses],
  )

  const totalExpenses = useMemo(
    () =>
      expenses.filter(exp => exp.type === 'expense').reduce((sum, exp) => sum + exp.amount, 0),
    [expenses],
  )

  const visibleRecords = useMemo(() => {
    if (recordFilter === 'all') return expenses
    return expenses.filter(exp => exp.type === recordFilter)
  }, [expenses, recordFilter])

  const isFormValid =
    !!storeId &&
    !!user &&
    amount.trim() !== '' &&
    Number(amount) > 0 &&
    date.trim() !== '' &&
    category.trim() !== ''
    && name.trim() !== ''

  async function logExpenseActivity(amountValue: number) {
    if (!storeId) return

    try {
      await addDoc(collection(db, 'activity'), {
        storeId,
        type: 'expense',
        summary: `Recorded expense of GHS ${amountValue.toFixed(2)}`,
        detail: `${category} · ${description.trim() || 'No notes added'}`,
        actor: activityActor,
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('[activity] Failed to log expense', err)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId) {
      setError('You need an active workspace to record expenses.')
      setSuccess(null)
      return
    }
    if (!user) {
      setError('You must be signed in to record expenses.')
      setSuccess(null)
      return
    }
    if (!isFormValid) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await addDoc(collection(db, 'expenses'), {
        storeId,
        type,
        amount: Number(amount),
        category,
        description: description.trim(),
        name: name.trim(),
        date,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })

      await logExpenseActivity(Number(amount))

      // clear form (keep date & category to make multiple entries easier)
      setAmount('')
      setDescription('')
      setName('')
      const nextDefaultCategory = CATEGORY_OPTIONS[type][0]
      setCategory(nextDefaultCategory)

      // show success message
      setSuccess(
        `${type === 'donation' ? 'Donation' : 'Expense'} saved. You can see it in the history below.`,
      )
    } catch (err) {
      console.error('[expenses] Failed to save expense', err)
      setError('We could not save this expense. Please try again.')
      setSuccess(null)
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
    <>
      {/* Entry form */}
      <section className="card" aria-label="Add record">
        <h3 className="card__title">Add record</h3>
        <p className="card__subtitle">
          Capture expenses and donations for this Sedifex workspace. Amounts are stored in your
          POS currency.
        </p>

        {!storeId && (
          <p className="status status--error" role="alert">
            Switch to a workspace before adding expenses.
          </p>
        )}

        {error && (
          <p className="status status--error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="status status--success" role="status">
            {success}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="form"
          style={{ display: 'grid', gap: 12, maxWidth: 480 }}
        >
          <div className="form__field">
            <label htmlFor="expense-type">Type</label>
            <select
              id="expense-type"
              value={type}
              onChange={e => {
                const nextType = e.target.value as EntryType
                setType(nextType)
                setCategory(CATEGORY_OPTIONS[nextType][0])
              }}
            >
              <option value="expense">Expense</option>
              <option value="donation">Donation</option>
            </select>
            <p className="form__hint">Choose whether this is a business cost or a donation.</p>
          </div>

          <div className="form__field">
            <label htmlFor="expense-amount">Amount</label>
            <input
              id="expense-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
            <p className="form__hint">Enter the total value for this record.</p>
          </div>

          <div className="form__field">
            <label htmlFor="expense-name">Name</label>
            <input
              id="expense-name"
              type="text"
              list="expense-customer-names"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Select customer or type a name"
              required
            />
            <datalist id="expense-customer-names">
              {customers.map(customer => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
            <p className="form__hint">Use an existing customer name or type a new name manually.</p>
          </div>

          <div className="form__field">
            <label htmlFor="expense-category">Category</label>
            <select
              id="expense-category"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS[type].map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <p className="form__hint">Use categories to understand where money is going.</p>
          </div>

          <div className="form__field">
            <label htmlFor="expense-date">Date</label>
            <input
              id="expense-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form__field">
            <label htmlFor="expense-description">Notes (optional)</label>
            <textarea
              id="expense-description"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Eg. March rent for East Legon store"
            />
          </div>

          <button
            type="submit"
            className="button button--primary"
            disabled={!isFormValid || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save record'}
          </button>
        </form>
      </section>

      {/* Summary + list */}
      <section className="card" style={{ marginTop: 24 }}>
        <div className="page__header" style={{ padding: 0, marginBottom: 12 }}>
          <div>
            <h3 className="card__title">Record history</h3>
            <p className="card__subtitle">
              This list updates in real time for your current workspace.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="card__subtitle">
              This month: <strong>GHS {totalMonthly.toFixed(2)}</strong>
            </p>
            <p className="card__subtitle">
              Expenses: <strong>GHS {totalExpenses.toFixed(2)}</strong>
            </p>
            <p className="card__subtitle">
              Donations: <strong>GHS {totalDonations.toFixed(2)}</strong>
            </p>
            <p className="card__subtitle">
              All time: <strong>GHS {totalAllTime.toFixed(2)}</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`button ${recordFilter === 'all' ? 'button--primary' : ''}`}
            onClick={() => setRecordFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`button ${recordFilter === 'expense' ? 'button--primary' : ''}`}
            onClick={() => setRecordFilter('expense')}
          >
            Expenses
          </button>
          <button
            type="button"
            className={`button ${recordFilter === 'donation' ? 'button--primary' : ''}`}
            onClick={() => setRecordFilter('donation')}
          >
            Donations
          </button>
          <button
            type="button"
            className={`button ${recordFilter === 'data' ? 'button--primary' : ''}`}
            onClick={() => setRecordFilter('data')}
          >
            Data
          </button>
        </div>

        {recordFilter === 'data' ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              onClick={() => {
                const header = ['date', 'type', 'name', 'category', 'description', 'amount']
                const rows = expenses.map(exp => [
                  exp.date,
                  exp.type,
                  exp.name || '',
                  exp.category,
                  (exp.description || '').replaceAll('"', '""'),
                  exp.amount.toFixed(2),
                ])
                const csv = [header, ...rows]
                  .map(cols => cols.map(col => `"${String(col)}"`).join(','))
                  .join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = 'expenses.csv'
                link.click()
                URL.revokeObjectURL(url)
              }}
            >
              Download CSV
            </button>
            <label className="button" style={{ cursor: 'pointer' }}>
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file || !storeId || !user) return
                  const text = await file.text()
                  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean)
                  const headers = headerLine.split(',').map(v => v.replace(/^"|"$/g, '').trim())
                  const idx = {
                    date: headers.indexOf('date'),
                    type: headers.indexOf('type'),
                    name: headers.indexOf('name'),
                    category: headers.indexOf('category'),
                    description: headers.indexOf('description'),
                    amount: headers.indexOf('amount'),
                  }
                  for (const line of lines) {
                    const cols = line.split(',').map(v => v.replace(/^"|"$/g, '').replaceAll('""', '"'))
                    const importedType = cols[idx.type] === 'donation' ? 'donation' : 'expense'
                    await addDoc(collection(db, 'expenses'), {
                      storeId,
                      type: importedType,
                      amount: Number(cols[idx.amount]) || 0,
                      category: cols[idx.category] || 'Uncategorized',
                      description: cols[idx.description] || '',
                      name: cols[idx.name] || '',
                      date: cols[idx.date] || new Date().toISOString().slice(0, 10),
                      createdAt: serverTimestamp(),
                      createdBy: user.uid,
                    })
                  }
                }}
              />
            </label>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="empty-state">
            <h4 className="empty-state__title">No records yet</h4>
            <p>Add your first expense or donation above to start tracking cash flow.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th className="sell-page__numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map(exp => (
                  <tr key={exp.id}>
                    <td>{exp.date}</td>
                    <td>{exp.type === 'donation' ? 'Donation' : 'Expense'}</td>
                    <td>{exp.category}</td>
                    <td>{exp.name || '—'}</td>
                    <td>{exp.description || '—'}</td>
                    <td className="sell-page__numeric">
                      GHS {exp.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )

  if (embedded) {
    return (
      <section className="card expenses-page" style={{ marginTop: 24 }} aria-label="Business records">
        <div className="page__header" style={{ padding: 0, marginBottom: 12 }}>
          <div>
            <h3 className="card__title">Business records</h3>
            <p className="card__subtitle">
              Add and review expenses here without leaving Finance.
            </p>
          </div>
        </div>
        {content}
      </section>
    )
  }

  return (
    <div className="page expenses-page">
      <header className="page__header">
        <div>
          <h2 className="page__title">Business records</h2>
          <p className="page__subtitle">
            Record rent, salaries, utilities, donations, and other entries to keep your store
            audit-ready.
          </p>
        </div>
      </header>
      {content}
    </div>
  )
}
