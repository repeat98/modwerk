import { describe, expect, it } from 'vitest'
import { Mod2, ddrFor, link } from './package-linker.ts'
import { DIGITAKT_MK1, DIGITONE_MK1, targetOf } from './devices.ts'
import { ModError } from './module-package.ts'

// Whole sets link byte-identically on the owner's stock OS files (parity runs in the pull request); these need none.
describe('the package linker', () => {
  const target = targetOf(DIGITAKT_MK1, DIGITAKT_MK1.releases[0])
  it('reads a package and bounds the RAM it can take', () => {
    const m = new Mod2({ elemod: 2, id: 'x', version: '1', target, sections: { '.run': { parts: [['hex', '4e754e75']] }, '.bss': { size: 10, align: 8 } }, symbols: { f: ['.run', 0] }, exports: ['f'] })
    expect(m.label()).toBe('x 1')
    expect(m.ramBound()).toBe(4 + 12 + 4)
  })
  it('refuses another format, and a stock OS that is not the target', () => {
    expect(() => new Mod2({ elemod: 1, id: 'x', version: '1', target, sections: {} })).toThrow('not a format-2 module package')
    const m = new Mod2({ elemod: 2, id: 'x', version: '1', target, sections: {} })
    expect(() => link([m], new Uint8Array(8))).toThrow(ModError)
  })
  it('gives core 4.0 and newer their larger area', () => {
    expect(ddrFor(DIGITONE_MK1, '2.2')).toEqual(DIGITONE_MK1.ddr)
    expect(ddrFor(DIGITONE_MK1, '5.4')).toEqual([0x43ec0000, 0x44000000])
  })
})
