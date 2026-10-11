import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnsavedChangesGuard } from './useUnsavedChanges'

function fixture(dirty: boolean) {
  const router = createMemoryRouter([
    { path: '/', element: <><UnsavedChangesGuard dirty={dirty} /><Link to="/next">Leave editor</Link></> },
    { path: '/next', element: <p>Next page</p> },
  ])
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => vi.restoreAllMocks())

describe('unfinished edit protection', () => {
  it('keeps edits open when the user declines navigation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = fixture(true)
    fireEvent.click(screen.getByText('Leave editor'))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(router.state.location.pathname).toBe('/')
  })

  it('allows navigation when the user chooses to discard edits', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fixture(true)
    fireEvent.click(screen.getByText('Leave editor'))
    await screen.findByText('Next page')
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('does not prompt when there are no unsaved edits', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    fixture(false)
    fireEvent.click(screen.getByText('Leave editor'))
    await screen.findByText('Next page')
    expect(confirm).not.toHaveBeenCalled()
  })
})
