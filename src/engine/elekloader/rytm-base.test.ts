import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CATALOG from '../../../vendor/elekloader/catalog/catalog.json'
import RYTM_BASE from '../../../sdk/machines/analog-rytm-mkii/base-binding.json'
import FX_IDS from '../../../sdk/machines/analog-rytm-mkii/fx-ids.json'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import type { Catalog } from '../../../vendor/elekloader/kit/src/kit/catalog.ts'
import { createService } from '../../../vendor/elekloader/kit/src/kit/serve.ts'
import { exportText, packageRecipe } from '../../../scripts/package-elemod-recipe.mjs'
import { baseVariant, buildWithLock, builtLock, prepareBuild, type Builder } from './machine-build.ts'

// The site builds an Analog Rytm MKII set on Modwerk's own base (sdk/machines/analog-rytm-mkii/base-binding.json): the
// send-bus variant when the set holds a send effect, the plain one otherwise.
const read = (file: string) => new Uint8Array(readFileSync(new URL('../../../vendor/elekloader/catalog/' + file, import.meta.url)))
const variantPin = (variant: 'plain' | 'send-bus') => CATALOG.cores.find(core => core.sha256 === RYTM_BASE.variants[variant])!
const variantPackage = (variant: 'plain' | 'send-bus') => JSON.parse(new TextDecoder().decode(read(variantPin(variant).file)))
const FX_EXPORTS = ['mw_fx_rate', 'mw_fx_onepole', 'mw_fx_tempo']

describe('the Rytm sets\' Modwerk base', () => {
  it('serves each variant base-binding.json names, pinned by its identity', () => {
    for (const variant of ['plain', 'send-bus'] as const) {
      expect(variantPin(variant), variant).toMatchObject({ id: 'core', version: '0.7', device: 'analog-rytm-mk2', os: '1.74' })
      expect(sha(read(variantPin(variant).file)), variant).toBe(RYTM_BASE.variants[variant])
    }
    expect(RYTM_BASE.identity).toBe(RYTM_BASE.variants['send-bus'])
  })
  it('gives the FX list and its exports to the send-bus variant only, and its storage with them', () => {
    const plain = variantPackage('plain'), bus = variantPackage('send-bus')
    expect(Object.keys(bus.collections)).toContain('mw_fx')
    expect(bus.exports).toEqual(expect.arrayContaining(FX_EXPORTS))
    expect(Object.keys(plain.collections)).not.toContain('mw_fx')
    for (const name of FX_EXPORTS) expect(plain.exports).not.toContain(name)
    expect(plain.storage).toBeUndefined()
    expect(plain.sections['.bss'].len ?? plain.sections['.bss'].size).toBeLessThan(2048)
  })
  it('takes the send-bus variant for every module that contributes to the FX list', () => {
    const root = new URL('../../../sdk/analog-rytm-mkii/modules/', import.meta.url)
    const folders = [...readdirSync(root).filter(name => !name.startsWith('_')).map(name => new URL(name + '/', root)),
      ...readdirSync(new URL('_submissions/', root)).map(name => new URL('_submissions/' + name + '/', root))]
    const effects = folders.filter(folder => existsSync(new URL('build.json', folder)) &&
      JSON.parse(readFileSync(new URL('build.json', folder), 'utf8')).contribute.some((entry: { to: string }) => entry.to === 'mw_fx'))
      .map(folder => folder.pathname.split('/').at(-2)!)
    expect(effects.sort()).toEqual(Object.values(FX_IDS.ids).sort())
    for (const id of effects) expect(baseVariant('analog-rytm-mkii', ['loop-sync', id]), id).toBe('send-bus')
    expect(baseVariant('analog-rytm-mkii', ['loop-sync', 'filter-hz'])).toBe('plain')
  })
})

