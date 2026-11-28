import { describe, expect, it } from 'vitest'
import { DEVICES, DEVICES_BY_ID, deviceSteps, isZd2Pedal, readyForMods } from './registry'
import { parseZoomHubRoute } from './zoom-hub-route'
import { FAMILY_STEP_IDS } from './machine-contract'
import { DIGI_MODS, estimateCombination } from './digi-mods'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('device registry', () => {
  it('has unique ids and a state for every step', () => {
    expect(new Set(DEVICES.map(device => device.id)).size).toBe(DEVICES.length)
    for (const device of DEVICES) for (const step of deviceSteps(device)) expect(device.steps[step.id]).toMatch(/^(done|started|open)$/)
  })

  it('gives each family its own road, matching the contract', () => {
    for (const device of DEVICES) expect(deviceSteps(device).map(step => step.id)).toEqual(FAMILY_STEP_IDS[device.family])
    const zoom = DEVICES.filter(device => device.family === 'zoom')
    expect(zoom.map(device => device.id)).toEqual(['zoom-ms-70cdr', 'zoom-ms-50g', 'zoom-ms-60b', 'zoom-g1on', 'zoom-g1-four', 'zoom-ms-200d-plus', 'zoom-g5n'])
    // The ZD2 pedals are Zoom pedals of their own kind: no ZDL pedal page.
    expect(zoom.filter(isZd2Pedal).map(device => device.id)).toEqual(['zoom-g1-four', 'zoom-ms-200d-plus', 'zoom-g5n'])
    expect(parseZoomHubRoute('zoom-g1-four/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-ms-200d-plus/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-g5n/pedal')).toBeUndefined()
    expect(parseZoomHubRoute('zoom-g1on/pedal')?.device.id).toBe('zoom-g1on')
    for (const device of zoom) {
      expect(device.steps.core).toBeUndefined()
      expect(device.firmware?.file).toBeUndefined()
      // The zdl module contract opens the MS-70CDR for its first module; the others wait for their SDK even where an effect loads.
      expect(readyForMods(device)).toBe(device.id === 'zoom-ms-70cdr')
    }
    // An Erica Synths machine needs its Modwerk base and a module contract (an SDK) before it takes mods.
    expect(readyForMods(DEVICES_BY_ID['lxr-02'])).toBe(false)
    expect(readyForMods({ ...DEVICES_BY_ID['lxr-02'], steps: { ...DEVICES_BY_ID['lxr-02'].steps, core: 'done' } })).toBe(false)
    expect(readyForMods({ ...DEVICES_BY_ID['lxr-02'], steps: { core: 'done' }, sdk: 'sdk/machines/lxr-02/README.md' })).toBe(true)
    expect(readyForMods(DEVICES_BY_ID.octatrack)).toBe(true)
  })

  it('shows firmware identities independently from module availability', () => {
    for (const device of DEVICES) {
      const hasMods = device.status === 'available' || device.status === 'preview'
      if (hasMods) expect(device.firmware).toBeTruthy()
      if (!hasMods) expect(device.steps.mods).toBe('open')
    }
    expect(DEVICES_BY_ID['digitakt-ii'].firmware?.releases).toEqual(['1.17'])
    expect(DEVICES_BY_ID['digitakt-ii'].status).toBe('preview')
  })

  it('lists digi mods only for digi machines in the registry', () => {
    for (const mod of DIGI_MODS) expect(DEVICES_BY_ID[mod.device]?.status).toBe('preview')
  })
})

