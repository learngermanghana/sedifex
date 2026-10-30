import { describe, expect, it } from 'vitest'
import { syncEventChecklistBudget, type EventStudioSyncRow } from './eventChecklistBudgetSync'

type Studio = { selected: string[]; sheets: { checklist: EventStudioSyncRow[]; budget: EventStudioSyncRow[] } }
const createStudio = (tasks: EventStudioSyncRow[] = [], budget: EventStudioSyncRow[] = []): Studio =>
  ({ selected: ['checklist'], sheets: { checklist: tasks, budget } })

describe('Checklist to Budget & Expenses synchronization', () => {
  it('copies all checklist details and estimated cost exactly once', () => {
    const task = { id: 'task-1', task: 'Book venue', owner: 'Ama', due: '2026-12-01', status: 'In progress', cost: '1200' }
    const result = syncEventChecklistBudget(createStudio([task]))
    expect(result.selected).toContain('budget')
    expect(result.sheets.budget).toHaveLength(1)
    expect(result.sheets.budget[0]).toMatchObject({
      sourceChecklistId: 'task-1', item: 'Book venue', owner: 'Ama', due: '2026-12-01',
      status: 'In progress', estimate: '1200', actual: '', category: '',
    })
    expect(syncEventChecklistBudget(result)).toBe(result)
  })

  it('updates renamed tasks and costs without changing actual expenses or category', () => {
    const first = syncEventChecklistBudget(createStudio([{ id: 'task-1', task: 'Book venue', owner: 'Ama', cost: 100 }]))
    const paid = { ...first, sheets: { ...first.sheets, budget: [
      { ...first.sheets.budget[0], category: 'Venue', actual: 60 },
    ] } }
    const edited = { ...paid, sheets: { ...paid.sheets, checklist: [
      { id: 'task-1', task: 'Reserve event hall', owner: 'Kwame', due: '2026-12-20', status: 'Done', cost: 125 },
    ] } }
    const result = syncEventChecklistBudget(edited)
    expect(result.sheets.budget).toHaveLength(1)
    expect(result.sheets.budget[0]).toMatchObject({
      id: first.sheets.budget[0].id, item: 'Reserve event hall', owner: 'Kwame',
      due: '2026-12-20', status: 'Done', estimate: 125, actual: 60, category: 'Venue',
    })
    const cleared = syncEventChecklistBudget({ ...result, sheets: { ...result.sheets, checklist: [
      { ...edited.sheets.checklist[0], cost: '' },
    ] } })
    expect(cleared.sheets.budget[0].estimate).toBe('')
    expect(cleared.sheets.budget[0].actual).toBe(60)
  })

  it('reuses existing same-named budget items instead of duplicating or losing financial entries', () => {
    const manual = { id: 'existing-expense', item: 'Book venue', category: 'Logistics', estimate: 200, actual: 90 }
    const first = syncEventChecklistBudget(createStudio([{ id: 'task-a', task: '  BOOK  VENUE ', cost: '' }], [manual]))
    expect(first.sheets.budget).toHaveLength(1)
    expect(first.sheets.budget[0]).toMatchObject({
      id: 'existing-expense', sourceChecklistId: 'task-a', category: 'Logistics', estimate: 200, actual: 90,
    })
    expect(syncEventChecklistBudget(first)).toBe(first)
    const withCost = syncEventChecklistBudget({ ...first, sheets: { ...first.sheets, checklist: [
      { id: 'task-a', task: 'Book venue', cost: '350' },
    ] } })
    expect(withCost.sheets.budget[0]).toMatchObject({ id: 'existing-expense', estimate: '350', actual: 90 })
  })

  it('retains existing spending if a checklist task is deleted', () => {
    const initial = syncEventChecklistBudget(createStudio([{ id: 'task-a', task: 'Catering', cost: 750 }]))
    initial.sheets.budget[0].actual = 400
    const result = syncEventChecklistBudget({ ...initial, sheets: { ...initial.sheets, checklist: [] } })
    expect(result.sheets.budget).toHaveLength(1)
    expect(result.sheets.budget[0]).toMatchObject({
      item: 'Catering', actual: 400, estimate: 750, sourceChecklistId: '', estimateOrigin: 'manual',
    })
    expect(syncEventChecklistBudget(result)).toBe(result)
  })

  it('keeps independent budget items and handles repeated task descriptions', () => {
    const source = createStudio([
      { id: 'one', task: 'Decor', cost: 50 }, { id: 'two', task: 'Decor', cost: 60 },
    ], [{ id: 'manual', item: 'Transport', estimate: 80, actual: 20 }])
    const result = syncEventChecklistBudget(source)
    expect(result.sheets.budget).toHaveLength(3)
    expect(result.sheets.budget.filter(row => row.item === 'Decor')).toHaveLength(2)
    expect(result.sheets.budget.find(row => row.id === 'manual')).toMatchObject({ actual: 20, estimate: 80 })
  })

  it('does not create blank placeholder expenses and respects manually hidden Budget tools', () => {
    const empty = syncEventChecklistBudget(createStudio([{ id: 'one', task: '', cost: '' }]))
    expect(empty.sheets.budget).toHaveLength(0)
    expect(empty.selected).toEqual(['checklist'])
    const first = syncEventChecklistBudget(createStudio([{ id: 'one', task: 'Lighting', cost: 50 }]))
    const hidden = { ...first, selected: ['checklist'] }
    const result = syncEventChecklistBudget({ ...hidden, sheets: { ...hidden.sheets, checklist: [
      { id: 'one', task: 'Lighting', cost: 50 }, { id: 'two', task: 'Transport', cost: 10 },
    ] } })
    expect(result.sheets.budget).toHaveLength(2)
    expect(result.selected).toEqual(['checklist'])
  })
})