// A whole build through the site's own builder path (prepareBuild, buildWithLock) and the kit's worker logic, with the
// owner's stock OS, which never enters Git: MODWERK_RYTM_STOCK names Analog-Rytm_MKII_OS1.74.syx, MODWERK_RYTM_FX the
// output folder of scripts/build-elemod-packages.mjs --drafts for analog-rytm-mkii:chorus (flanger and phaser too when
// there), until their packages join the library. Run locally; CI has no stock file.
const STOCK = process.env.MODWERK_RYTM_STOCK, FX = process.env.MODWERK_RYTM_FX
describe.runIf(STOCK && FX)('a Rytm set built on the Modwerk base with the owner\'s OS', () => {
  const BASE = 'https://modwerk.test/elekloader/'
  const effects = ['chorus', 'flanger', 'phaser'].filter(id => existsSync(FX + '/analog-rytm-mkii/' + id + '/1.74.json'))
  const exported = new Map(effects.map(id => {
    const plan = JSON.parse(readFileSync(FX + '/analog-rytm-mkii/' + id + '/1.74.json', 'utf8'))
    return [`${id}-${plan.version}-os1.74.elemod`, { id, version: plan.version as string, data: new TextEncoder().encode(exportText(packageRecipe(plan))) }]
  }))
  const catalog: Catalog = { ...(CATALOG as Catalog), mods: [...(CATALOG as Catalog).mods, ...[...exported].map(([file, mod]) => ({
    file, sha256: sha(mod.data), id: mod.id, version: mod.version, device: 'analog-rytm-mk2', os: '1.74', license: 'GPL-3.0-or-later',
    source: { repo: 'repeat98/modwerk', commit: '0'.repeat(40), path: 'sdk/imports/packages/' + mod.id + '/' + file },
    title: mod.id.toUpperCase(), requires: ['core'], conflicts: [], needs_core: '0.7',
  }))] }
  const builder = () => {
    const handle = createService(async url => {
      const file = url.slice(BASE.length)
      return file === 'catalog.json' ? new TextEncoder().encode(JSON.stringify(catalog)) : exported.get(file)?.data ?? read(file)
    })
    const call = <T,>(name: string, args: Record<string, unknown> = {}, data?: ArrayBuffer) => handle({ call: name, args, data }) as Promise<T>
    return {
      call, load: () => call('init', { base: BASE }), setStock: async (file: File) => call('set_stock', { name: file.name }, await file.arrayBuffer()),
      addCatalogMod: (file: string) => call('add_catalog_mod', { file }), mods: () => call('mods'),
      tick: (enabled: readonly string[], path: string) => call('tick', { enabled, path }), check: (enabled: readonly string[]) => call('check', { enabled }),
    } as unknown as Builder
  }
  const stock = () => new File([readFileSync(STOCK!)], 'Analog-Rytm_MKII_OS1.74.syx')
  const build = async (moduleIds: string[], store: Parameters<typeof buildWithLock>[4] = null) => {
    const client = builder()
    const prepared = await prepareBuild(client, { machine: 'analog-rytm-mkii', release: '1.74', stock: stock(), moduleIds }, catalog)
    if (!prepared.ok) throw new Error(prepared.error)
    const result = await buildWithLock(client, prepared.enabled, 'MW01', 'test', store)
    if (!result.ok) throw new Error(result.error)
    return { enabled: prepared.enabled, result, lock: builtLock(result) }
  }

  it('builds CHORUS (and FLANGER and PHASER) with Loop Sync on send-bus, keeping the plain set\'s storage in place', async () => {
    expect(effects).toContain('chorus')
    const plain = await build(['loop-sync', 'filter-hz'])
    expect(plain.enabled.some(path => path.endsWith(variantPin('plain').file))).toBe(true)
    expect(plain.result.files.some(file => file.name.endsWith('.syx'))).toBe(true)
    for (const sets of [['chorus'], ['loop-sync', ...effects]]) {
      const bus = await build(sets, plain.lock)
      expect(bus.enabled.some(path => path.endsWith(variantPin('send-bus').file)), sets.join()).toBe(true)
      expect(bus.result.files.some(file => file.name.endsWith('.syx')), sets.join()).toBe(true)
      // the layout lineage: every field of the plain set keeps its place, and the bus's fields come on top
      for (const field of plain.lock?.fields ?? []) if (sets.includes(field.mod)) expect(bus.lock!.fields, field.sym).toContainEqual(field)
      if (sets.includes('loop-sync')) expect(bus.lock!.ancestors.concat(bus.lock!.id)).toContain(plain.lock!.id)
    }
  }, 120_000)
})
