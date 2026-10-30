import React from 'react'
import invoicePrintCss from './DocumentsGenerator.css?raw'
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

  it('renders a complete print-only checklist with values rather than editable controls', async () => {
    const user = userEvent.setup()
    const view = mountStudio()
    expect(await screen.findByRole('heading', { name: 'Checklist' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Task row 1' }), { target: { value: 'Confirm event venue' } })
    const printSheet = view.container.querySelector('.event-studio__print-sheet')
    expect(printSheet).toBeInTheDocument()
    expect(printSheet?.querySelector('input')).toBeNull()
    expect(printSheet?.textContent).toContain('Annual Fundraiser')
    expect(printSheet?.textContent).toContain('Checklist')
    expect(printSheet?.textContent).toContain('Confirm event venue')
    expect(printSheet?.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('includes all budget amounts and totals in the printable sheet', async () => {
    const user = userEvent.setup()
    const view = mountStudio()
    await screen.findByRole('heading', { name: 'Checklist' })
    await user.click(screen.getByRole('button', { name: '+ Add tool' }))
    await user.click(screen.getByRole('button', { name: /Budget & Expenses/ }))
    await user.click(screen.getByRole('button', { name: 'Done choosing' }))
    await user.click(screen.getByRole('tab', { name: 'Budget & Expenses' }))
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Budgeted (GHS) row 1' }), { target: { value: '500' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spent (GHS) row 1' }), { target: { value: '150' } })
    const printSheet = view.container.querySelector('.event-studio__print-sheet')
    const printText = printSheet?.textContent || ''
    expect(printText).toContain('Budget & Expenses')
    expect(printText).toContain('GHS 500.00')
    expect(printText).toContain('GHS 150.00')
    expect(printText).toContain('GHS 350.00')
    expect(printSheet?.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('does not let invoice print CSS hide the Event Workspace', () => {
    const css = invoicePrintCss
    expect(css).not.toMatch(/@media print\s*\{\s*body \*\s*\{/)
    expect(css).toContain('body:has(.documents-builder) *')
  })


  it('shows Checklist entries in Budget automatically and keeps Spent independently editable', async () => {
    const user = userEvent.setup()
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'Annual Fundraiser',
        eventStudio: {
          selected: ['checklist'],
          sheets: {
            checklist: [{ id: 'venue', task: 'Book event hall', owner: 'Ama', due: '2026-12-05',
              status: 'Not started', cost: '800' }],
            budget: [],
          },
        },
      }),
    })
    const router = createMemoryRouter([
      { path: '/event-planning/:eventId', element: <EventStudioWorkspace /> },
      { path: '/event-planning', element: <div>All events</div> },
    ], { initialEntries: ['/event-planning/event-1'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('tab', { name: 'Budget & Expenses' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Budget & Expenses' }))
    expect(screen.getByText('Book event hall')).toBeInTheDocument()
    expect(screen.getByText('Ama')).toBeInTheDocument()
    expect(screen.getAllByText('GHS 800.00').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox', { name: 'Expense row 1' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spent (GHS) row 1' }),
      { target: { value: '200' } })
    await user.click(screen.getByRole('tab', { name: 'Checklist' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Task row 1' }),
      { target: { value: 'Reserve conference hall' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Est. cost (GHS) row 1' }),
      { target: { value: '950' } })
    await user.click(screen.getByRole('tab', { name: 'Budget & Expenses' }))
    expect(screen.getByText('Reserve conference hall')).toBeInTheDocument()
    expect(screen.getAllByText('GHS 950.00').length).toBeGreaterThan(0)
    expect(screen.getByRole('spinbutton', { name: 'Spent (GHS) row 1' })).toHaveValue(200)
  })

})
