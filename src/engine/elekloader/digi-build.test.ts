import { describe, expect, it, vi } from 'vitest'
import { DIGI_MODS } from '../../devices/digi-mods'
import MACHINES from '../../devices/machines.generated.json'
import { BUILDER_CATALOG, BUILDER_SOURCE, buildLogText, buildStep, builderReleases, planBuild, prepareBuild, type Builder } from './digi-build'
import type { Catalog } from '../../../vendor/elekloader/kit/src/kit/catalog'
import { DIGI_DOWNLOADS_ENABLED, digiDownloadsEnabled } from './protocol'

describe('the vendored elekloader catalog', () => {
  it('pins a core for every supported Digitakt and Digitone release', () => {
    for (const machine of ['digitakt', 'digitone'] as const) {
      const releases = (MACHINES as { id: string; firmware?: { releases: { version: string }[] } }[]).find(item => item.id === machine)!.firmware!.releases.map(item => item.version)
      for (const release of releases) expect(planBuild(machine, release, []).core?.file, machine + ' ' + release).toMatch(/^core-/)
    }
  })
  it('has the pinned release file for every library module on each release it lists', () => {
    for (const mod of DIGI_MODS) expect(builderReleases(mod.device, mod.id).sort(), mod.device + ' ' + mod.id).toEqual([...mod.releases].sort())
    expect(BUILDER_CATALOG.mods.every(item => /^[a-f0-9]{64}$/.test(item.sha256) && /^[\w.-]+\.elemod$/.test(item.file))).toBe(true)
    // Saved backups name it; npm run elekloader:check verifies the catalog is the upstream catalog plus the module records.
    expect(BUILDER_CATALOG.revision).toMatch(/^[0-9a-f]{64}$/)
  })
  it('plans the released Digitakt II mods only for OS 1.17 with their DTII core', () => {
    expect(planBuild('digitakt-ii', '1.17', ['perform-direct', 'perform-levels'])).toMatchObject({
      core: { file: 'core-1.0.elemod', device: 'digitakt-mk2', os: '1.17' },
      mods: [
        { id: 'perform-direct', file: 'perform-direct-1.0.elemod', device: 'digitakt-mk2', os: '1.17' },
        { id: 'perform-levels', file: 'perform-levels-1.0.elemod', device: 'digitakt-mk2', os: '1.17' },
      ],
      missing: [],
    })
    expect(planBuild('digitakt-ii', '1.16', ['perform-direct']).missing).toEqual(['perform-direct'])
  })
  it('reports modules without a file for the chosen release', () => {
    expect(planBuild('digitakt', '1.54', ['digisophie', 'digihealth'])).toMatchObject({ missing: ['digisophie'], mods: [{ id: 'digihealth', os: '1.54' }] })
  })
  it('plans Digitakt II OS 1.17 using its own core and mod pins', () => {
    const catalog: Catalog = {
      ...BUILDER_CATALOG,
      cores: [...BUILDER_CATALOG.cores, {
        file: 'core-1.0.elemod', sha256: 'a'.repeat(64), id: 'core', version: '1.0', device: 'digitakt-mk2', os: '1.17',
        license: 'GPL-2.0-or-later', source: { repo: 'toonst/digitakt2-perform', tag: 'v1.0' },
      }],
      mods: [...BUILDER_CATALOG.mods, {
        file: 'perform-direct-1.0.elemod', sha256: 'b'.repeat(64), id: 'perform-direct', version: '1.0', device: 'digitakt-mk2', os: '1.17',
        license: 'GPL-2.0-or-later', source: { repo: 'toonst/digitakt2-perform', tag: 'v1.0' }, title: 'Direct perform', requires: ['core'], conflicts: [], needs_core: '1.0',
      }],
    }

    expect(planBuild('digitakt-ii', '1.17', ['perform-direct'], catalog)).toMatchObject({
      core: { file: 'core-1.0.elemod', device: 'digitakt-mk2', os: '1.17' },
      mods: [{ id: 'perform-direct', file: 'perform-direct-1.0.elemod', device: 'digitakt-mk2', os: '1.17' }],
      missing: [],
    })
    expect(builderReleases('digitakt-ii', 'perform-direct', catalog)).toEqual(['1.17'])
  })
  it('plans the Analog Rytm MKII core build preview from the newest pinned core, core-ar2 0.7', () => {
    expect(planBuild('analog-rytm-mkii', '1.74', [])).toMatchObject({
      core: { file: 'core-ar2-0.7.elemod', device: 'analog-rytm-mk2', os: '1.74', version: '0.7' },
      mods: [], missing: [],
    })
    expect(planBuild('analog-rytm-mkii', '1.73', []).core).toBeUndefined()
  })
  it('plans Filter Hz from its pinned source-only package with core-ar2 0.7', () => {
    expect(planBuild('analog-rytm-mkii', '1.74', ['filter-hz'])).toMatchObject({
      core: { file: 'core-ar2-0.7.elemod', version: '0.7' },
      mods: [{ id: 'filter-hz', file: 'filter-hz-1.2.0-os1.74.elemod', device: 'analog-rytm-mk2', os: '1.74', version: '1.2.0' }],
      missing: [],
    })
  })
  it('plans Loop Sync, a storage mod, from its pinned source-only package with core-ar2 0.7', () => {
    expect(planBuild('analog-rytm-mkii', '1.74', ['loop-sync'])).toMatchObject({
      core: { file: 'core-ar2-0.7.elemod', version: '0.7' },
      mods: [{ id: 'loop-sync', file: 'loop-sync-0.2.0-experimental-os1.74.elemod', device: 'analog-rytm-mk2', os: '1.74', version: '0.2.0-experimental' }],
      missing: [],
    })
  })
  it('keeps download approval specific to each device', () => {
    expect(DIGI_DOWNLOADS_ENABLED).toEqual({ digitakt: true, 'digitakt-ii': false, digitone: true, 'analog-rytm-mkii': false })
    expect(digiDownloadsEnabled('digitakt-ii')).toBe(false)
    expect(digiDownloadsEnabled('analog-rytm-mkii')).toBe(false)
    expect(digiDownloadsEnabled('unknown-device')).toBe(false)
    expect(digiDownloadsEnabled('constructor')).toBe(false)
  })
})

