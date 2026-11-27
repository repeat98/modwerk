// SPDX-License-Identifier: GPL-3.0-or-later
// The linker: linkable module packages (format 2) into one patched main OS.
//
// A format-2 package is a relocatable object in JSON: its sections (.boot for the core only, .run, .fast, .bss), the
// symbols it defines and exports, what it imports (some weakly), relocations, sites with relocations of their own,
// the tables it declares and the entries it adds to other packages' tables, and its resources. A relocation target is
// "sym:NAME" (its own symbol, else another package's export, else, for a weak import, core_zero), "sec:NAME" or "abs".
//
// Where the main OS carries DSP code (the machine's dspPayloads), a package may carry DSP56300 code too: `.dsp.<tag>`
// sections of 24-bit little-endian words, and DSP tables (a collection with "space": "dsp.<tag>"). They go in the
// P words of that payload a package frees by claiming the area's name (dspAreas); a symbol there is a DSP word
// address, and a `dsp24` relocation writes one as three little-endian bytes.
//
// The order of every check, every layout step and every map below is part of the output: the same packages always
// link to the same bytes and the same map.
import { concat, sha } from './bytes.ts'
import { type Device, type Range, type Release, imageEnd, linkable } from './devices.ts'
import { pSpan } from './dsp-payloads.ts'
import {
  type AnyMod, type Part, type Region, type Site, type Span, COMMON, ModError, RSIZE, cmpVersions, commonChecks, formatOf, get,
  hexBytes, insnCheck, int, isDict, iter, overlaps, parseNeedsCore, parseParts, parseResources, parseSites, partsBytes, partsLen,
  pyEq, resolveTarget, summarize, unpack,
} from './module-package.ts'
import { PCREL, decodeColdFire, readerAt } from './codec/coldfire-kit.ts'
import { AttributeError, KeyError, PyException, ValueError, hex8, pyType, repr, str } from './py.ts'
import * as store from './store.ts'

/** Python's struct.error. */
export class StructError extends PyException {}

export const FORMAT2 = 2
const SECTIONS = ['.boot', '.run', '.fast', '.bss']
const RTYPES = ['abs32', 'pc32', 'pc16', 'dsp24']
const DSP_PREFIX = '.dsp.'
/** A .fast copy entry: source, destination, length, 0. */
const FAST_ENTRY = 16
const MAX_ALIGN = 4096
const LINKER_SYMS = new Set(['__run_load', '__run_start', '__run_words', '__bss_start', '__bss_end', '__bss_words'])
const PACKAGE_FIELDS = new Set(['sections', 'symbols', 'exports', 'imports', 'weak', 'relocs', 'collections', 'contribute', 'copied', 'storage'])

const align = (v: number, a: number) => Math.ceil(v / a) * a
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const hexWidth = (v: number, w: number) => v.toString(16).padStart(w, '0')
const u32 = (v: number) => ((v % 2 ** 32) + 2 ** 32) % 2 ** 32

/** The payload tag of a DSP section name, or null. */
function dspTag(dev: Device, section: string): string | null {
  if (!section.startsWith(DSP_PREFIX)) return null
  const tag = section.slice(DSP_PREFIX.length)
  return Object.hasOwn(dev.dspPayloads, tag) ? tag : null
}

/** d.items() of a JSON dict, failing as Python does otherwise. */
function items(d: unknown): [string, any][] {
  if (!isDict(d)) throw new AttributeError(`'${pyType(d)}' object has no attribute 'items'`)
  return Object.entries(d)
}

type Sec = { align: number; parts?: Part[]; len?: number; size?: number }
export type Contribution = { to: string; order: number; data: Uint8Array; relocs: [number, string, string, number][]; claims: [number, number][]; i: number }

/** A loaded, validated format-2 package. */
export class Mod2 implements AnyMod {
  readonly format = 2
  doc: Record<string, any>
  name: string
  sha256: string | null
  id: string
  version: string
  dev: Device
  rel: Release
  sections: Map<string, Sec>
  symbols: Map<string, [string, number]>
  exports: string[]
  imports: string[]
  weak: Set<string>
  relocs: [string, number, string, string, number][]
  sites: Site[]
  collections: Map<string, number>
  /** name -> [payload tag, head, end]. */
  dspTables: Map<string, [string, Uint8Array, Uint8Array]>
  contribute: Contribution[]
  copied: [number, number, number][]
  storage: [string, string, number][]
  regions: Region[]
  names: string[]
  needsCore: string | null
  requires: string[]
  conflicts: string[]
  blob = null

