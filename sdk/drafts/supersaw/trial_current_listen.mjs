// SPDX-License-Identifier: MIT
// One uploader and one pinned RAM trial. No Keep, flash, UI injection or MIDI.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {operatorConsole} from './operator_console.mjs'
import {auditionControl,monitorAudition} from './audition_monitor.mjs'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {UploadSession} from '../../../src/engine/elekloader/upload-session.ts'
import {DIGEST,validateCandidate} from './trial_unused.mjs'
import {BASE} from './trial_current_base.mjs'
const delay=ms=>new Promise(r=>setTimeout(r,ms))
import {restoreTrial} from './trial_listen.mjs'
export {restoreTrial,UNDO_BUDGET_MS} from './trial_listen.mjs'

export async function listenTrial(transport,data,interact,{connect=UploadSession.connect,wait=delay,now=Date.now,log=console.log}={}){
 validateCandidate(data)
 const identity=await transport.identify()
 assert.equal(identity.base,BASE);assert(identity.canSubmit)
 assert.equal((await transport.capabilities())?.abi,10,'unexpected loader ABI')
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
  try{await restoreTrial(session,transport,previous,{wait,now,log:text=>log(text.startsWith('La base confirme que le retrait est encore en cours')?'Retrait non confirmé ; nouvelle tentative après la réponse de la base (200 ms).':text)})}
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
 assert(process.argv.length<=4&&[undefined,'--end-check'].includes(process.argv[3]),'unknown trial option')
 const endCheck=process.argv[3]==='--end-check'
 assert(process.stdin.isTTY,'interactive Terminal required')
 assert(/^\/tmp\/sw-trial-[^/]+\/usb\.sock$/.test(endpoint))
 const root=fileURLToPath(new URL('../../../../private-supersaw-v032/',import.meta.url))
 const data=new Uint8Array(readFileSync(root+'package-public/supersaw.mwrm'))
 validateCandidate(data)
 const evidence=JSON.parse(readFileSync(new URL('./evidence/current-base-hardware-unused.json',import.meta.url),'utf8'))
 assert.equal(evidence.base,BASE,'this base has no successful hardware lifecycle record')
 assert.equal(evidence.packageSha256,DIGEST)
 assert(evidence.hardwareTested&&evidence.undoConfirmed&&!evidence.keepPerformed)
 const bench=new Bench(endpoint,{timeoutMs:10000})
 let latestReading,operator,monitoring
 const control=auditionControl({message:text=>operator?.message(text),...(endCheck?{limitMs:30000,limitLabel:'Contrôle de fin : délai de 30 secondes atteint'}:{})})
 const requestFinish=()=>control.confirmFinish()
 const requestInterrupt=()=>control.requestStop('Interruption demandée')
 const pc=v=>v===null||v===undefined?'?':(v/10).toFixed(1)+' %'
 const formatReading=r=>r?`CPU ${pc(r.cpu)} | DSP 1–4 ${pc(r.tracks1to4)} | DSP 5–8 ${pc(r.tracks5to8)}`:'Premier relevé pas encore disponible.'
 operator=operatorConsole({onFinish:requestFinish,onInterrupt:requestInterrupt,onClose:()=>control.inputClosed(),onCpu:()=>operator.message(formatReading(latestReading))})
 process.on('SIGINT',requestInterrupt)
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  const result=await listenTrial(new UsbVendorTransport(device(bench),index,{pollMs:5}),data,async read=>{
   operator.message('Garder ce Terminal ouvert. Ne pas ouvrir Modwerk pendant cet essai.')
   operator.message('Mesures enregistrées chaque seconde, affichage sur demande : CPU puis Entrée.')
   operator.message('Pour terminer : STOP, T1 sur FLEX, ouvrir AMP, puis FIN ou Q et Entrée ici.')
   if(endCheck)operator.message('CONTRÔLE DE FIN : attendre l’avertissement de 30 secondes, puis STOP sur l’Octatrack, T1 sur FLEX, ouvrir AMP, Q et Entrée. Ne pas sauvegarder le projet.')
   operator.message(`${endCheck?'À trente secondes':'À dix minutes'} : avertissement, puis attente de Q après STOP, T1 sur FLEX puis AMP. Ctrl-C demande la fin mais ne confirme pas ces gestes.`)
   operator.start()
   monitoring=await monitorAudition(read,{control,onReading:(reading,count)=>{
    latestReading=reading
    if(count===1)operator.message(formatReading(reading))
   }})
   return monitoring.samples
  },{log:text=>operator.message(text)})
  writeFileSync(root+'hardware-current-base-listen-trial-'+Date.now()+'.json',JSON.stringify({...result,auditionControlVersion:'manual-confirm-v1',testMode:endCheck?'30-second-end-check':'audition',monitoring:{...monitoring,samples:undefined},at:new Date().toISOString(),hardwareTested:true,scope:'manual RAM trial and load log; audibility and controls require user report'},null,2)+'\n')
  console.log('ESSAI TERMINÉ : aucun module conservé.')
 }catch(error){
  writeFileSync(root+'hardware-current-base-listen-failed-'+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),
   error:String(error),diagnostic:error.trialDiagnostic??null,undoConfirmed:false,keepPerformed:false},null,2)+'\n')
  console.error('ESSAI INTERROMPU :',String(error))
  console.error('Sans le message UNDO CONFIRMÉ, le retrait reste non confirmé. Ne pas lancer un autre essai.')
  process.exitCode=1
 }finally{
  process.removeListener('SIGINT',requestInterrupt)
  operator.close();bench.socket.end()
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
