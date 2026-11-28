// SPDX-License-Identifier: GPL-3.0-or-later
// The owner's stock OS file and a set of module packages into a custom firmware, in fixed steps that stop at the
// first failure:
//   1. the stock file must be a known release (by its sha256), and its main OS the known image;
//   2. every package must be made for that release;
//   3. the static checks, the machine's protected ranges included (in apply or link);
//   4. apply the sites (format 1) or link the packages (format 2);
//   5. repack the main OS and rebuild the OS file: only the main OS and the version field change;
//   6. verify every output with the readers, not the writers;
//   7. the .syx and, for a machine with a card file (the Octatrack), the .bin; a manifest with every hash, and for
//      linked packages the symbol map.
// Files here are bytes with a path, never a file system.
import { sha } from './bytes.ts'
import { UnknownFirmware } from './devices.ts'
import { type AnyMod, Mod, ModError, apply, formatOf, get, pyEq, readJson } from './module-package.ts'
import * as formats from './firmware-formats.ts'
import { Mod2, link, type Linked } from './package-linker.ts'
import { dumps, hex8, hexw, repr, str, truthy, type Loose } from './py.ts'
import type { Lock } from './store.ts'

export class PatchError extends Error {}

export type File = { path: string; data: Uint8Array }

export const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
export const dirname = (p: string): string => {
  const slash = p.lastIndexOf('/')
  return slash > 0 ? p.slice(0, slash) : p.startsWith('/') ? '/' : ''
}

/** An in-memory path made absolute: '..', '.' and doubled slashes resolved. */
export function abspath(p: string): string {
  const parts: string[] = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

/** A format-1 Mod or a format-2 Mod2, by the package's format number. */
export function loadAny(file: File): AnyMod {
  const doc = readJson(file.data, file.path) as Record<string, Loose>
  const name = basename(file.path)
  return pyEq(formatOf(doc), 2) ? new Mod2(doc, name, file.data) : new Mod(doc, name, file.data)
}

const padRight = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const byKey = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0)

/** Runs `f`, turning an expected error into a PatchError with `prefix` before its message. */
async function asPatchError<T>(f: () => T | Promise<T>, kinds: (new (...a: Loose[]) => Error)[], prefix = ''): Promise<T> {
  try {
    return await f()
  } catch (e) {
    if (kinds.some(kind => e instanceof kind)) throw new PatchError(prefix + (e as Error).message)
    throw e
  }
}

/** The outputs ({syx[, bin]}, or null with checkOnly) and the manifest. `stock` is the stock file (or Elektron's
 * zip); `lock` is the module storage lockfile (null for a new one), the new one being the manifest's `store`. */
