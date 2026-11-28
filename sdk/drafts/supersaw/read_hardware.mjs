// SPDX-License-Identifier: MIT
// Public, read-only requests only. No upload session or development endpoint.
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'

const EXPECTED_BASE='27c9d36f427079114b598f2910018ea7cd8d3ab7d63dffdca484651551ba020d'

export function readOnlyDevice(source){
 return {
  controlTransferIn(setup,length){
   assert.equal(setup.requestType,'vendor')
   assert.equal(setup.recipient,'interface')
   assert([3,27,30].includes(setup.request),'only public identity, inventory and live load are allowed')
   return source.controlTransferIn(setup,length)
  },
  controlTransferOut(){throw new Error('USB writes are disabled in this diagnostic')},
 }
}

async function main(endpoint){
 assert(/^\/tmp\/sw-read-[^/]+\/usb\.sock$/.test(endpoint),'private read-only bridge required')
 const bench=new Bench(endpoint)
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  const transport=new UsbVendorTransport(readOnlyDevice(device(bench)),index)
  const identity=await transport.identify()
  console.log('Base :',identity.base)
  assert.equal(identity.base,EXPECTED_BASE,'unexpected base; stop and review before any module trial')
  const inventory=await transport.inventory()
  assert(inventory!==undefined,'inventory unavailable')
  console.log('Modules :',inventory.length,JSON.stringify(inventory))
  const reading=await transport.load()
  assert(reading,'public live-load request unavailable')
  const pct=value=>value===null?'mesure indisponible':(value/10).toFixed(1)+' %'
  console.log('CPU :',pct(reading.cpu))
  console.log('DSP pistes 1–4 :',pct(reading.tracks1to4),'(pic',pct(reading.peak1to4)+')')
  console.log('DSP pistes 5–8 :',pct(reading.tracks5to8),'(pic',pct(reading.peak5to8)+')')
  console.log('Compteurs :',reading.ticks,'ticks,',reading.frames,'frames')
  console.log('Requêtes publiques en lecture seule terminées.')
 }finally{bench.socket.end()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
