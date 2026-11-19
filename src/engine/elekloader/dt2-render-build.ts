// SPDX-License-Identifier: GPL-3.0-or-later
import { DIGITAKT_MK2 } from '../../../vendor/elekloader/kit/src/devices.ts'
import { Syx, packMain, verify, write } from '../../../vendor/elekloader/kit/src/syx.ts'
import {
  buildDt2RenderSection, combineDt2Plans, planDt2MachinePlayers, planDt2MachineSelectors, planDt2MachineWire, unpackDt2SharcSection,
  type Dt2MachinePlayer, type Dt2RenderPlan,
} from '../elektron/dt2-sharc.ts'
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

/** The sound-chip part a machine module carries in its package (`build.dt2_sharc`, version 2): its code and data at
 * fixed L2 addresses (each range claimed on the agent board as a dsp-region) and the voice player of each machine type
 * it adds. Addresses are loader byte addresses; `entry` is the player's short-word program counter. */
export type Dt2SharcPart = { module: string; allocations: { address: number; bytes: Uint8Array }[]; players: Dt2MachinePlayer[] }

// L2 the base keeps for its own machine parts: the selector table, the player dispatcher and its data, and the
// machine wire's receiver and data. A player reads the samples per sixteenth step at `stepSamples` (a word).
export const DT2_BASE_SHARC = {
  selectors: 0x200c0100, dispatcher: 0x200c1000, dispatcherData: 0x200c2000, wire: 0x200c2800, wireData: 0x200c2c00,
  stepSamples: 0x200c2c20, end: 0x200c3000,
}

const base64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))

/** The module's sound-chip part, or null when its package has none. Throws on a malformed part. */
export function readDt2SharcPart(name: string, document: unknown): Dt2SharcPart | null {
  const part = (document as { build?: { dt2_sharc?: unknown } } | null)?.build?.dt2_sharc as
    { version?: unknown; allocations?: unknown; players?: unknown } | undefined
  // Version 1 is the render-hook format of the sidechain work, composed by its own path, not a machine part.
  if (part === undefined || part?.version === 1) return null
  if (!part || part.version !== 2 || !Array.isArray(part.allocations) || !Array.isArray(part.players)) {
    throw new Error(name + ': unsupported sound-chip part')
  }
  const allocations = part.allocations.map(entry => {
    const { address, data } = entry as { address?: unknown; data?: unknown }
    if (!Number.isInteger(address) || typeof data !== 'string') throw new Error(name + ': malformed sound-chip allocation')
    const bytes = base64(data)
    if ((address as number) < DT2_BASE_SHARC.end && (address as number) + bytes.length > DT2_BASE_SHARC.selectors) {
      throw new Error(name + ': its sound-chip code overlaps the base\'s machine parts')
    }
    return { address: address as number, bytes }
  })
  const players = part.players.map(entry => {
    const { type, entry: pc } = entry as { type?: unknown; entry?: unknown }
    if (!Number.isInteger(type) || !Number.isInteger(pc)) throw new Error(name + ': malformed machine player')
    return { type: type as number, entry: pc as number }
  })
  return { module: name, allocations, players }
}

/** The base's machine parts plus every module's sound-chip part, as one plan; null when no module has one (the sound
 * chip then stays stock). Every added machine type gets SAMPLE's selector, the stock voice chain after its player. */
export async function planDt2MachineParts(sharc: Uint8Array, parts: readonly Dt2SharcPart[]): Promise<Dt2RenderPlan | null> {
  if (!parts.length) return null
  const players = parts.flatMap(part => part.players)
  const types = players.map(player => player.type)
  if (new Set(types).size !== types.length) throw new Error('Two modules add a player for the same machine type')
  const selectors = await planDt2MachineSelectors(sharc, DT2_BASE_SHARC.selectors, [0, 0, 0, 0])
  const dispatcher = players.length
    ? await planDt2MachinePlayers(sharc, DT2_BASE_SHARC.dispatcher, DT2_BASE_SHARC.dispatcherData, players)
    : null
  const wire = players.length ? await planDt2MachineWire(sharc, DT2_BASE_SHARC.wire, DT2_BASE_SHARC.wireData) : null
  return combineDt2Plans(selectors, dispatcher, wire, ...parts.map(part => ({ allocations: part.allocations })))
}

/** A finished kit build with the sound-chip parts of the base and the selected modules, checked by the preflight with
 * that plan; null when no selected module carries a sound-chip part, so the kit build stands as it is. */
export async function composeDt2MachineBuild(stockBytes: Uint8Array, kitBuildBytes: Uint8Array, mods: readonly ParsedMod[],
  documents: readonly { name: string; document: unknown }[]) {
  const parts = documents.map(({ name, document }) => readDt2SharcPart(name, document)).filter((part): part is Dt2SharcPart => part !== null)
  if (!parts.length) return null
  const sharc = unpackDt2SharcSection(new Syx(stockBytes).stored.get(SHARC_SECTION))
  const plan = await planDt2MachineParts(sharc, parts)
  return plan ? buildDt2RenderFirmware(stockBytes, kitBuildBytes, mods, plan) : null
}
