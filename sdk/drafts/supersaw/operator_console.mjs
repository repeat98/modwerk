// SPDX-License-Identifier: MIT
// Keep operator input separate from status output. Never sends USB requests.
import {createInterface,clearLine,cursorTo} from 'node:readline'

export function parseOperatorCommand(line){
 const value=String(line).normalize('NFKC').trim().replace(/^(?:[>›»]\s*)+/u,'').trim().toUpperCase()
 if(value==='FIN'||value==='Q')return 'finish'
 if(value==='CPU'||value==='C')return 'cpu'
 return value===''?'empty':'unknown'
}

export function operatorConsole({input=process.stdin,output=process.stdout,onFinish,onCpu,onInterrupt=onFinish,onClose=onFinish}){
 const terminal=!!(input.isTTY&&output.isTTY)
 const rl=createInterface({input,output,terminal})
 let started=false,closed=false
 rl.setPrompt('CPU = mesures | FIN ou Q = terminer > ')
 const prompt=()=>{if(started&&!closed)rl.prompt(true)}
 const message=text=>{
  if(terminal&&started&&!closed){clearLine(output,0);cursorTo(output,0)}
  output.write(String(text)+'\n')
  prompt()
 }
 rl.on('line',line=>{
  const command=parseOperatorCommand(line)
  if(command==='finish')onFinish()
  else if(command==='cpu')onCpu()
  else if(command==='unknown')message('Commande non reconnue. Tape CPU, FIN ou Q, puis Entrée.')
  else prompt()
 })
 rl.on('SIGINT',onInterrupt)
 rl.on('close',()=>{if(!closed){closed=true;onClose()}})
 return {message,start(){started=true;prompt()},close(){closed=true;rl.close()}}
}
