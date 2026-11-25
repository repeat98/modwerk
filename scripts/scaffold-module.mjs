import { readFile, mkdir, readdir, copyFile, writeFile, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
import { freeFx2Ids } from './module-list.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),id=args[0]
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]}
const kind=option('--kind','dsp'),author=option('--author',''),output=option('--output',null)
const machine=option('--machine','octatrack')
// The agent board (docs/AGENT_BOARD.md): stop before writing anything when someone else has claimed this module; claim it once it exists.
// Questions and findings on the module or its machine are printed for the developer to read before planning.
const board=await import('./agent-board.mjs'),boardKey=machine+'/'+id,{claims,login,unavailable,messages}=id?await board.boardSnapshot({kind:'module',key:boardKey},{messages:{machine}}):{claims:[]}
if(claims[0]&&claims[0].holder!==login?.toLowerCase())throw new Error('Module '+boardKey+' is claimed by '+board.describeClaim(claims[0])+' on the agent board. Ask them yourself before you start (npm run board -- ask module '+boardKey+' "…"), or pick another module (docs/AGENT_BOARD.md).'+(login?'':' If that is you, run npm run board -- login first.'))
async function claimModule(){
  const said=board.moduleMessagesLine({machine,id,messages,login});if(said)console.log('Board: '+said.detail+'. Read them before you plan.')
  if(unavailable)return console.log('Board: not claimed. '+unavailable+' Once it answers: npm run board -- claim module '+boardKey)
  if(!login)return console.log('Board: sign in once with npm run board -- login, then claim it so nobody else starts the same module: npm run board -- claim module '+boardKey)
  try{const result=await board.claim({kind:'module',key:boardKey,branch:board.currentBranch(root)});console.log('Board: '+(result.renewed?'renewed your claim on':'claimed')+' module '+boardKey+' for @'+login+'.')}catch(error){console.log('Board: could not claim module '+boardKey+': '+error.message)}
}
if(machine!=='octatrack'){
  // Machines on contract v3 scaffold from sdk/templates/<platform> with the machine profile's releases and core: elemod
  // (source and build.json here), or zdl (a Zoom effect file built and released in its author's repository).
  const {parseMachineProfile}=await import('../src/devices/machine-contract.ts'),{parseModwerkModule,parseElemodBuild}=await import('../src/catalog/module-contract-v3.ts')
  if(!id||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)||!author)throw new Error('Usage: npm run module:new -- my-mod --machine '+machine+' --author github-login')
  const profile=parseMachineProfile(JSON.parse(await readFile(resolve(root,'sdk/machines',machine,'machine.json'),'utf8')))
  const platform=profile.sdk?.platform
  if(platform!=='elemod'&&platform!=='zdl')throw new Error(profile.name+' has no module SDK yet; see docs/ADD_A_MACHINE.md')
  const name=id.split('-').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' '),release=profile.firmware.releases.at(-1).version
  // A Zoom effect's name on the pedal: at most 8 letters or digits, then .ZDL.
  const effectFile=name.replace(/[^A-Za-z0-9]/g,'').slice(0,8)+'.ZDL'
  const fill=text=>text.replaceAll('__ID__',id).replaceAll('__NAME__',name).replaceAll('__KEY__',id.toUpperCase().replaceAll('-',' ')).replaceAll('__MACHINE_NAME__',profile.name).replaceAll('__MACHINE__',machine).replaceAll('__AUTHOR__',author).replaceAll('__RELEASE__',release).replaceAll('__CORE__',profile.sdk.core?.version??'1.0').replaceAll('__FILE__',effectFile).replaceAll('__YEAR__',String(new Date().getFullYear()))
  const destination=output?resolve(output,id):resolve(root,profile.sdk.modules,id),template=resolve(root,'sdk/templates',platform)
  try{await access(destination);throw new Error('Destination exists; refusing to replace a module: '+destination)}catch(error){if(error.code!=='ENOENT')throw error}
  const document=parseModwerkModule(JSON.parse(fill(await readFile(resolve(template,'modwerk.module.json'),'utf8'))),[profile])
  if(platform==='elemod')parseElemodBuild(JSON.parse(fill(await readFile(resolve(template,'build.json'),'utf8'))),document)
  await mkdir(resolve(destination,'media'),{recursive:true})
  if(platform==='elemod')await mkdir(resolve(destination,'src'))
  for(const file of platform==='elemod'?['modwerk.module.json','build.json','src/main.c','media/thumbnail.svg']:['modwerk.module.json','media/thumbnail.svg','LICENSE'])await writeFile(resolve(destination,file),fill(await readFile(resolve(template,file),'utf8')))
  if(platform==='elemod')await copyFile(resolve(root,'LICENSES/GPL-3.0-or-later.txt'),resolve(destination,'LICENSE'))
  await writeFile(resolve(destination,'README.md'),platform==='zdl'
    ?`# ${name}\n\nA ${profile.name} effect by @${author}. Version ${document.version}.\n\nDescribe what it does, every control, where it goes in a patch, and a short tutorial. Build and release it as "Create an effect" in ${profile.sdk.guide} says, then fill in platform.binary from the release. Follow docs/ADD_A_MODULE.md, docs/module-guides/effects.md, docs/SDK.md and docs/ZDL_MODULE_CONTRACT.md.\n`
    :`# ${name}\n\nA ${profile.name} mod by @${author}. Version ${document.version}.\n\nDescribe what it does, every control, how to reach it on the unit, and a short tutorial. Follow docs/ADD_A_MODULE.md, the guide for this mod's category in docs/module-guides/ (and sequencing.md if it acts in time), docs/SDK.md and the ${profile.name} guide (${profile.sdk.guide}).\n`)
  await writeFile(resolve(destination,'TESTING.md'),`# ${name} testing\n\nNo checks have been run. For each tier in docs/SDK.md, record the source commit, the exact build, the OS release, the machine model and every result. Keep firmware, dumps and build outputs out of this folder.\n`)
  console.log('Created '+destination+'\n'+(platform==='zdl'
    ?'Build and release the effect as "Create an effect" in '+profile.sdk.guide+' says, fill in platform (file, effect ID, version, DSP cost, the release), then npm run zdl:vendor -- '+id+'. Add screenshots of its screen and raise evidence.tier with actual reports (docs/SDK.md). Run npm run module:doctor -- '+id+' until it is green.'
    :'Read the guide for the mod\'s category in docs/module-guides/ first (and sequencing.md if it acts in time). Implement src/, measure memory and load, add real screenshots, then raise evidence.tier with actual reports (docs/SDK.md). Run npm run module:doctor -- '+id+' until it is green.'))
  await claimModule()
  process.exit(0)
}
// MIT for a new Octatrack module, held by its author (the GitHub login until they put their name), and what it does not cover.
const mitLicence=holder=>`MIT License

Copyright (c) ${new Date().getUTCFullYear()} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

This licence covers this module's own source code and documentation only. It
does not extend to any Elektron Music Machines firmware, which is not
distributed here and remains the property of its copyright holder. Nothing in
this module is endorsed by, supported by, or affiliated with Elektron.
Octatrack and Elektron are trademarks of Elektron Music Machines MAV AB, used
only to identify the hardware this module targets.
`
if(!id||!['dsp','coldfire'].includes(kind)||!author)throw new Error('Usage: npm run module:new -- my-filter --kind dsp|coldfire --author github-login [--port airwindows --upstream <plugin folder>]')
// A port starts from upstream's own files at the commit checked out: --port airwindows --upstream <plugin folder in a clone>.
const port=option('--port',null),upstreamFolder=option('--upstream',null)
if((port||upstreamFolder)&&(kind!=='dsp'||port!=='airwindows'||!upstreamFolder))throw new Error('Usage: npm run module:new -- my-port --kind dsp --port airwindows --upstream <clone>/plugins/LinuxVST/src/<Plugin> --author github-login')
const document=JSON.parse(await readFile(resolve(root,'public/module-repository.example.json'),'utf8'))
document.id=id;document.key=id.toUpperCase().replaceAll('-',' ');document.name=id.split('-').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' ');document.author={github:author,credits:[author]}
if(kind==='coldfire'){document.category='playback';document.compatibility.location='Flex / Static';document.compatibility.effectId=null;document.controls=[]}
parseModuleDocument(document)
const upstream=port?readUpstream(resolve(upstreamFolder)):null
if(upstream){
  document.source={repository:'https://github.com/airwindows/airwindows',revision:upstream.revision,path:upstream.path}
  document.author.credits=['Chris Johnson / Airwindows: original '+upstream.name+' algorithm and MIT-licensed source']
  document.license.declaration='Chris Johnson\'s published '+upstream.name+' source and his full MIT copyright and permission notice are retained in upstream/ and LICENSE; the Octatrack adaptation is distributed under the same terms. No desktop binary, firmware, extracted stock routine or table, or memory dump is included.'
  parseModuleDocument(document)
}
/** Upstream's files for a port, read from Git at HEAD (never the working tree), so the draft holds exactly one commit's bytes. */
function readUpstream(folder){
  const git=(...args)=>execFileSync('git',['-C',folder,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  let top,prefix,revision
  try{top=git('rev-parse','--show-toplevel');prefix=git('rev-parse','--show-prefix').replace(/\/$/,'');revision=git('rev-parse','HEAD')}catch{throw new Error('--upstream '+folder+' is not a folder in a Git clone of github.com/airwindows/airwindows')}
  if(!prefix)throw new Error('--upstream names the repository itself; name the plugin\'s folder, such as plugins/LinuxVST/src/Mackity')
  const blob=(path,sha)=>{const bytes=execFileSync('git',['-C',top,'cat-file','blob',sha],{maxBuffer:4*1024*1024});return{sourcePath:path,sourceBytes:bytes.length,sourceGitBlob:sha,sourceSha256:createHash('sha256').update(bytes).digest('hex'),bytes}}
  const tree=path=>execFileSync('git',['-C',top,'ls-tree','-z','HEAD','--',path],{encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{const[meta,name]=line.split('\t'),[mode,type,sha]=meta.split(' ');return{mode,type,sha,name}})
  const files=tree(prefix+'/').filter(entry=>entry.type==='blob')
  if(!files.length)throw new Error(prefix+' holds no files at '+revision.slice(0,12)+': commit or check out the plugin first')
  if(files.some(entry=>entry.mode==='120000'))throw new Error(prefix+' holds a symbolic link; copy the files it points to by hand')
  if(files.length>40)throw new Error(prefix+' holds '+files.length+' files: name one plugin\'s folder')
  const [licence]=tree('LICENSE')
  if(!licence)throw new Error('No LICENSE at the top of '+top+' at '+revision.slice(0,12))
  const licenceFile=blob('LICENSE',licence.sha)
  if(!licenceFile.bytes.toString('utf8').startsWith('MIT License'))throw new Error(top+'/LICENSE is not the MIT licence Airwindows publishes under; ask before porting (MODDING_GUIDELINES.md)')
  return{revision,path:prefix,name:prefix.split('/').at(-1),licence:licenceFile,files:files.map(entry=>({...blob(entry.name,entry.sha),file:entry.name.split('/').at(-1)}))}
}
// A new Octatrack module starts as a draft: sdk/octatrack/modules/ holds listed modules, and a draft there would block catalogue generation
// for everyone. module:dev and module:doctor --draft stage it where the builders look while they run.
const destination=output?resolve(output,id):resolve(root,'sdk/drafts',id)
if(!output)try{await access(resolve(root,'sdk/octatrack/modules',id));throw new Error('A listed module is already called '+id+': update it (docs/MODULE_AUTHOR_UPDATES.md) or pick another id.')}catch(error){if(error.code!=='ENOENT')throw error}
try{await access(destination);throw new Error('Destination exists; refusing to replace a module: '+destination)}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(destination,{recursive:true});await mkdir(resolve(destination,'media'))
const template=resolve(root,'sdk/templates',kind),placeholder=kind==='dsp'?'_template':'_template_cf'
// The template's fx2_id is a placeholder; a draft takes the first id stock and the listed modules leave (module-list.mjs).
const NO_FX2_ID='No FX2 id is left: stock and the listed modules hold 0x04-0x1f, all the build takes. The draft keeps 0x0a, which clashes; a new effect waits until the build takes ids past 0x1f (docs/OCTATRACK_MORE_EFFECT_IDS.md). Ask the owner on Discord.'
for(const file of await readdir(template)){if(file==='manifest.py'){let source=await readFile(resolve(template,file),'utf8');source=source.replaceAll('__AUTHOR__',author).replaceAll(placeholder,id).replaceAll(kind==='dsp'?'TEMPLATE':'TEMPLATE CF',document.key).replace('abbr=b"TMPL"','abbr=b"'+document.key.replace(/[^A-Z0-9]/g,'').slice(0,4)+'"').replace('fullname=b"Template"','fullname=b"'+document.name.slice(0,12)+'"');if(kind==='dsp'){const[fx2]=freeFx2Ids(root);if(fx2)source=source.replace('fx2_id=0x0a,','fx2_id='+fx2+',');else console.error(NO_FX2_ID)}await writeFile(resolve(destination,file),source)}else await copyFile(resolve(template,file),resolve(destination,file))}
if(upstream){
  // A port's reference model, its host test and the gates on the shared harness (sdk/octatrack/tools/dsp_gate.py), over the dsp
  // template; upstream's files as they are at the pinned commit, and the import record a listing moves to sdk/imports/.
  const portTemplate=resolve(root,'sdk/templates/dsp-port'),fill=text=>text.replaceAll('__ID__',id).replaceAll('__NAME__',document.name).replaceAll('__UPSTREAM__',upstream.name).replaceAll('__REVISION__',upstream.revision)
  for(const entry of await readdir(portTemplate,{withFileTypes:true}))if(entry.isFile()&&entry.name!=='README.md'&&!entry.name.endsWith('.pyc'))await writeFile(resolve(destination,entry.name),fill(await readFile(resolve(portTemplate,entry.name),'utf8')))
  await mkdir(resolve(destination,'upstream'))
  const vendored=[...upstream.files,{...upstream.licence,file:'LICENSE'}]
  for(const item of vendored)await writeFile(resolve(destination,'upstream',item.file),item.bytes)
  await writeFile(resolve(destination,'import-record.json'),JSON.stringify({schemaVersion:1,repository:document.source.repository,revision:upstream.revision,moduleVersion:document.version,root:'sdk/octabam/modules/'+id,modules:[id],
    files:vendored.map(({file,sourcePath,sourceBytes,sourceGitBlob,sourceSha256})=>({path:'upstream/'+file,sourcePath,sourceBytes,sourceGitBlob,sourceSha256,vendoredSha256:sourceSha256}))},null,2)+'\n')
}
await writeFile(resolve(destination,'octamod.module.json'),JSON.stringify(document,null,2)+'\n')
// The author's own MIT licence, as the manifest declares (license.spdx). Octabam's LICENSE names Octabam's author and covers that
// repository, not a new module. A port keeps upstream's licence and its notice, as its manifest declares.
await writeFile(resolve(destination,'LICENSE'),upstream?upstream.licence.bytes:mitLicence(author))
await copyFile(resolve(root,'public/module-qualification.example.json'),resolve(destination,'qualification.example.json'))
await copyFile(resolve(root,'public/module-resource-impact.example.json'),resolve(destination,'resource-impact.example.json'))
// A draft's README and TESTING.md: the headings a listed module needs (scripts/module-documentation.mjs), one line each. What a release
// needs beyond that, module:doctor -- --draft <id> --release lists, with the fix for each.
await writeFile(resolve(destination,'README.md'),`# ${document.name}\n\nVersion ${document.version} · by @${author} · a draft, not tested yet.\n\n## Overview\n\nWhat it does to the sound or the workflow, in two or three sentences.\n\n## Controls\n\nEach control: its name, range and default, and what it does. Keep the controls in octamod.module.json the same.\n\n## Usage\n\nWhere a musician finds it on the unit, key by key.\n\n## Quick tutorial\n\n1. Set it up.\n2. Change a control and hear what it does.\n3. Get back to where you started.\n\n## Compatibility and limitations\n\nWhat it cannot run beside, and why. Not known yet.\n\n## Tests and measurements\n\nSee [TESTING.md](TESTING.md).\n\n## Authorship and licences\n\n${upstream?`A port of Chris Johnson's Airwindows ${upstream.name} (MIT), from ${document.source.repository} at ${upstream.revision}, ${upstream.path}; his files are in upstream/ and his licence in LICENSE.`:'Your own code under the licence in LICENSE. Name anyone whose work it builds on.'}\n\n## Screens and audio\n\nNone yet.\n\n## Develop\n\n${upstream?`- Port it: upstream's algorithm into reference.py's float_model, then engine.asm and reference.Model side by side; \`python3 -B test_reference.py\` holds the model to upstream (no tools), \`python3 -B verify.py\` the assembly to the model in dsp_host, \`python3 -B perf.py\` measures it. Both fail until reference.PORTED is True. sdk/octatrack/modules/mackity/ is a finished port; sdk/templates/dsp-port/README.md says what each file is.\n`:''}- Hear it: \`npm run module:dev -- ${id}\` builds it and tries it on your unit over USB; \`--watch\` does that again on every save.\n- Check it: \`npm run module:doctor -- --draft ${id}\`. Its experimental lines must be green to share the draft; its release lines say what listing it needs.\n- Before you write ${kind==='dsp'?'DSP':'ColdFire'} code: the traps in sdk/octabam/AGENTS.md, and docs/OCTATRACK_API.md for the hooks a module can use.\n`)
await writeFile(resolve(destination,'TESTING.md'),`# ${document.name} testing\n\nRecord what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.\n\n## On the unit\n\nNot tested.\n\n## Stock flows\n\nNot tested. List the stock flows you compared with and without the module (docs/module-guides/README.md, Leave stock flows alone).\n\n${document.category==='effects'?'## Sound quality\n\nNot tested. npm run fx:audit checks aliasing, DC, clipping and idle behaviour (docs/module-guides/effects.md, Sound quality).\n\n':''}## Performance\n\nNot measured. Listing it needs evidence/performance.json: npm run perf:audit -- template ${kind==='coldfire'?'coldfire':'dsp'} (docs/MODULE_PERFORMANCE.md).\n`)
console.log('Created '+destination+(output?'':'\nIt is a draft: it stays out of the library until it is listed.')+(upstream?'\nUpstream: '+upstream.files.length+' files of '+upstream.path+' and its LICENSE at '+upstream.revision.slice(0,12)+' in upstream/, recorded in import-record.json. Port it as README.md says (Develop).':'')+'\nHear it on your unit: npm run module:dev -- '+id+' (add --watch to rebuild and try again on every save)\nCheck it: npm run module:doctor -- --draft '+id+'\nRead docs/module-guides/'+document.category+'.md first (set the manifest category to what the module is), and docs/module-guides/sequencing.md if it acts in time.')
await claimModule()
