export type ItemType = 'product' | 'service' | 'made_to_order'

export type Product = {
  id: string
  name: string
  description?: string | null
  category?: string | null
  sku: string | null
  barcode: string | null
  price: number | null
  stockCount: number | null
  reorderPoint: number | null
  itemType: ItemType
  imageUrl?: string | null
  imageAlt?: string | null
  taxRate?: number | null
  expiryDate?: Date | null
  manufacturerName?: string | null
  productionDate?: Date | null
  batchNumber?: string | null
  showOnReceipt?: boolean
  lastReceiptAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}
