// SPDX-License-Identifier: GPL-3.0-or-later
import { DIGITAKT_MK2 } from '../../../vendor/elekloader/kit/src/devices.ts'
import { Syx, packMain, verify, write } from '../../../vendor/elekloader/kit/src/syx.ts'
import {
  buildDt2RenderSection, combineDt2Plans, DT2_ADDED_TYPES, DT2_FIRST_ADDED_TYPE, DT2_MACHINE_KNOBS_AT, DT2_MACHINE_TYPES_AT, planDt2FrameReceive,
  planDt2MachinePlayers, planDt2MachineSelectors, unpackDt2SharcSection,
  type Dt2MachinePlayer, type Dt2RenderPlan,
} from '../elektron/dt2-sharc.ts'
import { ELE3_DEVICES } from '../elektron/ele3.ts'
import { parseElemod, type ParsedMod } from '../elektron/elemod.ts'
import { sharcProgramCounter } from '../elektron/sharc-asm.ts'
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
 * fixed L2 addresses (each range claimed on the agent board as a dsp-region; `code` marks the instruction blocks) and
 * the voice player of each machine type it adds. Addresses are loader byte addresses; `entry` is the player's
 * short-word program counter, inside one of the part's own code blocks. */
export type Dt2SharcPart = {
  module: string
  allocations: { address: number; bytes: Uint8Array; code: boolean }[]
  players: Dt2MachinePlayer[]
}

/** A machine a module registers in the base's core_machines table: its type (7-10) and the stock type it stands for. */
export type Dt2Machine = { module: string; type: number; standsFor: number }

// L2 the base keeps for its own sound-chip parts: the selector table, the player and frame registry slots, the player
// dispatcher and its data, and the frame receiver and its data. A player reads the samples per sixteenth step at
// `stepSamples`: the 1X step, then tracks 1-16 at their speeds (17 words), then `viewTrack` (0-15, 16 for none): the
// track whose voice a player posts in the 32 words at `view` (its own magic first, then that track), which reach the
// ColdFire as core_machine_view. These parts are the same for every set of modules; only the slots and the selector
// words for types 7-10 follow the set.
export const DT2_BASE_SHARC = {
  selectors: 0x200c0100, playerSlots: 0x200c0f00, frameSlots: 0x200c0f80, dispatcher: 0x200c1000, dispatcherData: 0x200c2000,
  wire: 0x200c2800, wireData: 0x200c2c00,
  stepSamples: 0x200c2c20, viewTrack: 0x200c2c64, view: 0x200c2c68, trackTypes: 0x200c2c00 + 4 * DT2_MACHINE_TYPES_AT,
  trackKnobs: 0x200c2c00 + 4 * DT2_MACHINE_KNOBS_AT,
  end: 0x200c3000,
}

const base64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
const byteAddress = (pc: number) => 0x20000000 + (pc - 0xb80000) * 2

/** The module's sound-chip part, or null when its package has none. Throws on a malformed part, and on a player
 * entry outside the part's own code. */
export function readDt2SharcPart(name: string, document: unknown): Dt2SharcPart | null {
  const part = (document as { build?: { dt2_sharc?: unknown } } | null)?.build?.dt2_sharc as
    { version?: unknown; allocations?: unknown; players?: unknown } | undefined
  // Version 1 is the render-hook format of the sidechain work, composed by its own path, not a machine part.
  if (part === undefined || part?.version === 1) return null
  if (!part || part.version !== 2 || !Array.isArray(part.allocations) || !Array.isArray(part.players)) {
    throw new Error(name + ': unsupported sound-chip part')
  }
  const allocations = part.allocations.map(entry => {
    const { address, data, code } = entry as { address?: unknown; data?: unknown; code?: unknown }
    if (!Number.isInteger(address) || typeof data !== 'string' || typeof code !== 'boolean') throw new Error(name + ': malformed sound-chip allocation')
    const bytes = base64(data)
    if ((address as number) < DT2_BASE_SHARC.end && (address as number) + bytes.length > DT2_BASE_SHARC.selectors) {
      throw new Error(name + ': its sound-chip code overlaps the base\'s machine parts')
    }
    return { address: address as number, bytes, code }
  })
  const players = part.players.map(entry => {
    const { type, entry: pc } = entry as { type?: unknown; entry?: unknown }
    if (!Number.isInteger(type) || !Number.isInteger(pc)) throw new Error(name + ': malformed machine player')
    const at = byteAddress(pc as number)
    if (!allocations.some(block => block.code && at >= block.address && at + 6 <= block.address + block.bytes.length)) {
      throw new Error(name + ': the player for type ' + String(type) + ' does not start in its own sound-chip code')
    }
    return { type: type as number, entry: pc as number }
  })
  return { module: name, allocations, players }
}

/** The bytes of `section` in a mod, from its own hex parts (a record never copies stock bytes). */
function sectionBytes(mod: ParsedMod, section: string): Uint8Array | null {
  const found = mod.sections[section as keyof ParsedMod['sections']]
  if (!found || !('parts' in found) || found.parts.some(part => part.kind !== 'hex')) return null
  const out = new Uint8Array(found.length)
  let at = 0
  for (const part of found.parts) if (part.kind === 'hex') { out.set(part.bytes, at); at += part.bytes.length }
  return out
}

