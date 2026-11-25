// Restricted layout for the pinned GNU m68k platform link. No input code runs.
// Accepted section families and merge behavior are verified by native link proofs.
import { relocateColdFireObject } from './coldfire-elf.ts'
import type { CfObject, CfPlacement, CfSection } from './coldfire-elf.ts'
import type { RuntimeCatalog } from './runtime-catalog.ts'
export type CfLinkInput = { label: string; object: CfObject }
export type CfRuntimeLink = { bytes: Uint8Array; symbols: Map<string, number>; placements: Map<string, Map<number, CfPlacement>>; sections: { name: string; address: number; size: number }[]; memoryEnd: number }
const MAX_IMAGE = 16 * 1024 * 1024, PAGE = 0x2000
// A bound on the work one link does, not a native limit: GNU ld takes any number of objects, and the fullest selections of
// the catalogue need more than 32 units. Native refuses those for free space, so the browser must reach the same check.
export const MAX_LINK_INPUTS = 256
const align = (address: number, alignment: number) => Math.ceil(address / alignment) * alignment
function fail(message: string): never { throw new Error('The ColdFire runtime ' + message + '.') }
type InputSection = { input: CfLinkInput; section: CfSection }
type Merge = { bytes: Uint8Array; offsets: Map<CfSection, { source: number; count: number; destination: number }[]> }
function mergeStrings(parts: readonly InputSection[]): Merge {
  const strings: { section: CfSection; offset: number; bytes: Uint8Array; key: string }[] = []
  for (const { section } of parts) {
    if (section.flags !== 0x32 || section.entrySize !== 1 || section.alignment !== 1) fail('has an unsupported mergeable-string layout')
    for (let offset = 0; offset < section.size;) {
      const end = section.data.indexOf(0, offset)
      if (end < 0) fail('has an unterminated mergeable string')
      const bytes = section.data.slice(offset, end + 1)
      strings.push({ section, offset, bytes, key: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') })
      offset = end + 1
    }
  }
  const unique = strings.filter((string, i) => strings.findIndex(other => other.key === string.key) === i)
  const survivors = unique.filter(string => !unique.some(other => other.bytes.length > string.bytes.length && other.key.endsWith(string.key)))
  const destinations = new Map<string, number>(); let size = 0
  for (const string of survivors) { destinations.set(string.key, size); size += string.bytes.length }
  const bytes = new Uint8Array(size)
  for (const string of survivors) bytes.set(string.bytes, destinations.get(string.key)!)
  const offsets: Merge['offsets'] = new Map(parts.map(part => [part.section, []]))
  for (const string of strings) {
    const owners = survivors.filter(other => other.key.endsWith(string.key))
    // GNU assigns shared suffixes to the first owner in reversed-byte order.
    // Native complete-image comparisons cover the VECTOR and platform strings.
    owners.sort((a, b) => {
      for (let i = 2; i <= Math.min(a.bytes.length, b.bytes.length); i++) if (a.bytes[a.bytes.length - i] !== b.bytes[b.bytes.length - i]) return a.bytes[a.bytes.length - i] - b.bytes[b.bytes.length - i]
      return a.bytes.length - b.bytes.length
    })
    const owner = owners[0], destination = destinations.get(owner.key)! + owner.bytes.length - string.bytes.length
    offsets.get(string.section)!.push({ source: string.offset, count: string.bytes.length, destination })
  }
  return { bytes, offsets }
}

export function linkColdFireRuntime(inputs: readonly CfLinkInput[], base: number, externals: ReadonlyMap<string, number> = new Map()): CfRuntimeLink {
  if (!inputs.length || inputs.length > MAX_LINK_INPUTS || !Number.isInteger(base) || base < 0 || base > 0xffffffff || base % 4) fail('has an invalid base or input count')
  // GNU treats a zero architecture flag as neutral (data-only assembly).
  const architectures = new Set(inputs.map(input => input.object.flags).filter(flags => flags !== 0))
  if (architectures.size > 1) fail('mixes incompatible CPU object flags')
  const placements = new Map<string, Map<number, CfPlacement>>()
  const allocated: InputSection[] = []
  for (const input of inputs) {
    if (!input.label || placements.has(input.label)) fail('has duplicate or empty unit labels')
    placements.set(input.label, new Map())
    for (const section of input.object.sections) if (section.flags & 2) {
      if (!Number.isInteger(section.size) || section.size < 0 || section.size > MAX_IMAGE || !Number.isInteger(section.alignment) || section.alignment < 1 || section.alignment > PAGE || (section.alignment & (section.alignment - 1))) fail('has invalid section dimensions')
      const valid = (section.name === '.text' && section.type === 1 && section.flags === 6) || (section.name === '.rodata' && section.type === 1 && section.flags === 2) || (section.name === '.rodata.str1.1' && section.type === 1 && section.flags === 0x32) || (section.name === '.data' && section.type === 1 && section.flags === 3) || (section.name === '.bss' && section.type === 8 && section.flags === 3)
      if (!valid) fail('has an unsupported allocated section: ' + section.name)
      if (section.type !== 8 && section.data.length !== section.size) fail('has inconsistent section contents')
      if ((section.flags & 0x10) && input.object.relocations.some(relocation => relocation.section === section.index && relocation.type !== 0)) fail('cannot relocate inside mergeable strings')
      allocated.push({ input, section })
    }
    if (input.object.symbols.some(symbol => ['_end','_edata','__bss_start'].includes(symbol.name) && symbol.section !== 0)) fail('defines a reserved linker memory boundary')
    if (input.object.symbols.some(symbol => externals.has(symbol.name) && symbol.section !== 0)) fail('has duplicate declared external symbols')
    if (input.object.symbols.some(symbol => symbol.section === 0xfff2)) fail('needs explicit common-symbol allocation')
  }
  const merged = new Set<CfSection>(), copies: { address: number; bytes: Uint8Array }[] = [], fills: { start: number; end: number }[] = []
  const sections: CfRuntimeLink['sections'] = []; let cursor = base
  function extent(end: number) { if (end > 0xffffffff || end - base > MAX_IMAGE) fail('exceeds its bounded address range') }
  for (const name of ['.text', '.rodata', '.data', '.bss']) {
    const parts = allocated.filter(({ section }) => name === '.rodata' ? section.name.startsWith('.rodata') : section.name === name)
    if (!parts.length) continue
    // GNU DATA_SEGMENT_ALIGN may choose the page-aligned alternative when
    // it reduces segment page count. Section alignment affects that count.
    // https://sourceware.org/binutils/docs/ld/Builtin-Functions.html
    if (name === '.data') {
      const initial = align(cursor, PAGE) + cursor % PAGE, alternative = align(cursor, PAGE)
      function endAt(start: number) {
        let at = align(start, Math.max(...parts.map(({ section }) => section.alignment)))
        for (const { section } of parts) at = align(at, section.alignment) + section.size
        const bss = allocated.filter(({ section }) => section.name === '.bss')
        if (bss.length) { at = align(at, Math.max(...bss.map(({ section }) => section.alignment))); for (const { section } of bss) at = align(at, section.alignment) + section.size }
        return at
      }
      const pagesAt = (start: number) => Math.ceil(endAt(start) / PAGE) - Math.floor(start / PAGE)
      cursor = pagesAt(alternative) < pagesAt(initial) ? alternative : initial
    }
    const beforeAlignment = cursor
    cursor = align(cursor, Math.max(...parts.map(({ section }) => section.alignment)))
    const start = cursor
    for (const { input, section } of parts) {
      if (merged.has(section)) continue
      const at = align(cursor, section.alignment)
      if (name === '.text' && cursor < at) fills.push({ start: cursor, end: at })
      cursor = at
      if (section.flags & 0x10) {
        const group = parts.filter(part => part.section.name === section.name && part.section.flags === section.flags && part.section.entrySize === section.entrySize)
        const merge = mergeStrings(group)
        for (const part of group) {
          merged.add(part.section)
          placements.get(part.input.label)!.set(part.section.index, { address: cursor, mergedOffsets: merge.offsets.get(part.section)!.map(mapping => ({ ...mapping, destination: cursor + mapping.destination })) })
        }
        copies.push({ address: cursor, bytes: merge.bytes }); cursor += merge.bytes.length
      } else {
        placements.get(input.label)!.set(section.index, { address: cursor })
        cursor += section.size
      }
      extent(cursor)
    }
    sections.push({ name, address: start, size: cursor - start })
    // An empty .data has symbols but does not advance the GNU BSS location
    // counter; its stricter alignment must not shift following BSS.
    if (name === '.data' && !parts.some(part=>part.section.size) && allocated.some(part=>part.section.name === '.bss' && part.section.size)) cursor = beforeAlignment
  }
  const symbols = new Map<string, number>(externals)
  for (const input of inputs) {
    const defined = relocateColdFireObject({ ...input.object, relocations: [] }, placements.get(input.label)!, new Map()).exports
    for (const [name, value] of defined) {
      if (symbols.has(name)) fail('has duplicate global symbols: ' + name)
      symbols.set(name, value)
    }
  }
  const memoryEnd = align(cursor, 4)
  extent(memoryEnd)
  const bss = sections.find(section => section.name === '.bss')
  const data = sections.find(section => section.name === '.data')
  // GNU provides these boundary symbols when referenced. Keep the existing
  // public export inventory unchanged for modules with no references or BSS.
  for (const [name, address] of [['__bss_start', bss?.address ?? cursor], ['_edata', data?.size ? data.address + data.size : bss?.address ?? cursor], ['_end', memoryEnd]] as const) {
    if ((bss?.size || inputs.some(input => input.object.symbols.some(symbol => symbol.name === name && symbol.section === 0))) && !symbols.has(name)) symbols.set(name, address)
  }
  // NOBITS contributes to memory placement, never to the packed/load image.
  // `objcopy -O binary` ends the image with the last section that has contents: an empty section adds
  // nothing, not even the page-aligned gap in front of it (a runtime that ends in a module's .rodata).
  const end = Math.max(base, ...sections.filter(section => section.name !== '.bss' && section.size > 0).map(section => section.address + section.size))
  const bytes = new Uint8Array(end - base)
  for (const fill of fills) for (let address = fill.start; address < fill.end; address++) bytes[address - base] = (address - fill.start) % 2 ? 0x71 : 0x4e
  for (const copy of copies) bytes.set(copy.bytes, copy.address - base)
  for (const input of inputs) {
    const result = relocateColdFireObject(input.object, placements.get(input.label)!, symbols)
    for (const section of result.sections) if (!merged.has(input.object.sections[section.index]) && section.data.length) bytes.set(section.data, section.address - base)
  }
  return { bytes, symbols, placements, sections, memoryEnd }
}

// Represent the locally serialized catalog as an in-memory object, so its
// pointer table participates in the same section placement and relocation.
export function runtimeCatalogObject(catalog: RuntimeCatalog, flags: number): CfObject {
  const base = catalog.symbols.dl_stub_at_boot, bytes = catalog.bytes.slice(), view = new DataView(bytes.buffer)
  if (bytes.length < 1416 || !Number.isInteger(base) || base < 0 || base % 4) fail('has an invalid virtual catalog')
  const sections: CfSection[] = [
    { index: 0, name: '', type: 0, flags: 0, size: 0, alignment: 1, entrySize: 0, data: new Uint8Array() },
    ...['.text', '.data', '.bss'].map((name, i): CfSection => ({ index: i + 1, name, type: name === '.bss' ? 8 : 1, flags: name === '.text' ? 6 : 3, size: 0, alignment: 4, entrySize: 0, data: new Uint8Array() })),
    { index: 4, name: '.rodata', type: 1, flags: 2, size: bytes.length, alignment: 4, entrySize: 0, data: bytes },
  ]
  const publicNames = new Set(['dl_stub_at_boot', 'dl_pmap16', 'dl_catalog', 'dl_codes'])
  const symbols: CfObject['symbols'] = [
    { index: 0, name: '', value: 0, size: 0, binding: 0, type: 0, section: 0 },
    { index: 1, name: '.rodata', value: 0, size: 0, binding: 0, type: 3, section: 4 },
  ]
  for (const [name, address] of Object.entries(catalog.symbols)) {
    const value = address - base
    if (!Number.isInteger(value) || value < 0 || value > bytes.length) fail('has an invalid virtual catalog symbol')
    symbols.push({ index: symbols.length, name, value, size: 0, binding: publicNames.has(name) ? 1 : 0, type: 0, section: 4 })
  }
  const relocations: CfObject['relocations'] = []
  for (let row = 0; row < 64; row++) {
    const at = 392 + row * 16, count = view.getUint16(at + 8)
    if (!count) { if (view.getUint32(at) || view.getUint32(at + 4)) fail('has pointers in an absent catalog entry'); continue }
    for (const offset of [at, at + 4]) {
      const addend = view.getUint32(offset) - base
      if (addend < 1416 || addend > bytes.length) fail('has an invalid catalog package pointer')
      relocations.push({ section: 4, offset, symbol: 1, type: 1, addend }); view.setUint32(offset, 0)
    }
  }
  return { flags, sections, symbols, relocations }
}
