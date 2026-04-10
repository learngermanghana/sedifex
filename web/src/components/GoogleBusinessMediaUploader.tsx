import React, { useEffect, useMemo, useState } from 'react'

import {
  listGoogleBusinessLocations,
  parseGoogleBusinessApiError,
  uploadGoogleBusinessLocationMedia,
  type GoogleBusinessLocationOption,
} from '../api/googleBusinessProfile'

type Props = {
  storeId: string
  onReconnectGoogle?: () => void
  isReconnectingGoogle?: boolean
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

const PHOTO_TYPE_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  COVER: 'Cover photo',
  PROFILE: 'Profile photo',
  LOGO: 'Logo',
  EXTERIOR: 'Outside your business',
  INTERIOR: 'Inside your business',
  PRODUCT: 'Product photo',
  AT_WORK: 'At work',
  FOOD_AND_DRINK: 'Food and drink',
  MENU: 'Menu',
  COMMON_AREA: 'Common area',
  ROOMS: 'Rooms',
  TEAMS: 'Team photo',
  ADDITIONAL: 'Other photo',
}

function getLocationMessage(state: LocationState, fallbackMessage: string): string {
  if (state === 'not_connected') {
    return 'Google Business Profile is not connected. Connect your Google account to upload photos.'
  }
  if (state === 'missing_scope') {
    return 'Google Business Profile permission is missing. Reconnect Google and allow Business Profile access.'
  }
  if (state === 'empty') {
    return 'No Google Business locations found. Make sure your Google account is connected and your business profile is available.'
  }
  if (state === 'error') {
    return fallbackMessage || 'We could not load your Google Business locations right now. Please try again.'
  }

  return ''
}

export default function GoogleBusinessMediaUploader({ storeId, onReconnectGoogle, isReconnectingGoogle = false }: Props) {
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
      setUploadMessage('Please choose a business location.')
      return
    }

    if (!file) {
      setUploadState('error')
      setUploadMessage('Please choose a photo to upload.')
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
      setUploadMessage('Your photo was uploaded to Google Business Profile.')
    } catch (error) {
      const parsed = parseGoogleBusinessApiError(error)
      setUploadState('error')

      if (parsed.kind === 'not_connected') {
        setUploadMessage('Google Business Profile is not connected right now. Reconnect Google and try again.')
        return
      }

      if (parsed.kind === 'missing_scope') {
        setUploadMessage('Google Business Profile permission is missing. Reconnect Google and allow Business Profile access.')
        return
      }

      setUploadMessage(parsed.message || 'Photo upload failed. Please try again.')
    }
  }

  return (
    <section className="google-shopping-panel" aria-labelledby="google-business-uploader-heading">
      <h2 id="google-business-uploader-heading">Upload photos to your business on Google</h2>
      <p>These photos can appear on your Google business listing in Search and Maps.</p>
      <p>Use this to add shop photos, logo, cover image, product photos, and more.</p>
      <p className="google-shopping-page__status">
        This uploads a photo to your Google Business Profile. It does not create a text post or promotion.
      </p>

      <label>
        <span>Business location</span>
        <small className="google-shopping-panel__hint">Select the Google business location you want to update.</small>
        <select
          value={selectedLocationKey}
          onChange={(event) => setSelectedLocationKey(event.target.value)}
          disabled={locationState === 'loading' || uploadState === 'loading' || uploadBlocked}
        >
          {!locations.length && <option value="">No business locations available</option>}
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
        <span>Photo type</span>
        <small className="google-shopping-panel__hint">Choose what kind of photo this is.</small>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
          disabled={uploadBlocked}
        >
          {CATEGORIES.map((categoryOption) => (
            <option key={categoryOption} value={categoryOption}>
              {PHOTO_TYPE_LABELS[categoryOption]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Choose photo</span>
        <small className="google-shopping-panel__hint">Upload a JPG or PNG image.</small>
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
          {uploadState === 'loading' ? 'Uploading…' : 'Upload photo to Google'}
        </button>
      </div>

      {locationState !== 'ready' && locationState !== 'loading' && (
        <article className="google-shopping-page__status" aria-live="polite">
          <h3>{locationState === 'empty' ? 'No Google Business locations found.' : 'Google Business setup needed'}</h3>
          <p>{getLocationMessage(locationState, locationMessage)}</p>
          {onReconnectGoogle ? (
            <button type="button" onClick={onReconnectGoogle} disabled={isReconnectingGoogle}>
              {isReconnectingGoogle
                ? 'Connecting…'
                : locationState === 'not_connected'
                  ? 'Connect Google Business'
                  : 'Reconnect Google'}
            </button>
          ) : null}
        </article>
      )}

      {locationState === 'loading' && <p className="google-shopping-panel__hint">Loading Google Business locations…</p>}

      {uploadMessage && <p className="google-shopping-panel__hint">{uploadMessage}</p>}

      {uploadState === 'success' && uploadedResult && (
        <article className="google-shopping-page__status" aria-live="polite">
          <h3>Your photo was uploaded to Google Business Profile.</h3>
          <p>Photo type: {PHOTO_TYPE_LABELS[category]}</p>
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
