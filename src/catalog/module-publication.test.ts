import { it, expect } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import example from '../../public/module-repository.example.json'
import { moduleFolderSha256, moduleNativeSourceSha256 } from '../../scripts/module-qualification.mjs'
import { parseModuleDocument } from './module-contract'
import { qualificationFixture, qualificationReadme } from './test-fixtures/qualification'
import { resourceImpactFixture } from './test-fixtures/resource-impact'

it('checks real PR publication changes without executing module source', async () => {
  const root=mkdtempSync(resolve(tmpdir(),'octamod-publication-test.'))
  const folder=resolve(root,'sdk/octabam/modules',example.id)
  const document={...structuredClone(example),access:{...example.access,screenshots:[] as string[]}}
  const catalog={schemaVersion:1,sourceRevision:'a'.repeat(40),modules:[{id:document.id,version:document.version,addedAt:'2026-10-05T12:00:00Z'}]}
  const put=(path:string,value:string)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value)}
  const save=()=>{
    put(resolve(folder,'octamod.module.json'),JSON.stringify(document))
    put(resolve(root,'sdk/catalog.json'),JSON.stringify(catalog))
  }
  const run=(...args:string[])=>spawnSync(process.execPath,['scripts/modules.mjs',...args],{cwd:root,encoding:'utf8'})
  const failure=()=>{const result=run('--base','HEAD','--write');expect(result.status).not.toBe(0);return result.stderr}
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'})
  try {
    for(const path of ['scripts/modules.mjs','scripts/change-scope.mjs','scripts/module-source.mjs','scripts/synth-release.mjs','scripts/module-qualification.mjs','scripts/retained-evidence.mjs','scripts/builder-preservation.mjs','scripts/module-documentation.mjs','src/catalog/module-contract.ts','src/catalog/module-contract-v3.ts','src/catalog/module-authors.ts','src/devices/machine-contract.ts','src/catalog/versions.ts','src/catalog/module-folder.ts','src/catalog/resource-impact.ts','src/catalog/compatibility-checks.ts','sdk/module-release-waivers.json']){
      mkdirSync(dirname(resolve(root,path)),{recursive:true})
      copyFileSync(resolve(path),resolve(root,path))
    }
    put(resolve(root,'src/catalog/native-metadata.json'),JSON.stringify({revision:catalog.sourceRevision,checks:{}}))
    for(const path of ['manifest.py','README.md','TESTING.md','LICENSE'])put(resolve(folder,path),path==='manifest.py'?'raise AssertionError("module source must never execute")':'Fixture document\n')
    save()
    const baselinePath=resolve(root,'sdk/module-qualification-baseline.json')
    const baseline={schemaVersion:1,recorded:'2026-10-02',modules:[{id:document.id,version:document.version,folderSha256:await moduleFolderSha256(folder)}]}
    const baselineBytes=JSON.stringify(baseline)
    put(baselinePath,baselineBytes)
    const impactsPath=resolve(root,'sdk/module-resource-estimates.json')
    const impacts={schemaVersion:1,modules:[{...baseline.modules[0],impact:resourceImpactFixture()}]}
    const impactBytes=JSON.stringify(impacts)
    put(impactsPath,JSON.stringify({schemaVersion:1,modules:[]}))
    expect(run('--write').stderr).toContain('release requires populated CPU, DSP core and memory gauges')
    put(impactsPath,impactBytes)
    // The library's Recently added sort reads each entry's first addition date.
    put(resolve(root,'sdk/catalog.json'),JSON.stringify({...catalog,modules:[{id:document.id,version:document.version}]}))
    expect(run('--write').stderr).toContain('Catalog entry needs addedAt')
    save()
    expect(run('--write').status).toBe(0)
    git('init','--quiet')
    git('add','.')
    git('-c','user.name=Publication test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Legacy publication fixture')
    // Existing publications remain readable while new media is being prepared.
    expect(run('--base','HEAD').status).toBe(0)
    put(impactsPath,JSON.stringify({schemaVersion:1,modules:[]}))
    expect(failure()).toContain('Initial resource estimates are pinned')
    put(impactsPath,impactBytes)
    put(baselinePath,JSON.stringify({...baseline,modules:[{...baseline.modules[0],folderSha256:'f'.repeat(64)}]}))
    expect(failure()).toContain('baseline is frozen')
    put(baselinePath,baselineBytes)
    put(resolve(folder,'README.md'),'Documentation update\n')
    // Documentation needs no version bump (owner decision, 5 October 2026); it does end the frozen baseline's exact-folder exemption.
    expect(failure()).not.toContain('greater module version')
    // Code does.
    put(resolve(folder,'manifest.py'),'raise AssertionError("module source must never execute")\n# changed\n')
    expect(failure()).toContain('greater module version')
    document.version='0.1.1'
    catalog.modules[0].version=document.version
    save()
    expect(failure()).toContain('actual screenshots')
    const path='media/ui.png'
    document.access.screenshots=[path]
    // Synthetic image fixture exercises file validation, not authenticity review.
    const media={path,captureType:'emulator',caption:'Fixture location and controls',alt:'Fixture LCD',credit:'Test fixture',license:'CC0-1.0',source:'original',otUi:{page:'FX1 SETUP',shows:'location-and-controls',firmware:'1.40C',moduleVersion:'0.1.0',imageSha256:'a'.repeat(64),setup:'Synthetic metadata fixture'}}
    const withMedia={...document,media:[media]}
    const saveMedia=()=>{save();put(resolve(folder,'octamod.module.json'),JSON.stringify(withMedia))}
    mkdirSync(resolve(folder,'media'))
    writeFileSync(resolve(folder,path),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64'))
    saveMedia()
    expect(failure()).toContain('this module version')
    media.otUi.moduleVersion=document.version
    saveMedia()
    expect(failure()).toContain('worst-case cycles, exact memory and hardware')
    // These requirements also apply without a Git base (local and release builds).
    expect(run('--write').stderr).toContain('publication requires')
    const q=qualificationFixture();q.moduleVersion=document.version
    put(resolve(folder,'README.md'),qualificationReadme)
    const qualified={...withMedia,tests:{...withMedia.tests,hardwareStatus:'verified',qualification:q}}
    q.sourceSha256=await moduleNativeSourceSha256(folder,parseModuleDocument(qualified))
    put(resolve(folder,'octamod.module.json'),JSON.stringify(qualified))
    expect(run('--write').stderr).toContain('release requires populated CPU, DSP core and memory gauges')
    const withImpact={...qualified,resources:{...qualified.resources,impact:resourceImpactFixture()}}
    put(resolve(folder,'octamod.module.json'),JSON.stringify(withImpact))
    expect(run('--base','HEAD','--write').status).toBe(0)
    // Updating executable source invalidates the tested-source identity.
    put(resolve(folder,'manifest.py'),'raise AssertionError("changed module must never execute")')
    expect(failure()).toContain('source SHA-256 differs')
    // A pre-existing draft folder newly added to the catalog must also qualify.
    git('reset','--hard','HEAD')
    git('clean','-fd')
    document.version='0.1.0'
    document.access.screenshots=[]
    catalog.modules=[]
    save()
    expect(run('--write').status).toBe(0)
    git('add','.')
    git('-c','user.name=Publication test','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Unpublished draft fixture')
    catalog.modules=[{id:document.id,version:document.version,addedAt:'2026-10-05T12:00:00Z'}]
    save()
    expect(failure()).toContain('actual screenshots')
  } finally { rmSync(root,{recursive:true,force:true}) }
},15000)
