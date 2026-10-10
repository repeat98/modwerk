import { describe, expect, it } from 'vitest'
import { MODULES } from './modules'
import { addBlock, addBlocks, moduleNameList } from './add-blocks'
import { selectionConflicts } from './selection-conflicts'

const IDS = MODULES.map(module => module.id)
const SELECTIONS = [[], ['analog-bassdrum'], ['synth'], ['midi-scenes'], ['miniverb', 'tapeecho', 'repitch', 'quantizer'], ['miniverb', 'euclid'], ['vector'], ['poly8', 'analog-bassdrum']]

describe('adding a module that conflicts with the configuration', () => {
  it('names the selected module a candidate cannot run beside, and what swapping removes', () => {
    const block = addBlock(['analog-bassdrum'], 'spectrum')
    expect(block).toMatchObject({ kind: 'conflict', withIds: ['analog-bassdrum'], reason: 'Conflicts with Analog BD', swapRemoveIds: ['analog-bassdrum'] })
    expect(block?.detail).toContain('cannot run alongside Spectrum')
    expect(addBlock(['synth'], 'quantizer')).toMatchObject({ kind: 'conflict', withIds: ['synth'], swapRemoveIds: ['synth'] })
    expect(addBlock(['synth'], 'vector')?.reason).toBe('Conflicts with FM Synth')
  })
  it('keeps the candidate in the swap even when it is the module a fix would normally remove', () => {
    expect(addBlock(['spectrum', 'modulation'], 'analog-bassdrum')?.swapRemoveIds).toEqual(['spectrum', 'modulation'])
    expect(addBlock(['vector'], 'analog-bassdrum')?.swapRemoveIds).toEqual(['vector'])
  })
  it('does not flag reviewed companions or modules that are already selected', () => {
    for (const id of ['miniverb', 'tapeecho', 'euclid', 'tapehead', 'sidechain-compressor']) expect(addBlock(['analog-bassdrum'], id)).toBeUndefined()
    expect(addBlock(['analog-bassdrum'], 'analog-bassdrum')).toBeUndefined()
    expect(addBlock(['poly8', 'analog-bassdrum'], 'vector')).toBeUndefined()
  })
  it('flags every other module beside standalone MIDI Scenes and MIDI Scenes beside anything', () => {
    const blocks = addBlocks(['midi-scenes'], false)
    expect(Object.keys(blocks).sort()).toEqual(IDS.filter(id => id !== 'midi-scenes').sort())
    expect(Object.values(blocks).every(block => block.kind === 'conflict' && block.swapRemoveIds?.join() === 'midi-scenes')).toBe(true)
    expect(addBlock(['miniverb', 'euclid'], 'midi-scenes')).toMatchObject({ reason: 'Conflicts with Mini Verb and Euclid', swapRemoveIds: ['miniverb', 'euclid'] })
  })
  it('flags a conflict that already involves other selected modules', () => {
    // Analog BD and FM Synth are already in conflict; Vector joins the same conflict.
    expect(addBlock(['analog-bassdrum', 'synth'], 'vector')?.kind).toBe('conflict')
  })
  it('says so when no removal keeps the candidate instead of guessing one', () => {
    const block = addBlock(['miniverb', 'tapeecho', 'repitch', 'quantizer'], 'euclid')
    expect(block).toMatchObject({ kind: 'conflict', reason: 'Conflicts with Mini Verb, Tape Echo and 2 more' })
    expect(block?.swapRemoveIds).toBeUndefined()
    expect(addBlock(['miniverb', 'tapeecho', 'repitch', 'quantizer'], 'miniverb')).toBeUndefined()
  })
  it('treats stock FX2 as a setting that never blocks the add', () => {
    const block = addBlock([], 'miniverb', true)
    expect(block).toMatchObject({ kind: 'stock-fx2', withIds: [], reason: 'Needs stock FX2 off' })
    expect(block?.swapRemoveIds).toBeUndefined()
    expect(addBlock([], 'miniverb', false)).toBeUndefined()
    expect(addBlock([], 'previewvol', true)).toBeUndefined()
  })
  it.each(SELECTIONS)('only offers swaps that leave no conflict for the new module (%j)', (...selected) => {
    for (const keep of [false, true]) for (const [id, block] of Object.entries(addBlocks(selected, keep))) {
      expect(block.withIds.every(other => selected.includes(other))).toBe(true)
      if (!block.swapRemoveIds) continue
      expect(block.swapRemoveIds.every(other => selected.includes(other))).toBe(true)
      const next = [...selected.filter(other => !block.swapRemoveIds?.includes(other)), id]
      expect(selectionConflicts(next, keep).filter(conflict => conflict.moduleIds.includes(id) && conflict.id !== 'stock-fx2-space')).toEqual([])
    }
  })
  it('changes the key when the conflicting selection changes', () => {
    expect(addBlock(['analog-bassdrum'], 'spectrum')?.key).not.toBe(addBlock(['synth'], 'vector')?.key)
    expect(addBlock(['miniverb', 'euclid'], 'midi-scenes')?.key).not.toBe(addBlock(['miniverb'], 'midi-scenes')?.key)
  })
  it('lists names for a chip', () => {
    expect(moduleNameList(['miniverb'])).toBe('Mini Verb')
    expect(moduleNameList(['miniverb', 'euclid'])).toBe('Mini Verb and Euclid')
    expect(moduleNameList(['miniverb', 'euclid', 'tapeecho'])).toBe('Mini Verb, Euclid and 1 more')
  })
})
