import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishedBinding as baseBinding, publishedManifest as manifest } from './published-octatrack.fixture'
import pool from '../../../docs/verification/2026-11-21-octatrack-module-pool-allocation.json' with { type: 'json' }
import { ModuleSetError, OCTATRACK_POOL_BYTES, createRuntimeCatalogue, poolExtent } from './module-set'

const file = (path: string) => new Uint8Array(readFileSync(new URL('../../../public/' + path, import.meta.url)))
const empty: { moduleIds: string[]; removedStockFx: string[] } = { moduleIds: [], removedStockFx: [] }
const capable = { abi: 10, features: 7 | 128 | 512 | 2048 | 4096, maxSites: 128, maxCopies: 128 }
// Over the pool whatever size a published module has: four published packages, each grown to the most a package may
// declare (image and bss together 512 KiB, module-set.ts checkPackage), so each takes over a quarter of the 2 MiB pool.
// A set of real modules over the pool depended on one module's size: the set a tester's unit refused on 24 Nov 2026
// fit once MIDI Scenes 0.3.1 took 127 kB instead of 282 kB.
const large = ['tapeecho', 'syntiz', 'kits', 'grain'], small = ['dejavu', 'slow-lfo', 'bar-led']
const grown = new Map(large.map(id => {
  const entry = manifest.packages.find(item => item.id === id)!, data = Uint8Array.from(file(entry.path)), view = new DataView(data.buffer)
  view.setUint32(12, 512 * 1024 - view.getUint32(8)) // bss, after the image's length
  return [id, { entry: { ...entry, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }, data }]
}))
const catalogue = createRuntimeCatalogue({ ...manifest, packages: manifest.packages.map(entry => grown.get(entry.id)?.entry ?? entry) })
const load = async (entry: { path: string; sha256: string }) =>
  [...grown.values()].find(item => item.entry.sha256 === entry.sha256)?.data ?? file(entry.path)
const prepare = (moduleIds: string[], current = empty, base = baseBinding.identity) =>
  catalogue.prepare({ name: 'Set', moduleIds }, current, load, capable, base)

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

  it('grows each of the four packages past a quarter of the pool', () => {
    for (const { entry, data } of grown.values()) expect(poolExtent(entry, data)).toBeGreaterThan(OCTATRACK_POOL_BYTES / 4)
  })

  it('refuses a set over the pool before the first write, naming its largest modules', async () => {
    const error = await prepare([...large, ...small]).catch(caught => caught)
    expect(error).toBeInstanceOf(ModuleSetError)
    expect(error.message).toMatch(/^This set needs \d+ kB of module memory, and the Octatrack has 2098 kB\. Take out \d+ kB or more\. The largest here are /)
    expect(large.filter(id => error.message.includes(grown.get(id)!.entry.name))).toHaveLength(3) // the three largest
  })

  it('counts the modules already on the unit', async () => {
    await expect(prepare([...large, ...small], { ...empty, moduleIds: ['tapeecho'] })).rejects.toThrow('module memory')
  })

  it('syncs the same set once a large module is out', async () => {
    expect((await prepare([...large.slice(1), ...small])).changes).toHaveLength(large.length - 1 + small.length)
  })

  it('prices a unit on an earlier base at its 768 KiB pool', async () => {
    await expect(prepare([...large.slice(1), ...small], empty, '0'.repeat(64))).rejects.toThrow(/the Octatrack has 787 kB\./)
  })

  // A tester's unit on 25 Nov 2026 (base 0.8.1): seventeen modules, then two small ones out and Midiverb I/II in, in one
  // sync. The set after it fit; the loader holds the modules it takes out until the new ones are in, so the sync did not.
  // Here with grown packages, so no published module's size decides it: three on the unit fit (each under a third of the
  // pool), and so do the three after the sync, but all four at once do not.
  const [first, goes, second, comes] = large, stays = [first, second], name = (id: string) => grown.get(id)!.entry.name
  const onUnit = { ...empty, moduleIds: [first, goes, second] }
  it('counts the modules a sync takes out while it puts new ones in', async () => {
    const error = await prepare([...stays, comes], onUnit).catch(caught => caught)
    expect(error).toBeInstanceOf(ModuleSetError)
    expect(error.message).toMatch(/^The Octatrack keeps the modules a sync takes out until the new ones are in, so this sync needs \d+ kB of module memory at once, and the Octatrack has 2098 kB\./)
    expect(error.message).toContain('First sync with ' + name(goes) + ' taken out and ' + name(comes) + ' left out, then add ' + name(comes) + ' and sync again.')
  })

  it('takes the same modules out alone, then adds the new one', async () => {
    expect((await prepare(stays, onUnit)).changes).toHaveLength(1)
    expect((await prepare([...stays, comes], { ...onUnit, moduleIds: stays })).changes).toHaveLength(1)
  })

  it('does not count a module switched off on the unit', async () => {
    const off = { ...onUnit, moduleIds: stays, offIds: [goes] }
    expect((await prepare([...stays, comes], off)).changes.map(change => change.module)).toContain(name(comes))
  })
})
