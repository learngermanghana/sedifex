import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../firebase'
import SafeFirebaseImage from './SafeFirebaseImage'

type MediaPicture = { id: string; name: string; url: string }
type UsageItem = { id: string; name: string; type: string }
type UsageResult = {
  albumRefs: UsageItem[]
  productRefs: UsageItem[]
  promoRefs: UsageItem[]
  siteRefs: UsageItem[]
  partial: boolean
}

export default function MediaUsagePanel({
  storeId,
  assets,
  initialAssetId,
  onOpenAlbum,
}: {
  storeId: string
  assets: MediaPicture[]
  initialAssetId: string
  onOpenAlbum: (id: string) => void
}) {
  const [selectedId, setSelectedId] = useState(initialAssetId || assets[0]?.id || '')
  const [result, setResult] = useState<UsageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = useMemo(() => assets.find(asset => asset.id === selectedId), [assets, selectedId])

  useEffect(() => {
    if (initialAssetId) setSelectedId(initialAssetId)
  }, [initialAssetId])

  useEffect(() => {
    if (!selected?.url) {
      setResult(null)
      return
    }
    let current = true
    setLoading(true)
    setResult(null)
    setError('')
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sign in to see picture usage.')
        const response = await fetch('/api/media-assets/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ storeId, url: selected.url }),
        })
        const data = await response.json() as UsageResult & { error?: string }
        if (!response.ok) throw new Error(data.error || 'Unable to inspect this picture.')
        if (current) setResult(data)
      } catch (requestError) {
        if (current) setError(requestError instanceof Error ? requestError.message : 'Unable to check usage.')
      } finally {
        if (current) setLoading(false)
      }
    })()
    return () => { current = false }
  }, [storeId, selected?.url])

  const used = (result?.albumRefs.length || 0) + (result?.productRefs.length || 0) + (result?.promoRefs.length || 0) + (result?.siteRefs?.length || 0)

  return (
    <div className="media-library__usage">
      <label className="media-library__usage-picker" htmlFor="media-usage-image">
        Picture to inspect
        <select id="media-usage-image" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          {!assets.length ? <option value="">No pictures yet</option> : null}
          {assets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {selected ? (
        <div className="media-library__usage-selected">
          <SafeFirebaseImage src={selected.url} alt={selected.name} />
          <div>
            <strong>{selected.name}</strong>
            <p>Known Sedifex references for this store. This check runs only when you open this tab or change the selected picture.</p>
          </div>
        </div>
      ) : <p>Upload or select a picture to inspect where it is used.</p>}
      {loading ? <p role="status">Checking this store’s albums and items…</p> : null}
      {error ? <p className="media-library__notice media-library__notice--error" role="alert">{error}</p> : null}
      {result && !loading ? (
        <div aria-live="polite" className="media-library__usage-results">
          <strong>{used ? used + ' known use' + (used === 1 ? '' : 's') : 'No known uses found'}</strong>
          {result.albumRefs.length ? (
            <div>
              <h3>Gallery albums</h3>
              {result.albumRefs.map(item => <button type="button" key={item.id} onClick={() => onOpenAlbum(item.id)}>
                {item.name} <span>Open album →</span>
              </button>)}
            </div>
          ) : null}
          {result.productRefs.length ? (
            <div>
              <h3>Items and services</h3>
              {result.productRefs.map(item => <p key={item.id}>{item.name} · <Link to="/products">Open items</Link></p>)}
            </div>
          ) : null}
          {result.promoRefs.length ? (
            <div>
              <h3>Promo gallery</h3>
              <p>{result.promoRefs.length} photo reference(s) · <Link to="/promo">Open promo</Link></p>
            </div>
          ) : null}
          {result.siteRefs?.length ? (
            <div>
              <h3>Website and blog</h3>
              {result.siteRefs.map(item => (
                <p key={item.type + ':' + item.id}>
                  {item.name} · {item.type === 'blog' ? <Link to="/blog">Open blog</Link> :
                    item.type === 'hero' ? <Link to="/website-hero-slides">Open hero slides</Link> :
                    <Link to="/promo">Open store promo</Link>}
                </p>
              ))}
            </div>
          ) : null}
          <p className="media-library__help">
            {result.partial ? 'Some collections exceeded the lookup limit. Additional references may exist. ' : ''}
            URLs embedded inside rich-text content, other custom fields or external websites cannot be reliably detected here.
            Removing a picture from an album is different from deleting the original from storage.
          </p>
        </div>
      ) : null}
    </div>
  )
}
