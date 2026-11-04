import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAdmin } from '../_firebase-admin.js'

// Deletes original Media Library uploads only. References in albums and items
// must be removed first, so shared website pictures are not silently broken.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const { storeId, assetId } = req.body || {}
  if (typeof storeId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(storeId)
    || typeof assetId !== 'string' || !/^[a-f0-9]{64}$/.test(assetId)) {
    return res.status(400).json({ error: 'A valid store and media ID are required.' })
  }
  const bearer = typeof req.headers.authorization === 'string'
    ? /^Bearer\s+(\S+)$/i.exec(req.headers.authorization)?.[1] : null
  if (!bearer) return res.status(401).json({ error: 'Sign in to delete pictures.' })

  try {
    const app = getAdmin()
    const uid = (await getAuth(app).verifyIdToken(bearer)).uid
    const db = getFirestore(app)
    const member = await db.collection('teamMembers').doc(uid).get()
    const team = member.data()
    if (!member.exists || team?.uid !== uid || team?.role !== 'owner') {
      return res.status(403).json({ error: 'Only a store owner can permanently delete pictures.' })
    }
    if (team.storeId !== storeId) {
      const store = await db.collection('stores').doc(storeId).get()
      if (!store.exists || store.data()?.parentStoreId !== team.storeId) {
        return res.status(403).json({ error: 'No permission to delete this store picture.' })
      }
    }

    const mediaRef = db.collection('stores').doc(storeId).collection('mediaAssets').doc(assetId)
    const media = await mediaRef.get()
    if (!media.exists) return res.status(404).json({ error: 'Picture not found in this library.' })
    const data = media.data()
    const url = typeof data?.url === 'string' ? data.url : ''
    const bucketName = process.env.IMAGE_UPLOAD_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
    if (!bucketName) return res.status(500).json({ error: 'Media storage is not configured.' })
    let objectPath = ''
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' && parsed.hostname === 'storage.googleapis.com') {
        const prefix = '/' + bucketName + '/'
        if (parsed.pathname.startsWith(prefix)) {
          objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length))
        }
      }
    } catch { /* invalid URL */ }
    if (!new RegExp('^stores/' + storeId + '/media/' + assetId + '\\.(?:jpg|jpeg|png|webp|avif)$').test(objectPath)) {
      return res.status(400).json({ error: 'Only original uploads owned by this store can be deleted.' })
    }

    const base = db.collection('stores').doc(storeId)
    const [albumPhotos, albumCovers, promoPhotos, promoImages, products, storeProducts] = await Promise.all([
      base.collection('galleryImages').where('url', '==', url).limit(1).get(),
      base.collection('galleryAlbums').where('coverImageUrl', '==', url).limit(1).get(),
      base.collection('promoGallery').where('url', '==', url).limit(1).get(),
      base.collection('promoGallery').where('imageUrl', '==', url).limit(1).get(),
      db.collection('products').where('storeId', '==', storeId).get(),
      base.collection('products').get(),
    ])
    const usedByItem = [...products.docs, ...storeProducts.docs].some(snapshot => {
      const product = snapshot.data()
      return product.imageUrl === url ||
        (Array.isArray(product.imageUrls) && product.imageUrls.includes(url))
    })
    if (!albumPhotos.empty || !albumCovers.empty || !promoPhotos.empty || !promoImages.empty || usedByItem) {
      return res.status(409).json({
        error: 'This picture is used by an album, gallery, or item. Remove those references first, then try again.',
      })
    }

    // Object removal is intentionally restricted to the canonical media folder.
    // If storage fails, keep the library record so deletion can be retried.
    await getStorage(app).bucket(bucketName).file(objectPath).delete({ ignoreNotFound: true })
    await mediaRef.delete()
    return res.status(200).json({ deleted: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
      String((error as { code: unknown }).code).startsWith('auth/')) {
      return res.status(401).json({ error: 'Your session expired. Sign in again.' })
    }
    console.error('[media-library] delete failed', error)
    return res.status(500).json({ error: 'Unable to delete this picture. Please try again.' })
  }
}