export async function build(stock: File, packageFiles: File[], version: string | null = null, checkOnly = false,
  log: (line: string) => void = () => {}, lock: Lock | null = null): Promise<[formats.Outputs | null, Record<string, Loose>]> {
  const [parsed, dev, rel] = await asPatchError(() => formats.load(stock.data), [UnknownFirmware, formats.FormatError], `${stock.path}: `)
  const stockMain = formats.mainImage(parsed, dev)
  if (sha(stockMain) !== rel.mainSha256) throw new PatchError(`its main OS is not the known ${dev.name} ${rel.version} image`)
  log(`stock: ${dev.name} OS ${rel.version} (${parsed.sha256})`)

  const mods: AnyMod[] = []
  for (const file of packageFiles) {
    const m = await asPatchError(() => loadAny(file), [ModError])
    if (m.dev.key !== dev.key || m.rel !== rel) throw new PatchError(`${m.label()} is made for ${m.dev.name} ${m.rel.version}; your stock firmware is ${dev.name} ${rel.version}`)
    log(`mod ${padRight(m.label(), 24)} ${m.sites.length} sites${m.blob ? `, blob ${m.blob.len} bytes` : ''}  (file sha256 ${m.sha256!.slice(0, 16)})`)
    mods.push(m)
  }
  if (!mods.length) throw new PatchError('no mods given')
  const linkable = mods.filter(m => m.format === 2) as Mod2[]
  let linked: Linked | null = null
  const image = await asPatchError(() => {
    if (!linkable.length) return apply(mods as Mod[], stockMain)
    if (linkable.length !== mods.length) throw new ModError('a whole-build bundle (format 1) cannot be combined with separate mods (format 2)')
    linked = link(linkable, stockMain, lock)
    return linked.image
  }, [ModError])
  log('the mods combine: no overlaps, stock bytes as expected, code sites whole instructions')

  const manifest: Record<string, Loose> = {
    patcher: 'modwerk', device: dev.key,
    stock: { path: abspath(stock.path), sha256: parsed.sha256, os: rel.version, main_sha256: sha(stockMain) },
    mods: mods.map(m => ({
      id: m.id, version: m.version, file: m.name, sha256: m.sha256, format: m.format, sites: m.sites.length,
      regions: m.regions.map(g => ({ name: g.name, lo: hex8(g.lo), hi: hex8(g.hi), area: g.area })), names: m.names,
    })),
    main_sha256: sha(image),
    main_len: image.length,
  }
  if (linked) {
    const { layout, order, tables, map, store, storeNotes } = linked as Linked
    log(`linked ${order.join(', ')}: RAM ${hex8(layout.ddr[0])}-${hex8(layout.bss[1])} (${layout.ddr_spare} bytes spare), .fast to ${hex8(layout.fast[1])} (${layout.fast_spare} spare), blob ${layout.blob_len} bytes`)
    manifest.link = { order, layout, tables: Object.fromEntries([...tables].sort(byKey).map(([t, [at, entries, entry]]) => [t, { at: hex8(at), entries, entry }])) }
    manifest._map = map
    if (store !== null) {
      manifest.store = store
      for (const note of storeNotes) log('storage: ' + note)
    }
  }
  if (mods.length === 1 && !linkable.length) {
    const recorded = get(mods[0].doc, 'build')
    const want = get(truthy(recorded) ? recorded : {}, 'section3_sha256')
    if (truthy(want)) {
      manifest.bundle_matches_build = want === sha(image)
      if (want !== sha(image)) throw new PatchError('the bundle does not reproduce its build\'s main OS')
      log(`the main OS matches the build the bundle came from (sha256 ${sha(image).slice(0, 16)})`)
    }
  }
  if (checkOnly) return [null, manifest]

  if (version === null) {
    const named: unknown[] = []
    for (const m of mods) {
      const v = get(m.doc, 'ele3_version')
      if (v !== null && !named.includes(v)) named.push(v)
    }
    if (!named.length && dev.versionOptional) named.push(parsed.version)
    if (named.length !== 1) {
      const sorted = [...named].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
      throw new PatchError(`give --version (${dev.container === 'ele3' ? `${dev.versionLen} characters` : `up to ${dev.versionLen} characters`}): the mods name ${sorted.length ? repr(sorted) : 'no version'}`)
    }
    version = str(named[0])
  }
  const shown = version
  await asPatchError(() => formats.checkVersion(dev, shown), [formats.FormatError])
  const started = now()
  const stored = formats.packMain(image, dev)
  log(`packed the main OS: ${image.length} -> ${stored.length} bytes (${((now() - started) / 1000).toFixed(1)} s)`)
  const [outputs, facts] = await asPatchError(() => {
    const written = formats.write(parsed, stored, dev, shown)
    return [written, formats.verify(written, parsed, image, dev, shown)] as const
  }, [formats.FormatError], 'the output failed verification: ')
  const gap = facts.main.inplace_min_gap
  log(`verified: ${facts.untouched.join('; ')}; the main OS depacks to the patched image${gap !== null && gap !== undefined ? ` in place (min gap ${gap} bytes)` : ''}; flash ends ${facts.flash_end} (${facts.flash_headroom} bytes spare)`)
  manifest.version = version
  manifest.output = facts
  return [outputs, manifest]
}

/** The path of a second output beside `path` (the .bin beside a .syx). */
export function companion(path: string, kind: string): string {
  const base = basename(path), dot = base.lastIndexOf('.')
  const extension = dot > 0 ? base.slice(dot) : ''
  return (extension.toLowerCase() === '.syx' ? path.slice(0, path.length - extension.length) : path) + '.' + kind
}

const encoder = new TextEncoder()

/** The .syx at `path` (and the .bin beside it), the symbol map and the manifest beside it, in that order. Moves the
 * map out of `manifest` and records the paths in it. */
export function save(outputs: formats.Outputs, manifest: Record<string, Loose>, path: string): File[] {
  const written: File[] = (Object.entries(outputs) as [string, Uint8Array][]).map(([kind, data]) => ({ path: kind === 'syx' ? path : companion(path, kind), data }))
  manifest.output.path = abspath(path)
  if (outputs.bin) manifest.output.bin_path = abspath(companion(path, 'bin'))
  const map = manifest._map as Map<string, number> | undefined
  delete manifest._map
  if (map !== undefined) {
    const sorted = [...map].sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x - y))
    written.push({ path: path + '.map.json', data: encoder.encode(dumps(new Map(sorted.map(([k, v]) => [k, '0x' + hexw(v, 8)])), 0)) })
    manifest.map = basename(path) + '.map.json'
  }
  written.push({ path: path + '.json', data: encoder.encode(dumps(manifest, 1)) })
  return written
}