  constructor(doc: Record<string, any>, name = '<mod>', raw: Uint8Array | null = null) {
    this.doc = doc
    this.name = name
    this.sha256 = raw ? sha(raw) : null
    if (!pyEq(formatOf(doc), FORMAT2)) throw new ModError(`${name}: not a format-2 module package`)
    const unknown = Object.keys(doc).filter(k => !COMMON.has(k) && !PACKAGE_FIELDS.has(k)).sort()
    if (unknown.length) throw new ModError(`${name}: unknown fields ${repr(unknown)}`)
    for (const k of ['id', 'version', 'target', 'sections']) if (!(k in doc)) throw new ModError(`${name}: no "${k}"`)
    this.id = str(doc.id)
    this.version = str(doc.version)
    ;[this.dev, this.rel] = resolveTarget(doc, name)

    this.sections = new Map()
    for (const [section, d] of items(doc.sections)) {
      const tag = dspTag(this.dev, section)
      if (!SECTIONS.includes(section) && tag === null) throw new ModError(`${name}: unknown section ${section}`)
      if (tag !== null) { // DSP words: no alignment, whole words
        const parts = parseParts(get(d, 'parts', []), name + ' ' + section, this.dev, this.rel)
        const n = partsLen(parts)
        if (n !== int(get(d, 'len', n), name) || n % 3) throw new ModError(`${name} ${section}: ${n} bytes, not whole 24-bit DSP words`)
        this.sections.set(section, { align: 1, parts, len: n })
        continue
      }
      const alignment = int(get(d, 'align', 4), name)
      if (alignment < 1 || alignment & (alignment - 1) || alignment > MAX_ALIGN) throw new ModError(`${name} ${section}: alignment ${alignment} (a power of two up to ${MAX_ALIGN})`)
      if (section === '.bss') {
        if (!('size' in d)) throw new KeyError(repr('size'))
        this.sections.set(section, { align: alignment, size: int(d.size, name) })
        continue
      }
      const parts = parseParts(get(d, 'parts', []), name + ' ' + section, this.dev, this.rel)
      const n = partsLen(parts)
      if (n !== int(get(d, 'len', n), name)) throw new ModError(`${name} ${section}: parts make ${n} bytes, not ${str(get(d, 'len'))}`)
      this.sections.set(section, { align: alignment, parts, len: n })
    }

    this.symbols = new Map()
    for (const [symbol, v] of items(get(doc, 'symbols', {}))) {
      if (!Array.isArray(v) || v.length !== 2) throw new ModError(`${name}: symbol ${symbol}`)
      if (v[0] !== 'abs' && !this.sections.has(v[0])) throw new ModError(`${name}: symbol ${symbol} in a section it lacks (${str(v[0])})`)
      const offset = int(v[1], name)
      this.symbols.set(symbol, [v[0], offset])
      if (dspTag(this.dev, v[0]) && offset % 3) throw new ModError(`${name}: DSP symbol ${symbol} is not at a whole word`)
    }
    this.exports = iter(get(doc, 'exports', [])).map(x => str(x))
    for (const x of this.exports) if (!this.symbols.has(x)) throw new ModError(`${name}: exports ${x}, which it does not define`)
    this.imports = iter(get(doc, 'imports', [])).map(x => str(x))
    this.weak = new Set(iter(get(doc, 'weak', [])).map(x => str(x)))
    if (![...this.weak].every(w => this.imports.includes(w))) throw new ModError(`${name}: a weak name it does not import`)

    this.relocs = []
    for (const r of iter(get(doc, 'relocs', []))) {
      const [section, rawOffset, type, target, addend] = unpack(r, 5)
      const offset = int(rawOffset, name)
      this.checkReloc(section, offset, type, target)
      this.relocs.push([section as string, offset, type as string, target as string, int(addend, name)])
    }
    this.sites = parseSites(doc, name, this.dev, this.rel, true)

    this.collections = new Map()
    this.dspTables = new Map()
    for (const [table, d] of items(get(doc, 'collections', {}))) {
      const entry = int(get(d, 'entry'), name)
      const space = get(d, 'space')
      if (space === null) {
        if (entry <= 0 || entry % 4) throw new ModError(`${name}: table ${table} entry size ${entry}`)
      } else {
        const tag = dspTag(this.dev, '.' + str(space))
        if (tag === null) throw new ModError(`${name}: table ${table} in space ${repr(space)}, which the ${this.dev.name} lacks`)
        const head = hexBytes(get(d, 'head', ''), name), end = hexBytes(get(d, 'end', ''), name)
        if (entry <= 0 || entry % 3 || head.length % 3 || end.length % 3) throw new ModError(`${name}: DSP table ${table} is not whole 24-bit words`)
        this.dspTables.set(table, [tag, head, end])
      }
      this.collections.set(table, entry)
    }

    this.contribute = []
    iter(get(doc, 'contribute', [])).forEach((c, i) => {
      const what = `${name} contribution ${i}`
      const data = hexBytes(get(c, 'data'), what)
      const relocs: [number, string, string, number][] = []
      for (const r of iter(get(c, 'relocs', []))) {
        const [rawOffset, type, target, addend] = unpack(r, 4)
        const offset = int(rawOffset, what)
        if (!RTYPES.includes(type as string) || offset < 0 || offset + (type === 'dsp24' ? 3 : 4) > data.length) throw new ModError(`${what}: bad relocation ${repr(r)}`)
        relocs.push([offset, type as string, target as string, int(addend, what)])
      }
      const claims = iter(get(c, 'claims', [])).map(pair => {
        const [a, b] = unpack(pair, 2)
        return [int(a, what), int(b, what)] as [number, number]
      })
      if (!isDict(c) || !('to' in c)) throw new KeyError(repr('to'))
      this.contribute.push({ to: str(c.to), order: int(get(c, 'order', 50), what), data, relocs, claims, i })
    })
    try {
      this.storage = store.parseDecls(doc)
    } catch (e) {
      if (e instanceof ModError) throw new ModError(`${name}: ${e.message}`)
      throw e
    }
    this.copied = iter(get(doc, 'copied', [])).map(c => {
      for (const k of ['lo', 'hi', 'to']) if (!isDict(c) || !(k in c)) throw new KeyError(repr(k))
      const block = c as Record<string, unknown>
      return [int(block.lo, name), int(block.hi, name), int(block.to, name)] as [number, number, number]
    })
    ;[this.regions, this.names] = parseResources(doc, name, this.dev)
    this.needsCore = parseNeedsCore(doc, name)
    this.requires = iter(get(doc, 'requires', [])).map(x => str(x))
    this.conflicts = iter(get(doc, 'conflicts', [])).map(x => str(x))
  }

