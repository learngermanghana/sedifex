export const MAX_ITEM_IMAGES = 10

function cleanImageUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeItemImages(primaryImageUrl: unknown, imageUrls: unknown): string[] {
  const candidates = [
    cleanImageUrl(primaryImageUrl),
    ...(Array.isArray(imageUrls) ? imageUrls.map(cleanImageUrl) : []),
  ].filter(Boolean)

  return Array.from(new Set(candidates)).slice(0, MAX_ITEM_IMAGES)
}

export function setItemCoverImage(images: string[], imageUrl: string): string[] {
  const normalized = normalizeItemImages('', images)
  const target = cleanImageUrl(imageUrl)
  if (!target) return normalized
  return [target, ...normalized.filter(image => image !== target)].slice(0, MAX_ITEM_IMAGES)
}

export function removeItemImage(images: string[], imageUrl: string): string[] {
  const target = cleanImageUrl(imageUrl)
  return normalizeItemImages('', images).filter(image => image !== target)
}

export function moveItemImage(images: string[], imageUrl: string, direction: -1 | 1): string[] {
  const normalized = normalizeItemImages('', images)
  const index = normalized.indexOf(cleanImageUrl(imageUrl))
  const nextIndex = index + direction

  if (index < 0 || nextIndex < 0 || nextIndex >= normalized.length) return normalized

  const next = [...normalized]
  const [moved] = next.splice(index, 1)
  next.splice(nextIndex, 0, moved)
  return next
}
