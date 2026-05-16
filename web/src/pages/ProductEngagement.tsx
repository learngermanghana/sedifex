import React, { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type CommentStatus = 'pending' | 'approved' | 'rejected' | string

type EngagementComment = {
  id: string
  canonicalProductKey: string
  storeId: string
  sourceProductId: string
  publicProductId: string
  body: string
  authorDisplayName: string
  originPlatform: string
  status: CommentStatus
  moderationStatus: CommentStatus
  visibility: string
  createdAt: Date | null
  updatedAt: Date | null
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as any)?.toDate === 'function') {
    const parsed = (value as any).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

function normalizeStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = status.toLowerCase()
  if (normalized === 'approved' || normalized === 'public') return 'success'
  if (normalized === 'pending') return 'warning'
  if (normalized === 'rejected' || normalized === 'hidden' || normalized === 'store_only') return 'danger'
  return 'neutral'
}

function mapComment(id: string, data: Record<string, unknown>): EngagementComment {
  const status = text(data.status ?? data.moderationStatus, 'pending')
  return {
    id,
    canonicalProductKey: text(data.canonicalProductKey),
    storeId: text(data.storeId),
    sourceProductId: text(data.sourceProductId),
    publicProductId: text(data.publicProductId),
    body: text(data.body ?? data.text, 'No comment text'),
    authorDisplayName: text(data.authorDisplayName ?? data.authorName, 'Customer'),
    originPlatform: text(data.originPlatform, 'unknown'),
    status,
    moderationStatus: text(data.moderationStatus, status),
    visibility: text(data.visibility, 'public'),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }
}

function Badge({ value }: { value: string }) {
  const tone = statusTone(value)
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: 999,
        padding: '4px 9px',
        fontSize: 12,
        fontWeight: 800,
        background: tone === 'success' ? '#DCFCE7' : tone === 'danger' ? '#FEE2E2' : tone === 'warning' ? '#FEF3C7' : '#E2E8F0',
        color: tone === 'success' ? '#166534' : tone === 'danger' ? '#991B1B' : tone === 'warning' ? '#92400E' : '#334155',
      }}
    >
      {normalizeStatus(value)}
    </span>
  )
}

