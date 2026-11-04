import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdmin } from '../_firebase-admin.js'

type UsageItem = { id: string; name: string; type: string }

const LIMIT_PER_SOURCE = 150

// Read only and deliberately on demand. No new background polling or media copies.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const { storeId, url } = req.body || {}
  if (typeof storeId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(storeId) ||
      typeof url !== 'string' || url.length > 3000 || !/^https:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid store and image URL are required.' })
  }
  const token = typeof req.headers.authorization === 'string'
    ? /^Bearer\s+(\S+)$/i.exec(req.headers.authorization)?.[1] : null
  if (!token) return res.status(401).json({ error: 'Sign in to inspect image usage.' })

  try {
    const app = getAdmin()
    const uid = (await getAuth(app).verifyIdToken(token)).uid
    const db = getFirestore(app)
    const member = await db.collection('teamMembers').doc(uid).get()
    const team = member.data()
    if (!member.exists || team?.uid !== uid) return res.status(403).json({ error: 'No access to this store.' })
    if (team.storeId !== storeId) {
      if (team?.role !== 'owner' || !team.storeId) {
        return res.status(403).json({ error: 'No access to this store.' })
      }
      const store = await db.collection('stores').doc(storeId).get()
      if (!store.exists || store.data()?.parentStoreId !== team.storeId) {
        return res.status(403).json({ error: 'No access to this store.' })
      }
    }

    const base = db.collection('stores').doc(storeId)
    const [photos, covers, promoUrls, promoImageUrls, products, nestedProducts, blogPosts, heroSlides, storeProfile] = await Promise.all([
      base.collection('galleryImages').where('url', '==', url).limit(LIMIT_PER_SOURCE).get(),
      base.collection('galleryAlbums').where('coverImageUrl', '==', url).limit(LIMIT_PER_SOURCE).get(),
      base.collection('promoGallery').where('url', '==', url).limit(LIMIT_PER_SOURCE).get(),
      base.collection('promoGallery').where('imageUrl', '==', url).limit(LIMIT_PER_SOURCE).get(),
      db.collection('products').where('storeId', '==', storeId).limit(1000).get(),
      base.collection('products').limit(1000).get(),
      db.collection('blogPosts').where('storeId', '==', storeId).limit(1000).get(),
      base.collection('websiteHeroSlides').limit(300).get(),
      base.get(),
    ])

    const albumIds = new Set<string>()
    photos.docs.forEach(item => {
      const id = item.data()?.albumId
      if (typeof id === 'string' && id) albumIds.add(id)
    })
    covers.docs.forEach(item => albumIds.add(item.id))
    const albumRefs: UsageItem[] = []
    for (const id of Array.from(albumIds).slice(0, 50)) {
      const snapshot = await base.collection('galleryAlbums').doc(id).get()
      albumRefs.push({ id, name: String(snapshot.data()?.title || 'Gallery album'), type: 'album' })
    }

    const productRefs: UsageItem[] = []
    const seenProductIds = new Set<string>()
    for (const snapshot of [...products.docs, ...nestedProducts.docs]) {
      const data = snapshot.data()
      if (seenProductIds.has(snapshot.id)) continue
      if (data.imageUrl !== url && !(Array.isArray(data.imageUrls) && data.imageUrls.includes(url))) continue
      seenProductIds.add(snapshot.id)
      productRefs.push({ id: snapshot.id, name: String(data.name || data.title || 'Item'), type: 'product' })
    }

    const promoIds = new Set([...promoUrls.docs, ...promoImageUrls.docs].map(item => item.id))
    const promoRefs: UsageItem[] = Array.from(promoIds).map(id => ({ id, name: 'Promo gallery picture', type: 'promo' }))
    const siteRefs: UsageItem[] = [
      ...blogPosts.docs.filter(item => item.data().imageUrl === url || item.data().ogImage === url)
        .map(item => ({ id: item.id, name: String(item.data().title || 'Blog post'), type: 'blog' })),
      ...heroSlides.docs.filter(item => item.data().imageUrl === url || item.data().mobileImageUrl === url)
        .map(item => ({ id: item.id, name: String(item.data().title || 'Website hero slide'), type: 'hero' })),
      ...(storeProfile.data()?.promoImageUrl === url
        ? [{ id: storeId, name: 'Store promo cover', type: 'store-promo' }] : []),
    ]

    return res.status(200).json({
      albumRefs,
      productRefs,
      promoRefs,
      siteRefs,
      partial: photos.size >= LIMIT_PER_SOURCE || covers.size >= LIMIT_PER_SOURCE ||
        promoUrls.size >= LIMIT_PER_SOURCE || promoImageUrls.size >= LIMIT_PER_SOURCE ||
        products.size >= 1000 || nestedProducts.size >= 1000 || blogPosts.size >= 1000 ||
        heroSlides.size >= 300 || albumIds.size > 50,
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
      String((error as { code: unknown }).code).startsWith('auth/')) {
      return res.status(401).json({ error: 'Your session has expired. Sign in again.' })
    }
    console.error('[media-manager] usage lookup failed', error)
    return res.status(500).json({ error: 'Unable to check where this picture is used.' })
  }
}
