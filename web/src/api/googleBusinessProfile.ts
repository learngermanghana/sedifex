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

export type GoogleBusinessErrorKind =
  | 'not_connected'
  | 'missing_scope'
  | 'not_authenticated'
  | 'unknown'

export class GoogleBusinessApiError extends Error {
  code: string
  status: number
  kind: GoogleBusinessErrorKind

  constructor(params: { message: string; code: string; status: number; kind: GoogleBusinessErrorKind }) {
    super(params.message)
    this.name = 'GoogleBusinessApiError'
    this.code = params.code
    this.status = params.status
    this.kind = params.kind
  }
}

async function getAuthHeader() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')

  return { authorization: `Bearer ${token}` }
}

function inferErrorKind(code: string, status: number): GoogleBusinessErrorKind {
  if (code === 'google-business-not-connected' || code === 'google-business-missing-tokens') {
    return 'not_connected'
  }

  if (
    code.includes('scope') ||
    code.includes('insufficient') ||
    code.includes('permission') ||
    code.includes('forbidden') ||
    code.includes('business.manage')
  ) {
    return 'missing_scope'
  }

  if (code === 'not-authenticated' || status === 401) {
    return 'not_authenticated'
  }

  return 'unknown'
}

function defaultErrorMessage(kind: GoogleBusinessErrorKind): string {
  if (kind === 'not_connected') {
    return 'Google Business Profile is not connected for this store.'
  }
  if (kind === 'missing_scope') {
    return 'Google Business Profile access is missing the required business.manage permission.'
  }
  if (kind === 'not_authenticated') {
    return 'Your session has expired. Sign in again to continue.'
  }

  return 'Request failed.'
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const rawError = typeof body.error === 'string' ? body.error : ''
    const normalizedCode = rawError.trim().toLowerCase()
    const kind = inferErrorKind(normalizedCode, response.status)

    throw new GoogleBusinessApiError({
      message: rawError || defaultErrorMessage(kind),
      code: normalizedCode || 'request-failed',
      status: response.status,
      kind,
    })
  }

  return body as T
}

export function parseGoogleBusinessApiError(error: unknown) {
  if (error instanceof GoogleBusinessApiError) {
    return {
      kind: error.kind,
      code: error.code,
      status: error.status,
      message: error.message,
    }
  }

  return {
    kind: 'unknown' as const,
    code: '',
    status: 0,
    message: error instanceof Error ? error.message : 'Request failed.',
  }
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