describe('digi combination estimate', () => {
  it('names the chosen modules with no CPU cost measured on a unit, and only those', () => {
    expect(estimateCombination('analog-rytm-mkii', ['chorus', 'flanger', 'ctrl-all', 'analog-bd']).unmeasured).toEqual(['Chorus', 'Flanger'])
    expect(estimateCombination('analog-rytm-mkii', ['ctrl-all', 'analog-bd']).unmeasured).toEqual([])
  })
  it('fits small sets and rejects sets over the shared area', () => {
    expect(estimateCombination('digitakt', ['digistring', 'digiperform', 'euclidean']).fits).toBe(true)
    expect(estimateCombination('digitakt', ['digistring', 'ram-machines']).fits).toBe(true)
    // Since the imported packages left (28 November 2026) every Digitakt module together fits the shared area,
    // so a synthetic module fills it to the byte and one more module passes it.
    expect(estimateCombination('digitakt', DIGI_MODS.filter(mod => mod.device === 'digitakt').map(mod => mod.id)).fits).toBe(true)
    const original = DIGI_MODS.slice()
    const { areaBytes, usedBytes: coreBytes } = estimateCombination('digitakt', [])
    DIGI_MODS.push({ ...DIGI_MODS.find(mod => mod.device === 'digitakt' && mod.id === 'digistring')!, id: 'fills-area', title: 'Fills the area', claims: [], ramBytes: areaBytes - coreBytes })
    try {
      expect(estimateCombination('digitakt', ['fills-area']).fits).toBe(true)
      expect(estimateCombination('digitakt', ['fills-area', 'midi-retrig']).fits).toBe(false)
    } finally { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) }
  })

  it('keeps machine slots apart between Live Looper and STRING', () => {
    const estimate = estimateCombination('digitakt', ['live-looper', 'digistring'])
    expect(estimate.clashes).toEqual([])
    expect(estimate.usedBytes).toBe(15556 + 24293 + 4096)
    expect(estimate.compatibleReleases).toEqual(['1.54'])
  })

  it('refuses STRING and Live Looper on a declared conflict even though their memory and machine slots fit', () => {
    // No two remaining Digitakt modules conflict on a flag alone, so STRING declares one here.
    const original = DIGI_MODS.slice(), index = DIGI_MODS.findIndex(mod => mod.device === 'digitakt' && mod.id === 'digistring')
    DIGI_MODS[index] = { ...DIGI_MODS[index], conflicts: ['live-looper'] }
    try {
      const estimate = estimateCombination('digitakt', ['digistring', 'live-looper'])
      expect(estimate.fits).toBe(true)
      expect(estimate.compatibleReleases).toEqual([])
      // Their own firmware changes do not overlap; the conflict STRING declares refuses them.
      expect(estimate.clashes).toEqual([
        { claim: 'marked as incompatible by their authors', mods: ['STRING', 'Live Looper'] },
      ])
    } finally { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) }
  })

  it('refuses a pair whose dependencies conflict: one builds on a part that conflicts with machine pages, STRING on machine pages (#1306)', () => {
    // No remaining Digitakt module builds on a part that conflicts with another's, so two synthetic ones stand in;
    // they follow STRING in the library, so the estimate names STRING first.
    const original = DIGI_MODS.slice()
    const base = { ...DIGI_MODS.find(mod => mod.device === 'digitakt')!, claims: [], requires: [], conflicts: [], releases: ['1.53', '1.54'], patchSites: {} }
    DIGI_MODS.push({ ...base, id: 'part-a', title: 'Part A', conflicts: ['machine-pages'] }, { ...base, id: 'user-a', title: 'User A', requires: ['part-a'] })
    try {
      const estimate = estimateCombination('digitakt', ['user-a', 'digistring'])
      expect(estimate.fits).toBe(true)
      expect(estimate.compatibleReleases).toEqual([])
      expect(estimate.clashes).toEqual([
        { claim: 'STRING builds on machine pages and User A builds on Part A, and machine pages and Part A are marked as incompatible by their authors', mods: ['STRING', 'User A'] },
      ])
      expect(estimateCombination('digitakt', ['part-a', 'digistring']).clashes).toEqual([
        { claim: 'STRING builds on machine pages, and machine pages and Part A are marked as incompatible by their authors', mods: ['STRING', 'Part A'] },
      ])
    } finally { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) }
  })

  it('combines mods whose dependencies do not conflict', () => {
    // Both build on machine pages, and both on dt-support.
    expect(estimateCombination('digitakt', ['digistring', 'ram-machines'])).toMatchObject({ clashes: [], compatibleReleases: ['1.53', '1.54'] })
    expect(estimateCombination('digitakt', ['cc-names', 'euclidean'])).toMatchObject({ clashes: [], compatibleReleases: ['1.53', '1.54'] })
  })

  it('refuses two mods whose own firmware changes overlap', () => {
    const estimate = estimateCombination('digitakt', ['live-looper', 'ram-machines'])
    expect(estimate.compatibleReleases).toEqual([])
    expect(estimate.clashes).toEqual([
      { claim: 'sample:private:131', mods: ['Live Looper', 'RAM Record and Playback'] },
      { claim: 'marked as incompatible by their authors', mods: ['Live Looper', 'RAM Record and Playback'] },
      { claim: 'overlapping firmware changes in OS 1.54', mods: ['Live Looper', 'RAM Record and Playback'] },
    ])
  })

  it('generates every patch range from the validated build specs, including local derivation sites', () => {
    for (const mod of DIGI_MODS) {
      const build = JSON.parse(readFileSync(resolve('sdk', mod.device, 'modules', mod.id, 'build.json'), 'utf8'))
      for (const release of mod.releases) expect(mod.patchSites[release]).toEqual([
        ...build.releases[release].sites, ...((build.derive?.releases ?? [build.derive?.release]).includes(release) ? build.derive.callSites : []),
      ].map(({ addr, len }: { addr: string; len: number }) => ({ addr, len })))
    }
  })

  it('checks partial overlaps per release, allows touching ranges and keeps machine ids apart', () => {
    const original = DIGI_MODS.slice()
    const base = { ...DIGI_MODS.find(mod => mod.device === 'digitakt')!, claims: [], conflicts: [] }
    DIGI_MODS.push(
      { ...base, id: 'range-a', title: 'A', releases: ['1.53', '1.54'], patchSites: { '1.53': [{ addr: '0x40001000', len: 8 }], '1.54': [{ addr: '0x40001000', len: 8 }] } },
      { ...base, id: 'range-b', title: 'B', releases: ['1.53', '1.54'], patchSites: { '1.53': [{ addr: '0x40001006', len: 8 }], '1.54': [{ addr: '0x40001008', len: 8 }] } },
      { ...base, device: 'digitone', id: 'range-a', title: 'A', ramBytes: 4500, releases: ['1.44'], patchSites: {} },
    )
    try {
      expect(estimateCombination('digitakt', ['range-a', 'range-b']).compatibleReleases).toEqual(['1.54'])
      expect(estimateCombination('digitakt', ['range-a', 'range-b'], '1.53').clashes).toHaveLength(1)
      expect(estimateCombination('digitakt', ['range-a', 'range-b'], '1.54').clashes).toEqual([])
      expect(estimateCombination('digitakt', ['range-a']).usedBytes).toBe(base.ramBytes + 4096)
      expect(estimateCombination('digitone', ['range-a']).usedBytes).toBe(4500 + 4096)
      expect(estimateCombination('digitakt', ['range-a'], '1.44').clashes[0].claim).toBe('no shared supported OS release')
    } finally { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) }
  })

  it('refuses a pair one author flagged, even when their firmware changes do not overlap', () => {
    const original = DIGI_MODS.slice()
    const base = { ...DIGI_MODS.find(mod => mod.device === 'digitakt')!, claims: [], conflicts: [], releases: ['1.53', '1.54'], patchSites: {} }
    DIGI_MODS.push({ ...base, id: 'flag-a', title: 'A', conflicts: ['flag-b'] }, { ...base, id: 'flag-b', title: 'B' }, { ...base, id: 'flag-c', title: 'C' })
    try {
      expect(estimateCombination('digitakt', ['flag-b', 'flag-a']).clashes).toEqual([{ claim: 'marked as incompatible by their authors', mods: ['A', 'B'] }])
      expect(estimateCombination('digitakt', ['flag-b', 'flag-a']).compatibleReleases).toEqual([])
      expect(estimateCombination('digitakt', ['flag-a', 'flag-c']).clashes).toEqual([])
    } finally { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) }
  })
})

describe('standalone firmware', () => {
  it('never combines with other mods', async () => {
    const { DIGI_MODS: mods } = await import('./digi-mods')
    const original = mods.slice()
    const digitakt = mods.find(mod => mod.device === 'digitakt')!
    mods.push({ ...digitakt, id: 'whole-os', title: 'WHOLE OS', exclusive: true, claims: [], libraryCategory: 'standalone' })
    try {
      expect(estimateCombination('digitakt', ['whole-os']).clashes).toEqual([])
      expect(estimateCombination('digitakt', ['whole-os']).usedBytes).toBe(digitakt.ramBytes)
      expect(estimateCombination('digitakt', ['whole-os', 'digistring']).clashes[0].claim).toContain('standalone firmware')
    } finally { mods.splice(0, mods.length, ...original) }
  })
})
