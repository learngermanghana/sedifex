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
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : ''

  const firestore = db()
  let query = firestore.collection('blogPosts').where('storeId', '==', storeId)

  const now = new Date()

  if (postSlug) {
    query = query.where('slug', '==', postSlug).limit(1)
  } else {
    query = query.orderBy('updatedAt', 'desc').limit(50)
  }

  const snap = await query.get()
  let items = snap.docs.map(doc => {
    const data = doc.data()
    const status = data.status ?? 'draft'
    const publishAt = data.publishAt?.toDate ? data.publishAt.toDate() : null
    const isVisible = status === 'published' || (status === 'scheduled' && publishAt && publishAt <= now)
    if (!isVisible) return null
    return {
      id: doc.id,
      title: data.title ?? '',
      slug: data.slug ?? '',
      excerpt: data.excerpt ?? null,
      content: data.content ?? '',
      linkUrl: data.linkUrl ?? null,
      imageUrl: data.imageUrl ?? null,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      canonicalUrl: data.canonicalUrl ?? null,
      ogImage: data.ogImage ?? null,
      tags: Array.isArray(data.tags) ? data.tags.filter((item: unknown) => typeof item === 'string') : [],
      publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : null,
    }
  }).filter(Boolean)

  if (tag) {
    items = items.filter(item => (item?.tags ?? []).includes(tag))
  }

  return res.status(200).json({ items })
}
