// SPDX-License-Identifier: GPL-3.0-or-later
// ELF32/m68k RELA -> elemod format 2. Format semantics: irpina/elekloader
// docs/FORMAT.md and sdk/elf.py (GPL-2.0-or-later). No firmware is read.
const KEEP = new Set(['.boot', '.run', '.fast', '.bss'])
const RELOCS = new Map([[1, 'abs32'], [4, 'pc32'], [5, 'pc16']])
const fail = message => { throw new Error('elemod ELF: ' + message) }

export function readElemodElf(input) {
  const raw = Buffer.from(input)
  const span = (offset, length) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > raw.length) fail('truncated section or header')
    return raw.subarray(offset, offset + length)
  }
  span(0, 52)
  if (!raw.subarray(0, 7).equals(Buffer.from([127, 69, 76, 70, 1, 2, 1])) || raw.readUInt16BE(16) !== 1 || raw.readUInt16BE(18) !== 4 || raw.readUInt32BE(20) !== 1) fail('expected an ELF32 big-endian m68k relocatable object')
  const shoff = raw.readUInt32BE(32), shsize = raw.readUInt16BE(46), count = raw.readUInt16BE(48), namesIndex = raw.readUInt16BE(50)
  if (shsize !== 40 || !count || count > 1024 || namesIndex >= count) fail('invalid section table')
  span(shoff, count * shsize)
  const sections = Array.from({ length: count }, (_, index) => {
    const at = shoff + index * shsize
    const section = { index, nameOffset: raw.readUInt32BE(at), type: raw.readUInt32BE(at + 4), flags: raw.readUInt32BE(at + 8), offset: raw.readUInt32BE(at + 16), size: raw.readUInt32BE(at + 20), link: raw.readUInt32BE(at + 24), info: raw.readUInt32BE(at + 28), align: raw.readUInt32BE(at + 32), entrySize: raw.readUInt32BE(at + 36) }
    if (section.size > 16 * 1024 * 1024) fail('oversized section')
    return { ...section, data: section.type === 8 ? Buffer.alloc(0) : span(section.offset, section.size) }
  })
  const cstring = (data, offset) => {
    if (offset >= data.length) fail('string offset outside table')
    const end = data.indexOf(0, offset)
    if (end < 0) fail('unterminated string')
    const bytes = data.subarray(offset, end)
    if (bytes.some(byte => byte < 32 || byte > 126)) fail('non-ASCII symbol or section name')
    return bytes.toString('ascii')
  }
  const names = sections[namesIndex]
  if (names.type !== 3) fail('section names need a string table')
  for (const section of sections) section.name = cstring(names.data, section.nameOffset)
  const symtabs = sections.filter(section => section.type === 2)
  if (symtabs.length !== 1) fail('expected one symbol table')
  const symtab = symtabs[0], strings = sections[symtab.link]
  if (symtab.entrySize !== 16 || symtab.size % 16 || strings?.type !== 3) fail('invalid symbol table')
  const symbols = Array.from({ length: symtab.size / 16 }, (_, index) => {
    const at = index * 16, info = symtab.data[at + 12]
    return { index, name: cstring(strings.data, symtab.data.readUInt32BE(at)), value: symtab.data.readUInt32BE(at + 4), bind: info >> 4, type: info & 15, section: symtab.data.readUInt16BE(at + 14) }
  })
  const relocs = []
  for (const table of sections) {
    if (table.type === 9) fail('REL relocations are unsupported; use RELA')
    if (table.type !== 4) continue
    if (table.entrySize !== 12 || table.size % 12 || table.link !== symtab.index || !sections[table.info]) fail('invalid relocation table')
    for (let at = 0; at < table.size; at += 12) {
      const info = table.data.readUInt32BE(at + 4), symbol = symbols[info >>> 8]
      if (!symbol) fail('relocation references a missing symbol')
      relocs.push({ section: table.info, offset: table.data.readUInt32BE(at), type: info & 255, symbol, addend: table.data.readInt32BE(at + 8) })
    }
  }
  return { sections, symbols, relocs }
}

