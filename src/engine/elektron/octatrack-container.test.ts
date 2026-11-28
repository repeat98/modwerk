import { describe, expect, it } from 'vitest'
import { ElekError, decodeBin, decodeSyx, encodeBin, encodeSyx, versionField } from './octatrack-container.ts'
import { OCTATRACK } from './devices.ts'

// The stock 1.40C files round-trip byte for byte (checked against the owner's files); these need no firmware.
describe('Octatrack OS files', () => {
  it('carries a container through the .syx transport and the card file unchanged', () => {
    for (const length of [1, 62, 63, 64, 127, 500]) {
      const container = Uint8Array.from({ length }, (_, i) => (i * 37 + length) & 0xff)
      expect(decodeSyx(encodeSyx(container, 0x05))).toEqual([0x05, container])
      const [seed, carried] = decodeBin(encodeBin(container, 0x2f1349d2))
      expect(seed).toBe(0x2f1349d2)
      expect(carried.subarray(0, length)).toEqual(container)
    }
  })
  it('refuses a card file whose words were changed, and right-justifies the update name', () => {
    const bin = encodeBin(new Uint8Array(40).fill(7), 1)
    bin[12] ^= 1
    expect(() => decodeBin(bin)).toThrow(ElekError)
    expect(new TextDecoder().decode(versionField(OCTATRACK, 'MODWERK'))).toBe('   MODWERK')
  })
})
