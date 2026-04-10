import React, { useEffect, useMemo, useState } from 'react'

import {
  listGoogleBusinessLocations,
  uploadGoogleBusinessLocationMedia,
  type GoogleBusinessLocationOption,
} from '../api/googleBusinessProfile'

type Props = {
  storeId: string
}

type UploadState = 'idle' | 'loading' | 'success' | 'error'

const CATEGORIES = [
  'COVER',
  'PROFILE',
  'LOGO',
  'EXTERIOR',
  'INTERIOR',
  'PRODUCT',
  'AT_WORK',
  'FOOD_AND_DRINK',
  'MENU',
  'COMMON_AREA',
  'ROOMS',
  'TEAMS',
  'ADDITIONAL',
] as const

export default function GoogleBusinessMediaUploader({ storeId }: Props) {
  const [locations, setLocations] = useState<GoogleBusinessLocationOption[]>([])
  const [selectedLocationKey, setSelectedLocationKey] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('ADDITIONAL')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [message, setMessage] = useState('')
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [uploadedResult, setUploadedResult] = useState<{ thumbnailUrl: string; googleUrl: string; uploadedAt: string } | null>(null)

  useEffect(() => {
    if (!storeId) return
    let mounted = true
    setLoadingLocations(true)

    listGoogleBusinessLocations({ storeId })
      .then((options) => {
        if (!mounted) return
        setLocations(options)
        setSelectedLocationKey(options[0] ? `${options[0].accountId}:${options[0].locationId}` : '')
      })
      .catch((error) => {
        if (!mounted) return
        setMessage(error instanceof Error ? error.message : 'Unable to load Google Business locations.')
        setUploadState('error')
      })
      .finally(() => {
        if (mounted) setLoadingLocations(false)
      })

    return () => {
      mounted = false
    }
  }, [storeId])

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const selectedLocation = useMemo(() => {
    const [accountId, locationId] = selectedLocationKey.split(':')
    return locations.find((option) => option.accountId === accountId && option.locationId === locationId) || null
  }, [locations, selectedLocationKey])

  async function handleUpload() {
    if (!selectedLocation) {
      setUploadState('error')
      setMessage('Please choose a location.')
      return
    }

    if (!file) {
      setUploadState('error')
      setMessage('Please choose an image file.')
      return
    }

    setUploadState('loading')
    setMessage('')

    try {
      const payload = await uploadGoogleBusinessLocationMedia({
        storeId,
        accountId: selectedLocation.accountId,
        locationId: selectedLocation.locationId,
        category,
        file,
      })

      setUploadedResult({
        thumbnailUrl: payload.media?.thumbnailUrl || '',
        googleUrl: payload.media?.googleUrl || '',
        uploadedAt: new Date().toISOString(),
      })
      setUploadState('success')
      setMessage('Image uploaded to Google Business Profile successfully.')
    } catch (error) {
      setUploadState('error')
      setMessage(error instanceof Error ? error.message : 'Upload failed.')
    }
  }

  return (
    <section className="google-shopping-panel" aria-labelledby="google-business-uploader-heading">
      <h2 id="google-business-uploader-heading">Google Business Profile media upload</h2>
      <p>Select a location, pick a category, and upload directly to Google Business Profile.</p>

      <label>
        <span>Location</span>
        <select
          value={selectedLocationKey}
          onChange={(event) => setSelectedLocationKey(event.target.value)}
          disabled={loadingLocations || uploadState === 'loading'}
        >
          {!locations.length && <option value="">No locations available</option>}
          {locations.map((option) => {
            const value = `${option.accountId}:${option.locationId}`
            return (
              <option key={value} value={value}>
                {option.locationName} · {option.accountName}
              </option>
            )
          })}
        </select>
      </label>

      <label>
        <span>Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}>
          {CATEGORIES.map((categoryOption) => (
            <option key={categoryOption} value={categoryOption}>
              {categoryOption}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Image file (JPEG/PNG)</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          disabled={uploadState === 'loading'}
        />
      </label>

      {previewUrl && <img src={previewUrl} alt="Selected upload preview" className="google-business-preview" />}

      <div className="google-shopping-panel__actions">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploadState === 'loading' || !file || !selectedLocation || loadingLocations}
        >
          {uploadState === 'loading' ? 'Uploading…' : 'Upload image'}
        </button>
      </div>

      {message && <p className="google-shopping-panel__hint">{message}</p>}

      {uploadState === 'success' && uploadedResult && (
        <article className="google-shopping-page__status" aria-live="polite">
          <h3>Upload complete</h3>
          <p>Category: {category}</p>
          <p>Uploaded: {new Date(uploadedResult.uploadedAt).toLocaleString()}</p>
          {uploadedResult.thumbnailUrl ? <img src={uploadedResult.thumbnailUrl} alt="Uploaded media thumbnail" className="google-business-thumb" /> : null}
          {uploadedResult.googleUrl ? (
            <p>
              Google media URL:{' '}
              <a href={uploadedResult.googleUrl} target="_blank" rel="noreferrer">
                Open media
              </a>
            </p>
          ) : null}
        </article>
      )}
    </section>
  )
}
