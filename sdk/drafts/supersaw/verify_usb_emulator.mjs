// SPDX-License-Identifier: MIT
// Local emulator only. Never accepts a TCP bridge or a physical-device API.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,createWriteStream} from 'node:fs'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {sha} from '../../../vendor/elekloader/kit/src/bytes.ts'
import {UploadSession} from '../../../src/engine/elekloader/upload-session.ts'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {diagnostics,removal} from '../../../src/dev/octatrack-usb-lifecycle.ts'
const [socket,baseDir,packagePath,reportPath,cardPath,mode='full',profile='frame-off']=process.argv.slice(2)
assert(['full','loader-only'].includes(mode))
assert(['frame-off','frame-only','frame-dsp'].includes(profile))
const pipe=socket.startsWith('pipe:')
const private032='pipe:'+fileURLToPath(new URL('../../../../private-supersaw-v032/pipe-05/usb-pipe',import.meta.url))
assert(pipe?(socket===private032||/^pipe:\/(?:private\/)?tmp\/supersaw-v03[01]-[^/]+\/usb-pipe$/.test(socket)):/^\/(?:private\/)?tmp\/supersaw-v03[01]-[^/]+\/ot\.sock$/.test(socket),'only the private emulator fixture is allowed')
const symbols=JSON.parse(readFileSync(baseDir+'/symbols.json','utf8'))
const data=new Uint8Array(readFileSync(packagePath)), id=new DataView(data.buffer,data.byteOffset).getUint32(28)
let bench
if(pipe){
 const child=spawn(socket.slice(5),[baseDir+'/MAIN.raw',cardPath,...(profile==='frame-dsp'?['--dsp']:profile==='frame-only'?['--frame']:[])],{stdio:['pipe','pipe','pipe']})
 const log=createWriteStream(reportPath+'.emulator.log');child.stderr.pipe(log,{end:false})
 bench=Object.create(Bench.prototype)
 Object.assign(bench,{lines:[],waiters:[],buffer:'',timeoutMs:120000,transfers:Promise.resolve(),socket:child.stdin})
 let resolveReady,rejectReady
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
 bench.ready=()=>ready
 child.on('error',rejectReady);child.on('exit',code=>{if(code)rejectReady(new Error('pipe emulator exited '+code));log.end()})
 let buffer=''
 child.stdout.on('data',chunk=>{buffer+=chunk.toString();for(let i;(i=buffer.indexOf('\n'))>=0;){
  const line=buffer.slice(0,i);buffer=buffer.slice(i+1)
  if(line==='@ready')resolveReady()
  else if(line.startsWith('@reply ')){const value=line.slice(7);const waiter=bench.waiters.shift();if(waiter)waiter(value);else bench.lines.push(value)}
  else log.write(line+'\n')
 }})
} else bench=new Bench(socket,{timeoutMs:120000})
const checks=[]
let assignmentPreflight=null
const audioChecks=[]
const passed=(name)=>{checks.push(name);console.log('PASS',name)}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try {
 await bench.ready()
 const index=findVendorInterface(await enumerate(bench,false))
 const transport=new UsbVendorTransport(device(bench),index,{pollMs:5})
 const base=(await transport.identify()).base
 const ticks=async()=>(await diagnostics(device(bench),index)).ticks
 while(await ticks()<900){if(pipe)await bench.command('advance 500');else await wait(100)}
 const settle=async n=>{const start=await ticks();while(await ticks()-start<n){if(pipe)await bench.command('advance 100');else await wait(20)}}
 const session=await UploadSession.connect(transport,base,{timeoutMs:60000})
 const call=async(addr,...args)=>{
  const r=await bench.command(`call 0x${addr.toString(16)} ${args.join(' ')}`)
  assert(r[1]!=='err',r.join(' '));return Number(r[1])>>>0
 }
 const peek=async(at,n)=>{const r=await bench.command(`peek 0x${at.toString(16)} ${n}`);return Buffer.from(r[1],'hex')}
 const long=async at=>(await peek(at,4)).readUInt32BE()
 const active=()=>call(symbols.modwerk_runtime_active)
 const stage=async()=>{await session.stage({base,data,sha256:sha(data)});await session.activate();await session.startTrial()}
 const accept=async()=>{await session.holdTrial();await session.accept();await session.leaveUploadMode();await settle(30)}
 const remove=async()=>{const p=removal(base,id);await session.stage(p);await session.activate();await session.startTrial();await accept()}
 assert.equal(await active(),0);passed('bare base has no runtime module')
 await stage();assert.equal(await active(),1);passed('package admitted and live in virtual USB Trial')
 await session.rollback();await session.leaveUploadMode();await settle(30)
 assert.equal(await active(),0);passed('Undo removes the unused trial module')
 await stage();await accept();assert.equal(await active(),1);passed('reinstall and Keep accepted on the virtual card')
 const row=await long(symbols.modwerk_runtime_event_row+4*(28-4))
 const descriptor=await long(row)
 assert.equal(await long(descriptor),1)
 assert.equal(await long(descriptor+4),0x53570101)
 assert.equal((await peek(await long(descriptor+8),8)).toString('ascii'),'SUPERSAW')
 passed('base machine table contains relocated SUPERSAW SW/1 descriptor')
 if(mode==='full'){
 const bank=await long(0x46c82456);assert(bank>=0x40000000&&bank<0x47f00000)
 const pi=(await peek(0x100b14cf,1))[0]&3, part=bank+0x8ed80+pi*6322
 assignmentPreflight={bank,pi,part,
  signatures:(await peek(part+60,213)).toString('hex'),
  admitted:await call(await long(descriptor+28),part,0),
  cpu:await call(symbols.modwerk_status_cpu_load),
  hot:await long(symbols.mw_cpu_hot),allowance:await long(symbols.mw_cpu_allowance),
  audioFrames:await long(symbols.dl_frames),idleGap:await long(symbols.modwerk_idle_gap),idleCounts:await long(symbols.modwerk_idle_counts)}
 console.log('assignment preflight',JSON.stringify(assignmentPreflight))
 assert.equal(await call(symbols.mw_assign,part,0,5),1)
 assert.equal((await peek(part+60,3)).toString('hex'),'535701')
 assert.equal((await peek(part+48,6)).toString('hex'),'40557f067f50')
 passed('native base assignment signs T1 and applies six defaults')
 assert.equal(await call(symbols.mw_assign,part,1,5),0xffffffff)
 assert.notEqual((await peek(part+90,3)).toString('hex'),'535701')
 passed('native base refuses a second SuperSAW in the same Part')
 if(profile!=='frame-off'){
  await bench.command('panel-play');await bench.command('advance 150')
  assert.equal(await long(0x800065b8),1,'native PLAY key must reach the main transport')
  await bench.command('panel-stop');await bench.command('advance 150')
  assert.equal(await long(0x800065b8),0,'native STOP key must reach the main transport')
  passed('native panel PLAY and STOP reach the transport before manual note test')
 }
 if(profile==='frame-dsp'){
  const capture=async label=>{
   const path=reportPath+'.'+label+'.wav'
   const result=await bench.command('audio-save '+path)
   const record={label,frames:Number(result[1]),peak:Number(result[2]),tailPeak:Number(result[3])}
   assert(record.frames>4096,'DSP capture has enough frames');audioChecks.push(record);console.log('capture',JSON.stringify(record));return record
  }
  await bench.command('audio-start');await bench.command('midi 905464');await bench.command('advance 300')
  const held=await capture('held');assert(held.peak>128&&held.peak<32767,'held MIDI note is audible without PCM16 endpoint clipping')
  passed('MIDI note reaches native base renderer and DSP MAIN')
  await bench.command('panel-func-stop');await bench.command('advance 100')
  const paste=await capture('func-stop');assert(paste.tailPeak>128,'FUNC+STOP must leave the manually held voice sounding')
  passed('native FUNC+STOP keeps the held note sounding')
  await bench.command('midi 805400');await bench.command('advance 1000')
  const release=await capture('release');assert(release.tailPeak<=1,'finite release settles within known one-LSB DSP residue')
  passed('native MIDI release settles at DSP MAIN')
  await bench.command('midi 905464');await bench.command('advance 300')
  const restarted=await capture('restarted');assert(restarted.peak>128&&restarted.peak<32767)
  passed('MIDI restart sounds through DSP MAIN')
  await bench.command('panel-stop');await bench.command('advance 600')
  const stopped=await capture('stopped');assert(stopped.tailPeak<=1,'native panel STOP settles MAIN after stopped-transport manual play')
  passed('native MKII STOP key silences manual play at DSP MAIN')
  await bench.command('midi 905664');await bench.command('advance 300')
  const afterStop=await capture('after-stop');assert(afterStop.peak>128&&afterStop.peak<32767)
  passed('new MIDI note after STOP restarts through DSP MAIN')
  await bench.command('midi 805600');await bench.command('advance 1000')
  const afterRelease=await capture('after-stop-release');assert(afterRelease.tailPeak<=1)
  passed('post-STOP MIDI release settles at DSP MAIN')
 }
 let refused=false
 try{await remove()}catch(error){refused=true;const why=(await transport.selftest(false))?.refusal;console.log('expected removal refusal:',error.message,'code',why);assert.equal(why,7);await session.cancel().catch(()=>{})}
 assert(refused);assert.equal(await active(),1)
 passed('removal refused while a Part owns SuperSAW')
 assert.equal(await call(symbols.mw_assign,part,0,1),1)
 await settle(120)
 assert.notEqual((await peek(part+60,3)).toString('hex'),'535701')
 passed('native FLEX assignment clears the SuperSAW signature')
 await remove();assert.equal(await active(),0);passed('module removed after leaving its track')
 }else{
  await remove();assert.equal(await active(),0);passed('unused kept module removed through the virtual USB loader')
 }
 const report={version:'0.31.0-source-draft',mode,profile,scope:mode==='loader-only'?'virtual USB loader subset only; assignment and rendering not tested':'virtual USB and native registry; note captures only when audioChecks are present; no physical USB or reboot test',transport:pipe?'in-memory USB model via process pipes':'local emulator socket',baseIdentity:base,moduleId:id.toString(16),packageSha256:sha(data),checks,assignmentPreflight,audioChecks,hardwareTested:false,audioTested:audioChecks.length>0,rebootTested:false,cpuIsHardwareMeasurement:false}
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n')
} catch(error) {
 writeFileSync(reportPath,JSON.stringify({version:'0.31.0-source-draft',status:'failed',mode,profile,
  packageSha256:sha(data),checks,assignmentPreflight,audioChecks,error:String(error),
  hardwareTested:false,rebootTested:false,cpuIsHardwareMeasurement:false},null,2)+'\n')
 throw error
} finally {bench.socket.end()}
