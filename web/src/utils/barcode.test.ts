import { describe, expect, it } from 'vitest'

import {
  buildNextStoreBarcodeCode,
  buildStoreBarcodePrefix,
  normalizeBarcode,
} from './barcode'

describe('store barcode helpers', () => {
  it('builds a deterministic prefix from workspace identity and store id', () => {
    expect(buildStoreBarcodePrefix({ workspaceName: 'Abena Beauty', storeId: 'store-001' })).toBe('ABEN')
    expect(buildStoreBarcodePrefix({ workspaceName: '', storeId: 'st-9' })).toBe('ST9I')
  })

  it('computes next sequential store barcode from existing prefixed codes', () => {
    const nextCode = buildNextStoreBarcodeCode({
      workspaceName: 'Abena Beauty',
      storeId: 'store-001',
      existingCodes: ['ABEN0001', 'ABEN0008', 'ab en-0003'],
    })

    expect(nextCode).toBe('ABEN0009')
  })

  it('starts at 0001 when no matching codes exist', () => {
    expect(
      buildNextStoreBarcodeCode({
        workspaceName: 'Fresh Foods',
        storeId: 's-22',
        existingCodes: ['OTHER0007', normalizeBarcode('something')],
      }),
    ).toBe('FRES0001')
  })
})
