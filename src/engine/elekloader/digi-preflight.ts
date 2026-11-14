// SPDX-License-Identifier: GPL-3.0-or-later
// Preflight: a second, independent check of a built OS file before the page offers it, with Modwerk's own reader and
// stock-write checker rather than the builder that made it. It re-reads the owner's stock file and the build and refuses
// unless every section but the main OS is byte for byte stock, the container fits the flash, and every changed byte of
// the main OS lies inside a site that one of the build's own mod files declares and guards, with only the mods' code
// and data appended, and no mod file refers to the raw block write to the +Drive. It reads the two files and the mod
// files; nothing runs and nothing is sent anywhere. The builder's own verification (framing, checksums, the seal, the
// in-place depack) still runs first; this adds what it does not.
import { ELE3_DEVICES, mainImage, readEle3Syx, type Ele3Device, type ElemodMachine } from '../elektron/ele3.ts'
import { LINK_DEVICES, parseElemod, type ParsedMod } from '../elektron/elemod.ts'
import { sha256Hex } from '../elektron/hash.ts'
import { StockWriteError, checkStockWrites, type DeclaredSite, type StockMap } from '../elektron/stock-writes.ts'
import { TRAILER } from '../../../vendor/elekloader/kit/src/store.ts'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import type { Catalog } from '../../../vendor/elekloader/kit/src/kit/catalog.ts'
import { BUILDER_CATALOG } from './machine-build.ts'

/** Machines whose builds pass the preflight before the page offers them. */
export const PREFLIGHT_MACHINES: readonly ElemodMachine[] = ['digitakt-ii']

export class PreflightError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) { super('The build did not pass the preflight:\n  ' + problems.join('\n  ')); this.problems = problems }
}

export type PreflightFacts = {
  stockSha256: string; buildSha256: string
  /** The depacked main OS of each file: what the unit runs. */
  mainStockSha256: string; mainBuildSha256: string
  /** Section ids left byte for byte as in the stock file. */
  unchangedSections: number[]
  flashEnd: number; flashHeadroom: number
  /** Each changed run of stock bytes, as load addresses, with the mod whose site holds it. */
  changed: { from: number; to: number; owner: string }[]
  /** Bytes appended after the stock main OS, and the most the mods may append. */
  appended: number; appendLimit: number
}

const HEADER = 0x1c, VERSION_FIELD = [0x14, 0x18]
const hex32 = (value: number) => '0x' + value.toString(16).padStart(8, '0')
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])
const sectionSize = (section: ParsedMod['sections'][keyof ParsedMod['sections']]) => !section ? 0 : 'length' in section ? section.length : section.size

/** The mods' declared sites in the stock-write checker's form, each named for its mod. */
export function declaredSites(mods: readonly ParsedMod[]): DeclaredSite[] {
  return mods.flatMap(mod => mod.sites.map(site => ({ addr: site.addr, length: site.length, kind: site.kind, stockSha256: site.stockSha256, owner: mod.id + ' ' + mod.version })))
}

/** The +Drive's raw block write (Digitakt II OS 1.17), which the base's source exports to mods as fw_card_write. It writes
 * under the mounted file system, so one wrong block costs a musician projects and samples: no mod of a build may refer to it. */
export const RAW_CARD_WRITE: Partial<Record<ElemodMachine, { symbol: string; address: number }>> = { 'digitakt-ii': { symbol: 'fw_card_write', address: 0x4012e39c } }

/** How `mod` reaches its machine's raw card write, or null: by the name the core exports, by a relocation that resolves to
 * its address, or by the address among the mod's own bytes. Defining the name, as the core does, is not a reference. */
