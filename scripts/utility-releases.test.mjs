import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseModuleDocument, requireModuleQualificationForPublication } from '../src/catalog/module-contract.ts'
import { moduleNativeSourceSha256, parseQualificationBaseline, parseReleaseWaivers, requireFolderQualification } from './module-qualification.mjs'
import { compiledModuleVersions, moduleSourceFingerprint, moduleSourcePaths } from './module-source.mjs'
import { requireModuleDocumentation } from './module-documentation.mjs'
import { AVAILABLE_MODULES } from '../src/catalog/availability.ts'
import { MODULES, resolveSelection } from '../src/catalog/modules.ts'
const json=async p=>JSON.parse(await readFile(resolve(p),'utf8'))
const baseline=await json('sdk/approvals/module-qualification-baseline.json'),waiverRecord=await json('sdk/approvals/module-release-waivers.json')
const waivers=parseReleaseWaivers(waiverRecord),catalog=await json('sdk/catalog.json')

describe('owner-approved utility releases',()=>{
  for(const id of ['cc-map','previewvol']) it(id+' is selectable, source-pinned and honestly software verified',async()=>{
    const folder=resolve('sdk/octabam/modules/'+id),document=parseModuleDocument(await json(folder+'/octamod.module.json'))
    expect(document.version).toBe('0.1.2-experimental')
    expect(document.build).toBeUndefined()
    expect(document.tests.hardwareStatus).toBe('untested')
    expect(document.resources.processing.value).toBeNull()
    expect(document.tests.qualification).toBeUndefined()
    expect(document.tests.releaseWaiver.sourceSha256).toBe(await moduleNativeSourceSha256(folder,document))
    expect(AVAILABLE_MODULES.some(m=>m.id===id)).toBe(true)
    expect(resolveSelection([id])).toEqual([MODULES.find(m=>m.id===id)])
    expect((await compiledModuleVersions(resolve('.'),catalog))[id]).toBe(document.version)
    await expect(requireFolderQualification(folder,document,parseQualificationBaseline(baseline),waivers)).resolves.toBe('owner-waived')
    await requireModuleDocumentation(folder,document)
    // A contributor declaration cannot grant its own publication exception.
    expect(()=>requireModuleQualificationForPublication(document)).toThrow('worst-case cycles')
    await expect(requireFolderQualification(folder,document,parseQualificationBaseline(baseline))).rejects.toThrow('worst-case cycles')
    await expect(requireFolderQualification(folder,{...document,version:'0.1.3-experimental'},parseQualificationBaseline(baseline),waivers)).rejects.toThrow('worst-case cycles')
    const changed=structuredClone(document);changed.presentation.summary+=' changed'
    // Parsed declaration edits still need the pinned physical file, and
    // dishonest hardware/timing claims must fail even with a matching folder.
    changed.tests.hardwareStatus='verified'
    await expect(requireFolderQualification(folder,changed,parseQualificationBaseline(baseline),waivers)).rejects.toThrow('untested/unmeasured')
    const capture=await json(folder+'/media/capture.json')
    expect(capture.moduleVersion).toBe('0.1.1-experimental')
    expect(capture.releaseBinding.moduleVersion).toBe(document.version)
    expect(capture.releaseBinding.nativeSourceSha256).toBe(document.tests.releaseWaiver.sourceSha256)
    for(const item of document.media){
      expect(item.otUi.imageSha256).toBe(capture.imageSha256)
      const hash=createHash('sha256').update(await readFile(folder+'/'+item.path)).digest('hex')
      const expected=Array.isArray(capture.screenshots)?capture.screenshots.find(s=>s.path===item.path).sha256:capture.screenshots[item.path.slice(6)]
      expect(hash).toBe(expected)
    }
  })
  it('never expands the frozen baseline or waiver scope',()=>{
    expect(baseline.modules).toHaveLength(11)
    expect(baseline.modules.some(m=>['cc-map','previewvol'].includes(m.id))).toBe(false)
    expect(()=>parseReleaseWaivers({...waiverRecord,modules:[...waiverRecord.modules,{...waiverRecord.modules[0],id:'octakit'}]})).toThrow()
    expect(()=>parseReleaseWaivers({...waiverRecord,modules:waiverRecord.modules.map(m=>({...m,version:'0.1.3-experimental'}))})).toThrow()
  })
  it('binds both utility source folders into release compilation',async()=>{
    const paths=await moduleSourcePaths(resolve('.'))
    for(const id of ['cc-map','previewvol'])expect(paths.some(p=>p.startsWith('modules/'+id+'/'))).toBe(true)
    expect(await moduleSourceFingerprint(resolve('.'))).toBe((await json('src/engine/assets/module-build.json')).sourceTreeSha256)
  })
})
