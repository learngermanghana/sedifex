// Transactional test double: enforces reads before writes and rolls back failures.
import type { Firestore } from 'firebase-admin/firestore'
export function memoryDb(seed: Record<string, Record<string, any>> = {}) {
  let records = new Map(Object.entries(seed)), serial = 0, queue = Promise.resolve()
  function snapshot(path: string) { return { id: path.split('/').pop()!, exists: records.has(path), data: () => records.get(path) } }
  function query(path: string, filters: any[] = [], size = Infinity, cursor = ''): any {
    return { doc: (value?: string) => ref(path + '/' + (value || `auto_${++serial}`)), where: (field: string, op: string, value: any) => query(path, [...filters, [field, value]], size, cursor), orderBy: () => query(path, filters, size, cursor), limit: (n: number) => query(path, filters, n, cursor), startAfter: (id: string) => query(path, filters, size, id), get: async () => {
      const docs = [...records.keys()].filter(p => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1 && p.split('/').pop()! > cursor && filters.every(([f, v]) => records.get(p)?.[f] === v)).sort().slice(0, size).map(snapshot)
      return { docs, size: docs.length, empty: !docs.length }
    } }
  }
  function ref(path: string): any { return { path, id: path.split('/').pop()!, get: async () => snapshot(path), create: async (data: any) => db.runTransaction(async (tx: any) => { tx.create(ref(path), data) }), collection: (name: string) => query(path + '/' + name) } }
  const db = { collection: (path: string) => query(path), runTransaction: async (fn: any) => {
    let release!: () => void
    const previous = queue; queue = new Promise<void>(resolve => { release = resolve }); await previous
    const pending: any[] = []; let written = false
    const tx = { get: async (r: any) => { if (written) throw Error('Firestore read after write'); return snapshot(r.path) }, create: (r: any, data: any) => { written = true; pending.push(['create', r.path, data]) }, update: (r: any, data: any) => { written = true; pending.push(['update', r.path, data]) }, set: (r: any, data: any, opts?: any) => { written = true; pending.push([opts?.merge ? 'merge' : 'set', r.path, data]) }, delete: (r: any) => { written = true; pending.push(['delete', r.path]) } }
    try {
      const result = await fn(tx), next = new Map(records)
      for (const [op, path, data] of pending) {
        if (op === 'create' && next.has(path)) throw Error('Already exists')
        if (op === 'update' && !next.has(path)) throw Error('Not found')
        if (op === 'delete') next.delete(path)
        else next.set(path, op === 'merge' || op === 'update' ? { ...next.get(path), ...data } : data)
      }
      records = next; return result
    } finally { release() }
  } }
  return { db: db as unknown as Firestore, get: (path: string) => records.get(path), put: (path: string, data: any) => records.set(path, data), entries: () => [...records.entries()] }
}
