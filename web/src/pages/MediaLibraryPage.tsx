import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy,
  query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import SafeFirebaseImage from '../components/SafeFirebaseImage'
import { uploadProductImage } from '../api/productImageUpload'
import { downloadDriveImage, pickGoogleDriveImages, type DriveImage } from '../api/googleDriveMedia'
import {
  MEDIA_BATCH_LIMIT, MEDIA_IMPORT_CONCURRENCY, mediaFileExtension, mediaSha256,
  optimizeMediaFile, uploadWithRetry,
} from '../utils/mediaLibrary'
import './AccountOverview.css'
import './MediaLibraryPage.css'

type Asset = {
  id: string
  url: string
  name: string
  source: 'device' | 'drive'
  size: number
  createdAt: { toMillis?: () => number } | null
}
type Album = { id: string; title: string; coverImageUrl: string }
type ImportTask = { name: string; source: 'device' | 'drive'; file?: File; driveImage?: DriveImage; token?: string }
type TaskState = { name: string; state: 'pending' | 'uploading' | 'done' | 'skipped' | 'failed'; message: string }

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Upload failed.'
}

function updatedAtLabel(value: Asset['createdAt']) {
  if (!value?.toMillis) return 'Recently added'
  return new Date(value.toMillis()).toLocaleDateString()
}

