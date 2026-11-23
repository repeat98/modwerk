// SPDX-License-Identifier: MIT
// Existing-session cleanup only. No package bytes and no stage/activate/accept.
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {UploadSession,UploadDeviceError} from '../../../src/engine/elekloader/upload-session.ts'
import {BASE} from './trial_current_base.mjs'
const delay=ms=>new Promise(r=>setTimeout(r,ms))

export async function recoverExisting(transport,{connect=UploadSession.connect,wait=delay,now=Date.now,log=console.log}={}){
 const identity=await transport.identify();assert.equal(identity.base,BASE)
 assert.equal((await transport.capabilities())?.abi,10,'unexpected loader ABI')
 const inventory=await transport.inventory();assert(inventory)
 assert(inventory.every(m=>m.module==='3fae49db'),'unexpected installed module: stop and review')
 const session=await connect(transport,BASE,{timeoutMs:10000})
 const before={phase:session.status.phase,activeKnown:session.status.activeKnown,active:session.status.active,inventory}
 log('État initial : '+before.phase)
 const bounded=async operation=>{
  const start=now()
  for(;;){
   try{return await operation()}
   catch(error){
    if(!(error instanceof UploadDeviceError)||!['unsafe','needs-recovery'].includes(error.status.result)||now()-start>=3000)throw error
    log('Annulation encore en cours ; nouvelle demande après réponse confirmée de la base.')
    await wait(200)
   }
  }
 }
 if(['receiving','verified'].includes(session.status.phase)){
  assert(session.adopt(),'cannot adopt staged transaction');await bounded(()=>session.cancel())
 }else if(['pending','trial','recovery','publishing'].includes(session.status.phase)){
  assert(session.adopt(),'cannot adopt retained transaction');await bounded(()=>session.rollback())
 }else assert(['normal','ready'].includes(session.status.phase),'unsupported recovery phase')
 if(session.status.phase!=='normal')await bounded(()=>session.leaveUploadMode())
 assert.equal(session.status.phase,'normal');assert(session.status.activeKnown)
 assert.deepEqual(await transport.inventory(),[],'inventory is not empty; no new package will be submitted')
 const after={phase:session.status.phase,activeKnown:session.status.activeKnown,active:session.status.active,inventory:[]}
 log('RÉCUPÉRATION CONFIRMÉE : mode normal, identité connue, 0 module.')
 return {base:BASE,before,after,restored:true,packageSent:false,keepPerformed:false}
}

async function main(endpoint){
 assert(/^\/tmp\/sw-recover-[^/]+\/usb\.sock$/.test(endpoint))
 const bench=new Bench(endpoint,{timeoutMs:10000})
 try{
  await bench.ready();const index=findVendorInterface(await enumerate(bench,true))
  const result=await recoverExisting(new UsbVendorTransport(device(bench),index,{pollMs:5}))
  const root=fileURLToPath(new URL('../../../../private-supersaw-v032/',import.meta.url))
  writeFileSync(root+'hardware-current-base-recovery-'+Date.now()+'.json',JSON.stringify({...result,at:new Date().toISOString()},null,2)+'\n')
 }catch(error){console.error('RÉCUPÉRATION NON CONFIRMÉE :',String(error));process.exitCode=1}
 finally{bench.socket.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
