import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CATALOG from '../../../vendor/elekloader/catalog/catalog.json'
import RYTM_BASE from '../../../sdk/machines/analog-rytm-mkii/base-binding.json'
import FX_IDS from '../../../sdk/machines/analog-rytm-mkii/fx-ids.json'
import VOICE_MODULES from '../../../sdk/machines/analog-rytm-mkii/voice-modules.json'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import type { Catalog } from '../../../vendor/elekloader/kit/src/kit/catalog.ts'
import { createService } from '../../../vendor/elekloader/kit/src/kit/serve.ts'
import { exportText, packageRecipe } from '../../../scripts/package-elemod-recipe.mjs'
import { baseVariant, buildWithLock, builtLock, prepareBuild, type Builder } from './machine-build.ts'

// The site builds an Analog Rytm MKII set on Modwerk's own base (sdk/machines/analog-rytm-mkii/base-binding.json): the
// send-bus variant when the set holds a send effect, voices when it holds a digital voice machine and no send effect, the
// plain one otherwise.
const read = (file: string) => new Uint8Array(readFileSync(new URL('../../../vendor/elekloader/catalog/' + file, import.meta.url)))
type Variant = 'plain' | 'voices' | 'send-bus'
const VARIANTS = ['plain', 'voices', 'send-bus'] as const
const variantPin = (variant: Variant) => CATALOG.cores.find(core => core.sha256 === RYTM_BASE.variants[variant])!
const variantPackage = (variant: Variant) => JSON.parse(new TextDecoder().decode(read(variantPin(variant).file)))
const FX_EXPORTS = ['mw_fx_rate', 'mw_fx_onepole', 'mw_fx_tempo']

