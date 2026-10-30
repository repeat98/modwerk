import sdkCatalog from '../../sdk/catalog.json'
import { describe, expect, it } from 'vitest'
import { compiledModuleSource, validateCompiledModules } from './module-build'
import { moduleCardless } from '../catalog/usb-only'
describe('source-built module identity', () => {
  it('binds compiled packages and the guarded standalone MIDI Scenes recipe', () => {
    const source = compiledModuleSource()
    expect(Object.keys(source.moduleVersions).sort()).toEqual(sdkCatalog.modules.map(module => module.id).filter(id => !moduleCardless(id)).sort())
    expect(source.moduleVersions['midi-scenes']).toBe('0.2.5-experimental')
    expect(source.sourceTreeSha256).toMatch(/^[a-f0-9]{64}$/)
  })
  it('rejects stale or missing compiled versions before firmware composition', () => {
    const source = { sourceCommit:null, sourceTreeSha256:'a'.repeat(64), moduleVersions:{ spectrum:'1.0.0' } }
    expect(() => validateCompiledModules(source,[{id:'spectrum',version:'1.0.1'}])).toThrow('Rebuild')
    expect(() => validateCompiledModules(source,[{id:'spectrum',version:'1.0.0'},{id:'euclid',version:'1.0.0'}])).toThrow('versions differ')
    expect(() => validateCompiledModules({...source,sourceCommit:'main'},[{id:'spectrum',version:'1.0.0'}])).toThrow('identity')
  })
})
