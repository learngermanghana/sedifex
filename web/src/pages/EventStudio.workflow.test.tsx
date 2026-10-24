import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

const getDoc = vi.hoisted(() => vi.fn())
const updateDoc = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('firebase/firestore', () => ({
  getDoc,
  updateDoc,
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({})),
}))
vi.mock('../firebase', () => ({ db: {} }))
vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => ({ storeId: 'test-store', isLoading: false, error: null }),
}))
import { EventStudioWorkspace } from './EventStudio'

function mountWorkspace(initialEntries = ['/event-planning/test-event']) {
  updateDoc.mockClear()
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      title: 'Annual Dinner', eventDate: '2026-12-12', venue: 'Accra Hall',
      clientName: 'Organising Committee',
      eventStudio: { selected: ['checklist', 'programme', 'production'], sheets: {
        checklist: [
          { id: 'arrival', task: 'Guest arrival', detailNotes: 'Door A', internalNotes: 'Staff briefing' },
          { id: 'opening', task: 'Opening prayer' },
        ],
        programme: [{ id: 'guest-item', start: '09:00', item: 'Welcome', person: 'MC', internalNotes: 'Do not print this instruction' }],
        production: [{ id: 'staff-item', start: '08:00', segment: 'Sound check', cue: 'Check microphones', lead: 'Technical', internalNotes: 'Backup microphone by the stage' }],
      } },
    }),
  })
  const router = createMemoryRouter([
    { path: '/event-planning/:eventId', element: <EventStudioWorkspace /> },
    { path: '/event-planning', element: <div>All events</div> },
    { path: '/sell', element: <div>Sidebar destination</div> },
  ], { initialEntries, initialIndex: initialEntries.length - 1 })
  return { ...render(<RouterProvider router={router} />), router }
}

describe('Event Studio activity workflow', () => {
  it('edits row notes, reorders the row, and saves notes attached to the correct ID', async () => {
    const user = userEvent.setup()
    mountWorkspace()
    expect(await screen.findByRole('heading', { name: 'Checklist' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Notes for row 1' }))
    expect(screen.getByRole('textbox', { name: 'Additional activity notes' })).toHaveValue('Door A')
    expect(screen.getByRole('textbox', { name: 'Private team notes' })).toHaveValue('Staff briefing')
    fireEvent.change(screen.getByRole('textbox', { name: 'Additional activity notes' }), { target: { value: 'Use Door B' } })
    await user.click(screen.getByRole('button', { name: '↓ Move' }))
    await user.click(screen.getByRole('button', { name: /Save now/ }))
    await waitFor(() => expect(updateDoc).toHaveBeenCalled())
    const saved = updateDoc.mock.calls.at(-1)?.[1]
    expect(saved.eventStudio.sheets.checklist.map((row: { id: string }) => row.id)).toEqual(['opening', 'arrival'])
    expect(saved.eventStudio.sheets.checklist[1]).toMatchObject({ id: 'arrival', detailNotes: 'Use Door B', internalNotes: 'Staff briefing' })
  })

  it('updates existing event metadata without writing over the Studio sheets', async () => {
    const user = userEvent.setup()
    mountWorkspace()
    await screen.findByRole('heading', { name: 'Checklist' })
    await user.click(screen.getByRole('tab', { name: 'Event Details' }))
    expect(screen.getByRole('textbox', { name: 'Venue' })).toHaveValue('Accra Hall')
    fireEvent.change(screen.getByRole('textbox', { name: 'Venue' }), { target: { value: 'New Venue' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Event-wide notes & client instructions' }), { target: { value: 'Set up before 7 AM' } })
    await user.click(screen.getByRole('button', { name: 'Save event details' }))
    await waitFor(() => expect(updateDoc).toHaveBeenCalled())
    expect(updateDoc.mock.calls.at(-1)?.[1]).toMatchObject({ venue: 'New Venue', notes: 'Set up before 7 AM' })
    expect(updateDoc.mock.calls.at(-1)?.[1]).not.toHaveProperty('eventStudio')
  })

  it('separates guest printing from private run-sheet instructions', async () => {
    const user = userEvent.setup()
    mountWorkspace()
    await screen.findByRole('heading', { name: 'Checklist' })
    await user.click(screen.getByRole('tab', { name: 'Guest Programme' }))
    const guest = document.querySelector('.event-studio__print-programme')
    expect(guest?.textContent).toContain('Welcome')
    expect(guest?.textContent).not.toContain('Do not print this instruction')
    await user.click(screen.getByRole('tab', { name: 'Production Outline' }))
    expect(screen.getByRole('button', { name: 'Print production run sheet' })).toBeInTheDocument()
  })
  it('warns on sidebar route changes and browser Back while event details are unsaved', async () => {
    const user = userEvent.setup()
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { router } = mountWorkspace(['/sell', '/event-planning/test-event'])
    try {
      await screen.findByRole('heading', { name: 'Checklist' })
      await user.click(screen.getByRole('tab', { name: 'Event Details' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Venue' }), { target: { value: 'New Venue' } })
      void router.navigate('/sell')
      await waitFor(() => expect(confirmation).toHaveBeenCalled())
      expect(router.state.location.pathname).toBe('/event-planning/test-event')
      confirmation.mockClear()
      void router.navigate(-1)
      await waitFor(() => expect(confirmation).toHaveBeenCalled())
      expect(router.state.location.pathname).toBe('/event-planning/test-event')
      confirmation.mockReturnValue(true)
      void router.navigate('/sell')
      await waitFor(() => expect(screen.getByText('Sidebar destination')).toBeInTheDocument())
    } finally {
      confirmation.mockRestore()
    }
  })

  it('lets saved event details navigate away without a confirmation', async () => {
    const user = userEvent.setup()
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { router } = mountWorkspace()
    try {
      await screen.findByRole('heading', { name: 'Checklist' })
      await user.click(screen.getByRole('tab', { name: 'Event Details' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Venue' }), { target: { value: 'New Venue' } })
      await user.click(screen.getByRole('button', { name: 'Save event details' }))
      await waitFor(() => expect(screen.getByText('✓ Details saved')).toBeInTheDocument())
      void router.navigate('/sell')
      await waitFor(() => expect(screen.getByText('Sidebar destination')).toBeInTheDocument())
      expect(confirmation).not.toHaveBeenCalled()
    } finally {
      confirmation.mockRestore()
    }
  })

  it('removes the printed date after the user clears and saves event date', async () => {
    const user = userEvent.setup()
    mountWorkspace()
    await screen.findByRole('heading', { name: 'Checklist' })
    const print = document.querySelector('.event-studio__print-programme')
    expect(print?.textContent).toContain('2026-12-12')
    await user.click(screen.getByRole('tab', { name: 'Event Details' }))
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save event details' }))
    await waitFor(() => expect(screen.getByText('✓ Details saved')).toBeInTheDocument())
    expect(updateDoc.mock.calls.at(-1)?.[1]).toMatchObject({ eventDate: '' })
    expect(print?.textContent).not.toContain('2026-12-12')
  })

})
