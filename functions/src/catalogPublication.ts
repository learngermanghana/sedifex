import * as admin from 'firebase-admin'

function isTimestampLike(value: unknown): boolean {
  return (
    value instanceof admin.firestore.Timestamp ||
    (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function')
  )
}

export function resolvePublicationTimestampCandidate(...candidates: unknown[]): unknown {
  for (const candidate of candidates) {
    if (isTimestampLike(candidate) || typeof candidate === 'string') return candidate
  }
  return admin.firestore.FieldValue.serverTimestamp()
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
