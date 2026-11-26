// SPDX-License-Identifier: GPL-3.0-or-later
// A Digitakt II image built off the page the way the page builds it: the kit's build (the same engine the website's
// builder worker runs) of the owner's stock file with the base and the packages, then composeDt2MachineBuild, which
// the page's preflight runs on the kit's result. scripts/link-image.mjs uses it, so the image a test procedure takes
// is the one a musician's browser makes from the same stock file, packages and version.
import { build } from '../../../vendor/elekloader/kit/src/patch.ts'
import type { Lock } from '../../../vendor/elekloader/kit/src/store.ts'
import { parseBuildMods } from './digi-preflight.ts'
import { composeDt2MachineBuild } from './dt2-render-build.ts'

export type Dt2LinkFile = { name: string; bytes: Uint8Array }

/** The base first, then the packages, each named by its file name (as the page's builder names catalogue files). */
export async function linkDt2Image(stock: Uint8Array, files: readonly Dt2LinkFile[], version: string, lock: Lock | null = null,
  log: (line: string) => void = () => {}) {
  const [outputs, manifest] = await build({ path: '/work/stock.syx', data: stock },
    files.map((file, index) => ({ path: (index ? '/work/mods/' : '/work/core/') + file.name, data: file.bytes })), version, false, log, lock)
  if (!outputs?.syx) throw new Error('The kit did not produce a .syx')
  const mods = parseBuildMods(files)
  const documents = files.map(file => ({ name: file.name, document: JSON.parse(new TextDecoder().decode(file.bytes)) as unknown }))
  const composed = await composeDt2MachineBuild(stock, outputs.syx, mods, documents)
  return { syx: composed ? composed.output : outputs.syx, composed: composed !== null, store: (manifest.store ?? null) as Lock | null }
}
