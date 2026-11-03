/**
 * Pure normalization for the public website gallery API.
 *
 * Never return hidden albums, hidden photos or raw Firestore documents to an
 * integration consumer. Keeping this separate makes publication rules testable.
 */
export type GallerySourceDocument = {
  id: string
  data: Record<string, unknown>
}

export type GalleryImage = {
  id: string
  albumId: string
  albumTitle: string
  url: string
  alt: string | null
  caption: string | null
  isPublished: true
  sortOrder: number
  updatedAt: string | null
}

export type GalleryAlbum = {
  id: string
  title: string
  description: string | null
  coverImageUrl: string | null
  isPublished: true
  sortOrder: number
  updatedAt: string | null
  images: GalleryImage[]
}

export type GalleryResult = {
  albums: GalleryAlbum[]
  gallery: GalleryImage[]
  count: number
  truncated: boolean
}

function safeText(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeUrl(value: unknown): string | null {
  const raw = safeText(value, 2000)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : null
  } catch {
    return null
  }
}

function orderValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value : Number.MAX_SAFE_INTEGER
}

function updatedAt(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number }
  if (typeof timestamp.toDate === 'function') {
    const parsed = timestamp.toDate()
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const seconds = timestamp.seconds ?? timestamp._seconds
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString()
  return null
}

export function buildPublicGallery(
  albumRecords: GallerySourceDocument[],
  imageRecords: GallerySourceDocument[],
  options: { albumId?: string; limit: number; sourceTruncated?: boolean },
): GalleryResult {
  const albums: GalleryAlbum[] = albumRecords
    .filter(item => item.data.isPublished !== false)
    .filter(item => !options.albumId || item.id === options.albumId)
    .map(item => ({
      id: item.id,
      title: safeText(item.data.title, 200) || 'Gallery',
      description: safeText(item.data.description, 800) || null,
      coverImageUrl: safeUrl(item.data.coverImageUrl),
      isPublished: true as const,
      sortOrder: orderValue(item.data.sortOrder),
      updatedAt: updatedAt(item.data.updatedAt),
      images: [],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))

  const albumById = new Map(albums.map(album => [album.id, album]))
  const imagesByAlbum = new Map<string, GalleryImage[]>()

  for (const item of imageRecords) {
    if (item.data.isPublished === false) continue
    const albumId = safeText(item.data.albumId, 180)
    const album = albumById.get(albumId)
    const url = safeUrl(item.data.url)
    if (!album || !url) continue
    const image: GalleryImage = {
      id: item.id,
      albumId,
      albumTitle: album.title,
      url,
      alt: safeText(item.data.alt, 240) || null,
      caption: safeText(item.data.caption, 500) || null,
      isPublished: true,
      sortOrder: orderValue(item.data.sortOrder),
      updatedAt: updatedAt(item.data.updatedAt),
    }
    const group = imagesByAlbum.get(albumId) ?? []
    group.push(image)
    imagesByAlbum.set(albumId, group)
  }

  const flattened: GalleryImage[] = []
  for (const album of albums) {
    const sorted = (imagesByAlbum.get(album.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    flattened.push(...sorted)
  }

  const selected = flattened.slice(0, options.limit)
  const selectedUrls = new Map<string, Set<string>>()
  for (const image of selected) {
    const urls = selectedUrls.get(image.albumId) ?? new Set<string>()
    urls.add(image.url)
    selectedUrls.set(image.albumId, urls)
  }

  const outputAlbums = albums.reduce<GalleryAlbum[]>((acc, album) => {
    const selectedImages = selected.filter(image => image.albumId === album.id)
    if (!selectedImages.length) return acc
    const validCover = album.coverImageUrl && selectedUrls.get(album.id)?.has(album.coverImageUrl)
      ? album.coverImageUrl
      : selectedImages[0].url
    acc.push({ ...album, coverImageUrl: validCover, images: selectedImages })
    return acc
  }, [])

  return {
    albums: outputAlbums,
    gallery: selected,
    count: selected.length,
    truncated: Boolean(options.sourceTruncated || flattened.length > options.limit),
  }
}
