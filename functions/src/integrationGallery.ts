import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'
import { cleanIntegrationText, isIntegrationRequestAuthorized } from './integrationAuth'
import { buildPublicGallery, type GallerySourceDocument } from './integrationGalleryCore'
import { matchPublicGalleryStore, normalizePublicGalleryAlias } from './integrationGalleryPublicScope'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', { default: '2026-04-13' })

// Bounded per-request reads: two collections, never a background watcher.
// Larger stores will need cursor pagination when they exceed these caps.
const MAX_ALBUMS_READ = 100
const MAX_IMAGES_READ = 1000
const MAX_LEGACY_IMAGES_READ = 100
const DEFAULT_IMAGE_LIMIT = 300

function setHeaders(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Sedifex-Contract-Version, Accept')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  // Store-key requests are private; public aliases set a short public TTL after validation.
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
 * GET /integrationGallery?slug=...            (public promotional page)
 * GET /integrationGallery?siteSlug=...        (published Sedifex website)
 *
 * Partner websites using storeId must send the Sedifex integration key.
 * The public aliases resolve to an active/published store only and return
 * published photos, preserving existing browser-facing gallery retrieval.
 * Google Drive tokens are never required by website visitors.
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
  const publicAliasRequested = req.query.slug !== undefined || req.query.siteSlug !== undefined
  if (received !== expected && (!publicAliasRequested || Boolean(received))) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return
  }

  const suppliedScopes = [req.query.storeId, req.query.slug, req.query.siteSlug]
    .filter(value => value !== undefined)
  if (suppliedScopes.length !== 1) {
    res.status(400).json({ error: 'invalid-gallery-scope', message: 'Provide exactly one: storeId, slug, or siteSlug.' })
    return
  }

  const publicPromoSlug = req.query.slug === undefined ? '' : normalizePublicGalleryAlias(req.query.slug)
  const publicSiteSlug = req.query.siteSlug === undefined ? '' : normalizePublicGalleryAlias(req.query.siteSlug)
  const requestedStoreId = cleanIntegrationText(req.query.storeId, 180)
  if ((req.query.slug !== undefined && !publicPromoSlug) ||
      (req.query.siteSlug !== undefined && !publicSiteSlug) ||
      (req.query.storeId !== undefined && (!requestedStoreId || requestedStoreId.includes('/')))) {
    res.status(400).json({ error: 'invalid-gallery-scope' })
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

  let storeId = requestedStoreId
  const publicRequest = Boolean(publicPromoSlug || publicSiteSlug)
  try {
    if (publicPromoSlug) {
      // Only an explicitly enabled public promo page may be looked up by slug.
      const snapshot = await defaultDb.collection('stores')
        .where('promoSlug', '==', publicPromoSlug).limit(5).get()
      storeId = matchPublicGalleryStore(toSourceDocs(snapshot), 'promoSlug', publicPromoSlug) || ''
    } else if (publicSiteSlug) {
      // Built-in published websites use a different slug than promo landing pages.
      const snapshot = await defaultDb.collection('storeSettings')
        .where('websiteBuilder.slug', '==', publicSiteSlug).limit(5).get()
      storeId = matchPublicGalleryStore(toSourceDocs(snapshot), 'siteSlug', publicSiteSlug) || ''
    }
  } catch (error) {
    functions.logger.error('integrationGallery public alias lookup failed', { error })
    res.status(500).json({ error: 'gallery-alias-lookup-failed' })
    return
  }

  if (!storeId) {
    res.status(404).json({ error: 'public-gallery-not-found' })
    return
  }
  if (!publicRequest && !(await isIntegrationRequestAuthorized(req, storeId))) {
    res.status(401).json({ error: 'invalid-api-key', message: 'This website key is not authorized for the requested Sedifex store.' })
    return
  }
  if (publicRequest) {
    // Only pre-approved public images are returned; old promo links still work
    // without a server-side website key or custom API headers.
    res.set('Cache-Control', 'public, max-age=30, s-maxage=60')
  }

  try {
    const store = defaultDb.collection('stores').doc(storeId)
    const imageCollection = store.collection('galleryImages')
    const imageQuery = albumId
      ? imageCollection.where('albumId', '==', albumId)
      : imageCollection

    const [albumSnap, imageSnap, legacySnap] = await Promise.all([
      store.collection('galleryAlbums').limit(MAX_ALBUMS_READ + 1).get(),
      imageQuery.limit(MAX_IMAGES_READ + 1).get(),
      // Existing promo pages keep their previously uploaded pictures.
      store.collection('promoGallery').limit(MAX_LEGACY_IMAGES_READ + 1).get(),
    ])

    const result = buildPublicGallery(
      toSourceDocs(albumSnap),
      toSourceDocs(imageSnap),
      {
        albumId: albumId || undefined,
        limit: imageLimit,
        legacyRecords: toSourceDocs(legacySnap),
        sourceTruncated: albumSnap.size > MAX_ALBUMS_READ
          || imageSnap.size > MAX_IMAGES_READ || legacySnap.size > MAX_LEGACY_IMAGES_READ,
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
