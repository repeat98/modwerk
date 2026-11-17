import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { packSection } from '../aplib'
import { ELE3_DEVICES } from '../elektron/ele3'
import { LINK_DEVICES, type ParsedMod } from '../elektron/elemod'
import { contentChecksum, encodeSyx } from '../elektron/sysex'
import { PreflightError, appendLimit, parseBuildMods, preflightBuild, rawCardWrite } from './digi-preflight'
import { BUILDER_CATALOG } from './machine-build'

// A synthetic Digitakt II container: invented sections, a main OS of NOPs and a 32-byte tail where a sealed file keeps
// its trailer. No Elektron firmware is involved.
const LOAD = 0x40000400, DT2 = LINK_DEVICES.find(device => device.machine === 'digitakt-ii')!
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const filler = (length: number, seed: number) => Uint8Array.from({ length }, (_, i) => (i * seed + (i >> 5)) & 0xff)
// NOPs where the tests patch, filler after: packing anything appended to 4 KB of one repeated word takes the compressor
// seconds, which timed the tests out on CI.
const stockMain = Uint8Array.from({ length: 4096 }, (_, i) => i < 0x400 ? (i % 2 ? 0x71 : 0x4e) : (i * 5 + (i >> 5)) & 0xff)
const framing = (count: number) => Uint8Array.from([0xf0, 0x00, 0x20, 0x3c, 0x14, 0x00, 0x7d, 0x00, 0x10, 0x01, 0x02, 0x03, (count >> 14) & 0x7f, (count >> 7) & 0x7f, count & 0x7f, 0xf7])

function syx(main: Uint8Array, { section4 = filler(300, 7), version = 'TEST' } = {}) {
  const sections = [{ id: 2, data: filler(64, 3) }, { id: 3, data: packSection(main) }, { id: 4, data: section4 }]
  const dataStart = 0x20 + sections.length * 16 + 16
  const head = new Uint8Array(dataStart), view = new DataView(head.buffer)
  head.set([0x45, 0x4c, 0x45, 0x33]); head.set(Array.from(version, c => c.charCodeAt(0)), 0x14)
  view.setUint32(0x1c, sections.length)
  const parts: number[] = []
  let at = dataStart
  sections.forEach((section, index) => {
    view.setUint32(0x20 + index * 16, section.id); view.setUint32(0x24 + index * 16, at); view.setUint32(0x28 + index * 16, section.data.length); view.setUint32(0x2c + index * 16, 0x40000000 + index)
    const padded = new Uint8Array(section.data.length + (-section.data.length & 15)); padded.set(section.data)
    parts.push(...padded); at += padded.length
  })
  const container = new Uint8Array(at); container.set(head); container.set(parts, dataStart)
  const stream = new Uint8Array(8 + container.length + 32)
  new DataView(stream.buffer).setUint32(0, container.length); new DataView(stream.buffer).setUint32(4, contentChecksum(container))
  stream.set(container, 8); stream.set(filler(32, 11), 8 + container.length)
  return encodeSyx(stream, 0x14, framing(0), framing(0))
}

const site = (addr: number, length: number) => ({ addr, length, kind: 'code' as const, stockSha256: sha(stockMain.subarray(addr - LOAD, addr - LOAD + length)), bytes: new Uint8Array(length), relocs: [] })
function mod(extra: Partial<ParsedMod> = {}): ParsedMod {
  return {
    format: 2, id: 'core', version: '1.1', device: DT2, release: DT2.releases[0], sites: [site(0x40000500, 6)], regions: [], names: [], requires: [], conflicts: [],
    blob: null, shownVersion: null, sections: { '.boot': { align: 2, size: 32 } }, symbols: new Map(), exports: [], imports: [], weak: new Set(), relocs: [],
    collections: new Map(), contribute: [], copied: [], storage: [], ...extra,
  }
}
/** The stock main OS with `bytes` written at `addr` and `tail` bytes appended. */
function main(edits: [number, number[]][], tail = 0) {
  const out = new Uint8Array(stockMain.length + tail); out.set(stockMain)
  for (const [addr, bytes] of edits) out.set(bytes, addr - LOAD)
  return out
}
const JMP = [0x4e, 0xf9, 0x40, 0x00, 0x14, 0x00]
const problems = async (run: Promise<unknown>) => { try { await run } catch (error) { if (error instanceof PreflightError) return error.problems; throw error } return [] }

