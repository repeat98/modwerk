// SPDX-License-Identifier: GPL-3.0-or-later
// The Modwerk Octatrack base, built from the user's own OS 1.40C file. The committed package
// (assets/octatrack-base.elemod, from sdk/machines/octatrack/elekloader/build_core.py --dsp-loader) carries no stock
// bytes: stock code/data is left out, with fills naming stock-dsp-metadata.json's recipes or the bounded POST curve.
// fillBase puts the words back from the user's firmware (every recipe hash-checked), then the unchanged Elekloader kit
// links, packs and verifies the base exactly as build_core.py's patch.build does, .run packed as build_core.py packs it.
import { BASE_FIRMWARE } from '../base.ts'
import { usbAudioPostCurve } from '../usb-audio-curve.ts'
import { recoverStockDsp, type StockDspCore } from '../stock-dsp.ts'
import { packRun, RUN_UNPACK } from './run-pack.ts'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import * as formats from '../../../vendor/elekloader/kit/src/formats.ts'
import { build } from '../../../vendor/elekloader/kit/src/patch.ts'

/** A gap in the package: `count` words of a stock recipe from word `first`, at `offset` (bytes, in the filled
 * layout) of a section (24-bit code or the named 32-bit POST data recipe), or a DSP payload site (24-bit little-endian). */
export type BaseFill = { tag: string; first: number; count: number; offset: number } &
  ({ fx: number; section: string } | { shared: number; site: string } | { curve: 'usb-post-xlv'; section: string })
/** What build_core.py names its version field: the base's own. */
const VERSION = 'ELEKLOADER'

type Part = ['hex', string] | ['stock', string, number]
const hex = (words: Uint32Array, big: boolean) => Array.from(words, w => (big ? [w >>> 16, w >>> 8, w] : [w, w >>> 8, w >>> 16])
  .map(b => (b & 0xff).toString(16).padStart(2, '0')).join('')).join('')

/** The package text with every fill's stock words inserted. The kit refuses the package while any is missing. */
export function fillBase(text: string, fills: readonly BaseFill[], cores: readonly StockDspCore[]): string {
  const doc = JSON.parse(text) as { sections: Record<string, { parts: Part[] }>; sites: { addr: string; new: string }[] }
  for (const fill of [...fills].sort((a, b) => a.offset - b.offset)) {
    const core = cores.find(c => c.tag === fill.tag)
    const curve = 'curve' in fill
    if (curve && (Object.keys(fill).sort().join(',') !== 'count,curve,first,offset,section,tag' || fill.curve !== 'usb-post-xlv' || fill.tag !== 'A' || fill.first !== 0 || fill.count !== 256 || !Number.isInteger(fill.offset) || fill.offset < 0 || fill.offset % 2 || typeof fill.section !== 'string' || !Object.hasOwn(doc.sections, fill.section)))
      throw new Error('Unsupported USB POST stock-data fill.')
    const words = curve ? usbAudioPostCurve(cores) : 'fx' in fill ? core?.packages.find(p => p.fxId === fill.fx)?.words : 'shared' in fill ? core?.shared.find(s => s.destination === fill.shared)?.words : undefined
    if (!words || fill.first < 0 || fill.count <= 0 || fill.first + fill.count > words.length) throw new Error('The base package names stock DSP code your firmware does not have.')
    if ('section' in fill) {
      const parts = doc.sections[fill.section]?.parts ?? []
      let at = 0, i = 0
      while (i < parts.length && at < fill.offset) { const part = parts[i++]; at += part[0] === 'hex' ? part[1].length / 2 : part[2] }
      if (at !== fill.offset) throw new Error('The base package does not leave room for its stock DSP code.')
      const value = words.subarray(fill.first, fill.first + fill.count)
      const data = curve ? Array.from(value, word => word.toString(16).padStart(8, '0')).join('') : hex(value, true)
      parts.splice(i, 0, ['hex', data])
    } else {
      const site = doc.sites.find(s => s.addr === fill.site)
      if (!site || 2 * fill.offset > site.new.length) throw new Error('The base package does not leave room for its stock DSP code.')
      site.new = site.new.slice(0, 2 * fill.offset) + hex(words.subarray(fill.first, fill.first + fill.count), false) + site.new.slice(2 * fill.offset)
    }
  }
  return JSON.stringify(doc)
}

/** The exact digest IDENTIFY returns, read from the authored identity in the filled package.
 * This is the configuration identity, not the download's SHA-256. Reading it does not change the base. */
