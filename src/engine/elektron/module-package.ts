// SPDX-License-Identifier: GPL-3.0-or-later
// Module packages: the validation every format shares, whole-build bundles (format 1) and applying them, the
// instruction-boundary check for code sites, and the static checks a set of modules must pass. Linkable modules
// (format 2) build on this in the linker.
//
// A package is JSON. It carries only its author's bytes and hashes of the stock bytes it expects, and it can only
// change the machine's main OS: the bootloader and the other sections stay stock by construction. Its refusals follow
// the Python tools' wording, so a package is refused alike everywhere.
import { concat, encodeAsciiReplace, fromHex, sha } from './bytes.ts'
import { type Device, type Release, UnknownFirmware, forTarget, imageEnd, linkable } from './devices.ts'
import { FPU, ILLEGAL, LINEF, decodeColdFire, readerAt } from './codec/coldfire-kit.ts'
import { AttributeError, PyFloat, TypeError_, ValueError, hex8, pyInt, pyType, repr, str, truthy, type Loose } from './py.ts'
import { decodeUtf8, loads } from './pyjson.ts'

export const FORMAT = 1
// shortcut: the format key and names below are the hosted packages' current bytes (the catalogue pins them by hash);
// they go when the packages move to Modwerk's own format.
/** The package names the loader lists. */
export const EXTS = ['.elemod', '.dtmod']

export class ModError extends Error {}

/** Python's == of a JSON value and an int (True == 1, 1.0 == 1). */
export const pyEq = (v: unknown, n: number): boolean => v === n || (typeof v === 'boolean' && Number(v) === n) || (v instanceof PyFloat && v.value === n)

export const isDict = (v: unknown): v is Record<string, Loose> => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof PyFloat)

/** The package's format number. */
export function formatOf(doc: unknown): unknown {
  if (!isDict(doc)) return null
  if ('elemod' in doc) return doc.elemod
  return 'dtmod' in doc ? doc.dtmod : null
}

/** d.get(k, default), failing as Python does when d is not a dict. */
export function get(d: unknown, k: string, fallback: unknown = null): Loose {
  if (!isDict(d)) throw new AttributeError(`'${pyType(d)}' object has no attribute 'get'`)
  return k in d ? d[k] : fallback
}

/** An int, or a string that int(v, 0) reads. */
export function int(v: unknown, what: string): number {
  const n = pyInt(v)
  if (n === null) throw new ModError(`${what}: ${repr(v)} is not a number`)
  return n
}

export function hexBytes(v: unknown, what: string): Uint8Array {
  const bytes = typeof v === 'string' ? fromHex(v) : null
  if (!bytes) throw new ModError(`${what}: not hex`)
  return bytes
}

/** The machine and release a package's "target" names. */
export function resolveTarget(doc: Record<string, Loose>, name: string): [Device, Release] {
  try {
    return forTarget(get(doc, 'target'))
  } catch (e) {
    if (e instanceof UnknownFirmware) throw new ModError(`${name}: ${e.message}`)
    throw e
  }
}

/** Iterating a JSON value as Python does: a list's items, a dict's keys, a string's characters. */
export function iter(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return [...v]
  if (isDict(v)) return Object.keys(v)
  throw new TypeError_(`'${pyType(v)}' object is not iterable`)
}

/** Python's `a, b, ... = r` for `n` names. */
export function unpack(r: unknown, n: number): unknown[] {
  const values = iter(r)
  if (values.length > n) throw new ValueError(`too many values to unpack (expected ${n})`)
  if (values.length < n) throw new ValueError(`not enough values to unpack (expected ${n}, got ${values.length})`)
  return values
}

/** A run of bytes: the author's own, or n stock bytes from an address, copied from the owner's hash-checked image. */
export type Part = ['hex', Uint8Array] | ['stock', number, number]

export function parseParts(parts: unknown, what: string, dev: Device, rel: Release): Part[] {
  const end = imageEnd(dev, rel)
  return iter(parts).map((p): Part => {
    const list = Array.isArray(p) ? p : []
    if (list[0] === 'hex' && list.length === 2) return ['hex', hexBytes(list[1], what + ' part')]
    if (list[0] === 'stock' && list.length === 3) {
      const at = int(list[1], what + ' part'), n = int(list[2], what + ' part')
      if (at < dev.mainLoad || at + n > end || n <= 0) throw new ModError(`${what}: a part copies ${hex8(at)} +${n}, outside the image`)
      return ['stock', at, n]
    }
    throw new ModError(`${what}: bad part ${repr(p)}`)
  })
}

