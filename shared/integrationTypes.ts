export type IntegrationContractVersion = '2026-05-12'

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
  itemType: 'product' | 'service' | 'course'
  imageUrl: string | null
  imageUrls: string[]
  imageAlt: string | null
  updatedAt: string | null
  listingType?: 'product' | 'service' | 'course' | null
  salesMode?: 'buy_now' | 'book_now' | 'register' | 'request_quote' | null
  status?: 'draft' | 'published' | null
  isPublished?: boolean | null
  isMarketplaceVisible?: boolean | null
  isWebsiteVisible?: boolean | null
  categoryKey?: string | null
  categoryName?: string | null
  currency?: 'GHS' | null
  serviceKind?: string | null
  duration?: string | null
  branch?: string | null
  preferredTimes?: string | null
  startDate?: string | null
  registrationFee?: number | null
  fullFee?: number | null
  capacity?: number | null
  requirements?: string | null
  starterItems?: string | null
  certificateIncluded?: boolean | null
  Agreement?: string | null
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


export interface IntegrationHeroSlide {
  id: string
  storeId: string
  title: string
  eyebrow: string | null
  subtitle: string | null
  ctaLabel: string | null
  ctaHref: string | null
  secondaryCtaLabel: string | null
  secondaryCtaHref: string | null
  imageUrl: string | null
  mobileImageUrl: string | null
  accent: string | null
  textColor: 'light' | 'dark' | null
  overlayStyle: 'none' | 'dark' | 'light' | 'gradient' | null
  layout: 'left_text' | 'center_text' | 'right_text' | null
  priority: number | null
  updatedAt: string | null
}

export interface IntegrationHeroSlidesResponse {
  ok: boolean
  storeId: string
  placement: string
  slides: IntegrationHeroSlide[]
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

export type IntegrationEventScheduleStatus = 'scheduled' | 'time_tba' | 'date_tba'

export interface IntegrationAvailabilitySlot {
  id: string
  storeId: string
  serviceId: string
  linkedCourseId?: string | null
  eventKind?: 'intake' | 'class' | 'workshop' | 'event' | 'trip'
  registrationMode?: 'free' | 'paid' | 'deposit' | 'enquiry'
  price?: number | null
  depositAmount?: number | null
  currency?: string | null
  location?: string | null
  description?: string | null
  registrationDeadline?: string | null
  marketplaceEnabled?: boolean | null
  category?: string | null
  tags?: string[]
  scheduleStatus: IntegrationEventScheduleStatus
  startAt: string | null
  endAt: string | null
  eventDate: string | null
  displayDateText: string | null
  displayTimeText: string | null
  isDateConfirmed: boolean
  isTimeConfirmed: boolean
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


export type CheckoutFulfillmentType = 'PICKUP' | 'DELIVERY'

export interface CheckoutPreviewItemRequest {
  type: 'PRODUCT' | 'SERVICE'
  item_id: string
  qty: number
}

export interface CheckoutPreviewRequest {
  merchant_id: string
  currency: string
  fulfillment_type: CheckoutFulfillmentType
  delivery_address_id: string | null
  items: CheckoutPreviewItemRequest[]
}

export interface CheckoutPreviewBreakdownLine {
  code: 'SUBTOTAL' | 'TAX' | 'DELIVERY' | 'PROCESSING_FEE'
  amount: number
}

export interface CheckoutPreviewResponse {
  pricing_version: string
  subtotal: number
  tax_total: number
  delivery_fee: number
  pre_processing_total: number
  processing_fee_to_add: number
  final_total: number
  breakdown: CheckoutPreviewBreakdownLine[]
}

export interface IntegrationOrderPricingSnapshot {
  pricing_snapshot: CheckoutPreviewResponse
  payment_reference: string | null
  payment_status: string
  order_status: string
}
