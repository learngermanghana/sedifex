import { beforeEach, expect, it, vi } from 'vitest'
import { getOnboardingStatus, setOnboardingStatus } from './onboarding'
const state = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: () => ({}), setDoc: state.set, getDoc: vi.fn(), serverTimestamp: () => 'timestamp' }))
beforeEach(() => { localStorage.clear(); state.set.mockReset().mockResolvedValue(undefined) })
it('only marks strict completion after the remote save succeeds', async () => {
  state.set.mockRejectedValueOnce(new Error('Network unavailable'))
  await expect(setOnboardingStatus('owner', 'completed', { requireRemote: true })).rejects.toThrow('Network unavailable')
  expect(getOnboardingStatus('owner')).toBeNull()
  await setOnboardingStatus('owner', 'completed', { requireRemote: true })
  expect(getOnboardingStatus('owner')).toBe('completed')
})