export const partsLen = (parts: Part[]): number => parts.reduce((n, p) => n + (p[0] === 'hex' ? p[1].length : p[2]), 0)

export const partsBytes = (parts: Part[], image: Uint8Array, dev: Device): Uint8Array =>
  concat(parts.map(p => (p[0] === 'hex' ? p[1] : image.subarray(p[1] - dev.mainLoad, p[1] - dev.mainLoad + p[2]))))

/** [offset, type, target, addend]. */
export type Reloc = [number, string, string, number]
/** Each relocation type's size in bytes. */
export const RSIZE = new Map([['abs32', 4], ['pc32', 4], ['pc16', 2], ['dsp24', 3]])
export type Site = { addr: number; len: number; new: Uint8Array; kind: string; stock_sha256: string; relocs: Reloc[] }

export function parseSites(doc: Record<string, Loose>, name: string, dev: Device, rel: Release, relocs = false): Site[] {
  const end = imageEnd(dev, rel)
  return iter(get(doc, 'sites', [])).map((s, i): Site => {
    const what = `${name} site ${i}`
    const addr = int(get(s, 'addr'), what), len = int(get(s, 'len'), what)
    const bytes = hexBytes(get(s, 'new'), what)
    if (bytes.length !== len || len <= 0) throw new ModError(`${what}: "new" is not ${len} bytes`)
    if (addr < dev.mainLoad || addr + len > end) throw new ModError(`${what}: ${hex8(addr)} +${len} is outside the stock image`)
    const kind = get(s, 'kind')
    if (kind !== 'code' && kind !== 'data') throw new ModError(`${what}: kind is "code" or "data"`)
    const stock = get(s, 'stock_sha256')
    if (typeof stock !== 'string' || stock.length !== 64) throw new ModError(`${what}: no stock_sha256`)
    const site: Site = { addr, len, new: bytes, kind, stock_sha256: stock.toLowerCase(), relocs: [] }
    if (relocs) for (const r of iter(get(s, 'relocs', []))) {
      const [rawOffset, type, target, addend] = unpack(r, 4)
      const offset = int(rawOffset, what)
      const size = typeof type === 'string' ? RSIZE.get(type) : undefined
      if (size === undefined || offset < 0 || offset + size > len) throw new ModError(`${what}: bad relocation ${repr(r)}`)
      site.relocs.push([offset, type as string, target as string, int(addend, what)])
    }
    return site
  })
}

export type Region = { name: string; lo: number; hi: number; area: string }

/** A module's resources: the memory regions it takes (each inside one of the machine's areas) and the names it claims. */
export function parseResources(doc: Record<string, Loose>, name: string, dev: Device): [Region[], string[]] {
  const given = get(doc, 'resources'), resources = truthy(given) ? given : {}
  const regions = iter(get(resources, 'regions', [])).map((g): Region => {
    const lo = int(get(g, 'lo'), name + ' region'), hi = int(get(g, 'hi'), name + ' region')
    if (!(lo < hi)) throw new ModError(`${name}: empty region ${repr(g)}`)
    const area = Object.entries(dev.areas).find(([, [a, z]]) => a <= lo && hi <= z)?.[0]
    if (area === undefined) throw new ModError(`${name}: region ${str(get(g, 'name'))} ${hex8(lo)}-${hex8(hi)} is outside every free area`)
    return { name: str(get(g, 'name', '?')), lo, hi, area }
  })
  return [regions, iter(get(resources, 'names', [])).map(x => str(x))]
}

/** The core version a module's resources.core says it needs ("3.0"), or null. */
export function parseNeedsCore(doc: Record<string, Loose>, name: string): string | null {
  const given = get(doc, 'resources'), v = get(truthy(given) ? given : {}, 'core')
  if (v === null) return null
  if (typeof v !== 'string' || !(v[0] >= '0' && v[0] <= '9')) throw new ModError(`${name}: resources.core is the version of core it needs, such as "3.0"`)
  return v
}

type VersionPart = [number, bigint, string]

/** A version as it sorts: runs of digits as numbers (2.10 after 2.9), other runs as text, a number before text at
 * the same place (2.0 before 2.0a before 2.1). */
export function versionKey(v: string): VersionPart[] {
  return (String(v).match(/[0-9]+|[^0-9]+/g) ?? []).map((run): VersionPart => (/^[0-9]/.test(run) ? [0, BigInt(run), ''] : [1, 0n, run]))
}

