import { buildSimplePdf } from './pdf'

type InvoiceLine = {
  name: string
  qty: number
  price: number
  metadata?: string[]
}

type InvoiceTotals = { subTotal: number; taxTotal: number; discount: number; total: number }

type InvoicePayload = {
  invoiceNumber: string
  issuedDate: string
  dueDate?: string
  items: InvoiceLine[]
  totals: InvoiceTotals
  companyName?: string | null
  companyEmail?: string | null
  companyAddress?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  notes?: string | null
}

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'GHS 0.00'
  return `GHS ${amount.toFixed(2)}`
}

function normalizeLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines
    .map(line => ({
      name: typeof line.name === 'string' ? line.name : 'Item',
      qty: Number.isFinite(line.qty) ? line.qty : 0,
      price: Number.isFinite(line.price) ? line.price : 0,
      metadata: Array.isArray(line.metadata)
        ? line.metadata
            .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
        : [],
    }))
    .filter(line => line.qty > 0)
}

function normalizeTotals(totals: InvoiceTotals): InvoiceTotals {
  return {
    subTotal: Number.isFinite(totals.subTotal) ? totals.subTotal : 0,
    taxTotal: Number.isFinite(totals.taxTotal) ? totals.taxTotal : 0,
    discount: Number.isFinite(totals.discount) ? totals.discount : 0,
    total: Number.isFinite(totals.total) ? totals.total : 0,
  }
}

function appendMultiline(lines: string[], value?: string | null) {
  if (!value) return
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => lines.push(line))
}

function formatCustomerLine(options: Pick<InvoicePayload, 'customerName' | 'customerPhone' | 'customerEmail'>) {
  const name = options.customerName ?? 'Customer'
  const phone = options.customerPhone ? ` (${options.customerPhone})` : ''
  const email = options.customerEmail ? ` • ${options.customerEmail}` : ''
  return `Bill to: ${name}${phone}${email}`
}

export function buildInvoicePdf(options: InvoicePayload) {
  try {
    const items = normalizeLines(options.items)
    const totals = normalizeTotals(options.totals)
    const issuedDate = options.issuedDate || new Date().toISOString().slice(0, 10)

    const lines: string[] = []
    const companyName = options.companyName ? options.companyName : 'Sedifex Workspace'
    const generatedAt = new Date().toLocaleString()

    lines.push(companyName)
    lines.push('Powered by Sedifex • sedifex.com')
    lines.push('────────────────────────────────────────')

    appendMultiline(lines, options.companyAddress)
    if (options.companyEmail) {
      lines.push(options.companyEmail)
    }
    lines.push(' ')

    lines.push(
      'INVOICE',
      `Invoice #: ${options.invoiceNumber}`,
      `Issued: ${issuedDate}`,
      options.dueDate ? `Due: ${options.dueDate}` : '',
      `Generated: ${generatedAt}`,
      options.customerName || options.customerPhone || options.customerEmail
        ? formatCustomerLine(options)
        : '',
      '────────────────────────────────────────',
      'Line items:',
    )

    const filteredLines = lines.filter(Boolean)

    items.forEach(item => {
      const total = formatCurrency(item.price * item.qty)
      filteredLines.push(`${item.name}`)
      filteredLines.push(`  ${item.qty} × ${formatCurrency(item.price)}  =  ${total}`)
      if (item.metadata?.length) {
        item.metadata.forEach(entry => {
          filteredLines.push(`  • ${entry}`)
        })
      }
    })

    filteredLines.push('────────────────────────────────────────')
    filteredLines.push('Summary:')
    filteredLines.push(`Subtotal: ${formatCurrency(totals.subTotal)}`)
    filteredLines.push(`VAT / Tax: ${formatCurrency(totals.taxTotal)}`)
    filteredLines.push(`Discount: ${formatCurrency(totals.discount)}`)
    filteredLines.push(`TOTAL DUE: ${formatCurrency(totals.total)}`)

    if (options.notes) {
      filteredLines.push(' ')
      filteredLines.push('Notes:')
      filteredLines.push(options.notes)
    }
    filteredLines.push(' ')
    filteredLines.push('Thank you for your business.')

    const pdfBytes = buildSimplePdf('Invoice', filteredLines)
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    return { url, fileName: `${options.invoiceNumber}.pdf` }
  } catch (error) {
    console.error('[invoice] Unable to build invoice PDF', error)
    return null
  }
}

export type { InvoiceLine, InvoicePayload, InvoiceTotals }
