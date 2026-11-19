import { describe, expect, it } from 'vitest'
import { controlProblems } from './module-controls.mjs'

const knob = (slot, name, fallback, count = null) => ({ slot, name, default: fallback, count })
const control = (name, fallback, count = 128) => ({ name, default: fallback, count, doc: 'what it does', labels: null })

describe('an effect’s knobs, declared twice', () => {
  it('agree when controls[] lists the native knobs in slot order; a count left to the donor is not compared', () => {
    expect(controlProblems([knob(0, 'DECAY', 104), knob(1, 'MIX', 64, 128), knob(6, 'MODE', 0, 3)], [control('DECAY', 104), control('MIX', 64), control('MODE', 0, 3)])).toEqual([])
  })
  it('agree when controls[] lists every slot of the effect a module extends', () => {
    const stock = ['ATK', 'REL', 'THRS', 'RAT', 'GAIN', 'MIX', 'RMS'].map(name => control(name, 64))
    expect(controlProblems([knob(7, 'MON', 2, 4), knob(8, 'KEY', 0, 9)], [...stock, control('MON', 2, 4), control('KEY', 0, 9)])).toEqual([])
    expect(controlProblems([knob(7, 'MON', 2, 4)], [...stock, control('KEY', 2, 4)])).toEqual(['slot 7 (MON): name is "MON" in manifest.py, "KEY" in controls[]'])
  })
  it('name each field that differs, by slot', () => {
    expect(controlProblems([knob(0, 'DRV', 0), knob(1, 'SAT', 0, 3)], [control('DRIVE', 0), control('SAT', 1, 4)])).toEqual([
      'slot 0 (DRV): name is "DRV" in manifest.py, "DRIVE" in controls[]',
      'slot 1 (SAT): default is 0 in manifest.py, 1 in controls[]',
      'slot 1 (SAT): count is 3 in manifest.py, 4 in controls[]',
    ])
  })
  it('say so when a knob is missing from either list', () => {
    expect(controlProblems([knob(0, 'DRV', 0), knob(1, 'MIX', 127)], [control('DRV', 0)])).toEqual(['manifest.py declares 2 knobs, controls[] lists 1'])
  })
  it('have nothing to say about a module without native knobs', () => {
    expect(controlProblems([], [control('SCALE', 0, 12)])).toEqual([])
  })
})