/** a against b in version order: < 0, 0 or > 0. */
export function cmpVersions(a: string, b: string): number {
  const x = versionKey(a), y = versionKey(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    for (let j = 0; j < 3; j++) if (x[i][j] !== y[i][j]) return x[i][j] < y[i][j] ? -1 : 1
  }
  return x.length - y.length
}

/** The core a build takes from `versions` (one machine and OS's cores): the newest, if at least `need`; with `fits`,
 * only cores whose RAM holds the set count, unless none new enough does. Its index (the last of equals) or null. */
export function pickCore(versions: string[], need: string | null = null, fits: boolean[] | null = null): number | null {
  let candidates = versions.map((_, i) => i).filter(i => need === null || cmpVersions(versions[i], need) >= 0)
  if (!candidates.length) return null
  if (fits !== null && candidates.some(i => fits[i])) candidates = candidates.filter(i => fits[i])
  return candidates.reduce((best, i) => (cmpVersions(versions[i], versions[best]) >= 0 ? i : best), candidates[0])
}

/** The fields every format allows. */
export const COMMON = new Set(['elemod', 'dtmod', 'id', 'version', 'title', 'description', 'category', 'author',
  'license', 'target', 'sites', 'resources', 'requires', 'conflicts', 'build', 'signature', 'notes'])

/** What a format-1 and a format-2 module share. */
export type AnyMod = {
  format: 1 | 2
  doc: Record<string, Loose>
  name: string
  sha256: string | null
  id: string
  version: string
  dev: Device
  rel: Release
  sites: Site[]
  blob: Blob | null
  regions: Region[]
  names: string[]
  requires: string[]
  conflicts: string[]
  /** Format 2 only. */ sections?: Map<string, unknown>
  /** Format 2 only: resources.core. */ needsCore?: string | null
  label(): string
}

export type Blob = { load: number; len: number; sha256: string; parts: Part[] }

/** A format-1 package: a whole build at once, its sites and one blob appended to the image. */
export class Mod implements AnyMod {
  readonly format = 1
  doc: Record<string, Loose>
  name: string
  sha256: string | null
  id: string
  version: string
  dev: Device
  rel: Release
  sites: Site[]
  blob: Blob | null = null
  regions: Region[]
  names: string[]
  requires: string[]
  conflicts: string[]

  constructor(doc: Record<string, Loose>, name = '<mod>', raw: Uint8Array | null = null) {
    this.doc = doc
    this.name = name
    this.sha256 = raw ? sha(raw) : null
    if (!pyEq(formatOf(doc), FORMAT)) throw new ModError(`${name}: not a format-${FORMAT} module package`)
    for (const k of ['id', 'version', 'target', 'sites']) if (!(k in doc)) throw new ModError(`${name}: no "${k}"`)
    const unknown = Object.keys(doc).filter(k => !COMMON.has(k) && k !== 'ele3_version' && k !== 'blob').sort()
    if (unknown.length) throw new ModError(`${name}: unknown fields ${repr(unknown)}`)
    this.id = str(doc.id)
    this.version = str(doc.version)
    ;[this.dev, this.rel] = resolveTarget(doc, name)
    // the version the unit shows: exactly versionLen characters in an ELE3 container, up to it otherwise
    const shown = get(doc, 'ele3_version')
    if (shown !== null) {
      const n = typeof shown === 'string' ? encodeAsciiReplace(shown).length : -1
      const exact = this.dev.container === 'ele3'
      if ((exact && n !== this.dev.versionLen) || n <= 0 || n > this.dev.versionLen)
        throw new ModError(`${name}: ele3_version is ${exact ? 'exactly' : 'up to'} ${this.dev.versionLen} ASCII characters on the ${this.dev.name}`)
    }
    this.sites = parseSites(doc, name, this.dev, this.rel)
    const blob = get(doc, 'blob')
    if (blob !== null) {
      const load = int(get(blob, 'load'), name + ' blob'), len = int(get(blob, 'len'), name + ' blob')
      const parts = parseParts(get(blob, 'parts', []), name + ' blob', this.dev, this.rel)
      const total = partsLen(parts)
      if (total !== len) throw new ModError(`${name}: blob parts make ${total} bytes, not ${len}`)
      const room = this.dev.blobMax ?? (linkable(this.dev) ? this.dev.ddr[1] - this.dev.ddr[0] : null)
      if (room !== null && len > room) throw new ModError(`${name}: blob of ${len} bytes is over the ${room} the ${this.dev.name} allows`)
      this.blob = { load, len, sha256: str(get(blob, 'sha256', '')).toLowerCase(), parts }
    }
    ;[this.regions, this.names] = parseResources(doc, name, this.dev)
    this.requires = iter(get(doc, 'requires', [])).map(x => str(x))
    this.conflicts = iter(get(doc, 'conflicts', [])).map(x => str(x))
  }

