import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useConnectivityStatus } from './useConnectivityStatus'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('polls every five minutes only while visible and checks again on return', async () => {
  vi.useFakeTimers()
  let visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
  const fetcher = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetcher)
  const { unmount } = renderHook(() => useConnectivityStatus())
  await act(async () => {})
  expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(30_000) })
  expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(270_000) })
  expect(fetcher).toHaveBeenCalledTimes(2)
  visibility = 'hidden'
  await act(async () => { vi.advanceTimersByTime(600_000) })
  expect(fetcher).toHaveBeenCalledTimes(2)
  visibility = 'visible'
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(fetcher).toHaveBeenCalledTimes(3)
  unmount()
})

it('does not overlap pending connectivity requests', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const { result, unmount } = renderHook(() => useConnectivityStatus())
  await act(async () => { await result.current.checkHeartbeat() })
  expect(fetch).toHaveBeenCalledTimes(1)
  unmount()
})
