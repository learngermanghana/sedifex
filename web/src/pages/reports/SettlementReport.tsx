import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { asNumber, asText, downloadCsv, exportReportPdf, formatDate, formatMoney, getNestedObject, normalizeSourceChannel, toDate } from './reportUtils'
import { canonicalBookingOrderKey, chooseMoreCompleteRecord, deriveCanonicalOrderStatus, deriveOnlineOrderStatusFromBooking, deriveReportPaymentFields, normalizeBookingStatusFromRecord } from '../../lib/bookingStatus'

type SettlementRow = {
  id: string
  collectionName: 'integrationOrders' | 'integrationBookings'
  reference: string
  bookingId: string
  sourceChannel: string
  sourceLabel: string
  customerName: string
  grossAmount: number
  baseAmount: number
  customerProcessingFee: number
  sedifexCommission: number
  merchantNet: number
  currency: string
  paymentStatus: string
  orderStatus: string
  updatedAt: Date | null
  paymentCollectionMode: string
  subaccountCode: string
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

function readSedifexCommission(data: Record<string, unknown>) {
  const payment = getNestedObject(data, 'payment')
  const feePolicy = getNestedObject(data, 'feePolicy')
  const fees = readMarketplaceFees(data)
  const split = readPaystackSplit(data)
  return firstNonZero(
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
  return Math.max(0, readBaseAmount(data) - readSedifexCommission(data))
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
  const reportFields = deriveReportPaymentFields(data)
  const paymentStatus = reportFields.paymentStatus
  const bookingStatus = normalizeBookingStatusFromRecord(data)
  const orderStatus = String(deriveCanonicalOrderStatus(data, collectionName === 'integrationBookings' ? deriveOnlineOrderStatusFromBooking(bookingStatus) : 'pending'))
  const split = readPaystackSplit(data)
  return {
    id,
    collectionName,
    reference: asText(data.reference ?? data.paymentReference ?? data.payment_reference, id),
    bookingId: asText(data.booking_id ?? data.bookingId, collectionName === 'integrationBookings' ? id : ''),
    sourceChannel,
    sourceLabel: asText(data.sourceLabel ?? data.source_label, sourceChannel === 'client_website' ? 'Client Website' : sourceChannel === 'sedifex_market' ? 'Sedifex Market' : 'Sedifex Public Page'),
    customerName: asText(customer.name ?? customer.email, 'Customer'),
    grossAmount: reportFields.amountReceived,
    baseAmount: Math.min(readBaseAmount(data), reportFields.amountReceived || readBaseAmount(data)),
    customerProcessingFee: readCustomerProcessingFee(data),
    sedifexCommission: readSedifexCommission(data),
    merchantNet: readMerchantNet(data),
    currency: readCurrency(data),
    paymentStatus,
    orderStatus,
    paymentCollectionMode: asText(data.paymentCollectionMode ?? payment.mode, 'online_checkout'),
    subaccountCode: split.subaccount,
    splitEnabled: split.enabled,
    transactionCharge: split.transactionCharge,
    createdAt: toDate(data.createdAtServer ?? data.createdAt),
    updatedAt: toDate(data.updatedAt ?? data.updated_at ?? data.paymentUpdatedAt),
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

  const rows = useMemo(() => {
    const rowsByKey = new Map<string, SettlementRow>()
    ;[...orders, ...bookings].forEach(row => {
      const key = canonicalBookingOrderKey({ booking_id: row.bookingId, payment_reference: row.reference }, row.id)
      const existing = rowsByKey.get(key)
      rowsByKey.set(key, existing ? chooseMoreCompleteRecord(existing, { ...existing, ...row, id: row.bookingId || existing.bookingId || row.id }) : row)
    })
    return Array.from(rowsByKey.values())
      .filter(row => inRange(row, range))
      .filter(row => source === 'all' || row.sourceChannel === source)
      .filter(row => paymentView === 'all' || (paymentView === 'online' ? row.paymentCollectionMode === 'online_checkout' : row.paymentCollectionMode === paymentView))
      .filter(row => splitView === 'all' || (splitView === 'split' ? row.splitEnabled : !row.splitEnabled))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }, [bookings, orders, paymentView, range, source, splitView])

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
      sedifexCommission: row.sedifexCommission,
      merchantNet: row.merchantNet,
      currency: row.currency,
      paymentStatus: row.paymentStatus,
      orderStatus: row.orderStatus,
      paymentCollectionMode: row.paymentCollectionMode,
      splitEnabled: row.splitEnabled ? 'yes' : 'no',
      subaccountCode: row.subaccountCode,
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

  const columns: ReportColumn<SettlementRow>[] = [
    { key: 'reference', label: 'Reference', sortable: true, value: row => `${row.reference} ${row.collectionName}`, render: row => <><strong>{row.reference}</strong><br /><small>{row.collectionName === 'integrationBookings' ? 'Service booking' : 'Product order'}</small></> },
    { key: 'source', label: 'Source', sortable: true, value: row => `${row.sourceLabel} ${row.customerName}`, render: row => <>{row.sourceLabel}<br /><small>{row.customerName}</small></> },
    { key: 'gross', label: 'Gross', align: 'right', sortable: true, value: row => row.grossAmount, render: row => <>{formatMoney(row.grossAmount, row.currency)}<br /><small>Base: {formatMoney(row.baseAmount, row.currency)}</small></> },
    { key: 'fees', label: 'Fees / commission', align: 'right', sortable: true, value: row => row.sedifexCommission + row.customerProcessingFee, render: row => <>{formatMoney(row.sedifexCommission, row.currency)}<br /><small>Customer fee: {formatMoney(row.customerProcessingFee, row.currency)}</small></> },
    { key: 'merchantNet', label: 'Merchant net', align: 'right', sortable: true, value: row => row.merchantNet, render: row => formatMoney(row.merchantNet, row.currency) },
    { key: 'split', label: 'Split', sortable: true, value: row => `${row.splitEnabled ? 'Enabled' : 'Missing'} ${row.subaccountCode}`, render: row => <>{row.splitEnabled ? 'Enabled' : 'Missing'}<br /><small>{row.subaccountCode || 'No subaccount'}</small></> },
    { key: 'status', label: 'Status', sortable: true, value: row => `${row.paymentStatus} ${row.orderStatus}`, render: row => <>{row.paymentStatus}<br /><small>{row.orderStatus}</small></> },
    { key: 'date', label: 'Date', sortable: true, value: row => row.createdAt, render: row => formatDate(row.createdAt) },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Settlement</p>
        <h1>Settlement report</h1>
        <p className="workspace-muted">Track gross online payments, customer processing fees, Sedifex commission, Paystack split status, and expected merchant settlement.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{formatMoney(totals.gross, totals.currency)}</strong><span>Gross paid/selected</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.commission, totals.currency)}</strong><span>Sedifex commission</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.merchantNet, totals.currency)}</strong><span>Expected merchant net</span></article>
        <article className="workspace-card"><strong>{totals.missingSplit}</strong><span>Online records missing split</span></article>
      </section>

      <ReportDataTable
        title="Settlement details"
        subtitle="Totals use paid records when available. If no paid records are found, totals show selected records for planning/reconciliation."
        rows={rows}
        columns={columns}
        getRowKey={row => `${row.collectionName}-${row.id}`}
        searchPlaceholder="Search reference, source, customer, status, or split…"
        actions={<><button type="button" className="button button--secondary" onClick={exportPdf} disabled={!rows.length}>Export PDF</button><button type="button" className="button button--primary" onClick={exportRows} disabled={!rows.length}>Export CSV</button></>}
        filters={<>
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
        </>}
      />
    </div>
  )
}
