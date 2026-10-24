import type { sharedStudioSnapshot } from './studioClientSharing'

type SharedStudio = ReturnType<typeof sharedStudioSnapshot>
function escape(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;')
}
function field(sheet: string, id: string, name: string, label: string, value: string, type = 'text') {
  const attributes = ' data-studio-sheet="' + escape(sheet) + '" data-studio-row="' + escape(id) + '" data-studio-field="' + escape(name) + '" data-original="' + escape(value) + '"'
  const input = name === 'detailNotes' || name === 'notes'
    ? '<textarea maxlength="3000"' + attributes + '>' + escape(value) + '</textarea>'
    : '<input type="' + escape(type) + '" maxlength="300" value="' + escape(value) + '"' + attributes + '>'
  return '<label class="studio-shared-field"><span>' + escape(label) + '</span>' + input + '</label>'
}
export function renderSharedStudioHtml(data: SharedStudio): string {
  const sections: string[] = []
  if (data.details) {
    sections.push('<article class="studio-shared-card"><h3>Event information</h3><div class="studio-shared-fields">' +
      field('details', '', 'eventDate', 'Event date', data.details.eventDate, 'date') +
      field('details', '', 'startTime', 'Start time', data.details.startTime, 'time') +
      field('details', '', 'venue', 'Venue', data.details.venue) + '</div></article>')
  }
  for (const sheet of ['checklist', 'programme'] as const) {
    const rows = data.sheets[sheet]
    if (!rows.length) continue
    const labels = sheet === 'checklist'
      ? [['task', 'Task'], ['owner', 'Assigned to'], ['due', 'Due date'], ['detailNotes', 'Activity notes']]
      : [['start', 'Time'], ['item', 'Programme item'], ['person', 'Speaker / performer'], ['minutes', 'Duration (min)'], ['notes', 'Guest notes'], ['detailNotes', 'Additional notes']]
    sections.push('<article class="studio-shared-card"><h3>' + (sheet === 'checklist' ? 'Shared checklist' : 'Shared working programme') +
      '</h3>' + (sheet === 'programme' ? '<p class="muted">This is the shared working plan; the published programme is separate.</p>' : '') +
      rows.map(row => '<div class="studio-shared-row"><div class="studio-shared-fields">' + labels.map(([key, label]) =>
        field(sheet, row.id, key, label, row[key] || '', key === 'due' ? 'date' : key === 'start' ? 'time' : key === 'minutes' ? 'number' : 'text')
      ).join('') + '</div></div>').join('') + '</article>')
  }
  return sections.join('') || '<div class="empty">The event team has not shared any editable planning items yet.</div>'
}
