import * as admin from 'firebase-admin'

function isTimestampLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    toDate?: unknown
    seconds?: unknown
    nanoseconds?: unknown
    _seconds?: unknown
    _nanoseconds?: unknown
  }

  return (
    typeof candidate.toDate === 'function'
    || (typeof candidate.seconds === 'number' && typeof candidate.nanoseconds === 'number')
    || (typeof candidate._seconds === 'number' && typeof candidate._nanoseconds === 'number')
  )
}

export function resolvePublicationTimestampCandidate(...candidates: unknown[]): unknown {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue

    if (isTimestampLike(candidate)) return candidate

    if (candidate instanceof Date) {
      if (!Number.isNaN(candidate.getTime())) return candidate
      continue
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (!trimmed) continue
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) return trimmed
    }
  }

  try {
    if (admin?.firestore?.FieldValue?.serverTimestamp) {
      return admin.firestore.FieldValue.serverTimestamp()
    }
  } catch {
    return null
  }

  return null
}

export function normalizeCatalogPublicationFields(
  source: Record<string, unknown>,
  options: { fallbackCreatedAt?: unknown; fallbackUpdatedAt?: unknown } = {},
): { updates: Record<string, unknown>; removeUnpublishedAt: boolean; repairedPublishedProduct: boolean } {
  const isPublishedValue = source.isPublished
  if (isPublishedValue !== true && isPublishedValue !== false) {
    return { updates: {}, removeUnpublishedAt: false, repairedPublishedProduct: false }
  }

  if (isPublishedValue === true) {
    const publishedAt = resolvePublicationTimestampCandidate(
      source.publishedAt,
      source.createdAt,
      options.fallbackCreatedAt,
      source.updatedAt,
      options.fallbackUpdatedAt,
    )
    const hasUnpublishedAt = source.unpublishedAt !== undefined && source.unpublishedAt !== null
    return {
      updates: {
        isPublished: true,
        publishedAt,
      },
      removeUnpublishedAt: hasUnpublishedAt,
      repairedPublishedProduct: hasUnpublishedAt,
    }
  }

  return {
    updates: {
      isPublished: false,
      unpublishedAt: resolvePublicationTimestampCandidate(
        source.unpublishedAt,
        source.updatedAt,
        options.fallbackUpdatedAt,
        source.createdAt,
        options.fallbackCreatedAt,
      ),
    },
    removeUnpublishedAt: false,
    repairedPublishedProduct: false,
  }
}
