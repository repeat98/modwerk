// SPDX-License-Identifier: MIT
// Failure-path checks: host fakes only, never opens a USB bridge.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {trialCurrentBase as trialUnused,BASE} from './trial_current_base.mjs'

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
 const transport={async capabilities(){return {abi:10}},async identify(){return {base,canSubmit:true}},
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
for(const kind of ['base','digest','abi','inventory','missing','cpu']){
 const f=fixture({base:kind==='base'?'wrong':BASE}),bytes=data.slice()
 if(kind==='abi')f.transport.capabilities=async()=>({abi:9})
 if(kind==='inventory')f.transport.inventory=async()=>[{module:'970f03ad'}]
 if(kind==='missing')f.transport.missing=async()=>[{name:'Algo70'}]
 if(kind==='cpu')f.transport.load=async()=>({cpu:850,frames:16})
 if(kind==='digest')bytes[bytes.length-1]^=1
 await assert.rejects(trialUnused(f.transport,bytes,f.options))
 assert.deepEqual(f.calls,[],'preflight failures must not submit anything')
}
// A stage that entered receiving must be cancelled after a failed transfer.
{
 const f=fixture()
 const original=f.options.connect
 f.options.connect=async()=>{
  const session=await original()
  session.stage=async()=>{f.calls.push('stage');session.status.phase='receiving';throw new Error('transfer failed')}
  session.cancel=async()=>{f.calls.push('cancel');session.status.phase='ready'}
  return session
 }
 await assert.rejects(trialUnused(f.transport,data,f.options),/transfer failed/)
 assert.deepEqual(f.calls,['stage','cancel','leave'])
}
// Never confirm Undo when a different runtime identity comes back.
{
 const f=fixture(),original=f.options.connect
 f.options.connect=async()=>{
  const session=await original(),rollback=session.rollback.bind(session)
  session.rollback=async()=>{await rollback();session.status.active='wrong'}
  return session
 }
 await assert.rejects(trialUnused(f.transport,data,f.options))
}
console.log('PASS current-base unused trial: Undo, failed read cleanup, failed Undo, wrong base and wrong package; no Keep')
