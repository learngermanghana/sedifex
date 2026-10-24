/** The public client portal may see and edit only explicitly shared Event Studio fields. */
type RecordMap = Record<string, unknown>
export type StudioSheet = 'checklist' | 'programme'
export type StudioClientField = 'task' | 'owner' | 'due' | 'status' | 'detailNotes' | 'start' | 'item' | 'person' | 'minutes' | 'notes'
const SHARE_FIELDS: Record<StudioSheet, readonly string[]> = {
  checklist: ['task', 'owner', 'due', 'detailNotes'],
  programme: ['start', 'item', 'person', 'minutes', 'notes', 'detailNotes'],
}
const DETAIL_FIELDS = ['eventDate', 'startTime', 'venue'] as const

function obj(value: unknown): RecordMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordMap : {}
}
function str(value: unknown, max = 3000) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}
function hasSheet(value: unknown): value is StudioSheet {
  return value === 'checklist' || value === 'programme'
}
export function sharedStudioSnapshot(event: RecordMap) {
  const settings = obj(event.eventStudioClientShare)
  const sheets = obj(obj(event.eventStudio).sheets)
  const details = settings.details === true
    ? { eventDate: str(event.eventDate, 40), startTime: str(event.startTime, 40), venue: str(event.venue, 220) }
    : null
  const result: Record<StudioSheet, Array<Record<string, string>>> = { checklist: [], programme: [] }
  for (const sheet of ['checklist', 'programme'] as const) {
    if (settings[sheet] !== true) continue
    const rows = sheets[sheet]
    if (!Array.isArray(rows)) continue
    result[sheet] = rows.filter(row => obj(row).clientVisible === true).map(raw => {
      const row = obj(raw)
      const safe: Record<string, string> = { id: str(row.id, 220) }
      for (const field of SHARE_FIELDS[sheet]) safe[field] = str(row[field], field === 'detailNotes' ? 3000 : 300)
      return safe
    }).filter(row => row.id)
  }
  return { details, sheets: result }
}
export type StudioEdit =
  | { sheet: StudioSheet; rowId: string; field: string; expected: string; value: string }
  | { sheet: 'details'; field: string; expected: string; value: string }

/** Validates server-side permission, individual row visibility and stale-field changes.
 * Return a sparse Firestore update; never include private fields or unrelated sheets. */
export function applySharedStudioEdit(event: RecordMap, edit: StudioEdit): RecordMap {
  const settings = obj(event.eventStudioClientShare)
  const field = str(edit.field, 40)
  if (edit.sheet === 'details') {
    if (settings.details !== true || !DETAIL_FIELDS.some(allowed => allowed === field)) throw new Error('STUDIO_FORBIDDEN')
    const current = str(event[field], field === 'venue' ? 220 : 40)
    if (current !== edit.expected) throw new Error('STUDIO_CONFLICT')
    if (edit.value.length > (field === 'venue' ? 220 : 40)) throw new Error('STUDIO_INVALID')
    if (field === 'eventDate' && edit.value && !/^\d{4}-\d{2}-\d{2}$/.test(edit.value)) throw new Error('STUDIO_INVALID')
    if (field === 'startTime' && edit.value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(edit.value)) throw new Error('STUDIO_INVALID')
    return { [field]: edit.value }
  }
  if (!hasSheet(edit.sheet) || settings[edit.sheet] !== true || !SHARE_FIELDS[edit.sheet].includes(field)) throw new Error('STUDIO_FORBIDDEN')
  const studio = obj(event.eventStudio)
  const sheets = obj(studio.sheets)
  const rows = sheets[edit.sheet]
  if (!Array.isArray(rows)) throw new Error('STUDIO_FORBIDDEN')
  const index = rows.findIndex(item => str(obj(item).id, 220) === edit.rowId)
  if (index < 0 || obj(rows[index]).clientVisible !== true) throw new Error('STUDIO_FORBIDDEN')
  const old = obj(rows[index])
  const current = str(old[field], field === 'detailNotes' ? 3000 : 300)
  if (current !== edit.expected) throw new Error('STUDIO_CONFLICT')
  const max = field === 'detailNotes' ? 3000 : 300
  if (edit.value.length > max || (field === 'minutes' && edit.value && (!/^\d+(?:\.\d+)?$/.test(edit.value) || Number(edit.value) > 1440))) throw new Error('STUDIO_INVALID')
  if ((field === 'due' || field === 'start') && edit.value && !(
    field === 'due' ? /^\d{4}-\d{2}-\d{2}$/.test(edit.value) : /^([01]\d|2[0-3]):[0-5]\d$/.test(edit.value)
  )) throw new Error('STUDIO_INVALID')
  const updatedRows = rows.map((item, offset) => offset === index ? { ...obj(item), [field]: edit.value } : item)
  return { [`eventStudio.sheets.${edit.sheet}`]: updatedRows }
}
