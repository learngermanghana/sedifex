export function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

export function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function formatMoney(amount: number, currency = 'GHS') {
  return `${currency} ${amount.toFixed(2)}`
}

export function formatDate(value: unknown) {
  const date = toDate(value)
  return date ? date.toLocaleString() : '—'
}

export function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getNestedObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function normalizeSourceChannel(value: unknown) {
  const normalized = asText(value, 'sedifex_market').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (['client_website', 'website', 'client_site', 'wordpress', 'external_website'].includes(normalized)) return 'client_website'
  if (normalized.includes('website') || normalized.includes('wordpress') || normalized.includes('client')) return 'client_website'
  if (normalized.includes('market')) return 'sedifex_market'
  if (normalized.includes('custom') || normalized.includes('public')) return 'sedifex_custom_page'
  return normalized || 'sedifex_market'
}

export function escapeCsvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
