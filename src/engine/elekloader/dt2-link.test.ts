import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CATALOG from '../../../vendor/elekloader/catalog/catalog.json'
import DT2_BASE from '../../../sdk/machines/digitakt-ii/base-binding.json'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import type { Catalog } from '../../../vendor/elekloader/kit/src/kit/catalog.ts'
import { createService } from '../../../vendor/elekloader/kit/src/kit/serve.ts'
import { preflightBuiltFile } from './digi-preflight.ts'
import { linkDt2Image } from './dt2-link.ts'
import { buildWithLock, prepareBuild, type Builder } from './machine-build.ts'

// With the owner's OS 1.17 file (never in the repository): MODWERK_DT2_STOCK=<Digitakt_II_OS1.17.syx>, and optionally
// MODWERK_DT2_MACHINE=<a machine module's .elemod> for a set whose sound chip is composed.
const STOCK = process.env.MODWERK_DT2_STOCK, MACHINE = process.env.MODWERK_DT2_MACHINE
describe.runIf(STOCK)('a Digitakt II image built off the page and on it', () => {
  const BASE = 'https://modwerk.test/elekloader/'
  const baseFile = 'modwerk-base-digitakt-ii-' + DT2_BASE.identity.slice(0, 8) + '.elemod'
  const baseBytes = new Uint8Array(readFileSync(new URL('../../../sdk/imports/packages/modwerk-base-digitakt-ii/' + baseFile, import.meta.url)))
  const machineBytes = MACHINE ? new Uint8Array(readFileSync(MACHINE)) : null
  const machine = machineBytes ? JSON.parse(new TextDecoder().decode(machineBytes)) as { id: string; version: string } : null
  const machineFile = machine ? `${machine.id}-${machine.version}-os1.17.elemod` : ''
  const files = new Map<string, Uint8Array>([[baseFile, baseBytes], ...(machineBytes ? [[machineFile, machineBytes] as [string, Uint8Array]] : [])])
  const template = (CATALOG as Catalog).cores.find(core => core.device === 'digitakt-mk2' && core.version === '1.1')!
  const catalog: Catalog = {
    ...(CATALOG as Catalog),
    cores: [...(CATALOG as Catalog).cores.filter(core => core !== template), { ...template, file: baseFile, sha256: sha(baseBytes) }],
    mods: [...(CATALOG as Catalog).mods, ...(machine ? [{
      file: machineFile, sha256: sha(machineBytes!), id: machine.id, version: machine.version, device: 'digitakt-mk2', os: '1.17', license: 'GPL-3.0-or-later',
      source: { repo: 'repeat98/modwerk', commit: '0'.repeat(40), path: 'local/' + machineFile }, title: machine.id, requires: ['core'], conflicts: [], needs_core: '1.1',
    } as Catalog['mods'][number]] : [])],
  }
  const builder = () => {
    const handle = createService(async url => {
      const file = url.slice(BASE.length)
      return file === 'catalog.json' ? new TextEncoder().encode(JSON.stringify(catalog))
        : files.get(file) ?? new Uint8Array(readFileSync(new URL('../../../vendor/elekloader/catalog/' + file, import.meta.url)))
    })
    const call = <T,>(name: string, args: Record<string, unknown> = {}, data?: ArrayBuffer) => handle({ call: name, args, data }) as Promise<T>
    return {
      call, load: () => call('init', { base: BASE }), setStock: async (file: File) => call('set_stock', { name: file.name }, await file.arrayBuffer()),
      addCatalogMod: (file: string) => call('add_catalog_mod', { file }), mods: () => call('mods'),
      tick: (enabled: readonly string[], path: string) => call('tick', { enabled, path }), check: (enabled: readonly string[]) => call('check', { enabled }),
    } as unknown as Builder
  }
  // Read only when the tests run: vitest collects this block even without the owner's OS.
  const readStock = () => new Uint8Array(readFileSync(STOCK!))
  /** The page: the builder worker's kit build, then the preflight, which composes the sound chip. */
  const onPage = async (moduleIds: string[]) => {
    const client = builder(), stock = readStock()
    const prepared = await prepareBuild(client, { machine: 'digitakt-ii', release: '1.17', stock: new File([stock], 'Digitakt_II_OS1.17.syx'), moduleIds }, catalog)
    if (!prepared.ok) throw new Error(prepared.error)
    const result = await buildWithLock(client, prepared.enabled, 'MW01', 'test', null)
    if (!result.ok) throw new Error(result.error)
    await preflightBuiltFile('digitakt-ii', new Blob([stock]), prepared.enabled, result.files, async name => files.get(name)
      ?? new Uint8Array(readFileSync(new URL('../../../vendor/elekloader/catalog/' + name, import.meta.url))))
    return sha(new Uint8Array(result.files.find(file => /\.syx$/i.test(file.name))!.data))
  }
  /** Off the page: scripts/link-image.mjs's path. */
  const offPage = async (names: string[]) => sha((await linkDt2Image(readStock(), names.map(name => ({ name, bytes: files.get(name)! })), 'MW01')).syx)

  it('makes the same base-only image both ways', async () => {
    expect(await offPage([baseFile])).toBe(await onPage([]))
  }, 120_000)

  it.runIf(MACHINE)('makes the same composed image both ways for a set with a machine', async () => {
    expect(await offPage([baseFile, machineFile])).toBe(await onPage([machine!.id]))
  }, 120_000)
})
