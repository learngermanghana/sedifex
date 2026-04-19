export type IntegrationContractVersion = '2026-04-13'

export interface IntegrationProduct {
  id: string
  storeId: string
  storeName: string | null
  storeCity: string | null
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
  publicProducts?: IntegrationProduct[]
  publicServices?: IntegrationProduct[]
}

export interface IntegrationPromoResponse {
  storeId: string
  promo: IntegrationPromo
}

export interface IntegrationAvailabilitySlot {
  id: string
  storeId: string
  serviceId: string
  startAt: string
  endAt: string
  timezone: string | null
  capacity: number | null
  seatsBooked: number
  seatsRemaining: number | null
  status: 'open' | 'closed' | 'cancelled'
  attributes: Record<string, unknown>
  updatedAt: string | null
}

export interface IntegrationAvailabilityResponse {
  storeId: string
  serviceId: string | null
  from: string | null
  to: string | null
  slots: IntegrationAvailabilitySlot[]
}

export interface IntegrationBooking {
  id: string
  storeId: string
  serviceId: string
  slotId: string | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'checked_in'
  customer: {
    name: string | null
    phone: string | null
    email: string | null
  }
  quantity: number
  notes: string | null
  attributes: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export interface IntegrationBookingsResponse {
  storeId: string
  bookings: IntegrationBooking[]
}

export interface CreateIntegrationBookingRequest {
  serviceId: string
  slotId?: string | null
  customer: {
    name?: string | null
    phone?: string | null
    email?: string | null
  }
  quantity?: number
  notes?: string | null
  attributes?: Record<string, unknown>
}

export interface CreateIntegrationBookingResponse {
  booking: IntegrationBooking | null
}
