// SPDX-License-Identifier: GPL-3.0-or-later
// The .elemod linker: format-1 whole builds and format-2 linkable mods -> one patched main OS image.
// Semantics follow elekloader's format and linker (docs/FORMAT.md, link.py, elemod.py; GPL-2.0-or-later, by irpina)
// so mods built for the core interface link unchanged. A mod carries only its author's bytes and hashes of the stock
// bytes it expects; "stock" parts are copied from the owner's own, hash-checked image. No firmware is embedded here.
import { sha256Hex } from './hash.ts'
import { PCREL, decodeColdFire, readerAt, wholeInstructions } from './coldfire-isa.ts'
import type { ElemodMachine } from './ele3.ts'
import * as store from '../../../vendor/elekloader/kit/src/store.ts'
import { ModError as KitModError } from '../../../vendor/elekloader/kit/src/elemod.ts'

export class ModError extends Error {}

export type LinkRelease = { version: string; syxSha256: string; mainSha256: string; mainLength: number }
export type LinkDevice = {
  key: string; machine: ElemodMachine; name: string; sysexId: number; mainLoad: number; releases: LinkRelease[]
  areas: Record<string, [number, number]>; ddr: [number, number]; sramCode: [number, number]; fastTable: string; protected: [number, number, string][]
}

// Facts from public research (elekloader device profiles): where mods may run and which releases exist.
export const LINK_DEVICES: LinkDevice[] = [
  {
    key: 'digitakt-mk1', machine: 'digitakt', name: 'Digitakt mk1', mainLoad: 0x40000400,
    sysexId: 0x0a,
    releases: [
      { version: '1.53', syxSha256: '9bdd44bb6102fb25c143cfab97bc92b7a89c463f795d3112dce89771e29bcc92', mainSha256: '4b47a9507758ca5669ca02ab2c0374d2c04c98aece445408295cc1dcb265c5df', mainLength: 2475584 },
      { version: '1.54', syxSha256: 'f78ba80fa7b1da5fb0e1ff61ad61e9e71aafe79f4364fc49679f3651353e3cf6', mainSha256: '5c58bf9e3949ef09977c5fc007a61e8d026931f67f1621238379dfb8ee4d31a2', mainLength: 2479680 },
    ],
    areas: { ddr: [0x47be0000, 0x47c00000], 'sram-tail': [0x8000f700, 0x80010000], 'sram-block': [0x80003360, 0x80008000] },
    ddr: [0x47be0000, 0x47c00000], sramCode: [0x8000f700, 0x80010000], fastTable: 'fa_copies', protected: [],
  },
  {
    key: 'digitone-mk1', machine: 'digitone', name: 'Digitone mk1', mainLoad: 0x40000400,
    sysexId: 0x0d,
    releases: [
      { version: '1.43', syxSha256: 'c5a54cc05b921f2e4bd814834c5365c2a5aa01d7772a9a2961fac1c3095bf9aa', mainSha256: '3831a477a2a22befb23c42e47e782853da49566ef5d0a1767fcf6c30e6767414', mainLength: 2732208 },
      { version: '1.44', syxSha256: 'd4f200d04484333d82822db7744e6484d0def8f2db8ddf55ee2b780cc13c9659', mainSha256: 'fce648a97c6c5d93b961732e8f8db6b02e0820c6d344c7e2131fa05a4b3168e4', mainLength: 2736304 },
    ],
    areas: { ddr: [0x47be0000, 0x47c00000] },
    ddr: [0x47be0000, 0x47c00000], sramCode: [0, 0], fastTable: '', protected: [],
  },
  {
    key: 'digitakt-mk2', machine: 'digitakt-ii', name: 'Digitakt II', sysexId: 0x14, mainLoad: 0x40000400,
    releases: [
      { version: '1.17', syxSha256: '26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5', mainSha256: 'a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964', mainLength: 3275616 },
    ],
    areas: { ddr: [0x47f00000, 0x47f40000], 'sram-tail': [0x8000f100, 0x80010000], 'sram-block': [0x80006e80, 0x80008000] },
    ddr: [0x47f00000, 0x47f40000], sramCode: [0x8000f100, 0x80010000], fastTable: 'core_fast', protected: [],
  },
  {
    key: 'analog-rytm-mk2', machine: 'analog-rytm-mkii', name: 'Analog Rytm MKII', sysexId: 0x0c, mainLoad: 0x40000400,
    releases: [
      { version: '1.74', syxSha256: 'cb0f99d620edde994fb860c0e79cc2464e427d06882828cfdfb00fc53700e123', mainSha256: '34cd0c4da8e4b810d1b25284475a99ea53821e2ab7d30a978bf15dc578251f3b', mainLength: 3005432 },
    ],
    areas: { ddr: [0x47be0000, 0x47c00000] },
    ddr: [0x47be0000, 0x47c00000], sramCode: [0, 0], fastTable: '', protected: [],
  },
]

