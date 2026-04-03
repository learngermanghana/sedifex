const DEFAULT_UPLOAD_ENDPOINT = '/api/uploads'

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

export async function uploadProductImage(file: File): Promise<string> {
  const endpoint = resolveUploadEndpoint()
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  const dataBase64 = btoa(binary)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
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