export function rawCardWrite(mod: ParsedMod): string | null {
  const routine = RAW_CARD_WRITE[mod.device.machine]
  if (!routine) return null
  const { symbol, address } = routine
  const relocs = [...mod.relocs, ...mod.sites.flatMap(site => site.relocs), ...mod.contribute.flatMap(entry => entry.relocs)]
  if (!mod.symbols.has(symbol) && (mod.imports.includes(symbol) || relocs.some(reloc => reloc.target === 'sym:' + symbol))) return 'refers to ' + symbol
  const resolved = relocs.some(reloc => {
    const at = reloc.target === 'abs' ? 0 : reloc.target.startsWith('sym:') && mod.symbols.get(reloc.target.slice(4))?.[0] === 'abs' ? mod.symbols.get(reloc.target.slice(4))![1] : null
    return at !== null && ((at + reloc.addend) >>> 0) === address
  })
  const own = [...Object.values(mod.sections).flatMap(section => 'parts' in section ? section.parts.flatMap(part => part.kind === 'hex' ? [part.bytes] : []) : []), ...mod.sites.map(site => site.bytes), ...mod.contribute.map(entry => entry.data)]
  const named = own.some(bytes => bytes.some((_, i) => i + 4 <= bytes.length && ((bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0) === address))
  return resolved || named ? 'names ' + hex32(address) : null
}

/** Bytes after the stock main OS the linked mods may account for: the core's boot code (16-aligned), the RAM image of
 * the device's run area, and the mod-storage lockfile the build carries at its end. */
export function appendLimit(mods: readonly ParsedMod[], builtMain: Uint8Array, stockLength: number): number {
  const device = mods[0].device, boot = sectionSize(mods.find(mod => mod.sections['.boot'])?.sections['.boot'])
  const magic = new TextEncoder().encode(TRAILER)
  let trailer = 0
  for (let at = builtMain.length - magic.length; at >= stockLength; at--) {
    if (magic.every((byte, i) => builtMain[at + i] === byte)) { trailer = builtMain.length - at; break }
  }
  return boot + 15 + (device.ddr[1] - device.ddr[0]) + trailer
}

/** A catalogue file as the builder loaded it: from this site's elekloader/ folder, and only if it is the pinned file. */
export async function loadCatalogFile(file: string, catalog: Catalog = BUILDER_CATALOG, base = new URL('elekloader/', document.baseURI).href): Promise<Uint8Array> {
  const pin = [...catalog.cores, ...catalog.mods].find(entry => entry.file === file)
  if (!pin) throw new Error(file + ' is not in the builder catalogue')
  const response = await fetch(new URL(file, base))
  if (!response.ok) throw new Error(file + ': ' + response.status)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (sha(bytes) !== pin.sha256) throw new Error(file + ' is not the file the catalogue pins')
  return bytes
}

/** The preflight of a finished build on the page: the builder's mod paths (/work/core/<file>, /work/mods/<file>) name the
 * catalogue files it linked, which are loaded again here and parsed with Modwerk's own parser. */
export async function preflightBuiltFile(machine: ElemodMachine, stock: Blob, enabled: readonly string[], files: readonly { name: string; data: ArrayBuffer }[], load: (file: string) => Promise<Uint8Array> = loadCatalogFile): Promise<PreflightFacts> {
  const built = files.find(file => /\.syx$/i.test(file.name))
  if (!built) throw new PreflightError(['the build has no .syx file to check'])
  const names = enabled.map(path => path.split('/').pop()!)
  const mods = parseBuildMods(await Promise.all(names.map(async name => ({ name, bytes: await load(name) }))))
  return preflightBuild(machine, new Uint8Array(await stock.arrayBuffer()), new Uint8Array(built.data), mods)
}

/** Parses the build's mod files (JSON .elemod documents) with Modwerk's own parser. */
export function parseBuildMods(files: readonly { name: string; bytes: Uint8Array }[]): ParsedMod[] {
  return files.map(file => parseElemod(JSON.parse(new TextDecoder().decode(file.bytes)) as Record<string, unknown>, file.name, LINK_DEVICES))
}

/** Refuses (PreflightError) unless `builtSyx` is `stockSyx` changed only where `mods` say; returns the facts to show. */
export async function preflightBuild(machine: ElemodMachine, stockSyx: Uint8Array, builtSyx: Uint8Array, mods: readonly ParsedMod[], device: Ele3Device = ELE3_DEVICES[machine]): Promise<PreflightFacts> {
  const problems: string[] = []
  const stock = readEle3Syx(stockSyx), built = readEle3Syx(builtSyx)
  if (built.deviceId !== stock.deviceId || stock.deviceId !== device.sysexId) problems.push('the files are not both for this machine')
  if (built.table.map(s => s.id + ':' + s.destination).join() !== stock.table.map(s => s.id + ':' + s.destination).join()) problems.push('the sections or their destinations differ from stock')
  for (let i = 0; i < HEADER; i++) if (built.header[i] !== stock.header[i] && !(i >= VERSION_FIELD[0] && i < VERSION_FIELD[1])) { problems.push('the container header differs from stock outside the version field'); break }
  const unchangedSections: number[] = []
  for (const [id, bytes] of stock.stored) {
    if (id === device.mainSection) continue
    if (built.stored.has(id) && equal(built.stored.get(id)!, bytes)) unchangedSections.push(id)
    else problems.push('section ' + id + ' is not byte for byte stock')
  }
  const flashEnd = device.flashAt + built.total
  if (flashEnd > device.flashLimit) problems.push('the container ends at ' + hex32(flashEnd) + ' in flash, past ' + hex32(device.flashLimit))
  if (!mods.length) problems.push('no mod files to check the build against')
  for (const mod of mods) {
    if (mod.device.machine !== machine) problems.push(mod.id + ' ' + mod.version + ' is not for this machine')
    if (mod.format !== 2) problems.push(mod.id + ' ' + mod.version + ' is a whole build, which the preflight does not check')
    const reach = rawCardWrite(mod)
    if (reach) problems.push(mod.id + ' ' + mod.version + ' ' + reach + ', the raw block write to the +Drive, which no mod may use: keep a mod\'s data in the project and its kits (core_projdata, core_kitdata)')
  }
  const stockMain = mainImage(stock, device), builtMain = mainImage(built, device)
  const sites = declaredSites(mods)
  const limit = mods.length && mods[0].device.machine === machine ? appendLimit(mods, builtMain, stockMain.length) : 0
  const map: StockMap = { mainLoad: device.mainLoad, imageLength: stockMain.length, protected: mods[0]?.device.protected ?? [], tailBudget: limit, tailHook: null }
  let changed: PreflightFacts['changed'] = []
  if (!problems.length) {
    try {
      const report = await checkStockWrites(stockMain, builtMain, map, sites)
      changed = report.changed.map(([from, to]) => {
        const lo = device.mainLoad + from, hi = device.mainLoad + to
        return { from: lo, to: hi, owner: sites.find(site => site.addr <= lo && hi <= site.addr + site.length)!.owner }
      })
    } catch (error) {
      if (error instanceof StockWriteError) problems.push(...error.problems)
      else throw error
    }
  }
  if (problems.length) throw new PreflightError(problems)
  return {
    stockSha256: await sha256Hex(stockSyx), buildSha256: await sha256Hex(builtSyx),
    mainStockSha256: await sha256Hex(stockMain), mainBuildSha256: await sha256Hex(builtMain),
    unchangedSections: unchangedSections.sort((a, b) => a - b), flashEnd, flashHeadroom: device.flashLimit - flashEnd,
    changed, appended: Math.max(0, builtMain.length - stockMain.length), appendLimit: limit,
  }
}