function ActionButton({ children, onClick, disabled, tone = 'neutral' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'primary' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: tone === 'danger' ? '1px solid #FCA5A5' : tone === 'primary' ? '1px solid #4338CA' : '1px solid #CBD5E1',
        background: disabled ? '#F1F5F9' : tone === 'danger' ? '#FEF2F2' : tone === 'primary' ? '#EEF2FF' : '#FFFFFF',
        color: disabled ? '#94A3B8' : tone === 'danger' ? '#B91C1C' : tone === 'primary' ? '#3730A3' : '#334155',
        borderRadius: 999,
        padding: '7px 11px',
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export default function ProductEngagement() {
  const { storeId } = useActiveStore()
  const [comments, setComments] = useState<EngagementComment[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchText, setSearchText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!storeId) {
      setComments([])
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    setError('')
    const commentsQuery = query(collection(db, 'engagement_comments'), where('storeId', '==', storeId))
    const unsubscribe = onSnapshot(
      commentsQuery,
      snapshot => {
        setComments(snapshot.docs.map(commentDoc => mapComment(commentDoc.id, commentDoc.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
        setIsLoading(false)
      },
      err => {
        console.error('[product-engagement] Failed to load comments', err)
        setError('Unable to load product comments right now. Check Firestore indexes/rules, then retry.')
        setIsLoading(false)
      },
    )
    return unsubscribe
  }, [storeId])

  const stats = useMemo(() => {
    const approved = comments.filter(comment => comment.status === 'approved').length
    const pending = comments.filter(comment => comment.status === 'pending').length
    const rejected = comments.filter(comment => comment.status === 'rejected').length
    const publicComments = comments.filter(comment => comment.visibility === 'public').length
    return { approved, pending, rejected, publicComments }
  }, [comments])

  const filteredComments = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    return comments.filter(comment => {
      if (statusFilter !== 'all' && comment.status !== statusFilter) return false
      if (!search) return true
      return [comment.body, comment.authorDisplayName, comment.originPlatform, comment.sourceProductId, comment.canonicalProductKey]
        .join(' ')
        .toLowerCase()
        .includes(search)
    })
  }, [comments, searchText, statusFilter])

  async function moderateComment(comment: EngagementComment, action: 'approve' | 'hide' | 'reject') {
    setBusyId(comment.id)
    setMessage('')
    setError('')

    const status = action === 'approve' ? 'approved' : 'rejected'
    const visibility = action === 'approve' ? 'public' : 'store_only'

    try {
      await updateDoc(doc(db, 'engagement_comments', comment.id), {
        status,
        moderationStatus: status,
        visibility,
        lastModerationAction: action,
        moderatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      })
      setMessage(`Comment ${action === 'approve' ? 'approved' : action === 'hide' ? 'hidden' : 'rejected'}.`)
    } catch (err) {
      console.error('[product-engagement] Failed to moderate comment', err)
      setError('Unable to update this comment. Check Firestore rules and try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Cross-platform engagement</p>
        <h2 style={{ color: '#4338CA', margin: 0 }}>Product Engagement</h2>
        <p style={{ color: '#475569', margin: '8px 0 0' }}>
          Moderate product comments coming from Sedifex Market and connected merchant websites. Approved public comments can appear across platforms that use the shared engagement API.
        </p>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <article style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16 }}><strong>{comments.length}</strong><br /><span>Total comments</span></article>
        <article style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16 }}><strong>{stats.pending}</strong><br /><span>Pending</span></article>
        <article style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16 }}><strong>{stats.approved}</strong><br /><span>Approved</span></article>
        <article style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16 }}><strong>{stats.publicComments}</strong><br /><span>Public</span></article>
      </section>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 20, padding: 18, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'pending', 'approved', 'rejected'] as const).map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                style={{
                  border: statusFilter === filter ? '1px solid #4338CA' : '1px solid #CBD5E1',
                  background: statusFilter === filter ? '#EEF2FF' : '#FFFFFF',
                  color: statusFilter === filter ? '#3730A3' : '#334155',
                  borderRadius: 999,
                  padding: '8px 12px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {normalizeStatus(filter)}
              </button>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, minWidth: 220 }}>
            Search comments
            <input
              type="search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Text, product id, platform…"
              style={{ border: '1px solid #CBD5E1', borderRadius: 10, padding: '9px 10px' }}
            />
          </label>
        </div>

        {message ? <p style={{ margin: 0, color: '#166534', fontWeight: 700, background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 12, padding: '10px 12px' }}>{message}</p> : null}
        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>{error}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading comments…</p> : null}
        {!isLoading && !storeId ? <p style={{ margin: 0, color: '#64748B' }}>Select a workspace to view engagement.</p> : null}
        {!isLoading && storeId && filteredComments.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No comments found for this view yet.</p> : null}

        {filteredComments.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Comment</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Product</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Platform</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Actions</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredComments.map(comment => (
                  <tr key={comment.id} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <strong style={{ color: '#0F172A' }}>{comment.authorDisplayName}</strong>
                      <p style={{ margin: '6px 0 0', color: '#334155' }}>{comment.body}</p>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#475569', fontSize: 13 }}>
                      <strong>Source:</strong> {comment.sourceProductId || 'Unknown'}
                      <br />
                      <strong>Key:</strong> {comment.canonicalProductKey || 'Missing'}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#475569', fontSize: 13 }}>{normalizeStatus(comment.originPlatform)}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <Badge value={comment.status} />
                      <br />
                      <span style={{ color: '#64748B', fontSize: 12 }}>Visibility: {normalizeStatus(comment.visibility)}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <ActionButton tone="primary" disabled={busyId === comment.id || comment.status === 'approved'} onClick={() => void moderateComment(comment, 'approve')}>Approve</ActionButton>
                        <ActionButton disabled={busyId === comment.id || comment.visibility === 'store_only'} onClick={() => void moderateComment(comment, 'hide')}>Hide</ActionButton>
                        <ActionButton tone="danger" disabled={busyId === comment.id || comment.status === 'rejected'} onClick={() => void moderateComment(comment, 'reject')}>Reject</ActionButton>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#64748B', fontSize: 13 }}>{comment.createdAt ? comment.createdAt.toLocaleString() : 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
