// SPDX-License-Identifier: GPL-3.0-or-later
// Module storage on the Analog Rytm MKII and Analog Four MKII: the lockfile that keeps every stored field where it
// was from one build to the next, and the allocator that places new fields.
//
// A module declares fields ("storage": [{"sym", "scope", "bits"}]); the linker gives each field's symbol a
// descriptor (scope in bits 28..31, width in 22..27, bit offset in 0..21). A field that comes back with the same
// scope and width takes its old bits, any other new or resized field takes bits no field has used, a scope that runs
// out is repacked under a new generation, and any layout change gives the lockfile a new ID (a hash of the layout),
// the old ID kept as an ancestor so older projects still load. Deterministic throughout.
//
// The lockfile's shape, its key names and its messages are fixed: builds carry it (trailer), and owners keep theirs.
import { sha } from './bytes.ts'
import { dumps as pyDumps, repr, str } from './py.ts'
// shortcut: the module-file reader's error type and number helpers still come from the vendored kit; switch these
// imports when Modwerk's own module reader replaces kit/src/elemod.ts.
import { ModError, cmpVersions, int } from '../../../vendor/elekloader/kit/src/elemod.ts'

export const FORMAT = 1
export const SCOPES = ['sound', 'kit', 'global', 'track', 'pattern', 'project'] as const
export type Scope = typeof SCOPES[number]
export const GEN_SYMS = ['__store_gen', '__store_gen2']
export const IDS_TABLE = 'core_store_ids'
export const TRAILER = 'ELKSTORE'

const MAX_ANCESTORS = 15
const MAX_BITS = 32
const SCOPE_NUMBERS: Record<string, number> = Object.fromEntries(SCOPES.map((s, i) => [s, i + 1]))
// an unknown scope (never one parseDecls passes) sorts as NaN, as it always has
const scopeNumber = (scope: string) => SCOPE_NUMBERS[scope]

export type Field = { mod: string; sym: string; scope: string; offset: number; bits: number }
export type Lock = {
  elekloader_store: number; device: string; id: string; ancestors: string[]
  split: { track: number; pattern: number }; generation: Record<string, number>; next: Record<string, number>
  fields: Field[]; freed: Field[]
}
/** [module id, symbol, scope, bits]. */
export type Decl = [string, string, string, number]
type Split = Lock['split']

/** Each machine's tagged store: fixed room per scope (and more from a core version on), the largest pattern-track
 * and pattern items, the bytes after the store's header, how many of each item there are, and a new lockfile's split. */
type Machine = { fixed: Record<string, number>; fromCore: [string, Record<string, number>][]; live: Split; bytes: number; items: Split; split: Split }
const MACHINES: Record<string, Machine> = {
  'analog-rytm-mk2': { fixed: { sound: 24, kit: 64, global: 40 }, fromCore: [['0.3', { sound: 56 }]], live: { track: 512, pattern: 512 }, bytes: 4342, items: { track: 1677, pattern: 129 }, split: { track: 2, pattern: 4 } },
  'analog-four-mk2': { fixed: { sound: 32, kit: 128, global: 64 }, fromCore: [], live: { track: 512, pattern: 512 }, bytes: 4342, items: { track: 774, pattern: 129 }, split: { track: 2, pattern: 4 } },
}

export const supports = (devKey: string) => Object.hasOwn(MACHINES, devKey)

function machine(devKey: string): Machine {
  if (!supports(devKey)) throw new ModError(`the ${devKey} has no mod storage`)
  return MACHINES[devKey]
}

/** {scope: bits} for a split with a core of version `core` (null: the newest core's room). */
export function capacity(devKey: string, split: Split, core: string | null = null): Record<string, number> {
  const m = machine(devKey)
  const room: Record<string, number> = { ...m.fixed }
  for (const [version, more] of m.fromCore) if (core === null || cmpVersions(core, version) >= 0) Object.assign(room, more)
  return { ...room, track: 8 * split.track, pattern: 8 * split.pattern, project: 8 * (m.bytes - m.items.track * split.track - m.items.pattern * split.pattern) }
}

