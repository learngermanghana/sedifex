import React, { useEffect, useMemo, useState } from 'react'

import {
  listGoogleBusinessLocations,
  parseGoogleBusinessApiError,
  uploadGoogleBusinessLocationMedia,
  type GoogleBusinessLocationOption,
} from '../api/googleBusinessProfile'

type Props = {
  storeId: string
}

type UploadState = 'idle' | 'loading' | 'success' | 'error'
type LocationState = 'idle' | 'loading' | 'ready' | 'empty' | 'not_connected' | 'missing_scope' | 'error'

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

function getLocationMessage(state: LocationState, fallbackMessage: string): string {
  if (state === 'not_connected') {
    return 'Google Business Profile is not connected for this store. Connect Google first, then try again.'
  }
  if (state === 'missing_scope') {
    return 'Google Business Profile access is missing permission. Reconnect Google and grant Business Profile access.'
  }
  if (state === 'empty') {
    return 'No Google Business locations were found for the connected account.'
  }
  if (state === 'error') {
    return fallbackMessage || 'Unable to load Google Business locations right now.'
  }

  return ''
}

export default function GoogleBusinessMediaUploader({ storeId }: Props) {
  const [locations, setLocations] = useState<GoogleBusinessLocationOption[]>([])
  const [selectedLocationKey, setSelectedLocationKey] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('ADDITIONAL')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [uploadedResult, setUploadedResult] = useState<{ thumbnailUrl: string; googleUrl: string; uploadedAt: string } | null>(null)

  useEffect(() => {
    if (!storeId) return
    let mounted = true

    setLocationState('loading')
    setLocationMessage('')

    listGoogleBusinessLocations({ storeId })
      .then((options) => {
        if (!mounted) return

        setLocations(options)
        setSelectedLocationKey(options[0] ? `${options[0].accountId}:${options[0].locationId}` : '')

        if (!options.length) {
          setLocationState('empty')
          return
        }

        setLocationState('ready')
      })
      .catch((error) => {
        if (!mounted) return

        const parsed = parseGoogleBusinessApiError(error)
        if (parsed.kind === 'not_connected') {
          setLocationState('not_connected')
          setLocationMessage(getLocationMessage('not_connected', parsed.message))
          return
        }

        if (parsed.kind === 'missing_scope') {
          setLocationState('missing_scope')
          setLocationMessage(getLocationMessage('missing_scope', parsed.message))
          return
        }

        setLocationState('error')
        setLocationMessage(parsed.message || getLocationMessage('error', ''))
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

  const uploadBlocked = locationState !== 'ready'

  async function handleUpload() {
    if (!selectedLocation) {
      setUploadState('error')
      setUploadMessage('Please choose a location.')
      return
    }

    if (!file) {
      setUploadState('error')
      setUploadMessage('Please choose an image file.')
      return
    }

    setUploadState('loading')
    setUploadMessage('')

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
      setUploadMessage('Image uploaded to Google Business Profile successfully.')
    } catch (error) {
      const parsed = parseGoogleBusinessApiError(error)
      setUploadState('error')

      if (parsed.kind === 'not_connected') {
        setUploadMessage('Google Business Profile is no longer connected. Reconnect Google and try again.')
        return
      }

      if (parsed.kind === 'missing_scope') {
        setUploadMessage('Google Business Profile permission is missing. Reconnect Google and grant Business Profile access.')
        return
      }

      setUploadMessage(parsed.message || 'Upload failed.')
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
          disabled={locationState === 'loading' || uploadState === 'loading' || uploadBlocked}
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
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
          disabled={uploadBlocked}
        >
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
          disabled={uploadState === 'loading' || uploadBlocked}
        />
      </label>

      {previewUrl && <img src={previewUrl} alt="Selected upload preview" className="google-business-preview" />}

      <div className="google-shopping-panel__actions">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploadState === 'loading' || !file || !selectedLocation || uploadBlocked}
        >
          {uploadState === 'loading' ? 'Uploading…' : 'Upload image'}
        </button>
      </div>

      {locationState !== 'ready' && locationState !== 'loading' && (
        <p className="google-shopping-panel__hint">{getLocationMessage(locationState, locationMessage)}</p>
      )}

      {locationState === 'loading' && <p className="google-shopping-panel__hint">Loading Google Business locations…</p>}

      {uploadMessage && <p className="google-shopping-panel__hint">{uploadMessage}</p>}

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
