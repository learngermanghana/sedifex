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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function exportReportPdf(options: {
  title: string
  subtitle?: string
  summary?: Array<{ label: string; value: unknown }>
  rows: Array<Record<string, unknown>>
}) {
  const summaryHtml = options.summary?.length
    ? `<section class="summary">${options.summary.map(item => `<article><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></article>`).join('')}</section>`
    : ''
  const headers = options.rows.length ? Object.keys(options.rows[0]) : []
  const tableHtml = headers.length
    ? `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${options.rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p>No rows available for this report.</p>'

  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) return

  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(options.title)}</title><style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
    header { border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; padding-bottom: 16px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0; color: #475569; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    article { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
    article strong { display: block; font-size: 18px; margin-bottom: 4px; }
    article span { color: #64748b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #e2e8f0; padding: 7px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    footer { margin-top: 18px; color: #64748b; font-size: 11px; }
    @media print { body { margin: 18mm; } .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style></head><body><header><h1>${escapeHtml(options.title)}</h1><p>${escapeHtml(options.subtitle || `Generated ${new Date().toLocaleString()}`)}</p></header>${summaryHtml}${tableHtml}<footer>Generated by Sedifex reports.</footer><script>window.onload = function () { window.print(); }</script></body></html>`)
  printWindow.document.close()
}

export function formatReportNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

export function formatReportDate(value: unknown) {
  const date = toDate(value)
  return date ? date.toLocaleDateString() : '—'
}

export function formatReportStatus(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : '—'
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const start = Math.max(0, (page - 1) * pageSize)
  return rows.slice(start, start + pageSize)
}

export function compareReportValues(a: unknown, b: unknown, direction: 'asc' | 'desc' = 'asc') {
  const dir = direction === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1 * dir
  if (b == null) return -1 * dir
  if (a instanceof Date || b instanceof Date) return ((toDate(a)?.getTime() ?? 0) - (toDate(b)?.getTime() ?? 0)) * dir
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * dir
}
