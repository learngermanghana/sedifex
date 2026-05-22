const DEFAULT_UPLOAD_ENDPOINT = '/api/uploads'
const MAX_SAFE_REQUEST_BYTES = 5 * 1024 * 1024
const MAX_SAFE_REQUEST_SIZE_LABEL = '5 MB (5,242,880 bytes)'

const JPEG_MIME_TYPE = 'image/jpeg'

type UploadResponse = {
  url?: string
  error?: string
}

type DeleteUploadResponse = {
  deleted?: boolean
  error?: string
}

export type UploadImageOptions = {
  storagePath?: string
}

export class ProductImageUploadError extends Error {
  endpoint: string
  status?: number
  isNetworkError: boolean

  constructor(message: string, options: { endpoint: string; status?: number; isNetworkError: boolean }) {
    super(message)
    this.name = 'ProductImageUploadError'
    this.endpoint = options.endpoint
    this.status = options.status
    this.isNetworkError = options.isNetworkError
  }
}

function resolveUploadEndpoint(): string {
  const configured = import.meta.env.VITE_UPLOAD_API_URL
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  return DEFAULT_UPLOAD_ENDPOINT
}

function resolveFileExtension(file: File): string {
  const fromName = file.name.match(/\.([a-zA-Z0-9_-]{1,10})$/)?.[0]
  if (fromName) return fromName.toLowerCase()

  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/gif') return '.gif'
  if (file.type === 'image/avif') return '.avif'
  if (file.type === 'image/svg+xml') return '.svg'
  return '.jpg'
}

function normalizeStoragePath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
}

function storagePathLooksLikeFile(value: string): boolean {
  const lastSegment = value.split('/').pop() ?? ''
  return /\.[a-zA-Z0-9_-]{1,10}$/.test(lastSegment)
}

function safePathSegment(value: string): string {
  const cleaned = value.trim().replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
  return cleaned.replace(/^_+|_+$/g, '') || 'upload'
}

function randomUploadSuffix(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function resolveStoragePathForUpload(storagePath: string | undefined, file: File): string | undefined {
  if (!storagePath || !storagePath.trim()) return undefined

  const normalized = normalizeStoragePath(storagePath)
  if (!normalized) return undefined

  // When callers pass a folder such as stores/{storeId}/products, create a unique
  // object inside that folder. Without this, every upload saves to the same object
  // and new course/product photos overwrite older ones.
  if (!storagePathLooksLikeFile(normalized)) {
    const baseName = safePathSegment(file.name)
    const extension = resolveFileExtension(file)
    return `${normalized}/${Date.now()}-${randomUploadSuffix()}-${baseName}${extension}`
  }

  return normalized
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Unable to decode image data.'))
      nextImage.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), JPEG_MIME_TYPE, quality)
  })
}

async function createUploadCandidate(file: File): Promise<File> {
  if (file.size <= MAX_SAFE_REQUEST_BYTES) return file

  const image = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')

  let width = image.naturalWidth
  let height = image.naturalHeight

  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new ProductImageUploadError('Unable to process image in this browser.', {
      endpoint: resolveUploadEndpoint(),
      isNetworkError: false,
    })
  }

  const qualities = [0.9, 0.8, 0.7, 0.6, 0.5]
  const scales = [1, 0.9, 0.8, 0.7, 0.6]

  for (const scale of scales) {
    width = Math.max(1, Math.floor(image.naturalWidth * scale))
    height = Math.max(1, Math.floor(image.naturalHeight * scale))
    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    for (const quality of qualities) {
      const blob = await canvasToJpegBlob(canvas, quality)
      if (!blob) continue
      if (blob.size <= MAX_SAFE_REQUEST_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, '')
        return new File([blob], `${baseName || 'upload'}.jpg`, {
          type: JPEG_MIME_TYPE,
          lastModified: Date.now(),
        })
      }
    }
  }

  throw new ProductImageUploadError(
    `Image is too large to upload. Maximum allowed upload size is ${MAX_SAFE_REQUEST_SIZE_LABEL}. Please resize or compress the image and try again.`,
    {
      endpoint: resolveUploadEndpoint(),
      isNetworkError: false,
    },
  )
}

export async function uploadProductImage(file: File, options: UploadImageOptions = {}): Promise<string> {
  const endpoint = resolveUploadEndpoint()
  const uploadFile = await createUploadCandidate(file)
  const resolvedStoragePath = resolveStoragePathForUpload(options.storagePath, uploadFile)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': uploadFile.type || 'application/octet-stream',
        'X-Upload-Filename': encodeURIComponent(uploadFile.name),
        'X-Upload-MimeType': uploadFile.type || 'application/octet-stream',
        ...(resolvedStoragePath
          ? { 'X-Upload-Storage-Path': encodeURIComponent(resolvedStoragePath) }
          : {}),
      },
      body: uploadFile,
    })
  } catch (error) {
    throw new ProductImageUploadError(
      `Network error while uploading to ${endpoint}. Check connectivity and same-origin API deployment.`,
      {
        endpoint,
        isNetworkError: true,
      },
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as UploadResponse
      if (payload?.error) detail = `: ${payload.error}`
    } catch {
      // ignore JSON parse errors and use status only
    }

    throw new ProductImageUploadError(
      `Upload failed at ${endpoint} with HTTP ${response.status}${detail}`,
      {
        endpoint,
        status: response.status,
        isNetworkError: false,
      },
    )
  }

  const payload = (await response.json()) as UploadResponse
  if (!payload.url || typeof payload.url !== 'string') {
    throw new ProductImageUploadError(`Upload succeeded at ${endpoint} but no URL was returned.`, {
      endpoint,
      isNetworkError: false,
    })
  }

  return payload.url
}

export async function deleteUploadedImageByUrl(url: string): Promise<void> {
  const endpoint = resolveUploadEndpoint()
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as DeleteUploadResponse
      if (payload?.error) detail = `: ${payload.error}`
    } catch {
      // ignore JSON parse errors and use status only
    }
    throw new ProductImageUploadError(
      `Image deletion failed at ${endpoint} with HTTP ${response.status}${detail}`,
      {
        endpoint,
        status: response.status,
        isNetworkError: false,
      },
    )
  }
}
