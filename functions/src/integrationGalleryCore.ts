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

export const LEGACY_PROMO_ALBUM_ID = 'legacy-promo-gallery'

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
  options: { albumId?: string; limit: number; sourceTruncated?: boolean; legacyRecords?: GallerySourceDocument[] },
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

  // Legacy promotional galleries remain part of the same website response.
  // Don't rewrite or copy those files: retain the existing Firestore records.
  // When no albumId is specified, include a synthetic album for old photos.
  const includeLegacy = !options.albumId || options.albumId === LEGACY_PROMO_ALBUM_ID
  const legacyRecords = includeLegacy ? options.legacyRecords ?? [] : []
  const visibleLegacy = legacyRecords.filter(item =>
    item.data.isPublished !== false && safeUrl(item.data.url ?? item.data.imageUrl ?? item.data.image_url ?? item.data.image ?? item.data.photoUrl))
  if (visibleLegacy.length && !albums.some(album => album.id === LEGACY_PROMO_ALBUM_ID)) {
    albums.unshift({
      id: LEGACY_PROMO_ALBUM_ID,
      title: 'Gallery',
      description: null,
      coverImageUrl: null,
      isPublished: true,
      sortOrder: -1,
      updatedAt: null,
      images: [],
    })
  }
  const albumById = new Map(albums.map(album => [album.id, album]))
  const imagesByAlbum = new Map<string, GalleryImage[]>()

  if (albumById.has(LEGACY_PROMO_ALBUM_ID) && includeLegacy) {
    for (const item of visibleLegacy) {
      const data = item.data
      const url = safeUrl(data.url ?? data.imageUrl ?? data.image_url ?? data.image ?? data.photoUrl)
      if (!url) continue
      const group = imagesByAlbum.get(LEGACY_PROMO_ALBUM_ID) ?? []
      group.push({
        id: 'legacy:' + item.id,
        albumId: LEGACY_PROMO_ALBUM_ID,
        albumTitle: 'Gallery',
        url,
        alt: safeText(data.alt ?? data.imageAlt, 240) || null,
        caption: safeText(data.caption ?? data.title ?? data.description, 500) || null,
        isPublished: true,
        sortOrder: orderValue(data.sortOrder),
        updatedAt: updatedAt(data.updatedAt),
      })
      imagesByAlbum.set(LEGACY_PROMO_ALBUM_ID, group)
    }
  }

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

  // The grouped albums keep intentionally reused pictures in each album.
  // The flat homepage gallery deduplicates URLs to avoid double-display.
  const displayed = flattened.slice(0, options.limit)
  const selected: GalleryImage[] = []
  const seenUrls = new Set<string>()
  for (const photo of displayed) {
    if (seenUrls.has(photo.url)) continue
    seenUrls.add(photo.url)
    selected.push(photo)
  }
  const selectedUrls = new Map<string, Set<string>>()
  for (const image of displayed) {
    const urls = selectedUrls.get(image.albumId) ?? new Set<string>()
    urls.add(image.url)
    selectedUrls.set(image.albumId, urls)
  }

  const outputAlbums = albums.reduce<GalleryAlbum[]>((acc, album) => {
    const selectedImages = displayed.filter(image => image.albumId === album.id)
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