  /** The names this package claims by what it contributes (the machine's slotClaims): a contribution to such a table
   * points at a descriptor whose long at a known offset is a sound slot, and the package claims that slot, so two
   * packages that store in one slot never link together. `image` is the stock main OS (a descriptor may be stock
   * bytes). A descriptor this cannot read (not the package's own bytes, or relocated there) claims nothing. */
  impliedNames(image: Uint8Array): string[] {
    const claimed: string[] = []
    for (const [table, at, count, prefix] of this.dev.slotClaims) {
      for (const c of this.contribute) {
        if (c.to !== table) continue
        for (const [offset, type, target, addend] of c.relocs) {
          if (offset !== 0 || type !== 'abs32') continue
          let place: [string, number]
          if (target.startsWith('sym:') && this.symbols.has(target.slice(4))) place = this.symbols.get(target.slice(4))!
          else if (target.startsWith('sec:')) place = [target.slice(4), 0]
          else continue
          const slot = this.long(place[0], place[1] + addend + at, image)
          const claim = `${prefix}:${slot}`
          if (slot !== null && slot >= 0 && slot < count && !claimed.includes(claim)) claimed.push(claim)
        }
      }
    }
    return claimed
  }

  /** The big-endian long at section+offset of this package's bytes, or null: a section without bytes, a long split
   * across parts, or one under a relocation. */
  private long(section: string, offset: number, image: Uint8Array): number | null {
    const d = this.sections.get(section)
    if (!d || !d.parts || d.len === undefined || offset < 0 || offset + 4 > d.len) return null
    if (this.relocs.some(([s, o, t]) => s === section && o < offset + 4 && offset < o + (RSIZE.get(t) ?? 0))) return null
    let at = 0
    for (const part of d.parts) {
      const n = part[0] === 'hex' ? part[1].length : part[2]
      if (at <= offset && offset + 4 <= at + n) {
        const [bytes, i] = part[0] === 'hex' ? [part[1], offset - at] : [image, part[1] - this.dev.mainLoad + offset - at]
        if (i < 0 || i + 4 > bytes.length) return null
        return ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
      }
      if (at < offset + 4 && offset < at + n) return null
      at += n
    }
    return null
  }

  private checkReloc(section: unknown, offset: number, type: unknown, target: unknown) {
    if (typeof section !== 'string' || !this.sections.has(section) || section === '.bss') throw new ModError(`${this.name}: relocation in ${str(section)}`)
    if (!RTYPES.includes(type as string)) throw new ModError(`${this.name}: relocation type ${str(type)}`)
    if ((type === 'dsp24') !== Boolean(dspTag(this.dev, section)) || (type === 'dsp24' && offset % 3)) throw new ModError(`${this.name}: a ${str(type)} relocation in ${section}`)
    if (offset < 0 || offset + RSIZE.get(type as string)! > this.sections.get(section)!.len!) throw new ModError(`${this.name}: relocation at ${section}+${offset} is outside it`)
    if (target !== 'abs' && typeof target !== 'string') throw new AttributeError(`'${pyType(target)}' object has no attribute 'startswith'`)
    if (!(target === 'abs' || target.startsWith('sym:') || target.startsWith('sec:'))) throw new ModError(`${this.name}: relocation target ${repr(target)}`)
  }

  label(): string { return `${this.id} ${this.version}` }

  size(section: string): number {
    const d = this.sections.get(section)
    if (!d) return 0
    return section === '.bss' ? d.size! : d.len!
  }

  /** The most of the linker's area this package can take with any set: .run and .bss with their alignment, its table
   * entries and each of its tables' zero entry, its .fast copy and that copy's entry, each rounded up to 4. A set
   * never needs more than the sum of its packages' bounds, so a builder can tell which core's area holds it. */
  ramBound(): number {
    let n = 0
    for (const section of ['.run', '.bss']) if (this.size(section)) n += align(this.size(section), 4) + Math.max(4, this.sections.get(section)!.align) - 4
    for (const c of this.contribute) n += align(c.data.length, 4)
    for (const entry of this.collections.values()) n += align(entry, 4)
    if (this.size('.fast')) n += align(this.size('.fast'), 4) + FAST_ENTRY
    return n
  }
}

/** The symbols a core may size its RAM reserve with (the machine's `reserve`): none when a package exports one,
 * as a core with a fixed reserve does. */
function reserveNames(dev: Device, exported: { has(k: string): boolean }): Set<string> {
  const names = dev.reserve ? Object.keys(dev.reserve[1]) : []
  return names.some(n => exported.has(n)) ? new Set() : new Set(names)
}

/** lo, hi, main OS address of P:lo, the package that frees it, the area's name. */
type Area = [number, number, number, Mod2, string]

/** The DSP areas the packages free, by the name a package claims: payload tag -> area, the first claimed per payload. */
export function dspAreas(mods: Mod2[], image: Uint8Array): Map<string, Area> {
  const dev = mods[0].dev, areas = new Map<string, Area>()
  for (const [tag, lo, hi, claim] of dev.dspAreas) {
    const owner = mods.find(m => m.names.includes(claim))
    if (owner !== undefined && !areas.has(tag)) areas.set(tag, [lo, hi, pSpan(image, dev, tag, lo, hi), owner, claim])
  }
  return areas
}

/** The payload tags a package's DSP sections and DSP tables need an area in. */
function dspNeeds(m: Mod2): Set<string> {
  const tags = new Set<string>()
  for (const section of m.sections.keys()) { const tag = dspTag(m.dev, section); if (tag) tags.add(tag) }
  for (const [tag] of m.dspTables.values()) tags.add(tag)
  return tags
}

