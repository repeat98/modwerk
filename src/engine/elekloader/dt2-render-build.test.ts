import { describe, expect, it } from 'vitest'
import { DT2_BASE_SHARC, readDt2SharcPart } from './dt2-render-build'

const part = (extra: Record<string, unknown> = {}) => ({ build: { dt2_sharc: { version: 2, allocations: [{ address: 0x200d0000, data: btoa('\x01\x02\x03\x04') }], players: [{ type: 7, entry: 0xbe8000 }], ...extra } } })

describe('Digitakt II machine sound-chip parts', () => {
  it('reads a module\'s allocations and players, and finds none in a package without a part', () => {
    expect(readDt2SharcPart('mikrotakt', part())).toEqual({
      module: 'mikrotakt',
      allocations: [{ address: 0x200d0000, bytes: Uint8Array.of(1, 2, 3, 4) }],
      players: [{ type: 7, entry: 0xbe8000 }],
    })
    expect(readDt2SharcPart('plain', { build: {} })).toBeNull()
  })

  it('leaves the sidechain work\'s render-hook format (version 1) to its own path', () => {
    expect(readDt2SharcPart('sidechain', { build: { dt2_sharc: { version: 1, code: '', data: '' } } })).toBeNull()
  })

  it('refuses an unknown version, a malformed entry and code over the base\'s machine parts', () => {
    expect(() => readDt2SharcPart('m', part({ version: 3 }))).toThrow('unsupported sound-chip part')
    expect(() => readDt2SharcPart('m', part({ players: [{ type: '7', entry: 1 }] }))).toThrow('malformed machine player')
    expect(() => readDt2SharcPart('m', part({ allocations: [{ address: DT2_BASE_SHARC.dispatcher, data: btoa('xxxx') }] })))
      .toThrow('overlaps the base')
  })
})
