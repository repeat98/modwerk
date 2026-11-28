// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import {inspectionDevice,inspectTransport} from './inspect_hardware.mjs'

const seen=[]
const source={controlTransferIn(setup,length){seen.push([setup.request,length]);return {status:'ok'}},
 controlTransferOut(){assert.fail('write reached device')}}
const safe=inspectionDevice(source)
const setup=request=>({requestType:'vendor',recipient:'interface',value:0,index:1,request})
for(const request of [3,14,27,29,30])safe.controlTransferIn(setup(request),72)
assert.equal(seen.length,5)
for(let request=0;request<256;request++)if(![3,14,27,29,30].includes(request))
 assert.throws(()=>safe.controlTransferIn(setup(request),72))
assert.throws(()=>safe.controlTransferOut(setup(1),new Uint8Array()))
assert.throws(()=>safe.controlTransferIn({...setup(3),value:1},72))
assert.throws(()=>safe.controlTransferIn({...setup(3),requestType:'standard'},72))
assert.throws(()=>safe.controlTransferIn({...setup(3),recipient:'device'},72))
assert.equal(seen.length,5)
const calls=[]
const fake={}
for(const [name,value] of Object.entries({identify:{base:'new-unqualified-base'},capabilities:{abi:8},
 inventory:[],missing:[],load:{cpu:420}}))fake[name]=async()=>{calls.push(name);return value}
const report=await inspectTransport(fake)
assert.equal(report.identity.base,'new-unqualified-base')
assert.equal(report.compatibleForSuperSAW,'not-established')
assert.deepEqual(calls,['identify','capabilities','inventory','missing','load'])
assert.deepEqual(report.inventory,[])
assert.deepEqual(report.missing,[])
fake.capabilities=async()=>undefined
fake.load=async()=>undefined
const old=await inspectTransport(fake)
assert.equal(old.capabilities,null)
assert.equal(old.load,null)
fake.inventory=async()=>undefined
await assert.rejects(inspectTransport(fake),/inventaire/)
fake.inventory=async()=>[]
fake.missing=async()=>undefined
await assert.rejects(inspectTransport(fake),/manquants/)
fake.identify=async()=>{throw new Error('protocol mismatch')}
await assert.rejects(inspectTransport(fake),/protocol mismatch/)
console.log('PASS: inspection is read-only, accepts an unknown identity without approving it, and fails on missing inventory/protocol errors')
