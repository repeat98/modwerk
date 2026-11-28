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
import { sha } from '../elektron/bytes.ts'
import * as formats from '../elektron/firmware-formats.ts'
import { build } from '../elektron/firmware-build.ts'

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

/** The base's .bin from the user's original OCTATRACK_OS1.40C.bin. */
export async function buildBase(stock: Uint8Array, packageText: string, fills: readonly BaseFill[]): Promise<{ bin: Uint8Array; sha256: string; base: string }> {
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
