import type { Product } from '../types/product'

function buildProductSearchText(product: Product): string {
  const itemTypeLabel =
    product.itemType === 'service'
      ? 'service booking service item'
      : product.itemType === 'course'
        ? 'course programme program class training item'
        : 'product physical product inventory stock item'

  return [
    product.name,
    product.category,
    product.sku,
    product.barcode,
    product.description,
    product.manufacturerName,
    product.brand,
    itemTypeLabel,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

export function productMatchesSearch(product: Product, rawTerm: string): boolean {
  const terms = rawTerm
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (!terms.length) return true

  const searchableText = buildProductSearchText(product)
  return terms.every(term => searchableText.includes(term))
}
