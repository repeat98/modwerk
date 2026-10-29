import { describe, expect, it } from 'vitest'
import { refusalClass } from './native-comparison.mjs'

describe('native refusal equivalence', () => {
  it('recognizes the native pre-boot collision and browser memory guard without masking unknown failures', () => {
    expect(refusalClass('platform build: pre-boot analog bd payload A dst overlaps runtime stage: 0x40b00000..0x40b16314', 'native')).toBe('Analog BD boot memory')
    expect(refusalClass('Analog BD boot payloads overlap or exceed reserved memory.', 'browser')).toBe('Analog BD boot memory')
    expect(refusalClass('pre-boot unexpected payload overlaps runtime', 'native')).toBe('unclassified')
  })
  it('classifies guarded hook overlaps as collisions while retaining other failures', () => {
    expect(refusalClass("remix 'test' has colliding modules: hook site: repitch and poly8", 'native')).toBe('declaration collision')
    expect(refusalClass('The OS write plan contains overlapping guards.', 'browser')).toBe('declaration collision')
    expect(refusalClass('conflicting native declarations', 'browser')).toBe('declaration collision')
    for (const error of ['The OS write plan has an invalid guarded range.', 'The original OS does not match the guard for polyui.', 'unresolved replay']) expect(refusalClass(error, 'browser')).toBe('unclassified')
  })
  it('matches the two builders\' refusal of the bytes the stock DELAY reads past its table', () => {
    expect(refusalClass('SYNTH MACHINE fmpage at 0x400d24d0..0x400d2653 reaches 0x400d24d0..0x400d24df, which the stock DELAY reads past its table: those 16 bytes stay stock', 'native')).toBe('stock DELAY table tail')
    expect(refusalClass('build changed 0x400d24d0..0x400d24df, which the stock DELAY reads past its table: those 16 bytes stay stock', 'native')).toBe('stock DELAY table tail')
    expect(refusalClass('synth fmpage ROM unit is placed at 0x400d24d0, but the stock DELAY reads 0x400d24d0..0x400d24df past its table, so those 16 bytes stay stock.', 'browser')).toBe('stock DELAY table tail')
    expect(refusalClass('Repitch ROM unit would change the stock DELAY reads 0x400d24d0..0x400d24df past its table, so those 16 bytes stay stock.', 'browser')).toBe('stock DELAY table tail')
  })
})
