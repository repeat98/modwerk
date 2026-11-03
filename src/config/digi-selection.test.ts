import { describe, expect, it } from 'vitest'
import { fresh } from '../../vendor/elekloader/kit/src/store.ts'
import { createDigiSelection, parseDigiSelection } from './digi-selection'
import { pinModuleVersions } from './workspace'

describe('Digi configuration backups', () => {
  it.each(['digitakt', 'digitone'] as const)('round-trips %s selection with the current module versions', device => {
    const configuration = { name: 'My configuration', moduleIds: ['digihealth'], moduleVersions: pinModuleVersions(['digihealth'], device) }
    expect(parseDigiSelection(JSON.stringify(createDigiSelection(configuration, device)), device)).toEqual({ ...configuration, notes: [] })
  })
  it('imports backups made with the Pyodide builder, whose catalog is unchanged', () => {
    const backup = { app: 'modwerk', schemaVersion: 1, device: 'digitakt', name: 'Before the engine update', catalog: { revision: 'e4d8ba84841900db78144030a991e1d69816b6a4' }, modules: [{ id: 'digihealth', version: '1.0.0' }] }
    expect(parseDigiSelection(JSON.stringify(backup), 'digitakt')).toMatchObject({ name: 'Before the engine update', moduleIds: ['digihealth'] })
  })
  it('imports a backup from an older catalog, with its modules checked against the current library', () => {
    const old = (modules: { id: string; version: string }[]) => JSON.stringify({ app: 'modwerk', schemaVersion: 1, device: 'digitakt', name: 'Older', catalog: { revision: '0123456789abcdef0123456789abcdef01234567' }, modules })
    const same = parseDigiSelection(old([{ id: 'digihealth', version: pinModuleVersions(['digihealth'], 'digitakt').digihealth }]), 'digitakt')
    expect(same).toMatchObject({ name: 'Older', moduleIds: ['digihealth'] })
    expect(same.notes[0]).toContain('module catalog 0123456')
    expect(same.notes.slice(1)).toEqual(['Every module is still in the library, at the same version.'])
    const changed = parseDigiSelection(old([{ id: 'digihealth', version: '0.9.0' }, { id: 'digiretired', version: '1.0.0' }]), 'digitakt')
    expect(changed.moduleIds).toEqual(['digihealth'])
    expect(changed.moduleVersions).toEqual(pinModuleVersions(['digihealth'], 'digitakt'))
    expect(changed.notes.slice(1)).toEqual(['digiretired is no longer in the library and was left out.', 'digihealth: 0.9.0 in the backup, ' + changed.moduleVersions.digihealth + ' now.'])
    expect(() => parseDigiSelection(old([{ id: 'digiretired', version: '1.0.0' }]), 'digitakt')).toThrow('None of this backup’s modules are in the library any more: digiretired.')
    expect(() => parseDigiSelection(old([{ id: 'digihealth', version: 'latest' }]), 'digitakt')).toThrow('semantic version')
  })
  it('says nothing more about a backup from the current catalog', () => {
    const backup = createDigiSelection({ name: 'Test', moduleIds: ['digihealth'], moduleVersions: {} }, 'digitakt')
    expect(parseDigiSelection(JSON.stringify(backup), 'digitakt').notes).toEqual([])
  })
  it('exports only public selection metadata even when the input has private fields', () => {
    const configuration = { name: 'Test', moduleIds: ['digihealth'], moduleVersions: { digihealth: '1.0.0' }, firmware: new Uint8Array([1,2,3]), filename: 'private.syx', email: 'private@example.test' }
    const serialized = JSON.stringify(createDigiSelection(configuration, 'digitakt'))
    expect(serialized).not.toMatch(/firmware|filename|private/)
  })
  it('rejects other machines, unknown modules, unreadable catalogs and embedded content', () => {
    const backup = createDigiSelection({ name: 'Test', moduleIds: ['digihealth'], moduleVersions: {} }, 'digitakt')
    expect(() => parseDigiSelection(JSON.stringify(backup), 'digitone')).toThrow('different machine')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, modules: [{ id: 'unknown', version: '1.0.0' }] }), 'digitakt')).toThrow('Unknown')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, catalog: { revision: '' } }), 'digitakt')).toThrow('configuration backup')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, catalog: {} }), 'digitakt')).toThrow('configuration backup')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, firmware: [1,2,3] }), 'digitakt')).toThrow('configuration backup')
  })
  it('rejects malformed JSON, invalid versions and oversized backups', () => {
    const backup = createDigiSelection({ name: 'Test', moduleIds: ['digihealth'], moduleVersions: {} }, 'digitakt')
    expect(() => parseDigiSelection('not json', 'digitakt')).toThrow('not valid configuration JSON')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, modules: [{ id: 'digihealth', version: 'latest' }] }), 'digitakt')).toThrow('semantic version')
    expect(() => parseDigiSelection(' '.repeat(32769), 'digitakt')).toThrow('32 KB')
  })
})
describe('mod-storage lockfiles in backups', () => {
  const lock = fresh('analog-rytm-mk2')
  it('round-trips the lockfile of the last build with a Rytm selection', () => {
    const configuration = { name: 'Rytm', moduleIds: ['filter-hz'], moduleVersions: pinModuleVersions(['filter-hz'], 'analog-rytm-mkii'), storageLock: lock }
    const backup = createDigiSelection(configuration, 'analog-rytm-mkii')
    expect(backup.storage).toEqual(lock)
    expect(parseDigiSelection(JSON.stringify(backup), 'analog-rytm-mkii')).toEqual({ ...configuration, notes: [] })
  })
  it('leaves the field out when nothing was built, and refuses a lockfile the kit would refuse', () => {
    const backup = createDigiSelection({ name: 'Rytm', moduleIds: ['filter-hz'], moduleVersions: {} }, 'analog-rytm-mkii')
    expect('storage' in backup).toBe(false)
    expect(parseDigiSelection(JSON.stringify(backup), 'analog-rytm-mkii').storageLock).toBeUndefined()
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, storage: { ...lock, device: 'digitakt-mk1' } }), 'analog-rytm-mkii')).toThrow('mod storage layout cannot be used: lockfile: made for the digitakt-mk1')
    expect(() => parseDigiSelection(JSON.stringify({ ...backup, storage: [] }), 'analog-rytm-mkii')).toThrow('mod storage layout cannot be used')
  })
})
