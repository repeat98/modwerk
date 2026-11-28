// SPDX-License-Identifier: GPL-3.0-or-later
// Whether a Digitakt mk1 or Digitone mk1 core is a drop-in for the modules that ship today: every catalogue module of
// the machine, alone and (with pairs) two at a time, with what it requires, linked against the core by the site's own
// linker (package-linker.ts). Without the owner's stock OS the link is stockless: the checks that need no stock bytes
// run on a zero image, and the layout and relocations run with the sites set aside (their stock bytes are unknown).
// npm run digi:link-all (scripts/digi-link-all.ts) prints the summary.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import CATALOG_JSON from '../../../vendor/elekloader/catalog/catalog.json' with { type: 'json' }
import { cmpVersion, parseCatalog, planBuild, type Catalog, type CatalogMod, type Pin } from '../elektron/builder-catalog.ts'
import { sha } from '../elektron/bytes.ts'
import { DIGITAKT_MK1, DIGITONE_MK1, type Device, type Release } from '../elektron/devices.ts'
import { ModError, readJson, summarize } from '../elektron/module-package.ts'
import { oddJumpsInElemod } from '../elektron/odd-jumps.ts'
import { Mod2, check, ddrFor, link, type Linked } from '../elektron/package-linker.ts'
import { PyException, type Loose } from '../elektron/py.ts'

export const MACHINES = { digitakt: DIGITAKT_MK1, digitone: DIGITONE_MK1 } as const
export type Machine = keyof typeof MACHINES
const CATALOG_DIR = new URL('../../../vendor/elekloader/catalog/', import.meta.url)

/** What a stockless link cannot prove; a link with the stock OS (--stock) proves all of it. */
export const STOCKLESS_GAPS = [
  'each site\'s stock bytes match its stock_sha256, and a code site is whole instructions before and after relocation',
  'other modules\' sites inside a module\'s copied block (PC-relative code there)',
  'sound-slot claims read from stock bytes (Digitone core_params descriptors built from stock parts)',
]

export type Failure = { mods: string[]; reasons: string[] }
export type Group = { ok: number; failed: Failure[] }
export type OsResult = {
  os: string; stock: boolean
  /** The core each linked set took, and how many sets; sets that link only on an older core than the build picks first. */
  cores: Record<string, number>; fallbacks: string[]; modules: string[]
  singles: Group; pairs?: Group & { conflicts: string[][]; clashes: Failure[] }
}
export type Result = { machine: Machine; device: string; oses: OsResult[] }

/** A fresh copy of a loaded package for one link: check() adds implied names to `names`, so no set sees another's. */
const fresh = (m: Mod2, patch: Partial<Mod2> = {}): Mod2 => Object.assign(Object.create(Mod2.prototype) as Mod2, m, { names: [...m.names] }, patch)
const reasonsOf = (e: unknown) => {
  if (!(e instanceof ModError || e instanceof PyException)) throw e
  return e.message.split('\n').map(line => line.trim()).filter(line => line && !line.endsWith(':'))
}
const STOCK_BYTES = ': the stock bytes are not the ones it expects'

/** A zero image the size of a release's main OS, and the release as that image: hashed once, as the hash is most of a
 * link's time. */
const blanks = new Map<Release, [Uint8Array, Release]>()
function blank(rel: Release): [Uint8Array, Release] {
  if (!blanks.has(rel)) { const zeros = new Uint8Array(rel.mainLen); blanks.set(rel, [zeros, { ...rel, mainSha256: sha(zeros) }]) }
  return blanks.get(rel)!
}

/** Problems linking `set` (one core first, then packages), with the stock main OS or without it. */
export function linkSet(set: Mod2[], stock: Uint8Array | null): string[] {
  try {
    if (stock) { link(set.map(m => fresh(m)), stock); return oddJumps(set) }
    const [zeros, rel] = blank(set[0].rel), copies = set.map(m => fresh(m))
    const problems = summarize(check(copies, zeros).filter(p => !p.endsWith(STOCK_BYTES)), copies)
    if (problems.length) return problems
    // layout, tables and every section's relocation, with the sites (stock bytes) set aside; their relocations below
    const linked = link(set.map(m => fresh(m, { sites: [], copied: [], rel })), zeros)
    return [...siteRelocs(set, linked), ...oddJumps(set)]
  } catch (e) {
    return reasonsOf(e)
  }
}