/** The oldest core newer than `core` that gives `scope` the newest core's room (for a refusal's message). */
function roomCore(devKey: string, split: Split, scope: string, core: string): string | null {
  const most = capacity(devKey, split)[scope]
  const versions = machine(devKey).fromCore.map(([v]) => v).sort(cmpVersions)
  return versions.find(v => cmpVersions(v, core) > 0 && capacity(devKey, split, v)[scope] === most) ?? null
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const hexId = (v: number) => '0x' + (v >>> 0).toString(16).padStart(8, '0')
const hasExactly = (d: Record<string, unknown>, keys: readonly string[]) => Object.keys(d).length === keys.length && keys.every(k => Object.hasOwn(d, k))
const get = (d: Record<string, any>, key: string, missing: unknown = null) => (Object.hasOwn(d, key) ? d[key] : missing)

function idValue(s: unknown, what: string): number {
  const v = int(s, 'lockfile: ' + what)
  if (v <= 0 || v > 0xffffffff) throw new ModError(`lockfile: ${what} ${repr(s)} is not a 32-bit ID other than 0`)
  return v
}

/** A module document's "storage" as [sym, scope, bits] rows. */
export function parseDecls(doc: Record<string, any>): [string, string, number][] {
  const fields = get(doc, 'storage', [])
  if (!Array.isArray(fields)) throw new ModError('"storage" is a list of fields')
  const rows: [string, string, number][] = []
  for (const field of fields) {
    if (!isObject(field) || Object.keys(field).some(k => k !== 'sym' && k !== 'scope' && k !== 'bits')) throw new ModError('a storage field is {"sym", "scope", "bits"}')
    const sym = get(field, 'sym'), scope = get(field, 'scope'), bits = get(field, 'bits')
    if (typeof sym !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sym)) throw new ModError(`storage field ${repr(sym)}: "sym" is a C name`)
    if (!SCOPES.includes(scope)) throw new ModError(`storage field ${sym}: scope ${repr(scope)} (${SCOPES.join(', ')})`)
    if (!isInt(bits) || bits < 1 || bits > MAX_BITS) throw new ModError(`storage field ${sym}: bits ${repr(bits)} (1 to ${MAX_BITS})`)
    if (rows.some(([s]) => s === sym)) throw new ModError(`storage field ${sym} is declared twice`)
    rows.push([sym, scope, bits])
  }
  return rows
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byPlace = (a: Field, b: Field) => scopeNumber(a.scope) - scopeNumber(b.scope) || a.offset - b.offset || a.bits - b.bits || order(a.mod, b.mod) || order(a.sym, b.sym)
const byName = (a: { mod: string; sym: string }, b: { mod: string; sym: string }) => order(a.mod, b.mod) || order(a.sym, b.sym)

/** A layout's ID: the first four bytes of the SHA-256 of everything that places data (freed fields too: their bits
 * still hold values a returning field reads), never 0. */
export function layoutId(lock: Lock): number {
  const place = (fields: Field[]) => [...fields].sort(byPlace).map(f => [f.scope, f.offset, f.bits, f.mod, f.sym])
  const layout = [lock.elekloader_store, lock.device, [lock.split.track, lock.split.pattern], SCOPES.map(s => lock.generation[s]), SCOPES.map(s => lock.next[s]), place(lock.fields), place(lock.freed)]
  return parseInt(sha(new TextEncoder().encode(pyDumps(layout))).slice(0, 8), 16) || 1
}

export function fresh(devKey: string): Lock {
  const lock: Lock = {
    elekloader_store: FORMAT, device: devKey, id: '', ancestors: [], split: { ...machine(devKey).split },
    generation: Object.fromEntries(SCOPES.map(s => [s, 1])), next: Object.fromEntries(SCOPES.map(s => [s, 0])), fields: [], freed: [],
  }
  lock.id = hexId(layoutId(lock))
  return lock
}

/** Throws ModError unless `lock` is a well-formed lockfile for `devKey`. */
export function checkLock(lock: unknown, devKey: string): asserts lock is Lock {
  if (!isObject(lock)) throw new ModError('lockfile: not a JSON object')
  const format = get(lock, 'elekloader_store')
  if (!isInt(format)) throw new ModError('lockfile: not an elekloader storage lockfile')
  if (format > FORMAT) throw new ModError(`lockfile: format ${format} is newer than this elekloader (${FORMAT}): update elekloader`)
  if (format < 1) throw new ModError(`lockfile: format ${repr(format)}`)
  const device = get(lock, 'device')
  if (device !== devKey) throw new ModError(`lockfile: made for the ${device === null ? 'None' : str(device)}, not the ${devKey}`)
  idValue(get(lock, 'id'), 'id')
  const ancestors = get(lock, 'ancestors', [])
  if (!Array.isArray(ancestors)) throw new ModError('lockfile: "ancestors" is a list')
  for (const a of ancestors) idValue(a, 'ancestor')
  const split = lock.split
  if (!isObject(split) || !hasExactly(split, ['track', 'pattern']) || !Object.values(split).every(x => isInt(x) && x >= 0))
    throw new ModError('lockfile: "split" gives bytes per track and per pattern')
  const room = capacity(devKey, split as Split), m = machine(devKey)
  if (room.project < 0 || 8 * split.track > m.live.track || 8 * split.pattern > m.live.pattern)
    throw new ModError(`lockfile: the split ${split.track}/${split.pattern} does not fit the store`)
  for (const key of ['generation', 'next']) {
    const perScope = lock[key]
    if (!isObject(perScope) || !hasExactly(perScope, SCOPES) || !SCOPES.every(s => isInt(perScope[s]))) throw new ModError(`lockfile: "${key}" gives a number per scope`)
  }
  for (const s of SCOPES) {
    if (lock.generation[s] < 1 || lock.generation[s] > 255) throw new ModError(`lockfile: generation ${repr(lock.generation[s])} of ${s}`)
    if (lock.next[s] < 0 || lock.next[s] > room[s]) throw new ModError(`lockfile: next bit ${repr(lock.next[s])} of ${s}`)
  }
  for (const key of ['fields', 'freed']) {
    const list = lock[key]
    if (!Array.isArray(list)) throw new ModError(`lockfile: "${key}" is a list`)
    for (const f of list) {
      const wellFormed = isObject(f) && hasExactly(f, ['mod', 'sym', 'scope', 'offset', 'bits']) && typeof f.mod === 'string' && typeof f.sym === 'string'
        && SCOPES.includes(f.scope) && isInt(f.offset) && f.offset >= 0 && isInt(f.bits) && f.bits >= 1 && f.bits <= MAX_BITS
      if (!wellFormed) throw new ModError(`lockfile: a bad entry in "${key}"`)
      if (key === 'fields' && f.offset > lock.next[f.scope] - f.bits) throw new ModError(`lockfile: field ${f.sym} of ${f.mod} lies past its scope's used bits`)
    }
  }
}

const nextGeneration = (g: number) => (g >= 255 ? 1 : g + 1)
const bytesFor = (bits: number) => Math.ceil(bits / 8)
type Placing = Omit<Field, 'offset'> & { offset: number | null }

/** The lockfile after building with `decls` ([module, sym, scope, bits]) from `previous` (null: a new one), and the
 * notes that say what moved. `previous` is not changed. */
export function allocate(previous: Lock | null, decls: Decl[], devKey: string, core: string | null = null): [Lock, string[]] {
  const notes: string[] = []
  if (previous !== null) checkLock(previous, devKey)
  const lock: Lock = previous === null ? fresh(devKey) : structuredClone(previous)
  const key = (mod: string, sym: string) => `${mod}\0${sym}`

  const wanted = new Map<string, { mod: string; sym: string; scope: string; bits: number }>()
  for (const [mod, sym, scope, bits] of decls) {
    if ([...wanted.values()].some(w => w.sym === sym)) throw new ModError(`the storage field ${sym} is declared by two mods`)
    wanted.set(key(mod, sym), { mod, sym, scope, bits })
  }
  const unchanged = (f: Field) => { const w = wanted.get(key(f.mod, f.sym)); return !!w && w.scope === f.scope && w.bits === f.bits }
  const kept = lock.fields.filter(unchanged), gone = lock.fields.filter(f => !unchanged(f))
  const keptKeys = new Set(kept.map(f => key(f.mod, f.sym)))
  const added: Placing[] = [...wanted.values()].sort(byName).filter(w => !keptKeys.has(key(w.mod, w.sym)))
    // key order as the lockfile writes it
    .map(({ mod, sym, scope, bits }) => ({ mod, sym, scope, offset: null, bits }))

  // a field back with its old scope and width takes its old bits: nothing was placed there since, so its values remain
  const returned = new Set<string>()
  for (const f of added) {
    const matches = lock.freed.filter(g => g.mod === f.mod && g.sym === f.sym && g.scope === f.scope && g.bits === f.bits)
    if (!matches.length) continue
    const last = matches[matches.length - 1]
    f.offset = last.offset
    lock.freed.splice(lock.freed.findIndex(g => byPlace(g, last) === 0), 1)
    returned.add(key(f.mod, f.sym))
  }
  lock.freed.push(...gone.map(f => ({ ...f })))
  const fields = [...kept, ...added] as Field[]
  const m = machine(devKey)
  let room = capacity(devKey, lock.split, core)
  const repacked = new Set<string>()
  const used = (scope: string) => fields.filter(f => f.scope === scope).reduce((n, f) => n + f.bits, 0)
  const unplaced = (scope: string) => added.filter(f => f.scope === scope && f.offset === null)
  const unplacedBits = (scope: string) => unplaced(scope).reduce((n, f) => n + f.bits, 0)

  const repack = (scope: string) => {
    repacked.add(scope)
    lock.generation[scope] = nextGeneration(lock.generation[scope])
    lock.freed = lock.freed.filter(f => f.scope !== scope)
    let at = 0
    for (const f of fields.filter(f => f.scope === scope).sort(byName)) { f.offset = at; at += f.bits }
    lock.next[scope] = at
    notes.push(`${scope} storage repacked (generation ${lock.generation[scope]}): older projects and sounds load it at defaults`)
  }

  const split = { ...lock.split }
  for (const item of ['track', 'pattern'] as const) {
    const bits = used(item)
    if (bits > m.live[item]) throw new ModError(`the mods need ${bits} bits per ${item}; the ${devKey} keeps at most ${m.live[item]}`)
    if (lock.next[item] + unplacedBits(item) > 8 * split[item] && bits > 8 * split[item]) split[item] = bytesFor(bits)
  }
  if (split.track !== lock.split.track || split.pattern !== lock.split.pattern) {
    // pattern-track items come first in the store: they move only when their own size changes
    const moved = split.track !== lock.split.track ? ['track', 'pattern', 'project'] : ['pattern', 'project']
    lock.split = split
    room = capacity(devKey, split, core)
    if (room.project < used('project'))
      throw new ModError(`the mods need ${m.items.track * split.track + m.items.pattern * split.pattern + bytesFor(used('project'))} bytes of pattern-track, pattern and project storage; the ${devKey} has ${m.bytes}`)
    notes.push(`the tagged store now keeps ${split.track} B per pattern track and ${split.pattern} B per pattern`)
    moved.forEach(repack)
  }
  for (const s of SCOPES) {
    if (used(s) > room[s]) {
      const newest = capacity(devKey, lock.split)[s]
      throw new ModError(`the mods need ${used(s)} bits of ${s} storage; the ${devKey} has ${room[s]}${newest > room[s] ? ` with core ${core} (${newest} with core ${roomCore(devKey, lock.split, s, core as string)})` : ''}`)
    }
    // placed by a newer core past what this one keeps
    if (fields.some(f => f.scope === s && f.offset !== null && f.offset + f.bits > room[s])) { repack(s); continue }
    if (!unplaced(s).length) continue
    if (lock.next[s] + unplacedBits(s) > room[s]) { repack(s); continue }
    for (const f of unplaced(s)) { f.offset = lock.next[s]; lock.next[s] += f.bits }
  }
  for (const f of gone) {
    const resized = wanted.has(key(f.mod, f.sym))
    notes.push(resized || repacked.has(f.scope)
      ? `${f.mod} ${f.sym} (${f.scope}): ${resized ? 'changed size' : 'no longer in the build'}, its data is dropped`
      : `${f.mod} ${f.sym} (${f.scope}): no longer in the build; its bits are kept, so it gets its values back if it returns`)
  }
  for (const f of added) {
    notes.push(returned.has(key(f.mod, f.sym)) && !repacked.has(f.scope)
      ? `${f.mod} ${f.sym}: back at bit ${f.offset} of ${f.scope} storage, with the values it had`
      : `${f.mod} ${f.sym}: ${f.bits} bits of ${f.scope} storage at bit ${f.offset}`)
  }
  lock.fields = fields.sort((a, b) => scopeNumber(a.scope) - scopeNumber(b.scope) || a.offset - b.offset)

  if (previous === null) {
    lock.id = hexId(layoutId(lock))
    notes.unshift(`a new lockfile, layout ID ${lock.id}: projects and sounds saved by builds with other layouts load their mod data at defaults`)
  } else if (gone.length || added.length || repacked.size) {
    const old = lock.id
    lock.id = hexId(layoutId(lock))
    // a layout can come back: each ID once, newest first
    const ids = [idValue(lock.id, 'id')]
    for (const a of [old, ...lock.ancestors]) { const v = idValue(a, 'ancestor'); if (!ids.includes(v)) ids.push(v) }
    lock.ancestors = ids.slice(1, 1 + MAX_ANCESTORS).map(hexId)
    notes.push(`layout ID ${lock.id} (from ${old}, whose projects it still reads)`)
  }
  return [lock, notes]
}

/** The linker's symbols for `lock` ({name: value}) and its IDs table's entries (4 bytes each, big-endian). */
export function symbols(lock: Lock): [Map<string, number>, Uint8Array[]] {
  const g = lock.generation, split = lock.split
  const out = new Map<string, number>([
    ['__store_gen', ((g.sound << 24) | (g.kit << 16) | (g.global << 8) | g.track) >>> 0],
    ['__store_gen2', ((g.pattern << 24) | (g.project << 16) | (split.track << 8) | split.pattern) >>> 0],
  ])
  for (const f of lock.fields) out.set(f.sym, ((scopeNumber(f.scope) << 28) | (f.bits << 22) | f.offset) >>> 0)
  const ids = [idValue(lock.id, 'id'), ...lock.ancestors.map(a => idValue(a, 'ancestor'))]
  return [out, ids.map(id => Uint8Array.of(id >>> 24, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff))]
}

export const dumps = (lock: Lock): string => pyDumps(lock, 1) + '\n'

/** The lockfile as a build carries it after the modules' image: TRAILER, its length (4 bytes, big-endian), then
 * dumps(lock). The unit never reads it; it lets the lockfile be taken back out of a build (fromImage). */
export function trailer(lock: Lock): Uint8Array {
  const text = new TextEncoder().encode(dumps(lock))
  const out = new Uint8Array(12 + text.length)
  out.set(new TextEncoder().encode(TRAILER))
  new DataView(out.buffer).setUint32(8, text.length)
  out.set(text, 12)
  return out
}

/** The lockfile a built main OS image carries (its last trailer), or null. */
export function fromImage(image: Uint8Array): Lock | null {
  const mark = new TextEncoder().encode(TRAILER)
  let at = image.length - mark.length
  while (at >= 0 && !mark.every((b, j) => image[at + j] === b)) at--
  if (at < 0) return null
  const length = new DataView(image.buffer, image.byteOffset).getUint32(at + 8)
  let lock: unknown
  try {
    lock = JSON.parse(new TextDecoder('ascii', { fatal: true }).decode(image.subarray(at + 12, at + 12 + length)))
  } catch {
    throw new ModError("the build's lockfile cannot be read")
  }
  checkLock(lock, (lock as { device?: string } | null)?.device as string)
  return lock as Lock
}
