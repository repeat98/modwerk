import { describe, expect, it } from 'vitest'
import { DEVICES, DEVICES_BY_ID, deviceSteps, readyForMods } from './registry'
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
    expect(zoom.map(device => device.id)).toEqual(['zoom-ms-70cdr', 'zoom-ms-50g', 'zoom-ms-60b', 'zoom-g1on'])
    for (const device of zoom) {
      expect(device.steps.core).toBeUndefined()
      expect(device.firmware?.file).toBeUndefined()
      // No zdl module contract yet: the pedals stay locked even where an effect loads.
      expect(readyForMods(device)).toBe(false)
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
    expect(DEVICES_BY_ID['digitakt-ii'].status).toBe('research')
  })

  it('lists digi mods only for digi machines in the registry', () => {
    for (const mod of DIGI_MODS) expect(DEVICES_BY_ID[mod.device]?.status).toBe('preview')
  })
})

describe('digi combination estimate', () => {
  it('fits small sets and rejects sets over the shared area', () => {
    expect(estimateCombination('digitakt', ['digineighbor', 'digisophie', 'digihealth']).fits).toBe(true)
    expect(estimateCombination('digitakt', ['digislicer', 'digineighbor']).fits).toBe(true)
    expect(estimateCombination('digitakt', ['digislicer', 'digineighbor', 'digisophie', 'digihealth']).fits).toBe(false)
  })

  it('keeps machine slots apart between slicer and neighbor', () => {
    const estimate = estimateCombination('digitakt', ['digislicer', 'digineighbor'])
    expect(estimate.clashes).toEqual([])
    expect(estimate.usedBytes).toBe(92190 + 26712 + 4096)
    expect(estimate.compatibleReleases).toEqual(['1.53', '1.54'])
  })

  it('refuses neighbor and sophie even though their memory and machine slots fit', () => {
    const estimate = estimateCombination('digitakt', ['digineighbor', 'digisophie'])
    expect(estimate.fits).toBe(true)
    expect(estimate.compatibleReleases).toEqual([])
    expect(estimate.clashes).toEqual([
      { claim: 'marked as incompatible by their authors', mods: ['NEIGHBOR', 'SOPHIE'] },
      { claim: 'overlapping firmware changes in OS 1.53', mods: ['NEIGHBOR', 'SOPHIE'] },
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
    )
    try {
      expect(estimateCombination('digitakt', ['range-a', 'range-b']).compatibleReleases).toEqual(['1.54'])
      expect(estimateCombination('digitakt', ['range-a', 'range-b'], '1.53').clashes).toHaveLength(1)
      expect(estimateCombination('digitakt', ['range-a', 'range-b'], '1.54').clashes).toEqual([])
      expect(estimateCombination('digitakt', ['digihealth']).usedBytes).toBe(5672 + 4096)
      expect(estimateCombination('digitone', ['digihealth']).usedBytes).toBe(4500 + 4096)
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
      expect(estimateCombination('digitakt', ['whole-os', 'digisophie']).clashes[0].claim).toContain('standalone firmware')
    } finally { mods.splice(0, mods.length, ...original) }
  })
})
