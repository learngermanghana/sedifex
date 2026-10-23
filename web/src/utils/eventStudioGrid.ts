// Pure spreadsheet helpers. No network requests, storage, or paid dependencies.
export type StudioCell = string | number
export type StudioRow = { id: string; [key: string]: StudioCell }
export type StudioField = { key: string; label: string; type: 'text' | 'number' | 'time' | 'date' | 'select' | 'computed'; options?: string[] }

/**
 * HTML date/time inputs need ISO dates and 24-hour time strings. Accept common
 * Excel copy formats; ambiguous 01/02/YYYY is interpreted as US month/day.
 */
export function normalizePastedDate(raw: string): string | null {
  const input = raw.trim()
  if (!input) return ''
  let year: number, month: number, day: number
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input)
  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(input)
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (slashed) {
    const first = Number(slashed[1])
    const second = Number(slashed[2])
    year = Number(slashed[3])
    // If month/day cannot be US (e.g. 23/10/2026), accept day/month.
    month = first > 12 && second <= 12 ? second : first
    day = first > 12 && second <= 12 ? first : second
  } else return null
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return [String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

export function normalizePastedTime(raw: string): string | null {
  const input = raw.trim()
  if (!input) return ''
  const match = /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{2}))?\s*(am|pm)?$/i.exec(input)
  if (!match || (!match[2] && !match[4])) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const second = Number(match[3] ?? 0)
  const period = match[4]?.toLowerCase()
  if (minute > 59 || second > 59 || hour > 23) return null
  if (period) {
    if (hour < 1 || hour > 12) return null
    hour = hour % 12 + (period === 'pm' ? 12 : 0)
  }
  const result = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
  return second ? result + ':' + String(second).padStart(2, '0') : result
}

function normalizePastedCell(field: StudioField, raw: string): string | null {
  const value = raw.slice(0, 3000)
  if (field.type === 'date') return normalizePastedDate(value)
  if (field.type === 'time') return normalizePastedTime(value)
  if (field.type === 'number') {
    const normalized = value.trim()
    return normalized && (!Number.isFinite(Number(normalized)) || Number(normalized) < 0) ? null : normalized
  }
  if (field.type === 'select') {
    const normalized = value.trim()
    return field.options?.length && !field.options.includes(normalized) ? null : normalized
  }
  return value
}

export function pasteStudioGrid(
  rows: StudioRow[],
  fields: StudioField[],
  startId: string,
  startKey: string,
  text: string,
  newRow: () => StudioRow,
): { rows: StudioRow[]; changed: boolean; applied: number; rejected: number } {
  const writable = fields.filter(field => field.type !== 'computed')
  const startRow = rows.findIndex(row => row.id === startId)
  const startColumn = writable.findIndex(field => field.key === startKey)
  const unchanged = { rows, changed: false, applied: 0, rejected: 0 }
  if (startRow < 0 || startColumn < 0) return unchanged
  let matrix = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n').slice(0, 100).map(line => line.split('\t').slice(0, 40))
  if (!matrix.length || matrix.every(line => line.every(cell => !cell))) return unchanged
  // copyStudioGrid exports a header row; pasting its full output must not turn
  // column titles into data or shift rows.
  if (startColumn === 0 && matrix[0].length === writable.length &&
    matrix[0].every((value, index) => value.trim() === writable[index].label)) {
    matrix = matrix.slice(1)
  }
  const updated = rows.map(row => ({ ...row }))
  let changed = false, applied = 0, rejected = 0
  matrix.forEach((cells, rowOffset) => {
    const targetIndex = startRow + rowOffset
    cells.forEach((cell, columnOffset) => {
      const field = writable[startColumn + columnOffset]
      if (!field) return
      const normalized = normalizePastedCell(field, cell)
      if (normalized === null) { rejected++; return }
      while (updated.length <= targetIndex) {
        updated.push(newRow())
        changed = true
      }
      if (String(updated[targetIndex][field.key] ?? '') !== normalized) {
        updated[targetIndex][field.key] = normalized
        changed = true
      }
      applied++
    })
  })
  return { rows: changed ? updated : rows, changed, applied, rejected }
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

export function studioOverview(sheets: { checklist?: StudioRow[]; guests?: StudioRow[]; programme?: StudioRow[]; budget?: StudioRow[]; donations?: StudioRow[] }) {
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
