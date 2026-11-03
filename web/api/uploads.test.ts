import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './uploads'

const bucketFileSave = vi.fn(async () => undefined)
const bucketFileDelete = vi.fn(async () => undefined)
const bucketFile = vi.fn((objectName: string) => ({
  save: bucketFileSave,
  delete: bucketFileDelete,
  objectName,
}))

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: bucketFile,
    }),
  }),
}))

vi.mock('./_firebase-admin.js', () => ({
  getAdmin: () => ({ app: 'mock-admin' }),
}))


const verifyIdToken = vi.fn(async () => ({ uid: 'owner-1' }))
const readMember = vi.fn(async () => ({ exists: true, data: () => ({ uid: 'owner-1', role: 'owner', storeId: 'store-1' }) }))
const readStore = vi.fn(async () => ({ exists: true, data: () => ({ parentStoreId: 'store-1' }) }))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken }),
}))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: () => ({ get: name === 'teamMembers' ? readMember : readStore }),
    }),
  }),
}))

type MockResponse = {
  statusCode: number
  payload: unknown
  status: (code: number) => MockResponse
  json: (body: unknown) => MockResponse
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.payload = body
      return this
    },
  }
}

describe('uploads api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.IMAGE_UPLOAD_BUCKET = 'test-bucket'
  })

  it('uses provided storagePath so uploads overwrite the same object path', async () => {
    const req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        filename: 'promo.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from('hello').toString('base64'),
        storagePath: 'stores/store-1/promo.jpg',
      },
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(201)
    expect(bucketFile).toHaveBeenCalledWith('stores/store-1/promo.jpg')
    expect(bucketFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true })
    expect(bucketFileSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({
          cacheControl: 'no-cache,max-age=0,must-revalidate',
        }),
      }),
    )
    expect((res.payload as { url?: string }).url).toMatch(
      /^https:\/\/storage\.googleapis\.com\/test-bucket\/stores\/store-1\/promo\.jpg\?v=\d+$/,
    )
  })

  it('creates a timestamped object path when no storagePath is provided', async () => {
    const req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        filename: 'gallery.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from('hello').toString('base64'),
      },
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(201)
    expect(bucketFile).toHaveBeenCalledTimes(1)
    const objectPath = bucketFile.mock.calls[0]?.[0]
    expect(objectPath).toMatch(/^product-images\/\d+-gallery\.png$/)
    expect(bucketFileDelete).not.toHaveBeenCalled()
    expect(bucketFileSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({
          cacheControl: 'public,max-age=31536000,immutable',
        }),
      }),
    )
  })

  it('deletes an uploaded object when DELETE is called with a matching storage URL', async () => {
    const req = {
      method: 'DELETE',
      body: {
        url: 'https://storage.googleapis.com/test-bucket/stores/store-1/gallery/item-1.jpg',
      },
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(bucketFile).toHaveBeenCalledWith('stores/store-1/gallery/item-1.jpg')
    expect(bucketFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true })
    expect(res.payload).toEqual({ deleted: true })
  })

  it('accepts direct binary upload payloads with upload headers', async () => {
    const req = {
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'x-upload-filename': encodeURIComponent('gallery.png'),
        'x-upload-mimetype': 'image/png',
        'x-upload-storage-path': encodeURIComponent('stores/store-1/gallery/hero.jpg'),
      },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(201)
    expect(bucketFile).toHaveBeenCalledWith('stores/store-1/gallery/hero.jpg')
  })

  it('rejects payloads when declared MIME does not match detected bytes', async () => {
    const req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        filename: 'promo.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64'),
      },
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(400)
    expect(res.payload).toEqual({ error: 'MIME type does not match uploaded file content.' })
  })

  it('accepts binary payload from rawBody when req.body is empty', async () => {
    const req = {
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'x-upload-filename': encodeURIComponent('gallery.png'),
        'x-upload-mimetype': 'image/png',
      },
      body: undefined,
      rawBody: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
    }
    const res = createResponse()

    await handler(req as any, res as any)

    expect(res.statusCode).toBe(201)
    expect(bucketFile).toHaveBeenCalledTimes(1)
  })

  it('blocks anonymous media uploads to store media storage', async () => {
    const res = createResponse()
    await handler({
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'x-upload-filename': 'photo.png',
        'x-upload-mimetype': 'image/png',
        'x-upload-storage-path': encodeURIComponent('stores/store-1/media/sha.png'),
      },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
    } as any, res as any)
    expect(res.statusCode).toBe(401)
    expect(bucketFileSave).not.toHaveBeenCalled()
  })

  it('permits a signed-in store member to upload media and blocks other stores', async () => {
    const request = {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-id-token',
        'content-type': 'image/png',
        'x-upload-filename': 'photo.png',
        'x-upload-mimetype': 'image/png',
        'x-upload-storage-path': encodeURIComponent('stores/store-1/media/sha.png'),
      },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
    }
    let res = createResponse()
    await handler(request as any, res as any)
    expect(res.statusCode).toBe(201)
    expect(verifyIdToken).toHaveBeenCalledWith('valid-id-token')
    expect(bucketFileSave).toHaveBeenCalledTimes(1)

    readMember.mockResolvedValueOnce({ exists: true, data: () => ({ uid: 'owner-1', role: 'staff', storeId: 'other-store' }) })
    res = createResponse()
    await handler(request as any, res as any)
    expect(res.statusCode).toBe(403)
    expect(bucketFileSave).toHaveBeenCalledTimes(1)
  })

  it('blocks anonymous deletion of an imported media image', async () => {
    const res = createResponse()
    await handler({
      method: 'DELETE',
      headers: {},
      body: { url: 'https://storage.googleapis.com/test-bucket/stores/store-1/media/sha.png' },
    } as any, res as any)
    expect(res.statusCode).toBe(401)
    expect(bucketFileDelete).not.toHaveBeenCalled()
  })

})
