import { isDocumentationChange } from './change-scope.mjs'
import { requireModwerkDocumentation } from './module-documentation.mjs'
import { readFileSync } from 'node:fs'
import { readFile, readdir, mkdir, writeFile, copyFile, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parseModuleDocument, requireModuleUiForPublication } from '../src/catalog/module-contract.ts'
import { compareModuleVersions } from '../src/catalog/versions.ts'
import { isDocumentationPath, manifestBuildFields } from './module-source.mjs'
import { resolveModuleFile as file } from '../src/catalog/module-folder.ts'
import { BASELINE_PATH, WAIVERS_PATH, parseQualificationBaseline, parseReleaseWaivers, qualificationReports, requireFolderQualification } from './module-qualification.mjs'
import { parseRetainedResourceImpacts, requireModuleResourceImpact } from '../src/catalog/resource-impact.ts'
import { parseMachineProfile } from '../src/devices/machine-contract.ts'
import { parseElemodBuild, parseModwerkModule, requireModwerkPublication } from '../src/catalog/module-contract-v3.ts'
import { compactChecks, passingPairs } from '../src/catalog/compatibility-checks.ts'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),modules=resolve(root,'sdk/octabam/modules')
const args=process.argv.slice(2),write=args.includes('--write'),baseIndex=args.indexOf('--base'),base=baseIndex<0?null:args[baseIndex+1]
if(baseIndex>=0&&!base)throw new Error('--base requires a Git commit/ref')
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024})
const baseCommit=base?git('rev-parse','--verify',base+'^{commit}').trim():null
const baseCatalogExists=baseCommit&&git('ls-tree','--name-only',baseCommit,'--','sdk/catalog.json').trim()==='sdk/catalog.json'
const previouslyIncluded=baseCommit?new Set(baseCatalogExists?JSON.parse(git('show',baseCommit+':sdk/catalog.json')).modules.map(item=>item.id):[]):null
const json=async path=>JSON.parse(await readFile(path,'utf8'))
const baselineBytes=await readFile(resolve(root,BASELINE_PATH),'utf8'),baseline=parseQualificationBaseline(JSON.parse(baselineBytes))
const waiverBytes=await readFile(resolve(root,WAIVERS_PATH),'utf8'),waivers=parseReleaseWaivers(JSON.parse(waiverBytes))
if(baseCommit&&git('ls-tree','--name-only',baseCommit,'--',WAIVERS_PATH).trim()===WAIVERS_PATH&&git('show',baseCommit+':'+WAIVERS_PATH)!==waiverBytes)throw new Error('Owner utility release waivers are frozen to the two approved versions; updates require full qualification.')
if(baseCommit&&git('ls-tree','--name-only',baseCommit,'--',BASELINE_PATH).trim()===BASELINE_PATH&&git('show',baseCommit+':'+BASELINE_PATH)!==baselineBytes)throw new Error('The existing-module qualification baseline is frozen; new modules and updates must supply qualification evidence, never expand or rewrite exemptions.')
const impactsPath='sdk/module-resource-estimates.json',impactBytes=await readFile(resolve(root,impactsPath),'utf8'),impacts=parseRetainedResourceImpacts(JSON.parse(impactBytes),[...baseline.values()])
if(baseCommit&&git('ls-tree','--name-only',baseCommit,'--',impactsPath).trim()===impactsPath&&git('show',baseCommit+':'+impactsPath)!==impactBytes)throw new Error('Initial resource estimates are pinned to the frozen existing versions; updates require a greater module version and resources.impact in the module manifest.')
async function walk(folder){const paths=[];for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.name==='__pycache__')continue;if(entry.isSymbolicLink())throw new Error('Module symlinks are not allowed: '+entry.name);if(entry.isDirectory())paths.push(...(await walk(resolve(folder,entry.name))).map(p=>entry.name+'/'+p));else paths.push(entry.name)}return paths.sort()}
const documents=new Map()
for(const entry of await readdir(modules,{withFileTypes:true})){
 if(entry.name.startsWith('_')||!entry.isDirectory())continue
 const folder=resolve(modules,entry.name);let document,needsPublicationUi=false
 try{document=parseModuleDocument(await json(resolve(folder,'octamod.module.json')))}catch(error){throw new Error(entry.name+': '+error.message,{cause:error})}
 if(document.id!==entry.name)throw new Error('Module ID must match its folder: '+entry.name)
 for(const path of [document.nativeManifest,'README.md',document.tests.report,document.license.file,document.resources.storage.source,document.resources.processing.source,...qualificationReports(document)])await file(folder,path)
 for(const path of await walk(folder))if(/\.(bin|syx|exe|dll|so|dylib|zip)$/i.test(path))throw new Error('Prohibited firmware/binary file: '+document.id+'/'+path)
 for(const item of document.media){const target=await file(folder,item.path),bytes=await readFile(target),max=(item.captureType==='audio'?12:5)*1024*1024;if(bytes.length<12||bytes.length>max)throw new Error(item.path+': invalid media size');const image=(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes[0]===255&&bytes[1]===216&&bytes[2]===255||bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');const audio=(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'||bytes.toString('ascii',0,4)==='OggS'||bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224);if(item.captureType==='audio'?!audio:!image)throw new Error(item.path+': media signature/type differs')}
 if(baseCommit){const prefix='sdk/octabam/modules/'+entry.name+'/';const oldPath=prefix+'octamod.module.json';const existed=git('ls-tree','--name-only',baseCommit,'--',oldPath).trim()===oldPath;const old=existed?parseModuleDocument(JSON.parse(git('show',baseCommit+':'+oldPath))):null;const changedPaths=(git('diff','--name-only',baseCommit,'--',prefix)+git('ls-files','--others','--exclude-standard','--',prefix)).split('\n').filter(Boolean),changed=changedPaths.length>0;const codeChanged=changedPaths.some(path=>path===oldPath?!old||manifestBuildFields(git('show',baseCommit+':'+oldPath))!==manifestBuildFields(readFileSync(resolve(folder,'octamod.module.json'),'utf8')):!isDocumentationPath('modules/'+entry.name+'/'+path.slice(prefix.length)));if(old&&codeChanged&&compareModuleVersions(document.version,old.version)<=0)throw new Error(document.id+': every code change (source, native manifest, build fields) requires a greater module version than '+old.version+'; documentation and media edits do not');needsPublicationUi=(!old||changed)&&!document.tests.retainedEvidence}
 let qualification
 try {qualification=await requireFolderQualification(folder,document,baseline,waivers,{root,...(baseCommit?{approvedRef:baseCommit}:{})})}
 catch(error){if(needsPublicationUi)requireModuleUiForPublication(document);throw error}
 if(needsPublicationUi&&qualification!=='owner-approved-update')requireModuleUiForPublication(document)
 const impact=requireModuleResourceImpact(document,['retained','retained-evidence'].includes(qualification)?impacts:undefined,qualification==='retained-evidence'?document.tests.retainedEvidence.moduleVersion:undefined)
 if(qualification==='retained-evidence')console.log(document.id+': retained evidence from '+document.tests.retainedEvidence.moduleVersion+'; runtime and resource inputs unchanged; no new native/hardware qualification required')
 for(const key of ['cpu','dsp','memory'])if(!(await readFile(await file(folder,impact[key].source),'utf8')).trim())throw new Error(document.id+': resource estimate source must be a nonempty local text record')
 document={...document,resources:{...document.resources,impact}}
 documents.set(document.id,document)
}
const catalog=await json(resolve(root,'sdk/catalog.json'))
if(catalog.schemaVersion!==1||!Array.isArray(catalog.modules)||!/^[a-f0-9]{40}$/.test(catalog.sourceRevision))throw new Error('Invalid SDK catalog pin')
const selected=[],seen=new Set()
for(const item of catalog.modules){const document=documents.get(item.id);if(!document||item.version!==document.version||seen.has(item.id))throw new Error('Catalog must pin each included module exactly once at its declared version: '+item.id);if(typeof item.addedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.addedAt)||!Number.isFinite(Date.parse(item.addedAt)))throw new Error('Catalog entry needs addedAt, the UTC time the module was first added (for example 2026-10-05T12:00:00Z): '+item.id);if(previouslyIncluded&&!previouslyIncluded.has(item.id))requireModuleUiForPublication(document);seen.add(item.id);selected.push(document)}
const generated=JSON.stringify({schemaVersion:2,revision:catalog.sourceRevision,modules:selected},null,2)+'\n',target=resolve(root,'src/catalog/module-documents.json')
if(write){await mkdir(dirname(target),{recursive:true});await writeFile(target,generated);const mediaRoot=resolve(root,'public/module-media');await rm(mediaRoot,{recursive:true,force:true});for(const document of selected){for(const item of document.media){const destination=resolve(mediaRoot,document.id,document.version,item.path);await mkdir(dirname(destination),{recursive:true});await copyFile(await file(resolve(modules,document.id),item.path),destination)}const thumbnail=await file(resolve(modules,document.id),'presentation/thumbnail.svg').catch(error=>{if(error.code==='ENOENT')return null;throw error});if(thumbnail){const destination=resolve(mediaRoot,document.id,document.version,'presentation/thumbnail.svg');await mkdir(dirname(destination),{recursive:true});await copyFile(thumbnail,destination)}}}else if(await readFile(target,'utf8')!==generated)throw new Error('Generated catalog is stale. Run npm run modules:generate and include it in the PR.')
// The site reads the native declaration checks in their compact form; the full record stays the exporters' file.
const compact=compactChecks(await json(resolve(root,'src/catalog/native-metadata.json')))
// Pair rules on every page read only the passing pairs; the full checks load with the compatibility panel and the firmware worker.
for(const [name,content] of [['compatibility-checks.json',compact],['compatibility-pairs.json',{revision:compact.revision,passing:passingPairs(compact)}]]){
 const target=resolve(root,'src/catalog',name),generated=JSON.stringify(content)+'\n'
 if(write)await writeFile(target,generated)
 else if((await readFile(target,'utf8').catch(()=>''))!==generated)throw new Error('src/catalog/'+name+' is stale; run npm run modules:generate')
}
// Machines on module contract v3 (elemod): the same folder rules, checked against each machine profile.
const machineProfiles=[]
// Repositories without machine profiles (such as minimal test fixtures) have no elemod machines.
for(const entry of await readdir(resolve(root,'sdk/machines'),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error}))if(entry.isDirectory())machineProfiles.push(parseMachineProfile(await json(resolve(root,'sdk/machines',entry.name,'machine.json'))))
let machineModules=0
const machineDocuments=[]
for(const machine of machineProfiles.filter(profile=>profile.sdk?.platform==='elemod')){
 const folderRoot=resolve(root,machine.sdk.modules),published=machine.sdk.catalog?(await json(resolve(root,machine.sdk.catalog))).modules:[]
 const core=machine.sdk.core?.path?await json(resolve(root,machine.sdk.core.path,'interface.json')):null
 for(const entry of await readdir(folderRoot,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name.startsWith('_'))continue
  const folder=resolve(folderRoot,entry.name),label=machine.id+'/'+entry.name;let document
  try{document=parseModwerkModule(await json(resolve(folder,'modwerk.module.json')),machineProfiles)}catch(error){throw new Error(label+': '+error.message,{cause:error})}
  if(document.id!==entry.name||document.machine!==machine.id)throw new Error(label+': module id and machine must match its folder')
  if(baseCommit){
   const prefix=machine.sdk.modules+'/'+entry.name+'/',oldPath=prefix+'modwerk.module.json'
   const changedPaths=(git('diff','--name-only',baseCommit,'--',prefix)+git('ls-files','--others','--exclude-standard','--',prefix)).trim().split('\n').filter(Boolean),changed=changedPaths.length>0
   if(changed&&!document.tests.documentation)throw new Error(label+': new and updated modules require complete documentation, tutorial and capture provenance')
   if(git('ls-tree','--name-only',baseCommit,'--',oldPath).trim()===oldPath){const old=JSON.parse(git('show',baseCommit+':'+oldPath));const codeChanged=changedPaths.some(path=>!isDocumentationChange({path,before:path===oldPath?JSON.stringify(old):'',after:path===oldPath?readFileSync(resolve(folder,'modwerk.module.json'),'utf8'):''}));if(codeChanged&&compareModuleVersions(document.version,old.version)<=0)throw new Error(label+': every code or behaviour update requires a greater module version than '+old.version+'; documentation and media edits do not')}
  }
  const build=parseElemodBuild(await json(await file(folder,document.platform.build)),document)
  // Modules may use only what their machine's core interface provides.
  if(core){const events=new Set(core.events.map(event=>event.name)),tables=new Set([...core.tables.map(table=>table.name),...Object.keys(build.collections)])
   for(const entry of build.subscribe)if(!events.has(entry.event))throw new Error(label+': '+entry.event+' is not an event of the '+machine.name+' core interface '+core.interface)
   for(const entry of build.contribute)if(!events.has(entry.to)&&!tables.has(entry.to))throw new Error(label+': '+entry.to+' is not a table of the '+machine.name+' core interface '+core.interface)}
  const media=document.media.map(item=>item.path),reports=document.evidence.reports
  for(const path of ['README.md',document.tests.report,document.license.file,...build.sources,...media,...reports])await readFile(await file(folder,path)).catch(()=>{throw new Error(label+': missing '+path)})
  await requireModwerkDocumentation(folder,document)
  for(const path of await walk(folder))if(/\.(bin|syx|elemod|exe|dll|so|dylib|zip|img|hex)$/i.test(path))throw new Error('Prohibited firmware/binary file: '+label+'/'+path)
  if(published.some(item=>item.id===document.id)){try{requireModwerkPublication(document)}catch(error){throw new Error(label+': '+error.message,{cause:error})}}
  if(write)for(const item of document.media){const destination=resolve(root,'public/module-media',machine.id+'-'+document.id,document.version,item.path);await mkdir(dirname(destination),{recursive:true});await copyFile(await file(folder,item.path),destination)}
  // Only addresses and lengths are needed by the planner; never include stock bytes.
  const patchSites=Object.fromEntries(Object.entries(build.releases).map(([release,value])=>[release,[...value.sites,...(build.derive?.releases.includes(release)?build.derive.callSites:[])].map(({addr,len})=>({addr,len}))]))
  machineDocuments.push({...document,patchSites});machineModules++
 }
}
// The website lists every machine's modules from the same validated folders.
machineDocuments.sort((a,b)=>a.machine.localeCompare(b.machine)||a.id.localeCompare(b.id))
const machineTarget=resolve(root,'src/catalog/machine-modules.json'),machineGenerated=JSON.stringify({schemaVersion:3,modules:machineDocuments},null,2)+'\n'
if(write)await writeFile(machineTarget,machineGenerated)
else if((await readFile(machineTarget,'utf8').catch(()=>''))!==machineGenerated&&machineDocuments.length)throw new Error('src/catalog/machine-modules.json is stale; run npm run modules:generate')
console.log('Validated '+documents.size+' Octatrack module folders and '+machineModules+' elemod module folders; '+selected.length+' version-pinned catalog entries; all CPU/DSP/memory gauges populated; two exact owner-waived utility versions retain untested hardware/unmeasured timing; worst-case cycles, exact memory, hardware test evidence and complete documentation/tutorial/screenshots required for new modules and runtime/resource changes; editorial updates may retain evidence from approved, byte-identical runtime inputs'+(baseCommit?'; version bumps and OT UI publication evidence checked against '+baseCommit:'.'))
