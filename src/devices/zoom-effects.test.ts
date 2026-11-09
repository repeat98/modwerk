import { describe, expect, it } from 'vitest'
import { validateConfiguration } from '../config/workspace'
import { isZoomSetDevice, zoomSyncPlan, type ZoomEffect } from './zoom-effects'

const listedEffect = (id: string, file: string, fxid: number, version = '0.03', bytes = 1200) => ({
  id, name: id[0].toUpperCase() + id.slice(1), version: '0.1.0', machine: 'zoom-ms-70cdr',
  platform: { kind: 'zdl', file, effectId: { gid: 8, fxid }, effectVersion: version, dspCost: 8, binary: { sha256: 'a'.repeat(64), bytes, release: { repository: 'https://github.com/x/y', tag: 't', asset: file } }, screen: 'static', pedals: [] },
}) as unknown as ZoomEffect
const onPedal = (name: string, fxid: number, version = '0.03', size = 1200, gid = 8) => ({ name, size, effect: { gid, fxid, version } })

describe('syncing a Zoom set', () => {
  const loop = listedEffect('loop', 'Loop.ZDL', 467), scope = listedEffect('scope', 'Scope.ZDL', 468), dirt = listedEffect('dirt', 'Dirt.ZDL', 469)
  it('installs what the set lacks or has in another version, removes listed effects it dropped, and leaves the rest', () => {
    const plan = zoomSyncPlan([loop, scope, dirt], ['loop', 'scope'], [onPedal('LOOP.ZDL', 467), onPedal('SCOPE.ZDL', 468, '0.02'), onPedal('DIRT.ZDL', 469), onPedal('ZOOMDLY.ZDL', 12, '1.00', 9000, 2)])
    expect(plan.keep.map(effect => effect.id)).toEqual(['loop'])
    expect(plan.install.map(effect => effect.id)).toEqual(['scope'])
    expect(plan.remove.map(effect => effect.id)).toEqual(['dirt'])
    expect(plan.adds).toBe(-1200)   // Scope replaces a file of the same size; removing Dirt frees its 1,200 bytes
    expect(zoomSyncPlan([listedEffect('loop', 'Loop.ZDL', 467, '0.03', 5000), dirt], ['loop'], [onPedal('DIRT.ZDL', 469)]).adds).toBe(5000 - 1200)
  })
  it('counts a listed effect moved to a local ID as on the pedal, and never a different file under the same name', () => {
    expect(zoomSyncPlan([loop], ['loop'], [onPedal('LOOP.ZDL', 1000)], { 1000: 'LOOP.ZDL' }).keep).toEqual([loop])
    // A file of that name at an ID neither listed nor given to it here was installed by hand: the sync leaves it alone.
    expect(zoomSyncPlan([loop], ['loop'], [onPedal('LOOP.ZDL', 1000)], {})).toMatchObject({ keep: [], install: [loop] })
    expect(zoomSyncPlan([dirt], [], [onPedal('DIRT.ZDL', 999)], { 999: 'OTHER.ZDL' }).remove).toEqual([])
    expect(zoomSyncPlan([dirt], [], [onPedal('DIRT.ZDL', 3, '1.00', 1200, 4)]).remove).toEqual([])
    expect(zoomSyncPlan([loop], ['loop'], []).install).toEqual([loop])
  })
  it('keeps a set for a pedal with the zdl platform, and refuses effects it doesn’t list', () => {
    expect(isZoomSetDevice('zoom-ms-70cdr')).toBe(true)
    expect(isZoomSetDevice('zoom-ms-50g')).toBe(false)
    const saved = { id: 's', name: 'Pedal set', device: 'zoom-ms-70cdr', moduleIds: [], moduleVersions: {}, keepStockFx2: false, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }
    expect(validateConfiguration(saved).device).toBe('zoom-ms-70cdr')
    expect(() => validateConfiguration({ ...saved, moduleIds: ['no-such-effect'] })).toThrow('Unknown module: no-such-effect')
  })
})
