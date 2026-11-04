import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './usage'

let role = 'owner'
let homeStore = 'store-1'
let galleryUsed = true
let productUsed = true
let blogUsed = false
const verifyIdToken = vi.fn(async () => ({ uid: 'owner-1' }))

const record = (data: Record<string, unknown>, id = 'record-1') => ({
  id,
  data: () => data,
})
const snapshot = (docs: Array<ReturnType<typeof record>>) => ({ docs, size: docs.length, empty: docs.length === 0 })
const empty = () => snapshot([])

vi.mock('../_firebase-admin.js', () => ({ getAdmin: () => ({}) }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'teamMembers') return {
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ uid: 'owner-1', role, storeId: homeStore }) }) }),
      }
      if (name === 'products') return {
        where: () => ({ limit: () => ({ get: async () => snapshot(productUsed ? [record({ name: 'Test service', imageUrl: 'https://example.com/photo.jpg' })] : []) }) }),
      }
      if (name === 'blogPosts') return {
        where: () => ({ limit: () => ({ get: async () => snapshot(blogUsed ? [record({ title: 'My blog', imageUrl: 'https://example.com/photo.jpg' })] : []) }) }),
      }
      if (name === 'stores') return {
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ parentStoreId: 'store-1' }) }),
          collection: (subCollection: string) => ({
            doc: () => ({
              get: async () => ({ data: () => ({ title: 'My album' }) }),
            }),
            where: () => ({
              limit: () => ({
                get: async () => subCollection === 'galleryImages' && galleryUsed
                  ? snapshot([record({ albumId: 'album-1' })]) : empty(),
              }),
            }),
            limit: () => ({ get: async () => empty() }),
          }),
        }),
      }
      throw new Error('Unexpected collection ' + name)
    },
  }),
}))

function res() {
  return {
    statusCode: 200,
    payload: null as any,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.payload = body; return this },
  }
}

const validRequest = () => ({
  method: 'POST',
  headers: { authorization: 'Bearer valid-token' },
  body: { storeId: 'store-1', url: 'https://example.com/photo.jpg' },
})

describe('on-demand media usage lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    role = 'owner'
    homeStore = 'store-1'
    galleryUsed = true
    productUsed = true
    blogUsed = false
  })

  it('returns known album and product references', async () => {
    const response = res()
    await handler(validRequest() as any, response as any)
    expect(response.statusCode).toBe(200)
    expect(response.payload.albumRefs).toEqual([{ id: 'album-1', name: 'My album', type: 'album' }])
    expect(response.payload.productRefs[0].name).toBe('Test service')
    expect(response.payload.partial).toBe(false)
  })

  it('shows blog post references when present', async () => {
    blogUsed = true
    const response = res()
    await handler(validRequest() as any, response as any)
    expect(response.statusCode).toBe(200)
    expect(response.payload.siteRefs).toEqual([{ id: 'record-1', name: 'My blog', type: 'blog' }])
  })

  it('does not invent references when picture is unused', async () => {
    galleryUsed = false
    productUsed = false
    const response = res()
    await handler(validRequest() as any, response as any)
    expect(response.statusCode).toBe(200)
    expect(response.payload.albumRefs).toHaveLength(0)
    expect(response.payload.productRefs).toHaveLength(0)
  })

  it('requires a signed-in store member', async () => {
    const response = res()
    await handler({ ...validRequest(), headers: {} } as any, response as any)
    expect(response.statusCode).toBe(401)

    role = 'staff'
    homeStore = 'other-store'
    const response2 = res()
    await handler(validRequest() as any, response2 as any)
    expect(response2.statusCode).toBe(403)
  })

  it('rejects malformed input', async () => {
    const response = res()
    await handler({ ...validRequest(), body: { storeId: '../other', url: 'ftp://unsafe' } } as any, response as any)
    expect(response.statusCode).toBe(400)
  })
})
