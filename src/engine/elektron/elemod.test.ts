import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { LINK_DEVICES, ModError, applyWholeBuilds, checkLinkable, linkMods, parseElemod, type LinkDevice } from './elemod'
import { ELE2_DEVICES } from './ele2'
import { ELE3_DEVICES } from './ele3'
import A4_PROFILE from '../../../sdk/machines/analog-four-mkii/machine.json'
import DN2_PROFILE from '../../../sdk/machines/digitone-ii/machine.json'
import { readFileSync } from 'node:fs'
import { fromImage } from '../../../vendor/elekloader/kit/src/store.ts'

// A synthetic machine whose "stock" image is 4 KiB of NOPs: no Elektron firmware involved.
const image = Uint8Array.from({ length: 4096 }, (_, i) => (i % 2 ? 0x71 : 0x4e))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const device: LinkDevice = {
  key: 'test-machine', machine: 'digitakt', name: 'Test machine', sysexId: 0x0a, mainLoad: 0x40000000,
  releases: [{ version: '1.0', syxSha256: 'a'.repeat(64), mainSha256: sha(image), mainLength: image.length }],
  areas: { ddr: [0x41000000, 0x41001000] }, ddr: [0x41000000, 0x41001000], sramCode: [0, 0], fastTable: '', protected: [],
}
const target = { device: 'test-machine', os: '1.0', syx_sha256: 'a'.repeat(64) }
const nops = (n: number) => '4e71'.repeat(n / 2)
const core = { elemod: 2, id: 'core', version: '1.0', target, sections: { '.boot': { parts: [['hex', nops(8)]] }, '.run': { parts: [['hex', '00000000']] } }, symbols: { core_zero: ['.run', 0] }, exports: ['core_zero'], collections: { ev_tick: { entry: 4 } } }
const mod = (id: string, addr: number, extra: Record<string, unknown> = {}) => ({
  elemod: 2, id, version: '1.0', target, requires: ['core'],
  sections: { '.run': { parts: [['hex', '4e75']] }, '.bss': { size: 16 } }, symbols: { handler: ['.run', 0] },
  sites: [{ addr: '0x' + addr.toString(16), len: 6, new: '4eb900000000', kind: 'code', stock_sha256: sha(image.subarray(addr - 0x40000000, addr - 0x40000000 + 6)), relocs: [[2, 'abs32', 'sym:handler', 0]] }],
  contribute: [{ to: 'ev_tick', order: 50, data: '00000000', relocs: [[0, 'abs32', 'sym:handler', 0]] }],
  ...extra,
})
const parse = (doc: Record<string, unknown>) => parseElemod(doc, String(doc.id), [device])

