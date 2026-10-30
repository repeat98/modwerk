import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import manifest from '../assets/octatrack-module-packages.json' with { type: 'json' }
import siteEvents from '../../../sdk/machines/octatrack/site-events.json' with { type: 'json' }
import baseBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { removal } from '../../dev/octatrack-usb-lifecycle'
import { BASE_DSP_FEATURES, BaseUpdateRequired, createRuntimeCatalogue, KEY_BUS_BASES, KeyBusBaseRequired, type MachineVariant, fetchPackage, inventoryFrom, ModuleSetError, prepareModuleSet, removalPackage, runtimeId, SITE_EVENTS, USB_MODULE_IDS } from './module-set'

const file = (path: string) => new Uint8Array(readFileSync(new URL('../../../public/' + path, import.meta.url)))
const load = async (entry: { path: string }) => file(entry.path)
const empty = { moduleIds: [], removedStockFx: [] }

describe('the site’s runtime packages', () => {
  it('publishes each listed module with its checked runtime identity, ABI and record counts', () => {
    expect(USB_MODULE_IDS).toEqual(['everb', 'miniverb', 'tapehead', 'airwindows-chorus', 'lofi2', 'ring-sc', 'previewvol', 'apply-scene', 'repitch', 'poly8', 'vector', 'synth', 'quantizer', 'tapeecho', 'euclid', 'bbd', 'playmodes', 'mute-modes', 'sidechain-compressor', 'output-matrix', 'cc-map', 'quantize-live-rec-toggle', 'direct-jump-kyoti', 'dejavu', 'arp-key-locks', 'recorder-loop-fix', 'analog-bassdrum', 'beat-slicer', 'usb-audio-out-tracks-main-cue'])
    for (const entry of manifest.packages) {
      const data = file(entry.path), view = new DataView(data.buffer), abi = view.getUint16(4)
      expect(entry.path).toBe(`octatrack-modules/${entry.id}/${entry.version}.mwrm`)
      expect([data.length, sha(data), view.getUint32(28).toString(16).padStart(8, '0')]).toEqual([entry.bytes, entry.sha256, runtimeId(entry.id)])
      expect(String.fromCharCode(...data.subarray(0, 4))).toBe('MWRM')
      if (!('octabam' in entry) && !('machine' in entry) && !('tables' in entry) && !('base' in entry) && !('sources' in entry)) expect([abi, view.getUint32(20), view.getUint32(24)]).toEqual([entry.requires ? 9 : 6, 0, 0]) // ABI 6 DSP effects (9 when they require a base feature) carry no stock-code bytes
      if ('machine' in entry) expect([abi, view.getUint16(6) & 4]).toEqual([8, 0]) // an independent machine package, never a group
      expect([entry.abi, entry.sites, entry.copies, entry.fills]).toEqual([abi, view.getUint32(24), abi >= 7 ? view.getUint32(68) : 0, abi === 8 ? view.getUint32(72) : 0])
      expect(view.getUint32(20) > 0).toBe((entry.features & 128) !== 0) // only a site-event subscriber has hook words
      // A package bound to a base names exactly the published one (octatrack:base writes its binding).
      expect((entry as { requiredBase?: string }).requiredBase).toBe('base' in entry ? baseBinding.identity : undefined)
    }
  })
  it('lets a package subscribe to at most the base’s site events', () => {
    const events = JSON.parse(readFileSync(new URL('../../../sdk/machines/octatrack/events.json', import.meta.url), 'utf8')).events
    expect(SITE_EVENTS).toBe(events.length)
  })
  it('names a module by the first four bytes of the SHA-256 of its catalogue id, and removes it with an empty package', () => {
    expect(runtimeId('everb')).toBe('873d83cc')
    expect(runtimeId('0000002a')).toBe('0000002a') // a module the catalogue does not know keeps its runtime id
    expect(removalPackage('everb')).toEqual(removal('', 0x873d83cc).data) // scripts/device.mjs's removal
  })
})

