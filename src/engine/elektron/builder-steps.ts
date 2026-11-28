// SPDX-License-Identifier: GPL-3.0-or-later
// What a build page does around the builder: load a selection from the catalog and check it, follow a build in three
// steps, and keep its log as text for a bug report.
import { planBuild, type Catalog, type Pin } from './builder-catalog.ts'
import type { Builder } from './builder-client.ts'
import type { BuildResult, Check, Device, Ready } from './builder-protocol.ts'

export type Prepared =
  | { ok: true; enabled: string[]; check: Check; device: Device }
  | { ok: false; error: string; device?: Device; check?: Check }

/** The owner's stock OS and a selection of catalog package ids, loaded and checked: the stock file must be the
 * machine and OS asked for, each package comes from the catalog with what it requires, and the core is the plan's,
 * chosen again once the packages are loaded with the core's RAM in view, as withCore takes it. */
export async function prepare(builder: Builder, input: { catalog: Catalog; device: string; os: string; stock: Blob & { name: string }; ids: readonly string[] }): Promise<Prepared> {
  const plan = planBuild(input.catalog, input.device, input.os, input.ids)
  if (!plan.core) return { ok: false, error: `The catalog has no core for ${input.device} OS ${input.os}.` }
  if (plan.missing.length) return { ok: false, error: `Not available for OS ${input.os}: ${plan.missing.join(', ')}.` }
  await builder.load()
  const stock = await builder.setStock(input.stock)
  if (!stock.ok) return { ok: false, error: stock.error }
  if (stock.dev.key !== input.device || stock.os !== input.os) return { ok: false, error: `This OS file is ${stock.device} ${stock.os}, not the ${input.device} OS ${input.os} chosen.`, device: stock.dev }
  let enabled: string[] = []
  for (const m of plan.mods) {
    const added = await builder.addCatalogMod(m.file)
    if (!added.ok) return { ok: false, error: added.error, device: stock.dev }
    enabled = await builder.tick(enabled, added.mod.path)
  }
  // the plan's core in place of any other the ticks chose (a build has one core): of those new enough, one whose RAM
  // holds the packages (its ram_area, at least their ram_bound and its own)
  const listed = await builder.mods()
  const cores = listed.filter(m => m.builtin && m.id === 'core')
  const ram = listed.filter(m => m.id !== 'core' && enabled.includes(m.path)).reduce((n, m) => n + (m.ram_bound ?? 0), 0)
  const holds = (pinned: Pin) => {
    const core = cores.find(m => m.file === pinned.file)
    return core?.ram_area === undefined || ram + (core.ram_bound ?? 0) <= core.ram_area
  }
  const pick = planBuild(input.catalog, input.device, input.os, input.ids, holds).core!
  const core = cores.find(m => m.file === pick.file)
  if (!core || !core.fits) return { ok: false, error: `${pick.file} does not fit this OS file.`, device: stock.dev }
  enabled = [...enabled.filter(p => !cores.some(c => c.path === p)), core.path].sort()
  const check = await builder.check(enabled)
  return check.ok ? { ok: true, enabled, check, device: stock.dev } : { ok: false, error: check.headline ?? 'These mods cannot be built together.', check, device: stock.dev }
}

/** The three steps a build page shows (link the packages, pack the OS, verify the file), from the builder's log: its
 * "linked" line ends the first, "packed" the second. */
export type Step = 'composing' | 'packing' | 'verifying'
export const buildStep = (line: string, step: Step = 'composing'): Step => (line.startsWith('linked ') ? 'packing' : line.startsWith('packed ') ? 'verifying' : step)

/** The builder in a line: the engine, the protocol and the catalog, from init's reply. */
export const describeBuilder = (ready: Ready) => `Modwerk builder ${ready.engine} (protocol ${ready.protocol}), catalog ${ready.catalog.revision}`

/** A build's log as text for a bug report: what was built and by which builder, then every line with its time. It
 * names no stock file and holds no firmware. */
export function buildLogText(input: { title?: string; builder: string; device: string; os: string; version: string; enabled: readonly string[]; result: BuildResult }) {
  const { result } = input
  const lines = [
    `${input.title ?? 'Modwerk build log'}: ${input.device}, OS ${input.os}`,
    `Builder: ${input.builder}`,
    `Mods: ${result.ok ? result.mods.join(', ') : input.enabled.map(p => p.split('/').pop()).join(', ')}`,
    `OS version shown: ${input.version}`,
    result.ok ? `Result: built and verified in ${result.seconds.toFixed(2)} s` : `Result: failed: ${result.error}`,
    ...(result.ok ? result.files.map(f => `  ${f.name}  ${f.bytes} bytes  sha256 ${f.sha256}`) : []),
    '',
    ...(result.log ?? []).map(([seconds, line]) => `${seconds.toFixed(2).padStart(7)} s  ${line}`),
  ]
  return lines.join('\n') + '\n'
}
