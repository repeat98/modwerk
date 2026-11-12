import { describe, expect, it } from 'vitest'
import { createSelection, parseSelection } from './selection'
import { BASE_FIRMWARE } from '../engine/base'
import { pinModuleVersions } from './workspace'

describe('selection export', () => {
  it('rejects unknown modules instead of dropping them from a build plan', () => {
    expect(() => createSelection(['missing-module'], null)).toThrow('Unknown module')
  })
  it('deduplicates modules and orders them by the pinned catalog', () => {
    const selection = createSelection(['repitch', 'miniverb', 'miniverb'], null)
    expect(selection.modules.map((module) => module.id)).toEqual(['miniverb', 'repitch'])
    expect(selection.validation).toBe('pending')
  })
  it('exports base identity without firmware content or local filenames', () => {
    const selection = createSelection(['repitch'], {
      ...BASE_FIRMWARE, name: 'personal-file-name.bin',
    })
    expect(selection.base).toEqual({
      version: BASE_FIRMWARE.version, sha256: BASE_FIRMWARE.sha256, bytes: BASE_FIRMWARE.bytes,
    })
    expect(JSON.stringify(selection)).not.toContain('personal-file-name')
    expect(selection).not.toHaveProperty('buffer')
  })
})

describe('configuration import and chooser persistence',()=>{
 it('retains classic startup during a mobile-to-desktop JSON transfer and refuses malformed values',()=>{
  const exported={...createSelection(['miniverb'],null,false,undefined,undefined,undefined,true),name:'Phone set'}
  expect(parseSelection(JSON.stringify(exported))).toMatchObject({classicStartup:true,moduleIds:['miniverb']})
  expect(()=>parseSelection(JSON.stringify({...exported,options:{...exported.options,classicStartup:'true'}}))).toThrow('startup setting')
 })
 it('round-trips a compact chooser without importing firmware',()=>{
  const exported={...createSelection(['miniverb','repitch'],null,false),name:'Compact set'}
  expect(parseSelection(JSON.stringify(exported))).toEqual({name:'Compact set',moduleIds:['miniverb','repitch'],moduleVersions:pinModuleVersions(['miniverb','repitch']),keepStockFx2:false})
 })
 it('defaults old backups to retained stock effects and rejects changed catalog identities',()=>{
  const legacy={...createSelection(['euclid'],null),schemaVersion:1,name:'Legacy'}
  expect(parseSelection(JSON.stringify(legacy)).keepStockFx2).toBe(true)
  expect(()=>parseSelection(JSON.stringify({...legacy,catalog:{revision:'unknown'}}))).toThrow('different module catalog')
 })
 it('rejects unknown modules, malformed settings, non-JSON and oversized backups',()=>{
  const valid={...createSelection(['euclid'],null),name:'Test'}
  expect(()=>parseSelection(JSON.stringify({...valid,modules:[{id:'unknown'}]}))).toThrow('Unknown module')
  expect(()=>parseSelection(JSON.stringify({...valid,options:{keepStockFx2:'false'}}))).toThrow('chooser setting')
  expect(()=>parseSelection('not json')).toThrow('not valid configuration JSON')
  expect(()=>parseSelection(' '.repeat(32769))).toThrow('32 KB')
 })
})


describe('module versions in configuration backups',()=>{
 it('records backup versions but imports the current catalog versions',()=>{
  const exported={...createSelection(['tapehead'],null,true,{tapehead:'0.0.9'}),name:'Older set'}
  expect(exported.schemaVersion).toBe(3)
  expect(exported.modules[0]).toMatchObject({id:'tapehead',version:'0.0.9'})
  expect(parseSelection(JSON.stringify(exported)).moduleVersions).toEqual(pinModuleVersions(['tapehead']))
  expect(()=>parseSelection(JSON.stringify({...exported,modules:[{id:'tapehead'}]}))).toThrow('missing module versions')
  expect(()=>parseSelection(JSON.stringify({...exported,modules:[{id:'tapehead',version:'latest'}]}))).toThrow('semantic version')
 })
 it('leaves out modules removed from the library and keeps the rest of the backup',()=>{
  const exported={...createSelection(['miniverb','euclid'],null,true),name:'Older set'}
  const removed=[{id:'spectrum',version:'0.1.1-experimental'},{id:'midi-scenes',version:'0.2.5-experimental'}]
  const backup={...exported,modules:[removed[0],...exported.modules,removed[1]]}
  expect(parseSelection(JSON.stringify(backup))).toEqual({name:'Older set',moduleIds:['miniverb','euclid'],moduleVersions:pinModuleVersions(['miniverb','euclid']),keepStockFx2:true})
  expect(parseSelection(JSON.stringify({...exported,modules:removed}))).toMatchObject({moduleIds:[],moduleVersions:{}})
  expect(()=>parseSelection(JSON.stringify({...exported,modules:[...exported.modules,{id:'not-a-module',version:'1.0.0'}]}))).toThrow('Unknown module')
 })
 it.each([1,2,3])('imports a schema %i backup with the current versions and unchanged selection',schemaVersion=>{
  const ids=['miniverb','tapeecho','euclid','usb-audio-out-tracks-main-cue','quantizer']
  const old=Object.fromEntries(ids.map(id=>[id,'0.1.1-experimental']))
  const backup={...createSelection(ids,null,false,old),schemaVersion,name:'Reported configuration'}
  expect(parseSelection(JSON.stringify(backup))).toEqual({name:backup.name,moduleIds:ids,moduleVersions:pinModuleVersions(ids),keepStockFx2:schemaVersion===1})
 })
})
