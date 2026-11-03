import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createStaticColdFireRuntime } from './coldfire-runtime'
import { joiningUnits } from './coldfire-package'
import { LOGGER_RESERVE_BYTES } from './core-logger'
import { MODULES } from '../catalog/modules'
const modules = new URL('../../sdk/octabam/modules/', import.meta.url)
const rules = readdirSync(modules).filter(id => existsSync(new URL(id + '/placement.json', modules)))
  .map(id => ({ id, rule: JSON.parse(readFileSync(new URL(id + '/placement.json', modules), 'utf8')) as { schema: number; moduleId: string; joinRuntime: string[] } }))
describe('units that join the DRAM runtime', () => {
  it('ships one runtime package for every unit a placement rule names, and no other', () => {
    expect(rules.map(row => row.id)).toEqual(['sidechain-compressor'])
    for (const { id, rule } of rules) {
      expect(rule.schema).toBe(1); expect(rule.moduleId).toBe(id)
      expect(joiningUnits(id)).toEqual(rule.joinRuntime)
    }
    for (const module of MODULES) if (!rules.some(row => row.id === module.id)) expect(joiningUnits(module.id)).toEqual([])
  })
  it('stays out of a runtime that only the logger makes, so it takes no sample memory', async () => {
    for (const ids of [['sidechain-compressor'], ['sidechain-compressor', 'mute-modes'], ['sidechain-compressor', 'repitch']]) {
      const runtime = await createStaticColdFireRuntime(ids)
      expect(runtime.units).toEqual(['octamod-core-logger'])
      expect(runtime.reserveBytes).toBe(LOGGER_RESERVE_BYTES)
    }
  })
  it('joins at its module\'s place in native order when another module carries a runtime', async () => {
    const runtime = await createStaticColdFireRuntime(['tapeecho', 'sidechain-compressor'])
    expect(runtime.units).toEqual(['tapeecho', 'sc_cf', 'sc_ui', 'octamod-core-logger'])
    expect(runtime.reserveBytes).toBe(1707 * 6144 + LOGGER_RESERVE_BYTES)
    for (const symbol of ['mon_fmt', 'key_step', 'sc_norm', 'sw9_widget', 'clip_knob']) expect(runtime.symbols.has(symbol)).toBe(true)
    // While stock FX2 stays, Sidechain Compressor replaces COMPRESSOR in place and native links it first.
    const leading = await createStaticColdFireRuntime(['tapeecho', 'sidechain-compressor'], undefined, undefined, undefined, false, undefined, ['sidechain-compressor'])
    expect(leading.units).toEqual(['sc_cf', 'sc_ui', 'tapeecho', 'octamod-core-logger'])
  })
})
