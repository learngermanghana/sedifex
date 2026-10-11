/** Apply server-saved fields without overwriting unsaved local edits. */
export function mergeCommittedFields<T extends Record<string, string>>(current: T, baseline: T, committed: Partial<T>): T {
  const next = { ...current }
  for (const key of Object.keys(committed) as (keyof T)[]) {
    if (current[key] === baseline[key]) next[key] = committed[key]!
  }
  return next
}