const oneTarget = (mods: Mod2[]) => new Set(mods.map(m => m.dev.key + '\0' + m.rel.version)).size === 1

/** The checks that need no layout: the set's problems. */
export function check(mods: Mod2[], image: Uint8Array): string[] {
  const spans: Span<AnyMod>[] = []
  for (const m of mods) {
    for (const s of m.sites) spans.push([s.addr, s.addr + s.len, m, `site ${hex8(s.addr)}`])
    for (const c of m.contribute) for (const [a, b] of c.claims) spans.push([a, b, m, `${c.to} entry (claims ${hex8(a)}-${hex8(b)})`])
  }
  let areas = new Map<string, Area>()
  if (mods[0].dev.dspAreas.length && oneTarget(mods)) {
    areas = dspAreas(mods, image)
    for (const tag of [...areas.keys()].sort(order)) {
      const [lo, hi, at, owner, claim] = areas.get(tag)!
      spans.push([at, at + 3 * (hi - lo), owner, `DSP area ${claim} (payload ${tag} P:0x${hexWidth(lo, 4)}-0x${hexWidth(hi - 1, 4)})`])
    }
  }
  // the sound slots their parameters store in
  if (oneTarget(mods)) for (const m of mods) for (const claim of m.impliedNames(image)) if (!m.names.includes(claim)) m.names.push(claim)
  const problems = commonChecks(mods, image, spans)
  if (problems[0]?.startsWith('the mods are for different firmware')) return problems
  const dev = mods[0].dev
  if (!linkable(dev)) return [`the ${dev.name} has no linkable (format-2) mods yet: only whole builds (format 1) can be used on it`]
  const cores = mods.filter(m => m.sections.has('.boot'))
  if (cores.length !== 1) problems.unshift(`exactly one mod must carry .boot (core); got ${cores.length ? repr(cores.map(m => m.label())) : 'none'}`)
  else for (const m of mods) if (m.needsCore && cmpVersions(cores[0].version, m.needsCore) < 0) problems.push(`${m.label()} needs core ${m.needsCore} or newer, and this build has core ${cores[0].version}`)

  const exporter = new Map<string, Mod2>()
  for (const m of mods) for (const x of m.exports) {
    if (exporter.has(x)) problems.push(`${exporter.get(x)!.label()} and ${m.label()} both export ${x}`)
    exporter.set(x, m)
  }
  const tables = new Map<string, [Mod2, number]>()
  for (const m of mods) for (const [table, entry] of m.collections) {
    if (tables.has(table)) problems.push(`${tables.get(table)![0].label()} and ${m.label()} both declare the table ${table}`)
    if (exporter.has(table)) problems.push(`table ${table} has the name of a symbol ${exporter.get(table)!.label()} exports`)
    tables.set(table, [m, entry])
  }
  const sized = reserveNames(dev, exporter)
  // module storage fields: the linker defines these
  const fields = new Map<string, Mod2 | null>()
  for (const m of mods) for (const [sym] of m.storage) {
    if (fields.has(sym)) problems.push(`${fields.get(sym)!.label()} and ${m.label()} both declare the storage field ${sym}`)
    else if (exporter.has(sym) || tables.has(sym) || LINKER_SYMS.has(sym) || store.GEN_SYMS.includes(sym)) problems.push(`${m.label()}: the storage field ${sym} has the name of a symbol or table`)
    fields.set(sym, m)
  }
  if (tables.has(store.IDS_TABLE)) for (const x of store.GEN_SYMS) fields.set(x, null)

  for (const m of mods) {
    for (const x of m.imports) {
      const defined = exporter.has(x) || tables.has(x) || LINKER_SYMS.has(x) || sized.has(x) || m.weak.has(x) || (x.endsWith('_n') && tables.has(x.slice(0, -2))) || fields.has(x)
      if (!defined) problems.push(`${m.label()} imports ${x}, which no given mod exports`)
    }
    for (const c of m.contribute) {
      const table = tables.get(c.to)
      if (!table) { problems.push(`${m.label()} adds to table ${c.to}, which no given mod declares`); continue }
      if (c.data.length % table[1]) { problems.push(`${m.label()}: an entry for ${c.to} is not ${table[1]} bytes`); continue }
      const inDsp = table[0].dspTables.has(c.to)
      for (const [offset, type] of c.relocs) {
        if ((type === 'dsp24') !== inDsp || (inDsp && offset % 3))
          problems.push(`${m.label()}: an entry for ${c.to} has a ${type} relocation at +${offset}; ` + (inDsp ? "a DSP table's entries take dsp24, at whole words" : 'dsp24 is for DSP tables'))
      }
    }
    if (m.size('.fast') && (!dev.fastTable || !tables.has(dev.fastTable))) problems.push(`${m.label()} has .fast code, which needs the mod that declares ${dev.fastTable || 'a .fast copy table'}`)
    for (const tag of [...dspNeeds(m)].filter(t => !areas.has(t)).sort(order)) {
      const freers = dev.dspAreas.filter(a => a[0] === tag).map(a => a[3])
      problems.push(`${m.label()} has DSP code for payload ${tag}, which needs a mod that frees DSP memory there (one that claims ${freers.join(' or ') || `an area the ${dev.name} does not have`})`)
    }
  }
  const regions: Span<AnyMod>[] = mods.flatMap(m => m.regions.map((g): Span<AnyMod> => [g.lo, g.hi, m, 'region ' + g.name]))
  if (dev.sramCode[1] > dev.sramCode[0]) regions.push([dev.sramCode[0], dev.sramCode[1], null, 'the .fast area'])
  for (const [a, b] of overlaps(regions)) problems.push(`${a[2] ? a[2].label() : 'the linker'} ${a[3]} and ${b[2] ? b[2].label() : 'the linker'} ${b[3]} overlap`)
  return problems
}

