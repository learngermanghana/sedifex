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
    expect(res.payload).toEqual({
      url: 'https://storage.googleapis.com/test-bucket/stores/store-1/promo.jpg',
    })
  })

  it('creates a timestamped object path when no storagePath is provided', async () => {
    const req = {
      method: 'POST',
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
})
