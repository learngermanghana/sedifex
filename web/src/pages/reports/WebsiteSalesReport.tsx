import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, normalizeSourceChannel, toDate } from './reportUtils'

type OrderRow = {
  id: string
  reference: string
  sourceChannel: string
  sourceLabel: string
  customerName: string
  customerPhone: string
  amount: number
  currency: string
  paymentStatus: string
  orderStatus: string
  paymentCollectionMode: string
  createdAt: Date | null
}

function readAmount(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const amountMinor = asNumber(data.amountMinor, 0)
  if (amountMinor > 0) return amountMinor / 100
  return asNumber(payment.amount ?? data.amount ?? data.total ?? pricing.final_total ?? pricingSnake.final_total ?? pricing.subtotal ?? pricingSnake.subtotal, 0)
}

function mapOrder(id: string, data: Record<string, unknown>): OrderRow {
  const customer = getNestedObject(data, 'customer')
  const payment = getNestedObject(data, 'payment')
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? data.source)
  return {
    id,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, id),
    sourceChannel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceChannel === 'client_website' ? 'Client Website' : 'Sedifex Market'),
    customerName: asText(customer.name, 'Customer'),
    customerPhone: asText(customer.phone ?? customer.email, ''),
    amount: readAmount(data),
    currency: asText(payment.currency ?? data.currency, 'GHS'),
    paymentStatus: asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status, 'pending'),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? payment.mode, 'online_checkout'),
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

export default function WebsiteSalesReport() {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [channel, setChannel] = useState('all')
  const [paymentMode, setPaymentMode] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => {
      setOrders(snapshot.docs.map(docSnap => mapOrder(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const filtered = useMemo(() => orders.filter(order => {
    const channelOk = channel === 'all' || order.sourceChannel === channel
    const modeOk = paymentMode === 'all' || order.paymentCollectionMode === paymentMode
    return channelOk && modeOk
  }), [channel, orders, paymentMode])

  const totals = useMemo(() => ({
    count: filtered.length,
    revenue: filtered.reduce((sum, order) => sum + order.amount, 0),
    website: filtered.filter(order => order.sourceChannel === 'client_website').length,
    market: filtered.filter(order => order.sourceChannel === 'sedifex_market').length,
    payOnDelivery: filtered.filter(order => order.paymentCollectionMode === 'pay_on_delivery').length,
  }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-website-sales-report.csv', filtered.map(order => ({
      reference: order.reference,
      source: order.sourceLabel,
      customer: order.customerName,
      contact: order.customerPhone,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      paymentCollectionMode: order.paymentCollectionMode,
      createdAt: formatDate(order.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Website sales report',
      subtitle: 'Online and website sales from Sedifex Market, client websites, and public pages.',
      summary: [
        { label: 'Orders', value: totals.count },
        { label: 'Order value', value: formatMoney(totals.revenue) },
        { label: 'Client website orders', value: totals.website },
        { label: 'Pay on delivery', value: totals.payOnDelivery },
      ],
      rows: filtered.map(order => ({
        reference: order.reference,
        source: order.sourceLabel,
        customer: order.customerName,
        contact: order.customerPhone,
        amount: order.amount,
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        paymentCollectionMode: order.paymentCollectionMode,
        createdAt: formatDate(order.createdAt),
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Website sales</p>
        <h1>Online and website sales report</h1>
        <p className="workspace-muted">Detailed sales from Sedifex Market, client websites, public pages, online payment, manual payment, and pay on delivery.</p>
      </section>
      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.count}</strong><span>Orders</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.revenue)}</strong><span>Order value</span></article>
        <article className="workspace-card"><strong>{totals.website}</strong><span>Client website orders</span></article>
        <article className="workspace-card"><strong>{totals.payOnDelivery}</strong><span>Pay on delivery</span></article>
      </section>
      <section className="workspace-card">
        <div className="workspace-section-header">
          <div><h2>Order details</h2><p className="workspace-muted">Filter by source or payment mode, then export CSV.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <select value={channel} onChange={event => setChannel(event.target.value)}>
            <option value="all">All sources</option>
            <option value="client_website">Client website</option>
            <option value="sedifex_market">Sedifex Market</option>
            <option value="sedifex_custom_page">Sedifex public page</option>
          </select>
          <select value={paymentMode} onChange={event => setPaymentMode(event.target.value)}>
            <option value="all">All payment modes</option>
            <option value="online_checkout">Online checkout</option>
            <option value="pay_on_delivery">Pay on delivery</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead><tr><th>Reference</th><th>Source</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Order</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id}>
                  <td>{order.reference}</td>
                  <td>{order.sourceLabel}</td>
                  <td><strong>{order.customerName}</strong><br /><small>{order.customerPhone || 'No contact'}</small></td>
                  <td>{formatMoney(order.amount, order.currency)}</td>
                  <td>{order.paymentStatus}<br /><small>{order.paymentCollectionMode}</small></td>
                  <td>{order.orderStatus}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