function fakeClient(overrides: Partial<Record<keyof Builder, (...args: never[]) => unknown>> = {}) {
  const ticks: string[][] = []
  const client = {
    load: vi.fn(async () => ({})),
    setStock: vi.fn(async () => ({ ok: true, file: 'Digitakt_OS1.53.syx', device: 'Digitakt mk1', os: '1.53', dev: { key: 'digitakt-mk1', name: 'Digitakt mk1', releases: ['1.53'], version_len: 4, exact_len: true, recovery: 'FUNC at power-on', default_version: '2.0a' } })),
    addCatalogMod: vi.fn(async (file: string) => ({ ok: true, mod: { path: '/work/mods/' + file, file, id: 'x', version: '1', label: 'x' } })),
    mods: vi.fn(async () => [{ path: '/work/core/core-2.1.elemod', file: 'core-2.1.elemod', id: 'core', version: '2.1', label: 'core', builtin: true, fits: true }]),
    tick: vi.fn(async (enabled: string[], path: string) => { ticks.push(enabled); return [...new Set([...enabled, path, '/work/core/core-2.1.elemod'])].sort() }),
    check: vi.fn(async () => ({ ok: true })),
    version: vi.fn(), build: vi.fn(), dispose: vi.fn(),
    ...overrides,
  }
  return { client: client as unknown as Builder, raw: client as typeof client & { addCatalogMod: ReturnType<typeof vi.fn<(file: string) => Promise<unknown>>> }, ticks }
}

describe('preparing a build', () => {
  const stock = new File([new Uint8Array(4)], 'Digitakt_OS1.53.syx')
  it('adds each catalog file and ticks the catalog\'s core for the release', async () => {
    const { client, raw } = fakeClient()
    const prepared = await prepareBuild(client, { machine: 'digitakt', release: '1.53', stock, moduleIds: ['digihealth', 'digislicer'] })
    expect(prepared.ok).toBe(true)
    expect(raw.addCatalogMod.mock.calls.map(call => call[0])).toEqual(['digihealth-1.0.elemod', 'digislicer-2.1.elemod'])
    expect(prepared.ok && prepared.enabled).toEqual(['/work/core/core-2.1.elemod', '/work/mods/digihealth-1.0.elemod', '/work/mods/digislicer-2.1.elemod'])
  })
  it('builds the core alone when nothing is selected', async () => {
    const { client, raw } = fakeClient()
    const prepared = await prepareBuild(client, { machine: 'digitakt', release: '1.53', stock, moduleIds: [] })
    expect(raw.addCatalogMod).not.toHaveBeenCalled()
    expect(prepared.ok && prepared.enabled).toEqual(['/work/core/core-2.1.elemod'])
  })
  it('passes on the builder’s refusals without building', async () => {
    const refused = fakeClient({ check: vi.fn(async () => ({ ok: false, headline: 'Conflicts: the firmware cannot be built', problems: ['NEIGHBOR and SOPHIE patch the same bytes'] })) })
    expect(await prepareBuild(refused.client, { machine: 'digitakt', release: '1.53', stock, moduleIds: ['digineighbor', 'digisophie'] })).toMatchObject({ ok: false, error: 'Conflicts: the firmware cannot be built' })
    const stockRefused = fakeClient({ setStock: vi.fn(async () => ({ ok: false, error: 'Not a known stock OS file.' })) })
    expect(await prepareBuild(stockRefused.client, { machine: 'digitakt', release: '1.53', stock, moduleIds: [] })).toEqual({ ok: false, error: 'Not a known stock OS file.' })
    const otherOs = fakeClient()
    expect(await prepareBuild(otherOs.client, { machine: 'digitakt', release: '1.54', stock, moduleIds: [] })).toMatchObject({ ok: false, error: 'This OS file is Digitakt mk1 1.53, not the digitakt-mk1 OS 1.54 chosen.' })
    const missing = fakeClient()
    expect(await prepareBuild(missing.client, { machine: 'digitakt', release: '1.54', stock, moduleIds: ['digisophie'] })).toMatchObject({ ok: false })
    expect(missing.raw.load).not.toHaveBeenCalled()
  })
})