describe('elemod linker', () => {
  it('links a core and mods into one image with relocated sites and tables', async () => {
    const linked = await linkMods([parse(core), parse(mod('one', 0x40000100)), parse(mod('two', 0x40000200))], image)
    expect(linked.order).toEqual(['core 1.0', 'one 1.0', 'two 1.0'])
    const view = new DataView(linked.image.buffer)
    const handler = view.getUint32(0x100 + 2)
    expect(handler).toBeGreaterThanOrEqual(0x41000000)
    expect(view.getUint16(0x100)).toBe(0x4eb9)
    expect(linked.tables.ev_tick[1]).toBe(2)
    expect(linked.image.length).toBeGreaterThan(image.length)
    expect(linked.layout.ddrSpare).toBeGreaterThan(0)
  })

  it('refuses overlapping sites, missing cores, wrong stock bytes and budgets', async () => {
    await expect(linkMods([parse(core), parse(mod('one', 0x40000100)), parse(mod('two', 0x40000102))], image)).rejects.toThrow('overlap')
    await expect(linkMods([parse(mod('one', 0x40000100))], image)).rejects.toThrow('exactly one mod must carry .boot')
    const changed = image.slice(); changed[0x101] = 0
    await expect(linkMods([parse(core), parse(mod('one', 0x40000100))], changed)).rejects.toThrow('stock main OS')
    await expect(linkMods([parse(core), parse(mod('big', 0x40000100, { sections: { '.run': { parts: [['hex', '4e75']] }, '.bss': { size: 8192 } } }))], image)).rejects.toThrow('need RAM')
  })

  it('refuses a mod that references or copies a routine the device keeps unlinkable', async () => {
    const guarded: LinkDevice = { ...device, noLink: [...ELE2_DEVICES['analog-rytm-mki'].noLink, [0x40000400, 0x40000410, 'a test routine']] }
    const on = (doc: Record<string, unknown>) => parseElemod(doc, String(doc.id), [guarded])
    const run = { '.run': { parts: [['hex', '4e7500000000']] }, '.bss': { size: 16 } }
    const mods = [core,
      mod('caller', 0x40000100, { symbols: { handler: ['.run', 0], flash_program: ['abs', '0x40096af6'] }, exports: ['flash_program'] }),
      mod('jumper', 0x40000200, { sections: run, relocs: [['.run', 2, 'abs32', 'abs', 0x4011a7a4]] }),
      mod('user', 0x40000300, { sections: run, imports: ['flash_program'], relocs: [['.run', 2, 'pc32', 'sym:flash_program', 2]] }),
      mod('copier', 0x40000500, { sections: { '.run': { parts: [['stock', '0x40000408', 4]] }, '.bss': { size: 16 } } })].map(on)
    const refused = (await checkLinkable(mods, image)).filter(problem => problem.includes('no mod may link to it'))
    expect(refused).toEqual([
      'caller 1.0: symbol flash_program reaches 0x40096af6-0x40096b3e, the flash program routine every flash write uses: no mod may link to it on the Test machine',
      'jumper 1.0: a reference to 0x4011a7a4 reaches 0x4011a7a4-0x4011aa7a, BOOTSTRAP UPGRADE, which rewrites the boot flash: no mod may link to it on the Test machine',
      'user 1.0: a reference to 0x40096af8 reaches 0x40096af6-0x40096b3e, the flash program routine every flash write uses: no mod may link to it on the Test machine',
      'copier 1.0: a stock copy from 0x40000408 reaches 0x40000400-0x40000410, a test routine: no mod may link to it on the Test machine',
    ])
    await expect(linkMods(mods, image)).rejects.toThrow('no mod may link to it')
    expect((await linkMods([on(core), on(mod('one', 0x40000100))], image)).order).toEqual(['core 1.0', 'one 1.0'])
  })

  it('gives a set too big for the area the first larger one it may use, and leaves every other set where it was', async () => {
    const wide: LinkDevice = { ...device, ddrMore: [{ area: [0x40ffc000, 0x41001000] }, { area: [0x40ffc000, 0x41009000], unless: 'fixed_end' }] }
    const on = (doc: Record<string, unknown>) => parseElemod(doc, String(doc.id), [wide])
    const sized = (id: string, addr: number, bss: number, extra: Record<string, unknown> = {}) => mod(id, addr, { sections: { '.run': { parts: [['hex', '4e75']] }, '.bss': { size: bss } }, ...extra })
    const small = await linkMods([on(core), on(mod('one', 0x40000100))], image)
    expect(small.layout.ddr[0]).toBe(0x41000000)
    expect(small.image).toEqual((await linkMods([parse(core), parse(mod('one', 0x40000100))], image)).image)
    const big = sized('big', 0x40000200, 0x2000)
    const linked = await linkMods([on(core), on(mod('one', 0x40000100)), on(big)], image)
    expect(linked.layout.ddr[0]).toBe(0x40ffc000)
    expect(linked.layout.ddrSpare).toBe(0x41001000 - linked.layout.bss[1])
    expect(new DataView(linked.image.buffer).getUint32(0x100 + 2)).toBeGreaterThanOrEqual(0x40ffc000)
    await expect(linkMods([parse(core), parse(mod('one', 0x40000100)), parse(big)], image)).rejects.toThrow('bytes over')
    const huge = await linkMods([on(core), on(sized('huge', 0x40000300, 0x8000))], image)
    expect(huge.layout.ddr[0]).toBe(0x40ffc000)
    expect(huge.layout.ddrSpare).toBe(0x41009000 - huge.layout.bss[1])
    await expect(linkMods([on(core), on(sized('fixed', 0x40000300, 0x8000, { imports: ['fixed_end'] })), on(mod('ends', 0x40000400, { symbols: { handler: ['.run', 0], fixed_end: ['.run', 0] }, exports: ['fixed_end'] }))], image))
      .rejects.toThrow(/past 0x41001000 .*fixed 1\.0 cannot use the 53248 bytes at 0x40ffc000-0x41009000/)
    await expect(linkMods([on(core), on(sized('vast', 0x40000300, 0x10000))], image)).rejects.toThrow('past 0x41009000')
  })

  it('applies a single whole build and refuses two', async () => {
    const whole = (id: string) => ({ elemod: 1, id, version: '1.0', target, sites: [], blob: { load: '0x40001000', len: 2, sha256: sha(Uint8Array.from([0x4e, 0x75])), parts: [['hex', '4e75']] } })
    expect((await applyWholeBuilds([parse(whole('os'))], image)).length).toBe(image.length + 2)
    await expect(applyWholeBuilds([parse(whole('a')), parse(whole('b'))], image)).rejects.toThrow('more than one whole build')
    expect(() => parse({ ...whole('x'), surprise: 1 })).toThrow(ModError)
  })

  it('places mod storage fields from the lockfile for a core that keeps them', async () => {
    // the Rytm's storage room (elekloader's store.ts) on the synthetic image: a core that imports __store_gen
    const rytm: LinkDevice = { ...device, key: 'analog-rytm-mk2', machine: 'analog-rytm-mkii' }
    const rytmTarget = { ...target, device: 'analog-rytm-mk2' }
    const parseRytm = (doc: Record<string, unknown>) => parseElemod(doc, String(doc.id), [rytm])
    const storeCore = { ...core, version: '0.3', target: rytmTarget, imports: ['__store_gen', '__store_gen2', 'core_store_ids'], collections: { ev_tick: { entry: 4 }, core_store_ids: { entry: 4 } } }
    const keeper = (id: string, addr: number, bits: number) => ({ ...mod(id, addr), target: rytmTarget, imports: [id + '_f'], storage: [{ sym: id + '_f', scope: 'track', bits }] })
    const first = await linkMods([parseRytm(storeCore), parseRytm(keeper('one', 0x40000100, 3))], image)
    expect(first.store?.fields).toEqual([{ mod: 'one', sym: 'one_f', scope: 'track', offset: 0, bits: 3 }])
    expect(first.map.one_f >>> 0).toBe(((4 << 28) | (3 << 22) | 0) >>> 0)
    expect(first.map.__store_gen).toBeDefined()
    expect(first.tables.core_store_ids[1]).toBe(1)
    expect(fromImage(first.image)).toEqual(first.store)
    // the next build keeps the field where it was, and a new field takes new bits under a new layout ID
    const next = await linkMods([parseRytm(storeCore), parseRytm(keeper('one', 0x40000100, 3)), parseRytm(keeper('two', 0x40000200, 5))], image, first.store)
    expect(next.store?.fields.find(field => field.sym === 'one_f')?.offset).toBe(0)
    expect(next.store?.fields.find(field => field.sym === 'two_f')?.offset).toBe(3)
    expect(next.store?.ancestors).toContain(first.store!.id)
    // an unchanged build keeps the layout ID
    expect((await linkMods([parseRytm(storeCore), parseRytm(keeper('one', 0x40000100, 3))], image, first.store)).store?.id).toBe(first.store!.id)
    // storage needs a core that keeps it; fields are C names declared once
    await expect(linkMods([parseRytm({ ...core, target: rytmTarget }), parseRytm(keeper('one', 0x40000100, 3))], image)).rejects.toThrow('declares mod storage')
    expect(() => parseRytm({ ...keeper('bad', 0x40000100, 3), storage: [{ sym: 'x', scope: 'song', bits: 3 }] })).toThrow(ModError)
    expect((await linkMods([parse(core), parse(mod('one', 0x40000100))], image)).store).toBeNull()
  })
})

