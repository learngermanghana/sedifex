import { describe, expect, it } from 'vitest'

import { productMatchesSearch } from '../../utils/productSearch'
import type { Product } from '../../types/product'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Vitamin C Serum',
    itemType: 'product',
    category: 'Skin Care',
    description: 'Brightening face serum',
    sku: 'SER-001',
    barcode: '123456',
    price: 25,
    costPrice: null,
    stockCount: 10,
    reorderPoint: 2,
    taxRate: null,
    expiryDate: null,
    productionDate: null,
    brand: 'Glow Lab',
    manufacturerName: 'Glow Lab',
    batchNumber: null,
    showOnReceipt: false,
    imageUrl: null,
    imageUrls: [],
    imageAlt: null,
    isPublished: false,
    status: 'draft',
    isMarketplaceVisible: false,
    isWebsiteVisible: false,
    ...overrides,
  }
}

describe('productMatchesSearch', () => {
  it('matches physical products when the user searches for product', () => {
    expect(productMatchesSearch(makeProduct({ category: 'Skin Care' }), 'product')).toBe(true)
  })

  it('matches multiple words across item type and category fields', () => {
    expect(productMatchesSearch(makeProduct({ category: 'Skin Care' }), 'product skin')).toBe(true)
  })

  it('does not match services for product-only searches', () => {
    expect(
      productMatchesSearch(
        makeProduct({
          id: 'service-1',
          name: 'Makeup Consultation',
          itemType: 'service',
          category: 'Beauty Services',
          sku: null,
          barcode: null,
        }),
        'product',
      ),
    ).toBe(false)
  })
})
