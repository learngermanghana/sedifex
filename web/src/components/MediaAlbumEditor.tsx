import React, { useEffect, useState } from 'react'
import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import SafeFirebaseImage from './SafeFirebaseImage'
import { useToast } from './ToastProvider'
import './MediaAlbumEditor.css'

export type MediaGalleryAlbum = {
  id: string
  title: string
  description: string
  coverImageUrl: string
  isPublished: boolean
}

type GalleryPhoto = {
  id: string
  albumId: string
  url: string
  alt: string
  caption: string
  isPublished: boolean
  sortOrder: number
}

type Props = {
  storeId: string
  album: MediaGalleryAlbum
  otherAlbums: MediaGalleryAlbum[]
  revision?: number
  onUpdate: (album: MediaGalleryAlbum) => void
  onClose: () => void
}

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : 'Try again.'
}

function sortPhotos(images: GalleryPhoto[]): GalleryPhoto[] {
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

export default function MediaAlbumEditor({ storeId, album, otherAlbums, revision = 0, onUpdate, onClose }: Props) {
  const { publish } = useToast()
  const [title, setTitle] = useState(album.title)
  const [description, setDescription] = useState(album.description)
  const [isPublished, setIsPublished] = useState(album.isPublished)
  const [coverImageUrl, setCoverImageUrl] = useState(album.coverImageUrl)
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingPhotoId, setEditingPhotoId] = useState('')
  const [photoAlt, setPhotoAlt] = useState('')
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoPublished, setPhotoPublished] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    void getDocs(query(collection(db, 'stores', storeId, 'galleryImages'), where('albumId', '==', album.id)))
      .then(snapshot => {
        if (!alive) return
        const rows = snapshot.docs.map(row => {
          const data = row.data()
          return {
            id: row.id,
            albumId: String(data.albumId || ''),
            url: String(data.url || ''),
            alt: String(data.alt || ''),
            caption: String(data.caption || ''),
            isPublished: data.isPublished !== false,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
          }
        }).filter(row => row.url)
        setPhotos(sortPhotos(rows))
      })
      .catch(loadError => {
        if (alive) setError('Unable to load this album: ' + displayError(loadError))
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [storeId, album.id, revision])

  const firstPublishedPhoto = photos.find(photo => photo.isPublished)
  const publicCoverCandidates = photos.filter(photo => photo.isPublished)
  const knownCover = publicCoverCandidates.some(photo => photo.url === coverImageUrl)
  const suggestedCover = knownCover ? coverImageUrl : firstPublishedPhoto?.url || ''
  const hasChanges = title.trim() !== album.title
    || description.trim() !== album.description
    || isPublished !== album.isPublished
    || suggestedCover !== album.coverImageUrl

  async function saveAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || photoBusy) return
    const nextTitle = title.trim()
    if (!nextTitle) { setError('Enter an album name.'); return }
    if (nextTitle.length > 100) { setError('Album names must be 100 characters or fewer.'); return }
    if (otherAlbums.some(item => item.id !== album.id && item.title.trim().toLowerCase() === nextTitle.toLowerCase())) {
      setError('Another album already has this name. Choose a different one.')
      return
    }
    if (description.trim().length > 240) { setError('Descriptions must be 240 characters or fewer.'); return }
    setSaving(true)
    setError('')
    const updated: MediaGalleryAlbum = {
      ...album,
      title: nextTitle,
      description: description.trim(),
      coverImageUrl: suggestedCover,
      isPublished,
    }
    try {
      await setDoc(doc(db, 'stores', storeId, 'galleryAlbums', album.id), {
        title: updated.title,
        description: updated.description || null,
        coverImageUrl: updated.coverImageUrl || null,
        isPublished: updated.isPublished,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      onUpdate(updated)
      publish({ tone: 'success', message: 'Album details saved.' })
    } catch (saveError) {
      setError('Unable to save album: ' + displayError(saveError))
    } finally {
      setSaving(false)
    }
  }

  function editPhoto(photo: GalleryPhoto) {
    setEditingPhotoId(photo.id)
    setPhotoAlt(photo.alt)
    setPhotoCaption(photo.caption)
    setPhotoPublished(photo.isPublished)
    setError('')
  }

  async function savePhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || photoBusy || !editingPhotoId) return
    const currentPhoto = photos.find(photo => photo.id === editingPhotoId)
    if (!currentPhoto) return
    setPhotoBusy(true)
    setError('')
    const nextPhoto = {
      ...currentPhoto,
      alt: photoAlt.trim(),
      caption: photoCaption.trim(),
      isPublished: photoPublished,
    }
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'stores', storeId, 'galleryImages', currentPhoto.id), {
        alt: nextPhoto.alt || null,
        caption: nextPhoto.caption || null,
        isPublished: nextPhoto.isPublished,
        updatedAt: serverTimestamp(),
      })
      // Don't expose an unpublished photo as the album cover.
      let nextCover = suggestedCover
      if (!nextPhoto.isPublished && currentPhoto.url === suggestedCover) {
        nextCover = photos.find(photo => photo.id !== currentPhoto.id && photo.isPublished)?.url || ''
        batch.update(doc(db, 'stores', storeId, 'galleryAlbums', album.id), {
          coverImageUrl: nextCover || null,
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
      setPhotos(previous => previous.map(photo => photo.id === nextPhoto.id ? nextPhoto : photo))
      if (nextCover !== suggestedCover) {
        setCoverImageUrl(nextCover)
        onUpdate({ ...album, coverImageUrl: nextCover })
      }
      setEditingPhotoId('')
      publish({ tone: 'success', message: 'Picture details saved.' })
    } catch (saveError) {
      setError('Unable to update picture: ' + displayError(saveError))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function movePhoto(index: number, direction: -1 | 1) {
    if (photoBusy || saving) return
    const neighborIndex = index + direction
    if (neighborIndex < 0 || neighborIndex >= photos.length) return
    setPhotoBusy(true)
    setError('')
    // Update two records, even in large albums, rather than exceeding the
    // Firestore 500-operation batch limit by rewriting the whole album.
    const first = photos[index]
    const second = photos[neighborIndex]
    const next = [...photos]
    next[index] = { ...second, sortOrder: first.sortOrder }
    next[neighborIndex] = { ...first, sortOrder: second.sortOrder }
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'stores', storeId, 'galleryImages', first.id), {
        sortOrder: second.sortOrder,
        updatedAt: serverTimestamp(),
      })
      batch.update(doc(db, 'stores', storeId, 'galleryImages', second.id), {
        sortOrder: first.sortOrder,
        updatedAt: serverTimestamp(),
      })
      await batch.commit()
      setPhotos(next)
      publish({ tone: 'success', message: 'Picture order updated.' })
    } catch (saveError) {
      setError('Unable to reorder pictures: ' + displayError(saveError))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto(photo: GalleryPhoto) {
    if (photoBusy || saving) return
    if (!window.confirm('Remove this picture from "' + album.title + '"? The original image will remain in the Media Library.')) return
    setPhotoBusy(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'stores', storeId, 'galleryImages', photo.id))
      const nextPhotos = photos.filter(item => item.id !== photo.id)
      if (photo.url === suggestedCover) {
        const nextCover = nextPhotos.find(item => item.isPublished)?.url || ''
        batch.update(doc(db, 'stores', storeId, 'galleryAlbums', album.id), {
          coverImageUrl: nextCover || null,
          updatedAt: serverTimestamp(),
        })
        setCoverImageUrl(nextCover)
        onUpdate({ ...album, coverImageUrl: nextCover })
      }
      await batch.commit()
      setPhotos(nextPhotos)
      if (editingPhotoId === photo.id) setEditingPhotoId('')
      publish({ tone: 'success', message: 'Picture removed from album. The original image was not deleted.' })
    } catch (saveError) {
      setError('Unable to remove picture: ' + displayError(saveError))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="media-album-editor" aria-label={'Edit album: ' + album.title}>
      <div className="media-album-editor__heading">
        <div>
          <h3>Edit album: {album.title}</h3>
          <p>Change album details, choose its cover, and organize the photos shown on your website.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={onClose} disabled={saving || photoBusy}>Close editor</button>
      </div>

      {error ? <p className="media-album-editor__error" role="alert">{error}</p> : null}
      <form className="media-album-editor__form" onSubmit={event => void saveAlbum(event)}>
        <label htmlFor="media-edit-album-title">Album name
          <input id="media-edit-album-title" required maxLength={100} value={title} disabled={saving}
            onChange={event => setTitle(event.target.value)} />
        </label>
        <label htmlFor="media-edit-album-description">Description
          <textarea id="media-edit-album-description" maxLength={240} rows={2} value={description} disabled={saving}
            onChange={event => setDescription(event.target.value)} placeholder="Describe the pictures in this album" />
        </label>
        <label className="media-album-editor__toggle" htmlFor="media-edit-album-published">
          <input id="media-edit-album-published" type="checkbox" checked={isPublished} disabled={saving}
            onChange={event => setIsPublished(event.target.checked)} />
          <span><strong>Publish album</strong><small>{isPublished ? 'Visible to websites that honor the published flag' : 'Hidden from websites that honor the published flag'}</small></span>
        </label>

        <div className="media-album-editor__cover-choice">
          <strong>Album cover</strong>
          <p>Choose a published picture below to be the cover. If the current cover is removed or hidden, another published picture is selected automatically.</p>
          {suggestedCover ? <SafeFirebaseImage src={suggestedCover} alt="Selected album cover" /> : <span>No published pictures yet. Add photos to choose a cover.</span>}
          <label htmlFor="media-edit-album-cover">Cover picture
            <select id="media-edit-album-cover" value={suggestedCover} disabled={saving || publicCoverCandidates.length === 0}
              onChange={event => setCoverImageUrl(event.target.value)}>
              {!publicCoverCandidates.length ? <option value="">No pictures</option> : null}
              {publicCoverCandidates.map((image, index) => <option key={image.id} value={image.url}>{image.caption || image.alt || 'Picture ' + (index + 1)}</option>)}
            </select>
          </label>
        </div>

        <div className="media-album-editor__form-actions">
          <button className="button button--primary" type="submit" disabled={saving || photoBusy || !title.trim() || !hasChanges}>
            {saving ? 'Saving…' : 'Save album changes'}
          </button>
          <span>{hasChanges ? 'You have unsaved changes.' : 'All album changes saved.'}</span>
        </div>
      </form>

      <div className="media-album-editor__pictures">
        <div className="media-album-editor__heading">
          <div>
            <h4>Pictures in this album ({photos.length})</h4>
            <p>Edit captions and visibility, rearrange photos, or remove them from this album.</p>
          </div>
          <a href="#media-pictures-title">Add more from Media Library</a>
        </div>
        {loading ? <p>Loading album pictures…</p> : null}
        {!loading && photos.length === 0 ? <p className="media-album-editor__empty">No pictures yet. Select photos from the Media Library below, then add them to this album.</p> : null}
        <div className="media-album-editor__photo-grid">
          {photos.map((photo, index) => (
            <article className="media-album-editor__photo" key={photo.id}>
              <SafeFirebaseImage src={photo.url} alt={photo.alt || 'Album picture'} />
              <div className="media-album-editor__photo-content">
                <span className="media-album-editor__photo-label">{index + 1}. {photo.caption || photo.alt || 'Picture'}</span>
                <span className="media-album-editor__visibility">{photo.isPublished ? 'Published' : 'Hidden'}</span>
                <div className="media-album-editor__photo-actions">
                  <button type="button" disabled={photoBusy || saving || index === 0} onClick={() => void movePhoto(index, -1)} aria-label={'Move picture ' + (index + 1) + ' earlier'}>← Earlier</button>
                  <button type="button" disabled={photoBusy || saving || index === photos.length - 1} onClick={() => void movePhoto(index, 1)} aria-label={'Move picture ' + (index + 1) + ' later'}>Later →</button>
                  <button type="button" disabled={photoBusy || saving} onClick={() => editPhoto(photo)}>Edit</button>
                  <button type="button" className="media-album-editor__remove" disabled={photoBusy || saving}
                    onClick={() => void removePhoto(photo)}>Remove</button>
                </div>
                {editingPhotoId === photo.id ? (
                  <form className="media-album-editor__photo-form" onSubmit={event => void savePhoto(event)}>
                    <label>Alternative text
                      <input maxLength={220} value={photoAlt} onChange={event => setPhotoAlt(event.target.value)} />
                    </label>
                    <label>Caption
                      <input maxLength={240} value={photoCaption} onChange={event => setPhotoCaption(event.target.value)} />
                    </label>
                    <label className="media-album-editor__toggle">
                      <input type="checkbox" checked={photoPublished} onChange={event => setPhotoPublished(event.target.checked)} />
                      <span>Publish this picture</span>
                    </label>
                    <div className="media-album-editor__form-actions">
                      <button type="submit" className="button button--primary" disabled={photoBusy}>{photoBusy ? 'Saving…' : 'Save picture'}</button>
                      <button type="button" className="button button--secondary" onClick={() => setEditingPhotoId('')} disabled={photoBusy}>Cancel</button>
                    </div>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <p className="media-album-editor__footnote">Removing pictures here does not delete the originals stored in Sedifex. Website galleries must read the album and picture publication flags to respect hidden items.</p>
      </div>
    </div>
  )
}