type Part = { kind: 'hex'; bytes: Uint8Array } | { kind: 'stock'; addr: number; length: number }
type Reloc = { offset: number; type: 'abs32' | 'pc32' | 'pc16'; target: string; addend: number }
type Site = { addr: number; length: number; bytes: Uint8Array; kind: 'code' | 'data'; stockSha256: string; relocs: Reloc[] }
type Region = { name: string; lo: number; hi: number }
type SectionName = '.boot' | '.run' | '.fast' | '.bss'
type Section = { align: number; parts: Part[]; length: number } | { align: number; size: number }
type Contribution = { to: string; order: number; data: Uint8Array; relocs: Reloc[]; claims: [number, number][]; index: number }

export type ParsedMod = {
  format: 1 | 2; id: string; version: string; device: LinkDevice; release: LinkRelease
  sites: Site[]; regions: Region[]; names: string[]; requires: string[]; conflicts: string[]
  // format 1
  blob: { load: number; length: number; sha256: string; parts: Part[] } | null; shownVersion: string | null
  // format 2
  sections: Partial<Record<SectionName, Section>>; symbols: Map<string, [SectionName | 'abs', number]>; exports: string[]; imports: string[]; weak: Set<string>
  relocs: (Reloc & { section: SectionName })[]; collections: Map<string, number>; contribute: Contribution[]; copied: [number, number, number][]
  storage: [string, string, number][]   // mod storage fields: [symbol, scope, bits] (elekloader's store.ts)
}

const COMMON = ['elemod', 'dtmod', 'id', 'version', 'title', 'description', 'category', 'author', 'license', 'target', 'sites', 'resources', 'requires', 'conflicts', 'build', 'signature', 'notes']
const SECTIONS: SectionName[] = ['.boot', '.run', '.fast', '.bss']
const LINKER_SYMBOLS = new Set(['__run_load', '__run_start', '__run_words', '__bss_start', '__bss_end', '__bss_words'])
const FAST_ENTRY = 16

const hex32 = (value: number) => '0x' + value.toString(16).padStart(8, '0')
const align = (value: number, to: number) => Math.ceil(value / to) * to
function int(value: unknown, what: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^(0x[0-9a-fA-F]+|\d+)$/.test(value.trim())) return Number(value.trim())
  throw new ModError(what + ': ' + JSON.stringify(value) + ' is not a number')
}
function hex(value: unknown, what: string): Uint8Array {
  if (typeof value !== 'string' || value.length % 2 || !/^[0-9a-fA-F]*$/.test(value)) throw new ModError(what + ': not hex')
  return Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16))
}
const sizeOf = (section: Section | undefined) => !section ? 0 : 'size' in section ? section.size : section.length
const imageEnd = (mod: Pick<ParsedMod, 'device' | 'release'>) => mod.device.mainLoad + mod.release.mainLength

export function resolveTarget(target: unknown, name: string, devices: readonly LinkDevice[] = LINK_DEVICES): { device: LinkDevice; release: LinkRelease } {
  const value = (target ?? {}) as Record<string, unknown>
  const device = devices.find(entry => entry.key === value.device)
  const release = device?.releases.find(entry => entry.syxSha256 === value.syx_sha256 || (entry.version === value.os && entry.mainSha256 === value.section3_sha256))
  if (!device || !release) throw new ModError(name + ': made for firmware Modwerk does not know (' + String(value.device) + ' ' + String(value.os) + ')')
  return { device, release }
}

function parseParts(parts: unknown, what: string, device: LinkDevice, release: LinkRelease): Part[] {
  const lo = device.mainLoad, hi = lo + release.mainLength
  return (Array.isArray(parts) ? parts : []).map(part => {
    if (Array.isArray(part) && part[0] === 'hex' && part.length === 2) return { kind: 'hex', bytes: hex(part[1], what + ' part') }
    if (Array.isArray(part) && part[0] === 'stock' && part.length === 3) {
      const addr = int(part[1], what + ' part'), length = int(part[2], what + ' part')
      if (addr < lo || addr + length > hi || length <= 0) throw new ModError(what + ': a part copies ' + hex32(addr) + ' +' + length + ', outside the image')
      return { kind: 'stock', addr, length }
    }
    throw new ModError(what + ': bad part ' + JSON.stringify(part))
  })
}
function partsBytes(parts: Part[], image: Uint8Array, device: LinkDevice): Uint8Array {
  const chunks = parts.map(part => part.kind === 'hex' ? part.bytes : image.subarray(part.addr - device.mainLoad, part.addr - device.mainLoad + part.length))
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}
function parseReloc(entry: unknown, what: string, limit: number): Reloc {
  if (!Array.isArray(entry) || entry.length !== 4) throw new ModError(what + ': bad relocation ' + JSON.stringify(entry))
  const [offsetValue, type, target, addendValue] = entry, offset = int(offsetValue, what)
  if (!['abs32', 'pc32', 'pc16'].includes(type) || offset < 0 || offset + (type === 'pc16' ? 2 : 4) > limit) throw new ModError(what + ': bad relocation ' + JSON.stringify(entry))
  return { offset, type, target: String(target), addend: int(addendValue, what) }
}
function parseSites(doc: Record<string, unknown>, name: string, device: LinkDevice, release: LinkRelease, relocs: boolean): Site[] {
  const lo = device.mainLoad, hi = lo + release.mainLength
  return ((doc.sites as Record<string, unknown>[]) ?? []).map((site, index) => {
    const what = name + ' site ' + index, addr = int(site.addr, what), length = int(site.len, what), bytes = hex(site.new, what)
    if (bytes.length !== length || length <= 0) throw new ModError(what + ': "new" is not ' + length + ' bytes')
    if (addr < lo || addr + length > hi) throw new ModError(what + ': ' + hex32(addr) + ' +' + length + ' is outside the stock image')
    if (site.kind !== 'code' && site.kind !== 'data') throw new ModError(what + ': kind is "code" or "data"')
    if (typeof site.stock_sha256 !== 'string' || site.stock_sha256.length !== 64) throw new ModError(what + ': no stock_sha256')
    return { addr, length, bytes, kind: site.kind, stockSha256: site.stock_sha256.toLowerCase(), relocs: relocs ? ((site.relocs as unknown[]) ?? []).map(entry => parseReloc(entry, what, length)) : [] }
  })
}
function parseResources(doc: Record<string, unknown>, name: string, device: LinkDevice): { regions: Region[]; names: string[] } {
  const resources = (doc.resources ?? {}) as Record<string, unknown>
  const regions = ((resources.regions as Record<string, unknown>[]) ?? []).map(region => {
    const lo = int(region.lo, name + ' region'), hi = int(region.hi, name + ' region')
    if (!(lo < hi)) throw new ModError(name + ': empty region ' + JSON.stringify(region))
    if (!Object.values(device.areas).some(([a, z]) => a <= lo && hi <= z)) throw new ModError(name + ': region ' + String(region.name) + ' ' + hex32(lo) + '-' + hex32(hi) + ' is outside every free area')
    return { name: String(region.name ?? '?'), lo, hi }
  })
  return { regions, names: ((resources.names as unknown[]) ?? []).map(String) }
}

