import { afterEach, describe, expect, it } from 'vitest'
import { staticModulePlan } from './static-dsp'
import facts from './assets/static-dsp.json'
import dsp from './assets/dsp-packages.json'
import resident from './assets/resident-dsp.json'

const originalFacts = structuredClone(facts.modules)
const originalPackages = structuredClone(dsp.packages)
const originalCharacter = structuredClone(resident.character)
afterEach(() => {
  facts.modules.splice(0, facts.modules.length, ...structuredClone(originalFacts))
  dsp.packages.splice(0, dsp.packages.length, ...structuredClone(originalPackages))
  Object.assign(resident.character, structuredClone(originalCharacter))
})

describe('selected static DSP declarations and packages', () => {
  it('refuses a selected DSP effect whose placement facts are missing instead of omitting its code', () => {
    facts.modules.splice(facts.modules.findIndex(module => module.id === 'miniverb'), 1)
    expect(() => staticModulePlan(['repitch', 'miniverb'])).toThrow('MINIVERB static DSP declarations')
    expect(staticModulePlan(['repitch'])).toEqual([])
  })
  it.each(['key', 'fxId', 'priority'] as const)('refuses mismatched or invalid %s placement facts', field => {
    const entry = facts.modules.find(module => module.id === 'miniverb')!
    if (field === 'key') entry.key = 'OTHER EFFECT'
    else if (field === 'fxId') entry.fxId++
    else entry.priority = NaN
    expect(() => staticModulePlan(['miniverb'])).toThrow('MINIVERB static DSP declarations')
  })
  it('refuses duplicate facts rather than placing the same selected effect twice', () => {
    facts.modules.push({ ...facts.modules.find(module => module.id === 'miniverb')! })
    expect(() => staticModulePlan(['miniverb'])).toThrow('MINIVERB static DSP declarations')
  })
  it('refuses a selected effect with no executable package', () => {
    dsp.packages.splice(dsp.packages.findIndex(pkg => pkg.id === 'miniverb'), 1)
    expect(() => staticModulePlan(['miniverb'])).toThrow('MINIVERB needs a DSP package')
  })
  it.each(['key', 'fxId', 'author'] as const)('refuses a package with the wrong %s', field => {
    const pkg = dsp.packages.find(pkg => pkg.id === 'miniverb')!
    if (field === 'key') pkg.key = 'OTHER EFFECT'
    else if (field === 'fxId') pkg.fxId++
    else pkg.author = 'other-author'
    expect(() => staticModulePlan(['miniverb'])).toThrow('MINIVERB DSP package does not match')
  })
  it.each(['words', 'init', 'relocations'] as const)('refuses unusable package %s before donor planning', field => {
    const pkg = dsp.packages.find(pkg => pkg.id === 'miniverb')!
    if (field === 'words') pkg.words = 0
    else if (field === 'init') pkg.init = pkg.words
    else pkg.relocations.push(pkg.words)
    expect(() => staticModulePlan(['miniverb'])).toThrow(/invalid DSP words|entry points are invalid|relocation table is invalid/)
  })
  it('requires both core variants of an effect that hooks stock DSP', () => {
    dsp.packages.splice(dsp.packages.findIndex(pkg => pkg.id === 'sidechain-compressor' && 'tag' in pkg && pkg.tag === 'B'), 1)
    expect(() => staticModulePlan(['sidechain-compressor'])).toThrow('needs a DSP package for both stock cores')
  })
  it('retains Character resident placement without a loadable package', () => {
    expect(dsp.packages.some(pkg => pkg.id === 'character')).toBe(false)
    expect(staticModulePlan(['repitch', 'character']).map(module => module.id)).toEqual(['character'])
    resident.character.key = 'OTHER EFFECT'
    expect(() => staticModulePlan(['character'])).toThrow('CHARACTER DSP package does not match')
  })
})