export default function MediaLibraryPage() {
  const { storeId, isLoading, error } = useActiveStore()
  const { publish } = useToast()
  const [assets, setAssets] = useState<Asset[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumId, setAlbumId] = useState('')
  const [newAlbumTitle, setNewAlbumTitle] = useState('')
  const [newAlbumDescription, setNewAlbumDescription] = useState('')
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tasks, setTasks] = useState<TaskState[]>([])
  const [failedTasks, setFailedTasks] = useState<ImportTask[]>([])
  const [busy, setBusy] = useState(false)
  const [openingDrive, setOpeningDrive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function refresh(id: string) {
    setLoading(true)
    try {
      const [mediaSnap, albumSnap] = await Promise.all([
        getDocs(query(collection(db, 'stores', id, 'mediaAssets'), orderBy('createdAt', 'desc'), limit(200))),
        getDocs(query(collection(db, 'stores', id, 'galleryAlbums'), orderBy('sortOrder', 'asc'))),
      ])
      setAssets(mediaSnap.docs.map(snapshot => {
        const item = snapshot.data()
        return {
          id: snapshot.id,
          url: typeof item.url === 'string' ? item.url : '',
          name: typeof item.name === 'string' ? item.name : snapshot.id,
          size: typeof item.size === 'number' ? item.size : 0,
          source: item.source === 'drive' ? 'drive' : 'device',
          createdAt: item.createdAt ?? null,
        }
      }).filter(item => item.url))
      setAlbums(albumSnap.docs.map(snapshot => ({
        id: snapshot.id,
        title: String(snapshot.data().title || 'Album'),
        coverImageUrl: String(snapshot.data().coverImageUrl || ''),
      })))
    } catch (loadError) {
      setErrorMessage('Unable to load media. Check your store access and Firestore rules.')
      console.error('[media-library] load', loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setAssets([])
    setTasks([])
    setFailedTasks([])
    setAlbumId('')
    setSelectedIds([])
    setNewAlbumTitle('')
    setNewAlbumDescription('')
    setErrorMessage('')
    if (storeId) void refresh(storeId)
  }, [storeId])

  function setTask(index: number, state: TaskState['state'], message: string) {
    setTasks(previous => previous.map((item, i) => i === index ? { ...item, state, message } : item))
  }

  async function importTasks(queue: ImportTask[]) {
    if (!storeId || busy || !queue.length) return
    if (queue.length > MEDIA_BATCH_LIMIT) {
      setErrorMessage('Select up to ' + MEDIA_BATCH_LIMIT + ' photos at a time.')
      return
    }
    const activeStoreId = storeId
    setBusy(true)
    setErrorMessage('')
    setFailedTasks([])
    setTasks(queue.map(item => ({ name: item.name, state: 'pending', message: 'Waiting' })))
    let nextIndex = 0
    let imported = 0
    let alreadyThere = 0
    const failures: ImportTask[] = []

    await Promise.all(Array.from({ length: Math.min(MEDIA_IMPORT_CONCURRENCY, queue.length) }, async () => {
      while (nextIndex < queue.length) {
        const index = nextIndex++
        const item = queue[index]
        setTask(index, 'uploading', 'Processing image')
        try {
          const original = item.file || (item.driveImage && item.token
            ? await downloadDriveImage(item.driveImage, item.token)
            : null)
          if (!original) throw new Error('Image is unavailable. Select it again.')
          const optimized = await optimizeMediaFile(original)
          const hash = await mediaSha256(optimized)
          const assetRef = doc(db, 'stores', activeStoreId, 'mediaAssets', hash)
          const previous = await getDoc(assetRef)
          if (previous.exists() && typeof previous.data().url === 'string') {
            alreadyThere += 1
            setTask(index, 'skipped', 'Already in your media library')
            continue
          }

          const storagePath = 'stores/' + activeStoreId + '/media/' + hash + mediaFileExtension(optimized)
          const token = await auth.currentUser?.getIdToken()
          if (!token) throw new Error('Sign in to Sedifex before importing pictures.')
          const url = await uploadWithRetry(() => uploadProductImage(optimized, { storagePath, authToken: token }))
          await setDoc(assetRef, {
            url,
            name: original.name.slice(0, 220),
            source: item.source,
            sourceId: item.source === 'drive' ? item.driveImage?.id || null : null,
            sha256: hash,
            size: optimized.size,
            mimeType: optimized.type,
            createdAt: serverTimestamp(),
          })
          imported += 1
          setTask(index, 'done', 'Ready for your website')
        } catch (uploadError) {
          failures.push(item)
          setTask(index, 'failed', messageFrom(uploadError))
        }
      }
    }))
    setFailedTasks(failures)
    setBusy(false)
    await refresh(activeStoreId)
    publish({
      tone: failures.length ? 'error' : 'success',
      message: imported + ' uploaded, ' + alreadyThere + ' already present, ' + failures.length + ' failed.',
    })
  }

  async function chooseDrivePhotos() {
    if (busy || openingDrive || !storeId) return
    setOpeningDrive(true)
    setErrorMessage('')
    try {
      const selected = await pickGoogleDriveImages()
      if (selected.images.length) {
        await importTasks(selected.images.map(image => ({
          name: image.name,
          source: 'drive' as const,
          driveImage: image,
          token: selected.accessToken,
        })))
      }
    } catch (pickError) {
      setErrorMessage(messageFrom(pickError))
    } finally {
      setOpeningDrive(false)
    }
  }

  async function createAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId || creatingAlbum) return
    const title = newAlbumTitle.trim()
    if (!title) {
      setErrorMessage('Enter an album name before creating it.')
      return
    }
    if (title.length > 100) {
      setErrorMessage('Album names must be 100 characters or fewer.')
      return
    }
    const existing = albums.find(album => album.title.toLocaleLowerCase() === title.toLocaleLowerCase())
    if (existing) {
      setAlbumId(existing.id)
      setErrorMessage('')
      publish({ tone: 'success', message: 'This album already exists. It is now selected.' })
      return
    }
    setCreatingAlbum(true)
    setErrorMessage('')
    try {
      const created = await addDoc(collection(db, 'stores', storeId, 'galleryAlbums'), {
        title,
        description: newAlbumDescription.trim() || null,
        coverImageUrl: null,
        isPublished: true,
        sortOrder: albums.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setAlbums(previous => [...previous, { id: created.id, title, coverImageUrl: '' }])
      setAlbumId(created.id)
      setNewAlbumTitle('')
      setNewAlbumDescription('')
      publish({ tone: 'success', message: 'Album created and selected. Choose pictures to add.' })
    } catch (saveError) {
      setErrorMessage('Unable to create album: ' + messageFrom(saveError))
    } finally {
      setCreatingAlbum(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(previous => previous.includes(id)
      ? previous.filter(item => item !== id)
      : [...previous, id])
  }

  async function addAssetsToAlbum(pictures: Asset[]) {
    if (!storeId || publishing || !pictures.length) return
    if (!albumId) {
      setErrorMessage('Choose or create a gallery album first.')
      return
    }
    const selectedAlbum = albums.find(album => album.id === albumId)
    if (!selectedAlbum) {
      setErrorMessage('The selected album is unavailable. Choose an album again.')
      return
    }
    setPublishing(true)
    setErrorMessage('')
    try {
      const targetId = albumId
      // Query only the selected album instead of reading every gallery image in the store.
      const gallery = collection(db, 'stores', storeId, 'galleryImages')
      const existing = await getDocs(query(gallery, where('albumId', '==', targetId)))
      const existingUrls = new Set(existing.docs.map(image => String(image.data().url || '')))
      const unique = pictures.filter((asset, index, all) =>
        !existingUrls.has(asset.url) && all.findIndex(item => item.url === asset.url) === index)
      if (!unique.length) {
        setSelectedIds([])
        publish({ tone: 'success', message: 'These pictures are already in the selected album.' })
        return
      }
      const batch = writeBatch(db)
      const order = Date.now()
      for (const [index, asset] of unique.entries()) {
        batch.set(doc(gallery), {
          albumId: targetId,
          url: asset.url,
          alt: asset.name.replace(/\.[^.]+$/, ''),
          caption: null,
          isPublished: true,
          sortOrder: order + index,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      if (!selectedAlbum.coverImageUrl) {
        batch.set(doc(db, 'stores', storeId, 'galleryAlbums', targetId), {
          coverImageUrl: unique[0].url,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      if (!selectedAlbum.coverImageUrl) {
        setAlbums(previous => previous.map(album => album.id === targetId
          ? { ...album, coverImageUrl: unique[0].url } : album))
      }
      setSelectedIds([])
      const skipped = pictures.length - unique.length
      publish({ tone: 'success', message: unique.length + ' picture(s) added to "' + selectedAlbum.title + '".' + (skipped ? ' ' + skipped + ' already added.' : '') })
    } catch (saveError) {
      setErrorMessage('Unable to add pictures: ' + messageFrom(saveError))
    } finally {
      setPublishing(false)
    }
  }

  const selectedAssets = assets.filter(asset => selectedIds.includes(asset.id))
  const hasAlbum = Boolean(albumId && albums.some(album => album.id === albumId))

  const imported = tasks.filter(item => item.state === 'done').length
  const completed = tasks.filter(item => item.state === 'done' || item.state === 'skipped' || item.state === 'failed').length

  if (error) return <div role="alert">{error}</div>
  return (
    <main className="account-overview">
      <header className="account-overview__section-header">
        <div>
          <h1>Media Library</h1>
          <p className="account-overview__subtitle">Upload many product and gallery photos, or import selected pictures from your Google Drive. Only photos you publish to a product or gallery appear there.</p>
        </div>
      </header>
      {!storeId && !isLoading ? <p>Select a store first.</p> : null}
      {errorMessage ? <p className="account-overview__error" role="alert">{errorMessage}</p> : null}
      {storeId ? (
        <>
          <section className="account-overview__card">
            <h2>Import pictures</h2>
            <p className="account-overview__hint">JPEG, PNG, WebP or AVIF, up to 25 MB each and 100 at a time. Photos are resized in your browser and saved to Sedifex's existing image storage.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label className="button button--primary" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
                Upload from device
                <input aria-label="Select photos from device" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple
                  disabled={busy || openingDrive} style={{ display: 'none' }}
                  onChange={event => {
                    const selected = Array.from(event.currentTarget.files || [])
                    event.currentTarget.value = ''
                    void importTasks(selected.map(file => ({ name: file.name, source: 'device', file })))
                  }}
                />
              </label>
              <button type="button" className="button button--secondary" disabled={busy || openingDrive} onClick={() => void chooseDrivePhotos()}>
                {openingDrive ? 'Opening Google Drive…' : 'Import from Google Drive'}
              </button>
              {failedTasks.length ? <button type="button" className="button button--secondary" disabled={busy || openingDrive} onClick={() => void importTasks(failedTasks)}>Retry {failedTasks.length} failed</button> : null}
            </div>
            <p className="account-overview__hint">For Drive: sign in with any Google account, open a folder and select multiple photos. Sedifex only reads pictures you choose; this is not continuous folder sync.</p>
            {tasks.length ? (
              <div aria-live="polite" style={{ marginTop: 16 }}>
                <p><strong>{completed} / {tasks.length}</strong> processed · {imported} imported this batch</p>
                <progress max={tasks.length} value={completed} style={{ width: '100%' }} />
                <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
                  {tasks.map((task, index) => (
                    <p key={index} style={{ fontSize: 13, margin: '4px 0' }}>{task.state === 'done' ? '✓' : task.state === 'failed' ? '✕' : '•'} {task.name}: {task.message}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          <section className="account-overview__card">
            <h2>Website image library</h2>
            <p className="account-overview__hint">These URLs can be used by your existing product, gallery and website integrations. Importing alone does not automatically publish photos.</p>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span>Publish selected photo to gallery album</span>
              <select value={albumId} onChange={event => setAlbumId(event.target.value)} style={{ display: 'block', maxWidth: 380, width: '100%', marginTop: 5 }}>
                <option value="">Choose an album (optional)</option>
                {albums.map(album => <option key={album.id} value={album.id}>{album.title}</option>)}
              </select>
            </label>
            <p className="account-overview__hint">Need a new album? <Link to="/gallery">Manage gallery albums</Link>. For products, use the “Choose from Media Library” control in the product editor.</p>
            {loading ? <p>Loading images…</p> : null}
            {!loading && assets.length === 0 ? <p>No pictures imported yet.</p> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))', gap: 12 }}>
              {assets.map(asset => (
                <article key={asset.id} style={{ border: '1px solid #d6dde6', borderRadius: 12, overflow: 'hidden' }}>
                  <SafeFirebaseImage src={asset.url} alt={asset.name} style={{ width: '100%', height: 130, objectFit: 'cover' }} />
                  <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                    <strong style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{asset.name}</strong>
                    <small>{asset.source === 'drive' ? 'Google Drive' : 'Device'} · {updatedAtLabel(asset.createdAt)}</small>
                    <button className="button button--secondary button--small" type="button" onClick={() => void navigator.clipboard.writeText(asset.url).then(() => publish({ tone: 'success', message: 'Image URL copied.' }))}>Copy image URL</button>
                    <button className="button button--secondary button--small" type="button" disabled={!albumId} onClick={() => void addToAlbum(asset)}>Add to album</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
