// SPDX-License-Identifier: MIT
// Local failure checks; never opens USB or starts a trial.
import assert from 'node:assert/strict'
import {recoverExisting} from './recover_current_trial.mjs'
import {BASE} from './trial_current_base.mjs'
import {UploadDeviceError} from '../../../src/engine/elekloader/upload-session.ts'
function fixture({phase='recovery',error,permanent=false,remaining=false}={}){
 let running=phase==='recovery',attempt=0,time=0;const calls=[]
 const session={status:{phase,activeKnown:true,active:'known'},adopt(){calls.push('adopt');return true},
  async rollback(){calls.push('rollback');attempt++;if(error&&(permanent||attempt===1))throw error;running=false;this.status.phase='ready'},
  async leaveUploadMode(){calls.push('leave');this.status.phase='normal'},
  async stage(){throw new Error('package submission forbidden')},async accept(){throw new Error('Keep forbidden')},
 }
 const transport={async capabilities(){return {abi:10}},async identify(){return {base:BASE}},async inventory(){return running||remaining?[{module:'3fae49db'}]:[]}}
 return {transport,calls,options:{connect:async()=>session,now:()=>time,wait:async n=>{time+=n},log:()=>{}}}
}
{
 const f=fixture();assert((await recoverExisting(f.transport,f.options)).restored)
 assert.deepEqual(f.calls,['adopt','rollback','leave'])
}
{
 const f=fixture({phase:'normal'});await recoverExisting(f.transport,f.options);assert.deepEqual(f.calls,[])
}
{
 const f=fixture({error:new UploadDeviceError({command:'rollback',result:'needs-recovery'})})
 await recoverExisting(f.transport,f.options)
 assert.deepEqual(f.calls,['adopt','rollback','rollback','leave'])
}
{
 const f=fixture({error:new Error('unconfirmed write')})
 await assert.rejects(recoverExisting(f.transport,f.options),/unconfirmed write/)
 assert.deepEqual(f.calls,['adopt','rollback'],'never replay an unconfirmed transfer')
}
{
 const f=fixture({error:new UploadDeviceError({command:'rollback',result:'needs-recovery'}),permanent:true})
 await assert.rejects(recoverExisting(f.transport,f.options));assert(!f.calls.includes('leave'))
 assert(f.calls.length<20,'bounded recovery only')
}
{
 const f=fixture({remaining:true});await assert.rejects(recoverExisting(f.transport,f.options),/inventory/)
}
console.log('PASS recovery: retained/normal phases, confirmed retry, unconfirmed write stop, retry limit, nonempty inventory; no package or Keep')

for(const kind of ['base','abi','inventory']){
 const f=fixture()
 if(kind==='base')f.transport.identify=async()=>({base:'wrong'})
 if(kind==='abi')f.transport.capabilities=async()=>({abi:9})
 if(kind==='inventory')f.transport.inventory=async()=>[{module:'970f03ad'}]
 await assert.rejects(recoverExisting(f.transport,f.options))
 assert.deepEqual(f.calls,[],'refuse to adopt or rollback unexpected state')
}
