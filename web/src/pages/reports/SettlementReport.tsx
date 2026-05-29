import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, normalizeSourceChannel, toDate } from './reportUtils'

type SettlementRow = {
  id: string
  collectionName: 'integrationOrders' | 'integrationBookings'
  reference: string
  sourceChannel: string
  sourceLabel: string
  customerName: string
  storeName: string
  storeId: string
  grossAmount: number
  baseAmount: number
  customerProcessingFee: number
  gatewayProvider: string
  gatewayFee: number
  gatewayFeeKnown: boolean
  gatewayFeeLabel: string
  sedifexCommission: number
  merchantNet: number
  currency: string
  paymentStatus: string
  settlementStatus: string
  orderStatus: string
  paymentCollectionMode: string
  subaccountCode: string
  stripeConnectedAccountId: string
  splitEnabled: boolean
  transactionCharge: number
  createdAt: Date | null
}

function firstNonZero(...values: number[]) {
  return values.find(value => Number.isFinite(value) && value > 0) ?? 0
}

function readMinorAsMajor(value: unknown) {
  const amount = asNumber(value, 0)
  return amount > 0 ? amount / 100 : 0
}

function readCurrency(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  return asText(data.currency ?? payment.currency ?? pricing.currency ?? pricingSnake.currency, 'GHS')
}

function readMarketplaceFees(data: Record<string, unknown>) {
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const direct = getNestedObject(data, 'marketplaceFees')
  const directSnake = getNestedObject(data, 'marketplace_fees')
  const fromPricing = getNestedObject(pricing, 'marketplaceFees')
  const fromPricingSnake = getNestedObject(pricingSnake, 'marketplace_fees')
  return Object.keys(direct).length
    ? direct
    : Object.keys(directSnake).length
      ? directSnake
      : Object.keys(fromPricing).length
        ? fromPricing
        : fromPricingSnake
}

function readAmount(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const fees = readMarketplaceFees(data)
  return firstNonZero(
    readMinorAsMajor(data.amountMinor),
    readMinorAsMajor(fees.customerFinalTotalMinor),
    readMinorAsMajor(pricing.final_total),
    readMinorAsMajor(pricingSnake.final_total),
    asNumber(payment.customerTotal ?? payment.amount ?? data.amountPaid ?? data.amount ?? data.total ?? data.grandTotal, 0),
  )
}

function readBaseAmount(data: Record<string, unknown>) {
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const fees = readMarketplaceFees(data)
  return firstNonZero(
    readMinorAsMajor(fees.baseTotalMinor),
    readMinorAsMajor(fees.estimatedMerchantGrossMinor),
    readMinorAsMajor(pricing.pre_processing_total),
    readMinorAsMajor(pricingSnake.pre_processing_total),
    readMinorAsMajor(pricing.subtotal),
    readMinorAsMajor(pricingSnake.subtotal),
    readAmount(data),
  )
}

function readCustomerProcessingFee(data: Record<string, unknown>) {
  const pricing = getNestedObject(data, 'pricingSnapshot')
  const pricingSnake = getNestedObject(data, 'pricing_snapshot')
  const fees = readMarketplaceFees(data)
  return firstNonZero(
    readMinorAsMajor(fees.customerProcessingFeeMinor),
    readMinorAsMajor(pricing.processing_fee_to_add),
    readMinorAsMajor(pricingSnake.processing_fee_to_add),
  )
}

function readPaystackSplit(data: Record<string, unknown>) {
  const paystackSplit = getNestedObject(data, 'paystackSplit')
  const paymentRouting = getNestedObject(data, 'paymentRouting')
  const paystackInitPayload = getNestedObject(data, 'paystackInitPayload')
  const subaccount = asText(
    paystackSplit.subaccount ??
      data.paystackSubaccountCode ??
      paymentRouting.paystackSubaccountCode ??
      paymentRouting.subaccountCode ??
      paystackInitPayload.subaccount,
    '',
  )
  const transactionCharge = firstNonZero(
    readMinorAsMajor(paystackSplit.transactionChargeMinor),
    readMinorAsMajor(paystackInitPayload.transactionChargeMinor),
  )
  return {
    subaccount,
    transactionCharge,
    enabled: Boolean(subaccount || paystackSplit.enabled === true),
  }
}


