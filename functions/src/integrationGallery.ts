import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'
import { cleanIntegrationText, isIntegrationRequestAuthorized } from './integrationAuth'
import { buildPublicGallery, type GallerySourceDocument } from './integrationGalleryCore'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', { default: '2026-04-13' })

// Bounded per-request reads: two collections, never a background watcher.
// Larger stores will need cursor pagination when they exceed these caps.
const MAX_ALBUMS_READ = 100
const MAX_IMAGES_READ = 1000
const DEFAULT_IMAGE_LIMIT = 300

function setHeaders(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version, Accept')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  // Authenticated partner data should not be cached in shared CDN layers.
  res.set('Cache-Control', 'private, no-store')
  res.set('x-sedifex-contract-version', INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13')
  res.set('x-sedifex-request-id', Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12))
}

function getLimit(raw: unknown): number | null {
  if (raw === undefined) return DEFAULT_IMAGE_LIMIT
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_IMAGES_READ) return null
  return parsed
}

function toSourceDocs(snapshot: FirebaseFirestore.QuerySnapshot): GallerySourceDocument[] {
  return snapshot.docs.map(item => ({
    id: item.id,
    data: item.data() as Record<string, unknown>,
  }))
}

/**
 * Authenticated integration for existing connected client websites.
 *
 * GET /integrationGallery?storeId=...&albumId=...&limit=...
 *
 * Partner websites must call this server-side with their store's Sedifex API
 * key. Google Drive tokens are never required by consuming websites.
 */
export const integrationGallery = functions.https.onRequest(async (req, res): Promise<void> => {
  setHeaders(res)

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = cleanIntegrationText(req.get('x-sedifex-contract-version'), 80)
  if (received !== expected) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return
  }

  const storeId = cleanIntegrationText(req.query.storeId, 180)
  if (!storeId) {
    res.status(400).json({ error: 'missing-store-id' })
    return
  }

  const imageLimit = getLimit(req.query.limit)
  if (imageLimit === null) {
    res.status(400).json({ error: 'invalid-limit', message: 'limit must be between 1 and 1000.' })
    return
  }

  const albumId = cleanIntegrationText(req.query.albumId, 180)
  if (req.query.albumId !== undefined && !albumId) {
    res.status(400).json({ error: 'invalid-album-id' })
    return
  }

  if (!(await isIntegrationRequestAuthorized(req, storeId))) {
    res.status(401).json({ error: 'invalid-api-key', message: 'This website key is not authorized for the requested Sedifex store.' })
    return
  }

  try {
    const store = defaultDb.collection('stores').doc(storeId)
    const imageCollection = store.collection('galleryImages')
    const imageQuery = albumId
      ? imageCollection.where('albumId', '==', albumId)
      : imageCollection

    const [albumSnap, imageSnap] = await Promise.all([
      store.collection('galleryAlbums').limit(MAX_ALBUMS_READ + 1).get(),
      imageQuery.limit(MAX_IMAGES_READ + 1).get(),
    ])

    const result = buildPublicGallery(
      toSourceDocs(albumSnap),
      toSourceDocs(imageSnap),
      {
        albumId: albumId || undefined,
        limit: imageLimit,
        sourceTruncated: albumSnap.size > MAX_ALBUMS_READ || imageSnap.size > MAX_IMAGES_READ,
      },
    )

    res.status(200).json({
      ok: true,
      storeId,
      albumId: albumId || null,
      ...result,
    })
  } catch (error) {
    functions.logger.error('integrationGallery failed', { storeId, albumId: albumId || null, error })
    res.status(500).json({ error: 'integration-gallery-failed' })
  }
})
