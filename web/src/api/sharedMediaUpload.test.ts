import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadToSharedMediaLibrary } from './sharedMediaUpload'

const getDoc = vi.fn()
const setDoc = vi.fn(async () => undefined)
const uploadProductImage = vi.fn(async () => 'https://storage.googleapis.com/test-bucket/stores/store-1/media/asset.webp?v=1')
const hash = 'a'.repeat(64)

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDoc: (...args: unknown[]) => getDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  serverTimestamp: () => 'NOW',
}))
vi.mock('../firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'valid-token' } },
  db: {},
}))
vi.mock('./productImageUpload', () => ({
  uploadProductImage: (...args: unknown[]) => uploadProductImage(...args),
}))
vi.mock('../utils/mediaLibrary', () => ({
  mediaFileExtension: () => '.webp',
  mediaSha256: async () => hash,
  optimizeMediaFile: async (file: File) => file,
  uploadWithRetry: async (callback: () => Promise<unknown>) => callback(),
}))

describe('shared Media Manager uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDoc.mockResolvedValue({ exists: () => false })
  })

  it('uploads once with the correct store-owned hashed path and saves metadata', async () => {
    const file = new File(['example'], 'product.webp', { type: 'image/webp' })
    const result = await uploadToSharedMediaLibrary(file, 'store-1')
    expect(result.alreadyThere).toBe(false)
    expect(uploadProductImage).toHaveBeenCalledWith(file, {
      storagePath: 'stores/store-1/media/' + hash + '.webp', authToken: 'valid-token',
    })
    expect(setDoc).toHaveBeenCalledWith(
      'stores/store-1/mediaAssets/' + hash,
      expect.objectContaining({ source: 'device', name: 'product.webp', sourceId: null }),
    )
  })

  it('reuses a previously imported image without another upload', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ url: 'https://example.com/image.webp' }) })
    const result = await uploadToSharedMediaLibrary(
      new File(['example'], 'product.webp', { type: 'image/webp' }), 'store-1')
    expect(result).toEqual({ url: 'https://example.com/image.webp', alreadyThere: true })
    expect(uploadProductImage).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('requires an active store', async () => {
    await expect(uploadToSharedMediaLibrary(
      new File(['example'], 'product.webp', { type: 'image/webp' }), '',
    )).rejects.toThrow('Select a store')
  })
})
