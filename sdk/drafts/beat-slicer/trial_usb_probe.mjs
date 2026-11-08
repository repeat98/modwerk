// SPDX-License-Identifier: MIT
// Private fixed-input probe, using the site's validator, self-test and Undo.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { setTimeout } from 'node:timers'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { Bench, device, enumerate } from '../../../scripts/usb-bench.mjs'
import { diagnostics } from '../../../src/dev/octatrack-usb-lifecycle.ts'
const ROOT=dirname(fileURLToPath(import.meta.url)),REPO=resolve(ROOT,'../../..')
assert.equal(execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}).trim(),'','Commit/check the candidate before reviewing a device trial.')
const frontendRevision=execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim()
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const {values}=parseArgs({options:{'build-dir':{type:'string'},socket:{type:'string'},review:{type:'string'},trial:{type:'boolean',default:false}}})
assert(values['build-dir']&&values.socket&&values.review,'Use --build-dir DIR --socket SOCKET --review FILE; add --trial only after review.')
const folder=resolve(values['build-dir']),receipt=JSON.parse(await readFile(join(folder,'usb-probe-build.json')))
const bytes=new Uint8Array(await readFile(join(folder,'beat-slicer-usb-probe.mwrm')))
assert.equal(hash(bytes),receipt.packageSha256);assert.notEqual(receipt.packageSha256,'f5432b875899a2262ddb17af3c34120bac58b52ec4f58a6d858687564fcb8328','Rejected: this wrong-target candidate restarted the MKII.');assert.equal(receipt.moduleId,'c2a61413')
assert.equal(receipt.runtimeExitCode,0);assert.equal(receipt.stockFreeScan?.passed,true)
for(const [name,digest] of Object.entries(receipt.sourceSha256))assert.equal(hash(await readFile(join(ROOT,name))),digest,'Source changed: '+name)
for(const [name,digest] of Object.entries(receipt.sdkDependencySha256))assert.equal(hash(await readFile(join(REPO,name))),digest,'SDK changed: '+name)
const bundle=await build({root:REPO,configFile:false,logLevel:'silent',define:{'import.meta.env.VITE_COMMUNITY_API_URL':JSON.stringify('http://127.0.0.1:8788/api'),'import.meta.env.DEV':'false','import.meta.env.BASE_URL':JSON.stringify('/')},build:{ssr:join(REPO,'scripts/frontend-mcp-bridge.ts'),write:false}})
const frontend=await import('data:text/javascript;base64,'+Buffer.from(bundle.output.find(x=>x.isEntry).code).toString('base64'))
const bench=new Bench(values.socket,{timeoutMs:10000});let link,release,trial=false
try {
 await bench.ready()
 const original=bench.command.bind(bench)
 bench.command=async(...args)=>{try{return await original(...args)}catch(error){bench.socket.destroy();throw error}}
 const unit=Object.assign(device(bench),{configuration:await enumerate(bench,true),opened:false,async open(){this.opened=true},async close(){this.opened=false},async selectConfiguration(){},async claimInterface(){},async releaseInterface(){}})
 const listeners=new Set(),usb={async getDevices(){return []},async requestDevice(){return unit},addEventListener(type,fn){if(type==='disconnect')listeners.add(fn)},removeEventListener(type,fn){listeners.delete(fn)}}
 for(const event of ['error','close'])bench.socket.on(event,()=>{for(const fn of listeners)fn({device:unit})})
 link=new frontend.OctatrackLink(usb,undefined,3000,frontend.tabLocks());release=link.start();await link.connect()
 assert.equal(link.getState().status,'ready')
 await diagnostics(unit,frontend.findVendorInterface(unit.configuration))
 assert(await link.health(),'A base with physical self-test support is required.')
 const before={base:link.getState().identity.base,active:link.getState().active,inventory:await link.inventory()}
 assert(before.inventory,'Inventory is required.')
 assert(!before.inventory.some(x=>x.module===receipt.moduleId),'Probe already installed; preserve it and stop.')
 const entry={id:'beat-slicer-usb-probe',version:receipt.version,module:receipt.moduleId,name:'BEAT SLICER USB',abi:8,features:0,sites:0,copies:0,fills:0,bytes:bytes.length,sha256:receipt.packageSha256,path:`octatrack-modules/beat-slicer-usb-probe/${receipt.version}.mwrm`,requiredBase:before.base}
 const catalogue=frontend.createRuntimeCatalogue({packages:[entry]}),current=catalogue.inventory(before.inventory)
 const target={name:'Private Beat Slicer USB probe',moduleIds:[...current.moduleIds,'beat-slicer-usb-probe'],removedStockFx:[]}
 const prepared=await catalogue.prepare(target,current,async()=>new Uint8Array(bytes),link.getState().identity.capabilities,before.base)
 assert.equal(prepared.changes.length,1);assert(prepared.changes[0].undo,'Exact Undo is required.')
 const identity={frontendRevision,version:receipt.version,packageSha256:receipt.packageSha256,...before}
 if(!values.trial){await writeFile(values.review,JSON.stringify({identity,expires:Date.now()+60000},null,2),{mode:0o600});console.log('Reviewed; no device writes. Trial review expires in 60 seconds.');console.log(JSON.stringify(identity));}
 else {
  const review=JSON.parse(await readFile(values.review));assert(Date.now()<review.expires,'Review expired. Review again.');assert.deepEqual(identity,review.identity,'Device/package changed after review.')
  let selftest
  const unsubscribe=link.subscribeDiagnostics(event=>{if(event.event==='selftest')selftest=event.reading})
  try{await link.update(prepared.name,prepared.changes,()=>link.selftest())}finally{unsubscribe()}
  trial=link.getState().status==='trial'
  assert(trial&&link.getState().tested&&selftest?.state===2&&!selftest.failed,'Physical self-test must actually pass.')
  const reading=await diagnostics(unit,frontend.findVendorInterface(unit.configuration));assert.equal(reading.value,0x42534f4b,'Planner probe did not report PASS.')
  console.log('PLANNER PASS; physical self-test passed. Displaying for five seconds, then Undo.')
  await new Promise(resolve=>setTimeout(resolve,5000))
  await link.undo();trial=false;assert.equal(link.getState().status,'ready');assert.equal(link.getState().active,before.active);assert.deepEqual(await link.inventory(),before.inventory)
  await writeFile(join(folder,'hardware.private.json'),JSON.stringify({identity,selftest,diagnosticValue:reading.value,undoVerified:true,hardware:true},null,2),{mode:0o600})
  console.log('Undo verified: original active identity and inventory restored. Nothing kept.')
 }
}finally{
 try{if(trial||link?.getState().status==='trial')await link.undo()}finally{release?.();bench.socket.destroy()}
}
