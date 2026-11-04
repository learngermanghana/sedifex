import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './delete'

const hash = 'a'.repeat(64)
const url = 'https://storage.googleapis.com/test-bucket/stores/store-1/media/' + hash + '.webp?v=123'
const storageDelete = vi.fn(async () => undefined)
const mediaDelete = vi.fn(async () => undefined)
const tokenVerify = vi.fn(async () => ({ uid: 'owner-1' }))
let memberRole = 'owner'
let albumUsed = false
let productUsed = false
let blogUsed = false
let heroUsed = false
let promoUsed = false
const empty = () => ({ empty: true, docs: [], size: 0 })
const imageRecords = () => ({ empty: !albumUsed, docs: albumUsed ? [{ id: 'photo' }] : [], size: albumUsed ? 1 : 0 })
const productRecords = () => ({
  docs: productUsed ? [{ data: () => ({ imageUrl: url, imageUrls: [url] }) }] : [],
  size: productUsed ? 1 : 0,
})

vi.mock('../_firebase-admin.js', () => ({
  getAdmin: () => ({}),
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: tokenVerify }),
}))
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({ file: () => ({ delete: storageDelete }) }),
  }),
}))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'teamMembers') return {
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ uid: 'owner-1', role: memberRole, storeId: 'store-1' }) }) }),
      }
      if (name === 'products') return {
        where: () => ({ limit: () => ({ get: async () => productRecords() }) }),
      }
      if (name === 'blogPosts') return {
        where: () => ({ limit: () => ({ get: async () => ({
          docs: blogUsed ? [{ data: () => ({ imageUrl: url }) }] : [], size: blogUsed ? 1 : 0,
        }) }) }),
      }
      if (name === 'stores') return {
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ parentStoreId: 'store-1', promoImageUrl: promoUsed ? url : null }) }),
          collection: (collectionName: string) => ({
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ url }) }),
              delete: mediaDelete,
            }),
            where: () => ({
              limit: () => ({ get: async () => collectionName === 'galleryImages' ? imageRecords() : empty() }),
            }),
            get: async () => empty(),
            limit: () => ({ get: async () => collectionName === 'websiteHeroSlides' && heroUsed
              ? { docs: [{ data: () => ({ imageUrl: url }) }], size: 1 } : empty() }),
          }),
        }),
      }
      throw new Error('Unexpected collection ' + name)
    },
  }),
}))

function response() {
  return {
    statusCode: 200,
    payload: null as any,
    status(code: number) { this.statusCode = code; return this },
    json(body: any) { this.payload = body; return this },
  }
}
function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { storeId: 'store-1', assetId: hash },
    ...overrides,
  }
}

describe('Media Library permanent deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.IMAGE_UPLOAD_BUCKET = 'test-bucket'
    memberRole = 'owner'
    albumUsed = false
    productUsed = false
    blogUsed = false
    heroUsed = false
    promoUsed = false
  })

  it('deletes the original object and its media record for an owner', async () => {
    const res = response()
    await handler(request() as any, res as any)
    expect(res.statusCode).toBe(200)
    expect(storageDelete).toHaveBeenCalledWith({ ignoreNotFound: true })
    expect(mediaDelete).toHaveBeenCalledTimes(1)
  })

  it('blocks deletion when a gallery still uses the picture', async () => {
    albumUsed = true
    const res = response()
    await handler(request() as any, res as any)
    expect(res.statusCode).toBe(409)
    expect(storageDelete).not.toHaveBeenCalled()
    expect(mediaDelete).not.toHaveBeenCalled()
  })

  it('blocks deletion when an item uses the picture', async () => {
    productUsed = true
    const res = response()
    await handler(request() as any, res as any)
    expect(res.statusCode).toBe(409)
    expect(storageDelete).not.toHaveBeenCalled()
  })

  it('blocks deletion when blogs, hero slides or promo profiles still use the image', async () => {
    for (const field of ['blog', 'hero', 'promo']) {
      blogUsed = field === 'blog'
      heroUsed = field === 'hero'
      promoUsed = field === 'promo'
      const res = response()
      await handler(request() as any, res as any)
      expect(res.statusCode).toBe(409)
      expect(storageDelete).not.toHaveBeenCalled()
    }
  })

  it('rejects staff deletion and anonymous deletion', async () => {
    memberRole = 'staff'
    let res = response()
    await handler(request() as any, res as any)
    expect(res.statusCode).toBe(403)

    res = response()
    await handler(request({ headers: {} }) as any, res as any)
    expect(res.statusCode).toBe(401)
    expect(storageDelete).not.toHaveBeenCalled()
  })

  it('rejects an invalid asset id without accessing storage', async () => {
    const res = response()
    await handler(request({ body: { storeId: 'store-1', assetId: '../x' } }) as any, res as any)
    expect(res.statusCode).toBe(400)
    expect(storageDelete).not.toHaveBeenCalled()
  })
})
