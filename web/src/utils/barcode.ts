export function normalizeBarcode(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const hasLetters = /[a-z]/i.test(raw)
  if (hasLetters) {
    // keep letters + digits; remove spaces/hyphens so Code 39/128 match
    return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  }
  // keep only digits – removes spaces like "8 710447 180655"
  return raw.replace(/[^\d]/g, '')
}

export function formatBarcodeForDisplay(
  value: string | null | undefined,
): string {
  const code = normalizeBarcode(value)
  if (!code) return ''
  // you can get fancy here later (grouping), for now just return digits
  return code
}

type StoreBarcodeIdentity = {
  workspaceName?: string | null
  storeId?: string | null
}

const DEFAULT_BARCODE_PREFIX = 'ITEM'
const BARCODE_PREFIX_LENGTH = 4

function sanitizeIdentity(value: string | null | undefined): string {
  if (!value) return ''
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function buildStoreBarcodePrefix(identity: StoreBarcodeIdentity): string {
  const workspaceIdentity = sanitizeIdentity(identity.workspaceName)
  const storeIdentity = sanitizeIdentity(identity.storeId)

  const combined = `${workspaceIdentity}${storeIdentity}`
  if (!combined) return DEFAULT_BARCODE_PREFIX

  return combined
    .slice(0, BARCODE_PREFIX_LENGTH)
    .padEnd(BARCODE_PREFIX_LENGTH, DEFAULT_BARCODE_PREFIX.slice(0, BARCODE_PREFIX_LENGTH))
}

export function buildNextStoreBarcodeCode(input: {
  workspaceName?: string | null
  storeId?: string | null
  existingCodes: Array<string | null | undefined>
  minimumDigits?: number
}): string {
  const prefix = buildStoreBarcodePrefix({
    workspaceName: input.workspaceName,
    storeId: input.storeId,
  })

  const minimumDigits = Math.max(1, Math.floor(input.minimumDigits ?? 4))
  let nextSequence = 1

  input.existingCodes.forEach((code) => {
    const normalized = normalizeBarcode(code)
    if (!normalized.startsWith(prefix)) return

    const suffix = normalized.slice(prefix.length)
    if (!/^\d+$/.test(suffix)) return

    const sequence = Number.parseInt(suffix, 10)
    if (!Number.isFinite(sequence)) return
    nextSequence = Math.max(nextSequence, sequence + 1)
  })

  return `${prefix}${String(nextSequence).padStart(minimumDigits, '0')}`
}
