import { describe, expect, it } from 'vitest'
import { checkSelection } from './compatibility'
import { selectionConflicts, selectionConflictError } from './selection-conflicts'

const seven = ['miniverb', 'tapeecho', 'euclid', 'repitch', 'usb-audio-out-tracks-main-cue', 'quantizer']
describe('native selection conflicts', () => {
  it('allows reviewed DSP companions beside Analog BD and keeps real limits actionable', () => {
    for (const id of ['miniverb', 'tapeecho', 'euclid', 'tapehead', 'sidechain-compressor']) {
      expect(selectionConflicts(['analog-bassdrum', id])).toEqual([])
      expect(checkSelection(['analog-bassdrum', id]).checked).toBe(true)
    }
    const result = checkSelection([...seven, 'analog-bassdrum'])
    expect(result.conflicts.map(conflict => conflict.id)).toEqual(['module-menu-space'])
    expect(result.conflicts[0].fixes[0].removeIds).toEqual(['euclid'])
    expect(checkSelection([...seven.filter(id => id !== 'euclid'), 'analog-bassdrum']).checked).toBe(true)
    const incompatible = selectionConflicts(['analog-bassdrum', 'character'])[0]
    expect(incompatible.fixes[1].removeIds).toEqual(['character'])
  })
  it('reports the verified minimal menu collision regardless of additional runtime modules', () => {
    expect(selectionConflicts(seven)[0].id).toBe('module-menu-space')
    expect(selectionConflictError(seven)).toContain('menu space')
    expect(selectionConflicts(seven.filter(id => id !== 'euclid'))).toEqual([])
    expect(selectionConflicts(['miniverb', 'tapeecho', 'euclid', 'repitch', 'quantizer'])[0].fixes[0].removeIds).toEqual(['euclid'])
  })
  it('keeps original-effects conflicts actionable when the chooser option is available', () => {
    expect(selectionConflicts(['miniverb'], true)[0].fixes).toEqual([{ label: 'Turn off stock FX2', keepStockFx2: false }])
    expect(selectionConflicts(['repitch'], true)).toEqual([])
    expect(selectionConflicts(['analog-bassdrum'], true)[0].id).toBe('stock-fx2-space')
  })
  it('allows reviewed shared seams with POLY8 while preserving other limits', () => {
    const companions = ['vector', 'analog-bassdrum', 'synth', 'quantizer', 'repitch', 'mute-modes']
    for (let mask = 0; mask < 1 << companions.length; mask++) {
      const ids = ['poly8', ...companions.filter((_id, bit) => mask & (1 << bit))]
      expect(selectionConflicts(ids)).toEqual([])
    }
    expect(selectionConflicts(['vector', 'analog-bassdrum'])[0].id).toBe('vector-analog-bd')
    expect(selectionConflicts(['synth', 'quantizer'])[0].id).toBe('synth-machine-conflict')
    expect(selectionConflicts(['poly8', 'analog-bassdrum', 'character'])[0].id).toBe('analog-bd-custom-dsp')
    expect(selectionConflicts(['poly8', 'analog-bassdrum'], true)[0].id).toBe('stock-fx2-space')
    expect(selectionConflicts(['poly8', ...seven])[0].id).toBe('module-menu-space')
    expect(selectionConflicts(['poly8', 'previewvol'])).toEqual([])
  })
  it('refuses SY DRUM without FM Synth, as native octabam does', () => {
    expect(selectionConflicts(['sy-drum']).map(conflict => conflict.id)).toEqual(['sy-drum-needs-synth'])
    expect(selectionConflicts(['sy-drum', 'miniverb'])[0].fixes).toEqual([{ label: 'Remove SY DRUM', removeIds: ['sy-drum'] }])
    expect(selectionConflicts(['synth', 'sy-drum'])).toEqual([])
  })
  it('rejects unknown IDs and includes paused custom DSP modules in Analog BD conflicts', () => {
    expect(() => selectionConflicts(['unknown'])).toThrow()
    expect(selectionConflicts(['analog-bassdrum', 'character'])[0].moduleIds).toContain('character')
  })
})