/** Other packages' sites inside a copied block: no PC-relative operand or relative branch, whole instructions. */
function copiedRules(mods: Mod2[], patched: Uint8Array, dev: Device): string[] {
  const problems: string[] = []
  const read = readerAt(patched, dev.mainLoad)
  for (const owner of mods) for (const [lo, hi] of owner.copied) for (const m of mods) {
    if (m === owner) continue
    for (const s of m.sites) {
      if (!((lo <= s.addr && s.addr < hi) || (lo < s.addr + s.len && s.addr + s.len <= hi))) continue
      if (s.kind !== 'code') { problems.push(`${m.label()} site ${hex8(s.addr)}: data inside ${owner.label()}'s copied block`); continue }
      let at = s.addr
      while (at < s.addr + s.len) {
        const ins = decodeColdFire(read(at), at)
        if (ins.flags & PCREL || ins.flow === 'bra' || ins.flow === 'bcc' || ins.flow === 'bsr') problems.push(`${m.label()} site ${hex8(s.addr)}: ${ins.op} at ${hex8(at)} is PC-relative, inside ${owner.label()}'s copied block`)
        at += ins.length
      }
      if (at !== s.addr + s.len) problems.push(`${m.label()} site ${hex8(s.addr)}: its new bytes are not whole instructions`)
    }
  }
  return problems
}

export type DspLayout = { area: [number, number]; used: [number, number]; name: string; sections: Record<string, number>; tables: Record<string, number> }

export type Layout = {
  boot: [number, number]; run_load: number; ddr: [number, number]; bss: [number, number]; fast: [number, number]
  blob_len: number; sections: Record<string, number>; ddr_spare: number; fast_spare: number; ddr_size: number; fast_size: number
  /** A core sized to the set: the pages it takes and where they end. */ reserve?: { units: number; end: number }
  /** In words: P addresses of each payload's area. */ dsp?: Record<string, DspLayout>
}

export type Linked = {
  image: Uint8Array
  order: string[]
  /** name -> address. */ map: Map<string, number>
  /** name -> [address, count, entry size]. */ tables: Map<string, [number, number, number]>
  layout: Layout
  /** A core with module storage: the new lockfile. */ store: store.Lock | null
  storeNotes: string[]
}

/** The linker's area for .run, tables and .bss with a core of this version. */
export function ddrFor(dev: Device, coreVersion: string): Range {
  let area = dev.ddr
  for (const [version, larger] of dev.coreDdr) if (cmpVersions(coreVersion, version) >= 0) area = larger
  return area
}

type Entry = [number, string, number, Mod2, Contribution]

/** The patched main OS, its map, tables and layout, and for a core with module storage the new lockfile (`lock`:
 * the build's lockfile, or null for a new one). Throws ModError. */
