import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import {
  buildDocumentPdf,
  buildStoreSnapshot,
  calculateDocumentItems,
  calculateDocumentTotals,
  formatDocumentCurrency,
  generateDocumentNumber,
  type BusinessStoreSnapshot,
  type DocumentCustomer,
  type DocumentItem,
} from '../utils/documents'
import './DocumentsGenerator.css'

type BuilderMode = 'invoice' | 'receipt'
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

type ItemRow = { id: string; description: string; quantity: string; unitPrice: string }
type SavedInvoice = {
  id: string
  invoiceNumber: string
  customer?: DocumentCustomer
  items?: DocumentItem[]
  total?: number
  invoiceDate?: string
  status?: InvoiceStatus
}

type GeneratedDocument = { url: string; fileName: string }

const EMPTY_STORE: BusinessStoreSnapshot = {
  storeId: '',
  businessName: '',
  logo: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  website: '',
  taxId: '',
}

function createItemRow(): ItemRow {
  return { id: Math.random().toString(36).slice(2), description: '', quantity: '1', unitPrice: '' }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function getDocumentIdFromRef(path: string) {
  const pieces = path.split('/').filter(Boolean)
  return pieces[pieces.length - 1] ?? ''
}

export default function DocumentsBuilder({ mode }: { mode: BuilderMode }) {
  const { storeId } = useActiveStore()
  const [storeSnapshot, setStoreSnapshot] = useState<BusinessStoreSnapshot>(EMPTY_STORE)
  const [customer, setCustomer] = useState<DocumentCustomer>({ name: '', phone: '', email: '', address: '' })
  const [items, setItems] = useState<ItemRow[]>([createItemRow()])
  const [discount, setDiscount] = useState('0')
  const [tax, setTax] = useState('0')
  const [invoiceNumber, setInvoiceNumber] = useState(() => generateDocumentNumber('INV'))
  const [receiptNumber, setReceiptNumber] = useState(() => generateDocumentNumber('RCP'))
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [receiptDate, setReceiptDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [notes, setNotes] = useState('')
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [paidInvoices, setPaidInvoices] = useState<SavedInvoice[]>([])
  const [sourceInvoiceId, setSourceInvoiceId] = useState('')
  const [savedInvoiceId, setSavedInvoiceId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedDocument | null>(null)
  const [saving, setSaving] = useState(false)

  const normalizedItems = useMemo(() => calculateDocumentItems(items), [items])
  const totals = useMemo(() => calculateDocumentTotals(normalizedItems, discount, tax), [discount, normalizedItems, tax])
  const activeNumber = mode === 'invoice' ? invoiceNumber : receiptNumber
  const documentDate = mode === 'invoice' ? invoiceDate : receiptDate

  useEffect(() => () => {
    if (generated?.url) URL.revokeObjectURL(generated.url)
  }, [generated])

  useEffect(() => {
    let cancelled = false
    async function loadStore() {
      if (!storeId) return
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (cancelled) return
        setStoreSnapshot(buildStoreSnapshot(storeId, snapshot.exists() ? snapshot.data() : {}))
      } catch (loadError) {
        console.warn('[documents] Unable to load store profile', loadError)
      }
    }
    void loadStore()
    return () => {
      cancelled = true
    }
  }, [storeId])

  useEffect(() => {
    let cancelled = false
    async function loadPaidInvoices() {
      if (!storeId || mode !== 'receipt') return
      try {
        const invoiceQuery = query(
          collection(db, 'stores', storeId, 'invoices'),
          where('status', '==', 'paid'),
          limit(25),
        )
        const snapshot = await getDocs(invoiceQuery)
        if (cancelled) return
        setPaidInvoices(snapshot.docs.map(invoiceDoc => {
          const data = invoiceDoc.data()
          return {
            id: invoiceDoc.id,
            invoiceNumber: typeof data.invoiceNumber === 'string' ? data.invoiceNumber : invoiceDoc.id,
            customer: data.customer as DocumentCustomer | undefined,
            items: Array.isArray(data.items) ? data.items as DocumentItem[] : [],
            total: typeof data.total === 'number' ? data.total : undefined,
            invoiceDate: typeof data.invoiceDate === 'string' ? data.invoiceDate : undefined,
            status: data.status as InvoiceStatus | undefined,
          }
        }))
      } catch (loadError) {
        console.warn('[documents] Unable to load paid invoices', loadError)
      }
    }
    void loadPaidInvoices()
    return () => {
      cancelled = true
    }
  }, [mode, storeId])

  function updateItem(id: string, patch: Partial<ItemRow>) {
    setItems(previous => previous.map(item => (item.id === id ? { ...item, ...patch } : item)))
  }

  function addItem() {
    setItems(previous => [...previous, createItemRow()])
  }

  function removeItem(id: string) {
    setItems(previous => previous.length > 1 ? previous.filter(item => item.id !== id) : previous)
  }

  function resetGenerated() {
    if (generated?.url) URL.revokeObjectURL(generated.url)
    setGenerated(null)
  }

  function validate() {
    if (!storeId) return 'Choose a workspace before saving documents.'
    if (!customer.name.trim()) return 'Enter a customer name.'
    if (!normalizedItems.length) return 'Add at least one item or service.'
    if (mode === 'receipt' && Number(amountPaid || totals.total) <= 0) return 'Enter the amount paid.'
    return null
  }

  function buildPayload() {
    const customerPayload = {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
      address: customer.address?.trim() ?? '',
    }
    const storePayload = { ...storeSnapshot, storeId: storeId ?? storeSnapshot.storeId }
    return { customerPayload, storePayload }
  }

  async function saveInvoice(nextStatus = status) {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return null
    }
    if (!storeId) return null

    setSaving(true)
    setError(null)
    try {
      const { customerPayload, storePayload } = buildPayload()
      const invoiceData = {
        storeId,
        storeSnapshot: storePayload,
        customer: customerPayload,
        items: normalizedItems,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        status: nextStatus,
        invoiceNumber: invoiceNumber.trim() || generateDocumentNumber('INV'),
        invoiceDate,
        dueDate,
        notes: notes.trim(),
        paymentInstructions: paymentInstructions.trim(),
        updatedAt: serverTimestamp(),
      }
      const ref = savedInvoiceId
        ? doc(db, 'stores', storeId, 'invoices', savedInvoiceId)
        : await addDoc(collection(db, 'stores', storeId, 'invoices'), {
            ...invoiceData,
            createdAt: serverTimestamp(),
          })

      if (savedInvoiceId) {
        await setDoc(ref, invoiceData, { merge: true })
      }

      const documentId = savedInvoiceId || getDocumentIdFromRef(ref.path)
      setSavedInvoiceId(documentId)
      setStatus(nextStatus)
      setMessage(nextStatus === 'paid' ? 'Invoice saved and marked as paid.' : 'Invoice saved.')
      return documentId
    } catch (saveError) {
      console.error('[documents] Unable to save invoice', saveError)
      setError('Unable to save invoice. Check your connection and try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function saveReceipt(invoiceId = sourceInvoiceId) {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return null
    }
    if (!storeId) return null

    setSaving(true)
    setError(null)
    try {
      const { customerPayload, storePayload } = buildPayload()
      const receiptPayload = {
        storeId,
        invoiceId: invoiceId || null,
        storeSnapshot: storePayload,
        customer: customerPayload,
        items: normalizedItems,
        amountPaid: Number(amountPaid || totals.total),
        paymentMethod: paymentMethod.trim(),
        paymentReference: paymentReference.trim(),
        receiptNumber: receiptNumber.trim() || generateDocumentNumber('RCP'),
        receiptDate,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'stores', storeId, 'receipts'), receiptPayload)
      setMessage(`Receipt saved (${receiptPayload.receiptNumber}).`)
      return ref.id
    } catch (saveError) {
      console.error('[documents] Unable to save receipt', saveError)
      setError('Unable to save receipt. Check your connection and try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function markPaid() {
    const invoiceId = await saveInvoice('paid')
    if (storeId && invoiceId) {
      await updateDoc(doc(db, 'stores', storeId, 'invoices', invoiceId), { status: 'paid', updatedAt: serverTimestamp() })
    }
  }

  function generateReceiptFromInvoice(invoice: SavedInvoice) {
    setSourceInvoiceId(invoice.id)
    setCustomer(invoice.customer ?? { name: '', phone: '', email: '', address: '' })
    setItems((invoice.items ?? []).map(item => ({
      id: Math.random().toString(36).slice(2),
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })).concat(invoice.items?.length ? [] : [createItemRow()]))
    setAmountPaid(String(invoice.total ?? 0))
    setNotes(`Generated from invoice ${invoice.invoiceNumber}.`)
    setMessage(`Loaded paid invoice ${invoice.invoiceNumber}. Review and save the receipt.`)
  }

  async function createReceiptFromPaidInvoice() {
    const invoiceId = await saveInvoice('paid')
    if (!invoiceId || !storeId) return

    try {
      const { customerPayload, storePayload } = buildPayload()
      const nextReceiptNumber = receiptNumber.trim() || generateDocumentNumber('RCP')
      await addDoc(collection(db, 'stores', storeId, 'receipts'), {
        storeId,
        invoiceId,
        storeSnapshot: storePayload,
        customer: customerPayload,
        items: normalizedItems,
        amountPaid: totals.total,
        paymentMethod: paymentMethod.trim() || 'Invoice payment',
        paymentReference: paymentReference.trim(),
        receiptNumber: nextReceiptNumber,
        receiptDate,
        notes: notes.trim() || `Generated from invoice ${invoiceNumber}.`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setReceiptNumber(nextReceiptNumber)
      setSourceInvoiceId(invoiceId)
      setMessage(`Invoice marked paid and receipt ${nextReceiptNumber} saved.`)
    } catch (receiptError) {
      console.error('[documents] Unable to create receipt from invoice', receiptError)
      setError('Invoice was marked paid, but the receipt could not be created.')
    }
  }

  function generatePdf() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    resetGenerated()
    const pdf = buildDocumentPdf({
      type: mode === 'invoice' ? 'Invoice' : 'Receipt',
      number: activeNumber,
      date: documentDate,
      dueDate: mode === 'invoice' ? dueDate : undefined,
      status: mode === 'invoice' ? status : undefined,
      storeSnapshot,
      customer,
      items: normalizedItems,
      totals: mode === 'invoice' ? totals : undefined,
      amountPaid: mode === 'receipt' ? Number(amountPaid || totals.total) : undefined,
      notes,
      paymentInstructions: mode === 'invoice' ? paymentInstructions : undefined,
      paymentMethod: mode === 'receipt' ? paymentMethod : undefined,
      paymentReference: mode === 'receipt' ? paymentReference : undefined,
    })
    setGenerated(pdf)
    setError(null)
  }

  function printPreview() {
    window.print()
  }

  const title = mode === 'invoice' ? 'Invoices' : 'Receipts'
  const subtitle = mode === 'invoice'
    ? 'Create, save, print, and track customer invoices with your store details already filled in.'
    : 'Create receipts from scratch or generate one from an existing paid invoice.'

  return (
    <div className="page documents-builder">
      <header className="page__header">
        <div>
          <h2 className="page__title">{title}</h2>
          <p className="page__subtitle">{subtitle}</p>
        </div>
      </header>

      <section className="card documents-builder__layout">
        <div className="documents-builder__form form">
          <h3 className="card__title">Business details</h3>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Business name</span><input className="input" value={storeSnapshot.businessName} onChange={event => setStoreSnapshot({ ...storeSnapshot, businessName: event.target.value })} /></label>
            <label className="form__field"><span className="form__hint">Store ID</span><input className="input" value={storeSnapshot.storeId || storeId || ''} readOnly /></label>
          </div>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Phone</span><input className="input" value={storeSnapshot.phone} onChange={event => setStoreSnapshot({ ...storeSnapshot, phone: event.target.value })} /></label>
            <label className="form__field"><span className="form__hint">Email</span><input className="input" value={storeSnapshot.email} onChange={event => setStoreSnapshot({ ...storeSnapshot, email: event.target.value })} /></label>
          </div>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Address line 1</span><input className="input" value={storeSnapshot.addressLine1} onChange={event => setStoreSnapshot({ ...storeSnapshot, addressLine1: event.target.value })} /></label>
            <label className="form__field"><span className="form__hint">Address line 2</span><input className="input" value={storeSnapshot.addressLine2} onChange={event => setStoreSnapshot({ ...storeSnapshot, addressLine2: event.target.value })} /></label>
          </div>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Website</span><input className="input" value={storeSnapshot.website} onChange={event => setStoreSnapshot({ ...storeSnapshot, website: event.target.value })} /></label>
            <label className="form__field"><span className="form__hint">Tax / registration ID</span><input className="input" value={storeSnapshot.taxId} onChange={event => setStoreSnapshot({ ...storeSnapshot, taxId: event.target.value })} /></label>
          </div>
          <label className="form__field"><span className="form__hint">Logo URL</span><input className="input" value={storeSnapshot.logo} onChange={event => setStoreSnapshot({ ...storeSnapshot, logo: event.target.value })} /></label>

          <h3 className="card__title">Customer</h3>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Customer name</span><input className="input" value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></label>
            <label className="form__field"><span className="form__hint">Customer phone</span><input className="input" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} /></label>
          </div>
          <div className="documents-generator__row">
            <label className="form__field"><span className="form__hint">Customer email</span><input className="input" value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} /></label>
            {mode === 'invoice' ? <label className="form__field"><span className="form__hint">Customer address</span><input className="input" value={customer.address ?? ''} onChange={event => setCustomer({ ...customer, address: event.target.value })} /></label> : null}
          </div>

          <h3 className="card__title">{mode === 'invoice' ? 'Invoice details' : 'Receipt details'}</h3>
          <div className="documents-generator__row">
            {mode === 'invoice' ? <label className="form__field"><span className="form__hint">Invoice number</span><input className="input" value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} /></label> : <label className="form__field"><span className="form__hint">Receipt number</span><input className="input" value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} /></label>}
            {mode === 'invoice' ? <label className="form__field"><span className="form__hint">Invoice date</span><input className="input" type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /></label> : <label className="form__field"><span className="form__hint">Receipt date</span><input className="input" type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} /></label>}
          </div>
          {mode === 'invoice' ? (
            <div className="documents-generator__row">
              <label className="form__field"><span className="form__hint">Due date</span><input className="input" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
              <label className="form__field"><span className="form__hint">Status</span><select className="input" value={status} onChange={event => setStatus(event.target.value as InvoiceStatus)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></label>
            </div>
          ) : (
            <>
              <div className="documents-generator__row">
                <label className="form__field"><span className="form__hint">Payment method</span><input className="input" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} /></label>
                <label className="form__field"><span className="form__hint">Payment reference</span><input className="input" value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label>
              </div>
              <label className="form__field"><span className="form__hint">Generate from paid invoice</span><select className="input" value={sourceInvoiceId} onChange={event => { const selected = paidInvoices.find(invoice => invoice.id === event.target.value); if (selected) generateReceiptFromInvoice(selected); else setSourceInvoiceId('') }}><option value="">Select a paid invoice</option>{paidInvoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} — {invoice.customer?.name ?? 'Customer'} — {formatDocumentCurrency(invoice.total ?? 0)}</option>)}</select></label>
            </>
          )}

          <h3 className="card__title">Items / services</h3>
          {items.map((item, index) => <div className="documents-generator__item" key={item.id}>
            <div className="documents-generator__item-header"><span>Item {index + 1}</span>{items.length > 1 ? <button type="button" className="button button--ghost button--small" onClick={() => removeItem(item.id)}>Remove</button> : null}</div>
            <div className="documents-generator__row">
              <label className="form__field"><span className="form__hint">Description</span><input className="input" value={item.description} onChange={event => updateItem(item.id, { description: event.target.value })} /></label>
              <label className="form__field"><span className="form__hint">Quantity</span><input className="input" inputMode="decimal" value={item.quantity} onChange={event => updateItem(item.id, { quantity: event.target.value })} /></label>
              <label className="form__field"><span className="form__hint">Unit price</span><input className="input" inputMode="decimal" value={item.unitPrice} onChange={event => updateItem(item.id, { unitPrice: event.target.value })} /></label>
            </div>
          </div>)}
          <button type="button" className="button button--ghost button--small documents-generator__add" onClick={addItem}>Add item</button>

          {mode === 'invoice' ? <div className="documents-generator__row"><label className="form__field"><span className="form__hint">Discount (GHS)</span><input className="input" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label><label className="form__field"><span className="form__hint">Tax/VAT amount (GHS)</span><input className="input" inputMode="decimal" value={tax} onChange={event => setTax(event.target.value)} /></label></div> : <label className="form__field"><span className="form__hint">Amount paid</span><input className="input" inputMode="decimal" value={amountPaid} onChange={event => setAmountPaid(event.target.value)} placeholder={formatDocumentCurrency(totals.total)} /></label>}
          {mode === 'invoice' ? <label className="form__field"><span className="form__hint">Payment instructions</span><textarea className="input documents-generator__notes" value={paymentInstructions} onChange={event => setPaymentInstructions(event.target.value)} placeholder="Bank, mobile money, payment terms..." /></label> : null}
          <label className="form__field"><span className="form__hint">Notes</span><textarea className="input documents-generator__notes" value={notes} onChange={event => setNotes(event.target.value)} /></label>

          <div className="documents-generator__actions">
            {mode === 'invoice' ? <button type="button" className="button button--primary" disabled={saving} onClick={() => void saveInvoice()}>{saving ? 'Saving…' : 'Save invoice'}</button> : <button type="button" className="button button--primary" disabled={saving} onClick={() => void saveReceipt()}>{saving ? 'Saving…' : 'Save receipt'}</button>}
            <button type="button" className="button button--ghost" onClick={printPreview}>Print {mode}</button>
            <button type="button" className="button button--ghost" onClick={generatePdf}>Download as PDF</button>
            {mode === 'invoice' ? <button type="button" className="button button--ghost" disabled={saving} onClick={() => void markPaid()}>Mark as paid</button> : null}
            {mode === 'invoice' ? <button type="button" className="button button--ghost" disabled={saving} onClick={() => void createReceiptFromPaidInvoice()}>Create receipt from paid invoice</button> : null}
          </div>
          {generated ? <a className="button button--ghost" href={generated.url} download={generated.fileName}>Download {generated.fileName}</a> : null}
          {message ? <p className="status status--success">{message}</p> : null}
          {error ? <p className="status status--error" role="alert">{error}</p> : null}
        </div>

        <aside className="documents-builder__preview" aria-label={`${mode} preview`}>
          <div className="documents-builder__paper">
            <div className="documents-builder__paper-header">
              {storeSnapshot.logo ? <SafeFirebaseImage src={storeSnapshot.logo} alt="Store logo" /> : <div className="documents-builder__logo-placeholder">Logo</div>}
              <div>
                <h3>{storeSnapshot.businessName || 'Business name'}</h3>
                <p>{[storeSnapshot.phone, storeSnapshot.email, storeSnapshot.website].filter(Boolean).join(' • ')}</p>
                <p>{[storeSnapshot.addressLine1, storeSnapshot.addressLine2].filter(Boolean).join(', ')}</p>
                {storeSnapshot.taxId ? <p>Tax/Reg ID: {storeSnapshot.taxId}</p> : null}
              </div>
            </div>
            <div className="documents-builder__paper-title"><strong>{mode === 'invoice' ? 'INVOICE' : 'RECEIPT'}</strong><span>{activeNumber}</span></div>
            <div className="documents-builder__two-col"><div><strong>Customer</strong><p>{customer.name || 'Customer name'}</p><p>{customer.phone}</p><p>{customer.email}</p><p>{customer.address}</p></div><div><strong>Date</strong><p>{documentDate}</p>{mode === 'invoice' ? <><strong>Due</strong><p>{dueDate || '—'}</p><strong>Status</strong><p>{status}</p></> : <><strong>Payment</strong><p>{paymentMethod}</p><p>{paymentReference}</p></>}</div></div>
            <table className="documents-builder__table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>{normalizedItems.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.description || 'Item'}</td><td>{item.quantity}</td><td>{formatDocumentCurrency(item.unitPrice)}</td><td>{formatDocumentCurrency(item.total)}</td></tr>)}</tbody></table>
            <div className="documents-builder__totals">{mode === 'invoice' ? <><p><span>Subtotal</span><strong>{formatDocumentCurrency(totals.subtotal)}</strong></p><p><span>Discount</span><strong>{formatDocumentCurrency(totals.discount)}</strong></p><p><span>Tax/VAT</span><strong>{formatDocumentCurrency(totals.tax)}</strong></p><p><span>Total</span><strong>{formatDocumentCurrency(totals.total)}</strong></p></> : <p><span>Amount paid</span><strong>{formatDocumentCurrency(Number(amountPaid || totals.total))}</strong></p>}</div>
            {paymentInstructions ? <div><strong>Payment instructions</strong><p>{paymentInstructions}</p></div> : null}
            {notes ? <div><strong>Notes</strong><p>{notes}</p></div> : null}
            <footer>Generated with Sedifex</footer>
          </div>
        </aside>
      </section>
    </div>
  )
}