  label(): string { return `${this.id} ${this.version}` }
}

/** A package's JSON, refused with the reader's message. */
export function readJson(raw: Uint8Array, path: string): unknown {
  try {
    return loads(decodeUtf8(raw))
  } catch (e) {
    throw new ModError(`${path}: not JSON (${(e as Error).message})`)
  }
}

/** Whether [addr, addr+n) of `image` (loaded at dev.mainLoad) holds whole instructions, and why not. Decoding forward
 * from addr must land exactly on addr+n with no illegal word; the start, which forward decoding cannot prove, must be
 * where every one of `sweeps` linear sweeps lands, started 32 to 94 bytes before it. */
export function insnCheck(image: Uint8Array, addr: number, n: number, dev: Device, sweeps = 32): [boolean, string] {
  const read = readerAt(image, dev.mainLoad)
  let at = addr
  while (at < addr + n) {
    const ins = decodeColdFire(read(at), at)
    if (ins.flags & (ILLEGAL | LINEF | FPU)) return [false, `${hex8(at)} does not decode`]
    at += ins.length
  }
  if (at !== addr + n) return [false, `ends mid-instruction (${hex8(at)})`]
  let landed = 0, ran = 0
  for (let back = 16; back < 16 + sweeps; back++) {
    let pc = addr - 2 * back
    if (pc < dev.mainLoad) break
    while (pc < addr) pc += decodeColdFire(read(pc), pc).length
    ran++
    if (pc === addr) landed++
  }
  return landed === ran ? [true, 'whole instructions'] : [false, `only ${landed} of ${ran} sweeps land on the start`]
}

/** [lo, hi, module, what] of image bytes a module changes or claims. */
export type Span<M> = [number, number, M | null, string]

/** Every pair of spans that share a byte, in start order. */
export function overlaps<T extends [number, number, ...unknown[]]>(spans: T[]): [T, T][] {
  const sorted = spans.map((span, i) => ({ span, i })).sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1] || a.i - b.i).map(x => x.span)
  const pairs: [T, T][] = []
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (b[0] >= a[1]) break
      pairs.push([a, b])
    }
  })
  return pairs
}

/** A problem when the modules were made for different firmware. */
export function sameTarget(mods: AnyMod[]): string[] {
  if (new Set(mods.map(m => m.dev.key + '\0' + m.rel.version)).size <= 1) return []
  return ['the mods are for different firmware: ' + mods.map(m => `${m.label()} (${m.dev.name} ${m.rel.version})`).join(', ')]
}

const overlapLine = (a: Span<AnyMod>, b: Span<AnyMod>) => `${a[2]!.label()} ${a[3]} and ${b[2]!.label()} ${b[3]} overlap (${hex8(b[0])}-${hex8(Math.min(a[1], b[1]))})`

