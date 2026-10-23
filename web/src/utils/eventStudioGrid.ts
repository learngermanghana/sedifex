// Pure spreadsheet helpers. No network requests, storage, or paid dependencies.
export type StudioCell = string | number
export type StudioRow = { id: string; [key: string]: StudioCell }
export type StudioField = { key: string; label: string; type: 'text' | 'number' | 'time' | 'date' | 'select' | 'computed'; options?: string[] }

export function pasteStudioGrid(
  rows: StudioRow[],
  fields: StudioField[],
  startId: string,
  startKey: string,
  text: string,
  newRow: () => StudioRow,
): { rows: StudioRow[]; changed: boolean } {
  const startRow = rows.findIndex(row => row.id === startId)
  const startColumn = fields.findIndex(field => field.key === startKey)
  if (startRow < 0 || startColumn < 0) return { rows, changed: false }
  const matrix = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n').slice(0, 100).map(line => line.split('\t').slice(0, 40))
  if (!matrix.length || matrix.every(line => line.every(cell => !cell))) return { rows, changed: false }
  const updated = rows.map(row => ({ ...row }))
  let changed = false
  matrix.forEach((cells, rowIndex) => {
    const targetIndex = startRow + rowIndex
    while (updated.length <= targetIndex) updated.push(newRow())
    cells.forEach((cell, columnIndex) => {
      const field = fields[startColumn + columnIndex]
      if (!field || field.type === 'computed') return
      const sanitized = cell.slice(0, 3000)
      if (field.type === 'number' && sanitized.trim() && (!Number.isFinite(Number(sanitized)) || Number(sanitized) < 0)) return
      if (field.type === 'select' && field.options?.length && !field.options.includes(sanitized)) return
      updated[targetIndex][field.key] = sanitized
      changed = true
    })
  })
  return { rows: changed ? updated : rows, changed }
}

export function copyStudioGrid(rows: StudioRow[], fields: StudioField[]): string {
  const included = fields.filter(field => field.type !== 'computed')
  return [
    included.map(field => field.label).join('\t'),
    ...rows.map(row => included.map(field => String(row[field.key] ?? '').replace(/[\t\n\r]/g, ' ')).join('\t')),
  ].join('\n')
}

export function repositionStudioRow(rows: StudioRow[], id: string, direction: -1 | 1): StudioRow[] {
  const index = rows.findIndex(row => row.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function studioOverview(sheets: Record<string, StudioRow[]>) {
  const checklist = sheets.checklist ?? []
  const guests = sheets.guests ?? []
  const programme = sheets.programme ?? []
  const budget = sheets.budget ?? []
  const donations = sheets.donations ?? []
  const sum = (rows: StudioRow[], key: string) => rows.reduce((total, row) => {
    const amount = Number(row[key])
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0)
  return {
    tasks: checklist.length,
    completed: checklist.filter(row => row.status === 'Done').length,
    programmeItems: programme.length,
    programmeMinutes: sum(programme, 'minutes'),
    guestRecords: guests.length,
    confirmedGuests: guests.filter(row => row.rsvp === 'Confirmed').length,
    confirmedSeats: sum(guests.filter(row => row.rsvp === 'Confirmed'), 'seats'),
    budget: sum(budget, 'estimate'),
    spent: sum(budget, 'actual'),
    pledged: sum(donations, 'pledged'),
    received: sum(donations, 'received'),
  }
}