// elekloader's log of a Digitakt 1.53 build with DIGISLICER, as its engine writes it (times in seconds)
const LOG: [number, string][] = [
  [0.01, 'stock: Digitakt mk1 OS 1.53 (9bdd44bb6102fb25c143cfab97bc92b7a89c463f795d3112dce89771e29bcc92)'],
  [0.01, 'mod core 2.1                 39 sites  (file sha256 f38b0c193677a060)'],
  [0.02, 'mod digislicer 2.1           26 sites, blob 81234 bytes  (file sha256 351bfb3a7c8bbbc8)'],
  [0.03, 'the mods combine: no overlaps, stock bytes as expected, code sites whole instructions'],
  [0.03, 'linked core 2.1, digislicer 2.1: RAM 0x47be0000-0x47bf4a70 (12345 bytes spare), .fast to 0x8000f700 (2304 spare), blob 81234 bytes'],
  [0.21, 'packed the main OS: 2477028 -> 1085494 bytes (0.2 s)'],
  [0.40, 'verified: sections 2, 4, 5, 8, byte for byte; the main OS depacks to the patched image in place (min gap 697433 bytes); flash ends 0x1b2510 (1891056 bytes spare)'],
]

describe('the build log', () => {
  it('follows the Octatrack page\'s three steps through the engine\'s lines', () => {
    const steps: string[] = []
    let step = buildStep(LOG[0][1])
    for (const [, line] of LOG) { step = buildStep(line, step); steps.push(step) }
    expect(steps).toEqual(['composing', 'composing', 'composing', 'composing', 'packing', 'verifying', 'verifying'])
  })
  it('saves what was built, by which builder, and every line with its time, without the stock file\'s name', () => {
    const result = { ok: true as const, files: [{ name: 'custom-2.0a-digislicer.syx', path: '/work/out/custom-2.0a-digislicer.syx', bytes: 1520000, sha256: '01be49ea'.padEnd(64, '0'), data: new ArrayBuffer(0) }], sha256: '01be49ea'.padEnd(64, '0'), bytes: 1520000, version: '2.0a', mods: ['core 2.1', 'digislicer 2.1'], recovery: '', device: 'Digitakt mk1', os: '1.53', seconds: 0.4, log: LOG }
    const text = buildLogText({ device: 'Digitakt mk1', release: '1.53', version: '2.0a', enabled: ['/work/core/core-2.1.elemod', '/work/mods/digislicer-2.1.elemod'], result })
    const lines = text.split('\n')
    expect(lines[0]).toBe('Modwerk build log: Digitakt mk1, OS 1.53')
    expect(lines[1]).toContain('elekloader kit ' + BUILDER_SOURCE.version + ' (' + BUILDER_SOURCE.commit.slice(0, 12))
    expect(lines[1]).toContain('catalog ' + BUILDER_SOURCE.catalogRevision)
    expect(text).toContain('Mods: core 2.1, digislicer 2.1\n')
    expect(text).toContain('Result: built and verified in 0.40 s\n')
    expect(text).toContain('  custom-2.0a-digislicer.syx  1520000 bytes  sha256 01be49ea')
    expect(text).toContain('\n   0.21 s  packed the main OS: 2477028 -> 1085494 bytes (0.2 s)\n')
    expect(text.trimEnd().split('\n').slice(-LOG.length)).toHaveLength(LOG.length)
    expect(text).not.toContain('Digitakt_OS')
  })
  it('keeps the log of a build that failed, with its error and the files that were ticked', () => {
    const text = buildLogText({ device: 'Digitone mk1', release: '1.43', version: '2.0a', enabled: ['/work/core/core-dn1-2.0a.elemod', '/work/mods/digihealth-1.1.elemod'], result: { ok: false, error: 'the output failed verification: section 3', log: LOG.slice(0, 2) } })
    expect(text).toContain('Mods: core-dn1-2.0a.elemod, digihealth-1.1.elemod\n')
    expect(text).toContain('Result: failed: the output failed verification: section 3\n')
    expect(text.trimEnd().split('\n').at(-1)).toBe('   0.01 s  mod core 2.1                 39 sites  (file sha256 f38b0c193677a060)')
  })
})