/** The checks both formats share. */
export function commonChecks(mods: AnyMod[], image: Uint8Array, spans: Span<AnyMod>[]): string[] {
  const problems = sameTarget(mods)
  const ids = mods.map(m => m.id)
  for (const id of [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const times = ids.filter(x => x === id).length
    if (times > 1) problems.push(`mod ${id} is given ${times} times`)
  }
  for (const m of mods) {
    for (const r of m.requires) if (!ids.includes(r)) problems.push(`${m.label()} requires ${r}`)
    for (const c of m.conflicts) if (ids.includes(c)) problems.push(`${m.label()} conflicts with ${c}`)
  }
  for (const [a, b] of overlaps(spans)) if (a[2] !== b[2] || a[3] !== b[3]) problems.push(overlapLine(a, b))
  const claimedBy = new Map<string, AnyMod>()
  for (const m of mods) for (const name of m.names) {
    const other = claimedBy.get(name)
    if (other && other !== m) problems.push(`${other.label()} and ${m.label()} both claim ${name}`)
    claimedBy.set(name, m)
  }
  if (problems[0]?.startsWith('the mods are for different firmware')) return problems
  const dev = mods[0].dev
  for (const m of mods) for (const s of m.sites) for (const [lo, hi, why] of dev.protected) {
    if (s.addr < hi && lo < s.addr + s.len) problems.push(`${m.label()} site ${hex8(s.addr)} is inside ${hex8(lo)}-${hex8(hi)}, ${why}: protected on the ${dev.name}`)
  }
  for (const m of mods) for (const s of m.sites) {
    const offset = s.addr - dev.mainLoad
    if (sha(image.subarray(offset, offset + s.len)) !== s.stock_sha256) {
      problems.push(`${m.label()} site ${hex8(s.addr)}: the stock bytes are not the ones it expects`)
    } else if (s.kind === 'code') {
      const [ok, note] = insnCheck(image, s.addr, s.len, dev)
      if (!ok) problems.push(`${m.label()} site ${hex8(s.addr)}: ${note}`)
    }
  }
  return problems
}

/** Problems that only follow from a missing requirement or too old a core. */
const FOLLOW_ON = ['imports ', 'adds to table ', 'has .fast code']

/** The checks' lines for a person: a module lacking a requirement or a newer core shows that, not what follows from
 * it; repeats are merged with a count; a missing .boot says the core is not enabled. */
export function summarize(problems: string[], mods: AnyMod[]): string[] {
  const ids = new Set(mods.map(m => m.id))
  const lacking = new Set(mods.filter(m => m.requires.some(r => !ids.has(r))).map(m => m.label()))
  const cores = mods.filter(m => m.sections?.has('.boot'))
  if (cores.length === 1) for (const m of mods) if (m.needsCore && cmpVersions(cores[0].version, m.needsCore) < 0) lacking.add(m.label())
  const counts = new Map<string, number>()
  for (const problem of problems) {
    if ([...lacking].some(label => problem.startsWith(label + ' ') && FOLLOW_ON.some(f => problem.includes(f)))) continue
    const line = problem.startsWith('exactly one mod must carry .boot') && problem.endsWith('got none') ? 'core is not enabled, and every other mod builds on it' : problem
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  return [...counts].map(([line, n]) => (n === 1 ? line : `${line} (${n} times)`))
}

/** The static check for format-1 modules: their problems. */
export function check(mods: Mod[], image: Uint8Array): string[] {
  const spans: Span<AnyMod>[] = mods.flatMap(m => [
    ...m.sites.map((s): Span<AnyMod> => [s.addr, s.addr + s.len, m, `site ${hex8(s.addr)}`]),
    ...(m.blob ? [[m.blob.load, m.blob.load + m.blob.len, m, 'blob'] as Span<AnyMod>] : []),
  ])
  const problems = commonChecks(mods, image, spans)
  const regions = mods.flatMap(m => m.regions.map((g): Span<AnyMod> => [g.lo, g.hi, m, 'region ' + g.name]))
  for (const [a, b] of overlaps(regions)) problems.push(overlapLine(a, b))
  const whole = mods.filter(m => m.blob)
  if (whole.length > 1) problems.push(`more than one whole build (${whole.map(m => m.label()).join(', ')})`)
  for (const m of whole) {
    const end = imageEnd(m.dev, m.rel)
    if (m.blob!.load !== end) problems.push(`${m.label()}: its blob loads at ${hex8(m.blob!.load)}, not the image end ${hex8(end)}`)
  }
  return problems
}

/** The module's blob, its stock parts copied from `image`. */
export function blobBytes(mod: Mod, image: Uint8Array): Uint8Array {
  const bytes = partsBytes(mod.blob!.parts, image, mod.dev)
  if (sha(bytes) !== mod.blob!.sha256) throw new ModError(`${mod.label()}: the blob does not assemble to its sha256`)
  return bytes
}

/** Format-1 modules applied to the stock main OS image; ModError with every problem the check finds. */
export function apply(mods: Mod[], image: Uint8Array): Uint8Array {
  const { dev, rel } = mods[0]
  if (sha(image) !== rel.mainSha256) throw new ModError(`the stock main OS is not ${dev.name} ${rel.version}`)
  const problems = summarize(check(mods, image), mods)
  if (problems.length) throw new ModError('the mods do not combine:\n  ' + problems.join('\n  '))
  const patched = image.slice()
  for (const m of mods) for (const s of m.sites) patched.set(s.new, s.addr - dev.mainLoad)
  const blobs = mods.filter(m => m.blob).map(m => blobBytes(m, image))
  return blobs.length ? concat([patched, ...blobs]) : patched
}

export { PyFloat }
