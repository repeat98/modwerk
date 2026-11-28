// SPDX-License-Identifier: GPL-3.0-or-later
// The page's way into the builder: a fixed set of calls (info, set_stock, add_mod, remove_mod, mods, tick, check,
// version, build) on an in-memory store under fixed paths (/work/stock, /work/mods, /work/core, /work/out). Nothing
// here reads anything else or talks to a network.
import type { Lock } from './store.ts'
import { isAscii, sha } from './bytes.ts'
import { type Device, type Release, devices, linkable, supported } from './devices.ts'
import { EXTS, ModError } from './module-package.ts'
import * as formats from './firmware-formats.ts'
import { LoaderModel, OSError_, Store, suggestedName, withRequirements } from './builder-model.ts'
import { PatchError, basename, dirname } from './firmware-build.ts'
import { KeyError, PyFloat, ValueError, repr, type Loose } from './py.ts'
import { VERSION } from './builder-version.ts'

const WORK = '/work'
export const STOCK = WORK + '/stock', MODS = WORK + '/mods', CORE = WORK + '/core', OUT = WORK + '/out'

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const hundredths = (ms: number) => Math.round(ms / 10) / 100

/** A name from the page: its last path part only. */
function fileName(name: unknown): string {
  const last = basename(String(name).replace(/\\/g, '/')).trim()
  if (last === '' || last === '.' || last === '..') throw new ValueError('no file name')
  return last
}

/** A result as plain JSON values: floats as numbers, Maps as objects (bytes stay bytes). */
function plain(v: unknown): Loose {
  if (v instanceof PyFloat) return v.value
  if (v instanceof Uint8Array) return v
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, plain(x)]))
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}

/** A machine as the page shows it, with the version field a build starts from. */
export function device(d: Device, rel: Release | null = null) {
  const defaultVersion = d.versionOptional ? (rel ? rel.version : '') : d.container === 'ele3' ? '2.0a' : rel ? `${rel.version} ELEK` : ''
  return {
    key: d.key, name: d.name, releases: d.releases.map(r => r.version).sort(order),
    container: d.container, version_len: d.versionLen, exact_len: d.container === 'ele3', recovery: d.recovery,
    card_file: d.container === 'elek', linkable: linkable(d), default_version: defaultVersion,
  }
}

export class Bridge {
  readonly store = new Store()
  // the owner's packages are the library; the site's cores are listed beside them
  readonly model = new LoaderModel(this.store, MODS, [CORE])

  describe(path: string) {
    const d = this.model.describe(path)
    d.builtin = dirname(path) === CORE
    if (!('error' in d)) d.os = this.model.mod(path).rel.version
    return plain(d)
  }

  info() {
    return { version: VERSION, supported: supported(), devices: devices().map(d => device(d)), exts: [...EXTS] }
  }

  /** A core the site carries, checked against the sha256 its catalog pins. */
  addCore(args: { name: string; sha256: string }, data: Uint8Array) {
    const path = CORE + '/' + fileName(args.name)
    if (sha(data) !== args.sha256) throw new ValueError(`${args.name} is not the file the site lists`)
    this.store.write(path, data)
    return this.describe(path)
  }

  /** The stock OS file: known by its hash, or refused and not kept. One at a time. */
  async setStock(args: { name: string }, data: Uint8Array) {
    const name = fileName(args.name)
    for (const p of this.store.list(STOCK)) this.store.remove(p)
    const path = STOCK + '/' + name
    this.store.write(path, data)
    const started = now()
    const stock: Record<string, Loose> = { ...(await this.model.setStock(path)), file: name, ms: Math.round(now() - started) }
    if (stock.ok) stock.dev = device(this.model.dev!, this.model.rel)
    else {
      this.store.remove(path)
      if (!String(stock.error ?? '').includes('Supported:')) stock.supported = supported()
    }
    return stock
  }

  /** A package added to the library: it must load, and, from the catalog, be the one it pins (args.sha256). */
  addMod(args: { name: string; sha256?: string }, data: Uint8Array) {
    const name = fileName(args.name)
    if (!EXTS.some(x => name.toLowerCase().endsWith(x))) return { ok: false, file: name, error: `${name} is not a mod: the file name must end ${EXTS.join(' or ')}` }
    if (args.sha256 && sha(data) !== args.sha256) return { ok: false, file: name, error: `${name} is not the file the shop lists` }
    const path = MODS + '/' + name
    this.store.write(path, data)
    this.model.forget(path) // one replaced under the same name is read again
    try {
      this.model.mod(path)
    } catch (e) {
      if (!(e instanceof ModError || e instanceof OSError_)) throw e
      this.store.remove(path)
      return { ok: false, file: name, error: e.message }
    }
    return { ok: true, mod: this.describe(path) }
  }

