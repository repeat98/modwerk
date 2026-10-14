import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { parseModuleDocument, type ModuleDocument } from './module-contract'
import { moduleFolderSha256, moduleNativeSourceSha256, requireFolderQualification } from '../../scripts/module-qualification.mjs'
import example from '../../public/module-repository.example.json'
import { qualificationFixture, qualificationReadme, qualificationMedia, qualificationPng } from './test-fixtures/qualification'
import { resourceImpactFixture } from './test-fixtures/resource-impact'

let root: string, folder: string, document: ModuleDocument, commit: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const put = (path: string, content: string | Buffer) => { const full=resolve(root,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,content) }
const check = () => requireFolderQualification(folder, document, new Map(), new Map(), { root })
const save = () => writeFileSync(resolve(folder,'octamod.module.json'),JSON.stringify(document))

beforeEach(async () => {
  root=mkdtempSync(resolve(tmpdir(),'octamod-retained-test.'))
  folder=resolve(root,'sdk/octabam/modules',example.id)
  document=parseModuleDocument({...structuredClone(example),media:[qualificationMedia],access:{...example.access,screenshots:[qualificationMedia.path]},resources:{...example.resources,impact:resourceImpactFixture()},tests:{...example.tests,hardwareStatus:'verified',qualification:qualificationFixture()}})
  for(const [path,bytes] of Object.entries({'manifest.py':'raise AssertionError("module source must never execute")\n','README.md':qualificationReadme,'TESTING.md':'Synthetic, firmware-free qualification fixture\n','LICENSE':'MIT fixture attribution\n'})) put('sdk/octabam/modules/'+example.id+'/'+path,bytes)
  put('sdk/octabam/modules/'+example.id+'/media/ui.png',qualificationPng)
  put('src/engine/compose-os.ts','// synthetic runtime dependency\n')
  put('src/engine/assets/dsp-packages.json',JSON.stringify({sourceCommit:null,moduleVersions:{[document.id]:document.version},packages:[{id:document.id,version:document.version,code:'synthetic bytes',address:4096}]}))
  put('src/engine/assets/module-build.json',JSON.stringify({schemaVersion:1,kind:'source-packages',sourceCommit:null,sourceTreeSha256:'a'.repeat(64),compilerSha256:'c'.repeat(64),moduleVersions:{[document.id]:document.version},files:{},approval:null,qualification:'assembly only; no new hardware qualification'}))
  document.tests.qualification!.sourceSha256=await moduleNativeSourceSha256(folder,document)
  save()
  put('sdk/catalog.json',JSON.stringify({schemaVersion:1,sourceRevision:'a'.repeat(40),modules:[{id:document.id,version:document.version,addedAt:'2026-10-05T12:00:00Z'}]}))
  git('init','--quiet');git('add','.')
  git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic approved publication')
  commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit)
  document={...document,version:'0.1.1',tests:{...document.tests,retainedEvidence:{commit,moduleVersion:document.version,documentation:structuredClone(document.tests.qualification!.documentation)}}}
  save()
})
afterEach(()=>rmSync(root,{recursive:true,force:true}))

