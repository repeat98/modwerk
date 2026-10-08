import { beforeEach, describe, expect, it, vi } from 'vitest'

const gate = vi.hoisted(() => ({ stop: new Error('composition reached the selected profile') }))
vi.mock('./native-contracts.ts', () => ({ verifyNativeContracts: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../catalog/build-support.ts', async importOriginal => ({ ...await importOriginal<typeof import('../catalog/build-support.ts')>(), moduleBuildError: vi.fn(() => null) }))
vi.mock('./module-build.ts', async importOriginal => ({ ...await importOriginal<typeof import('./module-build.ts')>(), compiledModuleSource: vi.fn() }))
vi.mock('./choosers.ts', async importOriginal => ({ ...await importOriginal<typeof import('./choosers.ts')>(), composeChoosers: vi.fn().mockRejectedValue(gate.stop) }))
vi.mock('./static-compose.ts', () => ({ composeStaticOs: vi.fn().mockRejectedValue(gate.stop) }))

import { composeOs } from './compose-os'
import { composeChoosers, defaultChoosers } from './choosers'
import { composeStaticOs } from './static-compose'
import { DSP_LOADER } from './protocol'
import metadata from './assets/chooser-metadata.json'

beforeEach(() => vi.clearAllMocks())
describe('explicit composer loader profiles', () => {
  it('keeps every stock FX2 row when explicitly using the dynamic loader with no supplied profile', async () => {
    const original = new Uint8Array(0), ids = ['miniverb']
    await expect(composeOs(original, ids, undefined, { loader: true })).rejects.toBe(gate.stop)
    const profile = defaultChoosers(ids, true, true)
    expect(profile.fx2).toEqual([...metadata.stockFx2, 'MINIVERB'])
    expect(composeChoosers).toHaveBeenCalledWith(original, ids, profile)
    expect(composeStaticOs).not.toHaveBeenCalled()
  })
  it('keeps the current default static donor profile and leaves the global loader disabled', async () => {
    const original = new Uint8Array(0), ids = ['miniverb']
    await expect(composeOs(original, ids)).rejects.toBe(gate.stop)
    expect(DSP_LOADER).toBe(false)
    const profile = defaultChoosers(ids, true, false)
    expect(profile.fx2).toEqual([...metadata.stockFx2.filter(key => key !== 'SPRING REV'), 'MINIVERB'])
    expect(composeStaticOs).toHaveBeenCalledWith(original, ids, profile, undefined)
    expect(composeChoosers).not.toHaveBeenCalled()
  })
  it.each([true, false])('preserves a supplied chooser profile with loader=%s', async loader => {
    const original = new Uint8Array(0), ids = ['miniverb'], profile = { fx1: metadata.stockFx1, fx2: ['MINIVERB'] }
    await expect(composeOs(original, ids, profile, { loader })).rejects.toBe(gate.stop)
    if (loader) expect(composeChoosers).toHaveBeenCalledWith(original, ids, profile)
    else expect(composeStaticOs).toHaveBeenCalledWith(original, ids, profile, undefined)
  })
})
