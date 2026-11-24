// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdirSync,existsSync,writeFileSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
const [directory]=process.argv.slice(2)
if(!directory)throw Error('Usage: node verify_usb_test_pair.mjs NEW-PRIVATE-OUTPUT (local app running on port 5173)')
const out=resolve(directory)
for(let p=out;;p=dirname(p)){if(existsSync(join(p,'.git')))throw Error('Keep packages outside Git');if(p===dirname(p))break}
assert(!existsSync(out));mkdirSync(out,{recursive:true,mode:0o700})
const response=await globalThis.fetch('http://127.0.0.1:5173/__local/midi-cc-slots/usb-test.json'),doc=await response.json()
assert(response.ok,JSON.stringify(doc))
const hash=b=>createHash('sha256').update(b).digest('hex'),a=Buffer.from(doc.original.hex,'hex'),b=Buffer.from(doc.test.hex,'hex')
assert.equal(hash(a),'086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a')
assert.equal(hash(b),'1d740235d843dbb6ab499809b7c6f5c77d85b08b1220cff1ce7504e64415e83e')
assert.equal(doc.test.version,'0.0.17-usb-test');assert.equal(a.length,b.length)
assert.deepEqual(a.subarray(0,50),b.subarray(0,50));assert.deepEqual(a.subarray(66),b.subarray(66))
assert.equal(a.subarray(50,66).toString().replace(/\0/g,''),'MIDI CC SLOTS');assert.equal(b.subarray(50,66).toString().replace(/\0/g,''),'MIDI2 TEST 17')
writeFileSync(join(out,'original-0.0.13.mwrm'),a);writeFileSync(join(out,'test-0.0.17.mwrm'),b)
const proof={original:{version:doc.original.version,sha256:hash(a)},test:{version:doc.test.version,sha256:hash(b)},bytes:a.length,checks:['actual local endpoint compiles reviewed original','test differs only in 16-byte package display name','all executable/image/hook/site/copy/relocation bytes identical'],hardware:'not tested'}
writeFileSync(join(out,'pair-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof))
