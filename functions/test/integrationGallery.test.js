const assert = require('node:assert/strict')
const { buildPublicGallery } = require('../lib/integrationGalleryCore')

const record = (id, data) => ({ id, data })
const albums = [
  record('hidden', { title: 'Secret', isPublished: false, sortOrder: 1 }),
  record('b', { title: 'Beauty', sortOrder: 3, coverImageUrl: 'https://images.example/hidden.jpg' }),
  record('a', { title: 'Events', isPublished: true, sortOrder: 2, coverImageUrl: 'https://images.example/first.jpg', updatedAt: { seconds: 1700000000 } }),
  record('empty', { title: 'No pictures', isPublished: true, sortOrder: 4 }),
]
const images = [
  record('1', { albumId: 'a', url: 'https://images.example/first.jpg', alt: 'Guests', sortOrder: 2, isPublished: true }),
  record('2', { albumId: 'a', url: 'https://images.example/before.jpg', caption: 'Arrival', sortOrder: 1 }),
  record('3', { albumId: 'b', url: 'https://images.example/hidden.jpg', sortOrder: 1, isPublished: false }),
  record('4', { albumId: 'b', url: 'https://images.example/visible.jpg', sortOrder: 3 }),
  record('5', { albumId: 'hidden', url: 'https://images.example/leak.jpg', sortOrder: 0 }),
  record('6', { albumId: 'missing', url: 'https://images.example/orphan.jpg' }),
  record('7', { albumId: 'a', url: 'javascript:alert(1)' }),
]

const result = buildPublicGallery(albums, images, { limit: 20 })
assert.equal(result.count, 3)
assert.equal(result.truncated, false)
assert.deepEqual(result.albums.map(album => album.id), ['a', 'b'])
assert.deepEqual(result.gallery.map(image => image.id), ['2', '1', '4'])
assert.equal(result.albums[0].images.length, 2)
assert.equal(result.albums[0].coverImageUrl, 'https://images.example/first.jpg')
assert.equal(result.albums[1].coverImageUrl, 'https://images.example/visible.jpg', 'Hidden cover must not leak through album')
assert.equal(result.albums[0].updatedAt, '2023-11-14T22:13:20.000Z')
assert.ok(result.gallery.every(image => image.isPublished === true && image.url.startsWith('https://')))
assert.ok(result.albums.every(album => album.isPublished === true))

const preview = buildPublicGallery(albums, images, { limit: 1 })
assert.equal(preview.gallery.length, 1)
assert.equal(preview.truncated, true)
assert.deepEqual(preview.albums.map(album => album.id), ['a'])
assert.equal(preview.albums[0].coverImageUrl, preview.gallery[0].url, 'A limited preview must use a visible cover')

const filtered = buildPublicGallery(albums, images, { albumId: 'b', limit: 20 })
assert.equal(filtered.gallery.length, 1)
assert.equal(filtered.gallery[0].albumId, 'b')
assert.equal(filtered.albums[0].title, 'Beauty')

const noAlbum = buildPublicGallery(albums, images, { albumId: 'not-real', limit: 20 })
assert.deepEqual(noAlbum.albums, [])
assert.deepEqual(noAlbum.gallery, [])

const truncatedBySource = buildPublicGallery(albums, images, { limit: 20, sourceTruncated: true })
assert.equal(truncatedBySource.truncated, true)

const legacy = buildPublicGallery([
  record('old', { title: 'Legacy', coverImageUrl: 'https://images.example/old.jpg' }),
], [
  record('old-photo', { albumId: 'old', url: 'https://images.example/old.jpg' }),
], { limit: 10 })
assert.equal(legacy.count, 1, 'Missing isPublished flags must remain publicly visible for legacy photos')
assert.equal(legacy.albums[0].images[0].alt, null)
assert.equal(legacy.albums[0].sortOrder, Number.MAX_SAFE_INTEGER)

console.log('integrationGallery core tests passed')

const {
  normalizePublicGalleryAlias, matchPublicGalleryStore,
} = require('../lib/integrationGalleryPublicScope')
const { LEGACY_PROMO_ALBUM_ID } = require('../lib/integrationGalleryCore')

