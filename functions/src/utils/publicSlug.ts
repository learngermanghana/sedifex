const RESERVED_PUBLIC_SLUGS = new Set([
  '',
  'account',
  'billing',
  'close-day',
  'cookies',
  'customer-display',
  'customers',
  'dashboard',
  'data-transfer',
  'display',
  'docs',
  'expenses',
  'finance',
  'inventory-system-ghana',
  'legal',
  'logi',
  'onboarding',
  'privacy',
  'products',
  'promo',
  'receipt',
  'refund',
  'reset-password',
  'sell',
  'staff',
  'support',
  'verify-email',
])

export function normalizePublicSlugValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export function isReservedPublicSlug(value: string): boolean {
  const normalized = normalizePublicSlugValue(value)
  if (!normalized) return true
  return RESERVED_PUBLIC_SLUGS.has(normalized)
}

export function buildPublicSlug(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = normalizePublicSlugValue(candidate)
    if (!normalized) continue
    if (!isReservedPublicSlug(normalized)) return normalized
    const suffixed = normalizePublicSlugValue(`${normalized}-store`)
    if (suffixed && !isReservedPublicSlug(suffixed)) return suffixed
  }
  return 'store'
}
