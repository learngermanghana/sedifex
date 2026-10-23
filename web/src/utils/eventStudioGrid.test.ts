import { describe, expect, it } from 'vitest'
import { copyStudioGrid, pasteStudioGrid, repositionStudioRow, studioOverview, type StudioField, type StudioRow } from './eventStudioGrid'

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
  it('reorders selected records without mutating original rows', () => {
    const source: StudioRow[] = [{ id: '1' }, { id: '2' }, { id: '3' }]
    expect(repositionStudioRow(source, '2', -1).map(row => row.id)).toEqual(['2', '1', '3'])
    expect(source.map(row => row.id)).toEqual(['1', '2', '3'])
    expect(repositionStudioRow(source, '1', -1)).toBe(source)
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
