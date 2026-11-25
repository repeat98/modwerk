// SPDX-License-Identifier: GPL-3.0-or-later
// Compare the browser's unchanged Elekloader kit with the Python card builder.
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { build } from '../../../vendor/elekloader/kit/src/patch.ts'

const [original, directory] = process.argv.slice(2)
if (!original || !directory) throw new Error('Usage: node verify_card_package.mjs ORIGINAL.bin PRIVATE-build-directory')
const dir=resolve(directory), file=path=>({path,data:new Uint8Array(readFileSync(path))})
const digest=data=>createHash('sha256').update(data).digest('hex')
const input=file(resolve(original)), before=digest(input.data)
const receipt=JSON.parse(readFileSync(join(dir,'card-build.json'),'utf8'))
const mods=[file(join(dir,'core-modwerk.elemod')),file(join(dir,`midi-mode2-${receipt.cardVersion}.elemod`))]
const [outputs]=await build(input,mods,'MIDI2-C14')
assert(outputs)
for (const kind of ['bin','syx']) assert.deepEqual(outputs[kind],new Uint8Array(readFileSync(join(dir,'Midi-Mode-2-card-test.'+kind))),`Browser/Python ${kind} parity`)
assert.equal(digest(readFileSync(original)),before,'Original firmware remains unchanged')
const report={checks:['Complete browser/Python BIN and SYX byte parity','Original firmware unchanged'],binSha256:digest(outputs.bin),hardware:'not tested'}
writeFileSync(join(dir,'browser-parity.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
