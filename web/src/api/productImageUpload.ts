const DEFAULT_UPLOAD_ENDPOINT = '/api/uploads'
const MAX_SAFE_REQUEST_BYTES = 3 * 1024 * 1024

const JPEG_MIME_TYPE = 'image/jpeg'

type UploadResponse = {
  url?: string
  error?: string
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

async function readFileAsBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
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
    'Image is too large to upload. Please choose a smaller file (about 3 MB or less).',
    {
      endpoint: resolveUploadEndpoint(),
      isNetworkError: false,
    },
  )
}

export async function uploadProductImage(file: File): Promise<string> {
  const endpoint = resolveUploadEndpoint()
  const uploadFile = await createUploadCandidate(file)
  const dataBase64 = await readFileAsBase64(uploadFile)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: uploadFile.name,
        mimeType: uploadFile.type,
        dataBase64,
      }),
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