/** Each site relocation resolves as link() resolves it, and a pc16 one reaches. */
function siteRelocs(set: Mod2[], linked: Linked): string[] {
  const problems: string[] = [], exported = new Set(set.flatMap(m => m.exports))
  for (const m of set) for (const s of m.sites) for (const [offset, type, target, addend] of s.relocs) {
    if (target === 'abs') continue
    const [kind, name] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
    let value: number | undefined
    if (kind === 'sec') value = linked.layout.sections[`${m.id} ${name}`]
    else if (m.symbols.has(name)) value = linked.map.get(`${m.id}:${name}`)
    else if (exported.has(name) || m.imports.includes(name)) value = linked.map.get(name) ?? (m.weak.has(name) ? linked.map.get('core_zero') : undefined)
    const where = `${m.label()} site 0x${s.addr.toString(16).padStart(8, '0')}+${offset}`
    if (value === undefined) { problems.push(`${where} refers to ${name}, which nothing defines`); continue }
    const distance = value + addend - (s.addr + offset)
    if (type === 'pc16' && (distance < -0x8000 || distance >= 0x8000)) problems.push(`${where}: a 16-bit PC-relative reference spans ${distance} bytes`)
  }
  return problems
}

function oddJumps(set: Mod2[]): string[] {
  const { dev, rel } = set[0], docs = set.map(m => m.doc as Parameters<typeof oddJumpsInElemod>[0])
  const machine = { mainLoad: dev.mainLoad, mainLength: rel.mainLen, areas: [...Object.values(dev.areas), dev.ddr, dev.sramCode] }
  return set.flatMap((m, i) => oddJumpsInElemod(docs[i], machine, docs).map(p => `${m.label()} ${p}`))
}

/** A package file, by path, as the builder loads it. */
export function loadPackage(path: string | URL, name = String(path).split('/').pop()!): Mod2 {
  const raw = new Uint8Array(readFileSync(path))
  return new Mod2(readJson(raw, name) as Record<string, Loose>, name, raw)
}

export type Options = { machine: Machine; core?: string; os?: string; pairs?: boolean; stock?: Record<string, Uint8Array>; catalog?: Catalog; packages?: string[] }

/** The catalogue with each given package file in place of the catalogue's packages of its id, device and OS (a base's
 * companions, such as the Digitakt base's code-free machine-pages, before they are in the catalogue). */
export function withPackages(catalog: Catalog, paths: readonly string[]): Catalog {
  const pins = paths.map(path => {
    const m = loadPackage(path), doc = m.doc as Record<string, unknown>
    const pin: CatalogMod = { file: pathToFileURL(resolve(path)).href, sha256: m.sha256!, id: m.id, version: m.version, device: m.dev.key, os: m.rel.version,
      license: String(doc.license), source: { repo: 'repeat98/modwerk', commit: '0'.repeat(40), path: 'local' }, title: String(doc.title),
      requires: m.requires, conflicts: m.conflicts, ...(m.needsCore ? { needs_core: m.needsCore } : {}) }
    return pin
  })
  const replaced = (p: Pin) => pins.some(q => q.id === p.id && q.device === p.device && q.os === p.os)
  return { ...catalog, mods: [...catalog.mods.filter(m => !replaced(m)), ...pins] }
}

