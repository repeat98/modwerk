import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishedBinding as baseBinding, publishedManifest as manifest } from './published-octatrack.fixture'
import pool from '../../../docs/verification/2026-11-21-octatrack-module-pool-allocation.json' with { type: 'json' }
import { ModuleSetError, OCTATRACK_POOL_BYTES, createRuntimeCatalogue, poolExtent } from './module-set'

const file = (path: string) => new Uint8Array(readFileSync(new URL('../../../public/' + path, import.meta.url)))
const empty: { moduleIds: string[]; removedStockFx: string[] } = { moduleIds: [], removedStockFx: [] }
const capable = { abi: 10, features: 7 | 128 | 512 | 2048 | 4096, maxSites: 128, maxCopies: 128 }
// Over the pool whatever size a published module has: three published packages, each grown to the most a package may
// declare (image and bss together 288 KiB, module-set.ts checkPackage), so each takes over a third of the 768 KiB pool.
// A set of real modules over the pool depended on one module's size: the set a tester's unit refused on 24 Nov 2026
// fit once MIDI Scenes 0.3.1 took 127 kB instead of 282 kB.
const large = ['tapeecho', 'syntiz', 'kits'], small = ['dejavu', 'slow-lfo', 'bar-led']
const grown = new Map(large.map(id => {
  const entry = manifest.packages.find(item => item.id === id)!, data = Uint8Array.from(file(entry.path)), view = new DataView(data.buffer)
  view.setUint32(12, 288 * 1024 - view.getUint32(8)) // bss, after the image's length
  return [id, { entry: { ...entry, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }, data }]
}))
const catalogue = createRuntimeCatalogue({ ...manifest, packages: manifest.packages.map(entry => grown.get(entry.id)?.entry ?? entry) })
const load = async (entry: { path: string; sha256: string }) =>
  [...grown.values()].find(item => item.entry.sha256 === entry.sha256)?.data ?? file(entry.path)
const prepare = (moduleIds: string[], current = empty) =>
  catalogue.prepare({ name: 'Set', moduleIds }, current, load, capable, baseBinding.identity)

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

  it('grows each of the three packages past a third of the pool', () => {
    for (const { entry, data } of grown.values()) expect(poolExtent(entry, data)).toBeGreaterThan(OCTATRACK_POOL_BYTES / 3)
  })

  it('refuses a set over the pool before the first write, naming its largest modules', async () => {
    const error = await prepare([...large, ...small]).catch(caught => caught)
    expect(error).toBeInstanceOf(ModuleSetError)
    expect(error.message).toMatch(/^This set needs \d+ kB of module memory, and the Octatrack has 787 kB\. Take out \d+ kB or more\. The largest here are /)
    for (const id of large) expect(error.message).toContain(grown.get(id)!.entry.name)
  })

  it('counts the modules already on the unit', async () => {
    await expect(prepare([...large, ...small], { ...empty, moduleIds: ['tapeecho'] })).rejects.toThrow('module memory')
  })

  it('syncs the same set once a large module is out', async () => {
    expect((await prepare([...large.slice(1), ...small])).changes).toHaveLength(large.length - 1 + small.length)
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
