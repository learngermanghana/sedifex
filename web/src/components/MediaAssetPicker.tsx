import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import SafeFirebaseImage from './SafeFirebaseImage'

type Asset = { id: string; name: string; url: string }

export default function MediaAssetPicker({
  storeId,
  onSelect,
  disabled = false,
}: {
  storeId: string | null
  onSelect: (url: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Asset[]>([])
  const [error, setError] = useState('')

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    if (!storeId) return
    setOpen(true)
    setLoading(true)
    setError('')
    try {
      const [snapshot, albums, legacy] = await Promise.all([
        getDocs(query(collection(db, 'stores', storeId, 'mediaAssets'), orderBy('createdAt', 'desc'), limit(100))),
        getDocs(query(collection(db, 'stores', storeId, 'galleryImages'), limit(100))),
        getDocs(query(collection(db, 'stores', storeId, 'promoGallery'), limit(100))),
      ])
      const entries: Asset[] = [
        ...snapshot.docs.map(row => ({
          id: row.id,
          url: String(row.data().url || ''),
          name: String(row.data().name || 'Photo'),
        })),
        ...albums.docs.map(row => ({
          id: 'album:' + row.id,
          url: String(row.data().url || ''),
          name: String(row.data().alt || row.data().caption || 'Existing album picture'),
        })),
        ...legacy.docs.map(row => ({
          id: 'promo:' + row.id,
          url: String(row.data().url || row.data().imageUrl || ''),
          name: String(row.data().alt || row.data().caption || 'Original gallery picture'),
        })),
      ]
      const seenUrls = new Set<string>()
      setItems(entries.filter(item => {
        if (!/^https?:\/\//i.test(item.url) || seenUrls.has(item.url)) return false
        seenUrls.add(item.url)
        return true
      }))
    } catch {
      setError('Unable to read the media library for this store.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ margin: '10px 0' }}>
      <button type="button" className="button button--secondary" disabled={disabled || !storeId} onClick={() => void toggle()}>
        {open ? 'Close Media Library' : 'Choose from Media Library'}
      </button>
      {open ? (
        <div style={{ border: '1px solid #d6dde6', borderRadius: 12, padding: 12, marginTop: 10 }}>
          <p style={{ marginTop: 0 }}>Choose an existing photo, or <Link to="/media-library">upload many photos from your device or Google Drive</Link>.</p>
          {loading ? <p>Loading photos…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {!loading && !error && items.length === 0 ? <p>No photos imported yet.</p> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, maxHeight: 320, overflow: 'auto' }}>
            {items.map(item => (
              <button type="button" key={item.id} onClick={() => { onSelect(item.url); setOpen(false) }}
                style={{ background: 'transparent', border: '1px solid #dde3ea', borderRadius: 9, overflow: 'hidden', cursor: 'pointer', padding: 4 }}>
                <SafeFirebaseImage src={item.url} alt={item.name} style={{ width: '100%', height: 95, objectFit: 'cover', display: 'block' }} />
                <span style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
