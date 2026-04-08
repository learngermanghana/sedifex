export function normalizeGhanaPhoneDigits(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('00')) {
    digits = digits.replace(/^00+/, '')
  }

  if (digits.startsWith('2330')) {
    digits = `233${digits.slice(4)}`
  }

  if (digits.startsWith('233')) {
    return digits
  }

  if (digits.startsWith('0')) {
    return `233${digits.slice(1)}`
  }

  if (digits.length === 9) {
    return `233${digits}`
  }

  return digits
}

export function normalizeGhanaPhoneE164(input: string): string {
  const digits = normalizeGhanaPhoneDigits(input)
  return digits ? `+${digits}` : ''
}
