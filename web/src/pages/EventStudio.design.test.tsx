import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

const mockGetDoc = vi.hoisted(() => vi.fn())
const mockUpdateDoc = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  runTransaction: vi.fn(async (_db, callback) => callback({ get: mockGetDoc, update: mockUpdateDoc })),
  serverTimestamp: () => ({}),
  collection: () => ({}),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
}))
vi.mock('../firebase', () => ({ db: {}, functions: {} }))
vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => ({ storeId: 'test-store', isLoading: false, error: null }),
}))

import { EventStudioWorkspace } from './EventStudio'

function mountStudio() {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ title: 'Annual Fundraiser', eventStudio: { selected: ['checklist'], sheets: { checklist: [] } } }),
  })
  const router = createMemoryRouter([
    { path: '/event-planning/:eventId', element: <EventStudioWorkspace /> },
    { path: '/event-planning', element: <div>All events</div> },
  ], { initialEntries: ['/event-planning/event-1'] })
  return render(<RouterProvider router={router} />)
}

describe('Event Studio compact spreadsheet design', () => {
  it('hides the large tool picker until requested and adds rows without new services', async () => {
    const user = userEvent.setup()
    mountStudio()
    expect(await screen.findByRole('heading', { name: 'Checklist' })).toBeInTheDocument()
    expect(screen.queryByText('Choose your tools')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add tool' }))
    expect(screen.getByText('Choose your tools')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Budget & Expenses/ }))
    expect(screen.getByRole('tab', { name: 'Budget & Expenses' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done choosing' }))
    expect(screen.queryByText('Choose your tools')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Budget & Expenses' }))
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Budgeted (GHS) row 1' }), { target: { value: '500' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spent (GHS) row 1' }), { target: { value: '150' } })
    expect(screen.getAllByText('GHS 350.00').length).toBeGreaterThan(0)
  })

  it('supports duplicate, undo, sort and compact full view', async () => {
    const user = userEvent.setup()
    mountStudio()
    expect(await screen.findByRole('heading', { name: 'Checklist' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Task row 1' }), { target: { value: 'Book venue' } })
    await user.click(screen.getByRole('button', { name: /Duplicate/ }))
    expect(screen.getAllByRole('textbox', { name: /Task row/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(screen.getAllByRole('textbox', { name: /Task row/ })).toHaveLength(1)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort rows by' }), 'task')
    expect(screen.getByRole('button', { name: 'Reverse sort order' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '⛶ Full view' }))
    expect(document.querySelector('.event-studio--focus')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '⊟ Exit full view' }))
    expect(document.querySelector('.event-studio--focus')).not.toBeInTheDocument()
  })
})
