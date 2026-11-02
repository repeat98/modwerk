import { describe, expect, it } from 'vitest'
import { composeDescriptors, placementOrder } from './descriptors'
import recipes from './assets/descriptor-recipes.json'
describe('local descriptor composition', () => {
  it('requires the original OS and rejects unknown modules', async () => {
    await expect(composeDescriptors(new Uint8Array(16), [])).rejects.toThrow('original OS fingerprint')
    await expect(composeDescriptors(new Uint8Array(16), ['invented'])).rejects.toThrow('Unknown module')
  })
  it('contains terminated authored labels and bounded numeric fields only', () => {
    for (const recipe of recipes.recipes) {
      expect(recipe).not.toHaveProperty('donorBytes')
      for (const field of recipe.strings) {
        expect(field.value.length).toBeLessThan(field.width)
        expect(field.offset + field.width).toBeLessThanOrEqual(recipes.descriptorBytes)
      }
      for (const field of recipe.integers) {
        expect(field.offset + field.width).toBeLessThanOrEqual(recipes.descriptorBytes)
        expect(field.value).toBeGreaterThanOrEqual(0)
        expect(field.value).toBeLessThan(2 ** (field.width * 8))
      }
    }
  })
  it('places leading modules first and otherwise keeps catalog order', () => {
    const catalog = [{ id: 'miniverb' }, { id: 'tapeecho' }, { id: 'sidechain-compressor' }]
    expect(placementOrder(catalog).map(module => module.id)).toEqual(['miniverb', 'tapeecho', 'sidechain-compressor'])
    expect(placementOrder(catalog, ['sidechain-compressor']).map(module => module.id)).toEqual(['sidechain-compressor', 'miniverb', 'tapeecho'])
    expect(placementOrder(catalog, ['absent'])).toEqual(catalog)
  })
  it('inherits the donor enable nibbles of a stock-DSP replacement and points its raw words into its own ROM unit', () => {
    const recipe = recipes.recipes.find(recipe => recipe.id === 'sidechain-compressor')!
    // Slots 0-6 are stock COMPRESSOR's, unchanged; MON, KEY, KGN, KBAS and KWID (slots 7-11) are the module's own.
    expect(recipe.inheritedEnable).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(recipe.replaces).toBe('COMPRESSOR')
    expect(recipe.rawPointers).toEqual([{ offset: 230, unit: 'sc_cf', symbol: 'mon_fmt' }, { offset: 278, unit: 'sc_cf', symbol: 'mon_widget' }, { offset: 326, unit: 'sc_cf', symbol: 'mon_step' }, { offset: 234, unit: 'sc_cf', symbol: 'key_fmt' }, { offset: 282, unit: 'sc_ui', symbol: 'sw9_widget' }, { offset: 330, unit: 'sc_cf', symbol: 'key_step' }, { offset: 242, unit: 'sc_cf', symbol: 'hp_fmt' }, { offset: 246, unit: 'sc_cf', symbol: 'lp_fmt' }, { offset: 294, unit: 'sc_ui', symbol: 'clip_knob' }])
    for (const other of recipes.recipes.filter(recipe => recipe.id !== 'sidechain-compressor')) expect(other).not.toHaveProperty('inheritedEnable')
  })
})
