// SPDX-License-Identifier: MIT
// Fake time and streams only; never opens a device or sends a module.
import assert from 'node:assert/strict'
import {PassThrough} from 'node:stream'
import {auditionControl,monitorAudition} from './audition_monitor.mjs'
import {operatorConsole} from './operator_console.mjs'
for(const [elapsed,cpu] of [[600000,434],[0,850]]){
 const messages=[],control=auditionControl({message:m=>messages.push(m)})
 control.tick(elapsed,cpu)
 assert(control.waiting);assert(!control.finished,'duration/CPU alert must not authorize Undo')
 control.tick(elapsed+1000000,cpu);assert.equal(messages.length,1,'do not flood a waiting operator')
 control.confirmFinish();assert(control.finished)
}
{
 const messages=[],control=auditionControl({message:m=>messages.push(m)})
 control.tick(480000,434);control.tick(540000,434)
 assert.equal(messages.length,2);assert(!control.waiting);assert(!control.finished)
 control.requestStop('Interruption demandée');assert(control.waiting);assert(!control.finished)
 control.confirmFinish();control.confirmFinish();assert.equal(messages.length,4)
}
{
 let now=0,waits=0;const control=auditionControl({limitMs:30000,limitLabel:'30 seconds'})
 const r=await monitorAudition(async()=>({cpu:434,frames:now}),{control,now:()=>now,wait:async()=>{
  now+=30000
  if(++waits===2){assert(control.waiting);assert(!control.finished);control.confirmFinish()}
 }})
 assert.equal(r.totalReadings,2);assert.equal(r.droppedReadings,0)
 assert.equal(r.samples.at(-1).elapsedMs,30000)
}
{
 let now=0,waits=0;const control=auditionControl()
 const r=await monitorAudition(async()=>({cpu:434}),{control,maxSamples:2,now:()=>now,wait:async()=>{
  now+=1000;if(++waits===5)control.confirmFinish()
 }})
 assert.equal(r.totalReadings,5);assert.equal(r.droppedReadings,3);assert.equal(r.samples.length,2)
}
{
 const control=auditionControl();control.inputClosed();assert(control.finished);assert.equal(control.reason,'input-closed')
 await assert.rejects(monitorAudition(async()=>({cpu:null}),{control:auditionControl()}),/CPU meter/)
}
{
 const input=new PassThrough(),output=new PassThrough();let finish=0,closed=0
 const ui=operatorConsole({input,output,onFinish:()=>finish++,onClose:()=>closed++,onCpu:()=>{}})
 ui.start();input.write('q\n');assert.equal(finish,1)
 input.end();await new Promise(resolve=>setImmediate(resolve))
 assert.equal(closed,1);assert.equal(finish,1,'EOF is not an operator Q confirmation')
 ui.close()
}
console.log('PASS audition coordination: duration, CPU alert, interruption, late Q, 30-second mode, bounded samples, EOF and failed reading')
