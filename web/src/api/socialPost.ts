import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export type SocialPlatform = 'instagram' | 'tiktok'

export type SocialPostProductPayload = {
  id?: string
  name: string
  category?: string | null
  description?: string | null
  price?: number | null
  imageUrl?: string | null
  itemType?: 'product' | 'service' | 'made_to_order'
}

export type GenerateSocialPostPayload = {
  storeId?: string
  platform: SocialPlatform
  productId?: string
  product?: SocialPostProductPayload
}

export type GenerateSocialPostResponse = {
  storeId: string
  productId: string | null
  product: SocialPostProductPayload
  post: {
    platform: SocialPlatform
    caption: string
    hashtags: string[]
    imagePrompt: string
    cta: string
    designSpec: {
      aspectRatio: string
      safeTextZones: string[]
      visualStyle: string
    }
    disclaimer: string | null
  }
}

export async function requestSocialPost(payload: GenerateSocialPostPayload): Promise<GenerateSocialPostResponse> {
  const callable = httpsCallable(functions, 'generateSocialPost')
  const response = await callable(payload)
  return (response.data ?? {}) as GenerateSocialPostResponse
}
