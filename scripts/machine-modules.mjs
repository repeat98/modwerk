// SPDX-License-Identifier: GPL-3.0-or-later
// Standalone validation/generation for the elemod source catalogue. Publication gates are unchanged.
import { readFileSync } from 'node:fs'
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { isDocumentationChange } from './change-scope.mjs'
import { loadElemodDependencies, dependencyCollections } from './elemod-dependencies.mjs'
import { requireModwerkDocumentation } from './module-documentation.mjs'
import { resolveModuleFile as file } from '../src/catalog/module-folder.ts'
import { parseMachineProfile } from '../src/devices/machine-contract.ts'
import { parseElemodBuild, parseModwerkModule, requireModwerkPublication } from '../src/catalog/module-contract-v3.ts'
import { compareModuleVersions } from '../src/catalog/versions.ts'
const json=async path=>JSON.parse(await readFile(path,'utf8'))
async function walk(folder){const paths=[];for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.name==='__pycache__')continue;if(entry.isSymbolicLink())throw new Error('Module symlinks are not allowed: '+entry.name);if(entry.isDirectory())paths.push(...(await walk(resolve(folder,entry.name))).map(p=>entry.name+'/'+p));else paths.push(entry.name)}return paths.sort()}
export async function machineModules({root,write=false,baseCommit=null,includeDrafts=false}) {
if(includeDrafts&&write)throw new Error('Draft validation cannot publish generated library metadata')
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024})
// Machines on module contract v3 (elemod): the same folder rules, checked against each machine profile.
const machineProfiles=[]
// Repositories without machine profiles (such as minimal test fixtures) have no elemod machines.
for(const entry of await readdir(resolve(root,'sdk/machines'),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error}))if(entry.isDirectory())machineProfiles.push(parseMachineProfile(await json(resolve(root,'sdk/machines',entry.name,'machine.json'))))
let machineModules=0
const machineDocuments=[]
for(const machine of machineProfiles.filter(profile=>profile.sdk?.platform==='elemod')){
 const folderRoot=resolve(root,machine.sdk.modules),published=machine.sdk.catalog?(await json(resolve(root,machine.sdk.catalog))).modules:[]
 const dependencies=await loadElemodDependencies(root,machine)
 const roots=[folderRoot,...(includeDrafts?[resolve(folderRoot,'_submissions')]:[])]
 const entries=[]
 for(const dir of roots)for(const entry of await readdir(dir,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT'&&dir!==folderRoot)return [];throw error}))entries.push({entry,dir})
 // User-visible modules may also provide tables; include forward dependencies.
 for(const {entry,dir} of entries){
  if(!entry.isDirectory()||entry.name.startsWith('_'))continue
  if(dependencies.has(entry.name))throw new Error('Module duplicates a dependency: '+entry.name)
  const folder=resolve(dir,entry.name),document=parseModwerkModule(await json(await file(folder,'modwerk.module.json')),machineProfiles)
  dependencies.set(entry.name,{folder,document,build:parseElemodBuild(await json(await file(folder,document.platform.build)),document)})
 }
 const core=machine.sdk.core?.path?await json(resolve(root,machine.sdk.core.path,'interface.json')):null
 for(const {entry,dir} of entries){
  if(!entry.isDirectory()||entry.name.startsWith('_'))continue
  const folder=resolve(dir,entry.name),label=machine.id+'/'+entry.name;let document
  try{document=parseModwerkModule(await json(resolve(folder,'modwerk.module.json')),machineProfiles)}catch(error){throw new Error(label+': '+error.message,{cause:error})}
  if(document.id!==entry.name||document.machine!==machine.id)throw new Error(label+': module id and machine must match its folder')
  if(baseCommit){
   const prefix=dir.slice(root.length+1)+'/'+entry.name+'/',oldPath=prefix+'modwerk.module.json'
   const changedPaths=(git('diff','--name-only',baseCommit,'--',prefix)+git('ls-files','--others','--exclude-standard','--',prefix)).trim().split('\n').filter(Boolean),changed=changedPaths.length>0
   if(changed&&!document.tests.documentation)throw new Error(label+': new and updated modules require complete documentation, tutorial and capture provenance')
   if(git('ls-tree','--name-only',baseCommit,'--',oldPath).trim()===oldPath){const old=JSON.parse(git('show',baseCommit+':'+oldPath));const codeChanged=changedPaths.some(path=>!isDocumentationChange({path,before:path===oldPath?JSON.stringify(old):'',after:path===oldPath?readFileSync(resolve(folder,'modwerk.module.json'),'utf8'):''}));if(codeChanged&&compareModuleVersions(document.version,old.version)<=0)throw new Error(label+': every code or behaviour update requires a greater module version than '+old.version+'; documentation and media edits do not')}
  }
  const build=parseElemodBuild(await json(await file(folder,document.platform.build)),document)
  // Modules may use only what their machine's core interface provides.
  if(core){const events=new Set(core.events.map(event=>event.name)),tables=new Set([...core.tables.map(table=>table.name),...dependencyCollections(document,build,dependencies)])
   for(const entry of build.subscribe)if(!events.has(entry.event)&&!tables.has(entry.event))throw new Error(label+': '+entry.event+' is not an event of the '+machine.name+' core interface '+core.interface)
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
else if(!includeDrafts&&(await readFile(machineTarget,'utf8').catch(()=>''))!==machineGenerated&&machineDocuments.length)throw new Error('src/catalog/machine-modules.json is stale; run npm run modules:generate')
return machineModules
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),i=args.indexOf('--base')
 if(i>=0&&!args[i+1])throw new Error('--base requires a ref')
 const baseCommit=i<0?null:execFileSync('git',['rev-parse','--verify',args[i+1]+'^{commit}'],{cwd:root,encoding:'utf8'}).trim()
 console.log('Validated '+await machineModules({root,write:args.includes('--write'),baseCommit,includeDrafts:args.includes('--drafts')})+' elemod module folders')
}
