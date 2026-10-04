import { describe, expect, it } from 'vitest'
import { DEVICES, DEVICES_BY_ID, DEVICE_STEPS } from './registry'
import { DIGI_MODS, estimateCombination } from './digi-mods'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('device registry', () => {
  it('has unique ids and a state for every step', () => {
    expect(new Set(DEVICES.map(device => device.id)).size).toBe(DEVICES.length)
    for (const device of DEVICES) for (const step of DEVICE_STEPS) expect(device.steps[step.id]).toMatch(/^(done|started|open)$/)
  })

  it('keeps first-mod publication separate from known firmware and upstream research', () => {
    for (const device of DEVICES) {
      const hasMods = device.status === 'available' || device.status === 'preview'
      if (hasMods) expect(device.firmware).toBeDefined()
      if (device.firmware) expect(device.steps.format).toBe('done')
      if (!hasMods) expect(device.steps.mods).toBe('open')
    }
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
    expect(estimate.clashes).toEqual([{ claim: 'overlapping firmware changes in OS 1.53', mods: ['NEIGHBOR', 'SOPHIE'] }])
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
    const base = { ...DIGI_MODS[0], claims: [] }
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
})

describe('standalone firmware', () => {
  it('never combines with other mods', async () => {
    const { DIGI_MODS: mods } = await import('./digi-mods')
    const original = mods.slice()
    mods.push({ ...mods[0], id: 'whole-os', title: 'WHOLE OS', exclusive: true, claims: [], libraryCategory: 'standalone' })
    try {
      expect(estimateCombination('digitakt', ['whole-os']).clashes).toEqual([])
      expect(estimateCombination('digitakt', ['whole-os']).usedBytes).toBe(mods[0].ramBytes)
      expect(estimateCombination('digitakt', ['whole-os', 'digisophie']).clashes[0].claim).toContain('standalone firmware')
    } finally { mods.splice(0, mods.length, ...original) }
  })
})