export function elfToElemod(input, document, build, target) {
  const elf = readElemodElf(input), sections = {}, sectionNames = new Map(), symbols = {}, exports = new Set(), imports = new Set(build.weak)
  for (const section of elf.sections) {
    if (!section.size || !(section.flags & 2)) continue
    if (!KEEP.has(section.name)) fail('unplaced allocated section ' + section.name)
    if (sections[section.name]) fail('duplicate section ' + section.name)
    if (section.align > 4096 || section.align && section.align & (section.align - 1)) fail('invalid alignment')
    if ((section.name === '.bss') !== (section.type === 8)) fail('invalid section storage type')
    if (section.name === '.boot' && document.id !== 'core') fail('only core may carry boot code')
    sectionNames.set(section.index, section.name)
    sections[section.name] = section.name === '.bss' ? { align: Math.max(4, section.align), size: section.size } : { align: Math.max(4, section.align), len: section.size, parts: [['hex', section.data.toString('hex')]] }
  }
  for (const symbol of elf.symbols) {
    if (!symbol.name || [3, 4].includes(symbol.type) || symbol.name.startsWith('.L') || !symbol.section) continue
    const section = sectionNames.get(symbol.section)
    if (!section && symbol.section !== 0xfff1) continue
    if (section && symbol.value > (sections[section].size ?? sections[section].len)) fail('symbol outside section')
    if (symbol.bind === 0 && Object.hasOwn(symbols, symbol.name)) continue
    symbols[symbol.name] = [section ?? 'abs', symbol.value]
    if ([1, 2].includes(symbol.bind)) exports.add(symbol.name)
  }
  const relocs = []
  for (const reloc of elf.relocs) {
    const section = sectionNames.get(reloc.section)
    if (!section || !reloc.type) continue
    const type = RELOCS.get(reloc.type), width = type === 'pc16' ? 2 : 4
    if (!type) fail('unsupported relocation type ' + reloc.type)
    if (section === '.bss' || reloc.offset + width > sections[section].len) fail('relocation outside initialized section')
    const symbol = reloc.symbol
    let to, addend = reloc.addend
    if (!symbol.section) { if (!symbol.name) fail('unnamed import'); to = 'sym:' + symbol.name; imports.add(symbol.name) }
    else if (symbol.section === 0xfff1) { to = 'abs'; addend += symbol.value }
    else if (sectionNames.has(symbol.section)) { to = 'sec:' + sectionNames.get(symbol.section); addend += symbol.type === 3 ? 0 : symbol.value }
    else fail('relocation references an unplaced symbol: ' + symbol.name)
    relocs.push([section, reloc.offset, type, to, addend])
  }
  const contribute = [
    ...build.subscribe.map(sub => ({ to: sub.event, order: sub.order, data: '00000000', relocs: [[0, 'abs32', 'sym:' + sub.fn, 0]], claims: [] })),
    ...build.contribute.map(entry => ({ ...entry, claims: [] })),
  ]
  for (const entry of contribute) for (const [, , to] of entry.relocs) if (to.startsWith('sym:') && !Object.hasOwn(symbols, to.slice(4))) imports.add(to.slice(4))
  return {
    elemod: 2, id: document.id, version: document.version, title: document.name, description: document.presentation.summary, category: document.category, author: document.author.github, license: document.license.spdx,
    target, sections, symbols, exports: [...exports].sort(), imports: [...imports].filter(name => !Object.hasOwn(symbols, name)).sort(), weak: [...build.weak].sort(), relocs, sites: [],
    collections: Object.fromEntries(Object.entries(build.collections).map(([name, entry]) => [name, { entry }])), contribute,
    copied: build.copied, resources: { regions: build.regions, names: build.claims, ...(document.id !== 'core' && document.platform?.core ? { core: document.platform.core } : {}) }, requires: [...new Set([...(document.id === 'core' ? [] : ['core']), ...build.requires, ...document.compatibility.requires])], conflicts: document.compatibility.conflicts, signature: null,
  }
}
