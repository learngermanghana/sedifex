export type ItemType = 'product' | 'service' | 'course' | 'made_to_order'

export type Product = {
  id: string
  name: string
  category?: string | null
  description?: string | null
  sku: string | null
  barcode: string | null
  price: number | null
  costPrice?: number | null
  stockCount: number | null
  reorderPoint: number | null
  itemType: ItemType
  imageUrl?: string | null
  imageUrls?: string[]
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
  sortOrder?: number | null
  listingType?: 'product' | 'service' | 'course' | null
  salesMode?: 'buy_now' | 'book_now' | 'register' | 'request_quote' | null
  serviceKind?: string | null
  duration?: string | null
  branch?: string | null
  preferredTimes?: string | null
  startDate?: Date | null
  registrationFee?: number | null
  fullFee?: number | null
  capacity?: number | null
  requirements?: string | null
  starterItems?: string | null
  certificateIncluded?: boolean | null
  Agreement?: string | null
  courseLevel?: string | null
  courseMode?: string | null
  isPublished?: boolean | null
  isMarketplaceVisible?: boolean | null
  categoryKey?: string | null
  categoryName?: string | null
  currency?: string | null
}
