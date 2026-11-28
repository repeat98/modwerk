// SPDX-License-Identifier: GPL-3.0-or-later
// The DSP code inside an Octatrack main OS: the payloads its ColdFire uploads to the DSP cores at boot. A payload is
// 24-bit little-endian words: records [space, address, count, count words] (space 0 = P, 1 = X, 2 = Y), two-word
// directives led by 3 or 4, and a word above 4 ends it. The linker places module DSP code in P words a module frees
// (the machine's dspAreas); pSpan gives where those words sit in the main OS.
import type { Device } from './devices.ts'
import { ModError } from './module-package.ts'

/** A 24-bit little-endian word, as the ColdFire's loader assembles it. */
export const w24 = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)

/** [space, address, count, main OS address of its first word] of each record in payload `tag`. */
export function records(image: Uint8Array, dev: Device, tag: string): [number, number, number, number][] {
  if (!Object.hasOwn(dev.dspPayloads, tag)) throw new ModError(`the ${dev.name} has no DSP payload ${tag}`)
  const [at, length] = dev.dspPayloads[tag]
  const payload = image.subarray(at - dev.mainLoad, at - dev.mainLoad + length)
  if (payload.length !== length) throw new ModError(`DSP payload ${tag} runs past the main OS`)
  const found: [number, number, number, number][] = []
  let offset = 0
  while (offset + 3 <= length) {
    const space = w24(payload, offset)
    if (space > 4) return found
    if (space >= 3) { offset += 6; continue }
    if (offset + 9 > length) break
    const address = w24(payload, offset + 3), count = w24(payload, offset + 6)
    if (!count || offset + 9 + 3 * count > length) break
    found.push([space, address, count, at + offset + 9])
    offset += 9 + 3 * count
  }
  if (offset === length) return found
  throw new ModError(`DSP payload ${tag} does not parse at +0x${offset.toString(16)}`)
}

/** The main OS address of payload `tag`'s P words lo..hi-1, which must lie in one record. */
export function pSpan(image: Uint8Array, dev: Device, tag: string, lo: number, hi: number): number {
  const record = records(image, dev, tag).find(([space, address, count]) => space === 0 && address <= lo && hi <= address + count)
  if (!record) throw new ModError(`payload ${tag} does not load P:0x${lo.toString(16).padStart(5, '0')}-0x${(hi - 1).toString(16).padStart(5, '0')} in one record`)
  return record[3] + 3 * (lo - record[1])
}
