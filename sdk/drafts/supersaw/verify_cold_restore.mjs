// SPDX-License-Identifier: MIT
// Fresh emulator processes and private CF copies only; no physical USB API.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFileSync,writeFileSync,createWriteStream,realpathSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Bench,device,enumerate} from '../../../scripts/usb-bench.mjs'
import {sha} from '../../../vendor/elekloader/kit/src/bytes.ts'
import {UploadSession} from '../../../src/engine/elekloader/upload-session.ts'
import {findVendorInterface,UsbVendorTransport} from '../../../src/engine/elekloader/upload-usb.ts'
import {diagnostics,removal} from '../../../src/dev/octatrack-usb-lifecycle.ts'

const work=resolve(fileURLToPath(new URL('../../../../private-supersaw-v032/',import.meta.url)))
const [basePath,packagePath,fixturePath]=process.argv.slice(2,5).map(p=>resolve(p))
for(const p of [basePath,packagePath,fixturePath]) assert(realpathSync(p).startsWith(realpathSync(work)+'/'))
const tag=process.argv[5]??'cold-run'
assert(/^[a-z0-9-]+$/.test(tag))
const reportDir=work+'/'+tag;mkdirSync(reportDir)
const exe=work+'/pipe-03/usb-pipe',symbols=JSON.parse(readFileSync(basePath+'/symbols.json','utf8'))
const data=new Uint8Array(readFileSync(packagePath)),id=new DataView(data.buffer,data.byteOffset).getUint32(28)
const expected=Buffer.from([64,85,127,6,127,80,113,114,115,116,117,118])
const checks=[],boots=[]
const pass=name=>{checks.push(name);console.log('PASS',name)}
let baseIdentity

