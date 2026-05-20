export type ProductItemType = 'product' | 'service' | 'course' | 'made_to_order'

export type ProductReadModel = {
  id: string
  storeId: string
  name: string
  category: string | null
  description: string | null
  price: number | null
  stockCount: number | null
  itemType: ProductItemType
  imageUrl: string | null
  imageUrls: string[]
  imageAlt: string | null
  updatedAt: FirebaseFirestore.Timestamp | null
  listingType?: 'product' | 'service' | 'course' | null
  salesMode?: 'buy_now' | 'book_now' | 'register' | 'request_quote' | null
  status?: 'draft' | 'published' | null
  isPublished?: boolean | null
  isMarketplaceVisible?: boolean | null
  isWebsiteVisible?: boolean | null
  categoryKey?: string | null
  categoryName?: string | null
  currency?: 'GHS' | null
  storeName?: string | null
  serviceKind?: string | null
  duration?: string | null
  branch?: string | null
  preferredTimes?: string | null
  startDate?: FirebaseFirestore.Timestamp | string | null
  registrationFee?: number | null
  fullFee?: number | null
  capacity?: number | null
  requirements?: string | null
  starterItems?: string | null
  certificateIncluded?: boolean | null
  Agreement?: string | null
}
