import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
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
  content: string
  linkUrl: string | null
  imageUrl: string | null
  status: 'draft' | 'published'
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
  const [linkUrl, setLinkUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [message, setMessage] = useState<string | null>(null)

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
          content: String(data.content ?? ''),
          linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : null,
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
          status: data.status === 'published' ? 'published' : 'draft',
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
      await addDoc(collection(db, 'blogPosts'), {
        storeId,
        title: title.trim(),
        slug,
        content: content.trim(),
        linkUrl: normalizedLink || null,
        imageUrl: imageUrl.trim() || null,
        status,
        publishedAt: status === 'published' ? serverTimestamp() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setTitle('')
      setContent('')
      setLinkUrl('')
      setImageUrl('')
      setStatus('draft')
      setMessage('Post saved.')
      await loadPosts()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save post.')
    } finally {
      setSaving(false)
    }
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
            <span>Text</span>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} required />
          </label>
          <label className="stack">
            <span>Status</span>
            <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <button type="submit" disabled={saving || !storeId}>{saving ? 'Saving…' : 'Save Post'}</button>
        </form>
        {message ? <p>{message}</p> : null}
        {publicFeedUrl ? <p>Public feed: <code>{publicFeedUrl}</code></p> : null}

        <h2>Posts</h2>
        <ul className="stack">
          {posts.map(post => (
            <li key={post.id} className="card" style={{ padding: 12 }}>
              <strong>{post.title}</strong> — {post.status}
              <div>
                {post.status !== 'published' ? <button onClick={() => void publishPost(post.id)}>Publish</button> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
