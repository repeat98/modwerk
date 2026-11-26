import { moduleBuildError } from './build-support'
import { describe, expect, it } from 'vitest'
import { AVAILABLE_MODULES, availableModules, BETA_MODULE_IDS, PAUSED_MODULE_IDS, PAUSED_MODULE_NOTICES, isBetaModule, isModuleAvailable, isModuleListedPaused, listedModules, moduleAvailabilityError, pausedBlock, withPausedBlocks } from './availability'
import { refusesAdd } from './add-blocks'
import { limitBlock } from './set-limit'
import { MODULES, REMOVED_MODULE_IDS, resolveSelection } from './modules'
import { newConfiguration, validateConfiguration } from '../config/workspace'

// Paused modules that beta access does not reopen, whichever they are at the time.
const paused = PAUSED_MODULE_IDS.filter(id => !isBetaModule(id))
const name = (id: string) => MODULES.find(module => module.id === id)!.name

describe('temporary module availability', () => {
  it('keeps every visible module buildable as an individual selection', () => {
    for (const module of AVAILABLE_MODULES) {
      expect(moduleBuildError([module.id])).toBe('')
    }
  })
  it('offers every catalog module that is not paused and retains their GitHub identity', () => {
    expect(AVAILABLE_MODULES.map(module => module.id)).toEqual(MODULES.map(module => module.id).filter(id => !PAUSED_MODULE_IDS.includes(id)))
    expect(AVAILABLE_MODULES.map(module => module.id)).toContain('sidechain-compressor')
    for (const module of AVAILABLE_MODULES.filter(module=>['miniverb','tapeecho','euclid','repitch','analog-bassdrum'].includes(module.id))) {
      expect(module.authorName).toBe('Jannik Aßfalg')
      expect(module.author).toBe('repeat98')
      expect(module.authorUrl).toBe('https://github.com/repeat98')
    }
    for (const id of [...PAUSED_MODULE_IDS, 'unknown']) expect(isModuleAvailable(id)).toBe(false)
    expect(isModuleAvailable('poly8')).toBe(false) // paused again on 26 November 2026 until it is optimised
  })
  it('keeps every paused module in the catalog', () => {
    expect(resolveSelection(PAUSED_MODULE_IDS)).toHaveLength(PAUSED_MODULE_IDS.length)
  })
  it('keeps older configurations readable and flags their paused modules before a build', () => {
    const saved = newConfiguration('Older configuration', [...PAUSED_MODULE_IDS, 'euclid'])
    const restored = validateConfiguration(saved)
    expect(restored.moduleIds).toEqual(saved.moduleIds)
    expect(restored.moduleVersions).toEqual(saved.moduleVersions)
    for (const id of PAUSED_MODULE_IDS) expect(moduleAvailabilityError(restored.moduleIds)).toContain(name(id))
    expect(moduleAvailabilityError(restored.moduleIds)).not.toContain('Euclid')
    expect(moduleAvailabilityError(restored.moduleIds)).toContain('Remove these modules')
  })
  it('offers beta modules to beta access while retaining other pauses', () => {
    expect(availableModules(true).map(module => module.id)).toEqual([...MODULES].filter(module => !PAUSED_MODULE_IDS.includes(module.id) || BETA_MODULE_IDS.includes(module.id)).map(module => module.id))
    expect(BETA_MODULE_IDS).toEqual([])
    expect(isModuleAvailable('airwindows-chorus')).toBe(true)
    for (const id of BETA_MODULE_IDS) expect(isModuleAvailable(id, true)).toBe(true)
    for (const id of paused) {
      expect(isModuleAvailable(id)).toBe(false)
      expect(moduleAvailabilityError([id, 'euclid'])).toContain(name(id))
      expect(isModuleAvailable(id, true)).toBe(false)
      expect(moduleAvailabilityError([id], true)).toContain(name(id))
      expect(moduleAvailabilityError([id, 'airwindows-chorus'], true)).toContain(name(id))
    }
    expect(moduleAvailabilityError(['poly8'], true)).toContain('POLY8')
    expect(isModuleAvailable('airwindows-chorus', true)).toBe(true)
    expect(moduleAvailabilityError(['airwindows-chorus'], true)).toBe('')
    expect(moduleBuildError(['airwindows-chorus'])).toBe('')
  })
  it('allows available selections and still rejects unknown catalog identities', () => {
    expect(moduleAvailabilityError(AVAILABLE_MODULES.map(module => module.id))).toBe('')
    expect(moduleAvailabilityError([])).toBe('')
    expect(() => moduleAvailabilityError(['unknown'])).toThrow('Unknown module')
  })
  it('no longer offers or pauses the modules removed from the library', () => {
    expect(REMOVED_MODULE_IDS).toEqual(['spectrum', 'modulation', 'character'])
    for (const id of REMOVED_MODULE_IDS) {
      expect(MODULES.some(module => module.id === id)).toBe(false)
      expect(PAUSED_MODULE_IDS).not.toContain(id)
      expect(isModuleAvailable(id, true)).toBe(false)
    }
  })
  it('lists a paused module with a notice, with its add locked and the notice as the reason', () => {
    expect(Object.keys(PAUSED_MODULE_NOTICES)).toEqual(['poly8'])
    for (const id of Object.keys(PAUSED_MODULE_NOTICES)) expect(PAUSED_MODULE_IDS).toContain(id)
    expect(listedModules().map(module => module.id)).toEqual(MODULES.map(module => module.id).filter(id => isModuleAvailable(id) || id === 'poly8'))
    expect(listedModules().map(module => module.id)).not.toContain('stem-rec')
    expect(isModuleListedPaused('poly8')).toBe(true)
    expect(isModuleListedPaused('stem-rec')).toBe(false)
    expect(isModuleListedPaused('euclid')).toBe(false)
    const block = pausedBlock('poly8')!
    expect(refusesAdd(block)).toBe(true)
    expect(block).toMatchObject({ kind: 'paused', reason: PAUSED_MODULE_NOTICES.poly8.reason, detail: PAUSED_MODULE_NOTICES.poly8.detail })
    expect(block.detail).toContain('CPU')
    expect(pausedBlock('euclid')).toBeUndefined()
    // The pause outranks the set limit, and leaves every other module's note alone.
    const blocks = withPausedBlocks({ poly8: limitBlock('poly8'), euclid: limitBlock('euclid') })
    expect(blocks.poly8.kind).toBe('paused')
    expect(blocks.euclid.kind).toBe('limit')
  })
})
