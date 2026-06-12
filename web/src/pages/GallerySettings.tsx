import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadProductImage } from '../api/productImageUpload'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type Album = {
  id: string
  title: string
  description: string
  coverImageUrl: string
  isPublished: boolean
  sortOrder: number
}

type GalleryImage = {
  id: string
  albumId: string
  url: string
  alt: string
  caption: string
  isPublished: boolean
  sortOrder: number
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'gallery'
}

export default function GallerySettings() {
  const { storeId, isLoading, error } = useActiveStore()
  const { publish } = useToast()
  const [albums, setAlbums] = useState<Album[]>([])
  const [images, setImages] = useState<GalleryImage[]>([])
  const [activeAlbumId, setActiveAlbumId] = useState('')
  const [albumTitle, setAlbumTitle] = useState('')
  const [albumDescription, setAlbumDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadGallery(activeStoreId: string) {
    setBusy(true)
    setMessage('')
    try {
      const albumSnap = await getDocs(query(collection(db, 'stores', activeStoreId, 'galleryAlbums'), orderBy('sortOrder', 'asc')))
      const nextAlbums = albumSnap.docs.map(albumDoc => {
        const data = albumDoc.data()
        return {
          id: albumDoc.id,
          title: text(data.title),
          description: text(data.description),
          coverImageUrl: text(data.coverImageUrl),
          isPublished: data.isPublished !== false,
          sortOrder: numberValue(data.sortOrder),
        }
      })
      setAlbums(nextAlbums)
      setActiveAlbumId(current => current || nextAlbums[0]?.id || '')

      const imageSnap = await getDocs(query(collection(db, 'stores', activeStoreId, 'galleryImages'), orderBy('sortOrder', 'asc')))
      setImages(imageSnap.docs.map(imageDoc => {
        const data = imageDoc.data()
        return {
          id: imageDoc.id,
          albumId: text(data.albumId),
          url: text(data.url),
          alt: text(data.alt),
          caption: text(data.caption),
          isPublished: data.isPublished !== false,
          sortOrder: numberValue(data.sortOrder),
        }
      }))
    } catch (loadError) {
      console.error('[gallery] load failed', loadError)
      setMessage('Unable to load gallery albums.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!storeId) return
    void loadGallery(storeId)
  }, [storeId])

  const activeImages = useMemo(
    () => images.filter(image => image.albumId === activeAlbumId),
    [activeAlbumId, images],
  )

  async function createAlbum(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !albumTitle.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const created = await addDoc(collection(db, 'stores', storeId, 'galleryAlbums'), {
        title: albumTitle.trim(),
        description: albumDescription.trim() || null,
        coverImageUrl: null,
        isPublished: true,
        sortOrder: albums.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setAlbumTitle('')
      setAlbumDescription('')
      setActiveAlbumId(created.id)
      await loadGallery(storeId)
      publish({ message: 'Gallery album created.', tone: 'success' })
    } catch (saveError) {
      console.error('[gallery] album create failed', saveError)
      setMessage('Unable to create album.')
    } finally {
      setBusy(false)
    }
  }

  async function addImage(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !activeAlbumId) return
    const finalUrl = imageUrl.trim()
    if (!finalUrl) return
    setBusy(true)
    setMessage('')
    try {
      const created = await addDoc(collection(db, 'stores', storeId, 'galleryImages'), {
        albumId: activeAlbumId,
        url: finalUrl,
        alt: imageAlt.trim() || null,
        caption: imageCaption.trim() || null,
        isPublished: true,
        sortOrder: activeImages.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const album = albums.find(item => item.id === activeAlbumId)
      if (album && !album.coverImageUrl) {
        await setDoc(doc(db, 'stores', storeId, 'galleryAlbums', activeAlbumId), {
          coverImageUrl: finalUrl,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      setImageUrl('')
      setImageAlt('')
      setImageCaption('')
      await loadGallery(storeId)
      publish({ message: `Image added to album. ${created.id}`, tone: 'success' })
    } catch (saveError) {
      console.error('[gallery] image add failed', saveError)
      setMessage('Unable to add image.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadImage() {
    if (!storeId || !activeAlbumId || !imageFile) return
    setUploading(true)
    setMessage('')
    try {
      const album = albums.find(item => item.id === activeAlbumId)
      const url = await uploadProductImage(imageFile, {
        storagePath: `stores/${storeId}/gallery/${slug(album?.title || activeAlbumId)}-${Date.now()}.jpg`,
      })
      setImageUrl(url)
      setImageFile(null)
      publish({ message: 'Gallery image uploaded. Save it to add it to the album.', tone: 'success' })
    } catch (uploadError) {
      console.error('[gallery] image upload failed', uploadError)
      setMessage('Unable to upload image. Try a smaller image.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteAlbum(albumId: string) {
    if (!storeId) return
    const confirmed = window.confirm('Delete this album and remove its images from the gallery?')
    if (!confirmed) return
    setBusy(true)
    try {
      await Promise.all(images.filter(image => image.albumId === albumId).map(image => deleteDoc(doc(db, 'stores', storeId, 'galleryImages', image.id))))
      await deleteDoc(doc(db, 'stores', storeId, 'galleryAlbums', albumId))
      setActiveAlbumId('')
      await loadGallery(storeId)
      publish({ message: 'Album deleted.', tone: 'success' })
    } catch (deleteError) {
      console.error('[gallery] album delete failed', deleteError)
      setMessage('Unable to delete album.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteImage(imageId: string) {
    if (!storeId) return
    await deleteDoc(doc(db, 'stores', storeId, 'galleryImages', imageId))
    await loadGallery(storeId)
    publish({ message: 'Image removed.', tone: 'success' })
  }

  if (error) return <div role="alert">{error}</div>

  return (
    <main className="account-overview">
      <header className="account-overview__section-header">
        <div>
          <h1>Gallery albums</h1>
          <p className="account-overview__subtitle">Group pictures by class, event, product line, campaign, or project so websites can pull images cleanly.</p>
        </div>
      </header>

      <div className="account-overview__banner" role="note">
        <p><strong>Gallery is custom navigation.</strong> Add /gallery from Account → Navigation settings only for stores that need albums.</p>
      </div>

      {isLoading || busy ? <p>Loading…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}

      {storeId ? (
        <>
          <section className="account-overview__card">
            <h2>Create album</h2>
            <form className="account-overview__website-sync-test" onSubmit={createAlbum}>
              <label><span>Album title</span><input value={albumTitle} onChange={event => setAlbumTitle(event.target.value)} placeholder="Graduation 2026" /></label>
              <label><span>Description</span><input value={albumDescription} onChange={event => setAlbumDescription(event.target.value)} placeholder="Optional album note" /></label>
              <button className="button button--primary" type="submit" disabled={busy || !albumTitle.trim()}>Create album</button>
            </form>
          </section>

          {albums.length > 0 ? (
            <section className="account-overview__card">
              <h2>Albums</h2>
              <div className="account-overview__tabs">
                {albums.map(album => (
                  <button key={album.id} type="button" className={`account-overview__tab ${activeAlbumId === album.id ? 'is-active' : ''}`} onClick={() => setActiveAlbumId(album.id)}>
                    {album.title || 'Untitled album'}
                  </button>
                ))}
              </div>
              {activeAlbumId ? <button type="button" className="button button--ghost" onClick={() => void deleteAlbum(activeAlbumId)}>Delete selected album</button> : null}
            </section>
          ) : null}

          {activeAlbumId ? (
            <section className="account-overview__card">
              <h2>Add image</h2>
              <form className="account-overview__website-sync-test" onSubmit={addImage}>
                <label><span>Upload image</span><input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] ?? null)} /></label>
                <button type="button" className="button button--secondary" disabled={!imageFile || uploading} onClick={() => void uploadImage()}>{uploading ? 'Uploading…' : 'Upload image'}</button>
                <label><span>Image URL</span><input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} /></label>
                <label><span>Alt text</span><input value={imageAlt} onChange={event => setImageAlt(event.target.value)} /></label>
                <label><span>Caption</span><input value={imageCaption} onChange={event => setImageCaption(event.target.value)} /></label>
                <button type="submit" className="button button--primary" disabled={!imageUrl.trim()}>Save image to album</button>
              </form>
            </section>
          ) : null}

          <section className="account-overview__card">
            <h2>Images in selected album</h2>
            {activeImages.length === 0 ? <p className="account-overview__hint">No images in this album yet.</p> : null}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {activeImages.map(image => (
                <figure key={image.id} style={{ margin: 0, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  <SafeFirebaseImage src={image.url} alt={image.alt || image.caption || 'Gallery image'} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                  <figcaption style={{ padding: 8, fontSize: 12 }}>{image.caption || image.alt || 'Gallery image'}</figcaption>
                  <button type="button" className="button button--ghost" onClick={() => void deleteImage(image.id)}>Remove</button>
                </figure>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
