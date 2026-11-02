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
    ['Cleaning Service', 'Cleaning service'],
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

  it('creates an editable cleaning job with a linked budget, checklist, work schedule and vendor sheet', async () => {
    mockAddDoc.mockClear()
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/event-planning']}>
      <Routes>
        <Route path="/event-planning" element={<EventStudioHome />} />
        <Route path="/event-planning/:eventId" element={<div>Created event</div>} />
      </Routes>
    </MemoryRouter>)

    await user.click(screen.getByRole('radio', { name: /^Cleaning Service/ }))
    expect(screen.getByRole('heading', { name: 'Create a cleaning job' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('e.g. Office deep cleaning'), 'Office weekly cleaning')
    await user.click(screen.getByRole('button', { name: /Create cleaning job & choose tools/i }))
    await waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1))

    const saved = mockAddDoc.mock.calls[0][1] as {
      eventType: string
      eventStudio: {
        selected: string[]
        sheets: Record<string, Array<Record<string, string | number>>>
      }
    }
    expect(saved.eventType).toBe('Cleaning service')
    expect(saved.eventStudio.selected).toEqual(['checklist', 'production', 'budget', 'vendors'])
    expect(saved.eventStudio.sheets.checklist).toHaveLength(16)
    expect(saved.eventStudio.sheets.production).toHaveLength(5)
    expect(saved.eventStudio.sheets.guests).toEqual([])
    expect(saved.eventStudio.sheets.donations).toEqual([])
    expect(saved.eventStudio.sheets.programme).toEqual([])

    const tasks = saved.eventStudio.sheets.checklist
    const expenses = saved.eventStudio.sheets.budget
    expect(expenses).toHaveLength(tasks.length)
    for (const task of tasks) {
      expect(task.status).toBe('Not started')
      expect(task.cost).toBe('')
      expect(expenses.filter(expense => expense.sourceChecklistId === task.id)).toHaveLength(1)
      expect(expenses.find(expense => expense.sourceChecklistId === task.id)).toMatchObject({
        item: task.task, actual: '', estimate: '', category: '',
      })
    }
    expect(saved.eventStudio.sheets.production[0]).toMatchObject({
      segment: 'Arrival and site review',
      status: 'Planned',
      start: '',
      minutes: '',
    })
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
