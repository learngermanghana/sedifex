import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Post = { id: string; title: string; slug: string; excerpt?: string | null; content: string; imageUrl?: string | null; linkUrl?: string | null; tags?: string[]; metaTitle?: string | null; metaDescription?: string | null; canonicalUrl?: string | null; ogImage?: string | null }

export default function PublicBlogPage() {
  const { storeId = '', slug = '' } = useParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedTag, setSelectedTag] = useState('all')

  useEffect(() => {
    if (!storeId) return
    const params = new URLSearchParams({ storeId })
    if (slug) params.set('slug', slug)
    if (selectedTag !== 'all') params.set('tag', selectedTag)
    fetch(`/api/public-blog?${params.toString()}`)
      .then(r => r.json())
      .then(data => setPosts(Array.isArray(data.items) ? data.items : []))
      .catch(() => setPosts([]))
  }, [storeId, slug, selectedTag])

  const allTags = useMemo(() => ['all', ...new Set(posts.flatMap(post => post.tags ?? []))], [posts])
  const detailPost = slug ? posts[0] : null

  useEffect(() => {
    if (!detailPost) return
    document.title = detailPost.metaTitle || detailPost.title
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', detailPost.metaDescription ?? detailPost.excerpt ?? '')
  }, [detailPost])

  return (
    <main className="page" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>Store Blog</h1>
      {!slug ? <p><label>Filter by tag: <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)}>{allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></label></p> : null}
      {posts.map(post => (
        <article key={post.id} className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h2>{post.title}</h2>
          {post.imageUrl ? <img src={post.imageUrl} alt={post.title} style={{ maxWidth: 320 }} /> : null}
          <p>{slug ? post.content : (post.excerpt || `${post.content.slice(0, 220)}...`)}</p>
          {!slug ? <p><Link to={`/public-blog/${storeId}/${post.slug}`}>Read article</Link></p> : null}
          {post.linkUrl ? <p><a href={post.linkUrl} target="_blank" rel="noreferrer">Read more</a></p> : null}
        </article>
      ))}
      <p><Link to="/">Back</Link></p>
    </main>
  )
}