/** A .elemod document (JSON) -> a validated mod. */
export function parseElemod(doc: Record<string, unknown>, name = '<mod>', devices: readonly LinkDevice[] = LINK_DEVICES): ParsedMod {
  const format = (doc.elemod ?? doc.dtmod) as number
  if (format !== 1 && format !== 2) throw new ModError(name + ': not a .elemod file')
  const allowed = format === 1 ? [...COMMON, 'ele3_version', 'blob'] : [...COMMON, 'sections', 'symbols', 'exports', 'imports', 'weak', 'relocs', 'collections', 'contribute', 'copied', 'storage']
  const extra = Object.keys(doc).filter(key => !allowed.includes(key))
  if (extra.length) throw new ModError(name + ': unknown fields ' + extra.sort().join(', '))
  for (const key of format === 1 ? ['id', 'version', 'target', 'sites'] : ['id', 'version', 'target', 'sections']) if (!(key in doc)) throw new ModError(name + ': no "' + key + '"')
  const { device, release } = resolveTarget(doc.target, name, devices)
  const mod: ParsedMod = {
    format, id: String(doc.id), version: String(doc.version), device, release, sites: [], ...parseResources(doc, name, device),
    requires: ((doc.requires as unknown[]) ?? []).map(String), conflicts: ((doc.conflicts as unknown[]) ?? []).map(String),
    blob: null, shownVersion: null, sections: {}, symbols: new Map(), exports: [], imports: [], weak: new Set(), relocs: [], collections: new Map(), contribute: [], copied: [], storage: [],
  }
  if (format === 1) {
    mod.sites = parseSites(doc, name, device, release, false)
    if (doc.ele3_version !== undefined) {
      if (typeof doc.ele3_version !== 'string' || doc.ele3_version.length !== 4) throw new ModError(name + ': ele3_version is exactly 4 ASCII characters on the ' + device.name)
      mod.shownVersion = doc.ele3_version
    }
    const blob = doc.blob as Record<string, unknown> | undefined
    if (blob) {
      const load = int(blob.load, name + ' blob'), length = int(blob.len, name + ' blob'), parts = parseParts(blob.parts, name + ' blob', device, release)
      const total = parts.reduce((sum, part) => sum + (part.kind === 'hex' ? part.bytes.length : part.length), 0)
      if (total !== length) throw new ModError(name + ': blob parts make ' + total + ' bytes, not ' + length)
      if (length > device.ddr[1] - device.ddr[0]) throw new ModError(name + ': blob of ' + length + ' bytes is over the ' + (device.ddr[1] - device.ddr[0]) + ' the ' + device.name + ' allows')
      mod.blob = { load, length, sha256: String(blob.sha256 ?? '').toLowerCase(), parts }
    }
    return mod
  }
  for (const [section, value] of Object.entries(doc.sections as Record<string, Record<string, unknown>>)) {
    if (!SECTIONS.includes(section as SectionName)) throw new ModError(name + ': unknown section ' + section)
    const sectionAlign = int(value.align ?? 4, name)
    if (sectionAlign < 1 || sectionAlign & (sectionAlign - 1) || sectionAlign > 4096) throw new ModError(name + ' ' + section + ': alignment ' + sectionAlign + ' (a power of two up to 4096)')
    if (section === '.bss') { mod.sections['.bss'] = { align: sectionAlign, size: int(value.size, name) }; continue }
    const parts = parseParts(value.parts, name + ' ' + section, device, release)
    const length = parts.reduce((sum, part) => sum + (part.kind === 'hex' ? part.bytes.length : part.length), 0)
    if (value.len !== undefined && int(value.len, name) !== length) throw new ModError(name + ' ' + section + ': parts make ' + length + ' bytes, not ' + String(value.len))
    mod.sections[section as SectionName] = { align: sectionAlign, parts, length }
  }
  for (const [symbol, value] of Object.entries((doc.symbols ?? {}) as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length !== 2) throw new ModError(name + ': symbol ' + symbol)
    if (value[0] !== 'abs' && !(value[0] in mod.sections)) throw new ModError(name + ': symbol ' + symbol + ' in a section it lacks (' + value[0] + ')')
    mod.symbols.set(symbol, [value[0], int(value[1], name)])
  }
  mod.exports = ((doc.exports as unknown[]) ?? []).map(String)
  for (const symbol of mod.exports) if (!mod.symbols.has(symbol)) throw new ModError(name + ': exports ' + symbol + ', which it does not define')
  mod.imports = ((doc.imports as unknown[]) ?? []).map(String)
  mod.weak = new Set(((doc.weak as unknown[]) ?? []).map(String))
  for (const symbol of mod.weak) if (!mod.imports.includes(symbol)) throw new ModError(name + ': a weak name it does not import')
  mod.relocs = ((doc.relocs as unknown[][]) ?? []).map(entry => {
    const [section, offsetValue, type, target, addend] = entry
    const offset = int(offsetValue, name), container = mod.sections[section as SectionName]
    if (!container || section === '.bss') throw new ModError(name + ': relocation in ' + section)
    if (!['abs32', 'pc32', 'pc16'].includes(type as string)) throw new ModError(name + ': relocation type ' + type)
    if (offset < 0 || offset + (type === 'pc16' ? 2 : 4) > sizeOf(container)) throw new ModError(name + ': relocation at ' + section + '+' + offset + ' is outside it')
    const targetText = String(target)
    if (!(targetText === 'abs' || targetText.startsWith('sym:') || targetText.startsWith('sec:'))) throw new ModError(name + ': relocation target ' + targetText)
    return { section: section as SectionName, offset, type: type as Reloc['type'], target: targetText, addend: int(addend, name) }
  })
  mod.sites = parseSites(doc, name, device, release, true)
  for (const [table, value] of Object.entries((doc.collections ?? {}) as Record<string, Record<string, unknown>>)) {
    const entry = int(value.entry, name)
    if (entry <= 0 || entry % 4) throw new ModError(name + ': table ' + table + ' entry size ' + entry)
    mod.collections.set(table, entry)
  }
  mod.contribute = ((doc.contribute as Record<string, unknown>[]) ?? []).map((value, index) => {
    const what = name + ' contribution ' + index, data = hex(value.data, what)
    return { to: String(value.to), order: int(value.order ?? 50, what), data, relocs: ((value.relocs as unknown[]) ?? []).map(entry => parseReloc(entry, what, data.length)), claims: ((value.claims as unknown[][]) ?? []).map(([a, b]) => [int(a, what), int(b, what)] as [number, number]), index }
  })
  mod.copied = ((doc.copied as Record<string, unknown>[]) ?? []).map(value => [int(value.lo, name), int(value.hi, name), int(value.to, name)] as [number, number, number])
  mod.storage = storeCall(() => store.parseDecls(doc), name + ': ')
  return mod
}

