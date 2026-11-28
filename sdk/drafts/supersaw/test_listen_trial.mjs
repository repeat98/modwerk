// SPDX-License-Identifier: MIT
// Offline fault checks: no USB, no real instrument and no Keep.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {listenTrial,restoreTrial,UNDO_BUDGET_MS} from './trial_listen.mjs'
import {BASE} from './trial_unused.mjs'
import {UploadDeviceError} from '../../../src/engine/elekloader/upload-session.ts'
const data=new Uint8Array(readFileSync(new URL('../../../../private-supersaw-v032/package-public/supersaw.mwrm',import.meta.url)))
function fixture({occupied=false,unknown=false,transient,permanent=false}={}){
 const calls=[];let running=false,attempt=0,time=0
 const session={status:{phase:'normal',activeKnown:true,active:'old'},
  async stage(){calls.push('stage');this.status.phase='verified'},
  async activate(){calls.push('activate');this.status.phase='pending';this.status.active='new'},
  async startTrial(){calls.push('trial');running=true;this.status.phase='trial'},
  async rollback(){
   calls.push('rollback');this.status.phase='pending';attempt++
   if(unknown)throw new Error('unconfirmed USB transfer')
   if(transient&&(permanent||attempt===1))throw new UploadDeviceError({result:transient,command:'rollback'})
   if(occupied&&attempt===1)throw new UploadDeviceError({result:'rejected',command:'rollback'})
   this.status.phase='ready';this.status.active='old';running=false
  },
  async leaveUploadMode(){calls.push('leave');this.status.phase='normal'},
  async accept(){throw new Error('Keep forbidden')},
 }
 const transport={async identify(){return {base:BASE,canSubmit:true}},
  async inventory(){return running?[{module:'3fae49db'}]:[]},async missing(){return []},
  async load(){return {cpu:434,frames:100}},async selftest(start){assert.equal(start,false);calls.push('refusal');return {refusal:occupied?7:0}},
 }
 return {session,transport,calls,options:{connect:async()=>session,now:()=>time,wait:async n=>{time+=n;calls.push('wait')},log:()=>{}}}
}
{
 const f=fixture();await listenTrial(f.transport,data,async()=>[],f.options)
 assert.deepEqual(f.calls,['stage','activate','trial','rollback','leave'])
}
{
 const f=fixture({occupied:true});await listenTrial(f.transport,data,async()=>[],f.options)
 assert.deepEqual(f.calls,['stage','activate','trial','rollback','refusal','wait','rollback','leave'])
}
{
 const f=fixture();await assert.rejects(listenTrial(f.transport,data,async()=>{throw new Error('meter failed')},f.options),/meter failed/)
 assert.equal(f.session.status.phase,'normal');assert(f.calls.includes('rollback'))
}
{
 const f=fixture({unknown:true})
 await assert.rejects(listenTrial(f.transport,data,async()=>[],f.options),/unconfirmed USB/)
 assert.equal(f.calls.filter(x=>x==='rollback').length,1,'never replay an unconfirmed write')
 assert(!f.calls.includes('leave'));assert(!f.calls.includes('refusal'))
}
{
 const f=fixture();f.session.status.phase='ready';f.session.status.active='wrong'
 await assert.rejects(restoreTrial(f.session,f.transport,'old',f.options))
}
for(const transient of ['unsafe','needs-recovery']){
 const f=fixture({transient});await listenTrial(f.transport,data,async()=>[],f.options)
 assert.equal(f.calls.filter(x=>x==='rollback').length,2)
 assert.equal(f.session.status.phase,'normal')
}
{
 const f=fixture({transient:'needs-recovery',occupied:true});await listenTrial(f.transport,data,async()=>[],f.options)
 assert.equal(f.session.status.phase,'normal')
 assert(f.calls.includes('wait'))
}
{
 const f=fixture({transient:'needs-recovery',permanent:true})
 await assert.rejects(listenTrial(f.transport,data,async()=>[],f.options))
 assert(!f.calls.includes('leave'))
 assert.equal(UNDO_BUDGET_MS,10000)
 assert.equal(f.calls.filter(x=>x==='rollback').length,Math.floor(UNDO_BUDGET_MS/200)+1)
}
console.log('PASS listening trial: Undo, occupied/transient refusal, bounded retry, monitoring failure, unconfirmed transfer and identity mismatch; no Keep')
