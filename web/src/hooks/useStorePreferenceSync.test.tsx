import React, { StrictMode, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStorePreferenceSync } from './useStorePreferenceSync'

const STRING_PREFIX = 'test-string-pref-'
const JSON_PREFIX = 'test-json-pref-'

function StringPreferenceHarness({ storeId }: { storeId: string }) {
  const [value, setValue] = useState('')
  const { clearPreference } = useStorePreferenceSync({
    storeId,
    keyPrefix: STRING_PREFIX,
    value,
    defaultValue: '',
    apply: setValue,
    serialize: current => current,
    deserialize: raw => raw,
    debugName: 'test-string',
  })

  return (
    <>
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setValue('changed')}>Change</button>
      <button type="button" onClick={clearPreference}>Clear</button>
    </>
  )
}

function JsonPreferenceHarness({ storeId }: { storeId: string }) {
  const [filters, setFilters] = useState({ search: '', source: 'all' })

  useStorePreferenceSync({
    storeId,
    keyPrefix: JSON_PREFIX,
    value: filters,
    defaultValue: { search: '', source: 'all' },
    apply: setFilters,
    serialize: JSON.stringify,
    deserialize: raw => {
      const parsed = JSON.parse(raw) as { search?: unknown; source?: unknown }
      return {
        search: typeof parsed.search === 'string' ? parsed.search : '',
        source: typeof parsed.source === 'string' ? parsed.source : 'all',
      }
    },
    debugName: 'test-json',
  })

  return <output data-testid="json-value">{filters.search}:{filters.source}</output>
}

describe('useStorePreferenceSync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores a saved value without StrictMode overwriting it', async () => {
    localStorage.setItem(`${STRING_PREFIX}store-a`, 'saved search')

    render(
      <StrictMode>
        <StringPreferenceHarness storeId="store-a" />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('saved search'))
    expect(localStorage.getItem(`${STRING_PREFIX}store-a`)).toBe('saved search')
  })

  it('keeps preferences isolated when the active store changes', async () => {
    localStorage.setItem(`${STRING_PREFIX}store-a`, 'alpha')
    localStorage.setItem(`${STRING_PREFIX}store-b`, 'beta')

    const { rerender } = render(
      <StrictMode>
        <StringPreferenceHarness storeId="store-a" />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('alpha'))

    rerender(
      <StrictMode>
        <StringPreferenceHarness storeId="store-b" />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('beta'))
    expect(localStorage.getItem(`${STRING_PREFIX}store-a`)).toBe('alpha')
    expect(localStorage.getItem(`${STRING_PREFIX}store-b`)).toBe('beta')
  })

  it('falls back safely when stored JSON is malformed', async () => {
    localStorage.setItem(`${JSON_PREFIX}store-a`, '{not valid json')

    render(
      <StrictMode>
        <JsonPreferenceHarness storeId="store-a" />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByTestId('json-value')).toHaveTextContent(':all'))
    expect(localStorage.getItem(`${JSON_PREFIX}store-a`)).toBe('{not valid json')
  })

  it('clears the stored value and resets the UI state', async () => {
    localStorage.setItem(`${STRING_PREFIX}store-a`, 'saved search')

    render(
      <StrictMode>
        <StringPreferenceHarness storeId="store-a" />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('saved search'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(screen.getByTestId('value').textContent).toBe(''))
    expect(localStorage.getItem(`${STRING_PREFIX}store-a`)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(localStorage.getItem(`${STRING_PREFIX}store-a`)).toBe('changed'))
  })
})
