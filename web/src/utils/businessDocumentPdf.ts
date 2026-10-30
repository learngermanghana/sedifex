/**
 * Branded, paginated A4 PDF for the Sedifex invoice/receipt editor.
 * No server roundtrip or external PDF dependency is required.
 */
import type { BusinessStoreSnapshot, DocumentCustomer, DocumentItem, DocumentTotals } from './documents'

export type BusinessDocumentPdfInput = {
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
}

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const LEFT = 46
const RIGHT = PAGE_WIDTH - 46
const TOP = 787
const BOTTOM = 77
const WIDTH = RIGHT - LEFT
const encoder = new TextEncoder()

/** Core PDF fonts use WinAnsi; transliterate unsupported glyphs instead of corrupting PDF bytes. */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/•/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '?')
}

function escapeText(value: string) {
  return clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\n/g, ' ')
}

function estimateWidth(value: string, size = 10) {
  let units = 0
  for (const char of value) {
    if ('ilI1.,:;!| '.includes(char)) units += 0.26
    else if ('mwMW@%'.includes(char)) units += 0.85
    else units += 0.54
  }
  return units * size
}

/** Preserve newlines, indentation and intentional blank lines, wrapping only when needed. */
export function wrapBusinessPdfText(value: string, maxWidth: number, size = 10): string[] {
  const result: string[] = []
  for (const original of clean(value).split('\n')) {
    if (!original.length) {
      result.push('')
      continue
    }
    let remaining = original
    while (remaining.length && estimateWidth(remaining, size) > maxWidth) {
      let split = remaining.length
      while (split > 1 && estimateWidth(remaining.slice(0, split), size) > maxWidth) split--
      const wordBreak = remaining.lastIndexOf(' ', split)
      if (wordBreak > 0 && wordBreak > split * 0.4) split = wordBreak + 1
      result.push(remaining.slice(0, split).replace(/\s+$/, ''))
      remaining = remaining.slice(split)
    }
    result.push(remaining)
  }
  return result
}

function money(value: number) {
  return 'GHS ' + (Number.isFinite(value) ? Math.max(0, value) : 0).toFixed(2)
}

function textAt(x: number, y: number, value: string, size = 10, bold = false, color = '0.13 0.20 0.30') {
  return color + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size +
    ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + escapeText(value) + ') Tj ET\n'
}

function rightText(right: number, y: number, value: string, size = 10, bold = false) {
  return textAt(Math.max(LEFT, right - estimateWidth(clean(value), size)), y, value, size, bold)
}

function lineAt(y: number) {
  return '0.87 0.90 0.94 RG 0.7 w ' + LEFT + ' ' + y.toFixed(2) + ' m ' +
    RIGHT + ' ' + y.toFixed(2) + ' l S\n'
}