/** The machines a module registers: each core_machines entry is a pointer to its struct dt2_machine record
 * (mk2/machines.h), whose first two big-endian words are the type and the stock type it stands for. */
export function dt2RegisteredMachines(name: string, mod: ParsedMod): Dt2Machine[] {
  return mod.contribute.filter(entry => entry.to === 'core_machines').map(entry => {
    const reloc = entry.relocs.find(item => item.offset === 0 && item.type === 'abs32')
    let section: string | undefined, offset = reloc?.addend ?? 0
    if (reloc?.target.startsWith('sym:')) {
      const symbol = mod.symbols.get(reloc.target.slice(4))
      if (symbol && symbol[0] !== 'abs') { section = symbol[0]; offset += symbol[1] }
    } else if (reloc?.target.startsWith('sec:')) section = reloc.target.slice(4)
    const bytes = section ? sectionBytes(mod, section) : null
    if (!bytes || offset < 0 || offset + 8 > bytes.length) throw new Error(name + ': a core_machines entry whose record cannot be read')
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8)
    return { module: name, type: view.getUint32(0), standsFor: view.getUint32(4) }
  })
}

/** The base's sound-chip parts for the registered machines, their modules' players and any frame receivers, plus the
 * modules' own allocations, as one plan; null when the set registers no machine and brings no sound-chip part or frame
 * receiver (the sound chip then stays stock). Types 7-10 get the selector of the stock type each stands for. */
export async function planDt2MachineParts(
  sharc: Uint8Array, machines: readonly Dt2Machine[], parts: readonly Dt2SharcPart[], frameReceivers: readonly number[] = [],
): Promise<Dt2RenderPlan | null> {
  if (!machines.length && !parts.length && !frameReceivers.length) return null
  for (const machine of machines) {
    if (!Number.isInteger(machine.type) || machine.type < DT2_FIRST_ADDED_TYPE || machine.type >= DT2_FIRST_ADDED_TYPE + DT2_ADDED_TYPES) {
      throw new Error(machine.module + ': machine type ' + machine.type + ' is not one of 7-10')
    }
    if (!Number.isInteger(machine.standsFor) || machine.standsFor < 0 || machine.standsFor > 6) {
      throw new Error(machine.module + ': machine type ' + machine.type + ' stands for ' + machine.standsFor + ', not a stock type')
    }
  }
  const types = machines.map(machine => machine.type)
  if (new Set(types).size !== types.length) throw new Error('Two modules register the same machine type')
  const players = parts.flatMap(part => part.players.map(player => {
    if (!machines.some(machine => machine.module === part.module && machine.type === player.type)) {
      throw new Error(part.module + ': a player for type ' + player.type + ', which it does not register in core_machines')
    }
    return player
  }))
  const standsFor = Array.from({ length: DT2_ADDED_TYPES }, (_, k) => machines.find(machine => machine.type === DT2_FIRST_ADDED_TYPE + k)?.standsFor ?? 0)
  const selectors = await planDt2MachineSelectors(sharc, DT2_BASE_SHARC.selectors, standsFor)
  const dispatcher = await planDt2MachinePlayers(sharc, DT2_BASE_SHARC.dispatcher, DT2_BASE_SHARC.dispatcherData,
    DT2_BASE_SHARC.playerSlots, players, DT2_BASE_SHARC.trackTypes)
  const receive = await planDt2FrameReceive(sharc, DT2_BASE_SHARC.wire, DT2_BASE_SHARC.wireData, DT2_BASE_SHARC.frameSlots,
    frameReceivers.map(sharcProgramCounter))
  return combineDt2Plans(selectors, dispatcher, receive, ...parts.map(part => ({ allocations: part.allocations.map(({ address, bytes }) => ({ address, bytes })) })))
}

/** The selected packages' machines and sound-chip parts, read from their documents. */
export function readDt2MachineSet(documents: readonly { name: string; document: unknown }[]) {
  const machines = documents.flatMap(({ name, document }) => dt2RegisteredMachines(name, parseElemod(document as Record<string, unknown>, name)))
  const parts = documents.map(({ name, document }) => readDt2SharcPart(name, document)).filter((part): part is Dt2SharcPart => part !== null)
  return { machines, parts }
}

/** A finished kit build with the base's sound-chip parts and the selected modules', checked by the preflight with that
 * plan; null when no selected module registers a machine or carries a sound-chip part, so the kit build stands as it
 * is. The website's preflight and scripts/link-image.mjs both compose through this, so the same stock file, packages
 * and version give the same image. */
export async function composeDt2MachineBuild(stockBytes: Uint8Array, kitBuildBytes: Uint8Array, mods: readonly ParsedMod[],
  documents: readonly { name: string; document: unknown }[]) {
  const { machines, parts } = readDt2MachineSet(documents)
  if (!machines.length && !parts.length) return null
  const sharc = unpackDt2SharcSection(new Syx(stockBytes).stored.get(SHARC_SECTION))
  const plan = await planDt2MachineParts(sharc, machines, parts)
  return plan ? buildDt2RenderFirmware(stockBytes, kitBuildBytes, mods, plan) : null
}
