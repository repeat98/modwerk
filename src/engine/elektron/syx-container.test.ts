import { describe, expect, it } from 'vitest'
import { SyxError, classify, packMain, unstore } from './syx-container.ts'
import { be32, concat } from './bytes.ts'

// Whole files are checked against the owner's stock OS files (dt2-link and rytm-base tests); these need none.
describe('ELE3 sections', () => {
  it('tells packed, raw-with-header and raw sections apart and stores a packed main OS on a 4-byte boundary', () => {
    const image = new Uint8Array(3000).map((_, i) => (i * 7) & 0xff)
    const stored = packMain(image)
    expect(stored.length % 4).toBe(0)
    expect(classify(stored)).toBe('packed')
    expect(unstore(stored)).toEqual(image)
    expect(classify(concat([be32(3, 0), Uint8Array.of(1, 2, 3)]))).toBe('raw-header')
    expect(unstore(concat([be32(3, 0), Uint8Array.of(1, 2, 3)]))).toEqual(Uint8Array.of(1, 2, 3))
    expect(classify(Uint8Array.of(1, 2))).toBe('raw')
    expect(new SyxError('x')).toBeInstanceOf(Error)
  })
})
