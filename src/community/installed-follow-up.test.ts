import { expect, it } from 'vitest'
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }
import { MODULES } from '../catalog/modules'
import { installedOnOctatrack } from './installed-follow-up'

it('names what the base installed: the base package’s version where it lags the catalogue', () => {
  const lagging = packages.packages.find(entry => 'lagsBehind' in entry && entry.lagsBehind)
  const current = packages.packages.find(entry => !('lagsBehind' in entry && entry.lagsBehind) && MODULES.some(module => module.id === entry.id))!
  const build = installedOnOctatrack([current.id, ...(lagging ? [lagging.id] : []), 'not-a-module'])
  expect(build).toMatchObject({ machine: 'Octatrack', os: '1.40C' })
  expect(build.modules.map(module => module.version)).toEqual([current.version, ...(lagging ? [lagging.version] : [])])
  if (lagging) expect(lagging.version).not.toBe(MODULES.find(module => module.id === lagging.id)?.version)
})
