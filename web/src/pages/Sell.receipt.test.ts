import { describe, expect, it } from 'vitest'
import { buildReceiptPrintHtml } from './Sell'

describe('buildReceiptPrintHtml', () => {
  const baseOptions = {
    companyName: 'Sedifex Mart',
    companyLogoUrl: null,
    items: [{ name: 'Notebook', quantity: 2, unitPrice: 1500, lineTotal: 3000 }],
    subtotal: 3000,
    tax: 0,
    total: 3000,
    amountPaid: 3000,
    changeDue: 0,
    customerName: null,
    customerPhone: null,
    cashierName: 'Cashier',
    paymentMethod: 'cash' as const,
    saleId: 'sale-001',
    receiptSize: '58mm' as const,
  }

  it('includes the store logo in print html when logo url is provided', () => {
    const html = buildReceiptPrintHtml(
      { ...baseOptions, companyLogoUrl: 'https://cdn.example.com/logo.png' },
      '2026-04-06 10:00',
    )

    expect(html).toContain('<img src="https://cdn.example.com/logo.png" alt="Store logo"')
  })

  it('does not render a logo image when no logo url is provided', () => {
    const html = buildReceiptPrintHtml(baseOptions, '2026-04-06 10:00')

    expect(html).not.toContain('alt="Store logo"')
  })
})
