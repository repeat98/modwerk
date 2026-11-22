import { describe, expect, it } from 'vitest'
import { MODULES } from './modules'
import { DIGI_MODS } from '../devices/digi-mods'
import { matchesModuleQuery, octatrackMatchesQuery, digiMatchesQuery } from './module-search'

describe('module discovery search', () => {
  it('combines words across fields in any order without requiring a phrase', () => {
    expect(matchesModuleQuery('delay tape', 'Tape Echo', 'A delay effect')).toBe(true)
    expect(matchesModuleQuery('tape unknown', 'Tape Echo', 'A delay effect')).toBe(false)
    expect(matchesModuleQuery('  ', 'Tape Echo')).toBe(true)
  })
  it('ignores case, accents and punctuation when finding actual catalogue text', () => {
    expect(matchesModuleQuery('RETRIG midi', 'MIDI-retrig')).toBe(true)
    expect(matchesModuleQuery('andre', 'André')).toBe(true)
    expect(matchesModuleQuery('usb/audio', 'USB Audio')).toBe(true)
  })
  it('includes the instrument and type in Octatrack results', () => {
    const reverb = MODULES.find(module => module.id === 'everb')!
    expect(octatrackMatchesQuery(reverb, 'octatrack reverb')).toBe(true)
    expect(octatrackMatchesQuery(reverb, 'digitakt reverb')).toBe(false)
    expect(octatrackMatchesQuery(reverb, reverb.authorName)).toBe(true)
  })
  it('groups equivalent functions across instruments while keeping previous terms searchable', () => {
    const kick = MODULES.find(module => module.id === 'analog-bassdrum')!
    const rytmKick = DIGI_MODS.find(mod => mod.device === 'analog-rytm-mkii' && mod.id === 'analog-bd')!
    expect(kick).toMatchObject({ category: 'machines', type: 'Drum synthesis' })
    expect(digiMatchesQuery(rytmKick, 'drum synthesis')).toBe(true)
    const chorus = DIGI_MODS.find(mod => mod.device === 'analog-rytm-mkii' && mod.id === 'chorus')!
    expect(chorus).toMatchObject({ libraryCategory: 'effects', category: 'Chorus' })
    expect(digiMatchesQuery(chorus, 'send effects')).toBe(true)
    for (const [id, category, type] of [
      ['kits', 'system', 'Kits & parts'], ['quantizer', 'sequencing', 'Scale quantization'],
      ['slow-lfo', 'modulation', 'LFO'], ['repitch', 'playback', 'Sample playback'],
    ]) expect(MODULES.find(module => module.id === id)).toMatchObject({ category, type })
  })
  it('uses the same matching rules for Digi instrument, type and author searches', () => {
    const mod = DIGI_MODS.find(mod => mod.device === 'digitakt' && mod.libraryCategory === 'midi-usb')!
    expect(mod).toBeDefined()
    expect(digiMatchesQuery(mod, 'digitakt midi')).toBe(true)
    expect(digiMatchesQuery(mod, 'digitone midi')).toBe(false)
    expect(digiMatchesQuery(mod, mod.author)).toBe(true)
  })
})
