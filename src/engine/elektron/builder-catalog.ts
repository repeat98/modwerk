// SPDX-License-Identifier: GPL-3.0-or-later
// The catalog the site serves its builder: the cores and packages it may fetch, each pinned by sha256 to a file the
// site serves beside catalog.json, with where it comes from (an author's GitHub release, or a repository at a commit).
import { cmpVersions, pickCore } from './module-package.ts'

export const CATALOG_SCHEMA = 1
// shortcut: the catalog kind and package names below are the ones today's served catalog carries; they change with
// Modwerk's own package format.
const KIND = 'elekloader-catalog'

export type Source = { repo: string; tag: string } | { repo: string; commit: string; path: string }
/** A file the builder may fetch: what it says about itself, its sha256 and its source; `file` is its unique name. */
export type Pin = { file: string; sha256: string; id: string; version: string; device: string; os: string; license: string; source: Source }
/** A package, with what a page shows: title, summary, requirements and what was checked on a unit. */
export type CatalogMod = Pin & {
  title: string; requires: string[]; conflicts: string[]; summary?: string; description?: string; category?: string
  author?: string; needs_core?: string; on_unit?: string
}
export type Catalog = { schema: 1; kind: typeof KIND; revision: string; about?: string; cores: Pin[]; mods: CatalogMod[] }

export class CatalogError extends Error {}

const HEX64 = /^[0-9a-f]{64}$/, COMMIT = /^[0-9a-f]{40}$/
const FILE = /^[\w.-]+\.(elemod|dtmod)$/, REPO = /^[\w.-]+\/[\w.-]+$/, PATH = /^[\w.-]+(\/[\w.-]+)*$/
const nonEmpty = (v: unknown) => typeof v === 'string' && v !== ''

/** Versions in order, numbers as numbers (2.10 after 2.9). */
export const cmpVersion = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

function pin(v: unknown, at: string): Pin {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new CatalogError(`${at}: not an object`)
  const p = v as Record<string, unknown>
  if (!nonEmpty(p.file) || !FILE.test(p.file as string)) throw new CatalogError(`${at}: "file" is a plain .elemod or .dtmod file name`)
  const where = `${at} (${p.file})`
  if (!nonEmpty(p.sha256) || !HEX64.test(p.sha256 as string)) throw new CatalogError(`${where}: "sha256" is 64 lowercase hex digits`)
  for (const k of ['id', 'version', 'device', 'os']) if (!nonEmpty(p[k])) throw new CatalogError(`${where}: no "${k}"`)
  if (typeof p.license !== 'string') throw new CatalogError(`${where}: no "license"`)
  const s = p.source as Record<string, unknown> | undefined
  if (!s || !nonEmpty(s.repo) || !REPO.test(s.repo as string)) throw new CatalogError(`${where}: "source" names a GitHub repository (owner/name)`)
  if ('commit' in s) {
    const plainPath = nonEmpty(s.path) && PATH.test(s.path as string) && !(s.path as string).split('/').includes('..')
    if (!nonEmpty(s.commit) || !COMMIT.test(s.commit as string) || !plainPath) throw new CatalogError(`${where}: a commit source has the whole commit id and a plain path in the repository`)
  } else if (!nonEmpty(s.tag)) throw new CatalogError(`${where}: "source" has a release "tag", or a "commit" and "path"`)
  return p as Pin
}

/** A catalog, checked: every pin whole, file names unique, the cores cores. Throws CatalogError. */
export function parseCatalog(value: unknown): Catalog {
  const c = value as Record<string, unknown>
  if (!c || typeof c !== 'object' || c.kind !== KIND) throw new CatalogError('not a builder catalog')
  if (c.schema !== CATALOG_SCHEMA) throw new CatalogError(`catalog schema ${String(c.schema)}: this builder reads schema ${CATALOG_SCHEMA}`)
  if (!nonEmpty(c.revision)) throw new CatalogError('the catalog has no "revision"')
  if (!Array.isArray(c.cores) || !Array.isArray(c.mods)) throw new CatalogError('the catalog has no "cores" and "mods" lists')
  const names = new Set<string>()
  const unique = (p: Pin) => {
    if (names.has(p.file)) throw new CatalogError(`two entries named ${p.file}`)
    names.add(p.file)
    return p
  }
  c.cores.forEach((v, i) => {
    const p = unique(pin(v, `cores[${i}]`))
    if (p.id !== 'core') throw new CatalogError(`cores[${i}] (${p.file}) is ${p.id}, not a core`)
  })
  c.mods.forEach((v, i) => {
    const p = unique(pin(v, `mods[${i}]`)) as CatalogMod
    if (!nonEmpty(p.title)) throw new CatalogError(`mods[${i}] (${p.file}): no "title"`)
    for (const k of ['requires', 'conflicts'] as const) if (!Array.isArray(p[k]) || !p[k].every(nonEmpty)) throw new CatalogError(`mods[${i}] (${p.file}): "${k}" is a list of mod ids`)
  })
  return c as Catalog
}

/** Where a pinned file can be downloaded from its source (the builder itself fetches only the site's copy). */
export function sourceUrl(p: Pin): string {
  const s = p.source
  return 'commit' in s ? `https://raw.githubusercontent.com/${s.repo}/${s.commit}/${s.path}` : `https://github.com/${s.repo}/releases/download/${encodeURIComponent(s.tag)}/${encodeURIComponent(p.file)}`
}

export type Plan = { core?: Pin; mods: CatalogMod[]; missing: string[] }

/** The catalog files for a selection of package ids on one machine and OS: each brings the packages it requires,
 * required ones first; ids with no file for that OS are `missing`. The core is the one pickCore takes for that OS
 * and every chosen package's needs_core; with `holds` (once loaded), only cores whose RAM holds them count. */
export function planBuild(catalog: Catalog, device: string, os: string, ids: readonly string[], holds?: (core: Pin) => boolean): Plan {
  const forOs = (p: Pin) => p.device === device && p.os === os
  const mods: CatalogMod[] = [], missing: string[] = []
  const add = (id: string, path: string[]) => {
    if (mods.some(m => m.id === id) || missing.includes(id)) return
    const m = catalog.mods.filter(x => x.id === id && forOs(x)).sort((a, b) => cmpVersion(b.version, a.version))[0] as CatalogMod | undefined
    if (!m) { missing.push(id); return }
    for (const r of m.requires) if (r !== 'core' && !path.includes(r)) add(r, [...path, id])
    mods.push(m)
  }
  for (const id of ids) add(id, [])
  const need = mods.map(m => m.needs_core).filter((v): v is string => !!v).sort(cmpVersions).pop() ?? null
  const cores = catalog.cores.filter(forOs)
  const i = pickCore(cores.map(c => c.version), need, holds ? cores.map(holds) : null)
  return { core: i === null ? undefined : cores[i], mods, missing }
}

/** The OS versions a package has a file for on a machine. */
export const releases = (catalog: Catalog, device: string, id: string): string[] => [...new Set(catalog.mods.filter(m => m.device === device && m.id === id).map(m => m.os))].sort(cmpVersion)
