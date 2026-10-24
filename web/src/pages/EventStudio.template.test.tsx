import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockAddDoc = vi.hoisted(() => vi.fn(async (_reference: unknown, _data: { eventType: string; title: string }) => ({ id: 'created-event' })))
const mockGetDocs = vi.hoisted(() => vi.fn(async () => ({ docs: [] })))

vi.mock('firebase/firestore', () => ({
  addDoc: mockAddDoc,
  getDocs: mockGetDocs,
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({})),
}))
vi.mock('../firebase', () => ({ db: {}, functions: {} }))
vi.mock('../hooks/useActiveStore', () => ({
  useActiveStore: () => ({ storeId: 'test-store', isLoading: false, error: null }),
}))

import { EventStudioHome } from './EventStudio'

describe('Event Studio canonical event types', () => {
  it.each([
    ['Blank event', 'Other'],
    ['Wedding', 'Traditional wedding'],
    ['Funeral', 'Funeral'],
    ['Church event', 'Church / religious event'],
    ['Conference', 'Conference / seminar'],
    ['Birthday', 'Birthday'],
    ['Fundraising', 'Charity / community'],
  ])('stores %s as the legacy-compatible %s event type', async (template, eventType) => {
    mockAddDoc.mockClear()
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/event-planning']}>
      <Routes>
        <Route path="/event-planning" element={<EventStudioHome />} />
        <Route path="/event-planning/:eventId" element={<div>Created event</div>} />
      </Routes>
    </MemoryRouter>)
    await user.type(screen.getByPlaceholderText('e.g. Annual fundraising dinner'), 'Planning a new event')
    await user.click(screen.getByRole('radio', { name: new RegExp('^' + template) }))
    await user.click(screen.getByRole('button', { name: /Create event & choose tools/i }))
    await waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1))
    expect(mockAddDoc.mock.calls[0][1]).toMatchObject({ eventType, title: 'Planning a new event' })
  })

  it.each(['White wedding', 'Engagement'])('preserves the selected wedding subtype %s', async weddingType => {
    mockAddDoc.mockClear()
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/event-planning']}>
      <Routes>
        <Route path="/event-planning" element={<EventStudioHome />} />
        <Route path="/event-planning/:eventId" element={<div>Created event</div>} />
      </Routes>
    </MemoryRouter>)
    await user.type(screen.getByPlaceholderText('e.g. Annual fundraising dinner'), 'Ceremony')
    await user.click(screen.getByRole('radio', { name: /^Wedding/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Wedding ceremony type' }), weddingType)
    await user.click(screen.getByRole('button', { name: /Create event & choose tools/i }))
    await waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1))
    expect(mockAddDoc.mock.calls[0][1].eventType).toBe(weddingType)
  })
})
