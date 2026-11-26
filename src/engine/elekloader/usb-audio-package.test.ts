// SPDX-License-Identifier: GPL-3.0-or-later
// USB Audio as a module package (docs/OCTATRACK_USB_AUDIO_MODULE.md): the catalogue picks the set's layout's package,
// reads the installed layout from the unit, replaces it on a change and keeps the base-variant path while the manifest
// lists no package. Synthetic package bytes only.
import { describe, expect, it, vi } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import manifest from '../assets/octatrack-module-packages.json' with { type: 'json' }
import { USB_AUDIO_MODULE, USB_AUDIO_PACKAGED, type UsbAudioLayout, type UsbAudioPackageKind } from '../../config/usb-audio'
import { countsTowardLimit, limitedCount } from '../../catalog/set-limit'
import { BaseLayoutRequired, createRuntimeCatalogue, ModuleSetError, removalPackage, runtimeId, usbAudioLayoutNumber, type RuntimePackage } from './module-set'

const capable = { abi: 8, features: 0xffff, maxSites: 128, maxCopies: 128 }
const empty = { moduleIds: [], removedStockFx: [] }
function audioPackage(layout: UsbAudioPackageKind, number = usbAudioLayoutNumber(layout)) {
  // An ABI 8 header, three two-byte guarded sites (as module-set.test.ts groupPackage) and nothing else: enough for the site's checks, not a module.
  const data = new Uint8Array(76 + 3 * 42), v = new DataView(data.buffer)
  v.setUint32(0, 0x4d57524d); v.setUint16(4, 8); v.setUint32(24, 3); v.setUint32(28, Number.parseInt(runtimeId(USB_AUDIO_MODULE), 16)); v.setUint16(66, number)
  for (let i = 0; i < 3; i++) { v.setUint32(76 + i * 42, 0x40001000 + i * 4); data[76 + i * 42 + 4] = 2; data[76 + i * 42 + 6] = 2 }
  // No hook words: a real package subscribes to the base's USB hooks (feature 128), which this branch's site-events.json
  // does not list until the base change (draft #1848) lands.
  const entry: RuntimePackage = { abi: 8, features: 0, sites: 3, copies: 0, fills: 0, bytes: data.length, sha256: sha(data), path: `test/usb-${layout}.mwrm`, name: 'USB Audio' }
  return { entry, data }
}
function audioCatalogue(layouts: UsbAudioPackageKind[]) {
  const packages = new Map(layouts.map(layout => [layout, audioPackage(layout)]))
  const catalogue = createRuntimeCatalogue({ packages: [], usbAudio: Object.fromEntries([...packages].map(([layout, item]) => [layout, item.entry])) })
  const fetched = vi.fn(async (entry: { path: string }) => [...packages.values()].find(item => item.entry.path === entry.path)!.data)
  const on = (layout: number) => catalogue.inventory([{ handle: 255, layout, module: runtimeId(USB_AUDIO_MODULE), name: 'USB AUDIO' }])
  return { catalogue, fetched, on, data: (layout: UsbAudioPackageKind) => packages.get(layout)!.data }
}
const set = (layout?: UsbAudioLayout) => ({ name: 'Set', moduleIds: layout ? [USB_AUDIO_MODULE] : [], ...(layout ? { usbAudio: { layout } } : {}) })

