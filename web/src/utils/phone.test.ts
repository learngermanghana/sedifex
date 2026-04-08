import { describe, expect, it } from 'vitest'
import { normalizeGhanaPhoneDigits, normalizeGhanaPhoneE164 } from './phone'

describe('normalizeGhanaPhoneDigits', () => {
  it('normalizes +233 format to canonical wa digits', () => {
    expect(normalizeGhanaPhoneDigits('+233245022743')).toBe('233245022743')
  })

  it('removes accidental 0 after 233', () => {
    expect(normalizeGhanaPhoneDigits('2330245022743')).toBe('233245022743')
  })

  it('replaces local leading 0 with 233', () => {
    expect(normalizeGhanaPhoneDigits('0245022743')).toBe('233245022743')
  })

  it('prepends 233 for 9-digit local mobile', () => {
    expect(normalizeGhanaPhoneDigits('245022743')).toBe('233245022743')
  })
})

describe('normalizeGhanaPhoneE164', () => {
  it('returns e164 with plus prefix', () => {
    expect(normalizeGhanaPhoneE164('0245022743')).toBe('+233245022743')
  })
})
