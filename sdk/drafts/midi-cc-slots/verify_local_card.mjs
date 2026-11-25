// SPDX-License-Identifier: GPL-3.0-or-later
// Historical C15 session verifier: use source revision e5b3a539.
// Current C16 site sessions are verified by verify_usb_installer_session.mjs.
// Private firmware inputs and outputs.
import assert from 'node:assert/strict'
import {Buffer} from 'node:buffer'
import {TextDecoder} from 'node:util'
import {execFileSync} from 'node:child_process'
import process from 'node:process'
import console from 'node:console'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
const [inputPath,directory,runtimeReceipt]=process.argv.slice(2)
if(!inputPath||!directory||!runtimeReceipt)throw new Error('Usage: node verify_local_card.mjs ORIGINAL.bin NEW-PRIVATE-OUTPUT RUNTIME-SYMBOLS.json')
const out=resolve(directory)
for(let p=out;;p=dirname(p)){if(existsSync(join(p,'.git')))throw new Error('Keep firmware outside Git');if(p===dirname(p))break}
assert(!existsSync(out));mkdirSync(out,{recursive:true,mode:0o700})
const original=new Uint8Array(readFileSync(inputPath)),hash=b=>createHash('sha256').update(b).digest('hex'),originalHash=hash(original)
const nativeFetch=globalThis.fetch
const resident=await nativeFetch('http://127.0.0.1:5173/__local/midi-cc-slots/card.json')
assert(resident.ok,await resident.clone().text());const residentBytes=new Uint8Array(await resident.arrayBuffer())
globalThis.fetch=async url=>String(url)==='/__local/midi-cc-slots/card.json'?new globalThis.Response(residentBytes):nativeFetch(url)
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',define:{'import.meta.env.VITE_LOCAL_CC_SLOTS':JSON.stringify('1')}})
try{
 const {createEngineSession}=await server.ssrLoadModule('/src/engine/session.ts')
 const {decodeFirmware}=await server.ssrLoadModule('/src/engine/elek.ts')
 const {planStaticOs}=await server.ssrLoadModule('/src/engine/static-compose.ts')
 const replies=[],handle=createEngineSession(r=>replies.push(r)),cases=[]
 await handle({id:1,type:'inspect',name:'OCTATRACK_OS1.40C.bin',buffer:original.slice().buffer})
 assert.equal(replies.at(-1).type,'inspection',JSON.stringify(replies.at(-1)))
 const companions=['sidechain-compressor','playmodes','mute-modes'];let id=2
 for(const mask of [7,0,1,2,3,4,5,6]){
  const moduleIds=['midi-cc-slots',...companions.filter((_,i)=>mask&(1<<i))]
  for(const startup of ['classic','docking']){
   const packed=mask===0||mask===7
   await handle({id:id++,type:packed?'build':'validate',moduleIds,keepStockFx2:true,startup})
   const reply=replies.at(-1);assert.equal(reply.type,packed?'built':'validated',JSON.stringify(reply))
   const bin=packed?new Uint8Array(reply.buffer):undefined;if(bin)assert.equal(hash(bin),reply.sha256);assert.equal(reply.report.version,'MIDI2 C15');assert.equal(reply.report.startupAnimation,startup)
   console.log('Verified '+moduleIds.join(' + ')+' / '+startup+(packed?' (packed)':''))
   cases.push({moduleIds,startup,...(bin?{sha256:hash(bin),mainSha256:hash(decodeFirmware(bin).mainOs)}:{}),runtimeBytes:reply.report.runtimeBytes,reservedBytes:reply.report.reservedBytes})
   if(mask===7&&startup==='docking'){
    const main=decodeFirmware(bin).mainOs,plan=await planStaticOs(decodeFirmware(original).mainOs,moduleIds,undefined,undefined,true)
    const pkg=JSON.parse(new TextDecoder().decode(residentBytes)),offset=plan.runtime.symbols.get(pkg.imageSymbol)
    assert(offset);assert(plan.platform.filter(w=>w.note.startsWith('resident')).length===27)
    // Independently link the exact new resident object with GNU, then compare
    // its complete text against the browser link after checked stock replay.
    const {parseColdFireObject}=await server.ssrLoadModule('/src/engine/coldfire-elf.ts')
    const objectBytes=Buffer.from(pkg.object,'hex'),object=parseColdFireObject(objectBytes),text=object.sections.find(s=>s.name==='.text')
    const at=plan.runtime.placements.get('resident-midi-cc-slots').get(text.index).address
    writeFileSync(join(out,'resident.o'),objectBytes)
    execFileSync('m68k-elf-ld',['-Ttext','0x'+at.toString(16),'-e','modwerk_card_core_tick','-o',join(out,'resident.elf'),join(out,'resident.o')])
    execFileSync('m68k-elf-objcopy',['-O','binary','--only-section','.text',join(out,'resident.elf'),join(out,'resident-text.private.bin')])
    const native=new Uint8Array(readFileSync(join(out,'resident-text.private.bin'))),stockMain=decodeFirmware(original).mainOs
    for(const copy of pkg.copies)native.set(stockMain.slice(copy.address-0x40000400,copy.address-0x40000400+copy.length),offset-at+copy.offset)
    assert.deepEqual(native,plan.runtime.bytes.slice(at-plan.runtime.base,at-plan.runtime.base+text.size))
    writeFileSync(join(out,'Midi-Mode-2-combined-test.bin'),bin);writeFileSync(join(out,'card-MAIN.private.bin'),main)
    writeFileSync(join(out,'runtime-symbols.json'),readFileSync(runtimeReceipt))
    // CardBench needs only the reviewed tick symbol's linked image offset.
    const symbols=JSON.parse(readFileSync(join(out,'runtime-symbols.json'))).symbols
    writeFileSync(join(out,'Midi-Mode-2-card-test.syx.map.json'),JSON.stringify({midi_mode2_tick:'0x'+(offset+symbols.mm_profile_tick).toString(16)}))
    writeFileSync(join(out,'card-build.json'),JSON.stringify({version:pkg.version,firmwareLabel:pkg.firmwareLabel,sha256:hash(bin),moduleIds,implementationSha256:pkg.implementationSha256,hardware:'not tested'}))
   }
  }
 }
 await handle({id:id++,type:'validate',moduleIds:['midi-cc-slots','tapehead'],keepStockFx2:true})
 assert.equal(replies.at(-1).type,'error');assert.match(replies.at(-1).message,/not been checked/)
 assert.equal(hash(readFileSync(inputPath)),originalHash)
 writeFileSync(join(out,'report.json'),JSON.stringify({cases,originalHash,residentSha256:hash(residentBytes),checks:['16 local-session compositions, four complete packed builds','both startup modes','unreviewed companion refusal','original firmware unchanged','complete resident text matches independent GNU link'],hardware:'not tested'},null,2)+'\n')
 console.log(JSON.stringify({compositions:cases.length,packedBuilds:cases.filter(c=>c.sha256).length,report:join(out,'report.json')}))
}finally{globalThis.fetch=nativeFetch;await server.close()}
