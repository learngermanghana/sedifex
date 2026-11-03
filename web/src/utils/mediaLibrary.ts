export const MEDIA_BATCH_LIMIT = 100
export const MEDIA_IMPORT_CONCURRENCY = 3
export const MEDIA_MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const MEDIA_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export function validateMediaFile(file: File): string | null {
  if (!MEDIA_ALLOWED_TYPES.has(file.type)) {
    return 'Only JPEG, PNG, WebP and AVIF photos are supported.'
  }
  if (file.size === 0) return 'The picture is empty.'
  if (file.size > MEDIA_MAX_SOURCE_BYTES) return 'Picture exceeds the 25 MB import limit.'
  return null
}

export async function optimizeMediaFile(file: File): Promise<File> {
  const error = validateMediaFile(file)
  if (error) throw new Error(error)

  // Do the resize in the browser so the original never has to cross our server.
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1920 / Math.max(image.width, image.height))
    if (scale === 1 && file.size <= 700_000) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot process photos.')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.8))
    if (!blob || blob.type !== 'image/webp' || blob.size === 0) return file
    if (blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
      type: 'image/webp',
      lastModified: file.lastModified,
    })
  } finally {
    image.close()
  }
}

export async function mediaSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export function mediaFileExtension(file: File): string {
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/avif') return '.avif'
  return '.jpg'
}

export function isTransientUploadError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status === undefined || status === 408 || status === 429 || status >= 500
}

export async function uploadWithRetry<T>(upload: () => Promise<T>, shouldRetry = isTransientUploadError, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await upload()
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1 || !shouldRetry(error)) break
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)))
    }
  }
  throw lastError
}