/** elekloader's store.ts throws its own ModError: the same message, as this linker's. */
function storeCall<T>(run: () => T, prefix = ''): T {
  try { return run() } catch (error) { if (error instanceof KitModError) throw new ModError(prefix + error.message); throw error }
}

const label = (mod: ParsedMod) => mod.id + ' ' + mod.version
function overlaps<T extends [number, number, ...unknown[]]>(spans: T[]): [T, T][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]), out: [T, T][] = []
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && sorted[j][0] < sorted[i][1]; j++) out.push([sorted[i], sorted[j]])
  return out
}

async function commonChecks(mods: ParsedMod[], image: Uint8Array, spans: [number, number, ParsedMod, string][]): Promise<string[]> {
  const targets = new Set(mods.map(mod => mod.device.key + ' ' + mod.release.version))
  if (targets.size > 1) return ['the mods are for different firmware: ' + mods.map(mod => label(mod) + ' (' + mod.device.name + ' ' + mod.release.version + ')').join(', ')]
  const bad: string[] = [], ids = mods.map(mod => mod.id)
  for (const id of [...new Set(ids)].sort()) { const count = ids.filter(value => value === id).length; if (count > 1) bad.push('mod ' + id + ' is given ' + count + ' times') }
  for (const mod of mods) {
    for (const requirement of mod.requires) if (!ids.includes(requirement)) bad.push(label(mod) + ' requires ' + requirement)
    for (const conflict of mod.conflicts) if (ids.includes(conflict)) bad.push(label(mod) + ' conflicts with ' + conflict)
  }
  for (const [a, b] of overlaps(spans)) if (!(a[2] === b[2] && a[3] === b[3])) bad.push(label(a[2]) + ' ' + a[3] + ' and ' + label(b[2]) + ' ' + b[3] + ' overlap (' + hex32(b[0]) + '-' + hex32(Math.min(a[1], b[1])) + ')')
  const owner = new Map<string, ParsedMod>()
  for (const mod of mods) for (const name of mod.names) { const other = owner.get(name); if (other && other !== mod) bad.push(label(other) + ' and ' + label(mod) + ' both claim ' + name); owner.set(name, mod) }
  const device = mods[0].device
  for (const mod of mods) for (const site of mod.sites) for (const [lo, hi, why] of device.protected) if (site.addr < hi && lo < site.addr + site.length) bad.push(label(mod) + ' site ' + hex32(site.addr) + ' is inside ' + hex32(lo) + '-' + hex32(hi) + ', ' + why + ': protected on the ' + device.name)
  for (const mod of mods) for (const site of mod.sites) {
    const offset = site.addr - device.mainLoad
    if (await sha256Hex(image.subarray(offset, offset + site.length)) !== site.stockSha256) bad.push(label(mod) + ' site ' + hex32(site.addr) + ': the stock bytes are not the ones it expects')
    else if (site.kind === 'code') { const check = wholeInstructions(image, device.mainLoad, site.addr, site.length); if (!check.ok) bad.push(label(mod) + ' site ' + hex32(site.addr) + ': ' + check.note) }
  }
  return bad
}

