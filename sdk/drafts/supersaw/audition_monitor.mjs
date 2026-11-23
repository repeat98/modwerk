// SPDX-License-Identifier: MIT
// Host-side operator coordination only: no device operations or timing claims.
export function auditionControl({message=()=>{},limitMs=600000,limitLabel='Durée d’écoute de dix minutes atteinte'}={}){
 if(!Number.isFinite(limitMs)||limitMs<=0)throw new Error('Invalid audition duration')
 let finished=false,waiting=false,notice=0,reason='operator'
 const requestStop=why=>{
  if(finished||waiting)return
  waiting=true;reason=why
  message(`${why} : appuyer sur STOP sur l’Octatrack, remettre T1 sur FLEX, ouvrir AMP, puis taper Q et Entrée ici. Aucun Undo lancé par cet avertissement.`)
 }
 return {
  get finished(){return finished},
  get waiting(){return waiting},
  get reason(){return reason},
  confirmFinish(){
   if(finished)return
   finished=true
   message('Fin confirmée par l’utilisateur après STOP, retour à FLEX et fermeture de SRC ; tentative de retrait (Undo).')
  },
  requestStop,
  inputClosed(){
   if(finished)return
   finished=true;reason='input-closed'
   message('Entrée Terminal fermée sans confirmation : nettoyage de secours. STOP, T1 sur FLEX puis AMP ; seul UNDO CONFIRMÉ attestera le retrait.')
  },
  tick(elapsed,cpu){
   if(finished)return
   if(cpu>=850)requestStop('CPU ≥ 85 %')
   if(elapsed>=limitMs){requestStop(limitLabel);notice=3}
   else if(limitMs>=60000&&elapsed>=limitMs-60000&&notice<2){notice=2;message('Fin conseillée dans 1 minute : STOP, T1 sur FLEX, puis Q.')}
   else if(limitMs>=120000&&elapsed>=limitMs-120000&&notice<1){notice=1;message('Fin conseillée dans 2 minutes : prévoir STOP, T1 sur FLEX, puis Q.')}
  },
 }
}

export async function monitorAudition(read,{control,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms)),onReading=()=>{},maxSamples=3600}={}){
 if(!Number.isInteger(maxSamples)||maxSamples<1)throw new Error('Invalid sample retention limit')
 const samples=[],start=now();let totalReadings=0
 while(!control.finished){
  const reading=await read()
  if(!reading||reading.cpu===null||!Number.isFinite(reading.cpu))throw new Error('live CPU meter unavailable')
  const elapsedMs=now()-start
  totalReadings++
  if(samples.length===maxSamples)samples.shift()
  samples.push({...reading,elapsedMs})
  onReading(reading,totalReadings)
  control.tick(elapsedMs,reading.cpu)
  if(!control.finished)await wait(1000)
 }
 return {samples,totalReadings,droppedReadings:totalReadings-samples.length,finishReason:control.reason}
}