describe('risk-based retained module evidence',()=>{
  it('accepts editorial changes without relabelling the tested version or running native source',async()=>{
    document.presentation.summary='Clearer description of the same behavior.'
    document.controls[0].doc='Clearer explanation of the unchanged control.'
    document.tests.summary='Clarify the original test observations.'
    put('sdk/octabam/modules/'+example.id+'/README.md',qualificationReadme+'\nEditorial clarification.\n')
    save()
    expect(await check()).toBe('retained-evidence')
    expect(document.tests.qualification!.moduleVersion).toBe(example.version)
    expect(document.media[0].otUi!.moduleVersion).toBe(example.version)
    expect(document.tests.hardwareStatus).toBe('verified')
  })
  it.each(['unmeasured', 'static'] as const)('handles README resource references according to their evidence method: %s',async method=>{
    git('reset','--hard','HEAD')
    const original=JSON.parse(readFileSync(resolve(folder,'octamod.module.json'),'utf8')) as ModuleDocument
    for(const metric of [original.resources.storage,original.resources.processing]) {
      metric.source='README.md';metric.method=method
      metric.value=method==='unmeasured'?null:1
      metric.display=method==='unmeasured'?'Not measured':'1 byte'
    }
    writeFileSync(resolve(folder,'octamod.module.json'),JSON.stringify(original))
    git('add','.');git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic README resource reference')
    commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit)
    document={...original,version:'0.1.1',tests:{...original.tests,retainedEvidence:{commit,moduleVersion:original.version,documentation:structuredClone(original.tests.qualification!.documentation)}}}
    put('sdk/octabam/modules/'+example.id+'/README.md',qualificationReadme+'\nTrack swing documentation.\n')
    save()
    if(method==='unmeasured') {
      expect(await check()).toBe('retained-evidence')
      document.resources.storage.value=1
      await expect(check()).rejects.toThrow('full qualification')
    } else {
      expect(await check()).toBe('retained-evidence')
      put('sdk/octabam/modules/'+example.id+'/README.md',qualificationReadme.replace('Overview','Changed historical overview')+'\nTrack swing documentation.\n')
      await expect(check()).rejects.toThrow('README.md; full qualification')
    }
  })
  it('allows real documentation/media changes but still validates the documentation and pixels',async()=>{
    const docs=document.tests.retainedEvidence!.documentation
    docs.tutorial.title='A clearer tutorial'
    // The fixture heading is taken from the actual declaration, not assumed.
    const old=document.tests.qualification!.documentation.tutorial.title
    put('sdk/octabam/modules/'+example.id+'/README.md',qualificationReadme.replace(old,docs.tutorial.title))
    save();expect(await check()).toBe('retained-evidence')
    put('sdk/octabam/modules/'+example.id+'/media/ui.png',Buffer.from('invalid PNG'))
    await expect(check()).rejects.toThrow('black-and-white PNG')
  })
  it.each([
    ['manifest.py','raise AssertionError("changed code")\n'],
    ['runtime-data.txt','new runtime coefficients'],
    ['helper.md','undeclared native input'],
    ['media/hidden.py','print("executable hidden in media")'],
    ['TESTING.md','rewritten qualification evidence'],
  ])('requires full qualification for changed source/data/evidence: %s',async(path,bytes)=>{
    put('sdk/octabam/modules/'+example.id+'/'+path,bytes)
    await expect(check()).rejects.toThrow('full qualification')
  })
  it.each([
    ['control default',(d:ModuleDocument)=>{d.controls[0].default++}],
    ['control range',(d:ModuleDocument)=>{d.controls[0].count++}],
    ['compatibility',(d:ModuleDocument)=>{d.compatibility.conflicts.push('Another module')}],
    ['memory/load claim',(d:ModuleDocument)=>{d.resources.impact!.memory.level='high'}],
    ['cycle count',(d:ModuleDocument)=>{d.tests.qualification!.cycles[0].worstCase++}],
    ['hardware status',(d:ModuleDocument)=>{d.tests.hardwareStatus='reported'}],
    ['source pin',(d:ModuleDocument)=>{d.tests.evidenceRevision='f'.repeat(40)}],
    ['build support',(d:ModuleDocument)=>{d.build={status:'pending',reason:'Changed build profile'}}],
  ])('requires full qualification for changed %s',async(label,mutate)=>{
    expect(label).toBeTruthy();mutate(document);await expect(check()).rejects.toThrow('full qualification')
  })
  it.each(['src/engine/compose-os.ts','sdk/octabam/dsp/shared.asm','sdk/octabam/platform/shared/manifest.py','sdk/octabam/tools/build/build_bus.py','sdk/octabam/tools/remix/platform_build.py','scripts/build-module-packages.py'])('keeps reuse after a shared runtime/build change, which the app tests cover: %s',async path=>{
    put(path,'changed runtime dependency\n');expect(await check()).toBe('retained-evidence')
  })
  it('ignores shared assets without rows of this module',async()=>{
    put('src/engine/assets/beta-startup.json',JSON.stringify({version:'3.0.0',code:'changed shared startup'}))
    expect(await check()).toBe('retained-evidence')
  })
  it('accepts rebuilt version labels but rejects changed browser package bytes or placement',async()=>{
    const path='src/engine/assets/dsp-packages.json'
    const artifact=JSON.parse(readFileSync(resolve(root,path),'utf8'))
    artifact.moduleVersions[document.id]=document.version
    artifact.packages[0].version=document.version
    artifact.sourceCommit='b'.repeat(40)
    put(path,JSON.stringify(artifact));expect(await check()).toBe('retained-evidence')
    artifact.packages[0].address++
    put(path,JSON.stringify(artifact));await expect(check()).rejects.toThrow('full qualification')
    artifact.packages[0].address--
    artifact.packages[0].code='changed browser code'
    put(path,JSON.stringify(artifact));await expect(check()).rejects.toThrow('full qualification')
  })
  it('accepts release approval and shared build metadata while protecting the module version label',async()=>{
    const path='src/engine/assets/module-build.json'
    const artifact=JSON.parse(readFileSync(resolve(root,path),'utf8'))
    artifact.sourceCommit='b'.repeat(40)
    artifact.sourceTreeSha256='d'.repeat(64)
    artifact.moduleVersions[document.id]=document.version
    artifact.approval={repository:'example/modules',commit:artifact.sourceCommit,pullRequest:42,mergedById:1}
    put(path,JSON.stringify(artifact))
    expect(await check()).toBe('retained-evidence')
    artifact.compilerSha256='e'.repeat(64)
    artifact.qualification='Shared builder note'
    put(path,JSON.stringify(artifact));expect(await check()).toBe('retained-evidence')
    artifact.moduleVersions[document.id]='9.9.9'
    put(path,JSON.stringify(artifact));await expect(check()).rejects.toThrow('package rows changed')
  })
  it('allows a derived composition inventory label while preserving every native proof',async()=>{
    const path='src/engine/assets/analog-bd-composition-proofs.json'
    const artifact={moduleSourceTreeSha256:'a'.repeat(64),sourceSha256:'s'.repeat(64),proofs:[{moduleIds:[document.id],maskedOsSha256:'b'.repeat(64)}]}
    put(path,JSON.stringify(artifact))
    git('add',path);git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic original native proof')
    document.tests.retainedEvidence!.commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',document.tests.retainedEvidence!.commit)
    artifact.moduleSourceTreeSha256='c'.repeat(64)
    put(path,JSON.stringify(artifact));expect(await check()).toBe('retained-evidence')
    artifact.proofs[0].maskedOsSha256='d'.repeat(64)
    put(path,JSON.stringify(artifact));await expect(check()).rejects.toThrow('full qualification')
  })
  it('preserves historical status when retaining a frozen baseline release',async()=>{
    git('reset','--hard','HEAD')
    const original=JSON.parse(readFileSync(resolve(folder,'octamod.module.json'),'utf8')) as ModuleDocument
    delete original.tests.qualification
    original.tests.hardwareStatus='historical'
    writeFileSync(resolve(folder,'octamod.module.json'),JSON.stringify(original))
    const baseline=new Map([[original.id,{id:original.id,version:original.version,folderSha256:await moduleFolderSha256(folder)}]])
    git('add','.');git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic frozen legacy publication')
    commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit)
    document={...original,version:'0.1.1',tests:{...original.tests,retainedEvidence:{commit,moduleVersion:original.version,documentation:qualificationFixture().documentation}}}
    save()
    expect(await requireFolderQualification(folder,document,baseline,new Map(),{root})).toBe('retained-evidence')
    expect(document.tests.hardwareStatus).toBe('historical')
    expect(document.tests.qualification).toBeUndefined()
    const entry=baseline.get(original.id)!
    expect(entry.version).toBe(original.version)
    expect(entry.folderSha256).not.toBe(await moduleFolderSha256(folder))
  })
  it('rejects a submitted commit that has not reached approved main history',async()=>{
    git('add','.');git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Unreviewed update')
    document.tests.retainedEvidence!.commit=git('rev-parse','HEAD')
    await expect(check()).rejects.toThrow('approved main history')
  })
  it('requires the original published version, a version increase and unchanged prior proof',async()=>{
    document.tests.retainedEvidence!.moduleVersion='0.0.1'
    await expect(check()).rejects.toThrow('prior module/version')
    document.tests.retainedEvidence!.moduleVersion=example.version
    document.version=example.version
    await expect(check()).rejects.toThrow('greater module version')
    document.version='0.1.1';delete document.tests.qualification
    await expect(check()).rejects.toThrow('full qualification')
  })
  it('cannot inherit evidence from a source draft absent from the approved catalog',async()=>{
    git('reset','--hard','HEAD')
    put('sdk/catalog.json',JSON.stringify({modules:[]}));git('add','.')
    git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic unpublished draft')
    commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit)
    document.tests.retainedEvidence!.commit=commit
    await expect(check()).rejects.toThrow('already published catalog version')
  })
  it('revalidates the original measurements rather than accepting a declaration alone',async()=>{
    git('reset','--hard','HEAD')
    const original=JSON.parse(readFileSync(resolve(folder,'octamod.module.json'),'utf8')) as ModuleDocument
    original.tests.qualification!.sourceSha256='f'.repeat(64)
    writeFileSync(resolve(folder,'octamod.module.json'),JSON.stringify(original));git('add','.')
    git('-c','user.name=Evidence test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic invalid proof')
    commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit)
    document.tests.qualification=original.tests.qualification
    document.tests.retainedEvidence!.commit=commit
    await expect(check()).rejects.toThrow('source SHA-256 differs')
  })
})
