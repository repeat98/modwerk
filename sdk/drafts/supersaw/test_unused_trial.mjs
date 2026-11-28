// SPDX-License-Identifier: MIT
// Failure-path checks: host fakes only, never opens a USB bridge.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {trialUnused,BASE} from './trial_unused.mjs'

const data=new Uint8Array(readFileSync(new URL('../../../../private-supersaw-v032/package-public/supersaw.mwrm',import.meta.url)))
function fixture({failSample=false,failUndo=false,base=BASE}={}){
 const calls=[];let running=false,reads=0
 const session={status:{phase:'normal',activeKnown:true,active:'previous'},
  async stage(){calls.push('stage');this.status.phase='verified'},
  async activate(){calls.push('activate');this.status.phase='pending';this.status.active='candidate'},
  async startTrial(){calls.push('trial');running=true;this.status.phase='trial'},
  async rollback(){calls.push('rollback');if(failUndo)throw new Error('rollback failed');running=false;this.status.phase='ready';this.status.active='previous'},
  async leaveUploadMode(){calls.push('leave');this.status.phase='normal'},
  async accept(){throw new Error('Keep must never be called')},
 }
 const transport={async identify(){return {base,canSubmit:true}},
  async inventory(){return running?[{module:'3fae49db'}]:[]},async missing(){return []},
  async load(){reads++;if(failSample&&running)throw new Error('load failed');return {cpu:434,frames:reads*16,tracks1to4:503,tracks5to8:419}},
 }
 return {transport,calls,options:{connect:async()=>session,wait:async()=>{},log:()=>{}}}
}
{
 const f=fixture();const r=await trialUnused(f.transport,data,f.options)
 assert(r.undoConfirmed);assert.equal(r.samples.length,10)
 assert.deepEqual(f.calls,['stage','activate','trial','rollback','leave'])
}
{
 const f=fixture({failSample:true})
 await assert.rejects(trialUnused(f.transport,data,f.options),/load failed/)
 assert.deepEqual(f.calls,['stage','activate','trial','rollback','leave'])
}
{
 const f=fixture({failUndo:true})
 await assert.rejects(trialUnused(f.transport,data,f.options),/rollback failed/)
 assert(!f.calls.includes('leave'),'unconfirmed Undo must not be reported as restored')
}
for(const kind of ['base','digest']){
 const f=fixture({base:kind==='base'?'wrong':BASE}),bytes=data.slice()
 if(kind==='digest')bytes[bytes.length-1]^=1
 await assert.rejects(trialUnused(f.transport,bytes,f.options))
 assert.deepEqual(f.calls,[],'preflight failures must not submit anything')
}
console.log('PASS unused trial: Undo, failed read cleanup, failed Undo, wrong base and wrong package; no Keep')
