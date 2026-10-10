import { expect, it } from 'vitest'
import { mergeCommittedFields } from './mergeCommittedFields'

it('treats approved portal changes as saved while retaining local edits', () => {
  const baseline = { date: 'old', time: '09:00', notes: 'saved', status: 'confirmed' }
  const committed = { date: 'new', time: '10:00' }
  const nextBaseline = { ...baseline, ...committed }
  expect(mergeCommittedFields(baseline, baseline, committed)).toEqual(nextBaseline)
  const current = { ...baseline, notes: 'local note', time: '11:00' }
  expect(mergeCommittedFields(current, baseline, committed)).toEqual({ ...nextBaseline, notes: 'local note', time: '11:00' })
  expect(mergeCommittedFields(baseline, baseline, { status: 'cancelled' })).toEqual({ ...baseline, status: 'cancelled' })
})
