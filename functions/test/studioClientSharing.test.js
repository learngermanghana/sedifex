const assert = require('node:assert/strict')
const { sharedStudioSnapshot, applySharedStudioEdit } = require('../lib/studioClientSharing')
const { renderSharedStudioHtml } = require('../lib/studioClientSharingHtml')

const event = {
  eventDate: '2026-12-12', venue: 'Accra', startTime: '10:00', clientEmail: 'private@example.com', notes: 'Private event note',
  estimatedBudget: 12000,
  eventStudioClientShare: { details: true, checklist: true, programme: false },
  eventStudio: { selected: ['checklist', 'programme', 'budget'], sheets: {
    checklist: [
      { id: 'shared', task: 'Welcome', owner: 'MC', due: '2026-12-12', detailNotes: 'Door A', internalNotes: 'Secret backstage', studioClientShared: 'yes' },
      { id: 'hidden', task: 'Private contract negotiation', detailNotes: 'Private', studioClientShared: 'no' },
    ],
    programme: [{ id: 'prog1', item: 'Couple entrance', studioClientShared: 'yes' }],
    budget: [{ id: 'expense', actual: 9999 }],
  } },
}
const view = sharedStudioSnapshot(event)
assert.deepEqual(view.details, { eventDate: '2026-12-12', startTime: '10:00', venue: 'Accra' })
assert.equal(view.sheets.checklist.length, 1)
assert.equal(view.sheets.programme.length, 0)
assert.equal(view.sheets.checklist[0].task, 'Welcome')
assert.equal(JSON.stringify(view).includes('Secret backstage'), false)
assert.equal(JSON.stringify(view).includes('Private contract negotiation'), false)
assert.equal(JSON.stringify(view).includes('private@example.com'), false)
assert.equal(JSON.stringify(view).includes('9999'), false)

const updated = applySharedStudioEdit(event, { sheet: 'checklist', rowId: 'shared', field: 'task', expected: 'Welcome', value: 'Guest welcome' })
assert.equal(updated['eventStudio.sheets.checklist'][0].task, 'Guest welcome')
assert.equal(updated['eventStudio.sheets.checklist'][0].internalNotes, 'Secret backstage')
assert.equal(updated['eventStudio.sheets.checklist'][1].task, 'Private contract negotiation')
assert.equal(event.eventStudio.sheets.checklist[0].task, 'Welcome')
assert.deepEqual(applySharedStudioEdit(event, { sheet: 'details', field: 'venue', expected: 'Accra', value: 'Tema' }), { venue: 'Tema' })
assert.throws(() => applySharedStudioEdit(event, { sheet: 'details', field: 'notes', expected: 'Private event note', value: 'Changed' }), /STUDIO_FORBIDDEN/)
assert.throws(() => applySharedStudioEdit(event, { sheet: 'checklist', rowId: 'hidden', field: 'task', expected: 'Private contract negotiation', value: 'Leaked' }), /STUDIO_FORBIDDEN/)
assert.throws(() => applySharedStudioEdit(event, { sheet: 'checklist', rowId: 'shared', field: 'internalNotes', expected: 'Secret backstage', value: 'Changed' }), /STUDIO_FORBIDDEN/)
assert.throws(() => applySharedStudioEdit(event, { sheet: 'programme', rowId: 'prog1', field: 'item', expected: 'Couple entrance', value: 'Changed' }), /STUDIO_FORBIDDEN/)
assert.throws(() => applySharedStudioEdit(event, { sheet: 'checklist', rowId: 'shared', field: 'task', expected: 'Old', value: 'Changed' }), /STUDIO_CONFLICT/)
assert.throws(() => applySharedStudioEdit(event, { sheet: 'checklist', rowId: 'shared', field: 'due', expected: '2026-12-12', value: '25/12/2026' }), /STUDIO_INVALID/)

const disabled = { ...event, eventStudioClientShare: {} }
assert.equal(sharedStudioSnapshot(disabled).sheets.checklist.length, 0)
assert.throws(() => applySharedStudioEdit(disabled, { sheet: 'checklist', rowId: 'shared', field: 'task', expected: 'Welcome', value: 'Changed' }), /STUDIO_FORBIDDEN/)

const malicious = {
  ...event,
  eventStudio: { ...event.eventStudio, sheets: { ...event.eventStudio.sheets, checklist: [
    { ...event.eventStudio.sheets.checklist[0], task: '<script>alert("hacked")</script>', detailNotes: 'Door A' },
  ] } },
}
const html = renderSharedStudioHtml(sharedStudioSnapshot(malicious))
assert.ok(html.includes('&lt;script&gt;'))
assert.ok(!html.includes('<script>'))
assert.ok(!html.includes('Secret backstage'))
assert.ok(!html.includes('private@example.com'))
console.log('Event Studio client sharing security checks passed')