describe('preparing a module set', () => {
  it('requires exact observed base identity before fetching a bound forward or Undo package', async () => {
    const requiredBase = 'a'.repeat(64), entry = { ...manifest.packages[0], requiredBase }
    const catalogue = createRuntimeCatalogue({ packages: [entry] }), fetched = vi.fn(load)
    const target = { name: 'Bound', moduleIds: ['everb'] }, current = { ...empty, moduleIds: ['everb'] }
    for (const base of [undefined, 'b'.repeat(64)]) {
      await expect(catalogue.prepare(target, empty, fetched, undefined, base)).rejects.toThrow('exact Modwerk base')
      await expect(catalogue.prepare({ name: 'Remove', moduleIds: [] }, current, fetched, undefined, base)).rejects.toThrow('exact Modwerk base')
      expect(catalogue.review(target, empty, undefined, base).problem?.message).toContain('exact Modwerk base')
    }
    expect(fetched).not.toHaveBeenCalled()
    expect((await catalogue.prepare(target, empty, fetched, undefined, requiredBase)).changes).toHaveLength(1)
    expect((await catalogue.prepare({ name: 'Remove', moduleIds: [] }, current, fetched, undefined, requiredBase)).changes[0].undo).toEqual(file(entry.path))
    expect(() => createRuntimeCatalogue({ packages: [{ ...entry, requiredBase: 'not-an-identity' }] })).toThrow('inconsistent')
    expect(() => createRuntimeCatalogue({ packages: [{ ...entry, requiredBase: [requiredBase] as unknown as string }] })).toThrow('inconsistent')
  })
  it('removes first, then installs, each with the package that undoes it', async () => {
    const current = inventoryFrom([{ handle: 27, layout: 1, module: '873d83cc', name: 'E-Verb' }, { handle: 0xff, layout: 0, module: '0000002a', name: '' }])
    expect(current).toEqual({ moduleIds: ['everb', '0000002a'], removedStockFx: [] })
    const { name, changes } = await prepareModuleSet({ name: 'Live', moduleIds: ['tapehead', 'miniverb'] }, current, load,
      { abi: 8, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 })
    expect(name).toBe('Live')
    expect(changes.map(change => change.module)).toEqual(['E-Verb', '0000002a', 'TapeHead', 'Mini Verb'])
    expect(changes[0]).toEqual({ module: 'E-Verb', data: removalPackage('everb'), undo: file(manifest.packages[0].path) })
    expect(changes[1]).toEqual({ module: '0000002a', data: removalPackage('0000002a'), undo: undefined }) // nothing to put back
    expect(changes[2]).toEqual({ module: 'TapeHead', data: file(manifest.packages[2].path), undo: removalPackage('tapehead') })
  })
  it('refuses what the base cannot do yet, before anything is sent', async () => {
    await expect(prepareModuleSet({ name: 'Set', moduleIds: ['everb', 'tapeecho'] }, empty, load)).rejects.toThrow(ModuleSetError)
    await expect(prepareModuleSet({ name: 'Set', moduleIds: [], removedStockFx: ['DARK REV'] }, empty, load)).rejects.toThrow(/stock effects/)
  })
  it('preflights each package’s actual requirements and composes every published package on a capable base', async () => {
    const target = { name: 'All published', moduleIds: USB_MODULE_IDS }, fetched = vi.fn(load)
    // RINGMOD SC is a published ABI 9 package (a key bus reader) and Analog BD's carries its engine for the base's hook
    // site (ABI 10): a capable base reports ABI 10.
    const events = { abi: 10, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 }
    await expect(prepareModuleSet(target, empty, fetched)).rejects.toBeInstanceOf(BaseUpdateRequired)
    await expect(prepareModuleSet(target, empty, fetched, { ...events, features: 7 })).rejects.toBeInstanceOf(BaseUpdateRequired) // Repitch subscribes
    await expect(prepareModuleSet(target, empty, fetched, { ...events, abi: 7 })).rejects.toBeInstanceOf(BaseUpdateRequired)
    await expect(prepareModuleSet(target, empty, fetched, { ...events, maxSites: 1 })).rejects.toBeInstanceOf(BaseUpdateRequired)
    await expect(prepareModuleSet(target, empty, fetched, events, 'b'.repeat(64))).rejects.toBeInstanceOf(BaseUpdateRequired) // an older base
    expect(fetched).not.toHaveBeenCalled()
    const result = await prepareModuleSet(target, empty, fetched, events, baseBinding.identity)
    expect(result.changes.map(change => change.module)).toEqual(manifest.packages.map(entry => entry.name))
    expect(result.changes.every(change => change.undo?.length === 32)).toBe(true)
    // An ABI 8 loader still takes every package but the ABI 9 and 10 ones (RINGMOD SC, Analog BD's engine package),
    // which ask for the base update.
    const abi9 = manifest.packages.filter(entry => ((entry as { abi?: number }).abi ?? 0) >= 9).map(entry => entry.id)
    expect([...abi9].sort()).toEqual(['analog-bassdrum', 'ring-sc'])
    for (const id of abi9) await expect(prepareModuleSet({ name: id, moduleIds: [id] }, empty, fetched, { ...events, abi: 8 }, baseBinding.identity)).rejects.toBeInstanceOf(BaseUpdateRequired)
    const older = await prepareModuleSet({ name: 'ABI 8', moduleIds: USB_MODULE_IDS.filter(id => !abi9.includes(id)) }, empty, fetched, { ...events, abi: 8 }, baseBinding.identity)
    expect(older.changes.map(change => change.module)).toEqual(manifest.packages.filter(entry => !abi9.includes(entry.id)).map(entry => entry.name))
  })
  it('refuses hook words a subscriber’s manifest does not declare, or more than the base dispatches', async () => {
    const entry = manifest.packages.find(item => item.id === 'repitch')!, data = file(entry.path)
    const events = { abi: 8, features: 7 | 128, maxSites: 128, maxCopies: 128 }
    const undeclared = createRuntimeCatalogue({ packages: [{ ...entry, features: entry.features & ~128 }] })
    await expect(undeclared.prepare({ name: 'Set', moduleIds: ['repitch'] }, empty, load, events)).rejects.toThrow('inconsistent')
    const core = data.slice(), view = new DataView(core.buffer)
    view.setUint32(76, view.getUint32(76 + 4 * 4) & 0xffffff) // a core handler instead of the subscription
    view.setUint32(76 + 4 * 4, 0xffffffff)
    const moved = createRuntimeCatalogue({ packages: [{ ...entry, bytes: core.length, sha256: sha(core) }] })
    await expect(moved.prepare({ name: 'Set', moduleIds: ['repitch'] }, empty, async () => core, events)).rejects.toThrow('inconsistent')
  })
  it('checks a raised event’s slot, a take event’s record and a table’s record as the loader does', async () => {
    const index = (name: string) => siteEvents.events.find(event => event.event === name)!.index
    const events = { abi: 8, features: 7 | 128, maxSites: 128, maxCopies: 128 }
    // Authored synthetic bytes only: an ABI 8 header, hook words, a zeroed image, no records and no firmware data.
    function subscriber(words: Record<number, number>, image = 96, slot = 0) {
      const hooks = Math.max(...Object.keys(words).map(Number)) + 1, data = new Uint8Array(76 + 4 * hooks + image), v = new DataView(data.buffer)
      v.setUint32(0, 0x4d57524d); v.setUint16(4, 8); v.setUint32(8, image); v.setUint32(20, hooks); v.setUint32(28, Number.parseInt(runtimeId('mute-modes'), 16))
      for (let i = 0; i < hooks; i++) v.setUint32(76 + 4 * i, words[i] ?? 0xffffffff)
      if (slot) v.setUint32(76 + 4 * hooks + slot, 0x12345678)
      const entry = { id: 'mute-modes', name: 'Mute Modes', abi: 8, features: 128, sites: 0, copies: 0, fills: 0, bytes: data.length, sha256: sha(data), path: 'test/sub.mwrm' }
      return createRuntimeCatalogue({ packages: [entry] }).prepare({ name: 'Set', moduleIds: ['mute-modes'] }, empty, async () => data, events)
    }
    const raise = (offset: number) => 255 << 24 | offset, order = (offset: number) => 50 << 24 | offset
    await expect(subscriber({ [index('ev_mute_keep')]: raise(8) })).resolves.toBeDefined()
    await expect(subscriber({ [index('ev_mute_keep')]: order(8) })).resolves.toBeDefined() // a handler of the raised event
    await expect(subscriber({ [index('ev_mute_keep')]: raise(8) }, 96, 8)).rejects.toThrow('inconsistent') // the slot is not zero
    await expect(subscriber({ [index('ev_mute_keep')]: raise(94) })).rejects.toThrow('inconsistent') // the slot reaches past the image
    await expect(subscriber({ [index('ev_play_increment')]: raise(8) })).rejects.toThrow('inconsistent') // no raise on a site event
    await expect(subscriber({ [index('ev_midi_note_on')]: order(88) })).resolves.toBeDefined()
    await expect(subscriber({ [index('ev_midi_note_on')]: order(90) })).rejects.toThrow('inconsistent') // {claims, entry} past the image
    await expect(subscriber({ [index('ot_machines')]: order(16) })).resolves.toBeDefined()
    await expect(subscriber({ [index('ot_machines')]: order(20) })).rejects.toThrow('inconsistent') // an 80-byte record past the image
    await expect(subscriber({ [4 + SITE_EVENTS]: order(8) })).rejects.toThrow('inconsistent') // past the base's events
  })
  it('fetches the site’s copy and refuses one that did not arrive intact', async () => {
    const entry = manifest.packages[0], data = file(entry.path)
    vi.stubGlobal('fetch', async (url: string) => { expect(url).toBe('/' + entry.path + '?sha256=' + entry.sha256); return new Response(data) })
    expect(await fetchPackage(entry)).toEqual(data)
    vi.stubGlobal('fetch', async () => new Response(data.subarray(1)))
    await expect(fetchPackage(entry)).rejects.toThrow(/couldn’t fetch E-Verb intact/)
    vi.unstubAllGlobals()
  })
})

