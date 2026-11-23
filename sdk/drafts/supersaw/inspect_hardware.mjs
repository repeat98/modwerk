// SPDX-License-Identifier: MIT
// Discovery only: no base is approved for installation by this diagnostic.
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'

export function inspectionDevice(source){
 return {
  controlTransferIn(setup,length){
   assert.equal(setup.requestType,'vendor')
   assert.equal(setup.recipient,'interface')
   assert.equal(setup.value,0)
   assert([3,14,27,29,30].includes(setup.request),'inspection: public reads only')
   return source.controlTransferIn(setup,length)
  },
  controlTransferOut(){throw new Error('Inspection : toutes les écritures USB sont interdites')},
 }
}

export async function inspectTransport(transport){
 const identity=await transport.identify()
 const capabilities=await transport.capabilities()
 const inventory=await transport.inventory()
 const missing=await transport.missing()
 const load=await transport.load()
 assert(inventory!==undefined,'inventaire non disponible')
 assert(missing!==undefined,'modules manquants non disponibles')
 return {kind:'read-only-base-inspection',identity,capabilities:capabilities??null,
  inventory,missing,load:load??null,compatibleForSuperSAW:'not-established'}
}

async function main(endpoint){
 assert(/^\/tmp\/sw-read-[^/]+\/usb\.sock$/.test(endpoint),'private read-only bridge required')
 const bench=new Bench(endpoint)
 try{
  await bench.ready()
  const index=findVendorInterface(await enumerate(bench,true))
  assert(index!==undefined,'interface Modwerk unique introuvable')
  const transport=new UsbVendorTransport(inspectionDevice(device(bench)),index)
  console.log(JSON.stringify(await inspectTransport(transport),null,2))
  console.log('Inspection terminée. Aucun module chargé ou retiré ; compatibilité SuperSAW encore à vérifier.')
 }finally{bench.socket.end()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main(process.argv[2])
