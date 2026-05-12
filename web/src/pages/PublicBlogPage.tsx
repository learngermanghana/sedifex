import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Post = { id: string; title: string; content: string; imageUrl?: string | null; linkUrl?: string | null }

export default function PublicBlogPage() {
  const { storeId = '' } = useParams()
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    if (!storeId) return
    fetch(`/api/public-blog?storeId=${encodeURIComponent(storeId)}`)
      .then(r => r.json())
      .then(data => setPosts(Array.isArray(data.items) ? data.items : []))
      .catch(() => setPosts([]))
  }, [storeId])

  return (
    <main className="page" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>Store Blog</h1>
      {posts.map(post => (
        <article key={post.id} className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h2>{post.title}</h2>
          {post.imageUrl ? <img src={post.imageUrl} alt={post.title} style={{ maxWidth: 320 }} /> : null}
          <p>{post.content}</p>
          {post.linkUrl ? <p><a href={post.linkUrl} target="_blank" rel="noreferrer">Read more</a></p> : null}
        </article>
      ))}
      <p><Link to="/">Back</Link></p>
    </main>
  )
}
