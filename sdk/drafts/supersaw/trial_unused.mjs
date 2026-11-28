// SPDX-License-Identifier: MIT
// A single exact module, one uploader, unused RAM trial, automatic Undo.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {UploadSession} from '../../../src/engine/elekloader/upload-session.ts'

export const BASE='27c9d36f427079114b598f2910018ea7cd8d3ab7d63dffdca484651551ba020d'
export const DIGEST='52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476'
const sha=data=>createHash('sha256').update(data).digest('hex')
export function validateCandidate(data){
 assert.equal(sha(data),DIGEST,'candidate hash mismatch: no USB write allowed')
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength)
 assert.equal(view.getUint32(0),0x4d57524d)
 assert.equal(view.getUint16(4),8)
 assert.equal(view.getUint32(28),0x3fae49db)
}

// connect is injected only for offline failure-path checks; production uses
// the unchanged SDK UploadSession. No accept/Keep method is ever called.
export async function trialUnused(transport,data,{connect=UploadSession.connect,wait=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log,signal}={}){
 validateCandidate(data)
 const identity=await transport.identify()
 assert.equal(identity.base,BASE,'unexpected base')
 assert(identity.canSubmit,'base cannot admit a trial')
 assert.deepEqual(await transport.inventory(),[],'trial requires an empty inventory')
 assert.deepEqual(await transport.missing(),[],'project names an absent module; use a disposable stock project')
 const before=await transport.load()
 assert(before&&before.cpu!==null&&before.cpu<850,'CPU reading unavailable or above admission limit')
 const session=await connect(transport,BASE,{timeoutMs:30000})
 assert.equal(session.status.phase,'normal','an earlier operation is still open')
 assert(session.status.activeKnown,'active identity must be known')
 const previous=session.status.active,samples=[]
 try{
  signal?.throwIfAborted()
  await session.stage({base:BASE,data,sha256:DIGEST},{signal})
  await session.activate();await session.startTrial()
  const running=await transport.inventory()
  assert.equal(running?.length,1)
  assert.equal(running[0].module,'3fae49db')
  log('SuperSAW chargé en RAM, sans affectation à une piste.')
  for(let i=0;i<10;i++){
   signal?.throwIfAborted();await wait(1000);signal?.throwIfAborted()
   const reading=await transport.load();assert(reading,'live load unavailable')
   assert(reading.cpu!==null,'stale CPU meter')
   assert(reading.cpu<850,'CPU reached admission limit; ending trial')
   samples.push(reading)
   log(`${i+1}/10 s — CPU ${(reading.cpu/10).toFixed(1)} %`)
  }
 }finally{
  if(['pending','trial','recovery','publishing'].includes(session.status.phase)){
   log('Retrait automatique (Undo)…')
   await session.rollback()
  }else if(['receiving','verified'].includes(session.status.phase)){
   await session.cancel()
  }
  if(session.status.phase!=='normal')await session.leaveUploadMode()
  assert.equal(session.status.phase,'normal','normal mode was not confirmed')
  assert(session.status.activeKnown,'restored active identity is unknown')
  assert.equal(session.status.active,previous,'Undo did not restore the previous identity')
  assert.deepEqual(await transport.inventory(),[],'Undo inventory is not empty')
  log('UNDO CONFIRMÉ : 0 module, identité précédente restaurée.')
 }
 const after=await transport.load()
 assert(after&&((after.frames-before.frames)>>>0)>0,'audio frame counter did not advance')
 return {base:BASE,packageSha256:DIGEST,before,samples,after,undoConfirmed:true,
  assignedToTrack:false,audioTested:false,keepPerformed:false,physicalRebootTested:false}
}

async function main(endpoint){
 assert(/^\/tmp\/sw-trial-[^/]+\/usb\.sock$/.test(endpoint))
 const root=fileURLToPath(new URL('../../../../private-supersaw-v032/',import.meta.url))
 const data=new Uint8Array(readFileSync(root+'package-public/supersaw.mwrm'))
 validateCandidate(data)
 const bench=new Bench(endpoint,{timeoutMs:10000}),interrupt=new AbortController()
 process.once('SIGINT',()=>interrupt.abort(new Error('User interrupted trial')))
 let result
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  result=await trialUnused(new UsbVendorTransport(device(bench),index,{pollMs:5}),data,{signal:interrupt.signal})
  result={...result,hardwareTested:true,scope:'unused RAM lifecycle only; no sound, assignment, persistence or CPU cost qualification',at:new Date().toISOString()}
  writeFileSync(root+'hardware-unused-trial-'+Date.now()+'.json',JSON.stringify(result,null,2)+'\n')
  console.log('ESSAI TERMINÉ : aucun module conservé.')
 }finally{bench.socket.end()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
