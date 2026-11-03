/** Public gallery aliases deliberately expose only records from published sites. */
export type PublicStoreRecord = { id: string; data: Record<string, unknown> }
export type PublicGalleryAlias = 'promoSlug' | 'siteSlug'

export function normalizePublicGalleryAlias(value: unknown): string {
  if (typeof value !== 'string') return ''
  const slug = value.trim().toLowerCase()
  return slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : ''
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

export function matchPublicGalleryStore(
  records: PublicStoreRecord[],
  aliasType: PublicGalleryAlias,
  slug: string,
): string | null {
  const matches: string[] = []
  for (const row of records) {
    if (aliasType === 'promoSlug') {
      if (row.data.promoSlug !== slug || row.data.promoEnabled !== true) continue
      matches.push(row.id)
    } else {
      const builder = objectValue(row.data.websiteBuilder)
      if (builder.slug !== slug || builder.status !== 'published') continue
      // Mirror the existing public site resolver (websiteBuilder.storeId || settings document ID).
      const selected = typeof builder.storeId === 'string' && builder.storeId.trim()
        ? builder.storeId.trim() : row.id
      // Public aliases cannot be redirected to another store by changing
      // websiteBuilder.storeId. The settings document must own the target store.
      if (!selected || selected !== row.id || selected.includes('/')) continue
      matches.push(selected)
    }
  }
  // Do not guess a store when public aliases accidentally collide.
  return matches.length === 1 ? matches[0] : null
}