function readPaymentProvider(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const fees = readMarketplaceFees(data)
  const stripeConnect = getNestedObject(data, 'stripeConnect')
  const paystackSplit = getNestedObject(data, 'paystackSplit')
  const provider = asText(data.paymentProvider ?? data.payment_provider ?? data.provider ?? payment.provider ?? fees.provider, '').toLowerCase()
  if (provider) return provider
  if (asText(data.stripeConnectedAccountId ?? stripeConnect.connectedAccountId, '')) return 'stripe'
  if (paystackSplit.enabled === true || asText(data.paystackReference, '')) return 'paystack'
  return 'unknown'
}

function readStripeConnectedAccountId(data: Record<string, unknown>) {
  const stripeConnect = getNestedObject(data, 'stripeConnect')
  return asText(data.stripeConnectedAccountId ?? stripeConnect.connectedAccountId, '')
}

function readGatewayFee(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const fees = readMarketplaceFees(data)
  const gatewayFees = getNestedObject(data, 'gatewayFees')
  return firstNonZero(
    readMinorAsMajor(data.gatewayFeeMinor),
    readMinorAsMajor(data.stripeFeeMinor),
    readMinorAsMajor(data.paystackFeeMinor),
    readMinorAsMajor(fees.gatewayFeeMinor),
    readMinorAsMajor(fees.paymentGatewayFeeMinor),
    readMinorAsMajor(gatewayFees.gatewayFeeMinor),
    asNumber(data.gatewayFee ?? payment.gatewayFee, 0),
  )
}

function formatProvider(provider: string) {
  const normalized = provider.toLowerCase()
  if (normalized === 'paystack') return 'Paystack'
  if (normalized === 'stripe') return 'Stripe'
  if (normalized === 'manual') return 'Manual'
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Unknown'
}

function gatewayFeeStatus(provider: string, gatewayFee: number) {
  if (gatewayFee > 0) return { known: true, label: '' }
  if (provider.toLowerCase() === 'stripe') return { known: false, label: 'Stripe fee deducted by Stripe' }
  return { known: false, label: 'Gateway fee pending' }
}

function readSedifexCommission(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const feePolicy = getNestedObject(data, 'feePolicy')
  const fees = readMarketplaceFees(data)
  const split = readPaystackSplit(data)
  return firstNonZero(
    readMinorAsMajor(data.sedifexPlatformFeeMinor),
    readMinorAsMajor(fees.platformFeeMinor),
    readMinorAsMajor(fees.sedifexPlatformFeeMinor),
    split.transactionCharge,
    readMinorAsMajor(fees.sedifexCommissionMinor),
    asNumber(payment.sedifexCommission ?? payment.sedifexCommissionMajor, 0),
    readMinorAsMajor(payment.sedifexCommissionMinor),
    asNumber(feePolicy.sedifexCommissionMajor, 0),
    readMinorAsMajor(feePolicy.sedifexCommissionMinor),
  )
}

function readMerchantNet(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const fees = readMarketplaceFees(data)
  const explicit = firstNonZero(
    asNumber(payment.merchantNet ?? payment.merchantNetMajor, 0),
    readMinorAsMajor(payment.merchantNetMinor),
    readMinorAsMajor(fees.estimatedMerchantNetMinor),
  )
  if (explicit > 0) return explicit
  return Math.max(0, readAmount(data) - readGatewayFee(data) - readSedifexCommission(data))
}

function isOnlineCheckout(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const mode = asText(data.paymentCollectionMode ?? payment.mode, 'online_checkout').toLowerCase()
  return mode === 'online_checkout' || mode === 'paystack' || mode === 'card'
}

function isPaidLike(status: string) {
  const normalized = status.toLowerCase()
  return ['success', 'confirmed', 'paid', 'captured', 'completed'].some(token => normalized.includes(token))
}