describe('USB Audio as a module package', () => {
  it('installs the same configurable package for every set and keeps panel choices on a later sync', async () => {
    const { catalogue, fetched, data, on } = audioCatalogue(['main', 'configurable'])
    for (const layout of ['tracks', 'master', 'main-cue'] as const) {
      const result = await catalogue.prepare(set(layout), empty, fetched, capable)
      expect(result.changes[0].data).toEqual(data('configurable'))
      expect(catalogue.review(set(layout), on(9), capable).needsSync).toBe(false)
    }
    const migration = await catalogue.prepare(set('main'), on(5), fetched, capable)
    expect(migration.changes[0]).toMatchObject({ data: data('configurable'), undo: data('main'), reconnects: true })
    const removal = await catalogue.prepare(set(), on(9), fetched, capable)
    expect(removal.changes[0].undo).toEqual(data('configurable'))
  })
  it('replaces the output-only 0.3.0 package on the unit, with that package as the Undo', async () => {
    const { catalogue, fetched, data, on } = audioCatalogue(['configurable-0.3', 'configurable'])
    expect(on(7).usbAudioLayout).toBe('configurable-0.3')
    expect(catalogue.review(set('main'), on(7), capable)).toMatchObject({ needsSync: true, updates: [USB_AUDIO_MODULE], problem: undefined })
    const update = await catalogue.prepare(set('main'), on(7), fetched, capable)
    expect(update.changes).toEqual([{ module: 'USB Audio', data: data('configurable'), undo: data('configurable-0.3'), replaces: true, reconnects: true }])
    expect((await catalogue.prepare(set(), on(7), fetched, capable)).changes[0].undo).toEqual(data('configurable-0.3'))
  })
  it('replaces 0.4.0, whose input endpoint Windows refuses, with that package as the Undo', async () => {
    const { catalogue, fetched, data, on } = audioCatalogue(['configurable-0.3', 'configurable-0.4', 'configurable'])
    expect([on(7), on(8), on(9)].map(inventory => inventory.usbAudioLayout)).toEqual(['configurable-0.3', 'configurable-0.4', 'configurable'])
    expect(catalogue.review(set('main'), on(8), capable)).toMatchObject({ needsSync: true, updates: [USB_AUDIO_MODULE], problem: undefined })
    const update = await catalogue.prepare(set('main'), on(8), fetched, capable)
    expect(update.changes).toEqual([{ module: 'USB Audio', data: data('configurable'), undo: data('configurable-0.4'), replaces: true, reconnects: true }])
    expect((await catalogue.prepare(set(), on(8), fetched, capable)).changes[0].undo).toEqual(data('configurable-0.4'))
  })
  it('numbers each layout by its source define plus one', () => {
    expect(['tracks-main-cue', 'tracks', 'master', 'main-cue', 'main', 'tracks-post'].map(layout => usbAudioLayoutNumber(layout as UsbAudioLayout))).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('installs the package of the set’s layout like any module, undone by removing it', async () => {
    const { catalogue, fetched, data } = audioCatalogue(['tracks-main-cue', 'main'])
    expect(catalogue.audioPackages).toBe(true)
    expect(catalogue.review(set('main'), empty, capable)).toMatchObject({ needsSync: true, changes: { add: [USB_AUDIO_MODULE] }, problem: undefined })
    const prepared = await catalogue.prepare(set('main'), empty, fetched, capable)
    expect(prepared.changes).toEqual([{ module: 'USB Audio', data: data('main'), undo: removalPackage(USB_AUDIO_MODULE), reconnects: true }])
  })
  it('reads the installed layout from the unit and has nothing to do when it is the set’s', () => {
    const { catalogue, on } = audioCatalogue(['tracks-main-cue', 'main'])
    expect(on(5)).toEqual({ moduleIds: [USB_AUDIO_MODULE], removedStockFx: [], usbAudioLayout: 'main' })
    expect(catalogue.review(set('main'), on(5), capable)).toMatchObject({ needsSync: false, updates: [], problem: undefined })
  })
  it('replaces another layout on the unit, with that layout’s package as the Undo', async () => {
    const { catalogue, fetched, on, data } = audioCatalogue(['tracks-main-cue', 'main'])
    expect(catalogue.review(set('tracks-main-cue'), on(5), capable)).toMatchObject({ needsSync: true, updates: [USB_AUDIO_MODULE], problem: undefined })
    const prepared = await catalogue.prepare(set('tracks-main-cue'), on(5), fetched, capable)
    expect(prepared.changes).toEqual([{ module: 'USB Audio', data: data('tracks-main-cue'), undo: data('main'), replaces: true, reconnects: true }])
  })
  it('removes it with the installed layout’s package as the Undo', async () => {
    const { catalogue, fetched, on, data } = audioCatalogue(['tracks-main-cue', 'main'])
    const prepared = await catalogue.prepare(set(), on(1), fetched, capable)
    expect(prepared.changes).toEqual([{ module: 'USB Audio', data: removalPackage(USB_AUDIO_MODULE), undo: data('tracks-main-cue'), replaces: true, reconnects: true }])
  })
  it('refuses to replace or remove a layout it has no package for, and a layout that is not published, before fetching', async () => {
    const { catalogue, fetched, on } = audioCatalogue(['tracks-main-cue'])
    const unknown = on(99)
    expect(unknown.usbAudioLayout).toBeUndefined()
    for (const target of [set(), set('tracks-main-cue')]) await expect(catalogue.prepare(target, unknown, fetched, capable)).rejects.toThrow('safely replace')
    await expect(catalogue.prepare(set('master'), empty, fetched, capable)).rejects.toThrow('isn’t published as a module package')
    expect(fetched).not.toHaveBeenCalled()
  })
  it('refuses a package whose header names another layout', async () => {
    const wrong = audioPackage('main', 1)
    const catalogue = createRuntimeCatalogue({ packages: [], usbAudio: { main: wrong.entry } })
    await expect(catalogue.prepare(set('main'), empty, async () => wrong.data, capable)).rejects.toBeInstanceOf(ModuleSetError)
  })
  it('refuses a manifest that lists an unknown layout or USB Audio also as an ordinary package', () => {
    const item = audioPackage('main')
    expect(() => createRuntimeCatalogue({ packages: [], usbAudio: { stereo: item.entry } as never })).toThrow(ModuleSetError)
    expect(() => createRuntimeCatalogue({ packages: [{ ...item.entry, id: USB_AUDIO_MODULE, name: 'USB Audio' }], usbAudio: { main: item.entry } })).toThrow(ModuleSetError)
  })
  it('keeps USB Audio with the base while the manifest lists no package', () => {
    const catalogue = createRuntimeCatalogue({ packages: [] })
    expect(catalogue.audioPackages).toBe(false)
    const review = catalogue.review(set('main'), empty, capable, 'not-a-published-base')
    expect(review.changes.add).toEqual([]) // the base provides it: nothing to add as a package
    expect(review.problem === undefined || review.problem instanceof BaseLayoutRequired || review.problem instanceof ModuleSetError).toBe(true)
  })
  it('flags USB Audio as packaged exactly when the manifest publishes its packages', () => {
    expect(USB_AUDIO_PACKAGED).toBe(Object.keys((manifest as { usbAudio?: object }).usbAudio ?? {}).length > 0)
  })
  it('counts toward the module limit only as a package', () => {
    expect(countsTowardLimit(USB_AUDIO_MODULE, false)).toBe(false)
    expect(countsTowardLimit(USB_AUDIO_MODULE, true)).toBe(true)
    expect(countsTowardLimit('repitch', false)).toBe(true)
    expect(limitedCount(['repitch', USB_AUDIO_MODULE])).toBe(USB_AUDIO_PACKAGED ? 2 : 1)
  })
})