/** An ABI 9 package from an ABI 6 DSP package, as sdk/runtime/loader/abi9.py writes one: the 80-byte header (ABI 8's
 * copy and fill counts, then requires u16, the claim count and the hook-entry count), then the claims and hook entries
 * after the fills, before the DSP words. Authored synthetic records around a published package; no firmware data. */
type Claim = [space: number, core: number, access: number, address: number, words: number]
function abi9(data: Uint8Array, requires: number, claims: Claim[], entries: number[][] = []) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), words = view.getUint32(32), relocations = view.getUint16(36)
  const tail = 4 * words + 2 * relocations, body = data.subarray(68), records = new Uint8Array(12 * claims.length + 8 * entries.length)
  const r = new DataView(records.buffer)
  claims.forEach(([space, core, access, address, n], i) => { records.set([space, core, access, 0], 12 * i); r.setUint32(12 * i + 4, address); r.setUint32(12 * i + 8, n) })
  entries.forEach(([site, cores, entry], i) => { const at = 12 * claims.length + 8 * i; records.set([site, cores], at); r.setUint32(at + 4, entry) })
  const out = new Uint8Array(80 + body.length + records.length), o = new DataView(out.buffer)
  out.set(data.subarray(0, 68)); o.setUint16(4, 9); o.setUint16(76, requires); out[78] = claims.length; out[79] = entries.length
  out.set(body.subarray(0, body.length - tail), 80); out.set(records, 80 + body.length - tail); out.set(body.subarray(body.length - tail), 80 + body.length - tail + records.length)
  return out
}
/** A key bus reader's claims (RINGMOD SC's): reads of each core's bus and of both halves of the window, inside KEYBUS's regions. */
const readerClaims: Claim[] = [[2, 0, 1, 0x800, 0x200], [2, 1, 1, 0x800, 0x200], [2, 0, 1, 0x33dfe, 0x202], [2, 1, 1, 0x3bdfe, 0x202]]

