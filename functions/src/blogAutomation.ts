import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'

const TIME_ZONE = 'Africa/Accra'

type ItemType = 'product' | 'service' | 'course'

type CatalogItem = {
  id: string
  name: string
  itemType: ItemType
  price: number | null
  description: string | null
  imageUrl: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstImageFromArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim()
    if (entry && typeof entry === 'object') {
      const row = entry as Record<string, unknown>
      const url = text(row.url) ?? text(row.src) ?? text(row.imageUrl)
      if (url) return url
    }
  }
  return null
}

function imageFromCatalogData(data: Record<string, unknown>): string | null {
  const direct = [
    data.imageUrl,
    data.image_url,
    data.image,
    data.thumbnail,
    data.thumbnailUrl,
    data.photo,
    data.photo1,
    data.photo_1,
    data.coverImageUrl,
    data.coverImage,
    data.ogImage,
  ]

  for (const value of direct) {
    const url = text(value)
    if (url) return url
  }

  const arrays = [data.imageUrls, data.images, data.gallery, data.photos, data.media]
  for (const value of arrays) {
    const url = firstImageFromArray(value)
    if (url) return url
  }

  return null
}

function itemFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): CatalogItem {
  const data = doc.data() as Record<string, unknown>
  const itemType: ItemType = data.itemType === 'service' ? 'service' : data.itemType === 'course' ? 'course' : 'product'
  return {
    id: doc.id,
    name: text(data.name) ?? text(data.title) ?? 'Featured item',
    itemType,
    price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : null,
    description: text(data.description) ?? text(data.shortDescription),
    imageUrl: imageFromCatalogData(data),
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value ?? String(date.getUTCFullYear())
  const month = parts.find(part => part.type === 'month')?.value ?? String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = parts.find(part => part.type === 'day')?.value ?? String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildPost(storeId: string, item: CatalogItem, key: string): Record<string, unknown> {
  const label = item.itemType
  const title = `Featured ${label}: ${item.name}`
  const price = item.price != null ? `Price: GHS ${item.price.toFixed(2)}.` : null
  const description = item.description ?? `Discover ${item.name} today.`
  const content = [`Today we are highlighting ${item.name}.`, description, price].filter(Boolean).join('\n\n')
  const metaDescription = [description, price].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 155)

  return {
    storeId,
    title,
    slug: slugify(`${title}-${key}`),
    excerpt: metaDescription || null,
    content,
    metaTitle: title,
    metaDescription: metaDescription || title,
    canonicalUrl: null,
    ogImage: item.imageUrl,
    tags: ['auto-featured', label],
    publishAt: null,
    linkUrl: null,
    imageUrl: item.imageUrl,
    imageSource: item.imageUrl ? 'catalog_item' : 'none',
    featuredItemId: item.id,
    featuredItemName: item.name,
    featuredItemType: item.itemType,
    autoShareDate: key,
    autoShareType: 'daily_catalog_item',
    status: 'published',
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

async function alreadyPosted(storeId: string, key: string): Promise<boolean> {
  const snap = await db
    .collection('blogPosts')
    .where('storeId', '==', storeId)
    .where('autoShareType', '==', 'daily_catalog_item')
    .where('autoShareDate', '==', key)
    .limit(1)
    .get()
  return !snap.empty
}

async function nextItem(storeId: string, lastItemId: string | null): Promise<CatalogItem | null> {
  const snap = await db.collection('products').where('storeId', '==', storeId).limit(50).get()
  const items = snap.docs.map(itemFromDoc).filter(item => item.name)
  if (!items.length) return null
  const withImages = items.filter(item => item.imageUrl)
  const candidates = withImages.length ? withImages : items
  if (!lastItemId) return candidates[0]
  const index = candidates.findIndex(item => item.id === lastItemId)
  return index < 0 ? candidates[0] : candidates[(index + 1) % candidates.length]
}

export const publishDailyFeaturedProductBlogPost = functions.pubsub
  .schedule('every day 08:00')
  .timeZone(TIME_ZONE)
  .onRun(async () => {
    const key = dateKey(new Date())
    const settings = await db
      .collection('storeSettings')
      .where('blogAutomation.dailyProductShareEnabled', '==', true)
      .limit(100)
      .get()

    let created = 0
    let skipped = 0

    for (const setting of settings.docs) {
      const storeId = setting.id
      const data = setting.data() as Record<string, unknown>
      const automation = (data.blogAutomation ?? {}) as Record<string, unknown>
      const lastItemId = text(automation.lastFeaturedItemId)

      if (await alreadyPosted(storeId, key)) {
        skipped += 1
        continue
      }

      const item = await nextItem(storeId, lastItemId)
      if (!item) {
        skipped += 1
        continue
      }

      await db.collection('blogPosts').add(buildPost(storeId, item, key))
      await setting.ref.set(
        {
          blogAutomation: {
            lastFeaturedItemId: item.id,
            lastFeaturedItemName: item.name,
            lastFeaturedItemImageUrl: item.imageUrl,
            lastFeaturedItemType: item.itemType,
            lastFeaturedPostDate: key,
            lastFeaturedPostAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      )
      created += 1
    }

    functions.logger.info('Daily blog automation finished.', { key, enabledStores: settings.size, created, skipped })
  })