function mapSettlementRow(id: string, collectionName: 'integrationOrders' | 'integrationBookings', data: Record<string, unknown>): SettlementRow {
  const customer = getNestedObject(data, 'customer')
  const payment = getNestedObject(data, 'payment')
  const sourceChannel = normalizeSourceChannel(data.sourceChannel ?? data.source_channel ?? data.source)
  const paymentStatus = asText(data.paymentStatus ?? data.payment_status ?? payment.status, 'pending')
  const split = readPaystackSplit(data)
  const provider = readPaymentProvider(data)
  const stripeConnectedAccountId = readStripeConnectedAccountId(data)
  const gatewayFee = readGatewayFee(data)
  const gatewayFeeMeta = gatewayFeeStatus(provider, gatewayFee)
  const store = getNestedObject(data, 'store')
  const storeName = asText(data.storeName ?? data.store_name ?? store.name ?? store.businessName ?? store.business_name, '')
  const storeId = asText(data.storeId ?? data.store_id ?? data.merchantId ?? data.merchant_id, '')
  return {
    id,
    collectionName,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, id),
    sourceChannel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceChannel === 'client_website' ? 'Client Website' : sourceChannel === 'sedifex_market' ? 'Sedifex Market' : 'Sedifex Public Page'),
    customerName: asText(customer.name ?? customer.email, 'Customer'),
    storeName,
    storeId,
    grossAmount: readAmount(data),
    baseAmount: readBaseAmount(data),
    customerProcessingFee: readCustomerProcessingFee(data),
    gatewayProvider: provider,
    gatewayFee,
    gatewayFeeKnown: gatewayFeeMeta.known,
    gatewayFeeLabel: gatewayFeeMeta.label,
    sedifexCommission: readSedifexCommission(data),
    merchantNet: readMerchantNet(data),
    currency: readCurrency(data),
    paymentStatus,
    settlementStatus: asText(data.settlementStatus ?? data.settlement_status, 'pending'),
    orderStatus: asText(data.orderStatus ?? data.order_status ?? data.bookingStatus, 'pending'),
    paymentCollectionMode: asText(data.paymentCollectionMode ?? payment.mode, 'online_checkout'),
    subaccountCode: split.subaccount,
    stripeConnectedAccountId,
    splitEnabled: provider === 'stripe' ? Boolean(stripeConnectedAccountId) : split.enabled,
    transactionCharge: split.transactionCharge,
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
  }
}

function inRange(row: SettlementRow, range: string) {
  if (range === 'all') return true
  if (!row.createdAt) return false
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') start.setHours(0, 0, 0, 0)
  if (range === '7d') start.setDate(now.getDate() - 7)
  if (range === '30d') start.setDate(now.getDate() - 30)
  if (range === 'month') start.setDate(1), start.setHours(0, 0, 0, 0)
  return row.createdAt >= start
}