  removeMod(args: { path: string }) {
    if (dirname(args.path) !== MODS) throw new ValueError('only mods you added can be removed')
    this.store.remove(args.path)
    return { ok: true }
  }

  mods() { return this.model.files().map(p => this.describe(p)) }

  /** Ticks a package, with the packages it requires. */
  tick(args: { enabled: string[]; path: string }) {
    const descs = new Map(this.model.files().map(p => [p, this.describe(p)]))
    return [...withRequirements(descs, args.enabled, args.path)].sort(order)
  }

  check(args: { enabled: string[] }) { return plain(this.model.check([...args.enabled].sort(order))) }

  /** What is wrong with a version field, or null. */
  private versionProblem(v: string): string | null {
    const dev = this.model.dev!
    try {
      formats.checkVersion(dev, v)
    } catch (e) {
      if (e instanceof formats.FormatError) return `The OS version: ${e.message}.`
      throw e
    }
    if (v && !isAscii(v)) return `The OS version: the version is ${dev.container === 'ele3' ? `exactly ${dev.versionLen}` : `1 to ${dev.versionLen}`} ASCII characters.`
    return null
  }

  /** The version field's problem, if any, and a name for the build. */
  version(args: { version: string; enabled: string[] }) {
    const problem = this.model.dev !== null ? this.versionProblem(args.version) : null
    const out: Record<string, Loose> = problem ? { ok: false, error: problem } : { ok: true }
    out.name = suggestedName(args.enabled.map(p => this.describe(p)), args.version)
    return out
  }

  /** Builds, verifies and saves into /work/out: the facts, every output with its bytes, the log with its times. */
  async build(args: { enabled: string[]; version: string; name: string; store?: Lock | null }, progress?: (line: string) => void) {
    if (!this.model.stock.ok) return { ok: false, error: 'Choose your stock firmware first' }
    if (args.version && !isAscii(args.version)) return { ok: false, error: this.versionProblem(args.version) }
    for (const p of this.store.list(OUT)) this.store.remove(p)
    let name = fileName(args.name)
    if (!name.toLowerCase().endsWith('.syx')) name += '.syx'
    const log: [number, string][] = []
    const started = now()
    const say = (line: string) => {
      log.push([hundredths(now() - started), line])
      if (typeof progress === 'function') progress(line)
    }
    let result
    try {
      result = await this.model.build([...args.enabled].sort(order), args.version || null, OUT + '/' + name, say, args.store ?? null)
    } catch (e) {
      if (e instanceof PatchError) return { ok: false, error: e.message, log, seconds: hundredths(now() - started) }
      throw e
    }
    const rank: Record<string, number> = { syx: 0, bin: 1, json: 2 }
    const kind = (n: string) => rank[n.split('.').pop()!] ?? 3
    const files = this.store.list(OUT).map(p => {
      const data = this.store.read(p)
      return { name: basename(p), path: p, bytes: data.length, sha256: sha(data), data }
    }).sort((a, b) => kind(a.name) - kind(b.name) || order(a.name, b.name))
    return {
      ok: true, files, seconds: hundredths(now() - started), log,
      device: this.model.dev!.name, os: this.model.rel!.version,
      sha256: result.sha256, bytes: result.bytes, version: result.version, flash_end: result.flash_end, headroom: result.headroom,
      gap: result.gap, inplace: result.inplace, mods: result.mods, untouched: result.untouched, recovery: this.model.dev!.recovery,
      // a core with module storage: the lockfile to keep for the next build
      store: result.man.store ?? null,
    }
  }

  /** One call by name, as the worker receives it. */
  async call(name: string, args: Loose = {}, data?: Uint8Array, progress?: (line: string) => void): Promise<unknown> {
    switch (name) {
      case 'info': return this.info()
      case 'add_core': return this.addCore(args, data!)
      case 'set_stock': return this.setStock(args, data!)
      case 'add_mod': return this.addMod(args, data!)
      case 'remove_mod': return this.removeMod(args)
      case 'mods': return this.mods()
      case 'tick': return this.tick(args)
      case 'check': return this.check(args)
      case 'version': return this.version(args)
      case 'build': return this.build(args, progress)
    }
    throw new KeyError(repr(name))
  }
}
