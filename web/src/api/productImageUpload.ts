const DEFAULT_UPLOAD_ENDPOINT = '/api/uploads'

type UploadResponse = {
  url?: string
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

  const response = await fetch(endpoint, {
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

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }

  const payload = (await response.json()) as UploadResponse
  if (!payload.url || typeof payload.url !== 'string') {
    throw new Error('Upload succeeded but no URL was returned.')
  }

  return payload.url
}