/** The static checks for a set of format-2 mods. -> problems, empty when they combine. */
export async function checkLinkable(mods: ParsedMod[], image: Uint8Array): Promise<string[]> {
  const spans: [number, number, ParsedMod, string][] = []
  for (const mod of mods) {
    for (const site of mod.sites) spans.push([site.addr, site.addr + site.length, mod, 'site ' + hex32(site.addr)])
    for (const entry of mod.contribute) for (const [a, b] of entry.claims) spans.push([a, b, mod, entry.to + ' entry (claims ' + hex32(a) + '-' + hex32(b) + ')'])
  }
  const bad = await commonChecks(mods, image, spans)
  if (bad[0]?.startsWith('the mods are for different firmware')) return bad
  const device = mods[0].device
  const cores = mods.filter(mod => mod.sections['.boot'])
  if (cores.length !== 1) bad.unshift('exactly one mod must carry .boot (core); got ' + (cores.map(label).join(', ') || 'none'))
  const owner = new Map<string, ParsedMod>(), tables = new Map<string, [ParsedMod, number]>()
  for (const mod of mods) for (const symbol of mod.exports) { const other = owner.get(symbol); if (other) bad.push(label(other) + ' and ' + label(mod) + ' both export ' + symbol); owner.set(symbol, mod) }
  for (const mod of mods) for (const [table, entry] of mod.collections) {
    const other = tables.get(table)
    if (other) bad.push(label(other[0]) + ' and ' + label(mod) + ' both declare the table ' + table)
    if (owner.has(table)) bad.push('table ' + table + ' has the name of a symbol ' + label(owner.get(table)!) + ' exports')
    tables.set(table, [mod, entry])
  }
  const fields = new Map<string, ParsedMod | null>()   // mod storage: the linker defines these
  for (const mod of mods) for (const [symbol] of mod.storage) {
    const other = fields.get(symbol)
    if (other) bad.push(label(other) + ' and ' + label(mod) + ' both declare the storage field ' + symbol)
    else if (owner.has(symbol) || tables.has(symbol) || LINKER_SYMBOLS.has(symbol) || store.GEN_SYMS.includes(symbol)) bad.push(label(mod) + ': the storage field ' + symbol + ' has the name of a symbol or table')
    fields.set(symbol, mod)
  }
  if (tables.has(store.IDS_TABLE)) for (const symbol of store.GEN_SYMS) fields.set(symbol, null)
  for (const mod of mods) {
    for (const symbol of mod.imports) if (!(owner.has(symbol) || tables.has(symbol) || LINKER_SYMBOLS.has(symbol) || mod.weak.has(symbol) || (symbol.endsWith('_n') && tables.has(symbol.slice(0, -2))) || fields.has(symbol))) bad.push(label(mod) + ' imports ' + symbol + ', which no given mod exports')
    for (const entry of mod.contribute) {
      const table = tables.get(entry.to)
      if (!table) bad.push(label(mod) + ' adds to table ' + entry.to + ', which no given mod declares')
      else if (entry.data.length % table[1]) bad.push(label(mod) + ': an entry for ' + entry.to + ' is not ' + table[1] + ' bytes')
    }
    if (sizeOf(mod.sections['.fast']) && (!device.fastTable || !tables.has(device.fastTable))) bad.push(label(mod) + ' has .fast code, which needs the mod that declares ' + (device.fastTable || 'a .fast copy table'))
  }
  const regions: [number, number, ParsedMod | null, string][] = mods.flatMap(mod => mod.regions.map(region => [region.lo, region.hi, mod, 'region ' + region.name] as [number, number, ParsedMod, string]))
  if (device.sramCode[1] > device.sramCode[0]) regions.push([device.sramCode[0], device.sramCode[1], null, 'the .fast area'])
  for (const [a, b] of overlaps(regions)) bad.push((a[2] ? label(a[2]) : 'the linker') + ' ' + a[3] + ' and ' + (b[2] ? label(b[2]) : 'the linker') + ' ' + b[3] + ' overlap')
  return bad
}

