// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import {URL} from 'node:url'
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
import {createServer} from 'vite'
const [inputPath,directory]=process.argv.slice(2)
if(!inputPath||!directory)throw new Error('Usage: node verify_usb_installer_session.mjs ORIGINAL.bin NEW-PRIVATE-OUTPUT')
const out=resolve(directory);for(let p=out;;p=dirname(p)){if(existsSync(join(p,'.git')))throw new Error('Keep output outside Git');if(p===dirname(p))break}
assert(!existsSync(out));mkdirSync(out,{recursive:true,mode:0o700})
const original=new Uint8Array(readFileSync(inputPath)),nativeFetch=globalThis.fetch
const requests=[];globalThis.fetch=url=>{requests.push(String(url));return nativeFetch(new URL(String(url),'http://127.0.0.1:5173/'))}
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',define:{'import.meta.env.VITE_LOCAL_CC_SLOTS':JSON.stringify('1')}})
try{
 const {createEngineSession}=await server.ssrLoadModule('/src/engine/session.ts')
 const {members,read}=await server.ssrLoadModule('/vendor/elekloader/kit/src/zip.ts')
 const {decodeFirmware}=await server.ssrLoadModule('/src/engine/elek.ts')
 const {sha}=await server.ssrLoadModule('/vendor/elekloader/kit/src/bytes.ts')
 const {decodeCardSeed}=await server.ssrLoadModule('/src/engine/elekloader/card-seed.ts')
 writeFileSync(join(out,'original-MAIN.private.bin'),decodeFirmware(original).mainOs)
 const replies=[],handle=createEngineSession(r=>replies.push(r)),ids=['sidechain-compressor','playmodes','mute-modes','midi-cc-slots']
 await handle({id:1,type:'inspect',name:'original.bin',buffer:original.slice().buffer});assert.equal(replies.at(-1).type,'inspection')
 await handle({id:2,type:'build',moduleIds:ids,keepStockFx2:false,startup:'docking'})
 const result=replies.at(-1);assert.equal(result.type,'built',JSON.stringify(result));assert(result.report.installer);assert.equal(result.report.version,'ELEKLOADER')
 const zip=new Uint8Array(result.buffer);assert.equal(sha(zip),result.sha256)
 const files=new Map();for(const m of members(zip))files.set(m.filename,await read(zip,m))
 assert.equal(sha(files.get('Modwerk-USB-base.bin')),result.report.installer.baseSha256)
 for(const name of ['MODWERK0.SET','MODWERK1.SET'])assert.equal(decodeCardSeed(files.get(name),result.report.installer.base).packages.length,4)
 assert(files.has('THIRD_PARTY_NOTICES.txt'));assert(files.has('Midi-Mode-2-LICENSE.txt'))
 writeFileSync(join(out,'Midi-Mode-2-USB-card-installer.zip'),zip)
 for(const [n,b] of files)writeFileSync(join(out,n),b)
 await handle({id:3,type:'validate',moduleIds:ids,keepStockFx2:false,startup:'classic'});assert.equal(replies.at(-1).type,'error');assert.match(replies.at(-1).message,/published base startup/)
 await handle({id:4,type:'base'});const standard=replies.at(-1);assert.equal(standard.type,'base');assert.equal(standard.sha256,result.report.installer.baseSha256);assert.equal(standard.base,result.report.installer.base)
 const subsets=[]
 for(let mask=0;mask<8;mask++){
  const selected=[...ids.slice(0,3).filter((_,i)=>mask&1<<i),'midi-cc-slots']
  await handle({id:5+mask,type:'build',moduleIds:selected,keepStockFx2:false,startup:'docking'})
  const built=replies.at(-1);assert.equal(built.type,'built',JSON.stringify(built))
  const archive=new Uint8Array(built.buffer),entries=new Map()
  for(const m of members(archive))entries.set(m.filename,await read(archive,m))
  assert.equal(sha(entries.get('Modwerk-USB-base.bin')),result.report.installer.baseSha256)
  for(const name of ['MODWERK0.SET','MODWERK1.SET'])assert.equal(decodeCardSeed(entries.get(name),built.report.installer.base).packages.length,selected.length)
  subsets.push({moduleIds:selected,zipSha256:built.sha256})
 }
 assert.equal(sha(original),sha(new Uint8Array(readFileSync(inputPath))))
 writeFileSync(join(out,'session-proof.json'),JSON.stringify({sha256:result.sha256,report:result.report,requests,subsets,checks:['actual worker session returns ZIP','all eight reviewed companion subsets build and decode','all ZIP members pass independent CRC reader','base digest and all four seed packages match','copyright notices included','unsupported startup refused','base matches ordinary Download base output byte-for-byte','original unchanged'],hardware:'not tested'},null,2)+'\n')
 console.log(JSON.stringify({sha256:result.sha256,report:join(out,'session-proof.json')}))
}finally{globalThis.fetch=nativeFetch;await server.close()}
