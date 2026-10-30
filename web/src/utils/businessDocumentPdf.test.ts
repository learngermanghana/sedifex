import { describe, expect, test } from 'vitest'
import { buildBusinessDocumentPdf, wrapBusinessPdfText } from './businessDocumentPdf'

const store = {
  storeId: 'store-1',
  businessName: 'Accra Services Ltd',
  logo: '',
  phone: '+233 20 000 0000',
  email: 'hello@example.com',
  addressLine1: 'Accra',
  addressLine2: 'Ghana',
  website: 'example.com',
  taxId: 'TIN-1234',
}

describe('business invoice PDF', () => {
  test('preserves manually entered payment lines and blank lines', () => {
    expect(wrapBusinessPdfText('Bank: Example\nAccount: 1234\n\nReference: INV-4', 500)).toEqual([
      'Bank: Example', 'Account: 1234', '', 'Reference: INV-4',
    ])
  })

  test('wraps long payment details rather than clipping them', () => {
    const lines = wrapBusinessPdfText('Account holder: ' + 'A'.repeat(220), 205, 10)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.join('')).toContain('A'.repeat(220))
  })

  test('generates a readable invoice with structured items, totals and payment section', () => {
    const pdf = buildBusinessDocumentPdf({
      type: 'Invoice',
      number: 'INV-2026-1234',
      date: '2026-10-30',
      dueDate: '2026-11-06',
      status: 'draft',
      storeSnapshot: store,
      customer: { name: 'Adwoa Mensah', phone: '0240000000', email: '', address: 'Spintex' },
      items: [
        { description: 'Professional consultation', quantity: 2, unitPrice: 250, total: 500 },
      ],
      totals: { subtotal: 500, discount: 0, tax: 0, total: 500 },
      paymentInstructions: 'Mobile money:\nName: Accra Services\n\nReference: INV-2026-1234',
    })
    const content = new TextDecoder('latin1').decode(pdf)
    expect(content.startsWith('%PDF-1.4')).toBe(true)
    expect(content).toContain('INV-2026-1234')
    expect(content).toContain('GHS 500.00')
    expect(content).toContain('PAYMENT INFORMATION')
    expect(content).toContain('Mobile money:')
    expect(content).toContain('Name: Accra Services')
    expect(content).toContain('/Count 1')
  })

  test('paginates long invoices without overflowing a single page', () => {
    const pdf = buildBusinessDocumentPdf({
      type: 'Invoice',
      number: 'INV-MULTIPAGE',
      date: '2026-10-30',
      storeSnapshot: store,
      customer: { name: 'Test Customer', phone: '', email: '' },
      items: Array.from({ length: 110 }, (_, i) => ({
        description: 'Product description ' + String(i + 1) + ' with a longer explanation',
        quantity: 1,
        unitPrice: 12,
        total: 12,
      })),
      totals: { subtotal: 1320, discount: 0, tax: 0, total: 1320 },
      paymentInstructions: 'Transfer to our business account.',
    })
    const content = new TextDecoder('latin1').decode(pdf)
    const count = Number(content.match(/\/Count (\d+)/)?.[1] || 0)
    expect(count).toBeGreaterThan(2)
    expect(content).toContain('Page 1 of ' + count)
    expect(content).toContain('Page ' + count + ' of ' + count)
  })
})
