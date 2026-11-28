// SPDX-License-Identifier: MIT
// One uploader and one pinned RAM trial. No Keep, flash, UI injection or MIDI.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {operatorConsole} from './operator_console.mjs'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {UploadSession,UploadDeviceError} from '../../../src/engine/elekloader/upload-session.ts'
import {BASE,DIGEST,validateCandidate} from './trial_unused.mjs'
const delay=ms=>new Promise(r=>setTimeout(r,ms))
// The site's OctatrackLink uses max(stopWaitMs, setBudget(rows)): at least
// 10 seconds for Undo. The CLI's older three-second bound was too short to
// be an equivalent cleanup policy. All guest guards remain unchanged.
export const UNDO_BUDGET_MS=10000

export async function restoreTrial(session,transport,previous,{wait=delay,now=Date.now,log=console.log}={}){
 let retryStart
 while(['pending','trial','recovery','publishing'].includes(session.status.phase)){
  try{await session.rollback()}
  catch(error){
   if(!(error instanceof UploadDeviceError))throw error
   const transient=['unsafe','needs-recovery'].includes(error.status.result)
   if(!transient&&!['rejected','backend'].includes(error.status.result))throw error
   const record=error.status.result==='unsafe'?undefined:await transport.selftest(false)
   error.refusalRecord=record
   if(record?.refusal===7){
    retryStart=undefined
    log('Retrait refusé : une Part utilise encore SuperSAW. STOP puis remettre T1 sur FLEX. Nouvelle vérification dans 2 s.')
    await wait(2000)
   }else{
    if(!transient)throw error
    retryStart??=now()
    if(now()-retryStart>=UNDO_BUDGET_MS)throw error
    log('La base confirme que le retrait est encore en cours ; nouvelle demande après 200 ms.')
    await wait(200)
   }
  }
 }
 if(['receiving','verified'].includes(session.status.phase))await session.cancel()
 if(session.status.phase!=='normal')await session.leaveUploadMode()
 assert.equal(session.status.phase,'normal')
 assert(session.status.activeKnown)
 assert.equal(session.status.active,previous)
 assert.deepEqual(await transport.inventory(),[])
 log('UNDO CONFIRMÉ : 0 module, identité précédente restaurée.')
}

export async function listenTrial(transport,data,interact,{connect=UploadSession.connect,wait=delay,now=Date.now,log=console.log}={}){
 validateCandidate(data)
 const identity=await transport.identify()
 assert.equal(identity.base,BASE);assert(identity.canSubmit)
 assert.deepEqual(await transport.inventory(),[])
 assert.deepEqual(await transport.missing(),[])
 const before=await transport.load()
 assert(before&&before.cpu!==null&&before.cpu<850)
 const session=await connect(transport,BASE,{timeoutMs:30000})
 assert.equal(session.status.phase,'normal');assert(session.status.activeKnown)
 const previous=session.status.active
 let samples
 try{
  await session.stage({base:BASE,data,sha256:DIGEST})
  await session.activate();await session.startTrial()
  const inventory=await transport.inventory()
  assert.equal(inventory?.length,1);assert.equal(inventory[0].module,'3fae49db')
  log('SUPERSAW PRÊT EN RAM — essai manuel T1 uniquement, aucun Keep.')
  samples=await interact(()=>transport.load())
 }finally{
  try{await restoreTrial(session,transport,previous,{wait,now,log})}
  catch(error){
   error.trialDiagnostic={base:BASE,packageSha256:DIGEST,previous,before,samples:samples??[],
    status:session.status,refusalRecord:error.refusalRecord,undoConfirmed:false,keepPerformed:false}
   throw error
  }
 }
 return {base:BASE,packageSha256:DIGEST,before,samples,after:await transport.load(),
  undoConfirmed:true,keepPerformed:false,physicalRebootTested:false,
  assignmentAndAudibility:'operator actions and listening must be reported separately'}
}

async function main(endpoint){
 assert(process.stdin.isTTY,'interactive Terminal required')
 assert(/^\/tmp\/sw-trial-[^/]+\/usb\.sock$/.test(endpoint))
 const root=fileURLToPath(new URL('../../../../private-supersaw-v032/',import.meta.url))
 const data=new Uint8Array(readFileSync(root+'package-public/supersaw.mwrm'))
 validateCandidate(data)
 const bench=new Bench(endpoint,{timeoutMs:10000})
 let finish=false,latestReading,operator
 const requestFinish=()=>{if(!finish){finish=true;operator?.message('Fin demandée : STOP et T1 sur FLEX pour permettre Undo.')}}
 const pc=v=>v===null||v===undefined?'?':(v/10).toFixed(1)+' %'
 const formatReading=r=>r?`CPU ${pc(r.cpu)} | DSP 1–4 ${pc(r.tracks1to4)} | DSP 5–8 ${pc(r.tracks5to8)}`:'Premier relevé pas encore disponible.'
 operator=operatorConsole({onFinish:requestFinish,onCpu:()=>operator.message(formatReading(latestReading))})
 process.on('SIGINT',requestFinish)
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  const result=await listenTrial(new UsbVendorTransport(device(bench),index,{pollMs:5}),data,async read=>{
   operator.message('Garder ce Terminal ouvert. Ne pas ouvrir Modwerk pendant cet essai.')
   operator.message('Mesures enregistrées chaque seconde, affichage sur demande : CPU puis Entrée.')
   operator.message('Pour terminer : STOP, T1 sur FLEX, puis FIN ou Q et Entrée ici.')
   operator.message('Limite de confort : fin demandée après 10 minutes ; Undo attendra le retour à FLEX.')
   operator.start()
   const samples=[],start=Date.now();let notice=0
   while(!finish){
    const reading=await read();assert(reading&&reading.cpu!==null,'live CPU meter unavailable')
    latestReading=reading
    samples.push({...reading,elapsedMs:Date.now()-start})
    if(samples.length===1)operator.message(formatReading(reading))
    if(reading.cpu>=850){operator.message('CPU ≥ 85 % : STOP et retour à FLEX demandés.');requestFinish()}
    const elapsed=Date.now()-start
    if(elapsed>=480000&&notice<1){notice=1;operator.message('Fin de session dans 2 minutes : prévoir STOP, T1 sur FLEX, puis FIN.')}
    if(elapsed>=540000&&notice<2){notice=2;operator.message('Fin de session dans 1 minute : STOP, T1 sur FLEX, puis FIN.')}
    if(elapsed>=600000)requestFinish()
    if(!finish)await delay(1000)
   }
   return samples
  },{log:text=>operator.message(text)})
  writeFileSync(root+'hardware-listen-trial-'+Date.now()+'.json',JSON.stringify({...result,at:new Date().toISOString(),hardwareTested:true,scope:'manual RAM trial and load log; audibility and controls require user report'},null,2)+'\n')
  console.log('ESSAI TERMINÉ : aucun module conservé.')
 }catch(error){
  writeFileSync(root+'hardware-listen-failed-'+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),
   error:String(error),diagnostic:error.trialDiagnostic??null,undoConfirmed:false,keepPerformed:false},null,2)+'\n')
  console.error('ESSAI INTERROMPU :',String(error))
  console.error('Sans le message UNDO CONFIRMÉ, le retrait reste non confirmé. Ne pas lancer un autre essai.')
  process.exitCode=1
 }finally{
  process.removeListener('SIGINT',requestFinish)
  operator.close();bench.socket.end()
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
