import { useEffect, useMemo, useState } from 'react'
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
import { uploadProductImage } from '../api/productImageUpload'

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
  const [excerpt, setExcerpt] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft')
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)

  const publicFeedUrl = useMemo(() => (storeId ? `/api/public-blog?storeId=${encodeURIComponent(storeId)}` : ''), [storeId])

  async function loadPosts() {
    if (!storeId) return
    const q = query(
      collection(db, 'blogPosts'),
      where('storeId', '==', storeId),
      orderBy('updatedAt', 'desc'),
      limit(50),
    )
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
          status:
            data.status === 'published' || data.status === 'scheduled' || data.status === 'archived'
              ? data.status
              : 'draft',
        }
      }),
    )
  }

  useEffect(() => {
    void loadPosts()
  }, [storeId])


  const [isAiGenerating, setIsAiGenerating] = useState(false)

  async function generateBlogWithAi() {
    if (!storeId) return
    setIsAiGenerating(true)
    setMessage(null)
    try {
      const prompt = [
        'Write a high quality blog post for a retail store website.',
        `Working title: ${title.trim() || 'New Arrivals and Offers'}.`,
        'Return this format exactly:',
        'TITLE: <post title>',
        'CONTENT: <blog post body with paragraphs>',
      ].join('\n')
      const result = await requestAiAdvisor({ question: prompt, storeId })
      const advice = result.advice || ''
      const titleMatch = advice.match(/TITLE:\s*([\s\S]*?)(?:\nCONTENT:|$)/i)
      const contentMatch = advice.match(/CONTENT:\s*([\s\S]*)$/i)
      if (titleMatch?.[1]?.trim()) setTitle(titleMatch[1].trim())
      if (contentMatch?.[1]?.trim()) {
        setContent(contentMatch[1].trim())
      } else {
        setContent(advice.trim())
      }
      setMessage('AI draft generated. Review before saving.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate blog draft.')
    } finally {
      setIsAiGenerating(false)
    }
  }

  async function onImageUpload(file: File) {
    const url = await uploadProductImage(file, { storagePath: 'blog-images' })
    setImageUrl(url)
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId) return
    setSaving(true)
    setMessage(null)
    try {
      const normalizedLink = linkUrl.trim()
      if (normalizedLink && !/^https?:\/\//i.test(normalizedLink)) {
        throw new Error('Link must start with http:// or https://')
      }
      const slug = makeSlug(title)
      const payload = {
        storeId,
        title: title.trim(),
        slug,
        excerpt: excerpt.trim() || null,
        content: content.trim(),
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        canonicalUrl: canonicalUrl.trim() || null,
        ogImage: ogImage.trim() || null,
        tags: tagsInput.split(',').map(tag => tag.trim()).filter(Boolean),
        publishAt: publishAt ? new Date(publishAt) : null,
        linkUrl: normalizedLink || null,
        imageUrl: imageUrl.trim() || null,
        status,
        publishedAt: status === 'published' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }

      if (editingPostId) {
        await updateDoc(doc(db, 'blogPosts', editingPostId), payload)
      } else {
        await addDoc(collection(db, 'blogPosts'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
      }
      setTitle('')
      setExcerpt('')
      setContent('')
      setMetaTitle('')
      setMetaDescription('')
      setCanonicalUrl('')
      setOgImage('')
      setTagsInput('')
      setPublishAt('')
      setLinkUrl('')
      setImageUrl('')
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
    setExcerpt(post.excerpt ?? '')
    setContent(post.content)
    setMetaTitle(post.metaTitle ?? '')
    setMetaDescription(post.metaDescription ?? '')
    setCanonicalUrl(post.canonicalUrl ?? '')
    setOgImage(post.ogImage ?? '')
    setTagsInput(post.tags.join(', '))
    setPublishAt(post.publishAt ?? '')
    setLinkUrl(post.linkUrl ?? '')
    setImageUrl(post.imageUrl ?? '')
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
    await updateDoc(doc(db, 'blogPosts', postId), {
      status: 'published',
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await loadPosts()
  }

  return (
    <main className="page">
      <section className="card stack" style={{ maxWidth: 880, margin: '0 auto' }}>
        <h1>Store Blog</h1>
        <p>Create blog posts and publish them for public viewing and website pull.</p>
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack">
            <span>Title</span>
            <input value={title} onChange={e => setTitle(e.target.value)} required minLength={5} />
          </label>
          <label className="stack">
            <span>Insert link (optional)</span>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label className="stack">
            <span>Image upload</span>
            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && void onImageUpload(e.target.files[0])} />
          </label>
          {imageUrl ? <img src={imageUrl} alt="Cover" style={{ maxWidth: 260, borderRadius: 8 }} /> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--ghost" onClick={() => void generateBlogWithAi()} disabled={isAiGenerating || saving || !storeId}>
              {isAiGenerating ? 'Generating…' : 'Generate with OpenAI'}
            </button>
          </div>
          <label className="stack">
            <span>Excerpt (optional)</span>
            <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={3} maxLength={320} />
          </label>
          <label className="stack">
            <span>Text</span>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} required />
          </label>
          <label className="stack"><span>Meta title</span><input value={metaTitle} onChange={e => setMetaTitle(e.target.value)} /></label>
          <label className="stack"><span>Meta description</span><textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={2} /></label>
          <label className="stack"><span>Canonical URL</span><input value={canonicalUrl} onChange={e => setCanonicalUrl(e.target.value)} placeholder="https://..." /></label>
          <label className="stack"><span>OG image URL</span><input value={ogImage} onChange={e => setOgImage(e.target.value)} placeholder="https://..." /></label>
          <label className="stack"><span>Tags (comma separated)</span><input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="promo, sale" /></label>
          <label className="stack"><span>Publish at</span><input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} /></label>
          <label className="stack">
            <span>Status</span>
            <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published' | 'scheduled')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </label>
          <button type="submit" disabled={saving || !storeId}>{saving ? 'Saving…' : editingPostId ? 'Update Post' : 'Save Post'}</button>
        </form>
        {message ? <p>{message}</p> : null}
        {publicFeedUrl ? <p>Public feed: <code>{publicFeedUrl}</code></p> : null}

        <h2>Posts</h2>
        <ul className="stack">
          {posts.map(post => (
            <li key={post.id} className="card" style={{ padding: 12 }}>
              <strong>{post.title}</strong> — {post.status} {post.slug ? <code>/{post.slug}</code> : null}
              <div>
                {post.status !== 'published' ? <button onClick={() => void publishPost(post.id)}>Publish</button> : null}
                <button onClick={() => editPost(post)}>Edit</button>
                <button onClick={() => void archivePost(post.id)}>Archive</button>
                <button onClick={() => void permanentlyDeletePost(post.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