/** The run: per OS, every module alone and, with pairs, every pair the metadata allows. */
export function linkAll(options: Options): Result {
  const dev: Device = MACHINES[options.machine]
  const catalog = withPackages(options.catalog ?? parseCatalog(CATALOG_JSON), options.packages ?? [])
  const loaded = new Map<string, Mod2>()
  const load = (pin: Pin) => {
    if (!loaded.has(pin.file)) {
      const m = loadPackage(new URL(pin.file, CATALOG_DIR), pin.file)
      if (m.sha256 !== pin.sha256) throw new Error(`${pin.file} is not the file the catalogue pins`)
      loaded.set(pin.file, m)
    }
    return loaded.get(pin.file)!
  }
  const given = options.core ? loadPackage(options.core) : null
  if (given && (given.dev.key !== dev.key || !given.sections.has('.boot'))) throw new Error(`${options.core} is not a ${dev.name} core`)
  if (given && options.os && given.rel.version !== options.os) throw new Error(`${options.core} is for OS ${given.rel.version}, not ${options.os}`)
  const forDevice = (p: Pin) => p.device === dev.key
  const oses = given ? [given.rel.version] : options.os ? [options.os]
    : dev.releases.map(r => r.version).filter(os => [...catalog.cores, ...catalog.mods].some(p => forDevice(p) && p.os === os)).sort(cmpVersion)

  return {
    machine: options.machine, device: dev.key,
    oses: oses.map(os => {
      const stock = options.stock?.[os] ?? null
      const ids = [...new Set(catalog.mods.filter(m => forDevice(m) && m.os === os).map(m => m.id))].sort()
      const cores: Record<string, number> = {}, fallbacks: string[] = []
      const coreLabel = (core: Mod2) => `${core.label()} (${core.name})`
      /** The core prepare() picks for these ids from `cut` (needs_core, then RAM), and the packages they bring. */
      const plan = (selection: string[], cut: Catalog) => {
        const first = planBuild(cut, dev.key, os, selection)
        const ram = first.mods.reduce((n, p) => n + load(p).ramBound(), 0)
        const holds = (pin: Pin) => { const c = load(pin), [lo, hi] = ddrFor(dev, c.version); return ram + c.ramBound() <= hi - lo }
        return { ...first, core: planBuild(cut, dev.key, os, selection, holds).core }
      }
      /** The given core, or as prepareBuild does: the picked core, then each older one while the set is refused. */
      const run = (selection: string[]): string[] => {
        let cut = catalog, first: string[] | undefined
        const refused: string[] = []
        for (;;) {
          const p = plan(selection, cut)
          if (p.missing.length) return [`not available for OS ${os}: ${p.missing.join(', ')}`]
          const core = given ?? (p.core ? load(p.core) : null)
          if (!core) return first ?? [`no core for OS ${os}`]
          const reasons = linkSet([core, ...p.mods.map(load)], stock)
          if (!reasons.length) {
            cores[coreLabel(core)] = (cores[coreLabel(core)] ?? 0) + 1
            if (refused.length) fallbacks.push(`${selection.join(' + ')}: refused on ${refused.join(', ')}, links on ${core.label()} (${(first ?? []).join('; ')})`)
            return []
          }
          first ??= reasons
          if (given) return reasons
          refused.push(core.label())
          cut = { ...cut, cores: cut.cores.filter(c => c !== p.core) }
        }
      }
      if (!given && !ids.length) { const core = plan([], catalog).core; if (core) cores[coreLabel(load(core))] = 0 }
      const singles: Group = { ok: 0, failed: [] }
      for (const id of ids) {
        const reasons = run([id])
        if (reasons.length) singles.failed.push({ mods: [id], reasons }); else singles.ok++
      }
      const result: OsResult = { os, stock: !!stock, cores, fallbacks, modules: ids, singles }
      if (options.pairs) {
        const pairs = { ok: 0, failed: [] as Failure[], conflicts: [] as string[][], clashes: [] as Failure[] }
        const declared = (mods: CatalogMod[]) => mods.some(a => mods.some(b => a !== b && (a.conflicts.includes(b.id) || load(a).conflicts.includes(b.id))))
        for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) {
          if (declared(planBuild(catalog, dev.key, os, [a, b]).mods)) { pairs.conflicts.push([a, b]); continue }
          const reasons = run([a, b])
          if (!reasons.length) { pairs.ok++; continue }
          // two modules that patch one place or claim one name clash with each other, not with the core
          const clash = reasons.every(r => (r.includes(' overlap') || r.includes(' both claim ')) && !r.includes('core '))
          ;(clash ? pairs.clashes : pairs.failed).push({ mods: [a, b], reasons })
        }
        result.pairs = pairs
      }
      return result
    }),
  }
}

export const failed = (result: Result) => result.oses.some(o => o.singles.failed.length || o.pairs?.failed.length)

/** The summary for a person: the same run prints the same text. */
export function summaryText(result: Result): string {
  const dev = MACHINES[result.machine], lines = [`digi:link-all ${result.machine} (${dev.name})`]
  for (const o of result.oses) {
    const cores = Object.entries(o.cores).map(([core, n]) => `${core} ${n} sets`).join(', ') || 'none'
    lines.push('', `OS ${o.os}  ${o.stock ? 'with the stock OS' : 'stockless'}  ${o.modules.length} modules  core: ${cores}`)
    lines.push(`  singles  ${o.singles.ok} ok, ${o.singles.failed.length} failed`)
    if (o.pairs) lines.push(`  pairs    ${o.pairs.ok} ok, ${o.pairs.failed.length} failed, ${o.pairs.clashes.length} module clashes, ${o.pairs.conflicts.length} declared conflicts skipped`)
    for (const f of o.singles.failed) lines.push(`  FAIL   ${f.mods.join(' + ')}: ${f.reasons.join('; ')}`)
    for (const f of o.pairs?.failed ?? []) lines.push(`  FAIL   ${f.mods.join(' + ')}: ${f.reasons.join('; ')}`)
    for (const f of o.pairs?.clashes ?? []) lines.push(`  CLASH  ${f.mods.join(' + ')}: ${f.reasons.join('; ')}`)
    for (const f of o.fallbacks) lines.push(`  OLDER  ${f}`)
    for (const c of o.pairs?.conflicts ?? []) lines.push(`  SKIP   ${c.join(' + ')}: declared conflict`)
  }
  if (result.oses.some(o => !o.stock)) lines.push('', 'A stockless link does not prove (pass --stock for these):', ...STOCKLESS_GAPS.map(g => `  - ${g}`))
  return lines.join('\n') + '\n'
}