export function link(mods: Mod2[], image: Uint8Array, lock: store.Lock | null = null): Linked {
  if (!mods.length) throw new ModError('no mods')
  const { dev, rel } = mods[0]
  if (sha(image) !== rel.mainSha256) throw new ModError(`the stock main OS is not ${dev.name} ${rel.version}`)
  const problems = summarize(check(mods, image), mods)
  if (problems.length) throw new ModError('the mods do not combine:\n  ' + problems.join('\n  '))
  const end = imageEnd(dev, rel)
  const core = mods.filter(m => m.sections.has('.boot'))[0]
  const [ddrBase, ddrEnd] = ddrFor(dev, core.version)
  const [fastBase, fastEnd] = dev.sramCode
  const linked = [core, ...mods.filter(m => m !== core).sort((a, b) => order(a.id, b.id))]
  const tables = new Map<string, [Mod2, number]>()
  for (const m of linked) for (const [table, entry] of m.collections) tables.set(table, [m, entry])

  const entries = new Map<string, Entry[]>([...tables.keys()].map(t => [t, []]))
  for (const m of linked) for (const c of m.contribute) entries.get(c.to)!.push([c.order, m.id, c.i, m, c])

  // module storage: the fields' places from the lockfile, as symbols and the IDs' table
  const keepsStorage = core.imports.includes(store.GEN_SYMS[0])
  const decls: store.Decl[] = linked.flatMap(m => m.storage.map(([sym, scope, bits]) => [m.id, sym, scope, bits] as store.Decl))
  let newLock: store.Lock | null = null, storeNotes: string[] = [], storeSyms = new Map<string, number>()
  if (decls.length && !keepsStorage) {
    const users = [...new Set(decls.map(d => d[0]))].sort(order)
    throw new ModError(`${users.join(', ')} declare${users.length === 1 ? 's' : ''} mod storage, which ${core.label()} does not keep`)
  }
  if (keepsStorage) {
    if (!tables.has(store.IDS_TABLE)) throw new ModError(`${core.label()} imports ${store.GEN_SYMS[0]} but declares no table ${store.IDS_TABLE}`)
    ;[newLock, storeNotes] = store.allocate(lock, decls, dev.key, core.version)
    const [symbols, ids] = store.symbols(newLock)
    storeSyms = symbols
    const exported = new Set(linked.flatMap(m => m.exports))
    for (const name of storeSyms.keys()) if (exported.has(name) || LINKER_SYMS.has(name)) throw new ModError(`the storage field ${name} has the name of a symbol a mod exports`)
    ids.forEach((data, i) => entries.get(store.IDS_TABLE)!.push([-1, '', i, core, { to: store.IDS_TABLE, order: -1, data, relocs: [], claims: [], i }]))
  }
  const fastMods = linked.filter(m => m.size('.fast'))
  for (const list of entries.values()) list.sort((a, b) => a[0] - b[0] || order(a[1], b[1]) || a[2] - b[2])
  const dspTables = new Map<string, [string, Uint8Array, Uint8Array]>()
  for (const m of linked) for (const [table, t] of m.dspTables) dspTables.set(table, t)
  const entryBytes = (table: string) => entries.get(table)!.reduce((n, e) => n + e[4].data.length, 0)
  const tableLen = (table: string) => {
    const dsp = dspTables.get(table)
    if (dsp) return dsp[1].length + entryBytes(table) + dsp[2].length // a DSP table: its head, its entries, its end
    return entryBytes(table) + (table === dev.fastTable ? FAST_ENTRY * fastMods.length : 0) + tables.get(table)![1] // and the zero entry
  }
  const tableCount = (table: string) => (dspTables.has(table) ? Math.floor(entryBytes(table) / tables.get(table)![1]) : Math.floor(tableLen(table) / tables.get(table)![1]) - 1)

  // layout: .run, then the tables, then the .fast load copies, in the linker's area; .fast in SRAM; then .bss
  const base = new Map<string, number>()
  const key = (id: string, section: string) => id + '\0' + section
  const bootLen = core.size('.boot')
  base.set(key(core.id, '.boot'), end)
  let at = ddrBase
  for (const m of linked) if (m.size('.run')) {
    at = align(at, Math.max(4, m.sections.get('.run')!.align))
    base.set(key(m.id, '.run'), at)
    at += m.size('.run')
  }
  const tableAt = new Map<string, number>()
  for (const table of [...tables.keys()].sort(order)) {
    if (dspTables.has(table)) continue
    at = align(at, 4)
    tableAt.set(table, at)
    at += tableLen(table)
  }
  let fastAt = fastBase
  const fastLoad = new Map<string, number>()
  for (const m of fastMods) {
    fastAt = align(fastAt, Math.max(4, m.sections.get('.fast')!.align))
    base.set(key(m.id, '.fast'), fastAt)
    at = align(at, 4)
    fastLoad.set(m.id, at)
    const n = align(m.size('.fast'), 4)
    fastAt += n
    at += n
  }
  const runEnd = align(at, 4)
  at = runEnd
  for (const m of linked) if (m.size('.bss')) {
    at = align(at, Math.max(4, m.sections.get('.bss')!.align))
    base.set(key(m.id, '.bss'), at)
    at += m.size('.bss')
  }
  const bssEnd = align(at, 4)
  if (bssEnd > ddrEnd) {
    const larger = dev.coreDdr.filter(([, a]) => a[1] - a[0] >= bssEnd - ddrBase)
    throw new ModError(`the mods need RAM to ${hex8(bssEnd)}, past ${hex8(ddrEnd)} (${bssEnd - ddrEnd} bytes over)` + (larger.length ? `; core ${larger[0][0]} or newer gives them ${larger[0][1][1] - larger[0][1][0]} bytes` : ''))
  }
  if (fastAt > fastEnd) throw new ModError(`.fast code needs SRAM to ${hex8(fastAt)}, past ${hex8(fastEnd)}`)
  const runLoad = align(end + bootLen, 16)

  // DSP: each payload's sections, then its tables, in the P words a package frees (in words)
  const areas = dev.dspAreas.length ? dspAreas(linked, image) : new Map<string, Area>()
  const dspAt = new Map<string, number>([...areas].map(([tag, a]) => [tag, a[0]]))
  const dspSections = new Map<string, string>() // key -> payload tag
  for (const m of linked) for (const section of m.sections.keys()) {
    const tag = dspTag(dev, section)
    if (!tag) continue
    if (!dspAt.has(tag)) throw new KeyError(repr(tag))
    base.set(key(m.id, section), dspAt.get(tag)!)
    dspSections.set(key(m.id, section), tag)
    dspAt.set(tag, dspAt.get(tag)! + Math.floor(m.size(section) / 3))
  }
  for (const table of [...dspTables.keys()].sort(order)) {
    const tag = dspTables.get(table)![0]
    if (!dspAt.has(tag)) throw new KeyError(repr(tag))
    tableAt.set(table, dspAt.get(tag)!)
    dspAt.set(tag, dspAt.get(tag)! + Math.floor(tableLen(table) / 3))
  }
  for (const [tag, [lo, hi, , , claim]] of areas) {
    const used = dspAt.get(tag)!
    if (used > hi) throw new ModError(`the DSP code for payload ${tag} needs P words to 0x${hexWidth(used, 5)}, past the ${hi - lo} words ${claim} frees (${used - hi} over)`)
  }

  // symbols; a DSP one is a word address: its section's base + its byte offset / 3
  const local = new Map<string, number>()
  const global = new Map<string, number>()
  const dspSymbols = new Set<string>() // key, or '\0' + name for a global
  for (const m of linked) for (const [name, [section, offset]] of m.symbols) {
    let value = offset
    if (m.sections.has(section) && dspTag(dev, section)) {
      value = base.get(key(m.id, section))! + Math.floor(offset / 3)
      dspSymbols.add(key(m.id, name))
    } else if (section !== 'abs') {
      const sectionBase = base.get(key(m.id, section))
      if (sectionBase === undefined) throw new KeyError(`(${repr(m.id)}, ${repr(section)})`)
      value = sectionBase + offset
    }
    local.set(key(m.id, name), value)
    if (m.exports.includes(name)) {
      global.set(name, value)
      if (dspSymbols.has(key(m.id, name))) dspSymbols.add('\0' + name)
    }
  }
  for (const table of tables.keys()) {
    global.set(table, tableAt.get(table)!)
    global.set(table + '_n', tableCount(table))
    if (dspTables.has(table)) dspSymbols.add('\0' + table)
  }
  for (const [name, value] of storeSyms) global.set(name, value)
  const linkerSymbols: [string, number][] = [['__run_load', runLoad], ['__run_start', ddrBase], ['__run_words', Math.floor((runEnd - ddrBase) / 4)],
    ['__bss_start', runEnd], ['__bss_end', bssEnd], ['__bss_words', Math.floor((bssEnd - runEnd) / 4)]]
  for (const [name, value] of linkerSymbols) global.set(name, value)
  // a reserve sized to the set, for a core that imports its symbols
  const sized = reserveNames(dev, global)
  let units: number | null = null
  if (linked.some(m => m.imports.some(x => sized.has(x)))) {
    const [unit, names] = dev.reserve!
    units = Math.max(1, Math.ceil((bssEnd - ddrBase) / unit))
    for (const name of Object.keys(names).sort(order)) {
      const [a, b] = names[name]
      global.set(name, u32(a + b * units))
    }
  }
  const zero = global.get('core_zero')

  const splitTarget = (target: string): [string, string] => {
    const colon = target.indexOf(':')
    if (colon < 0) throw new ValueError('not enough values to unpack (expected 2, got 1)')
    return [target.slice(0, colon), target.slice(colon + 1)]
  }
  const resolve = (m: Mod2, target: string, where: string): number => {
    if (target === 'abs') return 0
    const [kind, name] = splitTarget(target)
    if (kind === 'sec') {
      const sectionBase = base.get(key(m.id, name))
      if (sectionBase === undefined) throw new ModError(`${m.label()}: ${where} refers to its empty section ${name}`)
      return sectionBase
    }
    if (local.has(key(m.id, name)) && m.symbols.has(name)) return local.get(key(m.id, name))!
    if (global.has(name)) return global.get(name)!
    if (m.weak.has(name) && zero !== undefined) return zero
    throw new ModError(`${m.label()}: ${where} refers to ${name}, which nothing defines`)
  }
  /** Whether a relocation's target is a DSP word address; null for "abs". */
  const targetsDsp = (m: Mod2, target: string): boolean | null => {
    if (target === 'abs') return null
    const [kind, name] = splitTarget(target)
    if (kind === 'sec') return Boolean(dspTag(dev, name))
    if (local.has(key(m.id, name)) && m.symbols.has(name)) return dspSymbols.has(key(m.id, name))
    return dspSymbols.has('\0' + name)
  }
  const write = (buf: Uint8Array, offset: number, type: string, value: number, pc: number, where: string) => {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    if (type === 'dsp24') { // a DSP word, little-endian, as the payloads hold it
      if (value < 0 || value > 0xffffff) throw new ModError(`${where}: a DSP address out of range (0x${value.toString(16)})`)
      buf[offset] = value & 0xff
      buf[offset + 1] = (value >> 8) & 0xff
      buf[offset + 2] = value >> 16
    } else if (type === 'abs32') {
      view.setUint32(offset, u32(value))
    } else if (type === 'pc32') {
      const distance = value - pc
      if (distance < -(2 ** 31) || distance >= 2 ** 31) throw new StructError("'i' format requires -2147483648 <= number <= 2147483647")
      view.setInt32(offset, distance)
    } else {
      const distance = value - pc
      if (distance < -0x8000 || distance >= 0x8000) throw new ModError(`${where}: a 16-bit PC-relative reference spans ${distance} bytes`)
      view.setInt16(offset, distance)
    }
  }
  const place = (m: Mod2, buf: Uint8Array, offset: number, type: string, target: string, addend: number, pc: number, where: string) => {
    const dsp = targetsDsp(m, target)
    if (dsp !== null && dsp !== (type === 'dsp24')) throw new ModError(`${m.label()}: ${where} is a ${type === 'dsp24' ? 'DSP' : 'ColdFire'} reference to a ${dsp ? 'DSP' : 'ColdFire'} address`)
    write(buf, offset, type, resolve(m, target, where) + addend, pc, where)
  }

  const content = new Map<string, Uint8Array>()
  for (const m of linked) {
    for (const section of m.sections.keys()) if (section !== '.bss' && m.size(section)) content.set(key(m.id, section), partsBytes(m.sections.get(section)!.parts!, image, dev).slice())
    for (const [section, offset, type, target, addend] of m.relocs) place(m, content.get(key(m.id, section))!, offset, type, target, addend, base.get(key(m.id, section))! + offset, `${section}+0x${offset.toString(16)}`)
  }
  const tableBytes = new Map<string, Uint8Array>()
  for (const table of tables.keys()) {
    const dsp = dspTables.get(table)
    const parts: Uint8Array[] = dsp ? [dsp[1]] : []
    let length = dsp ? dsp[1].length : 0
    for (const [, , , m, e] of entries.get(table)!) {
      const data = e.data.slice()
      for (const [offset, type, target, addend] of e.relocs) place(m, data, offset, type, target, addend, tableAt.get(table)! + length + offset, `an entry of ${table}`)
      parts.push(data)
      length += data.length
    }
    if (dsp) { tableBytes.set(table, concat([...parts, dsp[2]])); continue }
    if (table === dev.fastTable) for (const m of fastMods) {
      const fastEntry = new Uint8Array(FAST_ENTRY), view = new DataView(fastEntry.buffer)
      view.setUint32(0, fastLoad.get(m.id)!)
      view.setUint32(4, base.get(key(m.id, '.fast'))!)
      view.setUint32(8, align(m.size('.fast'), 4))
      parts.push(fastEntry)
    }
    tableBytes.set(table, concat([...parts, new Uint8Array(tables.get(table)![1])]))
  }
  const ddr = new Uint8Array(runEnd - ddrBase)
  for (const m of linked) {
    if (m.size('.run')) ddr.set(content.get(key(m.id, '.run'))!, base.get(key(m.id, '.run'))! - ddrBase)
    if (fastLoad.has(m.id)) ddr.set(content.get(key(m.id, '.fast'))!, fastLoad.get(m.id)! - ddrBase)
  }
  for (const table of tables.keys()) if (!dspTables.has(table)) ddr.set(tableBytes.get(table)!, tableAt.get(table)! - ddrBase)
  const boot = content.get(key(core.id, '.boot'))
  if (!boot) throw new KeyError(`(${repr(core.id)}, '.boot')`)
  const blob = concat([boot, new Uint8Array(runLoad - end - boot.length), ddr])
  const trailer = newLock ? store.trailer(newLock) : new Uint8Array(0)
  const patched = new Uint8Array(image.length + blob.length + trailer.length)
  patched.set(image)
  const putDsp = (tag: string, word: number, data: Uint8Array) => { // P words of a payload's area are main OS bytes
    const [lo, , at] = areas.get(tag)!
    patched.set(data, at + 3 * (word - lo) - dev.mainLoad)
  }
  for (const [k, tag] of dspSections) putDsp(tag, base.get(k)!, content.get(k) ?? new Uint8Array(0))
  for (const [table, [tag]] of dspTables) putDsp(tag, tableAt.get(table)!, tableBytes.get(table)!)
  for (const m of linked) for (const s of m.sites) {
    const bytes = s.new.slice()
    for (const [offset, type, target, addend] of s.relocs) place(m, bytes, offset, type, target, addend, s.addr + offset, `site ${hex8(s.addr)}`)
    patched.set(bytes, s.addr - dev.mainLoad)
  }
  patched.set(blob, image.length)
  patched.set(trailer, image.length + blob.length)
  const broken = copiedRules(linked, patched, dev)
  for (const m of linked) for (const s of m.sites) {
    if (s.kind !== 'code') continue
    const [ok, note] = insnCheck(patched, s.addr, s.len, dev, 0)
    if (!ok) broken.push(`${m.label()} site ${hex8(s.addr)} after relocation: ${note}`)
  }
  if (broken.length) throw new ModError('the linked mods break a rule:\n  ' + broken.join('\n  '))

  // the map: each package's own symbols as id:name, the globals, then any name all packages agree on
  const map = new Map<string, number>()
  for (const [k, v] of local) map.set(k.replace('\0', ':'), v)
  for (const [k, v] of global) map.set(k, v)
  const valuesByName = new Map<string, Set<number>>()
  for (const [k, v] of local) {
    const name = k.slice(k.indexOf('\0') + 1)
    if (!valuesByName.has(name)) valuesByName.set(name, new Set())
    valuesByName.get(name)!.add(v)
  }
  for (const [name, values] of valuesByName) if (values.size === 1 && !map.has(name)) map.set(name, [...values][0])
  const outTables = new Map<string, [number, number, number]>([...tables.keys()].map(t => [t, [tableAt.get(t)!, tableCount(t), tables.get(t)![1]]]))
  const sections: Record<string, number> = {}
  const byAddress = [...base].map((kv, i) => ({ kv, i })).sort((a, b) => a.kv[1] - b.kv[1] || a.i - b.i).map(x => x.kv)
  for (const [k, v] of byAddress) if (!dspSections.has(k)) sections[k.replace('\0', ' ')] = v
  const layout: Layout = {
    boot: [end, end + bootLen], run_load: runLoad, ddr: [ddrBase, runEnd], bss: [runEnd, bssEnd], fast: [fastBase, fastAt],
    blob_len: blob.length, sections, ddr_spare: ddrEnd - bssEnd, fast_spare: fastEnd - fastAt, ddr_size: ddrEnd - ddrBase, fast_size: fastEnd - fastBase,
  }
  if (units !== null) layout.reserve = { units, end: ddrBase + units * dev.reserve![0] }
  if (areas.size) {
    const dsp: Record<string, DspLayout> = {}
    for (const tag of [...areas.keys()].sort(order)) {
      const [lo, hi, , , claim] = areas.get(tag)!
      const dspSecs: Record<string, number> = {}
      const keys = [...dspSections].filter(([, t]) => t === tag).map(([k]) => k.split('\0') as [string, string])
      for (const [id, section] of keys.sort((a, b) => order(a[0], b[0]) || order(a[1], b[1]))) dspSecs[`${id} ${section}`] = base.get(key(id, section))!
      const dspTabs: Record<string, number> = {}
      for (const table of [...dspTables.keys()].sort(order)) if (dspTables.get(table)![0] === tag) dspTabs[table] = tableAt.get(table)!
      dsp[tag] = { area: [lo, hi], used: [lo, dspAt.get(tag)!], name: claim, sections: dspSecs, tables: dspTabs }
    }
    layout.dsp = dsp
  }
  return { image: patched, order: linked.map(m => m.label()), map, tables: outTables, layout, store: newLock, storeNotes }
}
