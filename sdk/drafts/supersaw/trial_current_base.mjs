// SPDX-License-Identifier: MIT
// Exact public 0.7.13 base; unchanged historical package, unassigned RAM only.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {UploadSession} from '../../../src/engine/elekloader/upload-session.ts'
import {DIGEST,validateCandidate} from './trial_unused.mjs'
import {restoreTrial} from './trial_listen.mjs'
export const BASE='6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a'

export async function trialCurrentBase(transport,data,{connect=UploadSession.connect,wait=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log,signal}={}){
 validateCandidate(data)
 const identity=await transport.identify()
 assert.equal(identity.base,BASE,'unexpected base')
 assert(identity.canSubmit,'base cannot admit a trial')
 const caps=await transport.capabilities()
 assert.equal(caps?.abi,10,'unexpected loader ABI')
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
  const restoring=['pending','trial','recovery','publishing'].includes(session.status.phase)
  if(restoring){
   log('Retrait automatique (Undo)…')
   await restoreTrial(session,transport,previous,{wait,log})
  }else if(['receiving','verified'].includes(session.status.phase)){
   await session.cancel()
  }
  if(session.status.phase!=='normal')await session.leaveUploadMode()
  assert.equal(session.status.phase,'normal','normal mode was not confirmed')
  assert(session.status.activeKnown,'restored active identity is unknown')
  assert.equal(session.status.active,previous,'Undo did not restore the previous identity')
  assert.deepEqual(await transport.inventory(),[],'Undo inventory is not empty')
  if(!restoring)log('UNDO CONFIRMÉ : 0 module, identité précédente restaurée.')
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
 const rehearsal=JSON.parse(readFileSync(new URL('./evidence/current-base-ram-rehearsal.json',import.meta.url),'utf8'))
 assert.equal(rehearsal.base,BASE,'missing rehearsal for this exact base')
 assert.equal(rehearsal.packageSha256,DIGEST,'rehearsal package differs')
 assert(rehearsal.runs.some(r=>r.profile==='frame-dsp'&&r.undoConfirmed&&r.target==='emulator'),'DSP emulator rehearsal was not successful')
 const bench=new Bench(endpoint,{timeoutMs:10000}),interrupt=new AbortController()
 process.once('SIGINT',()=>interrupt.abort(new Error('User interrupted trial')))
 let result
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  result=await trialCurrentBase(new UsbVendorTransport(device(bench),index,{pollMs:5}),data,{signal:interrupt.signal})
  result={...result,hardwareTested:true,scope:'unused RAM lifecycle only; no sound, assignment, persistence or CPU cost qualification',at:new Date().toISOString()}
  writeFileSync(root+'hardware-current-base-unused-trial-'+Date.now()+'.json',JSON.stringify(result,null,2)+'\n')
  console.log('ESSAI TERMINÉ : aucun module conservé.')
 }catch(error){
  console.error('ESSAI INTERROMPU : '+error.message)
  console.error('Si UNDO CONFIRMÉ ne figure pas ci-dessus, le retrait reste non confirmé. Ne pas relancer un essai.')
  process.exitCode=1
 }finally{bench.socket.end()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