export type Linked = { image: Uint8Array; order: string[]; map: Record<string, number>; tables: Record<string, [number, number, number]>; layout: { boot: [number, number]; runLoad: number; ddr: [number, number]; bss: [number, number]; fast: [number, number]; blobLength: number; ddrSpare: number; fastSpare: number }
  store: store.Lock | null; storeNotes: string[] }   // a core with mod storage: the new lockfile and what changed in it

/** Format-2 mods (exactly one core) and the stock main OS -> the patched image. lock: the build's mod-storage lockfile,
 * or null for a new one (a core that keeps mod storage, elekloader's store.ts). Throws ModError with every problem. */
export async function linkMods(mods: ParsedMod[], image: Uint8Array, lock: store.Lock | null = null): Promise<Linked> {
  if (!mods.length) throw new ModError('no mods')
  const { device, release } = mods[0]
  if (await sha256Hex(image) !== release.mainSha256) throw new ModError('the stock main OS is not ' + device.name + ' ' + release.version)
  const problems = await checkLinkable(mods, image)
  if (problems.length) throw new ModError('the mods do not combine:\n  ' + problems.join('\n  '))
  const end = imageEnd(mods[0]), [ddrBase, ddrEnd] = device.ddr, [fastBase, fastEnd] = device.sramCode
  const core = mods.find(mod => mod.sections['.boot'])!
  const order = [core, ...mods.filter(mod => mod !== core).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))]
  const tables = new Map<string, [ParsedMod, number]>()
  for (const mod of order) for (const [table, entry] of mod.collections) tables.set(table, [mod, entry])
  const entries = new Map<string, [number, string, number, ParsedMod, Contribution][]>([...tables.keys()].map(table => [table, []]))
  for (const mod of order) for (const entry of mod.contribute) entries.get(entry.to)!.push([entry.order, mod.id, entry.index, mod, entry])
  // mod storage: the fields' places from the lockfile, as symbols and the IDs' table
  const keeps = core.imports.includes(store.GEN_SYMS[0])
  const decls: store.Decl[] = order.flatMap(mod => mod.storage.map(([symbol, scope, bits]) => [mod.id, symbol, scope, bits] as store.Decl))
  let newLock: store.Lock | null = null, storeNotes: string[] = [], storeSymbols = new Map<string, number>()
  if (decls.length && !keeps) {
    const users = [...new Set(decls.map(decl => decl[0]))].sort()
    throw new ModError(users.join(', ') + ' declare' + (users.length === 1 ? 's' : '') + ' mod storage, which ' + label(core) + ' does not keep')
  }
  if (keeps) {
    if (!tables.has(store.IDS_TABLE)) throw new ModError(label(core) + ' imports ' + store.GEN_SYMS[0] + ' but declares no table ' + store.IDS_TABLE)
    ;[newLock, storeNotes] = storeCall(() => store.allocate(lock, decls, device.key, core.version))
    let ids: Uint8Array[]
    ;[storeSymbols, ids] = store.symbols(newLock)
    const taken = new Set(order.flatMap(mod => mod.exports))
    for (const name of storeSymbols.keys()) if (taken.has(name) || LINKER_SYMBOLS.has(name)) throw new ModError('the storage field ' + name + ' has the name of a symbol a mod exports')
    ids.forEach((data, index) => entries.get(store.IDS_TABLE)!.push([-1, '', index, core, { to: store.IDS_TABLE, order: -1, data, relocs: [], claims: [], index }]))
  }
  for (const list of entries.values()) list.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || a[2] - b[2])
  const fastMods = order.filter(mod => sizeOf(mod.sections['.fast']))
  const tableLength = (table: string) => entries.get(table)!.reduce((sum, entry) => sum + entry[4].data.length, 0) + (table === device.fastTable ? FAST_ENTRY * fastMods.length : 0) + tables.get(table)![1]

  const base = new Map<string, number>(), key = (mod: ParsedMod, section: SectionName) => mod.id + ' ' + section
  const bootLength = sizeOf(core.sections['.boot'])
  base.set(key(core, '.boot'), end)
  let at = ddrBase
  for (const mod of order) if (sizeOf(mod.sections['.run'])) { at = align(at, Math.max(4, mod.sections['.run']!.align)); base.set(key(mod, '.run'), at); at += sizeOf(mod.sections['.run']) }
  const tableAt = new Map<string, number>()
  for (const table of [...tables.keys()].sort()) { at = align(at, 4); tableAt.set(table, at); at += tableLength(table) }
  let fastAt = fastBase
  const fastLoad = new Map<string, number>()
  for (const mod of fastMods) {
    fastAt = align(fastAt, Math.max(4, mod.sections['.fast']!.align)); base.set(key(mod, '.fast'), fastAt)
    at = align(at, 4); fastLoad.set(mod.id, at)
    const size = align(sizeOf(mod.sections['.fast']), 4); fastAt += size; at += size
  }
  const runEnd = align(at, 4)
  at = runEnd
  for (const mod of order) if (sizeOf(mod.sections['.bss'])) { at = align(at, Math.max(4, mod.sections['.bss']!.align)); base.set(key(mod, '.bss'), at); at += sizeOf(mod.sections['.bss']) }
  const bssEnd = align(at, 4)
  if (bssEnd > ddrEnd) throw new ModError('the mods need RAM to ' + hex32(bssEnd) + ', past ' + hex32(ddrEnd) + ' (' + (bssEnd - ddrEnd) + ' bytes over)')
  if (fastAt > fastEnd) throw new ModError('.fast code needs SRAM to ' + hex32(fastAt) + ', past ' + hex32(fastEnd))
  const runLoad = align(end + bootLength, 16)

  const local = new Map<string, number>(), global = new Map<string, number>()
  for (const mod of order) for (const [symbol, [section, offset]] of mod.symbols) {
    const value = section === 'abs' ? offset : base.get(key(mod, section))! + offset
    local.set(mod.id + ':' + symbol, value)
    if (mod.exports.includes(symbol)) global.set(symbol, value)
  }
  for (const table of tables.keys()) { global.set(table, tableAt.get(table)!); global.set(table + '_n', tableLength(table) / tables.get(table)![1] - 1) }
  for (const [name, value] of storeSymbols) global.set(name, value)
  for (const [name, value] of Object.entries({ __run_load: runLoad, __run_start: ddrBase, __run_words: (runEnd - ddrBase) / 4, __bss_start: runEnd, __bss_end: bssEnd, __bss_words: (bssEnd - runEnd) / 4 })) global.set(name, value)
  const zero = global.get('core_zero')
  const resolve = (mod: ParsedMod, target: string, where: string): number => {
    if (target === 'abs') return 0
    const [kind, name] = [target.slice(0, 3), target.slice(4)]
    if (kind === 'sec') { const value = base.get(mod.id + ' ' + name); if (value === undefined) throw new ModError(label(mod) + ': ' + where + ' refers to its empty section ' + name); return value }
    if (mod.symbols.has(name) && local.has(mod.id + ':' + name)) return local.get(mod.id + ':' + name)!
    if (global.has(name)) return global.get(name)!
    if (mod.weak.has(name) && zero !== undefined) return zero
    throw new ModError(label(mod) + ': ' + where + ' refers to ' + name + ', which nothing defines')
  }
  const put = (buffer: Uint8Array, offset: number, type: Reloc['type'], value: number, pc: number, where: string) => {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    if (type === 'abs32') view.setUint32(offset, ((value % 0x100000000) + 0x100000000) % 0x100000000)
    else if (type === 'pc32') view.setInt32(offset, value - pc)
    else { const delta = value - pc; if (delta < -0x8000 || delta >= 0x8000) throw new ModError(where + ': a 16-bit PC-relative reference spans ' + delta + ' bytes'); view.setInt16(offset, delta) }
  }
  const content = new Map<string, Uint8Array>()
  for (const mod of order) {
    for (const section of ['.boot', '.run', '.fast'] as const) { const value = mod.sections[section]; if (value && 'parts' in value && value.length) content.set(key(mod, section), partsBytes(value.parts, image, device)) }
    for (const reloc of mod.relocs) { const where = reloc.section + '+0x' + reloc.offset.toString(16); put(content.get(key(mod, reloc.section))!, reloc.offset, reloc.type, resolve(mod, reloc.target, where) + reloc.addend, base.get(key(mod, reloc.section))! + reloc.offset, where) }
  }
  const tableBytes = new Map<string, Uint8Array>()
  for (const table of tables.keys()) {
    const chunks: Uint8Array[] = []
    let length = 0
    for (const [, , , mod, entry] of entries.get(table)!) {
      const data = entry.data.slice()
      for (const reloc of entry.relocs) put(data, reloc.offset, reloc.type, resolve(mod, reloc.target, 'an entry of ' + table) + reloc.addend, tableAt.get(table)! + length + reloc.offset, 'an entry of ' + table)
      chunks.push(data); length += data.length
    }
    if (table === device.fastTable) for (const mod of fastMods) {
      const row = new Uint8Array(FAST_ENTRY), view = new DataView(row.buffer)
      view.setUint32(0, fastLoad.get(mod.id)!); view.setUint32(4, base.get(key(mod, '.fast'))!); view.setUint32(8, align(sizeOf(mod.sections['.fast']), 4))
      chunks.push(row); length += FAST_ENTRY
    }
    chunks.push(new Uint8Array(tables.get(table)![1])); length += tables.get(table)![1]
    const buffer = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
    tableBytes.set(table, buffer)
  }
  const ddr = new Uint8Array(runEnd - ddrBase)
  for (const mod of order) {
    if (sizeOf(mod.sections['.run'])) ddr.set(content.get(key(mod, '.run'))!, base.get(key(mod, '.run'))! - ddrBase)
    if (fastLoad.has(mod.id)) ddr.set(content.get(key(mod, '.fast'))!, fastLoad.get(mod.id)! - ddrBase)
  }
  for (const table of tables.keys()) ddr.set(tableBytes.get(table)!, tableAt.get(table)! - ddrBase)
  const boot = content.get(key(core, '.boot')) ?? new Uint8Array()
  const blob = new Uint8Array(runLoad - end + ddr.length)
  blob.set(boot); blob.set(ddr, runLoad - end)
  const tail = newLock ? store.trailer(newLock) : new Uint8Array(0)
  const patched = new Uint8Array(image.length + blob.length + tail.length)
  patched.set(image)
  for (const mod of order) for (const site of mod.sites) {
    const bytes = site.bytes.slice()
    for (const reloc of site.relocs) put(bytes, reloc.offset, reloc.type, resolve(mod, reloc.target, 'site ' + hex32(site.addr)) + reloc.addend, site.addr + reloc.offset, 'site ' + hex32(site.addr))
    patched.set(bytes, site.addr - device.mainLoad)
  }
  patched.set(blob, image.length)
  patched.set(tail, image.length + blob.length)
  const bad = copiedRules(order, patched, device)
  for (const mod of order) for (const site of mod.sites) if (site.kind === 'code') { const check = wholeInstructions(patched, device.mainLoad, site.addr, site.length, 0); if (!check.ok) bad.push(label(mod) + ' site ' + hex32(site.addr) + ' after relocation: ' + check.note) }
  if (bad.length) throw new ModError('the linked mods break a rule:\n  ' + bad.join('\n  '))
  const map: Record<string, number> = Object.fromEntries([...local, ...global])
  return {
    image: patched, order: order.map(label), map,
    tables: Object.fromEntries([...tables].map(([table, [, entry]]) => [table, [tableAt.get(table)!, tableLength(table) / entry - 1, entry]])),
    layout: { boot: [end, end + bootLength], runLoad, ddr: [ddrBase, runEnd], bss: [runEnd, bssEnd], fast: [fastBase, fastAt], blobLength: blob.length, ddrSpare: ddrEnd - bssEnd, fastSpare: fastEnd - fastAt },
    store: newLock, storeNotes,
  }
}

