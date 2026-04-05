import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProductImageUploadError,
  deleteUploadedImageByUrl,
  uploadProductImage,
} from './productImageUpload'

describe('productImageUpload api client', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sends storagePath so callers can overwrite existing image URLs', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://storage.googleapis.com/test-bucket/stores/store-1/promo.jpg' }),
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'promo.png', { type: 'image/png' })
    await uploadProductImage(file, { storagePath: 'stores/store-1/promo.jpg' })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as any).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.storagePath).toBe('stores/store-1/promo.jpg')
  })

  it('returns precise deletion errors for gallery cleanup failures', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'bucket unavailable' }),
    })

    await expect(deleteUploadedImageByUrl('https://storage.googleapis.com/test-bucket/stores/store-1/image.jpg')).rejects.toThrow(
      ProductImageUploadError,
    )
  })
})
