import { useEffect, useMemo, useState } from 'react'
import './BlogPage.css'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { requestAiAdvisor } from '../api/aiAdvisor'


type CatalogItem = {
  id: string
  name: string
  itemType: 'product' | 'service'
  price: number | null
  description: string | null
}

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  metaTitle: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  ogImage: string | null
  tags: string[]
  publishAt: string | null
  linkUrl: string | null
  imageUrl: string | null
  status: 'draft' | 'published' | 'scheduled' | 'archived'
  updatedAt: string | null
}


function formatPastedContent(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n\n')
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function BlogPage() {
  const { storeId } = useActiveStore()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft')
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState('')

  const publicFeedUrl = useMemo(() => (storeId ? `/api/public-blog?storeId=${encodeURIComponent(storeId)}` : ''), [storeId])

  async function loadPosts() {
    if (!storeId) return
    const q = query(collection(db, 'blogPosts'), where('storeId', '==', storeId), orderBy('updatedAt', 'desc'), limit(50))
    const snap = await getDocs(q)
    setPosts(
      snap.docs.map(d => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          title: String(data.title ?? ''),
          slug: String(data.slug ?? ''),
          excerpt: typeof data.excerpt === 'string' ? data.excerpt : null,
          content: String(data.content ?? ''),
          metaTitle: typeof data.metaTitle === 'string' ? data.metaTitle : null,
          metaDescription: typeof data.metaDescription === 'string' ? data.metaDescription : null,
          canonicalUrl: typeof data.canonicalUrl === 'string' ? data.canonicalUrl : null,
          ogImage: typeof data.ogImage === 'string' ? data.ogImage : null,
          tags: Array.isArray(data.tags) ? data.tags.filter((item): item is string => typeof item === 'string') : [],
          publishAt: typeof data.publishAt?.toDate === 'function' ? data.publishAt.toDate().toISOString().slice(0, 16) : null,
          linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : null,
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
          status: data.status === 'published' || data.status === 'scheduled' || data.status === 'archived' ? data.status : 'draft',
          updatedAt: typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate().toLocaleString() : null,
        }
      }),
    )
  }

  useEffect(() => {
    void loadPosts()
  }, [storeId])

  useEffect(() => {
    async function loadCatalogItems() {
      if (!storeId) {
        setCatalogItems([])
        setSelectedCatalogItemId('')
        return
      }
      const q = query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('name', 'asc'), limit(200))
      const snap = await getDocs(q)
      const rows: CatalogItem[] = snap.docs.map(docSnap => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          id: docSnap.id,
          name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled item',
          itemType: data.itemType === 'service' ? 'service' : 'product',
          price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : null,
          description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
        }
      })
      setCatalogItems(rows)
      setSelectedCatalogItemId(current => (current && rows.some(item => item.id === current) ? current : ''))
    }

    void loadCatalogItems()
  }, [storeId])

  const selectedCatalogItem = useMemo(
    () => catalogItems.find(item => item.id === selectedCatalogItemId) ?? null,
    [catalogItems, selectedCatalogItemId],
  )

  async function generateBlogWithAi() {
    if (!storeId) return
    setIsAiGenerating(true)
    setMessage(null)
    try {
      const itemContext = selectedCatalogItem
        ? [
            `Featured ${selectedCatalogItem.itemType}: ${selectedCatalogItem.name}.`,
            selectedCatalogItem.price != null ? `Price: GHS ${selectedCatalogItem.price.toFixed(2)}.` : null,
            selectedCatalogItem.description ? `Details: ${selectedCatalogItem.description}.` : null,
            'Use this item naturally in the post.',
          ]
            .filter(Boolean)
            .join(' ')
        : null

      const prompt = [
        'Write a clear blog post for a retail store website in simple language.',
        `Working title: ${title.trim() || 'New Arrivals and Offers'}.`,
        itemContext,
        'Return this format exactly:',
        'TITLE: <post title>',
        'CONTENT: <blog post body with paragraphs>',
      ].join('\n')
      const result = await requestAiAdvisor({ question: prompt, storeId })
      const advice = result.advice || ''
      const titleMatch = advice.match(/TITLE:\s*([\s\S]*?)(?:\nCONTENT:|$)/i)
      const contentMatch = advice.match(/CONTENT:\s*([\s\S]*)$/i)
      if (titleMatch?.[1]?.trim()) setTitle(titleMatch[1].trim())
      if (contentMatch?.[1]?.trim()) setContent(contentMatch[1].trim())
      else setContent(advice.trim())
      setMessage('AI draft generated. Review before saving.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate blog draft.')
    } finally {
      setIsAiGenerating(false)
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId) return
    setSaving(true)
    setMessage(null)
    try {
      const slug = makeSlug(title)
      const payload = {
        storeId,
        title: title.trim(),
        slug,
        excerpt: null,
        content: content.trim(),
        metaTitle: null,
        metaDescription: metaDescription.trim() || null,
        canonicalUrl: null,
        ogImage: null,
        tags: [],
        publishAt: publishAt ? new Date(publishAt) : null,
        linkUrl: null,
        imageUrl: null,
        status,
        publishedAt: status === 'published' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }

      if (editingPostId) await updateDoc(doc(db, 'blogPosts', editingPostId), payload)
      else await addDoc(collection(db, 'blogPosts'), { ...payload, createdAt: serverTimestamp() })

      setTitle('')
      setContent('')
      setMetaDescription('')
      setPublishAt('')
      setStatus('draft')
      setEditingPostId(null)
      setMessage(editingPostId ? 'Post updated.' : 'Post saved.')
      await loadPosts()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save post.')
    } finally {
      setSaving(false)
    }
  }

  function editPost(post: BlogPost) {
    setEditingPostId(post.id)
    setTitle(post.title)
    setContent(post.content)
    setMetaDescription(post.metaDescription ?? '')
    setPublishAt(post.publishAt ?? '')
    setStatus(post.status === 'archived' ? 'draft' : post.status)
  }

  async function archivePost(postId: string) {
    await updateDoc(doc(db, 'blogPosts', postId), { status: 'archived', updatedAt: serverTimestamp() })
    await loadPosts()
  }

  async function permanentlyDeletePost(postId: string) {
    await deleteDoc(doc(db, 'blogPosts', postId))
    await loadPosts()
  }

  async function publishPost(postId: string) {
    await updateDoc(doc(db, 'blogPosts', postId), { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    await loadPosts()
  }

  return (
    <main className="page">
      <section className="blog-page">
        <header className="card blog-page__header">
          <div className="blog-page__title">
            <h1>Blog</h1>
            <p>Write updates and publish polished posts for your public audience.</p>
          </div>
          <div className="blog-page__top-actions">
            <button type="button" onClick={() => setEditingPostId(null)}>{editingPostId ? 'New post' : 'New post'}</button>
            {publicFeedUrl ? (
              <aside className="card blog-page__feed">
                <strong>Public feed</strong>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>Endpoint</p>
                <code>{publicFeedUrl}</code>
                <div className="blog-page__feed-actions">
                  <button type="button" className="button button--ghost" onClick={() => void navigator.clipboard.writeText(publicFeedUrl)}>Copy</button>
                  <button type="button" className="button button--ghost" onClick={() => window.open(publicFeedUrl, '_blank', 'noopener,noreferrer')}>Open</button>
                </div>
              </aside>
            ) : null}
          </div>
        </header>

        <div className="blog-page__content">
          <article className="card blog-page__editor">
            <form className="blog-page__editor-form" onSubmit={onSubmit}>
              <label className="stack">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} required minLength={5} />
              </label>

              <label className="stack">
                <span>Featured product or service (optional)</span>
                <select value={selectedCatalogItemId} onChange={e => setSelectedCatalogItemId(e.target.value)}>
                  <option value="">Select from your products/services</option>
                  {catalogItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.itemType})
                    </option>
                  ))}
                </select>
              </label>

              <label className="stack">
                <span>Post content</span>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onPaste={event => {
                    const pasted = event.clipboardData.getData('text')
                    if (!pasted) return
                    event.preventDefault()
                    const formatted = formatPastedContent(pasted)
                    const el = event.currentTarget
                    const next = `${content.slice(0, el.selectionStart)}${formatted}${content.slice(el.selectionEnd)}`
                    setContent(next)
                  }}
                  rows={18}
                  required
                />
              </label>

              <label className="stack">
                <span>Meta description</span>
                <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={3} maxLength={320} />
              </label>

              <div className="blog-page__meta-grid">
                <label className="stack"><span>Publish at</span><input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} /></label>
                <label className="stack">
                  <span>Status</span>
                  <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published' | 'scheduled')}>
                    <option value="draft">Draft</option>
                    <option value="published">Publish now</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </label>
              </div>

              <div className="blog-page__toolbar blog-page__toolbar--actions">
                <button type="button" className="button button--ghost" onClick={() => void generateBlogWithAi()} disabled={isAiGenerating || saving || !storeId}>
                  {isAiGenerating ? 'Generating…' : 'Generate with A.I'}
                </button>
                <button type="submit" disabled={saving || !storeId}>{saving ? 'Saving…' : editingPostId ? 'Update Post' : 'Save Post'}</button>
              </div>
            </form>
            {message ? <p>{message}</p> : null}
          </article>
        </div>

        <section className="card blog-page__posts">
          <div className="blog-page__searchbar">
            <h2 style={{ margin: 0 }}>Posts</h2>
            <input placeholder="Search and filters coming soon" disabled />
          </div>
          <ul className="blog-page__list">
            {posts.map(post => (
              <li key={post.id} className="blog-post-item">
                <div className="blog-post-item__top">
                  <div>
                    <h3 className="blog-post-item__title">{post.title}</h3>
                    <div className="blog-post-item__meta">
                      <span className="blog-status-badge" data-status={post.status}>{post.status}</span>
                      {post.slug ? <span className="blog-post-item__slug">/{post.slug}</span> : null}
                      {post.updatedAt ? <span>Updated {post.updatedAt}</span> : null}
                    </div>
                  </div>
                  <div className="blog-post-item__actions">
                    {post.status !== 'published' ? <button className="button button--ghost" onClick={() => void publishPost(post.id)}>Publish</button> : null}
                    <button onClick={() => editPost(post)}>Edit</button>
                    <button className="button button--ghost" onClick={() => void archivePost(post.id)}>Archive</button>
                    <button className="button button--ghost button--danger-subtle" onClick={() => void permanentlyDeletePost(post.id)}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  )
}
