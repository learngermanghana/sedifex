import { MEDIA_MAX_SOURCE_BYTES, validateMediaFile } from '../utils/mediaLibrary'

export type DriveImage = { id: string; name: string; mimeType: string }
export type DriveSelection = { images: DriveImage[]; accessToken: string }

type TokenResponse = { access_token?: string; error?: string; error_description?: string }
type PickerData = { action?: string; docs?: Array<Record<string, unknown>> }
type GooglePickerView = {
  setMimeTypes: (value: string) => GooglePickerView
  setIncludeFolders: (value: boolean) => GooglePickerView
  setSelectFolderEnabled: (value: boolean) => GooglePickerView
}
type GooglePickerBuilder = {
  addView: (view: GooglePickerView) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setAppId: (id: string) => GooglePickerBuilder
  enableFeature: (feature: string) => GooglePickerBuilder
  setCallback: (callback: (data: PickerData) => void) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}
type PickerSdk = {
  DocsView: new (id: string) => GooglePickerView
  ViewId: { DOCS: string }
  Feature: { MULTISELECT_ENABLED: string }
  Action: { PICKED: string; CANCEL: string }
  Document: { ID: string; NAME: string; MIME_TYPE: string }
  PickerBuilder: new () => GooglePickerBuilder
}
type GoogleBrowser = Window & {
  google?: {
    accounts: { oauth2: { initTokenClient: (config: {
      client_id: string
      scope: string
      callback: (response: TokenResponse) => void
      error_callback?: (error: { message?: string }) => void
    }) => { requestAccessToken: (options?: { prompt?: string }) => void } } }
    picker: PickerSdk
  }
  gapi?: {
    load: (module: string, callbacks: { callback: () => void; onerror: () => void }) => void
  }
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_SCRIPTS = [
  'https://accounts.google.com/gsi/client',
  'https://apis.google.com/js/api.js',
]

let librariesPromise: Promise<void> | null = null

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.scripts).find(script => script.src === src)
    if (existing?.dataset.sedifexLoaded === 'yes') return resolve()
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => {
      script.dataset.sedifexLoaded = 'yes'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error('Unable to load Google Drive. Check your connection.')), { once: true })
    if (!existing) {
      script.src = src
      script.async = true
      document.head.appendChild(script)
    }
  })
}

async function ensureGooglePicker() {
  if (!librariesPromise) {
    librariesPromise = (async () => {
      await Promise.all(GOOGLE_SCRIPTS.map(loadScript))
      const api = (window as GoogleBrowser).gapi
      if (!api) throw new Error('Google Picker could not start.')
      await new Promise<void>((resolve, reject) => api.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker is unavailable.')) }))
    })().catch(error => {
      librariesPromise = null
      throw error
    })
  }
  await librariesPromise
}

function googleConfig() {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  const apiKey = (import.meta.env.VITE_GOOGLE_PICKER_API_KEY || '').trim()
  const appId = (import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER || '').trim()
  if (!clientId || !apiKey || !appId) {
    throw new Error('Google Drive import needs VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_CLOUD_PROJECT_NUMBER configured.')
  }
  return { clientId, apiKey, appId }
}

async function requestGoogleToken(clientId: string): Promise<string> {
  const google = (window as GoogleBrowser).google
  if (!google?.accounts?.oauth2) throw new Error('Google sign-in did not load.')
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google authorization was cancelled.'))
          return
        }
        resolve(response.access_token)
      },
      error_callback: error => reject(new Error(error.message || 'Google authorization failed.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

/**
 * The Picker grants access to specifically chosen photos via drive.file.
 * Owners may browse folders and multi-select images. Never request unrestricted
 * Drive scopes or store access/refresh tokens on the Sedifex server.
 */
export async function pickGoogleDriveImages(): Promise<DriveSelection> {
  const { clientId, apiKey, appId } = googleConfig()
  await ensureGooglePicker()
  const google = (window as GoogleBrowser).google
  if (!google?.picker) throw new Error('Google Picker is not available.')
  const accessToken = await requestGoogleToken(clientId)
  const picker = google.picker
  const images = await new Promise<DriveImage[]>((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes('image/jpeg,image/png,image/webp,image/avif')
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
    const popup = new picker.PickerBuilder()
      .addView(view)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOAuthToken(accessToken)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback(data => {
        if (data.action === picker.Action.CANCEL) return resolve([])
        if (data.action !== picker.Action.PICKED) return
        const selected = (data.docs || []).map(doc => ({
          id: String(doc[picker.Document.ID] || doc.id || ''),
          name: String(doc[picker.Document.NAME] || doc.name || 'photo'),
          mimeType: String(doc[picker.Document.MIME_TYPE] || doc.mimeType || ''),
        })).filter(item => item.id)
        if (!selected.length) return reject(new Error('No pictures were selected.'))
        resolve(selected)
      })
      .build()
    popup.setVisible(true)
  })
  return { accessToken, images }
}

export async function downloadDriveImage(image: DriveImage, accessToken: string): Promise<File> {
  if (!/^[A-Za-z0-9_-]+$/.test(image.id)) throw new Error('Invalid Google Drive photo ID.')
  const response = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(image.id) + '?alt=media', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Your Google session expired. Select the pictures again.' : 'Unable to read photo from Google Drive (HTTP ' + response.status + ').')
  }
  const size = Number(response.headers.get('content-length') || 0)
  if (size > MEDIA_MAX_SOURCE_BYTES) throw new Error('Google Drive photo exceeds 25 MB.')
  const type = (response.headers.get('content-type') || image.mimeType).split(';')[0].trim().toLowerCase()
  if (!type.startsWith('image/')) throw new Error('Google Drive file is not an image.')
  const blob = await response.blob()
  const file = new File([blob], image.name, { type })
  const issue = validateMediaFile(file)
  if (issue) throw new Error(issue)
  return file
}
