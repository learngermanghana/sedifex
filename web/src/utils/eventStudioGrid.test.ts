import { describe, expect, it } from 'vitest'
import { copyStudioGrid, pasteStudioGrid, repositionStudioRow, dropStudioRow, studioOverview, normalizePastedDate, normalizePastedTime, type StudioField, type StudioRow } from './eventStudioGrid'

const fields: StudioField[] = [
  { key: 'task', label: 'Task', type: 'text' },
  { key: 'cost', label: 'Cost', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['Not started', 'Done'] },
  { key: 'total', label: 'Total', type: 'computed' },
]
const makeRow = (): StudioRow => ({ id: 'new-' + Math.random(), task: '', cost: '', status: 'Not started' })

describe('Event Studio grid tools', () => {
  it('pastes Excel cells across rows and adds extra rows while keeping computed fields read-only', () => {
    const rows: StudioRow[] = [{ id: '1', task: '', cost: '', status: 'Not started' }]
    const pasted = pasteStudioGrid(rows, fields, '1', 'task', 'Book venue\t450\tDone\t999\nPrepare programme\t125\tNot started\t888', makeRow)
    expect(pasted.changed).toBe(true)
    expect(pasted.rows).toHaveLength(2)
    expect(pasted.rows[0]).toMatchObject({ task: 'Book venue', cost: '450', status: 'Done' })
    expect(pasted.rows[1]).toMatchObject({ task: 'Prepare programme', cost: '125', status: 'Not started' })
    expect(pasted.rows[0]).not.toHaveProperty('total')
    expect(rows).toHaveLength(1)
  })
  it('ignores invalid select or negative amounts and preserves row order when copying', () => {
    const source: StudioRow[] = [{ id: '1', task: 'Registration', cost: '12', status: 'Not started' }]
    const result = pasteStudioGrid(source, fields, '1', 'cost', '-3\tNot valid', makeRow)
    expect(result.changed).toBe(false)
    expect(source[0].cost).toBe('12')
    expect(copyStudioGrid(source, fields)).toBe('Task\tCost\tStatus\nRegistration\t12\tNot started')
  })

  it('round-trips donations with the computed balance column in the middle', () => {
    const donationFields: StudioField[] = [
      { key: 'donor', label: 'Donor / Organisation', type: 'text' },
      { key: 'pledged', label: 'Pledged (GHS)', type: 'number' },
      { key: 'received', label: 'Received (GHS)', type: 'number' },
      { key: 'balance', label: 'Balance (GHS)', type: 'computed' },
      { key: 'method', label: 'Payment method', type: 'select', options: ['Not specified', 'Mobile money', 'Bank transfer', 'Cash'] },
      { key: 'notes', label: 'Notes', type: 'text' },
    ]
    const source: StudioRow[] = [
      { id: 'one', donor: 'Ama', pledged: '100', received: '45', method: 'Mobile money', notes: 'First donor' },
      { id: 'two', donor: 'Kofi', pledged: '200', received: '80', method: 'Bank transfer', notes: 'Company account' },
    ]
    const exported = copyStudioGrid(source, donationFields)
    const blank = (): StudioRow => ({ id: Math.random().toString(), donor: '', pledged: '', received: '', method: 'Not specified', notes: '' })
    const destination = { id: 'destination', donor: '', pledged: '', received: '', method: 'Not specified', notes: '' }
    const result = pasteStudioGrid([destination], donationFields, destination.id, 'donor', exported, blank)
    expect(result.rejected).toBe(0)
    expect(result.applied).toBe(10)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map(row => [row.donor, row.pledged, row.received, row.method, row.notes])).toEqual(
      source.map(row => [row.donor, row.pledged, row.received, row.method, row.notes]),
    )
    expect(result.rows[0]).not.toHaveProperty('balance')
    const partial = pasteStudioGrid([destination], donationFields, 'destination', 'received', '35\tCash\tPaid now', blank)
    expect(partial.rows[0]).toMatchObject({ received: '35', method: 'Cash', notes: 'Paid now' })
  })

  it('normalizes Excel-style dates and times into HTML input values', () => {
    expect(normalizePastedDate('10/23/2026')).toBe('2026-10-23')
    expect(normalizePastedDate('23/10/2026')).toBe('2026-10-23')
    expect(normalizePastedDate('2026-2-3')).toBe('2026-02-03')
    expect(normalizePastedDate('2028-02-29')).toBe('2028-02-29')
    expect(normalizePastedTime('9:00 AM')).toBe('09:00')
    expect(normalizePastedTime('12:15 AM')).toBe('00:15')
    expect(normalizePastedTime('12:15 PM')).toBe('12:15')
    expect(normalizePastedTime('9:30 PM')).toBe('21:30')
    expect(normalizePastedTime('23:01:05')).toBe('23:01:05')
    expect(normalizePastedTime('9 AM')).toBe('09:00')
  })

  it('rejects unrenderable dates and times without overwriting existing values or creating empty rows', () => {
    expect(normalizePastedDate('02/29/2026')).toBeNull()
    expect(normalizePastedDate('2026-13-01')).toBeNull()
    expect(normalizePastedDate('31/02/2026')).toBeNull()
    expect(normalizePastedTime('25:00')).toBeNull()
    expect(normalizePastedTime('13:00 PM')).toBeNull()
    expect(normalizePastedTime('9')).toBeNull()
    const scheduleFields: StudioField[] = [
      { key: 'day', label: 'Day', type: 'date' },
      { key: 'start', label: 'Time', type: 'time' },
    ]
    const source: StudioRow[] = [{ id: 'first', day: '2026-10-22', start: '08:30' }]
    const invalid = pasteStudioGrid(source, scheduleFields, 'first', 'day', '02/29/2026\t25:00\nnonsense\tbad', () => ({ id: 'new', day: '', start: '' }))
    expect(invalid).toMatchObject({ changed: false, applied: 0, rejected: 4 })
    expect(invalid.rows).toBe(source)
    expect(source).toHaveLength(1)
    const mixed = pasteStudioGrid(source, scheduleFields, 'first', 'day', '10/23/2026\t9:00 AM\n02/29/2026\t6:30 PM', () => ({ id: 'new', day: '', start: '' }))
    expect(mixed).toMatchObject({ changed: true, applied: 3, rejected: 1 })
    expect(mixed.rows[0]).toMatchObject({ day: '2026-10-23', start: '09:00' })
    expect(mixed.rows[1].start).toBe('18:30')
    expect(mixed.rows[1].day).toBe('')
  })

  it('reorders selected records without mutating original rows', () => {
    const source: StudioRow[] = [{ id: '1' }, { id: '2' }, { id: '3' }]
    expect(repositionStudioRow(source, '2', -1).map(row => row.id)).toEqual(['2', '1', '3'])
    expect(source.map(row => row.id)).toEqual(['1', '2', '3'])
    expect(repositionStudioRow(source, '1', -1)).toBe(source)
  })
  it('drag-drops rows by stable ID, preserving notes and original data', () => {
    const rows: StudioRow[] = [
      { id: 'arrival', task: 'Guest arrival', detailNotes: 'Door A', internalNotes: 'Ushers only' },
      { id: 'opening', task: 'Opening prayer', detailNotes: 'Pastor Michael' },
      { id: 'welcome', task: 'Welcome', detailNotes: 'Microphone check' },
    ]
    const moved = dropStudioRow(rows, 'arrival', 'welcome')
    expect(moved.map(row => row.id)).toEqual(['opening', 'arrival', 'welcome'])
    expect(moved[1]).toMatchObject({ task: 'Guest arrival', detailNotes: 'Door A', internalNotes: 'Ushers only' })
    expect(rows.map(row => row.id)).toEqual(['arrival', 'opening', 'welcome'])
    expect(dropStudioRow(rows, 'arrival', 'arrival')).toBe(rows)
    expect(dropStudioRow(rows, 'missing', 'opening')).toBe(rows)
    expect(dropStudioRow(rows, 'welcome', 'arrival', true).map(row => row.id)).toEqual(['arrival', 'welcome', 'opening'])
  })

  it('derives overview without requesting anything from the database', () => {
    const result = studioOverview({
      checklist: [{ id: '1', status: 'Done' }, { id: '2', status: 'Not started' }],
      programme: [{ id: 'p', minutes: '75' }],
      guests: [{ id: 'g', rsvp: 'Confirmed', seats: '2' }],
      budget: [{ id: 'b', estimate: '200', actual: '95' }],
      donations: [{ id: 'd', pledged: '400', received: '120' }],
    })
    expect(result).toMatchObject({ tasks: 2, completed: 1, programmeMinutes: 75, confirmedSeats: 2, budget: 200, spent: 95, pledged: 400, received: 120 })
  })
})
