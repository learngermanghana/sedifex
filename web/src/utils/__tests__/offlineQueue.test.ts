import { MessageChannel } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: { currentUser: { uid: 'owner-1', getIdToken: vi.fn(async () => 'fresh-token') } } }))
vi.mock('../../firebase', () => ({ auth }))

describe('offline queue persistence confirmation', () => {
  let postMessage: ReturnType<typeof vi.fn>
  let listener: (event: MessageEvent) => void
  let queueCallableRequest: (typeof import('../offlineQueue'))['queueCallableRequest']

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_FB_PROJECT_ID', 'demo-project')
    vi.stubEnv('VITE_FB_FUNCTIONS_REGION', 'us-central1')
    vi.stubGlobal('MessageChannel', MessageChannel)
    auth.currentUser = { uid: 'owner-1', getIdToken: vi.fn(async () => 'fresh-token') }
    postMessage = vi.fn((message, ports) => {
      if (message.type === 'QUEUE_BACKGROUND_REQUEST') ports[0].postMessage({ stored: true })
    })
    vi.stubGlobal('navigator', { serviceWorker: {
      ready: Promise.resolve({ active: { postMessage } }),
      addEventListener: vi.fn((_type, callback) => { listener = callback }),
    } })
    ;({ queueCallableRequest } = await import('../offlineQueue'))
  })

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('reports success only when storage acknowledges the sale', async () => {
    postMessage.mockImplementationOnce((_message, ports) => {
      setTimeout(() => ports[0].postMessage({ stored: true }), 20)
    })
    let completed = false
    const request = queueCallableRequest('commitSale', { saleId: 'sale-1' }, 'sale').then(result => { completed = true; return result })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(completed).toBe(false)
    expect(await request).toBe(true)
    expect(postMessage.mock.calls[0][0].payload).toMatchObject({ authUid: 'owner-1', authToken: 'fresh-token', endpoint: 'https://us-central1-demo-project.cloudfunctions.net/commitSale' })
  })

  it('does not claim the sale is saved when storage fails', async () => {
    postMessage.mockImplementationOnce((_message, ports) => ports[0].postMessage({ stored: false }))
    expect(await queueCallableRequest('commitSale', {}, 'sale')).toBe(false)
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('refreshes credentials only for the account which queued the request', async () => {
    const port = { postMessage: vi.fn() }
    listener({ data: { type: 'REQUEST_QUEUE_AUTH', authUid: 'another-owner' }, ports: [port] } as unknown as MessageEvent)
    expect(port.postMessage).toHaveBeenCalledWith({ authToken: null })
    expect(auth.currentUser.getIdToken).not.toHaveBeenCalled()
    port.postMessage.mockClear()
    listener({ data: { type: 'REQUEST_QUEUE_AUTH', authUid: 'owner-1' }, ports: [port] } as unknown as MessageEvent)
    await Promise.resolve()
    expect(port.postMessage).toHaveBeenCalledWith({ authToken: 'fresh-token' })
  })
})