/** Sites of other mods inside a copied block: code only, whole instructions, nothing PC-relative or branching. */
function copiedRules(mods: ParsedMod[], patched: Uint8Array, device: LinkDevice): string[] {
  const read = readerAt(patched, device.mainLoad), bad: string[] = []
  for (const owner of mods) for (const [lo, hi] of owner.copied) for (const mod of mods) {
    if (mod === owner) continue
    for (const site of mod.sites) {
      if (!((lo <= site.addr && site.addr < hi) || (lo < site.addr + site.length && site.addr + site.length <= hi))) continue
      if (site.kind !== 'code') { bad.push(label(mod) + ' site ' + hex32(site.addr) + ': data inside ' + label(owner) + '\'s copied block'); continue }
      let addr = site.addr
      while (addr < site.addr + site.length) {
        const instruction = decodeColdFire(read(addr), addr)
        if (instruction.flags & PCREL || ['bra', 'bcc', 'bsr'].includes(instruction.flow)) bad.push(label(mod) + ' site ' + hex32(site.addr) + ': ' + instruction.op + ' at ' + hex32(addr) + ' is PC-relative, inside ' + label(owner) + '\'s copied block')
        addr += instruction.length
      }
      if (addr !== site.addr + site.length) bad.push(label(mod) + ' site ' + hex32(site.addr) + ': its new bytes are not whole instructions')
    }
  }
  return bad
}

