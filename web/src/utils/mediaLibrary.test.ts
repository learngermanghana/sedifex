import { describe, expect, it, vi } from 'vitest'
import {
  MEDIA_BATCH_LIMIT, MEDIA_IMPORT_CONCURRENCY, mediaFileExtension,
  validateMediaFile, isTransientUploadError, uploadWithRetry,
} from './mediaLibrary'

describe('media library import guards', () => {
  it('limits a batch and concurrent requests', () => {
    expect(MEDIA_BATCH_LIMIT).toBe(100)
    expect(MEDIA_IMPORT_CONCURRENCY).toBe(3)
  })

  it('rejects non-image and oversized imports before uploading', () => {
    expect(validateMediaFile({ type: 'application/pdf', size: 200 } as File)).toMatch(/JPEG/)
    expect(validateMediaFile({ type: 'image/jpeg', size: 0 } as File)).toMatch(/empty/)
    expect(validateMediaFile({ type: 'image/jpeg', size: 30 * 1024 * 1024 } as File)).toMatch(/25 MB/)
    expect(validateMediaFile({ type: 'image/png', size: 250000 } as File)).toBeNull()
  })

  it('chooses correct output storage extensions', () => {
    expect(mediaFileExtension({ type: 'image/webp' } as File)).toBe('.webp')
    expect(mediaFileExtension({ type: 'image/jpeg' } as File)).toBe('.jpg')
    expect(mediaFileExtension({ type: 'image/png' } as File)).toBe('.png')
  })

  it('only retries transient upload failures', () => {
    expect(isTransientUploadError({ status: 413 })).toBe(false)
    expect(isTransientUploadError({ status: 401 })).toBe(false)
    expect(isTransientUploadError({ status: 429 })).toBe(true)
    expect(isTransientUploadError({ status: 503 })).toBe(true)
  })

  it('retries transient upload failure and returns successful URL', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('https://example.com/photo.webp')
    await expect(uploadWithRetry(upload)).resolves.toBe('https://example.com/photo.webp')
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent errors', async () => {
    const upload = vi.fn().mockRejectedValue({ status: 413 })
    await expect(uploadWithRetry(upload)).rejects.toEqual({ status: 413 })
    expect(upload).toHaveBeenCalledTimes(1)
  })
})
