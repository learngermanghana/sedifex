/**
 * Keep the Event Studio budget aligned with Checklist items without sharing
 * financial data with clients or erasing independently recorded expenses.
 *
 * Checklist owns task, owner, due, status and estimated cost.
 * Budget owns category and actual spending. Each linked row stores the stable
 * checklist ID so edits/renames/reorders never create duplicate charges.
 */
export type EventStudioSyncRow = { id: string; [key: string]: string | number }

type LinkableStudio = {
  selected: string[]
  sheets: { checklist: EventStudioSyncRow[]; budget: EventStudioSyncRow[] }
}

function taskKey(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/**
 * Pure, idempotent and deterministic: safe to apply during Firestore hydration,
 * reconciliation, undo/redo and every edit. Never creates an extra network write.
 */
/**
 * Update linked Checklist fields from Budget edits before the normal Checklist ->
 * Budget reconciliation runs. The link is retained so subsequent edits from
 * either sheet stay in sync; category and actual spending belong only to Budget.
 *
 * Accepts a whole budget sheet so single-cell edits and multi-cell pastes behave
 * identically. Only changed fields propagate to the linked task.
 */
export function applyEventBudgetEdits<T extends LinkableStudio>(studio: T, budgetRows: EventStudioSyncRow[]): T {
  const previousRows = new Map(studio.sheets.budget.map(row => [row.id, row]))
  const checklistChanges = new Map<string, Record<string, string | number>>()
  const linkedFields = { item: 'task', owner: 'owner', due: 'due', status: 'status', estimate: 'cost' } as const

  for (const row of budgetRows) {
    const previous = previousRows.get(row.id)
    const taskId = previous?.sourceChecklistId
    if (typeof taskId !== 'string' || !taskId) continue
    for (const [budgetField, checklistField] of Object.entries(linkedFields)) {
      if (String(previous[budgetField] ?? '') === String(row[budgetField] ?? '')) continue
      const changes = checklistChanges.get(taskId) ?? {}
      changes[checklistField] = row[budgetField] ?? ''
      checklistChanges.set(taskId, changes)
    }
  }

  const checklist = studio.sheets.checklist.map(task => {
    const changes = checklistChanges.get(task.id)
    return changes ? { ...task, ...changes } : task
  })
  return syncEventChecklistBudget({
    ...studio,
    sheets: { ...studio.sheets, checklist, budget: budgetRows },
  })
}

export function syncEventChecklistBudget<T extends LinkableStudio>(studio: T): T {
  const checklist = studio.sheets.checklist
  const originalBudget = studio.sheets.budget
  const activeIds = new Set(checklist.map(row => row.id))
  const availableManual = new Map<string, number[]>()
  originalBudget.forEach((row, index) => {
    if (typeof row.sourceChecklistId === 'string' && row.sourceChecklistId) return
    const key = taskKey(row.item)
    if (!key) return
    availableManual.set(key, [...(availableManual.get(key) || []), index])
  })

  const updated = [...originalBudget]
  const linkedIds = new Set<string>()
  let added = false
  let changed = false

  for (const task of checklist) {
    // Don't clutter the budget with rows until there is a task description.
    if (!taskKey(task.task)) continue
    let index = updated.findIndex(row => row.sourceChecklistId === task.id && !linkedIds.has(row.id))
    const alreadyLinked = index >= 0
    if (!alreadyLinked) {
      const candidates = availableManual.get(taskKey(task.task)) || []
      index = candidates.shift() ?? -1
      if (index >= 0) availableManual.set(taskKey(task.task), candidates)
    }

    const existing: EventStudioSyncRow = index >= 0 ? updated[index] : {
      id: `budget-for-${task.id}`,
      studioClientShared: 'no',
      detailNotes: '',
      internalNotes: '',
      sourceChecklistId: '',
      estimateOrigin: 'checklist',
      item: '',
      owner: '',
      due: '',
      status: '',
      category: '',
      estimate: '',
      actual: '',
    }
    const hadManualAmount = !alreadyLinked && index >= 0 &&
      String(existing.estimate ?? '').trim() !== '' && String(task.cost ?? '').trim() === ''
    const source = String(task.cost ?? '').trim() !== '' || !hadManualAmount && existing.estimateOrigin !== 'manual'
      ? 'checklist' : 'manual'

    const next: EventStudioSyncRow = {
      ...existing,
      sourceChecklistId: task.id,
      estimateOrigin: source,
      item: String(task.task ?? ''),
      owner: String(task.owner ?? ''),
      due: String(task.due ?? ''),
      status: String(task.status ?? ''),
      category: String(existing.category ?? ''),
      estimate: source === 'checklist' ? (task.cost ?? '') : (existing.estimate ?? ''),
      actual: existing.actual ?? '',
    }

    if (index < 0) {
      updated.push(next)
      added = true
      changed = true
    } else if (JSON.stringify(updated[index]) !== JSON.stringify(next)) {
      updated[index] = next
      changed = true
    }
    linkedIds.add(next.id)
  }

  // A removed checklist item must not delete spending already recorded.
  // Keep the former budget row and make it a regular, independently editable item.
  updated.forEach((row, index) => {
    if (typeof row.sourceChecklistId !== 'string' || !row.sourceChecklistId ||
      activeIds.has(row.sourceChecklistId)) return
    updated[index] = { ...row, sourceChecklistId: '', estimateOrigin: 'manual' }
    changed = true
  })

  const selected = added && !originalBudget.length && studio.selected.includes('checklist') &&
    !studio.selected.includes('budget')
    ? [...studio.selected, 'budget'] : studio.selected

  if (!changed && selected === studio.selected) return studio
  return { ...studio, selected, sheets: { ...studio.sheets, budget: updated } } as T
}
