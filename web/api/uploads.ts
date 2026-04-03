import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStorage } from 'firebase-admin/storage'
import { getAdmin } from './_firebase-admin.js'

const MAX_BYTES = 5 * 1024 * 1024

type UploadRequestBody = {
  filename?: unknown
  mimeType?: unknown
  dataBase64?: unknown
}

function normalizeFilename(value: unknown): string {
  if (typeof value !== 'string') return 'upload'
  const trimmed = value.trim()
  if (!trimmed) return 'upload'
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function resolveExtension(filename: string, mimeType: string): string {
  const fromName = filename.includes('.') ? `.${filename.split('.').pop()}` : ''
  if (fromName && /^[.a-zA-Z0-9_-]{1,10}$/.test(fromName)) return fromName.toLowerCase()

  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/avif') return '.avif'
  if (mimeType === 'image/svg+xml') return '.svg'
  return '.jpg'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const { filename, mimeType, dataBase64 } = (req.body || {}) as UploadRequestBody

  if (typeof mimeType !== 'string' || !mimeType.trim() || !mimeType.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image MIME types are allowed.' })
  }

  if (typeof dataBase64 !== 'string' || !dataBase64.trim()) {
    return res.status(400).json({ error: 'Image payload is empty.' })
  }

  let fileBuffer: Buffer
  try {
    fileBuffer = Buffer.from(dataBase64, 'base64')
  } catch {
    return res.status(400).json({ error: 'Invalid base64 payload.' })
  }

  if (!fileBuffer.length) {
    return res.status(400).json({ error: 'Image payload is empty.' })
  }

  if (fileBuffer.length > MAX_BYTES) {
    return res.status(413).json({ error: 'Image exceeds max size of 5 MB.' })
  }

  try {
    const safeFilename = normalizeFilename(filename)
    const ext = resolveExtension(safeFilename, mimeType)
    const basename = safeFilename.replace(/\.[^.]+$/, '')
    const objectName = `product-images/${Date.now()}-${basename}${ext}`

    console.log('[api/uploads] bucket env check', {
      hasImageUploadBucket: !!process.env.IMAGE_UPLOAD_BUCKET,
      hasFirebaseStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
      imageUploadBucketName: process.env.IMAGE_UPLOAD_BUCKET || null,
      firebaseStorageBucketName: process.env.FIREBASE_STORAGE_BUCKET || null,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,
    })

    const adminApp = getAdmin()
    const configuredBucket =
      process.env.IMAGE_UPLOAD_BUCKET || process.env.FIREBASE_STORAGE_BUCKET

    if (!configuredBucket || typeof configuredBucket !== 'string') {
      return res.status(500).json({
        error: 'IMAGE_UPLOAD_BUCKET is not configured for image uploads.',
      })
    }

    const bucket = getStorage(adminApp).bucket(configuredBucket)
    const file = bucket.file(objectName)

    await file.save(fileBuffer, {
      resumable: false,
      metadata: {
        contentType: mimeType, // moved inside metadata
        cacheControl: 'public,max-age=31536000,immutable',
      },
    })

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURI(objectName)}`
    return res.status(201).json({ url: publicUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error('[api/uploads] upload failed', {
      message,
      stack: error instanceof Error ? error.stack : null,
      hasImageUploadBucket: !!process.env.IMAGE_UPLOAD_BUCKET,
      hasFirebaseStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
      imageUploadBucketName: process.env.IMAGE_UPLOAD_BUCKET || null,
      firebaseStorageBucketName: process.env.FIREBASE_STORAGE_BUCKET || null,
      hasAdminServiceAccountJson: !!process.env.ADMIN_SERVICE_ACCOUNT_JSON,
      hasFirebaseServiceAccountJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      hasFirebaseServiceAccountBase64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,
    })

    return res.status(500).json({
      error: `Failed to store image: ${message}`,
    })
  }
}