describe('Digitakt II build preflight', () => {
  const stock = syx(stockMain)

  it('passes a build that changes only a declared site and appends the mods, and reports what it checked', async () => {
    const built = syx(main([[0x40000500, JMP]], 96), { version: 'MW01' })
    const facts = await preflightBuild('digitakt-ii', stock, built, [mod()])
    expect(facts).toMatchObject({ stockSha256: sha(stock), buildSha256: sha(built), mainStockSha256: sha(stockMain), unchangedSections: [2, 4], appended: 96 })
    expect(facts.changed).toEqual([{ from: 0x40000501, to: 0x40000506, owner: 'core 1.1' }])
    expect(facts.flashHeadroom).toBe(ELE3_DEVICES['digitakt-ii'].flashLimit - facts.flashEnd)
    expect(facts.appendLimit).toBe(32 + 15 + 0x40000)
  })

  it('refuses a build that changes another section, or main OS bytes outside every site', async () => {
    expect(await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP]]), { section4: filler(300, 9) }), [mod()]))).toEqual(['section 4 is not byte for byte stock'])
    expect(await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP], [0x40000700, [0]]])), [mod()])))
      .toEqual(['stock bytes 0x40000700-0x40000701 change outside every declared site'])
  })

  it('refuses a site whose guard does not match the stock bytes', async () => {
    const wrong = mod({ sites: [{ ...site(0x40000500, 6), stockSha256: '0'.repeat(64) }] })
    expect(await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP]])), [wrong]))).toEqual(['core 1.1 site 0x40000500: the stock bytes are not the ones it expects'])
  })

  it('refuses more appended bytes than the mods can account for, and a container past the flash limit', async () => {
    const small = mod({ device: { ...DT2, ddr: [0x47f00000, 0x47f00010] } })
    expect(await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP]], 96)), [small]))).toEqual(['the appended tail is 96 bytes, over the 63 allowed'])
    const tight = { ...ELE3_DEVICES['digitakt-ii'], flashLimit: ELE3_DEVICES['digitakt-ii'].flashAt + 0x40 }
    expect((await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP]])), [mod()], tight)))[0]).toMatch(/^the container ends at 0x[0-9a-f]{8} in flash, past 0x00080040$/)
  })

  it('refuses mods for another machine, and a build with no mod files', async () => {
    const rytm = mod({ device: LINK_DEVICES.find(device => device.machine === 'analog-rytm-mkii')! })
    expect(await problems(preflightBuild('digitakt-ii', stock, syx(main([[0x40000500, JMP]])), [rytm]))).toContain('core 1.1 is not for this machine')
    expect(await problems(preflightBuild('digitakt-ii', stock, stock, []))).toEqual(['no mod files to check the build against'])
  })

  it('refuses a mod that reaches the raw card write by the core\'s name or by its address, and passes the core that only defines it', async () => {
    const built = syx(main([[0x40000500, JMP]], 96)), WRITE = 0x4012e39c, call = [0x4e, 0xb9, 0, 0, 0, 0, 0x4e, 0x75]
    const run = (bytes: number[]) => ({ '.run': { align: 2, parts: [{ kind: 'hex' as const, bytes: Uint8Array.from(bytes) }], length: bytes.length } })
    const reloc = (target: string, addend = 0) => [{ section: '.run' as const, offset: 2, type: 'abs32' as const, target, addend }]
    const saver = (extra: Partial<ParsedMod>) => mod({ id: 'saver', version: '0.1', sites: [], sections: run(call), ...extra })
    const abs = (values: Record<string, number>): ParsedMod['symbols'] => new Map(Object.entries(values).map(([name, value]) => [name, ['abs', value]]))
    const core = mod({ symbols: abs({ fw_card_write: WRITE, fw_card_read: 0x4012e1b6 }), exports: ['fw_card_write', 'fw_card_read'] })
    const refusal = (how: string) => ['saver 0.1 ' + how + ', the raw block write to the +Drive, which no mod may use: keep a mod\'s data in the project and its kits (core_projdata, core_kitdata)']
    const refused = (extra: Partial<ParsedMod>) => problems(preflightBuild('digitakt-ii', stock, built, [core, saver(extra)]))
    expect(await refused({ imports: ['fw_card_write'], relocs: reloc('sym:fw_card_write') })).toEqual(refusal('refers to fw_card_write'))
    expect(await refused({ symbols: abs({ SAVE: WRITE }), relocs: reloc('sym:SAVE') })).toEqual(refusal('names 0x4012e39c'))
    expect(await refused({ relocs: reloc('abs', WRITE) })).toEqual(refusal('names 0x4012e39c'))
    expect(await refused({ sections: run([0x4e, 0xb9, 0x40, 0x12, 0xe3, 0x9c, 0x4e, 0x75]) })).toEqual(refusal('names 0x4012e39c'))
    expect(await refused({ sites: [{ ...site(0x40000600, 6), bytes: Uint8Array.from([0x4e, 0xf9, 0x40, 0x12, 0xe3, 0x9c]) }] })).toEqual(refusal('names 0x4012e39c'))
    expect(await refused({ imports: ['fw_card_read'], relocs: reloc('sym:fw_card_read') })).toEqual([])
    expect(rawCardWrite(saver({ device: LINK_DEVICES.find(device => device.machine === 'digitakt')!, sections: run([0x40, 0x12, 0xe3, 0x9c]) }))).toBeNull()
  })

  it('finds no Digitakt II package in the builder catalogue that reaches the raw card write', () => {
    const files = [...BUILDER_CATALOG.cores, ...BUILDER_CATALOG.mods].filter(pin => pin.device === DT2.key).map(pin => pin.file)
    const mods = parseBuildMods(files.map(name => ({ name, bytes: readFileSync(new URL('../../../vendor/elekloader/catalog/' + name, import.meta.url)) })))
    expect(mods.length).toBeGreaterThan(1)
    expect(mods.filter(rawCardWrite).map(found => found.id + ' ' + found.version)).toEqual([])
  })

  it('counts the mod-storage lockfile at the end of the build as appended by the mods', () => {
    const lock = new TextEncoder().encode('ELKSTORE' + '\0\0\0\x04{}  ')
    const built = new Uint8Array(stockMain.length + 40 + lock.length); built.set(stockMain); built.set(lock, stockMain.length + 40)
    expect(appendLimit([mod()], built, stockMain.length)).toBe(32 + 15 + 0x40000 + lock.length)
  })

  it('reads the sites of a real catalogue core', () => {
    const file = 'core-1.0.elemod'
    const [core] = parseBuildMods([{ name: file, bytes: readFileSync(new URL('../../../vendor/elekloader/catalog/' + file, import.meta.url)) }])
    expect(core.device.machine).toBe('digitakt-ii')
    expect(core.sites.length).toBeGreaterThan(0)
    expect(core.sites.every(s => /^[0-9a-f]{64}$/.test(s.stockSha256))).toBe(true)
  })
})
