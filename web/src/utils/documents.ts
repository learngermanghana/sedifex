import { buildSimplePdf } from './pdf'

export type DocumentPrefix = 'INV' | 'RCP'

export type BusinessStoreSnapshot = {
  storeId: string
  businessName: string
  logo: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  website: string
  taxId: string
}

export type DocumentCustomer = {
  name: string
  phone: string
  email: string
  address?: string
}

export type DocumentItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type DocumentTotals = {
  subtotal: number
  discount: number
  tax: number
  total: number
}

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

export function generateDocumentNumber(prefix: DocumentPrefix, date = new Date(), seed = Math.random()) {
  const suffix = Math.floor(seed * 10000).toString().padStart(4, '0')
  return `${prefix}-${todayStamp(date)}-${suffix}`
}

export function toMoneyNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function calculateDocumentItems(
  items: Array<{ description: string; quantity: string | number; unitPrice: string | number }>,
): DocumentItem[] {
  return items
    .map(item => {
      const quantity = toMoneyNumber(item.quantity)
      const unitPrice = toMoneyNumber(item.unitPrice)
      return {
        description: item.description.trim(),
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      }
    })
    .filter(item => item.description || item.quantity > 0 || item.unitPrice > 0)
}

export function calculateDocumentTotals(items: DocumentItem[], discount: string | number, tax: string | number): DocumentTotals {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const discountValue = Math.min(toMoneyNumber(discount), subtotal)
  const taxableAmount = Math.max(0, subtotal - discountValue)
  const taxValue = toMoneyNumber(tax)
  const total = Math.max(0, taxableAmount + taxValue)
  return { subtotal, discount: discountValue, tax: taxValue, total }
}

export function formatDocumentCurrency(amount: number): string {
  return `GHS ${toMoneyNumber(amount).toFixed(2)}`
}

function stringFrom(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function buildStoreSnapshot(storeId: string, data: Record<string, unknown>): BusinessStoreSnapshot {
  return {
    storeId,
    businessName: stringFrom(data, ['businessName', 'displayName', 'name', 'storeName', 'companyName']),
    logo: stringFrom(data, ['logo', 'logoUrl', 'imageUrl', 'photoUrl']),
    phone: stringFrom(data, ['phone', 'phoneNumber', 'businessPhone', 'ownerPhone']),
    email: stringFrom(data, ['email', 'businessEmail', 'ownerEmail']),
    addressLine1: stringFrom(data, ['addressLine1', 'streetAddress', 'address']),
    addressLine2: stringFrom(data, ['addressLine2', 'city', 'region']),
    website: stringFrom(data, ['website', 'websiteUrl', 'publicUrl']),
    taxId: stringFrom(data, ['taxId', 'tin', 'vatNumber', 'businessRegistrationNumber', 'registrationNumber']),
  }
}

export function buildDocumentPdf(options: {
  type: 'Invoice' | 'Receipt'
  number: string
  date: string
  dueDate?: string
  status?: string
  storeSnapshot: BusinessStoreSnapshot
  customer: DocumentCustomer
  items: DocumentItem[]
  totals?: DocumentTotals
  amountPaid?: number
  notes?: string
  paymentInstructions?: string
  paymentMethod?: string
  paymentReference?: string
}) {
  const store = options.storeSnapshot
  const lines = [
    store.businessName || 'Sedifex Store',
    store.phone,
    store.email,
    store.addressLine1,
    store.addressLine2,
    store.website,
    store.taxId ? `Tax/Registration ID: ${store.taxId}` : '',
    '────────────────────────────────────────',
    options.type.toUpperCase(),
    `Number: ${options.number}`,
    `Date: ${options.date}`,
    options.dueDate ? `Due: ${options.dueDate}` : '',
    options.status ? `Status: ${options.status}` : '',
    ' ',
    `Customer: ${options.customer.name || 'Customer'}`,
    options.customer.phone,
    options.customer.email,
    options.customer.address ?? '',
    '────────────────────────────────────────',
    'Items:',
  ].filter(Boolean)

  options.items.forEach(item => {
    lines.push(item.description || 'Item')
    lines.push(`  ${item.quantity} × ${formatDocumentCurrency(item.unitPrice)} = ${formatDocumentCurrency(item.total)}`)
  })

  lines.push('────────────────────────────────────────')
  if (options.totals) {
    lines.push(`Subtotal: ${formatDocumentCurrency(options.totals.subtotal)}`)
    lines.push(`Discount: ${formatDocumentCurrency(options.totals.discount)}`)
    lines.push(`Tax/VAT: ${formatDocumentCurrency(options.totals.tax)}`)
    lines.push(`Total: ${formatDocumentCurrency(options.totals.total)}`)
  }
  if (typeof options.amountPaid === 'number') lines.push(`Amount paid: ${formatDocumentCurrency(options.amountPaid)}`)
  if (options.paymentMethod) lines.push(`Payment method: ${options.paymentMethod}`)
  if (options.paymentReference) lines.push(`Payment reference: ${options.paymentReference}`)
  if (options.paymentInstructions) lines.push(`Payment instructions: ${options.paymentInstructions}`)
  if (options.notes) lines.push(`Notes: ${options.notes}`)
  lines.push('Generated with Sedifex')

  const pdfBytes = buildSimplePdf(options.type, lines)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  return { url: URL.createObjectURL(blob), fileName: `${options.number}.pdf` }
}