export function baseIdentity(filledPackage: string): string {
  const doc = JSON.parse(filledPackage) as { symbols: Record<string, [string, number]>; sections: Record<string, { parts: Part[] }> }
  const symbol = doc.symbols?.modwerk_base_digest
  if (!symbol || !Number.isInteger(symbol[1]) || symbol[1] < 0) throw new Error('The base package has no USB identity.')
  const [section, offset] = symbol, parts = doc.sections[section]?.parts ?? []
  let at = 0, identity = ''
  for (const part of parts) {
    const length = part[0] === 'hex' ? part[1].length / 2 : part[2]
    const start = Math.max(at, offset), end = Math.min(at + length, offset + 32)
    if (start < end) {
      if (part[0] !== 'hex') throw new Error('The base package has no authored USB identity.')
      identity += part[1].slice((start - at) * 2, (end - at) * 2)
    }
    at += length
  }
  if (!/^[0-9a-f]{64}$/.test(identity)) throw new Error('The base package has an invalid USB identity.')
  return identity
}

/** The room the base's image keeps for a module set: modset.c's modwerk_flashed_set (build_core.py FLASHED_SET_BYTES). */
export const FLASHED_SET_BYTES = 256 * 1024
/** The largest container a flash slot holds (slots.h SLOT_CONTAINER_MAX): a .bin with modules stays within it. */
const SLOT_CONTAINER_MAX = 0xf0000 - 0x100
const TOO_LARGE = 'These modules are too large to put into the .bin. Choose fewer, or install them over USB.'

/** The package with a module set (card-set.ts, for this base) in the image's room for it: the flashed base installs it
 * at its first start and saves it to the card (modset.c). The room is all zero in the package, and stays where it is. */
export function embedSet(text: string, set: Uint8Array): string {
  const doc = JSON.parse(text) as { symbols: Record<string, [string, number]>; sections: Record<string, { parts: Part[] }> }
  const symbol = doc.symbols?.modwerk_flashed_set
  if (!symbol) throw new Error('This base cannot carry modules in its .bin.')
  const used = set.length >= 84 ? new DataView(set.buffer, set.byteOffset, set.byteLength).getUint32(16) : 0
  if (used < 84 || used > set.length) throw new Error('The module set is not a whole set file.')
  if (used > FLASHED_SET_BYTES) throw new Error(TOO_LARGE)
  const [section, offset] = symbol
  let at = 0
  for (const part of doc.sections[section]?.parts ?? []) {
    const length = part[0] === 'hex' ? part[1].length / 2 : part[2]
    if (offset >= at && offset + FLASHED_SET_BYTES <= at + length && part[0] === 'hex') {
      const from = (offset - at) * 2
      if (/[^0]/.test(part[1].slice(from, from + FLASHED_SET_BYTES * 2))) break
      part[1] = part[1].slice(0, from) + Array.from(set.subarray(0, used), b => b.toString(16).padStart(2, '0')).join('') + part[1].slice(from + used * 2)
      return JSON.stringify(doc)
    }
    at += length
  }
  throw new Error('The base package does not leave room for a module set.')
}

/** The base's .bin from the user's original OCTATRACK_OS1.40C.bin; with `set`, a module set for this base in its image. */
export async function buildBase(stock: Uint8Array, packageText: string, fills: readonly BaseFill[], set?: Uint8Array): Promise<{ bin: Uint8Array; sha256: string; base: string }> {
  const built = await buildImage(stock, set ? embedSet(packageText, set) : packageText, fills)
  if (set && built.bin.length > SLOT_CONTAINER_MAX) throw new Error(TOO_LARGE)
  return built
}
async function buildImage(stock: Uint8Array, packageText: string, fills: readonly BaseFill[]): Promise<{ bin: Uint8Array; sha256: string; base: string }> {
  if (sha(stock) !== BASE_FIRMWARE.sha256) throw new Error('The base builds only from the original Octatrack OS 1.40C file. Choose an unmodified ' + BASE_FIRMWARE.filename + '.')
  const [parsed, device] = await formats.load(stock)
  const cores = await recoverStockDsp(formats.mainImage(parsed, device))
  const text = fillBase(packageText, fills, cores), base = baseIdentity(text)
  const filled = new TextEncoder().encode(text)
  const [outputs, manifest] = await build({ path: '/' + BASE_FIRMWARE.filename, data: stock }, [{ path: '/octatrack-base.elemod', data: filled }], VERSION)
  if (!outputs?.bin) throw new Error('The builder did not write a .bin.')
  if (!manifest._map?.has(RUN_UNPACK)) return { bin: outputs.bin, sha256: sha(outputs.bin), base }
  // Its boot decodes .run packed (run-pack.ts): MAIN again with it packed, repacked and verified as build() does.
  const main = packRun(formats.mainImage(formats.parse(outputs.bin, device), device), manifest.link.layout, device.mainLoad)
  const packed = formats.write(parsed, formats.packMain(main, device), device, VERSION)
  formats.verify(packed, parsed, main, device, VERSION)
  if (!packed.bin) throw new Error('The builder did not write a .bin.')
  return { bin: packed.bin, sha256: sha(packed.bin), base }
}
