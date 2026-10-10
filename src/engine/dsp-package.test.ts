import { describe, expect, it } from 'vitest'
import { readDspPackage, relocateDspPackage } from './dsp-package'
import catalog from './assets/dsp-packages.json'

async function digest(words: Uint32Array) {
  const bytes = new Uint8Array(words.length * 3)
  words.forEach((word, i) => { bytes[i * 3] = word >>> 16; bytes[i * 3 + 1] = word >>> 8; bytes[i * 3 + 2] = word })
  const hash = await crypto.subtle.digest('SHA-256', bytes.buffer)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
describe('independently authored DSP package relocation', () => {
  for (const fixture of catalog.packages) it(`${fixture.id}${'tag' in fixture ? ' (payload ' + fixture.tag + ')' : ''} matches native fresh assembly at four origins`, async () => {
    const pkg = await readDspPackage(fixture.id, 'tag' in fixture ? fixture.tag : undefined)
    for (const proof of fixture.proofs) {
      const placed = relocateDspPackage(pkg, proof.base)
      expect(await digest(placed.words)).toBe(proof.sha256)
      expect(placed.init).toBe(proof.base + pkg.init); expect(placed.proc).toBe(proof.base + pkg.proc)
    }
    expect(await digest(relocateDspPackage(pkg, 0).words)).toBe(pkg.sha256)
  })
  it('matches fresh native Air Chorus assembly with independently placed table and code', async () => {
    const pkg = await readDspPackage('airwindows-chorus')
    expect(pkg.splitProofs).toHaveLength(4)
    for (const proof of pkg.splitProofs!) {
      const placed = relocateDspPackage(pkg, proof.programBase - pkg.splitTableWords!, proof.tableBase)
      expect(await digest(placed.words)).toBe(proof.sha256)
      expect(placed.init).toBe(proof.programBase + pkg.init - pkg.splitTableWords!)
      expect(placed.proc).toBe(proof.programBase + pkg.proc - pkg.splitTableWords!)
    }
    expect(() => relocateDspPackage(pkg, 0x1000, 0x1000 + pkg.splitTableWords!)).toThrow('overlaps')
    expect(() => relocateDspPackage({ ...pkg, splitTableWords: pkg.words }, 0x1000)).toThrow('split')
    expect(() => relocateDspPackage({ ...pkg, code: '000000' + pkg.code.slice(6), relocations: [0] }, 0x1000)).toThrow('code relocation')
  })
  it('carries Sidechain Compressor as one hooked package per core that leaves stock COMPRESSOR dispatch alone', async () => {
    const fixtures = catalog.packages.filter(pkg => pkg.id === 'sidechain-compressor')
    expect(fixtures.map(pkg => 'tag' in pkg && pkg.tag).sort()).toEqual(['A', 'B'])
    const sites = { A: [0x4a7, 0x1ab1, 0x50e], B: [0x29c, 0x1871, 0x303] }
    const guards = ['92441a8fc9f1dd20359d87c8342e3d5653d8c853a274358df0cfc0451c57115b', '114aacb95ee45437fff14f2dcd91b67e26d8bc42ef3ba2e9f6ae0cb8be1574fa', '9dad4262559be3a41c85136d50f7d017f161cff9a609d17d21da895cd2137118']
    for (const tag of ['A', 'B'] as const) {
      const pkg = await readDspPackage('sidechain-compressor', tag)
      expect(pkg).toMatchObject({ stockDsp: true, stockKey: 'COMPRESSOR', fxId: 24, words: 388, tag })
      expect(pkg.relocations).toHaveLength(9)
      // Three displaced two-word stock instructions per core, each fingerprinted; the same stock code sits at different addresses on each core.
      expect(pkg.hooks?.map(hook => hook.site)).toEqual(sites[tag])
      expect(pkg.hooks?.map(hook => hook.guardSha256)).toEqual(guards)
      expect(pkg.hooks?.every(hook => hook.words === 2 && hook.entry >= 0 && hook.entry < pkg.words)).toBe(true)
      expect(pkg.hooks?.map(hook => hook.entry)).toEqual([48, 116, 361])
    }
    // The package is per core: asking for it without one, or for another core, finds nothing rather than the wrong code.
    await expect(readDspPackage('sidechain-compressor')).rejects.toThrow('different native placement')
    await expect(readDspPackage('sidechain-compressor', 'C')).rejects.toThrow('different native placement')
  })
  it('carries Output Matrix as one core-0 hooked package with no effect id or stock key', async () => {
    const fixtures = catalog.packages.filter(pkg => pkg.id === 'output-matrix')
    expect(fixtures.map(pkg => 'tag' in pkg && pkg.tag)).toEqual(['A'])
    const pkg = await readDspPackage('output-matrix', 'A')
    expect(pkg).toMatchObject({ stockDsp: true, fxId: null, words: 769, tag: 'A' })
    expect(pkg).not.toHaveProperty('stockKey')
    // The mixdown's MASTER TRACK branch and the phones crossfade, each a fingerprinted two-word stock instruction.
    expect(pkg.hooks?.map(hook => hook.site)).toEqual([0x257, 0x30a])
    expect(pkg.hooks?.map(hook => hook.guardSha256)).toEqual(['43a6ab9f9273577277c56b298e158b037e7b6f3c457da73cd18868c7501a9fd9', '749460b0c4484ec3134e24309d29382fd6265a4eeefbd813a9d97fa485a259f0'])
    expect(pkg.hooks?.every(hook => hook.words === 2 && hook.entry >= 0 && hook.entry < pkg.words)).toBe(true)
    // Core 1 has no Output Matrix code.
    await expect(readDspPackage('output-matrix', 'B')).rejects.toThrow('different native placement')
  })
  it('rejects malformed package structure, relocation and placement', async () => {
    const pkg = await readDspPackage('miniverb')
    for (const base of [-1, 0.5, NaN, Infinity, 0xffffff]) expect(() => relocateDspPackage(pkg, base)).toThrow('placement')
    expect(() => relocateDspPackage({ ...pkg, code: '00' }, 0)).toThrow('words')
    expect(() => relocateDspPackage({ ...pkg, init: pkg.words }, 0)).toThrow('entry')
    for (const relocations of [[-1], [0.5], [pkg.words], [0, 0]]) expect(() => relocateDspPackage({ ...pkg, relocations }, 0)).toThrow('relocation')
    const code = 'ffffff' + pkg.code.slice(6)
    expect(() => relocateDspPackage({ ...pkg, code, relocations: [0] }, 0)).toThrow('relocation')
    await expect(readDspPackage('character')).rejects.toThrow('different native placement')
    await expect(readDspPackage('unknown')).rejects.toThrow('different native placement')
  })
})
