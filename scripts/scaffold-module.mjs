import { readFile, mkdir, readdir, copyFile, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
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
if(!id||!['dsp','coldfire'].includes(kind)||!author)throw new Error('Usage: npm run module:new -- my-filter --kind dsp|coldfire --author github-login')
const document=JSON.parse(await readFile(resolve(root,'public/module-repository.example.json'),'utf8'))
document.id=id;document.key=id.toUpperCase().replaceAll('-',' ');document.name=id.split('-').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' ');document.author={github:author,credits:[author]}
if(kind==='coldfire'){document.category='playback';document.compatibility.location='Flex / Static';document.compatibility.effectId=null;document.controls=[]}
parseModuleDocument(document)
// A new Octatrack module starts as a draft: sdk/octatrack/modules/ holds listed modules, and a draft there would block catalogue generation
// for everyone. module:dev and module:doctor --draft stage it where the builders look while they run.
const destination=output?resolve(output,id):resolve(root,'sdk/drafts',id)
if(!output)try{await access(resolve(root,'sdk/octatrack/modules',id));throw new Error('A listed module is already called '+id+': update it (docs/MODULE_AUTHOR_UPDATES.md) or pick another id.')}catch(error){if(error.code!=='ENOENT')throw error}
try{await access(destination);throw new Error('Destination exists; refusing to replace a module: '+destination)}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(destination,{recursive:true});await mkdir(resolve(destination,'media'))
const template=resolve(root,'sdk/templates',kind),placeholder=kind==='dsp'?'_template':'_template_cf'
for(const file of await readdir(template)){if(file==='manifest.py'){let source=await readFile(resolve(template,file),'utf8');source=source.replaceAll('__AUTHOR__',author).replaceAll(placeholder,id).replaceAll(kind==='dsp'?'TEMPLATE':'TEMPLATE CF',document.key).replace('abbr=b"TMPL"','abbr=b"'+document.key.replace(/[^A-Z0-9]/g,'').slice(0,4)+'"').replace('fullname=b"Template"','fullname=b"'+document.name.slice(0,12)+'"');await writeFile(resolve(destination,file),source)}else await copyFile(resolve(template,file),resolve(destination,file))}
await writeFile(resolve(destination,'octamod.module.json'),JSON.stringify(document,null,2)+'\n')
await copyFile(resolve(root,'sdk/octabam/LICENSE'),resolve(destination,'LICENSE'))
await copyFile(resolve(root,'public/module-qualification.example.json'),resolve(destination,'qualification.example.json'))
await copyFile(resolve(root,'public/module-resource-impact.example.json'),resolve(destination,'resource-impact.example.json'))
// A draft's README and TESTING.md: the headings a listed module needs (scripts/module-documentation.mjs), one line each. What a release
// needs beyond that, module:doctor -- --draft <id> --release lists, with the fix for each.
await writeFile(resolve(destination,'README.md'),`# ${document.name}\n\nVersion ${document.version} · by @${author} · a draft, not tested yet.\n\n## Overview\n\nWhat it does to the sound or the workflow, in two or three sentences.\n\n## Controls\n\nEach control: its name, range and default, and what it does. Keep the controls in octamod.module.json the same.\n\n## Usage\n\nWhere a musician finds it on the unit, key by key.\n\n## Quick tutorial\n\n1. Set it up.\n2. Change a control and hear what it does.\n3. Get back to where you started.\n\n## Compatibility and limitations\n\nWhat it cannot run beside, and why. Not known yet.\n\n## Tests and measurements\n\nSee [TESTING.md](TESTING.md).\n\n## Authorship and licences\n\nYour own code under the licence in LICENSE. Name anyone whose work it builds on.\n\n## Screens and audio\n\nNone yet.\n\n## Develop\n\n- Hear it: \`npm run module:dev -- ${id}\` builds it and tries it on your unit over USB; \`--watch\` does that again on every save.\n- Check it: \`npm run module:doctor -- --draft ${id}\`. Its experimental lines must be green to share the draft; its release lines say what listing it needs.\n- Before you write ${kind==='dsp'?'DSP':'ColdFire'} code: the traps in sdk/octabam/AGENTS.md, and docs/OCTATRACK_API.md for the hooks a module can use.\n`)
await writeFile(resolve(destination,'TESTING.md'),`# ${document.name} testing\n\nRecord what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.\n\n## On the unit\n\nNot tested.\n\n## Stock flows\n\nNot tested. List the stock flows you compared with and without the module (docs/module-guides/README.md, Leave stock flows alone).\n\n${document.category==='effects'?'## Sound quality\n\nNot tested. npm run fx:audit checks aliasing, DC, clipping and idle behaviour (docs/module-guides/effects.md, Sound quality).\n\n':''}## Performance\n\nNot measured. Listing it needs evidence/performance.json: npm run perf:audit -- template ${kind==='coldfire'?'coldfire':'dsp'} (docs/MODULE_PERFORMANCE.md).\n`)
console.log('Created '+destination+(output?'':'\nIt is a draft: it stays out of the library until it is listed.')+'\nHear it on your unit: npm run module:dev -- '+id+' (add --watch to rebuild and try again on every save)\nCheck it: npm run module:doctor -- --draft '+id+'\nRead docs/module-guides/'+document.category+'.md first (set the manifest category to what the module is), and docs/module-guides/sequencing.md if it acts in time.')
await claimModule()