function buildPdf(pages: string[]): Uint8Array {
  const objects = new Map<number, Uint8Array>()
  const pageIds: number[] = []
  objects.set(3, encoder.encode('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'))
  objects.set(4, encoder.encode('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'))

  pages.forEach((content, index) => {
    const pageId = 5 + index * 2
    const streamId = pageId + 1
    pageIds.push(pageId)
    const streamBytes = encoder.encode(content)
    objects.set(pageId, encoder.encode(pageId + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      PAGE_WIDTH + ' ' + PAGE_HEIGHT + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' +
      streamId + ' 0 R >>\nendobj\n'))
    objects.set(streamId, encoder.encode(streamId + ' 0 obj\n<< /Length ' + streamBytes.length +
      ' >>\nstream\n' + content + 'endstream\nendobj\n'))
  })

  objects.set(1, encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'))
  objects.set(2, encoder.encode('2 0 obj\n<< /Type /Pages /Kids [' +
    pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>\nendobj\n'))

  const lastId = 4 + pages.length * 2
  const header = encoder.encode('%PDF-1.4\n')
  const offsets: number[] = [0]
  const chunks: Uint8Array[] = [header]
  let offset = header.length
  for (let id = 1; id <= lastId; id++) {
    const bytes = objects.get(id)
    if (!bytes) throw new Error('Missing PDF object ' + id)
    offsets[id] = offset
    chunks.push(bytes)
    offset += bytes.length
  }
  const xrefStart = offset
  let xref = 'xref\n0 ' + (lastId + 1) + '\n0000000000 65535 f \n'
  for (let id = 1; id <= lastId; id++) {
    xref += String(offsets[id]).padStart(10, '0') + ' 00000 n \n'
  }
  chunks.push(encoder.encode(xref + 'trailer\n<< /Size ' + (lastId + 1) +
    ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF'))
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let cursor = 0
  for (const chunk of chunks) {
    result.set(chunk, cursor)
    cursor += chunk.length
  }
  return result
}

export function buildBusinessDocumentPdf(input: BusinessDocumentPdfInput): Uint8Array {
  const pages: string[] = []
  let content = ''
  let y = TOP
  let pageNumber = 1
  const title = input.type.toUpperCase()
  const reference = input.number || title

  function pageHeader() {
    content += textAt(LEFT, PAGE_HEIGHT - 34, input.storeSnapshot.businessName || 'Sedifex Business', 10, true)
    content += rightText(RIGHT, PAGE_HEIGHT - 34, title + '  ' + reference, 9)
    content += lineAt(PAGE_HEIGHT - 44)
    y = TOP
  }

  function flushPage() {
    pages.push(content)
    pageNumber += 1
    content = ''
    pageHeader()
  }

  function ensure(height: number) {
    if (y - height < BOTTOM) flushPage()
  }

  function heading(label: string) {
    ensure(38)
    y -= 15
    content += textAt(LEFT, y, label.toUpperCase(), 10, true, '0.14 0.32 0.58')
    y -= 11
    content += lineAt(y)
    y -= 15
  }

  function paragraph(value: string, options?: { x?: number; width?: number; size?: number; leading?: number; bold?: boolean }) {
    const x = options?.x ?? LEFT
    const width = options?.width ?? WIDTH
    const size = options?.size ?? 10
    const leading = options?.leading ?? 15
    const lines = wrapBusinessPdfText(value, width, size)
    for (const line of lines) {
      ensure(leading)
      content += line ? textAt(x, y, line, size, options?.bold ?? false) : ''
      y -= leading
    }
  }

  pageHeader()
  content += textAt(LEFT, y, input.storeSnapshot.businessName || 'Business name', 19, true)
  y -= 23
  const store = input.storeSnapshot
  const companyDetails = [store.addressLine1, store.addressLine2, store.phone, store.email, store.website,
    store.taxId ? 'Tax/Reg ID: ' + store.taxId : ''].filter(Boolean)
  for (const detail of companyDetails) paragraph(detail, { size: 9, leading: 13, width: WIDTH * 0.73 })
  y -= 10
  ensure(65)
  content += lineAt(y)
  y -= 32
  content += textAt(LEFT, y, title, 22, true, '0.10 0.25 0.48')
  content += rightText(RIGHT, y + 3, reference, 11, true)
  y -= 25
  const dates = ['Issued: ' + input.date, input.dueDate ? 'Due: ' + input.dueDate : '',
    input.status ? 'Status: ' + input.status.toUpperCase() : ''].filter(Boolean)
  for (const value of dates) paragraph(value, { size: 9, leading: 14 })
  y -= 5

  heading('Bill to')
  paragraph(input.customer.name || 'Customer', { bold: true, size: 11, leading: 17 })
  for (const detail of [input.customer.phone, input.customer.email, input.customer.address].filter(Boolean)) {
    paragraph(detail || '', { size: 9, leading: 14 })
  }
  y -= 11

  function itemHeading() {
    ensure(40)
    content += '0.92 0.95 0.98 rg ' + LEFT + ' ' + (y - 20).toFixed(2) +
      ' ' + WIDTH + ' 28 re f\n'
    content += textAt(LEFT + 9, y - 12, 'DESCRIPTION', 9, true)
    content += rightText(LEFT + 310, y - 12, 'QTY', 9, true)
    content += rightText(LEFT + 401, y - 12, 'UNIT', 9, true)
    content += rightText(RIGHT - 8, y - 12, 'TOTAL', 9, true)
    y -= 35
  }

  heading('Items / services')
  itemHeading()
  for (const item of input.items) {
    const description = wrapBusinessPdfText(item.description || 'Item', 250, 9.5)
    const rowHeight = Math.max(29, description.length * 14 + 14)
    if (y - rowHeight < BOTTOM) {
      flushPage()
      itemHeading()
    }
    description.forEach((value, index) => {
      content += textAt(LEFT + 9, y - 11 - index * 14, value, 9.5, false)
    })
    content += rightText(LEFT + 310, y - 11, String(item.quantity), 9.5)
    content += rightText(LEFT + 401, y - 11, money(item.unitPrice), 9.5)
    content += rightText(RIGHT - 8, y - 11, money(item.total), 9.5, true)
    y -= rowHeight
    content += lineAt(y)
  }
  y -= 12

  if (input.totals) {
    const totals = input.totals
    const rows: Array<[string, string, boolean]> = [
      ['Subtotal', money(totals.subtotal), false],
      ['Discount', money(totals.discount), false],
      ['Tax/VAT', money(totals.tax), false],
      ['TOTAL DUE', money(totals.total), true],
    ]
    ensure(rows.length * 24 + 16)
    for (const [label, amount, strong] of rows) {
      y -= 22
      content += textAt(LEFT + 270, y, label, strong ? 11 : 10, strong)
      content += rightText(RIGHT - 8, y, amount, strong ? 11 : 10, strong)
    }
  } else if (typeof input.amountPaid === 'number') {
    ensure(35)
    y -= 25
    content += textAt(LEFT + 270, y, 'AMOUNT PAID', 11, true)
    content += rightText(RIGHT - 8, y, money(input.amountPaid), 11, true)
  }
  y -= 13

  if (input.paymentMethod || input.paymentReference) {
    heading('Payment')
    if (input.paymentMethod) paragraph('Method: ' + input.paymentMethod)
    if (input.paymentReference) paragraph('Reference: ' + input.paymentReference)
    y -= 8
  }

  if (input.paymentInstructions?.trim()) {
    heading('Payment instructions')
    paragraph(input.paymentInstructions, { size: 10, leading: 16 })
    y -= 9
  }

  if (input.notes?.trim()) {
    heading('Notes')
    paragraph(input.notes, { size: 10, leading: 16 })
    y -= 8
  }

  pages.push(content)
  const lastPage = pages.length
  return buildPdf(pages.map((page, index) => {
    const footerY = 39
    return page + lineAt(58) +
      textAt(LEFT, footerY, 'Generated with Sedifex', 8, false, '0.40 0.47 0.57') +
      rightText(RIGHT, footerY, 'Page ' + (index + 1) + ' of ' + lastPage, 8)
  }))
}
