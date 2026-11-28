// SPDX-License-Identifier: GPL-3.0-or-later
// The builder's working state, without a window: an in-memory store of packages and the owner's stock OS, the
// library (the store's packages and the site's folders listed beside it), each package's description, the live
// check of a selection, the build, the requirements a selection pulls in and the core it takes.
import { sha } from './bytes.ts'
import type { Device, Release } from './devices.ts'
import { type AnyMod, EXTS, ModError, apply, cmpVersions, get, pickCore, type Mod } from './module-package.ts'
import * as formats from './firmware-formats.ts'
import { type Mod2, ddrFor, link } from './package-linker.ts'
import { basename, build as buildFirmware, dirname, loadAny, save } from './firmware-build.ts'
import { PyException, truthy, type Loose } from './py.ts'
import type { Lock } from './store.ts'

/** Python's OSError: a path that is not in the store. */
export class OSError_ extends PyException {}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Bytes by absolute path, each with a write counter (what a description's cache is keyed by). */
export class Store {
  private files = new Map<string, Uint8Array>()
  private versions = new Map<string, number>()
  private writes = 0
  write(path: string, data: Uint8Array) { this.files.set(path, data); this.versions.set(path, ++this.writes) }
  read(path: string): Uint8Array {
    const data = this.files.get(path)
    if (!data) throw new OSError_(`[Errno 2] No such file or directory: '${path}'`)
    return data
  }
  exists(path: string): boolean { return this.files.has(path) }
  remove(path: string) { this.files.delete(path); this.versions.delete(path) }
  /** The paths directly in `dir`, sorted. */
  list(dir: string): string[] { return [...this.files.keys()].filter(p => dirname(p) === dir).sort(order) }
  version(path: string): number { return this.versions.get(path) ?? 0 }
}

/** The packages in a folder, sorted. */
export function modFiles(store: Store, folder: string): string[] {
  return EXTS.flatMap(ext => store.list(folder).filter(p => basename(p).endsWith(ext))).sort(order)
}

export type Desc = Record<string, Loose>
export type Stock = Record<string, Loose>

/** The listed packages with this id made for the stock OS, by name, equal names keeping their order. */
function candidates(descs: Map<string, Desc>, id: string): string[] {
  const listed = [...descs].filter(([, d]) => d.id === id && d.fits && !('error' in d)).map(([p]) => p)
  return listed.map((p, i) => ({ p, i })).sort((a, b) => order(basename(a.p), basename(b.p)) || a.i - b.i).map(x => x.p)
}

/** `enabled` and `path`, with the packages `path` requires (and theirs) that are listed for the stock OS and that no
 * enabled package already provides: of several with one id, the last by name, and for the core the one withCore takes. */
export function withRequirements(descs: Map<string, Desc>, enabled: Iterable<string>, path: string): Set<string> {
  const selected = new Set([...enabled, path])
  const pending = [path]
  let needsCore = false
  while (pending.length) {
    for (const id of descs.get(pending.pop()!)?.requires ?? []) {
      if (id === 'core') { needsCore = true; continue }
      if ([...selected].some(p => descs.get(p)?.id === id)) continue
      const found = candidates(descs, id)
      if (!found.length) continue
      selected.add(found[found.length - 1])
      pending.push(found[found.length - 1])
    }
  }
  return needsCore ? withCore(descs, selected) : selected
}

/** `selected` with the core its packages need (resources.core) and whose RAM holds them: the enabled core when it is
 * new enough and holds them (or no listed core does both), else the one pickCore takes of those listed, in its place
 * (the newest when none is new enough, so the check says so). A core holds the set when its area (ram_area) is at
 * least the set's ram_bound plus its own. */
export function withCore(descs: Map<string, Desc>, selected: Set<string>): Set<string> {
  let need: string | null = null
  for (const p of selected) {
    const v = descs.get(p)?.needs_core
    if (v && (need === null || cmpVersions(v, need) > 0)) need = v
  }
  let ram = 0
  for (const p of selected) if (descs.get(p)?.id !== 'core') ram += descs.get(p)?.ram_bound ?? 0
  const newEnough = (p: string) => need === null || cmpVersions(descs.get(p)!.version ?? '', need) >= 0
  const holds = (p: string) => !('ram_area' in descs.get(p)!) || ram + (descs.get(p)!.ram_bound ?? 0) <= descs.get(p)!.ram_area
  const enabled = [...selected].filter(p => descs.get(p)?.id === 'core')
  const listed = candidates(descs, 'core')
  if (enabled.length && enabled.every(newEnough) && (enabled.every(holds) || !listed.some(p => newEnough(p) && holds(p)))) return selected
  if (!listed.length) return selected
  let pick = pickCore(listed.map(p => descs.get(p)!.version ?? ''), need, listed.map(holds))
  if (pick === null) {
    if (enabled.length) return selected
    pick = listed.length - 1
  }
  return new Set([...[...selected].filter(p => !enabled.includes(p)), listed[pick]])
}

/** `paths` with one core when it has several: the one withCore takes. */
export function oneCore(descs: Map<string, Desc>, paths: Iterable<string>): Set<string> {
  const all = [...paths]
  if (all.filter(p => descs.get(p)?.id === 'core').length < 2) return new Set(all)
  return withCore(descs, new Set(all.filter(p => descs.get(p)?.id !== 'core')))
}

export function suggestedName(descs: Desc[], version: string | null): string {
  const ids = descs.map(d => d.id).filter(id => id !== null && id !== undefined && id !== 'core').sort(order)
  return `custom-${version || 'x'}${ids.length ? '-' + ids.join('+') : ''}.syx`
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Python's tuple order for tuples of strings and numbers. */
function tupleOrder(a: unknown[], b: unknown[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] as Loose, y = b[i] as Loose
    if (x < y) return -1
    if (x > y) return 1
  }
  return a.length - b.length
}

export class LoaderModel {
  store: Store
  library: string
  also: string[]
  stock: Stock = { path: null, ok: false, error: 'no stock firmware chosen' }
  img: Uint8Array | null = null
  dev: Device | null = null
  rel: Release | null = null
  private mods = new Map<string, [number, AnyMod]>()

  constructor(store: Store, library: string, also: string[] = []) {
    this.store = store
    this.library = library
    this.also = also
  }

  /** Chooses the stock OS: known by its hash, or refused with why. */
  async setStock(path: string | null): Promise<Stock> {
    const info: Stock = { path, ok: false }
    this.img = this.dev = this.rel = null
    if (!path) info.error = 'no stock firmware chosen'
    else {
      try {
        const [parsed, dev, rel] = await formats.load(this.store.read(path))
        info.sha256 = parsed.sha256
        const image = formats.mainImage(parsed, dev)
        if (sha(image) === rel.mainSha256) {
          this.img = image
          this.dev = dev
          this.rel = rel
          Object.assign(info, { ok: true, device: dev.name, os: rel.version })
        } else info.error = 'its main OS is not the known image'
      } catch (e) {
        info.error = (e as Error).message
      }
    }
    this.stock = info
    return info
  }

  /** The library's packages, then those of the folders beside it whose names it does not have. */
  files(): string[] {
    const listed = modFiles(this.store, this.library)
    const names = new Set(listed.map(basename))
    for (const folder of this.also) for (const p of modFiles(this.store, folder)) {
      if (names.has(basename(p))) continue
      listed.push(p)
      names.add(basename(p))
    }
    return listed
  }

  mod(path: string): AnyMod {
    const version = this.store.version(path)
    const cached = this.mods.get(path)
    if (cached && cached[0] === version) return cached[1]
    const m = loadAny({ path, data: this.store.read(path) })
    this.mods.set(path, [version, m])
    return m
  }

  forget(path: string) { this.mods.delete(path) }

  describe(path: string): Desc {
    const base = { path, file: basename(path) }
    let m: AnyMod
    try {
      m = this.mod(path)
    } catch (e) {
      if (e instanceof ModError || e instanceof OSError_) return { ...base, error: e.message, id: basename(path), label: base.file }
      throw e
    }
    const category = get(m.doc, 'category')
    const d: Desc = {
      ...base, id: m.id, version: m.version, label: m.label(), for_device: m.dev.key, for_label: `${m.dev.name} ${m.rel.version}`,
      fits: this.dev !== null && m.dev.key === this.dev.key && m.rel === this.rel,
      title: get(m.doc, 'title', m.id), description: get(m.doc, 'description', ''),
      category: truthy(category) ? category : (m.format !== 2 ? 'Whole build' : ''),
      author: get(m.doc, 'author', ''), license: get(m.doc, 'license', ''), sha256: m.sha256,
      requires: [...m.requires], conflicts: [...m.conflicts], names: [...m.names], needs_core: m.needsCore ?? null,
    }
    // each site with the last relocation target it names
    d.sites = m.sites.map(s => [s.addr, s.len, s.kind, (s.relocs.length ? (t => (t.startsWith('sym:') ? t.slice(4) : t))(s.relocs[s.relocs.length - 1][2]) : '')])
    if (m.format !== 2) return Object.assign(d, { format: 1, ram: m.blob ? m.blob.len : 0, fast: 0, events: [], adds_to: [], tables: [], regions: [] })
    const m2 = m as Mod2
    d.format = 2
    d.ram = m2.size('.run') + m2.size('.bss')
    d.fast = m2.size('.fast')
    d.ram_bound = m2.ramBound()
    if (m2.sections.has('.boot')) { // a core: the linker's area with it
      const [lo, hi] = ddrFor(m2.dev, m2.version)
      d.ram_area = hi - lo
    }
    d.events = m2.contribute.filter(c => c.to.startsWith('ev_')).map(c => {
      if (!c.relocs.length) throw new Error('IndexError: list index out of range')
      return [c.to, c.order, c.relocs[0][2].slice(4)]
    }).sort(tupleOrder)
    d.adds_to = [...new Set(m2.contribute.filter(c => !c.to.startsWith('ev_')).map(c => c.to))].sort(order)
    d.tables = [...m2.collections.keys()].sort(order)
    d.regions = m2.regions.map(g => [g.name, g.lo, g.hi])
    return d
  }

  /** {ok, headline, problems, status: {path: [state, text]}, ...} for a selection. */
  check(paths: string[]): Record<string, Loose> {
    const descs = new Map(paths.map(p => [p, this.describe(p)]))
    const status: Record<string, [string, string]> = {}
    if (!this.stock.ok) return { ok: false, headline: 'Choose your stock firmware first', problems: [this.stock.error ?? 'no stock firmware'], status }
    const foreign = paths.filter(p => !descs.get(p)!.fits)
    if (foreign.length) {
      for (const p of foreign) status[p] = ['warn', 'For ' + (descs.get(p)!.for_label ?? '?')]
      return { ok: false, headline: 'Made for other firmware', status, problems: foreign.map(p => `${descs.get(p)!.label} is made for ${descs.get(p)!.for_label ?? '?'}; your stock firmware is ${this.dev!.name} ${this.rel!.version}`) }
    }
    if (!paths.length) return { ok: false, headline: 'No mods enabled', problems: [], status, empty: true }
    const started = now()
    let mods: AnyMod[]
    let linked
    try {
      mods = paths.map(p => this.mod(p))
      const linkable = mods.filter(m => m.format === 2)
      if (linkable.length && linkable.length !== mods.length) {
        const whole = paths.filter(p => this.mod(p).format !== 2).map(p => descs.get(p)!.label)
        throw new ModError(`x:\n  ${whole.join(', ')} is a whole build: it cannot be combined with separate mods`)
      }
      if (!linkable.length) {
        const image = apply(mods as Mod[], this.img!)
        for (const p of paths) status[p] = ['ok', 'Enabled']
        return { ok: true, format: 1, ms: Math.round(now() - started), order: mods.map(m => m.label()), status, blob: image.length - this.img!.length, sites: mods.reduce((n, m) => n + m.sites.length, 0) }
      }
      linked = link(mods as Mod2[], this.img!)
    } catch (e) {
      if (!(e instanceof ModError) && !(e instanceof OSError_)) throw e
      const detail = e.message.split('\n').slice(1).map(x => x.trim())
      const lines = detail.length ? detail : [e.message]
      for (const p of paths) {
        const d = descs.get(p)!
        const missing = (d.requires ?? []).filter((r: string) => !paths.some(q => descs.get(q)!.id === r))
        if (missing.length) status[p] = ['warn', 'Needs ' + missing.join(', ')]
        else if (lines.some(x => x.includes(d.label) || x.startsWith(d.id + ' '))) status[p] = ['bad', 'Conflict']
        else status[p] = ['ok', 'Enabled']
      }
      return { ok: false, headline: 'Conflicts: the firmware cannot be built', problems: lines, status, ms: Math.round(now() - started) }
    }
    const position = new Map(linked.order.map((label, i) => [label, i + 1]))
    for (const p of paths) status[p] = ['ok', 'Enabled']
    const layout = linked.layout
    const loadOrder: Record<string, number | null> = {}
    for (const p of paths) loadOrder[p] = position.get(descs.get(p)!.label) ?? null
    return {
      ok: true, format: 2, ms: Math.round(now() - started), status, order: linked.order, load_order: loadOrder,
      ram: [layout.bss[1] - layout.ddr[0], layout.ddr_size], fast: [layout.fast[1] - layout.fast[0], layout.fast_size],
      blob: layout.blob_len, sites: mods.reduce((n, m) => n + m.sites.length, 0),
    }
  }

  /** Builds, verifies and writes outPath (and its manifest and map) into the store: the facts and the files. */
  async build(paths: string[], version: string | null, outPath: string, log: (line: string) => void = () => {}, lock: Lock | null = null) {
    const [outputs, manifest] = await buildFirmware({ path: this.stock.path, data: this.store.read(this.stock.path) }, paths.map(p => ({ path: p, data: this.store.read(p) })), version || null, false, log, lock)
    const files = save(outputs!, manifest, outPath)
    for (const f of files) this.store.write(f.path, f.data)
    const output = manifest.output
    return {
      path: outPath, files, sha256: output.sha256, bytes: output.bytes, version: manifest.version, flash_end: output.flash_end,
      headroom: output.flash_headroom, gap: output.main.inplace_min_gap ?? null, inplace: output.main.inplace ?? '',
      mods: manifest.mods.map((m: Record<string, string>) => m.id + ' ' + m.version), untouched: output.untouched, man: manifest,
    }
  }
}