describe('Analog Four MKII linker profile', () => {
  it('matches the machine profile and the elekloader device', () => {
    const a4 = LINK_DEVICES.find(item => item.machine === 'analog-four-mkii')!
    // elekloader's device key, which the browser builder and catalog pins use
    expect(a4).toMatchObject({ key: 'analog-four-mk2', sysexId: ELE3_DEVICES['analog-four-mkii'].sysexId, mainLoad: ELE3_DEVICES['analog-four-mkii'].mainLoad, ddr: [0x47be0000, 0x47c00000] })
    expect(a4.releases.map(release => [release.version, release.syxSha256])).toEqual(A4_PROFILE.firmware.releases.map(release => [release.version, release.files[0].sha256]))
    expect(a4.ddr[1] - a4.ddr[0]).toBe(A4_PROFILE.sdk.budgets.find(budget => budget.name === 'Shared mod memory')!.value)
  })
})

describe('Digitone II linker profile', () => {
  it('matches the machine profile, the OS research and the Digitakt II platform', () => {
    const dn2 = LINK_DEVICES.find(item => item.machine === 'digitone-ii')!
    const dt2 = LINK_DEVICES.find(item => item.machine === 'digitakt-ii')!
    // elekloader's device key, which the browser builder and catalog pins use
    expect(dn2).toMatchObject({ key: 'digitone-mk2', sysexId: 0x15, mainLoad: dt2.mainLoad, ddr: dt2.ddr, sramCode: [0, 0], fastTable: '' })
    expect(dn2.sysexId).toBe(ELE3_DEVICES['digitone-ii'].sysexId)
    expect(dn2.releases.map(release => [release.version, release.syxSha256])).toEqual(DN2_PROFILE.firmware.releases.map(release => [release.version, release.files[0].sha256]))
    // the same staging, flash window and seal as the Digitakt II's
    expect({ ...ELE3_DEVICES['digitone-ii'], sysexId: 0 }).toEqual({ ...ELE3_DEVICES['digitakt-ii'], sysexId: 0 })
    // the main OS and the mod area are the ones the research records
    const research = readFileSync(new URL('../../../docs/DIGITONE_II_OS_RESEARCH.md', import.meta.url), 'utf8')
    for (const release of dn2.releases) expect(research).toContain(release.mainSha256)
    expect(research).toContain('3,196,288 bytes')
    expect(research.toLowerCase().replaceAll('`', '')).toContain('ddr 0x47f00000–0x47f40000')
  })
})

