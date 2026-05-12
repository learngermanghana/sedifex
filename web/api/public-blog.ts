import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_firebase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : ''
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' })
  }

  const postSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : ''

  const firestore = db()
  let query = firestore.collection('blogPosts').where('storeId', '==', storeId).where('status', '==', 'published')

  if (postSlug) {
    query = query.where('slug', '==', postSlug)
  } else {
    query = query.orderBy('publishedAt', 'desc').limit(20)
  }

  const snap = await query.get()
  const items = snap.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      title: data.title ?? '',
      slug: data.slug ?? '',
      content: data.content ?? '',
      linkUrl: data.linkUrl ?? null,
      imageUrl: data.imageUrl ?? null,
      publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : null,
    }
  })

  return res.status(200).json({ items })
}