export default function SettlementReport() {
  const { storeId } = useActiveStore()
  const [orders, setOrders] = useState<SettlementRow[]>([])
  const [bookings, setBookings] = useState<SettlementRow[]>([])
  const [range, setRange] = useState('30d')
  const [source, setSource] = useState('all')
  const [paymentView, setPaymentView] = useState('online')
  const [splitView, setSplitView] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setOrders([])
      setBookings([])
      return undefined
    }
    const unsubOrders = onSnapshot(query(collection(db, 'integrationOrders'), where('storeId', '==', storeId)), snapshot => {
      setOrders(snapshot.docs.map(docSnap => mapSettlementRow(docSnap.id, 'integrationOrders', docSnap.data() as Record<string, unknown>)))
    })
    const unsubBookings = onSnapshot(query(collection(db, 'integrationBookings'), where('storeId', '==', storeId)), snapshot => {
      setBookings(snapshot.docs.map(docSnap => mapSettlementRow(docSnap.id, 'integrationBookings', docSnap.data() as Record<string, unknown>)))
    })
    return () => { unsubOrders(); unsubBookings() }
  }, [storeId])

  const rows = useMemo(() => [...orders, ...bookings]
    .filter(row => inRange(row, range))
    .filter(row => source === 'all' || row.sourceChannel === source)
    .filter(row => paymentView === 'all' || (paymentView === 'online' ? row.paymentCollectionMode === 'online_checkout' : row.paymentCollectionMode === paymentView))
    .filter(row => splitView === 'all' || (splitView === 'split' ? row.splitEnabled : !row.splitEnabled))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)), [bookings, orders, paymentView, range, source, splitView])

  const paidRows = useMemo(() => rows.filter(row => isPaidLike(row.paymentStatus)), [rows])
  const onlineRows = useMemo(() => rows.filter(row => row.paymentCollectionMode === 'online_checkout' || isOnlineCheckout(row as unknown as Record<string, unknown>)), [rows])

  const totals = useMemo(() => {
    const basis = paidRows.length ? paidRows : rows
    return {
      records: rows.length,
      paidRecords: paidRows.length,
      onlineRecords: onlineRows.length,
      gross: basis.reduce((sum, row) => sum + row.grossAmount, 0),
      base: basis.reduce((sum, row) => sum + row.baseAmount, 0),
      customerFees: basis.reduce((sum, row) => sum + row.customerProcessingFee, 0),
      commission: basis.reduce((sum, row) => sum + row.sedifexCommission, 0),
      merchantNet: basis.reduce((sum, row) => sum + row.merchantNet, 0),
      splitEnabled: rows.filter(row => row.splitEnabled).length,
      missingSplit: rows.filter(row => row.paymentCollectionMode === 'online_checkout' && !row.splitEnabled).length,
      currency: rows[0]?.currency ?? 'GHS',
    }
  }, [onlineRows.length, paidRows, rows])

  function exportRows() {
    downloadCsv('sedifex-settlement-report.csv', rows.map(row => ({
      reference: row.reference,
      type: row.collectionName === 'integrationBookings' ? 'Service booking' : 'Product order',
      source: row.sourceLabel,
      customer: row.customerName,
      grossAmount: row.grossAmount,
      baseAmount: row.baseAmount,
      customerProcessingFee: row.customerProcessingFee,
      gatewayProvider: row.gatewayProvider,
      gatewayFee: row.gatewayFeeKnown ? row.gatewayFee : row.gatewayFeeLabel,
      sedifexCommission: row.sedifexCommission,
      merchantNet: row.merchantNet,
      currency: row.currency,
      paymentStatus: row.paymentStatus,
      settlementStatus: row.settlementStatus,
      orderStatus: row.orderStatus,
      paymentCollectionMode: row.paymentCollectionMode,
      routingEnabled: row.splitEnabled ? 'yes' : 'no',
      subaccountCode: row.subaccountCode,
      stripeConnectedAccountId: row.stripeConnectedAccountId,
      storeName: row.storeName,
      storeId: row.storeId,
      date: formatDate(row.createdAt),
    })))
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Settlement report',
      subtitle: 'Online payment settlement, Sedifex commission, and expected merchant net.',
      summary: [
        { label: 'Records', value: totals.records },
        { label: 'Gross paid/selected', value: formatMoney(totals.gross, totals.currency) },
        { label: 'Sedifex commission', value: formatMoney(totals.commission, totals.currency) },
        { label: 'Expected merchant net', value: formatMoney(totals.merchantNet, totals.currency) },
      ],
      rows: rows.map(row => ({
        reference: row.reference,
        source: row.sourceLabel,
        gross: formatMoney(row.grossAmount, row.currency),
        commission: formatMoney(row.sedifexCommission, row.currency),
        merchantNet: formatMoney(row.merchantNet, row.currency),
        paymentStatus: row.paymentStatus,
        split: row.splitEnabled ? 'Yes' : 'No',
        date: formatDate(row.createdAt),
      })),
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Settlement</p>
        <h1>Settlement report</h1>
        <p className="workspace-muted">Track gross online payments, provider fees, Sedifex platform fees, Stripe/Paystack routing status, and expected merchant settlement.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{formatMoney(totals.gross, totals.currency)}</strong><span>Gross paid/selected</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.commission, totals.currency)}</strong><span>Sedifex commission</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.merchantNet, totals.currency)}</strong><span>Expected merchant net</span></article>
        <article className="workspace-card"><strong>{totals.missingSplit}</strong><span>Online records missing routing</span></article>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Settlement details</h2>
            <p className="workspace-muted">Totals use paid records when available. If no paid records are found, totals show selected records for planning/reconciliation.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={!rows.length}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={!rows.length}>Export CSV</button>
          </div>
        </div>

        <div className="workspace-toolbar">
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>
          <select value={source} onChange={event => setSource(event.target.value)}>
            <option value="all">All sources</option>
            <option value="sedifex_market">Sedifex Market</option>
            <option value="client_website">Client website</option>
            <option value="sedifex_custom_page">Sedifex public page</option>
          </select>
          <select value={paymentView} onChange={event => setPaymentView(event.target.value)}>
            <option value="online">Online checkout only</option>
            <option value="all">All payment modes</option>
            <option value="pay_on_delivery">Pay on delivery</option>
            <option value="manual">Manual</option>
          </select>
          <select value={splitView} onChange={event => setSplitView(event.target.value)}>
            <option value="all">All split statuses</option>
            <option value="split">Split enabled</option>
            <option value="missing">Missing split</option>
          </select>
        </div>

        <div className="workspace-grid workspace-grid--four" style={{ marginTop: 12 }}>
          <article className="workspace-card"><strong>{totals.records}</strong><span>Selected records</span></article>
          <article className="workspace-card"><strong>{totals.paidRecords}</strong><span>Paid/confirmed records</span></article>
          <article className="workspace-card"><strong>{totals.splitEnabled}</strong><span>Split enabled</span></article>
          <article className="workspace-card"><strong>{formatMoney(totals.customerFees, totals.currency)}</strong><span>Gateway/customer fees</span></article>
        </div>

        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Store / source</th>
                <th>Gross amount</th>
                <th>Gateway / fees</th>
                <th>Net seller payout estimate</th>
                <th>Routing</th>
                <th>Payment / settlement</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.collectionName}-${row.id}`}>
                  <td><strong>{row.reference}</strong><br /><small>{row.collectionName === 'integrationBookings' ? 'Service booking' : 'Product order'}</small></td>
                  <td>{row.storeName || row.storeId || row.sourceLabel}<br /><small>{row.storeId ? `Store ID: ${row.storeId}` : row.sourceLabel}</small><br /><small>{row.customerName}</small></td>
                  <td>{formatMoney(row.grossAmount, row.currency)}<br /><small>Currency: {row.currency}</small><br /><small>Base: {formatMoney(row.baseAmount, row.currency)}</small></td>
                  <td><strong>Provider: {formatProvider(row.gatewayProvider)}</strong><br /><small>Gateway fee: {row.gatewayFeeKnown ? formatMoney(row.gatewayFee, row.currency) : row.gatewayFeeLabel}</small><br /><small>Sedifex platform fee: {formatMoney(row.sedifexCommission, row.currency)}</small></td>
                  <td>{formatMoney(row.merchantNet, row.currency)}<br />{row.gatewayProvider === 'stripe' && !row.gatewayFeeKnown ? <small>Estimate before final Stripe fee.</small> : null}</td>
                  <td>{row.splitEnabled ? 'Connected' : 'Missing'}<br /><small>{row.gatewayProvider === 'stripe' ? row.stripeConnectedAccountId || 'No Stripe account' : row.subaccountCode || 'No subaccount'}</small></td>
                  <td><strong>Payment: {row.paymentStatus}</strong><br /><small>Settlement: {row.settlementStatus}</small><br /><small>Order: {row.orderStatus}</small></td>
                  <td>{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={8}>No settlement records found for this filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
