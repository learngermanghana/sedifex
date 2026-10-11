import { auth } from '../firebase'

const FUNCTIONS_REGION = import.meta.env.VITE_FB_FUNCTIONS_REGION ?? 'us-central1'
const PROJECT_ID = import.meta.env.VITE_FB_PROJECT_ID

const SYNC_TAG = 'sync-pending-requests'

type QueueRequestType = 'sale' | 'receipt'

type QueueMessage = {
  type: 'QUEUE_BACKGROUND_REQUEST'
  payload: {
    requestType: QueueRequestType
    endpoint: string
    payload: unknown
    authUid: string | null
    authToken: string | null
    createdAt: number
  }
}

type ProcessMessage = { type: 'PROCESS_QUEUE_NOW'; retryFailed?: boolean }

function getController(registration: ServiceWorkerRegistration) {
  return registration.active ?? registration.waiting ?? registration.installing ?? null
}

export function getCallableEndpoint(functionName: string) {
  if (!PROJECT_ID) {
    throw new Error('Missing Firebase project configuration')
  }
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`
}

export async function queueCallableRequest(
  functionName: string,
  payload: unknown,
  requestType: QueueRequestType
) {
  if (!('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const controller = getController(registration)
    if (!controller) {
      return false
    }

    let authToken: string | null = null
    try {
      authToken = await auth.currentUser?.getIdToken() ?? null
    } catch (error) {
      console.warn('[offline-queue] Unable to read auth token for queued request', error)
    }

    const message: QueueMessage = {
      type: 'QUEUE_BACKGROUND_REQUEST',
      payload: {
        requestType,
        authUid: auth.currentUser?.uid ?? null,
        endpoint: getCallableEndpoint(functionName),
        payload,
        authToken,
        createdAt: Date.now(),
      },
    }

    // Only report success after IndexedDB has committed the request.
    const stored = await new Promise<boolean>(resolve => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => { channel.port1.close(); resolve(false) }, 10000)
      channel.port1.onmessage = event => {
        clearTimeout(timer)
        channel.port1.close()
        resolve(event.data?.stored === true)
      }
      controller.postMessage(message, [channel.port2])
    })
    if (!stored) return false

    const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync
    if (syncManager) {
      try {
        await syncManager.register(SYNC_TAG)
      } catch (error) {
        console.warn('[offline-queue] Background sync registration failed', error)
        controller.postMessage({ type: 'PROCESS_QUEUE_NOW' } satisfies ProcessMessage)
      }
    } else {
      controller.postMessage({ type: 'PROCESS_QUEUE_NOW' } satisfies ProcessMessage)
    }

    return true
  } catch (error) {
    console.error('[offline-queue] Failed to queue request for background processing', error)
    return false
  }
}

export async function triggerQueueProcessing(retryFailed = false) {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const controller = getController(registration)
    controller?.postMessage({ type: 'PROCESS_QUEUE_NOW', retryFailed } satisfies ProcessMessage)
    const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync
    if (syncManager) {
      try {
        await syncManager.register(SYNC_TAG)
      } catch (error) {
        console.warn('[offline-queue] Unable to schedule sync on demand', error)
      }
    }
  } catch (error) {
    console.warn('[offline-queue] Unable to trigger queue processing', error)
  }
}

// The worker cannot refresh Firebase credentials itself. Only supply credentials
// for the account which originally queued the request.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'REQUEST_QUEUE_AUTH' || !event.ports[0]) return
    const port = event.ports[0]
    const user = auth.currentUser
    if (!user || user.uid !== event.data.authUid) {
      port.postMessage({ authToken: null })
      return
    }
    void user.getIdToken().then(
      authToken => port.postMessage({ authToken }),
      () => port.postMessage({ authToken: null }),
    )
  })
}
