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
import MediaAlbumEditor, { type MediaGalleryAlbum } from '../components/MediaAlbumEditor'
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
  source: 'device' | 'drive' | 'gallery' | 'promo-gallery'
  size: number
  createdAt: { toMillis?: () => number } | null
}
type Album = MediaGalleryAlbum
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
  const [editingAlbumId, setEditingAlbumId] = useState('')
  const [albumRevision, setAlbumRevision] = useState(0)
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
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)
  const [dragging, setDragging] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  async function refresh(id: string) {
    setLoading(true)
    try {
      const [mediaSnap, albumSnap, albumImagesSnap, promoImagesSnap] = await Promise.all([
        getDocs(query(collection(db, 'stores', id, 'mediaAssets'), orderBy('createdAt', 'desc'), limit(200))),
        getDocs(query(collection(db, 'stores', id, 'galleryAlbums'), orderBy('sortOrder', 'asc'))),
        getDocs(query(collection(db, 'stores', id, 'galleryImages'), limit(100))),
        getDocs(query(collection(db, 'stores', id, 'promoGallery'), limit(100))),
      ])
      const mediaAssets: Asset[] = mediaSnap.docs.map(snapshot => {
        const item = snapshot.data()
        return {
          id: snapshot.id,
          url: typeof item.url === 'string' ? item.url : '',
          name: typeof item.name === 'string' ? item.name : snapshot.id,
          size: typeof item.size === 'number' ? item.size : 0,
          source: item.source === 'drive' ? 'drive' as const : 'device' as const,
          createdAt: item.createdAt ?? null,
        }
      })
      // Gallery records predate Media Library metadata. Show their existing
      // public image URLs as reusable assets rather than re-uploading copies.
      const galleryAssets: Asset[] = albumImagesSnap.docs.map(snapshot => {
        const item = snapshot.data()
        return {
          id: 'gallery:' + snapshot.id,
          url: typeof item.url === 'string' ? item.url : '',
          name: typeof item.alt === 'string' && item.alt ? item.alt
            : typeof item.caption === 'string' && item.caption ? item.caption : 'Gallery picture',
          size: 0,
          source: 'gallery' as const,
          createdAt: item.createdAt ?? null,
        }
      })
      const promoAssets: Asset[] = promoImagesSnap.docs.map(snapshot => {
        const item = snapshot.data()
        return {
          id: 'promo:' + snapshot.id,
          url: typeof item.url === 'string' ? item.url : typeof item.imageUrl === 'string' ? item.imageUrl : '',
          name: typeof item.alt === 'string' && item.alt ? item.alt
            : typeof item.caption === 'string' && item.caption ? item.caption : 'Existing promo picture',
          size: 0,
          source: 'promo-gallery' as const,
          createdAt: item.createdAt ?? null,
        }
      })
      const seenUrls = new Set<string>()
      setAssets([...mediaAssets, ...galleryAssets, ...promoAssets].filter(item => {
        if (!/^https?:\/\//i.test(item.url) || seenUrls.has(item.url)) return false
        seenUrls.add(item.url)
        return true
      }))
      setAlbums(albumSnap.docs.map(snapshot => ({
        id: snapshot.id,
        title: String(snapshot.data().title || 'Album'),
        coverImageUrl: String(snapshot.data().coverImageUrl || ''),
        description: String(snapshot.data().description || ''),
        isPublished: snapshot.data().isPublished !== false,
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
    setEditingAlbumId('')
    setAlbumRevision(0)
    setSelectedIds([])
    setNewAlbumTitle('')
    setNewAlbumDescription('')
    setErrorMessage('')
    setActiveStep(1)
    setDragging(false)
    setDeletingId('')
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
      setAlbums(previous => [...previous, { id: created.id, title, description: newAlbumDescription.trim(), coverImageUrl: '', isPublished: true }])
      setAlbumId(created.id)
      setEditingAlbumId(created.id)
      setNewAlbumTitle('')
      setNewAlbumDescription('')
      publish({ tone: 'success', message: 'Album created and selected. Choose pictures to add.' })
    } catch (saveError) {
      setErrorMessage('Unable to create album: ' + messageFrom(saveError))
    } finally {
      setCreatingAlbum(false)
    }
  }

  async function deleteAsset(asset: Asset) {
    if (!storeId || deletingId || busy || publishing || !['device', 'drive'].includes(asset.source)) return
    if (!window.confirm('Permanently delete "' + asset.name + '" from this store? This cannot be undone. Pictures still used by albums or items cannot be deleted.')) return
    setDeletingId(asset.id)
    setErrorMessage('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Sign in to delete pictures.')
      const response = await fetch('/api/media-assets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ storeId, assetId: asset.id }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(detail.error || 'Could not delete the picture.')
      }
      setAssets(previous => previous.filter(item => item.id !== asset.id))
      setSelectedIds(previous => previous.filter(id => id !== asset.id))
      publish({ tone: 'success', message: 'Picture permanently deleted from your store.' })
    } catch (deleteError) {
      setErrorMessage(messageFrom(deleteError))
    } finally {
      setDeletingId('')
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
      setAlbumRevision(previous => previous + 1)
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
  const activeAlbum = albums.find(album => album.id === albumId)

  const imported = tasks.filter(item => item.state === 'done').length
  const completed = tasks.filter(item => item.state === 'done' || item.state === 'skipped' || item.state === 'failed').length

  if (error) return <div role="alert">{error}</div>
  return (
    <main className="account-overview media-library">
      <header className="media-library__hero">
        <span className="media-library__eyebrow">Website content <span aria-hidden="true">/</span> Media Library</span>
        <h1>Your pictures, ready for the web.</h1>
        <p>Bring pictures from your device or Google Drive into one organized library. Create albums here, then choose which pictures to publish to your website gallery or products.</p>
      </header>

      <nav className="media-library__steps" aria-label="Media Library steps">
        {([
          { step: 1 as const, name: 'Import pictures', detail: assets.length + ' pictures', complete: assets.length > 0 },
          { step: 2 as const, name: 'Albums', detail: '', complete: hasAlbum },
          { step: 3 as const, name: 'Select & publish', detail: '', complete: false },
        ]).map(({ step, name, detail, complete }) => (
          <button type="button" key={step}
            className={'media-library__step' + (activeStep === step ? ' is-active' : '')}
            aria-current={activeStep === step ? 'step' : undefined}
            onClick={() => { setActiveStep(step); setErrorMessage('') }}>
            <span className="media-library__step-dot" aria-hidden="true">{complete && activeStep !== step ? '✓' : step}</span>
            <span>{name}</span>
            {detail ? <small>{detail}</small> : null}
          </button>
        ))}
      </nav>

      {!storeId && !isLoading ? <p className="media-library__notice">Select a store first.</p> : null}
      {errorMessage ? <p className="media-library__notice media-library__notice--error" role="alert">{errorMessage}</p> : null}

      {storeId ? (
        <>
          {activeStep === 1 ? <section id="media-library-step-1" className="account-overview__card media-library__panel" aria-labelledby="media-import-title">
            <div className="media-library__section-heading">
              <div>
                <h2 id="media-import-title"><span className="media-library__section-number">1</span>Import your pictures</h2>
                <p>Upload up to 100 JPEG, PNG, WebP or AVIF photos at once (25 MB source limit). Sedifex optimizes pictures for fast websites.</p>
              </div>
              <span className="media-library__count">{assets.length} pictures</span>
            </div>
            <div className={'media-library__upload-zone' + (dragging ? ' is-dragging' : '')}
              onDragEnter={event => { event.preventDefault(); setDragging(true) }}
              onDragOver={event => { event.preventDefault(); setDragging(true) }}
              onDragLeave={event => { event.preventDefault(); setDragging(false) }}
              onDrop={event => {
                event.preventDefault()
                setDragging(false)
                if (!busy && !openingDrive) {
                  void importTasks(Array.from(event.dataTransfer.files).map(file => ({ name: file.name, source: 'device' as const, file })))
                }
              }}>
              <div className="media-library__drop-instruction">
                <span className="media-library__drop-icon" aria-hidden="true">↑</span>
                <strong>Drop pictures here or choose files</strong>
                <span>25 MB source limit per picture</span>
              </div>
              <div className="media-library__actions">
              <label className="button button--primary media-library__upload" aria-disabled={busy || openingDrive}>
                Upload from device
                <input aria-label="Select photos from device" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple
                  disabled={busy || openingDrive}
                  onChange={event => {
                    const selected = Array.from(event.currentTarget.files || [])
                    event.currentTarget.value = ''
                    void importTasks(selected.map(file => ({ name: file.name, source: 'device', file })))
                  }}
                />
              </label>
              <button type="button" className="button button--secondary" disabled={busy || openingDrive}
                onClick={() => void chooseDrivePhotos()}>
                {openingDrive ? 'Opening Google Drive…' : 'Import from Google Drive'}
              </button>
              {failedTasks.length > 0 ? (
                <button type="button" className="button button--secondary" disabled={busy || openingDrive}
                  onClick={() => void importTasks(failedTasks)}>Retry {failedTasks.length} failed</button>
              ) : null}
            </div>
              </div>
              <p className="media-library__help">Google Drive import reads only the pictures you select. Imported photos are stored in Sedifex; original Drive files remain unchanged.</p>
            </div>
            {tasks.length > 0 ? (
              <div className="media-library__progress" aria-live="polite">
                <div className="media-library__progress-label"><strong>{completed} / {tasks.length} processed</strong><span>{imported} new pictures imported</span></div>
                <progress max={tasks.length} value={completed} />
                <div className="media-library__task-list">
                  {tasks.map((task, index) => (
                    <p key={index} className={'media-library__task media-library__task--' + task.state}>
                      {task.state === 'done' ? '✓' : task.state === 'failed' ? '✕' : '•'} {task.name}: {task.message}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </section> : null}

          {activeStep === 2 ? <section id="media-library-step-2" className="account-overview__card media-library__panel" aria-labelledby="media-albums-title">
            <div className="media-library__section-heading">
              <div>
                <h2 id="media-albums-title"><span className="media-library__section-number">2</span>Choose or create an album</h2>
                <p>Albums organize pictures on your website. You can create one without leaving this page.</p>
              </div>
              <Link to="/gallery" className="media-library__text-link">Manage all albums</Link>
            </div>
            <div className="media-library__album-tools">
              <div className="media-library__album-select">
                <label htmlFor="media-library-album">Gallery album</label>
                <select id="media-library-album" value={albumId} onChange={event => { setAlbumId(event.target.value); setEditingAlbumId('') }}
                  disabled={publishing || creatingAlbum}>
                  <option value="">Select an album</option>
                  {albums.map(album => <option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
                {!hasAlbum ? <span className="media-library__help">{albums.length ? 'Select an album to enable publishing.' : 'No albums yet. Create your first one on the right.'}</span>
                  : <span className="media-library__album-ready">✓ Album selected — choose pictures below</span>}
                {activeAlbum ? (
                  <div className="media-library__album-controls">
                    <span className={activeAlbum.isPublished ? 'media-library__album-ready' : 'media-library__help'}>{activeAlbum.isPublished ? 'Published album' : 'Hidden album'}</span>
                    <button type="button" className="button button--secondary" onClick={() => setEditingAlbumId(current => current === activeAlbum.id ? '' : activeAlbum.id)} disabled={publishing}>
                      {editingAlbumId === activeAlbum.id ? 'Close album editor' : 'Edit album'}
                    </button>
                  </div>
                ) : null}
              </div>
              <form className="media-library__create-form" onSubmit={event => void createAlbum(event)}>
                <label htmlFor="media-library-new-album">Create a new album</label>
                <div className="media-library__create-row">
                  <input id="media-library-new-album" placeholder="e.g. Products, Salon Gallery, Events" value={newAlbumTitle}
                    onChange={event => setNewAlbumTitle(event.target.value)} maxLength={100} required disabled={creatingAlbum} />
                  <button className="button button--primary" type="submit" disabled={creatingAlbum || !newAlbumTitle.trim()}>
                    {creatingAlbum ? 'Creating…' : '+ Create album'}
                  </button>
                </div>
                <label className="media-library__optional" htmlFor="media-library-description">Description (optional)</label>
                <input id="media-library-description" placeholder="What this album is for" value={newAlbumDescription}
                  onChange={event => setNewAlbumDescription(event.target.value)} maxLength={240} disabled={creatingAlbum}/>
              </form>
            </div>
            {activeAlbum && editingAlbumId === activeAlbum.id ? (
              <MediaAlbumEditor key={activeAlbum.id} storeId={storeId} album={activeAlbum} otherAlbums={albums} revision={albumRevision}
                onUpdate={updated => setAlbums(previous => previous.map(album => album.id === updated.id ? updated : album))}
                onClose={() => setEditingAlbumId('')} />
            ) : null}
          </section> : null}

          {activeStep === 3 ? <section id="media-library-step-3" className="account-overview__card media-library__panel" aria-labelledby="media-pictures-title">
            <div className="media-library__section-heading">
              <div>
                <h2 id="media-pictures-title"><span className="media-library__section-number">3</span>Select and publish pictures</h2>
                <p>Choose new uploads or pictures already saved in your old Gallery. Original files are reused without uploading them again.</p>
              </div>
            </div>
            <div className="media-library__workspace">
            <div className="media-library__selection-toolbar">
              <label className="media-library__select-all">
                <input type="checkbox" checked={assets.length > 0 && selectedIds.length === assets.length}
                  disabled={assets.length === 0 || publishing}
                  onChange={event => setSelectedIds(event.target.checked ? assets.map(asset => asset.id) : [])} />
                Select all ({assets.length})
              </label>
              <span className="media-library__selected-count">{selectedIds.length} selected</span>
              <button type="button" className="media-library__change-album" onClick={() => setActiveStep(2)}>Choose album</button>
            </div>
            {!hasAlbum ? <p className="media-library__notice">Choose or create a gallery album above to enable “Add to album”. You can still copy image URLs.</p> : null}
            {loading ? <p>Loading pictures…</p> : null}
            {!loading && assets.length === 0 ? <p className="media-library__empty">No pictures imported yet. Upload a few pictures or choose them from Google Drive above.</p> : null}
            <div className="media-library__grid">
              {assets.map(asset => {
                const selected = selectedIds.includes(asset.id)
                return (
                  <article key={asset.id} className={'media-library__tile' + (selected ? ' is-selected' : '')}>
                    <div className="media-library__thumbnail">
                      <SafeFirebaseImage src={asset.url} alt={asset.name} />
                      <label className="media-library__tile-select">
                        <input type="checkbox" checked={selected} disabled={publishing || Boolean(deletingId)}
                          onChange={() => toggleSelected(asset.id)}
                          aria-label={'Select ' + asset.name} />
                      </label>
                    </div>
                    <div className="media-library__tile-body">
                      <strong title={asset.name}>{asset.name}</strong>
                      <small>{asset.source === 'drive' ? 'Google Drive' : asset.source === 'gallery' ? 'Existing album' : asset.source === 'promo-gallery' ? 'Original gallery' : 'Device'} · {updatedAtLabel(asset.createdAt)}</small>
                      <div className="media-library__tile-actions">
                        <button className="button button--secondary button--small" type="button"
                          onClick={() => void navigator.clipboard.writeText(asset.url)
                            .then(() => publish({ tone: 'success', message: 'Image URL copied.' }))
                            .catch(() => setErrorMessage('Could not copy the URL. Try again.'))}>Copy URL</button>
                        <button className="button button--primary button--small" type="button"
                          disabled={!hasAlbum || publishing} onClick={() => void addAssetsToAlbum([asset])}>
                          {publishing ? 'Adding…' : 'Add to album'}
                        </button>
                        {(asset.source === 'device' || asset.source === 'drive') ? (
                          <button className="media-library__delete" type="button"
                            disabled={Boolean(deletingId) || busy || publishing}
                            onClick={() => void deleteAsset(asset)}>
                            {deletingId === asset.id ? 'Deleting…' : 'Delete picture'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            <p className="media-library__help">For product listings, open the product editor and select <strong>Choose from Media Library</strong>. Adding to a gallery album does not automatically attach a photo to a product.</p>
            <div className="media-library__publish-bar">
              <div><strong>{selectedIds.length} picture{selectedIds.length === 1 ? '' : 's'} selected</strong>
                <span>{hasAlbum ? 'Ready for ' + activeAlbum?.title : 'Choose or create an album to continue'}</span></div>
              <button type="button" className="button button--primary" disabled={!hasAlbum || !selectedAssets.length || publishing}
                onClick={() => void addAssetsToAlbum(selectedAssets)}>
                {publishing ? 'Publishing…' : 'Add selected to album'}
              </button>
            </div>
            </div>
          </section> : null}
        </>
      ) : null}
    </main>
  )
}
