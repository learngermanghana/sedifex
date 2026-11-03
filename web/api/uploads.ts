import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdmin } from './_firebase-admin.js'

const MAX_BYTES = 5 * 1024 * 1024
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
])

type UploadRequestBody = {
  filename?: unknown
  mimeType?: unknown
  dataBase64?: unknown
  storagePath?: unknown
  url?: unknown
}

async function authorizeStoreMediaUpload(app: ReturnType<typeof getAdmin>, objectName: string, header: unknown): Promise<401 | 403 | null> {
  const match = /^stores\/([^/]+)\/media\//.exec(objectName)
  if (!match) return null // Legacy routes retain existing behavior.
  const authorization = typeof header === 'string' ? header : ''
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
  if (!token) return 401

  let uid: string
  try {
    const verified = await getAuth(app).verifyIdToken(token)
    uid = verified.uid
  } catch {
    return 401
  }

  const firestore = getFirestore(app)
  const member = await firestore.collection('teamMembers').doc(uid).get()
  const memberData = member.data()
  if (!member.exists || memberData?.uid !== uid) return 403

  const targetStoreId = match[1]
  if (memberData?.storeId === targetStoreId) return null
  if (memberData?.role !== 'owner' || !memberData?.storeId) return 403

  const store = await firestore.collection('stores').doc(targetStoreId).get()
  return store.exists && store.data()?.parentStoreId === memberData.storeId ? null : 403
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

function readHeaderString(header: unknown): string | null {
  if (Array.isArray(header)) return null
  if (typeof header !== 'string') return null
  const trimmed = header.trim()
  if (!trimmed) return null
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
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

function detectImageMimeType(buffer: Buffer): string | null {
  if (!buffer.length) return null

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    buffer.length >= 6 &&
    String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3], buffer[4], buffer[5]) === 'GIF87a'
  ) {
    return 'image/gif'
  }
  if (
    buffer.length >= 6 &&
    String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3], buffer[4], buffer[5]) === 'GIF89a'
  ) {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70 &&
    buffer[8] === 0x61 &&
    buffer[9] === 0x76 &&
    buffer[10] === 0x69 &&
    buffer[11] === 0x66
  ) {
    return 'image/avif'
  }

  const header = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart().toLowerCase()
  if (header.startsWith('<svg') || header.startsWith('<?xml')) return 'image/svg+xml'

  return null
}

function isSvgPayloadSafe(buffer: Buffer): boolean {
  const text = buffer.toString('utf8')
  const normalized = text.toLowerCase()
  if (/<script[\s>]/.test(normalized)) return false
  if (/\bon\w+\s*=/.test(normalized)) return false
  if (/(href|xlink:href)\s*=\s*['"]\s*javascript:/i.test(text)) return false
  return true
}

function emitUploadMetric(event: string, fields: Record<string, unknown>) {
  console.info(
    '[api/uploads][metric]',
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...fields,
    }),
  )
}

function toBufferPayload(value: unknown): Buffer | null {
  if (!value) return null
  if (value instanceof Buffer) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (typeof value === 'object' && value !== null) {
    const maybeNodeBufferShape = value as { type?: unknown; data?: unknown }
    if (
      maybeNodeBufferShape.type === 'Buffer' &&
      Array.isArray(maybeNodeBufferShape.data) &&
      maybeNodeBufferShape.data.every(item => typeof item === 'number')
    ) {
      return Buffer.from(maybeNodeBufferShape.data)
    }
  }
  if (typeof value === 'string') return Buffer.from(value, 'binary')
  return null
}

