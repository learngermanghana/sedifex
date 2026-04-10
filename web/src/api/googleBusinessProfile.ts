import { auth } from '../firebase'

export type GoogleBusinessLocationOption = {
  accountId: string
  accountName: string
  locationId: string
  locationName: string
}

export type GoogleBusinessUploadResult = {
  media?: {
    name?: string
    googleUrl?: string
    thumbnailUrl?: string
    mediaFormat?: string
    mediaState?: string
  }
}

async function getAuthHeader() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')

  return { authorization: `Bearer ${token}` }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : 'Request failed.'
    throw new Error(message)
  }

  return body as T
}

export async function listGoogleBusinessLocations(params: { storeId: string }): Promise<GoogleBusinessLocationOption[]> {
  const headers = await getAuthHeader()
  const response = await fetch('/api/google-business/locations', {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ storeId: params.storeId }),
  })

  const payload = await parseApiResponse<{
    accounts?: Array<{ accountId?: string; accountName?: string; locations?: Array<{ name?: string; title?: string }> }>
  }>(response)

  const options: GoogleBusinessLocationOption[] = []

  for (const account of payload.accounts ?? []) {
    const accountId = typeof account.accountId === 'string' ? account.accountId : ''
    const accountName = typeof account.accountName === 'string' ? account.accountName : accountId
    for (const location of account.locations ?? []) {
      const locationNamePath = typeof location.name === 'string' ? location.name : ''
      const locationId = locationNamePath.split('/').pop() || ''
      if (!accountId || !locationId) continue
      options.push({
        accountId,
        accountName,
        locationId,
        locationName: typeof location.title === 'string' && location.title.trim() ? location.title : locationId,
      })
    }
  }

  return options
}

export async function uploadGoogleBusinessLocationMedia(params: {
  storeId: string
  accountId: string
  locationId: string
  category: string
  file: File
}) {
  const headers = await getAuthHeader()
  const formData = new FormData()
  formData.set('storeId', params.storeId)
  formData.set('accountId', params.accountId)
  formData.set('locationId', params.locationId)
  formData.set('category', params.category)
  formData.set('file', params.file)

  const response = await fetch('/api/google-business/upload-location-media', {
    method: 'POST',
    headers,
    body: formData,
  })

  return parseApiResponse<GoogleBusinessUploadResult>(response)
}