// Original promo pictures are preserved alongside newer published albums.
// The same URL is not duplicated if the owner reused it in Media Library.
const merged = buildPublicGallery(albums, images, {
  limit: 20,
  legacyRecords: [
    record('legacy1', { url: 'https://images.example/original.jpg', sortOrder: 1, isPublished: true }),
    record('legacy2', { url: 'https://images.example/visible.jpg', sortOrder: 2 }),
    record('hidden-legacy', { url: 'https://images.example/secret.jpg', isPublished: false }),
    record('dangerous-url', { url: 'javascript:alert(1)', isPublished: true }),
  ],
})
assert.equal(merged.albums[0].id, LEGACY_PROMO_ALBUM_ID)
assert.deepEqual(merged.gallery.map(image => image.url), [
  'https://images.example/original.jpg',
  'https://images.example/visible.jpg',
  'https://images.example/before.jpg',
  'https://images.example/first.jpg',
])
assert.equal(merged.gallery.filter(image => image.url === 'https://images.example/visible.jpg').length, 1)
assert.ok(!merged.gallery.some(image => image.url.includes('secret') || image.url.startsWith('javascript:')))
assert.equal(merged.albums.find(album => album.id === 'b'), undefined,
  'New album whose only visible photo is already in legacy gallery is not duplicated')
const legacyOnly = buildPublicGallery(albums, images, {
  albumId: LEGACY_PROMO_ALBUM_ID,
  limit: 20,
  legacyRecords: [record('existing', { url: 'https://images.example/original.jpg' })],
})
assert.equal(legacyOnly.gallery.length, 1)
assert.equal(legacyOnly.gallery[0].albumId, LEGACY_PROMO_ALBUM_ID)
const mediaOnly = buildPublicGallery(albums, images, {
  albumId: 'a',
  limit: 20,
  legacyRecords: [record('legacy', { url: 'https://images.example/original.jpg' })],
})
assert.ok(mediaOnly.gallery.every(image => image.albumId === 'a'), 'Filtering a new album must not include legacy photos')

// Public slug mode is available only when that exact store promo is enabled.
assert.equal(normalizePublicGalleryAlias(' My-Spa '), 'my-spa')
assert.equal(normalizePublicGalleryAlias('admin/../secret'), '')
assert.equal(normalizePublicGalleryAlias(''), '')
assert.equal(matchPublicGalleryStore([
  record('store1', { promoSlug: 'spa', promoEnabled: true }),
  record('store2', { promoSlug: 'disabled', promoEnabled: false }),
], 'promoSlug', 'spa'), 'store1')
assert.equal(matchPublicGalleryStore([
  record('store2', { promoSlug: 'disabled', promoEnabled: false }),
], 'promoSlug', 'disabled'), null)
assert.equal(matchPublicGalleryStore([
  record('store1', { promoSlug: 'duplicate', promoEnabled: true }),
  record('store2', { promoSlug: 'duplicate', promoEnabled: true }),
], 'promoSlug', 'duplicate'), null, 'Ambiguous public aliases cannot expose either store')

const publishedSite = record('settingsA', {
  websiteBuilder: { slug: 'my-site', status: 'published', storeId: 'storeA' },
})
assert.equal(matchPublicGalleryStore([publishedSite], 'siteSlug', 'my-site'), 'storeA')
assert.equal(matchPublicGalleryStore([
  record('settingsB', { websiteBuilder: { slug: 'my-site', status: 'draft', storeId: 'private' } }),
], 'siteSlug', 'my-site'), null)
assert.equal(matchPublicGalleryStore([
  record('settingsC', { websiteBuilder: { slug: 'my-site', status: 'published', storeId: '../private' } }),
], 'siteSlug', 'my-site'), null)
assert.equal(matchPublicGalleryStore([
  record('settings1', { websiteBuilder: { slug: 'same', status: 'published' } }),
  record('settings2', { websiteBuilder: { slug: 'same', status: 'published' } }),
], 'siteSlug', 'same'), null)

console.log('integrationGallery compatibility tests passed')