async function readBinaryBodyFromStream(req: VercelRequest): Promise<Buffer | null> {
  const streamReq = req as unknown as NodeJS.ReadableStream & { readableEnded?: boolean }
  if (!streamReq || typeof streamReq.on !== 'function') return null
  if (streamReq.readableEnded) return null

  const chunks: Buffer[] = []
  return new Promise(resolve => {
    let settled = false

    const finalize = (buffer: Buffer | null) => {
      if (settled) return
      settled = true
      resolve(buffer)
    }

    streamReq.on('data', chunk => {
      const bufferChunk = toBufferPayload(chunk)
      if (bufferChunk && bufferChunk.length) chunks.push(bufferChunk)
    })
    streamReq.on('end', () => {
      if (!chunks.length) return finalize(null)
      finalize(Buffer.concat(chunks))
    })
    streamReq.on('error', () => finalize(null))
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestStart = Date.now()
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
      emitUploadMetric('delete_validation_error', {
        bucket: bucket.name,
        latencyMs: Date.now() - requestStart,
      })
      return res.status(400).json({ error: 'A valid storage.googleapis.com image URL is required.' })
    }

    const accessError = await authorizeStoreMediaUpload(adminApp, objectPath, req.headers?.authorization)
    if (accessError) return res.status(accessError).json({ error: 'Not authorized to delete this store media.' })

    try {
      await bucket.file(objectPath).delete({ ignoreNotFound: true })
      emitUploadMetric('delete_success', {
        bucket: bucket.name,
        latencyMs: Date.now() - requestStart,
      })
      return res.status(200).json({ deleted: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitUploadMetric('delete_failure', {
        bucket: bucket.name,
        latencyMs: Date.now() - requestStart,
        errorMessage: message,
      })
      return res.status(500).json({ error: `Failed to delete image: ${message}` })
    }
  }

  const isLegacyJsonPayload = req.headers?.['content-type']?.includes('application/json')
  let filename: unknown
  let mimeType: unknown
  let storagePath: unknown
  let fileBuffer: Buffer

  if (isLegacyJsonPayload) {
    const body = (req.body || {}) as UploadRequestBody
    filename = body.filename
    mimeType = body.mimeType
    storagePath = body.storagePath

    const dataBase64 = body.dataBase64
    if (typeof dataBase64 !== 'string' || !dataBase64.trim()) {
      return res.status(400).json({ error: 'Image payload is empty.' })
    }
    try {
      fileBuffer = Buffer.from(dataBase64, 'base64')
    } catch {
      return res.status(400).json({ error: 'Invalid base64 payload.' })
    }
  } else {
    filename = readHeaderString(req.headers?.['x-upload-filename']) || 'upload'
    mimeType = readHeaderString(req.headers?.['x-upload-mimetype']) || req.headers?.['content-type'] || ''
    storagePath = readHeaderString(req.headers?.['x-upload-storage-path'])
    const binaryPayload =
      toBufferPayload(req.body) ||
      toBufferPayload((req as unknown as { rawBody?: unknown }).rawBody) ||
      (await readBinaryBodyFromStream(req))
    if (!binaryPayload) {
      return res.status(400).json({ error: 'Binary image payload is empty.' })
    }
    fileBuffer = binaryPayload
  }

  if (!fileBuffer.length) {
    return res.status(400).json({ error: 'Image payload is empty.' })
  }

  if (fileBuffer.length > MAX_BYTES) {
    emitUploadMetric('upload_rejected_size_limit', {
      bucket: bucket.name,
      sizeBytes: fileBuffer.length,
      latencyMs: Date.now() - requestStart,
      transport: isLegacyJsonPayload ? 'base64-json' : 'binary',
    })
    return res.status(413).json({ error: 'Image exceeds max size of 5 MB.' })
  }

  const detectedMimeType = detectImageMimeType(fileBuffer)
  const requestedMimeType =
    typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : ''

  if (!detectedMimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    emitUploadMetric('upload_rejected_invalid_content', {
      bucket: bucket.name,
      requestedMimeType,
      detectedMimeType,
      sizeBytes: fileBuffer.length,
      latencyMs: Date.now() - requestStart,
    })
    return res.status(400).json({ error: 'Unsupported or invalid image file content.' })
  }

  if (requestedMimeType && requestedMimeType !== detectedMimeType) {
    emitUploadMetric('upload_rejected_mime_mismatch', {
      bucket: bucket.name,
      requestedMimeType,
      detectedMimeType,
      sizeBytes: fileBuffer.length,
      latencyMs: Date.now() - requestStart,
    })
    return res.status(400).json({ error: 'MIME type does not match uploaded file content.' })
  }

  if (detectedMimeType === 'image/svg+xml' && !isSvgPayloadSafe(fileBuffer)) {
    emitUploadMetric('upload_rejected_svg_security', {
      bucket: bucket.name,
      sizeBytes: fileBuffer.length,
      latencyMs: Date.now() - requestStart,
    })
    return res.status(400).json({ error: 'SVG contains unsupported active content.' })
  }

  try {
    const safeFilename = normalizeFilename(filename)
    const basename = safeFilename.replace(/\.(jpe?g|png|webp|gif|avif|svg)$/i, '') || 'upload'
    const ext = resolveExtension(safeFilename, detectedMimeType)
    const explicitStoragePath = normalizeStoragePath(storagePath)
    const objectName = explicitStoragePath || `product-images/${Date.now()}-${basename}${ext}`

    const accessError = await authorizeStoreMediaUpload(adminApp, objectName, req.headers?.authorization)
    if (accessError) {
      emitUploadMetric('media_upload_access_denied', { latencyMs: Date.now() - requestStart, status: accessError })
      return res.status(accessError).json({ error: accessError === 401 ? 'Sign in to upload media.' : 'No access to this store.' })
    }

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
        contentType: detectedMimeType,
        cacheControl: explicitStoragePath
          ? 'no-cache,max-age=0,must-revalidate'
          : 'public,max-age=31536000,immutable',
      },
    })

    const basePublicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURI(objectName)}`
    const publicUrl = explicitStoragePath ? `${basePublicUrl}?v=${Date.now()}` : basePublicUrl
    emitUploadMetric('upload_success', {
      bucket: bucket.name,
      storagePath: objectName,
      sizeBytes: fileBuffer.length,
      mimeType: detectedMimeType,
      latencyMs: Date.now() - requestStart,
      transport: isLegacyJsonPayload ? 'base64-json' : 'binary',
      isStablePath: !!explicitStoragePath,
    })
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
    emitUploadMetric('upload_failure', {
      bucket: bucket.name,
      sizeBytes: fileBuffer.length,
      latencyMs: Date.now() - requestStart,
      requestedMimeType,
      errorMessage: message,
      transport: isLegacyJsonPayload ? 'base64-json' : 'binary',
    })

    return res.status(500).json({
      error: `Failed to store image: ${message}`,
    })
  }
}
