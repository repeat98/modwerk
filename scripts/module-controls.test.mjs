import { describe, expect, it } from 'vitest'
import { controlProblems, widgetProblems } from './module-controls.mjs'

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

describe('each knob drawn as what it holds', () => {
  const param = (slot, name, formatter, count, labels = null, mode = false) => ({ slot, name, default: 0, count, formatter, labels, mode })
  it('passes switches, labelled dials, knobs and bipolar knobs used as they are meant', () => {
    expect(widgetProblems([param(0, 'TIME', 'plain', 128), param(1, 'TONE', 'bipolar', 128), param(6, 'SYNC', 'stepped', 2, ['FREE', 'BEAT'], true),
      param(7, 'VOIC', 'stepped', 4, ['1', '2', '3', '4']), param(8, 'TYPE', 'wide-stepped', 7, ['PURE', 'STRNG', 'TUBE', 'BAR', 'PLATE', 'DRUM', 'BELL']),
      param(9, 'MIX', 'inherit', 3), param(10, 'X', 'plain', null)])).toEqual([])
  })
  it('names a switch with too many positions or no words, a knob for a short list and labels a knob never draws', () => {
    expect(widgetProblems([param(0, 'RATE', 'stepped', 8, ['1', '2', '3', '4', '5', '6', '7', '8']), param(1, 'MODE', 'stepped', 3),
      param(2, 'TAPS', 'plain', 4), param(3, 'SHAPE', 'plain', 128, Array.from({ length: 128 }, (_, i) => String(i)))])).toEqual([
      'slot 0 (RATE): a switch for 8 values; a switch has at most five positions, so use WIDE_STEPPED with labels',
      'slot 1 (MODE): a switch without labels shows numbers; give each position a word',
      'slot 2 (TAPS): a knob for 4 values; 4 choices are a switch (STEPPED with labels)',
      'slot 3 (SHAPE): a plain knob never draws its labels; use WIDE_STEPPED for a labelled list, or drop the labels'])
  })
  it('refuses a mode select whose words do not name it, since it shows them in place of its name', () => {
    expect(widgetProblems([param(6, 'COLUN', 'stepped', 2, ['OFF', 'ON'], true)])).toEqual([
      'slot 6 (COLUN): the mode select names itself with its value, so OFF / ON leaves it without a name; use words that say what each mode is (FREE / BEAT, NOTE / COLUN)'])
    expect(widgetProblems([param(6, 'COLUN', 'stepped', 2, ['NOTE', 'COLUN'], true), param(7, 'HOLD', 'stepped', 2, ['OFF', 'ON'])])).toEqual([])
  })
})
