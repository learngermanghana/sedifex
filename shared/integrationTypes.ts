export type IntegrationContractVersion = '2026-04-13'

export interface IntegrationProduct {
  id: string
  storeId: string
  name: string
  category: string | null
  description: string | null
  price: number | null
  stockCount: number | null
  itemType: 'product' | 'service' | 'made_to_order'
  imageUrl: string | null
  imageUrls: string[]
  imageAlt: string | null
  updatedAt: string | null
}

export interface IntegrationPromo {
  enabled: boolean
  slug: string | null
  title: string | null
  summary: string | null
  startDate: string | null
  endDate: string | null
  websiteUrl: string | null
  youtubeUrl: string | null
  youtubeEmbedUrl: string | null
  youtubeChannelId: string | null
  youtubeVideos: Array<{
    videoId: string
    title: string
    description: string | null
    thumbnailUrl: string | null
    publishedAt: string | null
    videoUrl: string
    embedUrl: string
  }>
  imageUrl: string | null
  imageAlt: string | null
  phone: string | null
  storeName: string
  updatedAt: string | null
}

export interface IntegrationProductsResponse {
  storeId: string
  products: IntegrationProduct[]
}

export interface IntegrationPromoResponse {
  storeId: string
  promo: IntegrationPromo
}
