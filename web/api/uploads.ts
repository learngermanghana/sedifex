import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStorage } from 'firebase-admin/storage'
import { getAdmin } from './_firebase-admin.js'

const MAX_BYTES = 5 * 1024 * 1024

type UploadRequestBody = {
  filename?: unknown
  mimeType?: unknown
  dataBase64?: unknown
  storagePath?: unknown
  url?: unknown
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

function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^\/+/, '')
  if (!trimmed) return null
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(trimmed)) return null
  if (trimmed.includes('..')) return null
  return trimmed
}

function extractObjectPathFromUrl(urlValue: unknown, bucketName: string): string | null {
  if (typeof urlValue !== 'string' || !urlValue.trim()) return null

  let parsed: URL
  try {
    parsed = new URL(urlValue.trim())
  } catch {
    return null
  }

  if (parsed.hostname !== 'storage.googleapis.com') return null

  const [bucketSegment, ...pathSegments] = parsed.pathname.replace(/^\/+/, '').split('/')
  if (!bucketSegment || bucketSegment !== bucketName) return null
  if (!pathSegments.length) return null

  const decoded = decodeURIComponent(pathSegments.join('/'))
  return normalizeStoragePath(decoded)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed. Use POST or DELETE.' })
  }

  const adminApp = getAdmin()
  const configuredBucket =
    process.env.IMAGE_UPLOAD_BUCKET || process.env.FIREBASE_STORAGE_BUCKET

  if (!configuredBucket || typeof configuredBucket !== 'string') {
    return res.status(500).json({
      error: 'IMAGE_UPLOAD_BUCKET is not configured for image uploads.',
    })
  }

  const bucket = getStorage(adminApp).bucket(configuredBucket)

  if (req.method === 'DELETE') {
    const objectPath = extractObjectPathFromUrl((req.body || {}).url, bucket.name)
    if (!objectPath) {
      return res.status(400).json({ error: 'A valid storage.googleapis.com image URL is required.' })
    }

    try {
      await bucket.file(objectPath).delete({ ignoreNotFound: true })
      return res.status(200).json({ deleted: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return res.status(500).json({ error: `Failed to delete image: ${message}` })
    }
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
    const basename = safeFilename.replace(/\.(jpe?g|png|webp|gif|avif|svg)$/i, '')
    const ext = resolveExtension(safeFilename, mimeType)
    const explicitStoragePath = normalizeStoragePath((req.body || {}).storagePath)
    const objectName = explicitStoragePath || `product-images/${Date.now()}-${basename}${ext}`

    console.log('[api/uploads] bucket env check', {
      hasImageUploadBucket: !!process.env.IMAGE_UPLOAD_BUCKET,
      hasFirebaseStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
      imageUploadBucketName: process.env.IMAGE_UPLOAD_BUCKET || null,
      firebaseStorageBucketName: process.env.FIREBASE_STORAGE_BUCKET || null,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,
    })

    const file = bucket.file(objectName)

    if (explicitStoragePath) {
      await file.delete({ ignoreNotFound: true })
    }

    await file.save(fileBuffer, {
      resumable: false,
      metadata: {
        contentType: mimeType, // moved inside metadata
        cacheControl: explicitStoragePath
          ? 'no-cache,max-age=0,must-revalidate'
          : 'public,max-age=31536000,immutable',
      },
    })

    const basePublicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURI(objectName)}`
    const publicUrl = explicitStoragePath ? `${basePublicUrl}?v=${Date.now()}` : basePublicUrl
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
