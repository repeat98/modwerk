// SPDX-License-Identifier: GPL-3.0-or-later
// The base's .run stored packed in MAIN, as build_core.py stores it (sdk/machines/octatrack/elekloader/run_pack.py):
// the kit's own section format in place of the plain copy, which the boot decodes (run_unpack.s). The same kit
// packer as build_core.py's, so the browser's .bin stays build_core.py's byte for byte.
import { equal } from '../elektron/bytes.ts'
import { packSection, Writer } from '../elektron/codec/pack.ts'
import { depackSection } from '../elektron/codec/depack.ts'

/** A base whose linked boot has this decoder stores .run packed; older packages copy it plain and stay as built. */
export const RUN_UNPACK = 'mw_run_unpack'

/** MAIN with its trailing plain .run (from the layout's run_load, ddr's length) packed. */
export function packRun(main: Uint8Array, layout: { run_load: number; ddr: [number, number] }, load: number): Uint8Array {
  const at = layout.run_load - load, run = main.subarray(at)
  if (at <= 0 || run.length !== layout.ddr[1] - layout.ddr[0]) throw new Error('The base image does not end with its linked .run.')
  const section = packSectionCompact(run)
  if (!equal(depackSection(section), run)) throw new Error('The packed .run does not unpack to the linked one.')
  const out = new Uint8Array(at + section.length)
  out.set(main.subarray(0, at))
  out.set(section, at)
  return out
}


const MIN = 3, FAR = 3328, MAXOFF = 65536, MAXCOUNT = 2048, WINDOW = 24, EARLY = 64

/** Base .run only: bounded lookahead, with the ordinary stream as a size ceiling.
 * Same format and tie rules as firmware_codec.aplib.pack_section_compact.
 * No device decoder or normal firmware/module packing changes. */
export function packSectionCompact(d: Uint8Array): Uint8Array {
  const baseline = packSection(d), n = d.length
  const lengths = new Uint16Array(n), offsets = new Uint32Array(n)
  // Match candidates at EVERY byte, including bytes a greedy parse would skip.
  const table = new Map<number, number[]>()
  for (let i = 0; i < n - 3; i++) {
    const key = d[i] << 16 | d[i + 1] << 8 | d[i + 2], seen = table.get(key)
    let best = 0, off = 0
    if (seen) {
      const limit = Math.min(MAXCOUNT, n - i)
      for (let k = seen.length - 1; k >= Math.max(0, seen.length - WINDOW); k--) {
        const j = seen[k], distance = i - j
        if (distance > MAXOFF) break
        let count = 0
        while (count < limit && d[j + count] === d[i + count]) count++
        if (count > best && count >= MIN + Number(distance > FAR)) {
          best = count; off = distance
          if (best >= EARLY) break
        }
      }
      seen.push(i)
      if (seen.length > 4 * WINDOW) seen.splice(0, seen.length - WINDOW)
    } else table.set(key, [i])
    lengths[i] = best; offsets[i] = off
  }
  const cost = new Uint32Array(n + 1), take = new Uint16Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let best = 9 + cost[i + 1]
    const length = lengths[i], off = offsets[i]
    if (length) {
      const far = Number(off > FAR), head = 11 + 2 * (31 - Math.clz32((off + 767) >>> 8))
      const offer = (count: number) => {
        const coded = count - 1 - far
        const bits = head + (coded > 3 ? 2 * (31 - Math.clz32(coded - 2)) : 0)
        const candidate = bits + cost[i + count]
        if (candidate < best) { best = candidate; take[i] = count }
      }
      for (let k = MIN + far; k <= Math.min(length, 32); k++) offer(k)
      offer(length)
      for (let power = 5; power < 12; power++) {
        const edge = (1 << power) + 3 + far
        for (const k of [edge - 1, edge]) if (k >= MIN + far && k <= length) offer(k)
      }
    }
    cost[i] = best
  }
  const w = new Writer(n + 1 + (n + 56 >> 3))
  for (let i = 0; i < n;) {
    const count = take[i]
    if (count) { w.match(offsets[i], count); i += count } else w.literal(d[i++])
  }
  w.end()
  const compact = new Uint8Array(8 + w.n), view = new DataView(compact.buffer)
  let sum = 0
  for (let i = 0; i < w.n; i++) sum += w.out[i]
  view.setUint32(0, w.n); view.setUint32(4, sum >>> 0); compact.set(w.out.subarray(0, w.n), 8)
  return compact.length < baseline.length ? compact : baseline
}