/** Format-1 mods (whole builds) -> the patched image. At most one blob, never combined with format-2 mods. */
export async function applyWholeBuilds(mods: ParsedMod[], image: Uint8Array): Promise<Uint8Array> {
  const { device, release } = mods[0]
  if (await sha256Hex(image) !== release.mainSha256) throw new ModError('the stock main OS is not ' + device.name + ' ' + release.version)
  const spans: [number, number, ParsedMod, string][] = []
  for (const mod of mods) {
    for (const site of mod.sites) spans.push([site.addr, site.addr + site.length, mod, 'site ' + hex32(site.addr)])
    if (mod.blob) spans.push([mod.blob.load, mod.blob.load + mod.blob.length, mod, 'blob'])
  }
  const bad = await commonChecks(mods, image, spans)
  for (const [a, b] of overlaps(mods.flatMap(mod => mod.regions.map(region => [region.lo, region.hi, mod, 'region ' + region.name] as [number, number, ParsedMod, string])))) bad.push(label(a[2]) + ' ' + a[3] + ' and ' + label(b[2]) + ' ' + b[3] + ' overlap')
  const blobs = mods.filter(mod => mod.blob)
  if (blobs.length > 1) bad.push('more than one whole build (' + blobs.map(label).join(', ') + ')')
  for (const mod of blobs) if (mod.blob!.load !== imageEnd(mod)) bad.push(label(mod) + ': its blob loads at ' + hex32(mod.blob!.load) + ', not the image end ' + hex32(imageEnd(mod)))
  if (bad.length) throw new ModError('the mods do not combine:\n  ' + bad.join('\n  '))
  const chunks: Uint8Array[] = [image.slice()]
  for (const mod of mods) for (const site of mod.sites) chunks[0].set(site.bytes, site.addr - device.mainLoad)
  for (const mod of blobs) {
    const bytes = partsBytes(mod.blob!.parts, image, device)
    if (await sha256Hex(bytes) !== mod.blob!.sha256) throw new ModError(label(mod) + ': the blob does not assemble to its sha256')
    chunks.push(bytes)
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}
