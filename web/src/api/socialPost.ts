import { httpsCallable } from 'firebase/functions'
import { FirebaseError } from 'firebase/app'
import { functions } from '../firebase'
import { requestAiAdvisor } from './aiAdvisor'

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

function parseFallbackJson(text: string): Record<string, unknown> | null {
  const normalized = text.trim()
  if (!normalized) return null

  try {
    return JSON.parse(normalized) as Record<string, unknown>
  } catch (_error) {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>
      } catch (_innerError) {
        return null
      }
    }
    return null
  }
}

async function requestSocialPostFallback(payload: GenerateSocialPostPayload): Promise<GenerateSocialPostResponse> {
  const product = payload.product ?? { id: payload.productId, name: '' }
  const question = [
    'Generate a social media post draft as strict JSON only (no markdown, no prose).',
    `Platform: ${payload.platform}`,
    'Return this schema exactly:',
    '{"platform":"instagram|tiktok","caption":"string","hashtags":["#tag"],"imagePrompt":"string","cta":"string","designSpec":{"aspectRatio":"string","safeTextZones":["string"],"visualStyle":"string"},"disclaimer":"string|null"}',
    'Product JSON:',
    JSON.stringify(product).slice(0, 3_000),
  ].join('\n')

  const fallback = await requestAiAdvisor({
    question,
    storeId: payload.storeId,
    jsonContext: {
      source: 'social-post-fallback',
      platform: payload.platform,
      product,
    },
  })

  const parsed = parseFallbackJson(fallback.advice) ?? {}
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 10)
    : []

  return {
    storeId: fallback.storeId,
    productId: typeof payload.productId === 'string' && payload.productId.trim() ? payload.productId.trim() : null,
    product: {
      id: typeof product.id === 'string' ? product.id : undefined,
      name: typeof product.name === 'string' && product.name.trim() ? product.name.trim() : 'Selected product',
      category: typeof product.category === 'string' ? product.category : null,
      description: typeof product.description === 'string' ? product.description : null,
      price: typeof product.price === 'number' ? product.price : null,
      imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : null,
      itemType: product.itemType === 'service' || product.itemType === 'made_to_order' ? product.itemType : 'product',
    },
    post: {
      platform: parsed.platform === 'tiktok' ? 'tiktok' : payload.platform,
      caption: typeof parsed.caption === 'string' ? parsed.caption.trim() : '',
      hashtags,
      imagePrompt: typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt.trim() : '',
      cta: typeof parsed.cta === 'string' ? parsed.cta.trim() : '',
      designSpec:
        parsed.designSpec && typeof parsed.designSpec === 'object'
          ? {
              aspectRatio:
                typeof (parsed.designSpec as { aspectRatio?: unknown }).aspectRatio === 'string'
                  ? ((parsed.designSpec as { aspectRatio: string }).aspectRatio ?? '4:5')
                  : '4:5',
              safeTextZones: Array.isArray((parsed.designSpec as { safeTextZones?: unknown }).safeTextZones)
                ? ((parsed.designSpec as { safeTextZones: unknown[] }).safeTextZones
                    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
                    .filter(Boolean)
                    .slice(0, 4) as string[])
                : ['top 15%', 'bottom 20%'],
              visualStyle:
                typeof (parsed.designSpec as { visualStyle?: unknown }).visualStyle === 'string'
                  ? ((parsed.designSpec as { visualStyle: string }).visualStyle ?? 'clean product-focused')
                  : 'clean product-focused',
            }
          : {
              aspectRatio: '4:5',
              safeTextZones: ['top 15%', 'bottom 20%'],
              visualStyle: 'clean product-focused',
            },
      disclaimer: typeof parsed.disclaimer === 'string' ? parsed.disclaimer.trim() : null,
    },
  }
}

export async function requestSocialPost(payload: GenerateSocialPostPayload): Promise<GenerateSocialPostResponse> {
  try {
    const callable = httpsCallable(functions, 'generateSocialPost')
    const response = await callable(payload)
    return (response.data ?? {}) as GenerateSocialPostResponse
  } catch (_error) {
    return requestSocialPostFallback(payload)
  }
}

export async function confirmSocialBackendReachable(): Promise<boolean> {
  const callable = httpsCallable(functions, 'generateSocialPost')

  try {
    await callable({ platform: 'instagram', product: { name: '' } })
    return true
  } catch (error) {
    if (error instanceof FirebaseError) {
      const code = typeof error.code === 'string' ? error.code.trim() : ''
      if (code === 'functions/unavailable' || code === 'functions/not-found') {
        return false
      }
    }

    return true
  }
}