describe('ABI 9 packages: base features and DSP claims', () => {
  const effect = manifest.packages.find(item => item.id === 'everb')!, published = file(effect.path)
  const keybus = { abi: 9, features: 7 | 128, maxSites: 128, maxCopies: 128 }, at = baseBinding.identity
  const reader = (data = abi9(published, BASE_DSP_FEATURES, readerClaims), fields: Record<string, unknown> = {}) => {
    const entry = { ...effect, abi: 9, requires: BASE_DSP_FEATURES, claims: readerClaims.length, bytes: data.length, sha256: sha(data), ...fields }
    return { catalogue: createRuntimeCatalogue({ packages: [entry] }), data }
  }
  const target = { name: 'Reader', moduleIds: ['everb'] }
  it('offers only the key bus, which the base reports through its loader’s ABI 9', () => {
    const sites = JSON.parse(readFileSync(new URL('../../../sdk/machines/octatrack/dsp-sites.json', import.meta.url), 'utf8'))
    expect(BASE_DSP_FEATURES).toBe(sites.features.find((feature: { name: string }) => feature.name === 'keybus').bit)
    expect(BASE_DSP_FEATURES).toBe(8)
    // The Octatrack's on-demand base provides exactly that (resident_engines.c); the loader refuses any other bit.
    const engines = readFileSync(new URL('../../../sdk/machines/octatrack/module-adapters/resident-runtime/resident_engines.c', import.meta.url), 'utf8')
    expect(engines).toContain('unsigned modwerk_machine_dsp_features(void) { return MW_DSP_KEYBUS; }')
    expect(readFileSync(new URL('../../../sdk/runtime/loader/loader.h', import.meta.url), 'utf8')).toMatch(/#define RUNTIME_ABI 10u?\b/)
  })
  it('syncs a reader to a base whose loader reports ABI 9, with its forward and Undo packages checked', async () => {
    const { catalogue, data } = reader(), fetched = vi.fn(async () => data)
    await expect(catalogue.prepare(target, empty, fetched)).rejects.toBeInstanceOf(BaseUpdateRequired)
    await expect(catalogue.prepare(target, empty, fetched, { ...keybus, abi: 8 }, at)).rejects.toBeInstanceOf(BaseUpdateRequired)
    expect(catalogue.review(target, empty, { ...keybus, abi: 8 }, at).problem).toBeInstanceOf(BaseUpdateRequired)
    expect(fetched).not.toHaveBeenCalled()
    for (const base of KEY_BUS_BASES) {
      expect(catalogue.review(target, empty, keybus, base).problem).toBeUndefined()
      await expect(catalogue.prepare(target, empty, fetched, keybus, base)).resolves.toBeDefined()
    }
    const { changes } = await catalogue.prepare(target, empty, fetched, keybus, at)
    expect(changes).toEqual([{ module: 'E-Verb', data, undo: removalPackage('everb') }])
    expect((await catalogue.prepare({ name: 'Empty', moduleIds: [] }, { ...empty, moduleIds: ['everb'] }, fetched, keybus, at)).changes[0].undo).toEqual(data)
    // A reader that claims nothing is as valid: the base owns the bus's words.
    const bare = abi9(published, BASE_DSP_FEATURES, [])
    await expect(reader(bare, { claims: 0 }).catalogue.prepare(target, empty, async () => bare, keybus, at)).resolves.toBeDefined()
  })
  it('offers a reader only to a base known to have the key bus, with the guided update saying why', async () => {
    const { catalogue, data } = reader(), fetched = vi.fn(async () => data)
    const variants = Object.values((baseBinding as { variants?: Record<string, string> }).variants ?? {})
    expect(new Set(KEY_BUS_BASES)).toEqual(new Set([baseBinding.identity, ...variants])) // every USB Audio layout of it
    for (const base of variants) expect(catalogue.review(target, empty, keybus, base).problem).toBeUndefined()
    // The published base is built with the resident engines on demand, the only bases with the key bus.
    expect(readFileSync(new URL('../../../scripts/octatrack-base.mjs', import.meta.url), 'utf8')).toMatch(/const BETA = \{[^}]*'resident-on-demand': true/)
    for (const base of [undefined, 'b'.repeat(64)]) {
      const problem = catalogue.review(target, empty, keybus, base).problem
      expect(problem).toBeInstanceOf(KeyBusBaseRequired)
      expect(problem).toBeInstanceOf(BaseUpdateRequired)
      expect(problem?.message).toContain('E-Verb needs a Modwerk base with the key bus')
      await expect(catalogue.prepare(target, empty, fetched, keybus, base)).rejects.toBeInstanceOf(KeyBusBaseRequired)
      // Its Undo too: removing a reader from such a base would retain a package it can't take back.
      await expect(catalogue.prepare({ name: 'Empty', moduleIds: [] }, { ...empty, moduleIds: ['everb'] }, fetched, keybus, base)).rejects.toBeInstanceOf(KeyBusBaseRequired)
    }
    expect(fetched).not.toHaveBeenCalled()
    expect(catalogue.review(target, empty, keybus, at).problem).toBeUndefined()
  })
  it('refuses a manifest that leaves out ABI 9’s fields, names an unknown feature or gives them to an older ABI', () => {
    for (const fields of [{ requires: undefined }, { claims: undefined }, { requires: 16 }, { requires: BASE_DSP_FEATURES | 1 }, { claims: 17 }, { claims: -1 },
      { abi: 8, requires: BASE_DSP_FEATURES, claims: 0 }, { abi: 8, requires: 0, claims: 1 }, { abi: 10 }])
      expect(() => reader(undefined, fields)).toThrow('inconsistent')
  })
  it('checks the header and every claim as the loader does before anything is sent', async () => {
    const refused = async (data: ReturnType<typeof abi9>, fields: Record<string, unknown> = {}) => {
      const { catalogue } = reader(data, fields)
      await expect(catalogue.prepare(target, empty, async () => data, keybus, at)).rejects.toThrow('inconsistent')
    }
    await refused(abi9(published, 0, readerClaims)) // requires differs from the manifest
    await refused(abi9(published, BASE_DSP_FEATURES, readerClaims.slice(1))) // claim count differs
    await refused(abi9(published, BASE_DSP_FEATURES, readerClaims, [[0, 3, 0]]), {}) // a hook entry: no base has hook slots
    for (const claim of [[3, 0, 1, 0x800, 1], [2, 2, 1, 0x800, 1], [2, 0, 0, 0x800, 1], [2, 0, 4, 0x800, 1], [2, 0, 1, 0x800, 0],
      [2, 0, 1, 0x2fff0, 0x20], [2, 0, 1, 0x3fff0, 0x20], [2, 0, 1, 0x40000, 1]] as Claim[])
      await refused(abi9(published, BASE_DSP_FEATURES, [claim]), { claims: 1 })
    // Two of a package's own claims meeting: the same core and space, or anywhere in the window whatever the core.
    await refused(abi9(published, BASE_DSP_FEATURES, [[2, 0, 1, 0x800, 0x40], [2, 0, 1, 0x83f, 1]]), { claims: 2 })
    await refused(abi9(published, BASE_DSP_FEATURES, [[2, 0, 1, 0x33dfe, 0x10], [1, 1, 1, 0x33e00, 1]]), { claims: 2 })
    const apart = abi9(published, BASE_DSP_FEATURES, [[2, 0, 1, 0x800, 0x40], [2, 1, 1, 0x800, 0x40], [1, 0, 1, 0x800, 0x40]])
    await expect(reader(apart, { claims: 3 }).catalogue.prepare(target, empty, async () => apart, keybus, at)).resolves.toBeDefined()
    const reserved = abi9(published, BASE_DSP_FEATURES, readerClaims); reserved[80 + published.length - 68 - (4 * new DataView(published.buffer).getUint32(32) + 2 * new DataView(published.buffer).getUint16(36)) + 3] = 1
    await refused(reserved) // the first claim's reserved byte
  })
})

/** An ABI 10 engine package from an ABI 8 controller package, as sdk/runtime/loader/abi9.py `engine` writes one: the
 * 80-byte header with DSP words and no slot, then after the fills its claims (here each written with its initial words),
 * one hook entry (site, cores, exit, entry 0), the words, relocations and the initial words. Synthetic words. */
type EngineClaim = [space: number, core: number, address: number, init: number[]]
function abi10(data: Uint8Array, words: number[], relocations: number[], exit: number, claims: EngineClaim[], site = 5, cores = 3) {
  const body = data.subarray(76), init = claims.flatMap(claim => claim[3])
  const out = new Uint8Array(80 + body.length + 12 * claims.length + 8 + 4 * words.length + 2 * relocations.length + 4 * init.length), o = new DataView(out.buffer)
  out.set(data.subarray(0, 76)); o.setUint16(4, 10); o.setUint32(32, words.length); o.setUint16(36, relocations.length)
  out[78] = claims.length; out[79] = 1; out.set(body, 80)
  let at = 80 + body.length
  for (const [space, core, address, values] of claims) { out.set([space, core, 7, 0], at); o.setUint32(at + 4, address); o.setUint32(at + 8, values.length); at += 12 }
  out.set([site, cores], at); o.setUint16(at + 2, exit); o.setUint32(at + 4, 0); at += 8
  for (const w of words) { o.setUint32(at, w); at += 4 }
  for (const r of relocations) { o.setUint16(at, r); at += 2 }
  for (const w of init) { o.setUint32(at, w); at += 4 }
  return out
}

describe('ABI 10 packages: an engine for the base\'s hook sites', () => {
  // A synthetic ABI 8 controller of Analog BD's id (its 32-byte image zeros), as base_bound.machine's build.py output.
  const controller = { ...manifest.packages.find(item => item.id === 'analog-bassdrum')!, features: 0, sites: 0, copies: 0, fills: 0 }
  const published = new Uint8Array(76 + 32), header = new DataView(published.buffer)
  header.setUint32(0, 0x4d57524d); header.setUint16(4, 8); header.setUint32(8, 32); header.setUint32(28, Number.parseInt(runtimeId('analog-bassdrum'), 16))
  const base = { abi: 10, features: 7 | 128, maxSites: 128, maxCopies: 128 }, at = baseBinding.identity
  const words = Array.from({ length: 40 }, (_, i) => (i * 0x1357 + 3) & 0xffffff)
  words[3] = 7; words[30] = 0x0d10c0; words[31] = 0 // an address relocation's offset; the exit's long branch
  const region: EngineClaim = [1, 2, 0x2840, Array.from({ length: 16 }, (_, i) => i * 99)]
  const engine = (data: Uint8Array = abi10(published, words, [3, 9 | 0x8000], 31, [region]), fields: Record<string, unknown> = {}) => {
    const entry = { ...controller, abi: 10, requires: 0, claims: 1, entries: 1, bytes: data.length, sha256: sha(data), ...fields }
    return { catalogue: createRuntimeCatalogue({ packages: [entry] }), data }
  }
  const target = { name: 'Drum', moduleIds: ['analog-bassdrum'] }
  it('syncs a base-bound engine package to its base when its loader reports ABI 10', async () => {
    const { catalogue, data } = engine(), fetched = vi.fn(async () => data)
    await expect(catalogue.prepare(target, empty, fetched, { ...base, abi: 9 }, at)).rejects.toBeInstanceOf(BaseUpdateRequired)
    const { changes } = await catalogue.prepare(target, empty, fetched, base, at)
    expect(changes).toEqual([{ module: 'Analog BD', data, undo: removalPackage('analog-bassdrum') }])
  })
  it('refuses an engine outside a base-bound package, a manifest that miscounts it and records the loader refuses', async () => {
    for (const fields of [{ requiredBase: undefined }, { entries: undefined }, { entries: 9 }, { abi: 9 }])
      expect(() => engine(undefined, fields)).toThrow('inconsistent')
    const refused = async (data: Uint8Array, fields: Record<string, unknown> = {}) => {
      const { catalogue } = engine(data, fields)
      await expect(catalogue.prepare(target, empty, async () => data, base, at)).rejects.toThrow('inconsistent')
    }
    await refused(abi10(published, words, [3, 9 | 0x8000], 31, [region]), { entries: 0 }) // the entry count differs
    await refused(abi10(published, words, [3, 31 | 0x8000], 31, [region])) // its exit is a relocation's word
    await refused(abi10(published, words, [3, 9 | 0x8000], 40, [region])) // its exit is past its words
    await refused(abi10(published, words, [9, 3], 31, [region])) // relocations out of order
    await refused(abi10(published, words, [3, 9 | 0x8000], 31, [[1, 3, 0x2840, [1]]])) // no such core
    const short = abi10(published, words, [3, 9 | 0x8000], 31, [region]); await refused(short.subarray(0, short.length - 4)) // an initial word short
    const big = abi10(published, words, [3, 9 | 0x8000], 31, [[1, 2, 0x2840, [0x1000000]]]); await refused(big) // not 24 bits
    const slot = abi10(published, words, [3, 9 | 0x8000], 31, [region]); slot[45] = 1; await refused(slot) // a price in an engine's descriptor
  })
})

const allMachines = ['poly8', 'vector', 'synth']
const machineBits: Record<string, number> = { poly8: 1, vector: 2, synth: 4 }
const capable = { abi: 8, features: 31, maxSites: 128, maxCopies: 128 }
function groupPackage(ids: string[], layout: number, current = true, counts = { sites: 1, copies: 1, fills: 1 }) {
  // Authored synthetic bytes only: one machine-group prefix, bounded empty records and no firmware data.
  const data = new Uint8Array(76 + 32 + counts.sites * 42 + counts.copies * 44 + counts.fills * 12)
  const v = new DataView(data.buffer)
  v.setUint32(0, 0x4d57524d); v.setUint16(4, 8); v.setUint16(6, 4); v.setUint32(8, 32)
  v.setUint32(24, counts.sites); v.setUint32(28, Number.parseInt(runtimeId('octatrack-machines'), 16)); v.setUint16(66, layout)
  v.setUint32(68, counts.copies); v.setUint32(72, counts.fills)
  v.setUint32(76, 0x4d574d47); data[80] = 1; data[81] = ids.reduce((mask, id) => mask | machineBits[id], 0)
  for (let i = 0; i < counts.sites; i++) { v.setUint32(108 + i * 42, 0x40001000 + i * 4); data[108 + i * 42 + 4] = 2; data[108 + i * 42 + 6] = 2 }
  let cursor = 108 + counts.sites * 42
  for (let i = 0; i < counts.copies; i++, cursor += 44) { v.setUint32(cursor, 16 + i * 2); v.setUint32(cursor + 4, 0x40002000 + i * 2); v.setUint16(cursor + 8, 2) }
  for (let i = 0; i < counts.fills; i++, cursor += 12) { v.setUint32(cursor, 24 + i); v.setUint32(cursor + 4, 1); data[cursor + 8] = 0x7f }
  const entry: MachineVariant = { layout, current, members: ids.map(id => ({ id, version: current ? '0.2.0' : '0.1.0' })),
    abi: 8, features: 8, ...counts, bytes: data.length, sha256: sha(data), path: `test/${layout}.mwrm` }
  return { entry, data }
}
function machineCatalogue(packages: ReturnType<typeof groupPackage>[]) {
  const catalogue = createRuntimeCatalogue({ packages: [], groups: [{ id: 'octatrack-machines', name: 'Machines', variants: packages.map(item => item.entry) }] })
  const fetched = vi.fn(async (entry: { path: string }) => packages.find(item => item.entry.path === entry.path)!.data)
  const inventory = (layout: number) => catalogue.inventory([{ handle: 255, layout, module: runtimeId('octatrack-machines'), name: 'Machines' }])
  return { catalogue, fetched, inventory }
}

describe('machine groups over USB', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('selects exactly subset %i without adding hidden members', async mask => {
    const packages = Array.from({ length: 7 }, (_, i) => groupPackage(allMachines.filter(id => machineBits[id] & (i + 1)), 100 + i))
    const { catalogue, fetched, inventory } = machineCatalogue(packages)
    const wanted = allMachines.filter(id => machineBits[id] & mask)
    const result = await catalogue.prepare({ name: 'Set', moduleIds: wanted }, empty, fetched, capable)
    expect(result.changes).toEqual([{ module: 'Machines', data: packages[mask - 1].data, undo: removalPackage('octatrack-machines') }])
    expect(inventory(99 + mask)).toEqual({ moduleIds: wanted, removedStockFx: [], runtimeGroups: [{ id: 'octatrack-machines', layout: 99 + mask }] })
  })
  it('updates the same member IDs from a retained layout and restores that exact package on Undo', async () => {
    const old = groupPackage(['vector', 'synth'], 14, false), next = groupPackage(['vector', 'synth'], 29)
    const { catalogue, fetched, inventory } = machineCatalogue([old, next])
    const set = { name: 'Studio', moduleIds: ['synth', 'vector'] }
    expect(catalogue.review(set, inventory(14), capable)).toMatchObject({ needsSync: true, updates: ['synth', 'vector'], changes: { add: [], remove: [] }, problem: undefined })
    const prepared = await catalogue.prepare(set, inventory(14), fetched, capable)
    expect(prepared.changes).toEqual([{ module: 'Machines', data: next.data, undo: old.data }])
    expect(catalogue.review(set, inventory(29), capable)).toMatchObject({ needsSync: false, updates: [], problem: undefined })
  })
  it('does not substitute a larger combination when the selected subset is unpublished', async () => {
    const { catalogue, fetched } = machineCatalogue([groupPackage(allMachines, 12)])
    await expect(catalogue.prepare({ name: 'Set', moduleIds: ['vector'] }, empty, fetched, capable)).rejects.toThrow('combination')
    expect(fetched).not.toHaveBeenCalled()
  })
  it('keeps an unknown layout visible and refuses to remove or replace it without a retained Undo package', async () => {
    const { catalogue, fetched, inventory } = machineCatalogue([groupPackage(allMachines, 12)])
    const unknown = inventory(999)
    expect(unknown.moduleIds).toEqual([runtimeId('octatrack-machines')])
    for (const moduleIds of [[], ['poly8']]) await expect(catalogue.prepare({ name: 'Set', moduleIds }, unknown, fetched, capable)).rejects.toThrow('safely replace')
    expect(catalogue.review({ name: 'Set', moduleIds: unknown.moduleIds }, unknown, capable).needsSync).toBe(false)
    expect(fetched).not.toHaveBeenCalled()
  })
  it.each([
    undefined,
    { ...capable, abi: 7 },
    { ...capable, features: 7 }, // current format-only base deliberately has no table/group admission
    { ...capable, features: 31 & ~1 },
    { ...capable, features: 31 & ~2 },
    { ...capable, features: 31 & ~4 },
    { ...capable, maxSites: 0 },
    { ...capable, maxCopies: 0 },
  ])('requires an adequate base before fetching any package (%j)', async capabilities => {
    const old = groupPackage(['synth'], 11, false), next = groupPackage(['synth'], 12)
    const { catalogue, fetched, inventory } = machineCatalogue([old, next])
    const set = { name: 'Set', moduleIds: ['synth'] }
    const review = catalogue.review(set, inventory(11), capabilities)
    expect(review.needsSync).toBe(true); expect(review.problem).toBeInstanceOf(BaseUpdateRequired)
    await expect(catalogue.prepare(set, inventory(11), fetched, capabilities)).rejects.toBeInstanceOf(BaseUpdateRequired)
    expect(fetched).not.toHaveBeenCalled()
  })
  it('preflights the retained Undo package even when the forward package needs fewer capabilities', async () => {
    const old = groupPackage(['synth'], 11, false), next = groupPackage(['synth'], 12, true, { sites: 0, copies: 0, fills: 0 })
    const { catalogue, fetched, inventory } = machineCatalogue([old, next])
    await expect(catalogue.prepare({ name: 'Set', moduleIds: ['synth'] }, inventory(11), fetched, { ...capable, maxCopies: 0 })).rejects.toBeInstanceOf(BaseUpdateRequired)
    expect(fetched).not.toHaveBeenCalled()
  })
  it('removes a known group as one transaction with the exact retained package for Undo', async () => {
    const old = groupPackage(allMachines, 11, false), { catalogue, fetched, inventory } = machineCatalogue([old])
    const result = await catalogue.prepare({ name: 'Empty', moduleIds: [] }, inventory(11), fetched, capable)
    expect(result.changes).toEqual([{ module: 'Machines', data: removalPackage('octatrack-machines'), undo: old.data }])
  })
  it.each(['member mask', 'layout', 'module id', 'flags', 'site count', 'copy count', 'fill count', 'truncated record', 'undo hash', 'site keep', 'site checked', 'odd site', 'empty copy', 'copy outside image', 'copy reserved', 'empty fill', 'fill outside image', 'zero fill value', 'fill reserved', 'fill over copy', 'nonzero placeholder'])('refuses %s mismatches before returning a transaction', async field => {
    const old = groupPackage(allMachines, 11, false), next = groupPackage(allMachines, 12)
    const selected = field === 'undo hash' ? old : next, v = new DataView(selected.data.buffer)
    if (field === 'member mask') selected.data[81] = 3
    if (field === 'layout') v.setUint16(66, 999)
    if (field === 'module id') v.setUint32(28, 1)
    if (field === 'flags') v.setUint16(6, 0)
    if (field === 'site count') v.setUint32(24, 2)
    if (field === 'copy count') v.setUint32(68, 2)
    if (field === 'fill count') v.setUint32(72, 2)
    if (field === 'truncated record') selected.data = selected.data.slice(0, -1)
    if (field === 'site keep') selected.data[113] = 3
    if (field === 'site checked') selected.data[114] = 0
    if (field === 'odd site') v.setUint32(108, 0x40001001)
    if (field === 'empty copy') v.setUint16(158, 0)
    if (field === 'copy outside image') v.setUint32(150, 32)
    if (field === 'copy reserved') v.setUint16(160, 1)
    if (field === 'empty fill') v.setUint32(198, 0)
    if (field === 'fill outside image') v.setUint32(194, 32)
    if (field === 'zero fill value') selected.data[202] = 0
    if (field === 'fill reserved') selected.data[203] = 1
    if (field === 'fill over copy') v.setUint32(194, 16)
    if (field === 'nonzero placeholder') selected.data[92] = 0xff
    if (field === 'undo hash') selected.data[100] = 1
    else { selected.entry.sha256 = sha(selected.data); selected.entry.bytes = selected.data.length }
    const { catalogue, fetched, inventory } = machineCatalogue([old, next])
    await expect(catalogue.prepare({ name: 'Set', moduleIds: allMachines }, inventory(11), fetched, capable)).rejects.toBeInstanceOf(ModuleSetError)
  })
  it('refuses legacy individual-machine migration without exact retained package identity', async () => {
    const next = groupPackage(['synth'], 12), { fetched } = machineCatalogue([next])
    const catalogue = createRuntimeCatalogue({ packages: [{ ...manifest.packages[0], id: 'synth', name: 'FM Synth' }],
      groups: [{ id: 'octatrack-machines', name: 'Machines', variants: [next.entry] }] })
    await expect(catalogue.prepare({ name: 'Set', moduleIds: ['synth'] }, { moduleIds: ['synth'], removedStockFx: [] }, fetched, capable)).rejects.toThrow('exact individual machine package')
    expect(fetched).not.toHaveBeenCalled()
  })
  it('rejects ambiguous runtime IDs across ordinary packages, hexadecimal aliases and groups', () => {
    expect(() => createRuntimeCatalogue({ packages: [manifest.packages[0], { ...manifest.packages[0], id: runtimeId('everb') }] })).toThrow('inconsistent')
    expect(() => createRuntimeCatalogue({ packages: [manifest.packages[0]], groups: [{ id: 'everb', name: 'Machines', variants: [groupPackage(['vector'], 1).entry] }] })).toThrow('inconsistent')
  })
  it('rejects duplicate selection variants, unknown member bits and incomplete ABI metadata', () => {
    const one = groupPackage(['poly8'], 11), two = groupPackage(['poly8'], 12)
    expect(() => machineCatalogue([one, two])).toThrow('inconsistent')
    two.entry.members = [{ id: 'unrecognised', version: '0.1.0' }]
    expect(() => machineCatalogue([two])).toThrow('inconsistent')
    delete one.entry.fills
    expect(() => machineCatalogue([one])).toThrow('inconsistent')
  })
})
