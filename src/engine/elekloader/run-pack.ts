// SPDX-License-Identifier: GPL-3.0-or-later
// The base's .run stored packed in MAIN, as build_core.py stores it (sdk/machines/octatrack/elekloader/run_pack.py):
// the kit's own section format in place of the plain copy, which the boot decodes (run_unpack.s). The same kit
// packer as build_core.py's, so the browser's .bin stays build_core.py's byte for byte.
import { equal } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { packSection } from '../elektron/codec/pack.ts'
import { depackSection } from '../elektron/codec/depack.ts'

/** A base whose linked boot has this decoder stores .run packed; older packages copy it plain and stay as built. */
export const RUN_UNPACK = 'mw_run_unpack'

/** MAIN with its trailing plain .run (from the layout's run_load, ddr's length) packed. */
export function packRun(main: Uint8Array, layout: { run_load: number; ddr: [number, number] }, load: number): Uint8Array {
  const at = layout.run_load - load, run = main.subarray(at)
  if (at <= 0 || run.length !== layout.ddr[1] - layout.ddr[0]) throw new Error('The base image does not end with its linked .run.')
  const section = packSection(run)
  if (!equal(depackSection(section), run)) throw new Error('The packed .run does not unpack to the linked one.')
  const out = new Uint8Array(at + section.length)
  out.set(main.subarray(0, at))
  out.set(section, at)
  return out
}
