import { describe, expect, it } from 'vitest'
import { fresh } from '../../vendor/elekloader/kit/src/store.ts'
import { afterDeleting, configurationDevice, newConfiguration, validateConfiguration, pinModuleVersions, startupSettings } from './workspace'
describe('persistent configuration version pins',()=>{
 it('starts empty with stock FX2 disabled while dynamic loading is unavailable',()=>{
  const configuration=newConfiguration('Empty')
  expect(configuration.moduleIds).toEqual([])
  expect(configuration.moduleVersions).toEqual({})
  expect(configuration.keepStockFx2).toBe(false)
 })
 it('uses current versions for new, restored and duplicated configurations',()=>{
  const current=newConfiguration('Current',['miniverb','tapeecho'],false)
  const old={...current,moduleVersions:{miniverb:'0.1.1-experimental',tapeecho:'0.1.1-experimental'}}
  expect(current.moduleVersions).toEqual(pinModuleVersions(current.moduleIds))
  expect(validateConfiguration(old)).toEqual(current)
  const copy=newConfiguration('Copy',old.moduleIds,old.keepStockFx2,old.moduleVersions)
  expect(copy.moduleIds).toEqual(old.moduleIds)
  expect(copy.keepStockFx2).toBe(false)
  expect(copy.moduleVersions).toEqual(current.moduleVersions)
  expect(old.moduleVersions.miniverb).toBe('0.1.1-experimental')
 })
 it('uses current versions for pre-version configurations without accepting malformed pins',()=>{
  const current=newConfiguration('Legacy',['repitch'])
  expect(validateConfiguration({...current,moduleVersions:undefined}).moduleVersions).toEqual(current.moduleVersions)
  expect(validateConfiguration({...current,moduleVersions:{}}).moduleVersions).toEqual(current.moduleVersions)
  for(const pins of [[],null,{repitch:'latest'},{repitch:123},{repitch:'0.1.0',spectrum:'0.1.0'}])expect(()=>validateConfiguration({...current,moduleVersions:pins})).toThrow()
 })
})
describe('startup choice',()=>{
 it('keeps an Octatrack configuration\'s classic startup and drops it everywhere else',()=>{
  const current=newConfiguration('Startup',['repitch'])
  expect(validateConfiguration(current)).not.toHaveProperty('classicStartup')
  expect(validateConfiguration({...current,classicStartup:false})).not.toHaveProperty('classicStartup')
  expect(validateConfiguration({...current,classicStartup:true}).classicStartup).toBe(true)
  expect(()=>validateConfiguration({...current,classicStartup:'yes'})).toThrow()
  expect(startupSettings('digitakt',true)).toEqual({})
 })
})
describe('deleting a configuration',()=>{
 const ot=newConfiguration('Octatrack set'),digi=(name:string)=>newConfiguration(name,[],true,undefined,'digitakt')
 it('opens another configuration for the same machine first, then any other',()=>{
  const a=digi('A'),b=digi('B')
  expect(afterDeleting([ot,a,b],a.id)).toEqual({remaining:[ot,b],next:b})
  expect(afterDeleting([ot,a],a.id)).toEqual({remaining:[ot],next:ot})
 })
 it('replaces a machine’s only configuration with an empty one for that machine',()=>{
  const only=digi('Only'),{remaining,next}=afterDeleting([only],only.id)
  expect(remaining).toEqual([next])
  expect(configurationDevice(next)).toBe('digitakt')
  expect(next.moduleIds).toEqual([])
 })
})
describe('mod-storage lockfiles in saved configurations', () => {
  it('keeps a saved lockfile and refuses one that is not an object', () => {
    const configuration = { ...newConfiguration('Rytm', ['filter-hz'], false, undefined, 'analog-rytm-mkii'), storageLock: fresh('analog-rytm-mk2') }
    expect(validateConfiguration(configuration)).toEqual(configuration)
    expect(() => validateConfiguration({ ...configuration, storageLock: 'layout' })).toThrow('mod storage layout is unreadable')
    expect(validateConfiguration({ ...configuration, storageLock: undefined }).storageLock).toBeUndefined()
  })
})