async function boot(card,label){
 const child=spawn(exe,[basePath+'/MAIN.raw',card,'--frame'],{stdio:['pipe','pipe','pipe']})
 const log=createWriteStream(reportDir+'/'+label+'.emulator.log');child.stderr.pipe(log,{end:false})
 let readyResolve,readyReject,closedResolve
 const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b}),closed=new Promise(r=>{closedResolve=r})
 const bench=Object.create(Bench.prototype)
 Object.assign(bench,{lines:[],waiters:[],buffer:'',timeoutMs:120000,transfers:Promise.resolve(),socket:child.stdin})
 bench.ready=()=>ready
 child.on('error',readyReject)
 child.on('exit',code=>{if(code)readyReject(new Error('emulator exit '+code));log.end();closedResolve(code)})
 let buffer=''
 child.stdout.on('data',chunk=>{buffer+=chunk.toString();for(let n;(n=buffer.indexOf('\n'))>=0;){
  const line=buffer.slice(0,n);buffer=buffer.slice(n+1)
  if(line==='@ready')readyResolve()
  else if(line.startsWith('@reply ')){const v=line.slice(7),waiter=bench.waiters.shift();if(waiter)waiter(v);else bench.lines.push(v)}
  else log.write(line+'\n')
 }})
 await ready
 const index=findVendorInterface(await enumerate(bench,false)),d=device(bench)
 const transport=new UsbVendorTransport(d,index,{pollMs:5})
 const base=(await transport.identify()).base
 if(baseIdentity)assert.equal(base,baseIdentity);else baseIdentity=base
 const ticks=async()=>(await diagnostics(d,index)).ticks
 while(await ticks()<900)await bench.command('advance 500')
 const settle=async n=>{const first=await ticks();while(await ticks()-first<n)await bench.command('advance 100')}
 const call=async(at,...args)=>{const r=await bench.command(`call 0x${at.toString(16)} ${args.join(' ')}`);assert.notEqual(r[1],'err',r.join(' '));return Number(r[1])>>>0}
 const peek=async(at,n)=>{const r=await bench.command(`peek 0x${at.toString(16)} ${n}`);assert.notEqual(r[1],'err');return Buffer.from(r[1],'hex')}
 const long=async at=>(await peek(at,4)).readUInt32BE()
 const active=()=>call(symbols.modwerk_runtime_active)
 const bank=await long(0x46c82456),pi=(await peek(0x100b14cf,1))[0]&3
 assert(bank>=0x40000000&&bank<0x47f00000);assert.equal(pi,0)
 const part=bank+0x8ed80+pi*6322
 const parameters=async()=>Buffer.concat([await peek(part+48,6),await peek(part+480,6)])
 console.log('project preflight',JSON.stringify({label,bank,pi,part,
  bytes:(await peek(part,96)).toString('hex'),source:(await parameters()).toString('hex')}))
 if((await peek(part+60,3)).toString('hex')!=='535701'){
  const found=[]
  for(let offset=0;offset<0xa0000;offset+=4096){const block=await peek(bank+offset,4096);let at=-1
   while((at=block.indexOf(Buffer.from('535701','hex'),at+1))>=0)found.push(offset+at)
  }
  console.log('signed source locations',JSON.stringify(found))
 }
 assert.equal((await peek(part+60,3)).toString('hex'),'535701')
 assert.deepEqual(await parameters(),expected,'native project load must preserve all twelve SW/1 bytes')
 pass(label+': SW/1 signature and twelve source bytes survive native project load')
 const activeCount=await active();boots.push({label,pid:child.pid,cardSha256:sha(new Uint8Array(readFileSync(card))),activeCount,sourceParameters:(await parameters()).toString('hex')})
 const save=async path=>{await settle(120);const r=await bench.command('card-save '+path);assert.equal(r[0],'card');assert(Number(r[2])>0,'native CF writes must occur');return Number(r[2])}
 const close=async()=>{bench.socket.end();assert.equal(await closed,0)}
 return {bench,transport,base,part,call,active,parameters,save,close,settle}
}
try {
 let guest=await boot(fixturePath,'initial-absent')
 assert.equal(await guest.active(),0);pass('initial boot: no module restored')
 const session=await UploadSession.connect(guest.transport,guest.base,{timeoutMs:60000})
 await session.stage({base:guest.base,data,sha256:sha(data)});await session.activate();await session.startTrial()
 await session.holdTrial();await session.accept();await session.leaveUploadMode();await guest.settle(120)
 assert.equal(await guest.active(),1);assert.deepEqual(await guest.parameters(),expected)
 pass('install and Keep preserve pre-existing signed source parameters')
 const kept=reportDir+'/kept.img';await guest.save(kept);await guest.close()

 guest=await boot(kept,'restored-present')
 assert.equal(await guest.active(),1);pass('fresh process: saved CF set restores SuperSAW without host installation')
 assert.deepEqual(await guest.parameters(),expected);pass('restored module retains all twelve project source bytes')
 let remove=await UploadSession.connect(guest.transport,guest.base,{timeoutMs:60000})
 let refused=false
 try {await remove.stage(removal(guest.base,id));await remove.activate();await remove.startTrial()}
 catch(error){refused=true;const why=(await guest.transport.selftest(false))?.refusal;assert.equal(why,7);await remove.cancel().catch(()=>{})}
 assert(refused);assert.equal(await guest.active(),1);pass('restored in-use module refuses removal with code 7')
 assert.equal(await guest.call(symbols.mw_assign,guest.part,0,1),1);await guest.settle(120)
 await remove.stage(removal(guest.base,id));await remove.activate();await remove.startTrial()
 await remove.holdTrial();await remove.accept();await remove.leaveUploadMode();await guest.settle(120)
 assert.equal(await guest.active(),0);pass('return to FLEX and native Keep remove the module')
 const removed=reportDir+'/removed.img';await guest.save(removed);await guest.close()

 guest=await boot(removed,'removed-absent')
 assert.equal(await guest.active(),0);pass('fresh process: newer empty CF set wins over older kept module')
 assert.deepEqual(await guest.parameters(),expected);pass('missing module after restart preserves the signed CF project')
 await guest.close()
 assert.equal(new Set(boots.map(b=>b.pid)).size,3)
 const report={version:'0.32.0-source-draft',scope:'three fresh emulator processes with native CF set writes and project loads; not a physical reboot',
  baseIdentity,packageSha256:sha(data),checks,boots,emulatedRestartTested:true,
  hardwareTested:false,physicalRebootTested:false,batterySRAMPersisted:false,nativeSaveProjectTested:false,audioTested:false}
 writeFileSync(reportDir+'/cold-restore-result.json',JSON.stringify(report,null,2)+'\n')
}catch(error){writeFileSync(reportDir+'/cold-restore-failed.json',JSON.stringify({error:String(error),checks,boots,hardwareTested:false},null,2)+'\n');throw error}
