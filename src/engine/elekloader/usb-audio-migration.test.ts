import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { USB_AUDIO_LAYOUTS, USB_AUDIO_MODULE, USB_AUDIO_VERSION, usbAudioPreset, changeUsbAudioLayout, usbAudioForSelection, usbAudioInstallPreset, usbAudioFromInstallPreset } from '../../config/usb-audio'
import { createSelection, parseSelection } from '../../config/selection'
import { inventoryUsbAudio, matchesUsbAudio, modulesToPutBack, rememberInventory, SAVED_BY_ANOTHER_BASE, type Inventory } from '../../config/inventory'
import { CURRENT_BASE, prepareCardSet, prepareModuleSet, type RuntimePackage } from './module-set'
import { rememberSuccessfulSync } from '../../config/octatrack-progress'
import manifest from '../assets/octatrack-module-packages.json'
import events from '../../../sdk/machines/octatrack/events.json'

afterEach(() => vi.unstubAllGlobals())

const entry = manifest.usbAudio.configurable
const canonical = Uint8Array.from(readFileSync(new URL('../../../public/' + entry.path, import.meta.url)))
const capable = { abi: 10, features: 0xffff, maxSites: 128, maxCopies: 128 }
const ids = [USB_AUDIO_MODULE]
const empty: Inventory = { moduleIds: [], removedStockFx: [] }
const load = async (p: RuntimePackage) => { expect(p.sha256).toBe(entry.sha256); return canonical }
const prepare = (usbAudio: Parameters<typeof usbAudioInstallPreset>[0], current = empty) =>
  prepareModuleSet({ name: 'Old set', moduleIds: ids, usbAudio }, current, load, capable, CURRENT_BASE)
const words = new DataView(canonical.buffer)
const record = 76 + 4 * words.getUint32(20) + (words.getUint32(76 + 4 * (events.events.find(e => e.event === 'ot_settings')!.index)) & 0xffffff)
const readSeed = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(record + 20)
const installed = (preset: number) => ({ moduleIds: ids, removedStockFx: [], usbAudioLayout: 'configurable' as const, usbAudioInstallPreset: preset })

it('installs stereo Main over USB and on the card for a newly selected module', async () => {
  const usbAudio = usbAudioForSelection(ids)
  const prepared = await prepare(usbAudio)
  const data = prepared.changes[0].data
  expect(readSeed(data)).toBe(0x8000010c)
  const card = await prepareCardSet({ name: 'New set', moduleIds: ids, usbAudio }, load, 100000)
  expect(card.file.subarray(92, 92 + data.length)).toEqual(data)
  expect((await prepare(usbAudio, installed(0x8000010c))).changes).toEqual([])
})

it.each(USB_AUDIO_LAYOUTS)('migrates $id from a version 4 backup identically over USB and on the card', async layout => {
  const count = layout.pairs.length
  const saved = { ...changeUsbAudioLayout(usbAudioPreset('outbox'), layout.id), outboxPairs: [count, 0, count, 1] }
  const backup = createSelection(ids, null, true, { [USB_AUDIO_MODULE]: USB_AUDIO_VERSION }, saved)
  const { usbAudio, moduleIds } = parseSelection(JSON.stringify({ ...backup, name: 'My old set' }))
  expect(usbAudio).toEqual(saved)
  const prepared = await prepare(usbAudio)
  const data = prepared.changes[0].data
  const bits = { 'tracks-main-cue': 0, tracks: 4, 'tracks-post': 36, 'main-cue': 8, main: 12, master: 16 }
  const seed = (0x80000040 | bits[layout.id] | count << 8 | count << 16 | 1 << 20) >>> 0
  expect(readSeed(data)).toBe(seed)
  expect(usbAudioFromInstallPreset(seed)).toEqual(saved)
  expect(readSeed(canonical)).toBe(0)
  expect(data.subarray(0, record + 20)).toEqual(canonical.subarray(0, record + 20))
  expect(data.subarray(record + 24)).toEqual(canonical.subarray(record + 24))
  const card = await prepareCardSet({ name: 'Old set', moduleIds, usbAudio }, load, 100000)
  expect(card.base).toBe(CURRENT_BASE)
  expect(card.layout).toBe('off')
  expect(card.file.subarray(92, 92 + data.length)).toEqual(data)
  expect((await prepare(usbAudio, installed(seed))).changes).toEqual([])
})

it('switches between saved presets and restores the exact previous bytes with Undo', async () => {
  const previous = usbAudioPreset('outbox')
  const original = (await prepare(previous)).changes[0].data
  const current = installed(readSeed(original))
  const next = await prepare(usbAudioPreset('computer'), current)
  expect(next.changes[0].undo).toEqual(original)
  expect(readSeed(next.changes[0].data)).not.toEqual(readSeed(original))
  // A backup without a USB settings block used the original 20-channel profile.
  expect((await prepare(undefined, current)).changes[0].data).toEqual(canonical)
  // Editing only other modules on the device must preserve the active preset.
  expect((await prepareModuleSet({ name: 'Unit', moduleIds: ids }, current, load, capable, CURRENT_BASE)).changes).toEqual([])
})

it('recovers built-in USB Audio from the previous base identity even if it was its only module', () => {
  const oldTracksPost = '94101a5a4a5fb2899b7ff7e1572f51e60579ae21d7f4eb289f6a96fca1fb2295'
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) })
  rememberInventory(oldTracksPost, empty)
  expect(modulesToPutBack(CURRENT_BASE, SAVED_BY_ANOTHER_BASE, empty)).toMatchObject({
    moduleIds: ids, usbAudio: { layout: 'tracks-post', destination: 'computer' }
  })
})

it('puts back the saved Outbox routing when two sets use the same linked layout', () => {
  const oldTracksPost = '94101a5a4a5fb2899b7ff7e1572f51e60579ae21d7f4eb289f6a96fca1fb2295'
  const saved = { ...changeUsbAudioLayout(usbAudioPreset('outbox'), 'tracks-post'), outboxPairs: [8, 8, 0, 2] }
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) })
  rememberSuccessfulSync({ base: oldTracksPost, active: '1'.repeat(64), name: 'Studio', moduleIds: ids, usbAudio: saved, at: '2026-11-20T10:00:00Z' })
  rememberInventory(oldTracksPost, empty)
  const recovered = modulesToPutBack(CURRENT_BASE, SAVED_BY_ANOTHER_BASE, empty)!
  expect(recovered.usbAudio).toEqual(saved)
  expect(matchesUsbAudio(saved, recovered)).toBe(true)
  expect(matchesUsbAudio({ ...saved, destination: 'computer' }, recovered)).toBe(false)
  expect(matchesUsbAudio({ ...saved, outboxPairs: [8, 0, 8, 2] }, recovered)).toBe(false)
  const packaged = inventoryUsbAudio(CURRENT_BASE, { moduleIds: ids, usbAudioInstallPreset: usbAudioInstallPreset(saved) })
  expect(packaged.usbAudio).toEqual(saved)
  expect(matchesUsbAudio(usbAudioPreset('outbox'), packaged)).toBe(false)
  const classic = inventoryUsbAudio(CURRENT_BASE, { moduleIds: ids, usbAudioInstallPreset: 0 })
  expect(matchesUsbAudio(undefined, classic)).toBe(true)
  expect(matchesUsbAudio(usbAudioPreset('computer'), classic)).toBe(false)
})
