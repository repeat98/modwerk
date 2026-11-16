// SPDX-License-Identifier: GPL-3.0-or-later
import { DIGITAKT_MK2 } from '../../../vendor/elekloader/kit/src/devices.ts'
import { Syx, packMain, verify, write } from '../../../vendor/elekloader/kit/src/syx.ts'
import { buildDt2RenderSection, unpackDt2SharcSection, type Dt2RenderPlan } from '../elektron/dt2-sharc.ts'
import { ELE3_DEVICES } from '../elektron/ele3.ts'
import type { ParsedMod } from '../elektron/elemod.ts'
import { preflightBuild } from './digi-preflight.ts'

const MACHINE = 'digitakt-ii'
const SHARC_SECTION = 7

/** Compose a private render test image from a kit build and a base-owned SHARC plan. */
export async function buildDt2RenderFirmware(
  stockBytes: Uint8Array,
  kitBuildBytes: Uint8Array,
  mods: readonly ParsedMod[],
  plan: Dt2RenderPlan,
) {
  await preflightBuild(MACHINE, stockBytes, kitBuildBytes, mods)
  const stock = new Syx(stockBytes)
  if (!DIGITAKT_MK2.releases.some(release => release.syxSha256 === stock.sha256)) {
    throw new Error('The stock file does not match a pinned Digitakt II release')
  }
  const mainSection = DIGITAKT_MK2.mainSection
  const kitBuild = new Syx(kitBuildBytes)
  const mainImage = kitBuild.section(mainSection)
  verify(kitBuildBytes, stock, mainImage, DIGITAKT_MK2, kitBuild.version)

  const sharc = unpackDt2SharcSection(stock.stored.get(SHARC_SECTION))
  const render = await buildDt2RenderSection(sharc, plan)
  // This parsed view is local. Its container remains the original stock bytes so the kit
  // authenticates the stock seal before writing and verifies the new seal after writing.
  stock.stored.set(SHARC_SECTION, packMain(render))
  const output = write(stock, kitBuild.stored.get(mainSection)!, DIGITAKT_MK2, kitBuild.version)
  verify(output, stock, mainImage, DIGITAKT_MK2, kitBuild.version)
  const facts = await preflightBuild(MACHINE, stockBytes, output, mods, ELE3_DEVICES[MACHINE], plan)
  return { output, facts }
}