describe('Digitone II SHARC payloads', () => {
  // A synthetic Digitone II: the same stock NOPs, under the device's machine.
  const dn2: LinkDevice = { ...device, key: 'test-dn2', machine: 'digitone-ii', name: 'Test Digitone II', sysexId: 0x15 }
  const dn2Target = { device: 'test-dn2', os: '1.0', syx_sha256: 'a'.repeat(64) }
  const parseDn2 = (doc: Record<string, unknown>) => parseElemod(doc, String(doc.id), [dn2])
  const bridge = { abi: 'test-abi', segments: [], zero: [], entries: {}, stack_bytes: 0 }

  it('links a core that carries the DSP bridge, and refuses a mod that brings DSP code', async () => {
    const linked = await linkMods([parseDn2({ ...core, target: dn2Target, sharc: bridge }), parseDn2({ ...mod('one', 0x40000100), target: dn2Target })], image)
    expect(linked.order).toEqual(['core 1.0', 'one 1.0'])
    const dsp = parseDn2({ ...mod('dsp', 0x40000100), target: dn2Target, sharc: bridge })
    expect(dsp.sharc).toBe('test-abi')
    await expect(linkMods([parseDn2({ ...core, target: dn2Target, sharc: bridge }), dsp], image)).rejects.toThrow('does not write yet')
  })

  it('takes a SHARC payload only on the Digitone II, and only with its ABI', () => {
    expect(() => parse({ ...core, sharc: bridge })).toThrow('only for the Digitone II')
    expect(() => parseDn2({ ...core, target: dn2Target, sharc: { segments: [] } })).toThrow('needs its abi')
  })
})
