import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import ProductsWorkspace from './ProductsWorkspace'
vi.mock('../firebase', () => ({ db: {}, functions: {} }))
vi.mock('../hooks/useActiveStore', () => ({ useActiveStore: () => ({ storeId: 's' }) }))
vi.mock('../hooks/useMemberships', () => ({ useMemberships: () => ({ memberships: [{ storeId: 's', role: 'owner' }] }) }))
vi.mock('../hooks/useStorePreferenceSync', () => ({ useStorePreferenceSync: () => ({ clearPreference: vi.fn() }) }))
vi.mock('../hooks/useUnsavedChanges', () => ({ UnsavedChangesGuard: () => null }))
vi.mock('../components/SafeFirebaseImage', () => ({ default: () => null }))
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: null }) }))
vi.mock('firebase/firestore', () => ({ collection: () => ({}), limit: () => ({}), where: () => ({}), query: () => ({}), onSnapshot: (_: unknown, callback: (value: unknown) => void) => { callback({ docs: [] }); return () => {} } }))
it.each([['service', 'service'], ['course', 'course'], ['bad-type', 'product'], ['', 'product']])('initializes the editor from the validated item type %s', (requested, expected) => {
  render(<MemoryRouter initialEntries={[`/products/new?itemType=${requested}`]}><ProductsWorkspace /></MemoryRouter>)
  expect(screen.getByLabelText('Item type')).toHaveValue(expected)
  if (expected === 'course') expect(screen.getByLabelText('Full fee')).toBeVisible()
})
