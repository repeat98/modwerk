// SPDX-License-Identifier: GPL-3.0-or-later
// All machine integrations use the unchanged Elekloader kit. A machine extends its catalogue/core, not its builder.
import CATALOG_JSON from '../../../vendor/elekloader/catalog/catalog.json' with { type: 'json' }
import KIT from '../../../vendor/elekloader/kit/kit.json' with { type: 'json' }
import {
  buildLogText as kitBuildLogText, createBuilder, parseCatalog, planBuild as kitPlanBuild, prepare, releases,
  type Builder, type Catalog, type Plan, type Prepared,
} from '../../../vendor/elekloader/kit/src/kit/index.ts'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import type { BuilderResult } from './protocol'

export { buildStep } from '../../../vendor/elekloader/kit/src/kit/index.ts'
export type { Builder }
export const MACHINE_DEVICE = { octatrack: 'octatrack', digitakt: 'digitakt-mk1', digitone: 'digitone-mk1' } as const
export type ElekloaderMachine = keyof typeof MACHINE_DEVICE
export const BUILDER_CATALOG: Catalog = parseCatalog(CATALOG_JSON)
export const BUILDER_SOURCE = { repository: 'https://github.com/irpina/elekloader', commit: KIT.commit, version: KIT.version, protocol: KIT.protocol, catalogRevision: BUILDER_CATALOG.revision }

export function createMachineBuilder(): Builder {
  return createBuilder({
    base: new URL('elekloader/', document.baseURI).href,
    worker: () => new Worker(new URL('../../../vendor/elekloader/kit/src/kit/worker.ts', import.meta.url), { type: 'module' }),
  })
}

export function planBuild(machine: ElekloaderMachine, release: string, moduleIds: readonly string[], catalog: Catalog = BUILDER_CATALOG): Plan {
  return kitPlanBuild(catalog, MACHINE_DEVICE[machine], release, moduleIds)
}

export function builderReleases(machine: ElekloaderMachine, moduleId: string, catalog: Catalog = BUILDER_CATALOG) {
  return releases(catalog, MACHINE_DEVICE[machine], moduleId)
}

export type PreparedBuild = Prepared
export function prepareBuild(builder: Builder, input: { machine: ElekloaderMachine; release: string; stock: File; moduleIds: readonly string[] }, catalog: Catalog = BUILDER_CATALOG): Promise<PreparedBuild> {
  return prepare(builder, { catalog, device: MACHINE_DEVICE[input.machine], os: input.release, stock: input.stock, ids: input.moduleIds })
}

/** Private source-port qualification uses the same worker, with locally compiled, pinned .elemods.
 * This does not add these files to the public catalogue or change publication/qualification gates. */
export async function prepareLocalBuild(builder: Builder, input: { machine: ElekloaderMachine; release: string; stock: File; mods: readonly { file: File; sha256: string }[] }): Promise<PreparedBuild> {
  for (const mod of input.mods) {
    const bytes = new Uint8Array(await mod.file.arrayBuffer())
    if (!/^[a-f0-9]{64}$/.test(mod.sha256) || sha(bytes) !== mod.sha256)
      return { ok: false, error: mod.file.name + ' does not match its private source-build pin.' }
    try {
      if (JSON.parse(new TextDecoder().decode(bytes)).elemod !== 2)
        return { ok: false, error: 'Machine extensions require linkable format-2 .elemods, not a wrapped firmware composition.' }
    } catch { return { ok: false, error: mod.file.name + ' is not a readable .elemod.' } }
  }
  const ready = await builder.load()
  if (ready.protocol !== KIT.protocol) return { ok: false, error: 'The builder uses a different kit protocol.' }
  const stock = await builder.setStock(input.stock)
  if (!stock.ok) return { ok: false, error: stock.error }
  if (stock.dev.key !== MACHINE_DEVICE[input.machine] || stock.os !== input.release)
    return { ok: false, error: 'The stock firmware does not match the selected machine and OS.', device: stock.dev }
  const paths: string[] = []
  for (const mod of input.mods) {
    const added = await builder.addMod(mod.file)
    if (!added.ok) return { ok: false, error: added.error, device: stock.dev }
    if (paths.includes(added.mod.path))
      return { ok: false, error: 'Local packages must have distinct file names; one package replaced another.', device: stock.dev }
    paths.push(added.mod.path)
  }
  let enabled = [...paths]
  for (const path of paths) enabled = await builder.tick(enabled, path)
  if (enabled.some(path => !paths.includes(path)))
    return { ok: false, error: 'Include a pinned local file for every dependency and the core; this selection picked a file outside the private build.', device: stock.dev }
  const check = await builder.check(enabled)
  return check.ok ? { ok: true, enabled, check, device: stock.dev } : { ok: false, error: check.headline ?? 'These mods cannot be built together.', check, device: stock.dev }
}

export function buildLogText(input: { device: string; release: string; version: string; enabled: readonly string[]; result: BuilderResult }) {
  return kitBuildLogText({ title: 'Modwerk build log', device: input.device, os: input.release, version: input.version, enabled: input.enabled, result: input.result,
    builder: `elekloader kit ${KIT.version} (${KIT.commit.slice(0, 12)}, protocol ${KIT.protocol}), catalog ${BUILDER_CATALOG.revision}` })
}
