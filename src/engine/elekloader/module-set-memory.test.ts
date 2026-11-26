import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishedBinding as baseBinding, publishedManifest as manifest } from './published-octatrack.fixture'
import pool from '../../../docs/verification/2026-11-21-octatrack-module-pool-allocation.json' with { type: 'json' }
import { USB_AUDIO_MODULE } from '../../config/usb-audio'
import { ModuleSetError, OCTATRACK_POOL_BYTES, poolExtent, prepareModuleSet } from './module-set'

const file = (path: string) => new Uint8Array(readFileSync(new URL('../../../public/' + path, import.meta.url)))
const load = async (entry: { path: string }) => file(entry.path)
const empty: { moduleIds: string[]; removedStockFx: string[] } = { moduleIds: [], removedStockFx: [] }
const capable = { abi: 10, features: 7 | 128 | 512 | 2048 | 4096, maxSites: 128, maxCopies: 128 }
// The set a tester's unit refused for module memory on 24 Nov 2026 (base 0.8.1), synced onto an empty unit.
const refused = ['midi-scenes', 'tapeecho', 'syntiz', 'poly8', 'kits', 'temp-save', 'grain', 'playmodes', 'amiga', 'everb', 'quantizer',
  'dejavu', 'lofi2', 'bbd', 'direct-jump-kyoti', 'arp-key-locks', 'airwindows-chorus', 'vibrato', 'miniverb', 'cc-map', 'slow-lfo',
  'quantize-live-rec-toggle', 'bar-led', USB_AUDIO_MODULE]
const prepare = (moduleIds: string[], current = empty) =>
  prepareModuleSet({ name: 'Set', moduleIds }, current, load, capable, baseBinding.identity)

describe('a module set and the base’s module pool', () => {
  it('prices a package as the loader takes it, as the unit measured', () => {
    const measured = pool.measurements.flatMap(reading => {
      const entry = manifest.packages.find(item => item.sha256 === reading.packageSha256)
      return entry ? [[entry.id, poolExtent(entry, file(entry.path)), reading.loaderExtentBytes]] : []
    })
    expect(measured.length).toBeGreaterThanOrEqual(10)
    for (const [id, computed, read] of measured) expect([id, computed]).toEqual([id, read])
  })

  it('knows the pool the base is built with', () => {
    const built = readFileSync(new URL('../../../sdk/machines/octatrack/elekloader/build_core.py', import.meta.url), 'utf8')
    expect(built.match(/^RUNTIME_POOL_BYTES = (\d+) \* 1024$/m)?.[1]).toBe(String(OCTATRACK_POOL_BYTES / 1024))
  })

  it('refuses a set over the pool before the first write, naming its largest modules', async () => {
    const error = await prepare(refused).catch(caught => caught)
    expect(error).toBeInstanceOf(ModuleSetError)
    expect(error.message).toMatch(/^This set needs \d+ kB of module memory, and the Octatrack has 787 kB\. Take out \d+ kB or more\. The largest here are MIDI Scenes \(282 kB\), /)
  })

  it('counts the modules already on the unit', async () => {
    await expect(prepare(refused, { ...empty, moduleIds: ['midi-scenes'] })).rejects.toThrow('module memory')
  })

  it('syncs the same set once a large module is out', async () => {
    expect((await prepare(refused.filter(id => id !== 'midi-scenes'))).changes).toHaveLength(refused.length - 1)
  })

  // A tester's unit on 25 Nov 2026 (base 0.8.1): seventeen modules, then two small ones out and Midiverb I/II in, in one
  // sync. The set after it fits (784 kB); the loader holds the two until Midiverb I/II is in, so the sync needs 795 kB.
  const kept = ['previewvol', 'sidechain-compressor', 'vector', 'mute-modes', 'direct-jump-kyoti', 'dejavu', 'temp-save', 'slow-lfo',
    'track-solo', 'midi-scenes', 'kits', USB_AUDIO_MODULE, 'recorder-loop-fix', 'syntiz', 'tapeecho']
  const onUnit = { ...empty, moduleIds: [...kept, 'miniverb', 'lofi2'], usbAudioLayout: 'configurable' as const }
  it('counts the modules a sync takes out while it puts new ones in', async () => {
    const error = await prepare([...kept, 'midiverb'], onUnit).catch(caught => caught)
    expect(error).toBeInstanceOf(ModuleSetError)
    expect(error.message).toMatch(/^The Octatrack keeps the modules a sync takes out until the new ones are in, so this sync needs 795 kB of module memory at once, and the Octatrack has 787 kB\. First sync with Mini Verb and LOFI2 taken out and Midiverb I\/II left out, then add Midiverb I\/II and sync again\.$/)
  })

  it('takes the same modules out alone, then adds the new one', async () => {
    expect((await prepare(kept, onUnit)).changes).toHaveLength(2)
    expect((await prepare([...kept, 'midiverb'], { ...onUnit, moduleIds: kept })).changes).toHaveLength(1)
  })

  it('does not count a module switched off on the unit', async () => {
    const off = { ...onUnit, moduleIds: kept, offIds: ['miniverb', 'lofi2'] }
    expect((await prepare([...kept, 'midiverb'], off)).changes.map(change => change.module)).toContain('Midiverb I/II')
  })
})