describe('the Rytm sets\' Modwerk base', () => {
  it('serves each variant base-binding.json names, pinned by its identity', () => {
    for (const variant of VARIANTS) {
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
  it('gives the voices variant send-bus\'s digital voices and lock words, and none of the send bus, its clock or the FX list', () => {
    const voices = variantPackage('voices'), bus = variantPackage('send-bus')
    for (const name of ['mw_voices', 'ev_sound_applied']) {
      expect(Object.keys(voices.collections), name).toContain(name)
      expect(Object.keys(bus.collections), name).toContain(name)
    }
    expect(Object.keys(voices.collections)).not.toContain('mw_fx')
    for (const name of FX_EXPORTS) expect(voices.exports).not.toContain(name)
    expect((voices.exports as string[]).filter(name => name.startsWith('mw_send_') || name.startsWith('mw_clock_'))).toEqual([])
    // the voice type keeps send-bus's field, so a lockfile carries it between the two; the bus's fields stay behind
    expect(voices.storage).toEqual(bus.storage.filter((field: { sym: string }) => !field.sym.startsWith('mw_send_')))
    expect(voices.storage).toEqual([{ sym: 'mw_voice_type', scope: 'sound', bits: 3 }])
    // the FX track's lock words: the same sites in both
    const sites = (pack: { sites: { addr: string }[] }) => pack.sites.map(site => site.addr)
    for (const addr of ['0x4000940c', '0x40009216', '0x40008f98', '0x4011f654']) expect(sites(voices), addr).toContain(addr)
    for (const addr of ['0x4010ee66', '0x401c5324', '0x401c5358']) expect(sites(voices), addr).not.toContain(addr)
    const run = (pack: { sections: Record<string, { len?: number; size?: number }> }) => pack.sections['.run'].len ?? pack.sections['.run'].size ?? 0
    expect(run(voices)).toBeLessThan(run(bus) - 12_000)
  })
  it('gives every variant the machine list sections: the table and the three sites of stock\'s sort', () => {
    for (const variant of VARIANTS) {
      const pack = variantPackage(variant)
      expect(Object.keys(pack.collections), variant).toContain('mw_machine_sections')
      const sites = (pack.sites as { addr: string }[]).map(site => site.addr)
      for (const addr of ['0x400df664', '0x400bdc5e', '0x400bde1c']) expect(sites, variant + ' ' + addr).toContain(addr)
    }
  })
  it('takes the send-bus variant for every module that contributes to the FX list', () => {
    const root = new URL('../../../sdk/analog-rytm-mkii/modules/', import.meta.url)
    // _submissions/ takes no modules since #1170, and Git drops it once the last one moves out.
    const folders = readdirSync(root).filter(name => !name.startsWith('_')).map(name => new URL(name + '/', root))
    const effects = folders.filter(folder => existsSync(new URL('build.json', folder)) &&
      JSON.parse(readFileSync(new URL('build.json', folder), 'utf8')).contribute.some((entry: { to: string }) => entry.to === 'mw_fx'))
      .map(folder => folder.pathname.split('/').at(-2)!)
    expect(effects.sort()).toEqual(Object.values(FX_IDS.ids).sort())
    for (const id of effects) expect(baseVariant('analog-rytm-mkii', ['loop-sync', id]), id).toBe('send-bus')
    expect(baseVariant('analog-rytm-mkii', ['loop-sync', 'filter-hz'])).toBe('plain')
  })
  it('takes the voices variant for every digital voice machine, and send-bus beside a send effect', () => {
    expect(VOICE_MODULES.ids.length).toBeGreaterThan(0)
    for (const id of VOICE_MODULES.ids) {
      expect(baseVariant('analog-rytm-mkii', ['loop-sync', id]), id).toBe('voices')
      expect(baseVariant('analog-rytm-mkii', [id, 'chorus']), id).toBe('send-bus')
    }
  })
})

// A whole build through the site's own builder path (prepareBuild, buildWithLock) and the kit's worker logic, with the
// owner's stock OS, which never enters Git: MODWERK_RYTM_STOCK names Analog-Rytm_MKII_OS1.74.syx, MODWERK_RYTM_FX the
// output folder of scripts/build-elemod-packages.mjs --drafts for the send effects whose packages have not joined the
// library yet (each one in the catalogue is built from its pinned package). Run locally; CI has no stock file.
const STOCK = process.env.MODWERK_RYTM_STOCK, FX = process.env.MODWERK_RYTM_FX
describe.runIf(STOCK && FX)('a Rytm set built on the Modwerk base with the owner\'s OS', () => {
  const BASE = 'https://modwerk.test/elekloader/'
  const unpinned = ['chorus', 'flanger', 'phaser', 'wavefolder'].filter(id => existsSync(FX + '/analog-rytm-mkii/' + id + '/1.74.json') && !(CATALOG as Catalog).mods.some(mod => mod.id === id))
  const exported = new Map(unpinned.map(id => {
    const plan = JSON.parse(readFileSync(FX + '/analog-rytm-mkii/' + id + '/1.74.json', 'utf8'))
    return [`${id}-${plan.version}-os1.74.elemod`, { id, version: plan.version as string, data: new TextEncoder().encode(exportText(packageRecipe(plan))) }]
  }))
  const catalog: Catalog = { ...(CATALOG as Catalog), mods: [...(CATALOG as Catalog).mods, ...[...exported].map(([file, mod]) => ({
    file, sha256: sha(mod.data), id: mod.id, version: mod.version, device: 'analog-rytm-mk2', os: '1.74', license: 'GPL-3.0-or-later',
    source: { repo: 'repeat98/modwerk', commit: '0'.repeat(40), path: 'sdk/imports/packages/' + mod.id + '/' + file },
    title: mod.id.toUpperCase(), requires: ['core'], conflicts: [], needs_core: '0.7',
  }))] }
  const effects = ['chorus', 'flanger', 'phaser', 'wavefolder'].filter(id => catalog.mods.some(mod => mod.id === id))
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

  it('builds CHORUS (and FLANGER, PHASER and WAVEFOLDER) with Loop Sync on send-bus, keeping the plain set\'s storage in place', async () => {
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

  it('builds Analog BD alone on voices, and carries its lockfile to send-bus with CHORUS and back', async () => {
    const voices = await build(['analog-bd'])
    expect(voices.enabled.some(path => path.endsWith(variantPin('voices').file))).toBe(true)
    const bus = await build(['analog-bd', 'chorus'], voices.lock)
    expect(bus.enabled.some(path => path.endsWith(variantPin('send-bus').file))).toBe(true)
    for (const field of voices.lock!.fields) expect(bus.lock!.fields, field.sym).toContainEqual(field)
    // back on voices the bus's fields leave the build but keep their bits, so the next send-bus build is the same layout
    const back = await build(['analog-bd'], bus.lock)
    for (const field of voices.lock!.fields) expect(back.lock!.fields, field.sym).toContainEqual(field)
    for (const field of bus.lock!.fields.filter(field => field.sym.startsWith('mw_send_'))) expect(back.lock!.freed, field.sym).toContainEqual(field)
    expect((await build(['analog-bd', 'chorus'], back.lock)).lock!.id).toBe(bus.lock!.id)
  }, 180_000)
})
