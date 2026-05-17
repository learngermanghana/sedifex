import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import { asNumber, asText, downloadCsv, formatDate, toDate } from './reportUtils'

type BlogRow = {
  id: string
  title: string
  slug: string
  status: string
  views: number
  createdAt: Date | null
  publishedAt: Date | null
}

function mapPost(id: string, data: Record<string, unknown>): BlogRow {
  return {
    id,
    title: asText(data.title, 'Untitled post'),
    slug: asText(data.slug, ''),
    status: asText(data.status ?? data.publishStatus, 'draft'),
    views: asNumber(data.views ?? data.viewCount, 0),
    createdAt: toDate(data.createdAt),
    publishedAt: toDate(data.publishedAt),
  }
}

export default function BlogReport() {
  const { storeId } = useActiveStore()
  const [rows, setRows] = useState<BlogRow[]>([])
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setRows([])
      return undefined
    }
    const unsubscribe = onSnapshot(query(collection(db, 'blogPosts'), where('storeId', '==', storeId)), snapshot => {
      setRows(snapshot.docs.map(docSnap => mapPost(docSnap.id, docSnap.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
    })
    return unsubscribe
  }, [storeId])

  const filtered = useMemo(() => status === 'all' ? rows : rows.filter(row => row.status === status), [rows, status])
  const statuses = useMemo(() => [...new Set(rows.map(row => row.status).filter(Boolean))], [rows])
  const totals = useMemo(() => ({ count: filtered.length, published: filtered.filter(row => row.status === 'published').length, drafts: filtered.filter(row => row.status !== 'published').length, views: filtered.reduce((sum, row) => sum + row.views, 0) }), [filtered])

  function exportRows() {
    downloadCsv('sedifex-blog-report.csv', filtered.map(row => ({ title: row.title, slug: row.slug, status: row.status, views: row.views, createdAt: formatDate(row.createdAt), publishedAt: formatDate(row.publishedAt) })))
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Blog</p><h1>Blog report</h1><p className="workspace-muted">Published and draft content, simple content metrics, and CSV export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.count}</strong><span>Total posts</span></article><article className="workspace-card"><strong>{totals.published}</strong><span>Published</span></article><article className="workspace-card"><strong>{totals.drafts}</strong><span>Drafts</span></article><article className="workspace-card"><strong>{totals.views}</strong><span>Views</span></article></section>
      <section className="workspace-card"><div className="workspace-section-header"><div><h2>Post details</h2><p className="workspace-muted">Filter by status and export CSV.</p></div><button type="button" className="button button--primary" onClick={exportRows} disabled={!filtered.length}>Export CSV</button></div><div className="workspace-toolbar"><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name}</option>)}</select></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Title</th><th>Status</th><th>Views</th><th>Created</th><th>Published</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.title}</strong><br /><small>{row.slug || 'No slug'}</small></td><td>{row.status}</td><td>{row.views}</td><td>{formatDate(row.createdAt)}</td><td>{formatDate(row.publishedAt)}</td></tr>)}</tbody></table></div></section>
    </div>
  )
}
