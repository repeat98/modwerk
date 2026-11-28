import { describe, expect, it } from 'vitest'
import { moduleWorksReport } from './module-works-report'

describe('one-click working reports from a module page', () => {
  it('confirms only this module without guessing its installed version', () => {
    expect(moduleWorksReport('miniverb')).toEqual({ testedModuleIds: ['miniverb'] })
  })
  it('retains the full downloaded build but confirms only the clicked module', () => {
    const build = { machine: 'Octatrack', os: '1.40C', modules: [{ id: 'miniverb', name: 'Mini Verb', version: '0.1.0-experimental' }, { id: 'tapeecho', name: 'Tape Echo', version: '0.1.2' }] }
    const saved = { ...build, downloadedAt: 123, remindAt: 456, dismissed: true, completed: ['tapeecho'] }
    expect(moduleWorksReport('miniverb', saved)).toEqual({ testedModuleIds: ['miniverb'], build })
  })
  it('does not borrow an unrelated build’s instrument, OS or module versions', () => {
    const build = { machine: 'Digitakt', os: '1.54', modules: [{ id: 'digitakt-digiperform', name: 'Digi utilities', version: '1.0.0' }] }
    expect(moduleWorksReport('miniverb', build)).toEqual({ testedModuleIds: ['miniverb'] })
  })
  it('supports all catalog instrument families and rejects unknown modules', () => {
    for (const id of ['miniverb', 'digitakt-digiperform', 'digitone-kitbank']) expect(moduleWorksReport(id)).toEqual({ testedModuleIds: [id] })
    expect(() => moduleWorksReport('not-a-module')).toThrow('could not be found')
  })
})
