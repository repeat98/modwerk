// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import {PassThrough} from 'node:stream'
import {operatorConsole,parseOperatorCommand} from './operator_console.mjs'
for(const line of ['FIN','FIn','fin',' FIN ','> FIN','› FIN','Q','q'])assert.equal(parseOperatorCommand(line),'finish')
for(const line of ['CPU','cpu','c','> CPU'])assert.equal(parseOperatorCommand(line),'cpu')
for(const line of ['FINCPU','F','IN','DEFINIR'])assert.equal(parseOperatorCommand(line),'unknown')
const input=new PassThrough(),output=new PassThrough();let text='',finished=0,readings=0
output.on('data',chunk=>{text+=chunk})
const ui=operatorConsole({input,output,onFinish:()=>{finished++},onCpu:()=>{readings++;ui.message('CPU 43.4 %')}})
ui.start();input.write('F');ui.message('Avertissement de test');input.write('In\n')
assert.equal(finished,1,'status output must not consume a partially typed command')
input.write('cpu\n');assert.equal(readings,1)
input.write('FINCPU\n');assert(text.includes('Commande non reconnue'))
input.write('> FIN\n');assert.equal(finished,2)
ui.close();assert.equal(finished,2,'programmatic close must not request a new cleanup')
console.log('PASS operator console: mixed case, pasted prompt, single-letter exit, partial input across output, invalid-command feedback and close')
