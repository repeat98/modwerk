// Private developer check. No module source, firmware or emulator runs in npm run check.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { MIDI_SCENES_RELEASE_SHA256, reconstructMidiScenes, reconstructMidiScenesAuthor, midiScenesConflicts } from '../src/engine/midi-scenes-patch.ts'
import { composeOs } from '../src/engine/compose-os.ts'
import { defaultChoosers } from '../src/engine/choosers.ts'
const [file, mode] = process.argv.slice(2)
if (!file || ![undefined,'--compatibility'].includes(mode) || process.argv.length > 4) throw new Error('Usage: node scripts/verify-midi-scenes-native.mjs local-1.40C-MAIN.bin [--compatibility]')
const recipe = JSON.parse(await readFile(new URL('../sdk/drafts/midi-scenes/recipe.json',import.meta.url),'utf8'))
const stock = new Uint8Array(await readFile(file)), sha = bytes => createHash('sha256').update(bytes).digest('hex'), before=sha(stock)
const image = await reconstructMidiScenes(stock, recipe)
assert.equal(sha(await reconstructMidiScenesAuthor(stock, recipe)),recipe.mainSha256)
assert.equal(sha(image),MIDI_SCENES_RELEASE_SHA256)
const changed=stock.slice();changed[100]^=1
await assert.rejects(reconstructMidiScenes(changed,recipe),/unmodified/)
for(const alter of [
  r=>{r.writes[0].guardSha256='0'.repeat(64)},
  r=>{const copy=r.writes.flatMap(w=>w.segments).find(s=>'stockOffset'in s);copy.sha256='0'.repeat(64)},
  r=>{r.writes[0].segments[0].hex='00'.repeat(r.writes[0].segments[0].hex.length/2)},
]){const corrupt=structuredClone(recipe);alter(corrupt);await assert.rejects(reconstructMidiScenes(stock,corrupt))}
console.log(JSON.stringify({status:'passed',bytes:image.length,sha256:sha(image),modifiedBaseRefused:true,corruptRecipesRefused:3,firmwareSaved:false}))
if(mode==='--compatibility') for(const id of ['spectrum','modulation','character','miniverb','tapeecho','euclid','repitch','tapehead','analog-bassdrum','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map']) {
  try{
    const composed=await composeOs(stock,[id],defaultChoosers([id],true))
    const conflicts=midiScenesConflicts(stock,composed.bytes,recipe)
    console.log(JSON.stringify({id,conflictingRegions:conflicts.map(row=>({address:'0x'+(0x40000400+row.offset).toString(16),bytes:row.bytes})),supported:false}))
  }catch(error){console.log(JSON.stringify({id,refused:error.message,supported:false}))}
}
assert.equal(sha(stock),before)
