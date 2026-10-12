import { describe, expect, it } from 'vitest'
import { elfToElemod, readElemodElf } from './elemod-elf.mjs'

// Synthetic ELF assembled here, with original NOP data and no firmware/toolchain.
function fixture() {
  const sectionNames = Buffer.from('\0.run\0.bss\0.rela.run\0.symtab\0.strtab\0.shstrtab\0')
  const names = Buffer.from('\0handler\0core_additem\0CONST\0')
  const sym = Buffer.alloc(80)
  const symbol = (index, name, value, info, section) => { const at = index * 16; sym.writeUInt32BE(name, at); sym.writeUInt32BE(value, at + 4); sym[at + 12] = info; sym.writeUInt16BE(section, at + 14) }
  symbol(1, 1, 0, 0x12, 1); symbol(2, 9, 0, 0x10, 0); symbol(3, 0, 0, 3, 1); symbol(4, 22, 0x40001000, 0x10, 0xfff1)
  const rela = Buffer.alloc(36)
  for (const [i, type, sym, add] of [[0, 1, 2, -4], [1, 4, 3, 6], [2, 5, 4, 2]]) { const at = i * 12; rela.writeUInt32BE(i * 4, at); rela.writeUInt32BE(sym * 256 + type, at + 4); rela.writeInt32BE(add, at + 8) }
  const sections = [
    { name: 0, type: 0, flags: 0, data: Buffer.alloc(0), size: 0 },
    { name: 1, type: 1, flags: 6, data: Buffer.from('4e71'.repeat(12), 'hex'), align: 4 },
    { name: 6, type: 8, flags: 3, data: Buffer.alloc(0), size: 12, align: 4 },
    { name: 11, type: 4, flags: 0, data: rela, link: 4, info: 1, entry: 12 },
    { name: 21, type: 2, flags: 0, data: sym, link: 5, entry: 16 },
    { name: 29, type: 3, flags: 0, data: names },
    { name: 37, type: 3, flags: 0, data: sectionNames },
  ]
  const raw = Buffer.alloc(52 + 40 * sections.length + sections.reduce((sum, s) => sum + s.data.length, 0))
  Buffer.from([127, 69, 76, 70, 1, 2, 1]).copy(raw); raw.writeUInt16BE(1, 16); raw.writeUInt16BE(4, 18); raw.writeUInt32BE(1, 20); raw.writeUInt32BE(52, 32); raw.writeUInt16BE(40, 46); raw.writeUInt16BE(sections.length, 48); raw.writeUInt16BE(6, 50)
  let offset = 52 + 40 * sections.length
  sections.forEach((s, index) => {
    const at = 52 + index * 40
    for (const [field, value] of [[0, s.name], [4, s.type], [8, s.flags], [16, offset], [20, s.size ?? s.data.length], [24, s.link ?? 0], [28, s.info ?? 0], [32, s.align ?? 1], [36, s.entry ?? 0]]) raw.writeUInt32BE(value, at + field)
    s.data.copy(raw, offset); offset += s.data.length
  })
  return raw
}
const doc = { id: 'proof', version: '1.0.0', name: 'Proof', presentation: { summary: 'Synthetic module' }, author: { github: 'tester' }, license: { spdx: 'GPL-3.0-or-later' }, category: 'system', compatibility: { requires: [], conflicts: [] } }
const build = { weak: ['optional'], collections: {}, subscribe: [{ event: 'ev_draw', fn: 'handler', order: 50 }], contribute: [], copied: [], regions: [], claims: [], requires: [] }

describe('source-only m68k ELF conversion', () => {
  it('preserves zero-filled memory, exports, imports and signed relocation addends', () => {
    const mod = elfToElemod(fixture(), doc, build, { device: 'test' })
    expect(mod.sections['.run'].len).toBe(24)
    expect(mod.sections['.bss']).toEqual({ align: 4, size: 12 })
    expect(mod.symbols).toEqual({ handler: ['.run', 0], CONST: ['abs', 0x40001000] })
    expect(mod.imports).toEqual(['core_additem', 'optional'])
    expect(mod.relocs).toEqual([['.run', 0, 'abs32', 'sym:core_additem', -4], ['.run', 4, 'pc32', 'sec:.run', 6], ['.run', 8, 'pc16', 'abs', 0x40001002]])
    expect(mod.contribute[0].relocs).toEqual([[0, 'abs32', 'sym:handler', 0]])
    expect(mod.sites).toEqual([])
  })
  it('fails closed on malformed or unsupported ELF data', () => {
    expect(() => readElemodElf(fixture().subarray(0, 40))).toThrow('truncated')
    for (const [offset, value] of [[18, 62], [50, 90], [46, 20]]) { const raw = fixture(); raw.writeUInt16BE(value, offset); expect(() => readElemodElf(raw)).toThrow() }
    const rel = fixture(); rel.writeUInt32BE(9, 52 + 3 * 40 + 4); expect(() => readElemodElf(rel)).toThrow('REL relocations')
    const sym = fixture(); sym.writeUInt32BE(0xffffffff, 52 + 4 * 40 + 16); expect(() => readElemodElf(sym)).toThrow('truncated')
    const type = fixture(), rela = type.readUInt32BE(52 + 3 * 40 + 16); type.writeUInt32BE(2 * 256 + 2, rela + 4); expect(() => elfToElemod(type, doc, build, {})).toThrow('unsupported relocation')
    const missing = fixture(); missing.writeUInt32BE(99 * 256 + 1, rela + 4); expect(() => readElemodElf(missing)).toThrow('missing symbol')
  })
  it('keeps the core independent while requiring it for ordinary modules', () => {
    expect(elfToElemod(fixture(), { ...doc, id: 'core' }, { ...build, weak: [], subscribe: [] }, {}).requires).toEqual([])
    expect(elfToElemod(fixture(), doc, build, {}).requires).toEqual(['core'])
    expect(elfToElemod(fixture(), { ...doc, platform: { core: '3.0' } }, build, {}).resources.core).toBe('3.0')
  })
  it('refuses allocated sections that the linker cannot place and relocations outside data', () => {
    const raw = fixture(); raw.writeUInt32BE(29, 52 + 40); expect(() => elfToElemod(raw, doc, build, {})).toThrow('unplaced allocated section')
    const bounds = fixture(), rela = bounds.readUInt32BE(52 + 3 * 40 + 16); bounds.writeUInt32BE(23, rela); expect(() => elfToElemod(bounds, doc, build, {})).toThrow('outside initialized section')
  })
})
