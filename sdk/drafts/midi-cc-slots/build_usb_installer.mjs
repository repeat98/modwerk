// SPDX-License-Identifier: GPL-3.0-or-later
// Local, stock-bearing outputs stay private. No card/device writes.
import process from 'node:process'
import {URL} from 'node:url'
import console from 'node:console'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
import {createServer} from 'vite'
const [firmware,directory]=process.argv.slice(2)
if(!firmware||!directory)throw new Error('Usage: node build_usb_installer.mjs ORIGINAL.bin NEW-PRIVATE-OUTPUT')
const out=resolve(directory)
for(let p=out;;p=dirname(p)){if(existsSync(join(p,'.git')))throw new Error('Keep output outside Git');if(p===dirname(p))break}
assert(!existsSync(out));mkdirSync(out,{recursive:true,mode:0o700})
const original=new Uint8Array(readFileSync(firmware)),nativeFetch=globalThis.fetch
// The actual normal/dev package routes. The server never receives firmware.
globalThis.fetch=url=>nativeFetch(new URL(String(url),'http://127.0.0.1:5173/'))
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',define:{'import.meta.env.VITE_LOCAL_CC_SLOTS':JSON.stringify('1')}})
try{
 const {buildLocalCcInstaller}=await server.ssrLoadModule('/src/dev/local-cc-installer.ts')
 const {decodeFirmware}=await server.ssrLoadModule('/src/engine/elek.ts')
 const {sha}=await server.ssrLoadModule('/vendor/elekloader/kit/src/bytes.ts')
 const before=sha(original),ids=['sidechain-compressor','playmodes','mute-modes','midi-cc-slots']
 const result=await buildLocalCcInstaller(original,ids,readFileSync('src/engine/assets/octatrack-base.elemod','utf8'),JSON.parse(readFileSync('src/engine/assets/octatrack-base-fills.json','utf8')))
 for(const [name,bytes] of result.files)writeFileSync(join(out,name),bytes)
 writeFileSync(join(out,'Midi-Mode-2-USB-card-installer.zip'),result.zip)
 writeFileSync(join(out,'base-MAIN.private.bin'),decodeFirmware(result.files.get('Modwerk-USB-base.bin')).mainOs)
 writeFileSync(join(out,'base-symbols.private.json'),JSON.stringify(Object.fromEntries(result.symbols),null,2)+'\n')
 writeFileSync(join(out,'build-proof.json'),JSON.stringify({receipt:result.receipt,zipSha256:sha(result.zip),runtime:result.runtime,source:'unchanged published base; ordinary verified USB package path',originalUnchanged:before===sha(new Uint8Array(readFileSync(firmware))),hardware:'not tested'},null,2)+'\n')
 assert.equal(before,sha(new Uint8Array(readFileSync(firmware))))
 console.log(JSON.stringify({receipt:result.receipt,zipSha256:sha(result.zip),runtime:result.runtime}))
}finally{globalThis.fetch=nativeFetch;await server.close()}
