import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { digest } from '../../server/security'
import { cleanupOctatrackDiagnostics, octatrackDiagnosticRoutes } from '../../server/octatrack-diagnostics'
import type { User } from '../../server/platform'
import { DIAGNOSTIC_BUILD_ERRORS, DIAGNOSTIC_BUILD_KINDS, DIAGNOSTIC_BUILD_PHASES, OCTATRACK_DIAGNOSTICS_VERSION as version } from './octatrack-diagnostics-contract'
import { handleCommunity } from '../../server/transport'
const databases: DatabaseSync[] = []
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();databases.splice(0).forEach(db=>db.close())})
async function fixture() {
  const server=await testServer();databases.push(server.db)
  for(const [id,token,beta] of [['tester','a'.repeat(64),1],['another','b'.repeat(64),1],['member','c'.repeat(64),0]] as const) {
    server.db.prepare('INSERT INTO users(id,display_name,username,email_verified,beta_tester) VALUES(?,?,?,1,?)').run(id,id,id,beta)
    server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(token),id,Math.floor(Date.now()/1000)+3600)
  }
  const admin=(await(await server.call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token as string
  const data=()=>({id:crypto.randomUUID(),event:'sync_failed',phase:'sending',base:'a'.repeat(64),error:'device',refusal:3,modules:[{id:'everb',catalogVersion:'0.1.1'}]})
  const consent=(enabled=true,token='a'.repeat(64))=>server.call('/octatrack/diagnostics/consent','PUT',{enabled,version},token)
  const send=(body:unknown=data(),token='a'.repeat(64))=>server.call('/octatrack/diagnostics','POST',{version,data:body},token)
  return {...server,admin,data,consent,send}
}
describe('private consented Octatrack diagnostics',()=>{
  it('requires current explicit consent from verified members; never publishes reports',async()=>{
    const {call,db,consent,send}=await fixture()
    expect((await send(undefined,'')).status).toBe(401)
    expect((await send()).status).toBe(403)
    expect((await send(undefined,'c'.repeat(64))).status).toBe(403)
    expect(await(await call('/octatrack/diagnostics/consent','GET',undefined,'c'.repeat(64))).json()).toMatchObject({accountId:'member',enabled:false,version})
    expect((await call('/octatrack/diagnostics/consent','PUT',{enabled:true,version:'old'},'a'.repeat(64))).status).toBe(400)
    expect((await consent()).status).toBe(200)
    expect((await send()).status).toBe(200)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:1})
    for(const table of ['issues','issue_logs','notifications'])expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({n:0})
    db.prepare("UPDATE users SET beta_tester=0 WHERE id='tester'").run()
    expect((await send()).status).toBe(200)
    expect((await consent(false)).status).toBe(200)
  })
  it('lets a regular member explicitly opt in, share, export and stop without granting beta access',async()=>{
    const {call,db,env,admin,consent,send,data}=await fixture(), token='c'.repeat(64), payload=data()
    expect((await call('/octatrack/diagnostics/consent','GET')).status).toBe(401)
    expect((await call('/octatrack/diagnostics','GET')).status).toBe(401)
    expect(db.prepare("SELECT enabled FROM octatrack_diagnostic_consent WHERE user_id='member'").get()).toBeUndefined()
    expect((await consent(true,token)).status).toBe(200)
    expect((await send(payload,token)).status).toBe(200)
    await cleanupOctatrackDiagnostics(env.DB!)
    expect((await(await call('/octatrack/diagnostics','GET',undefined,token)).json()).events).toMatchObject([{data:payload}])
    expect((await(await call('/octatrack/diagnostics','GET',undefined,'a'.repeat(64))).json()).events).toEqual([])
    expect((await(await call('/admin/octatrack/diagnostics','GET',undefined,'',admin)).json()).events).toMatchObject([{username:'member',data:payload}])
    expect(db.prepare("SELECT beta_tester FROM users WHERE id='member'").get()).toEqual({beta_tester:0})
    await consent(false,token)
    expect((await send(payload,token)).status).toBe(403)
    expect((await(await call('/octatrack/diagnostics','GET',undefined,token)).json()).events).toEqual([])
  })
  it('does not accept unverified members or guests as account-linked diagnostic participants',async()=>{
    const {call,db,consent,send}=await fixture(), token='c'.repeat(64)
    db.prepare("UPDATE users SET email_verified=0 WHERE id='member'").run()
    expect((await consent(true,token)).status).toBe(403)
    expect((await send(undefined,token)).status).toBe(403)
    expect((await call('/octatrack/diagnostics','GET',undefined,token)).status).toBe(403)
    db.prepare("UPDATE users SET email_verified=1,username=NULL WHERE id='member'").run()
    expect((await consent(true,token)).status).toBe(401)
    expect((await send(undefined,token)).status).toBe(401)
    expect(db.prepare("SELECT enabled FROM octatrack_diagnostic_consent WHERE user_id='member'").get()).toBeUndefined()
  })
  it.each([['email_verified',0,403],['suspended',1,401]] as const)('hides and cleans regular-member reports when %s changes',async(column,value,status)=>{
    const {call,db,env,admin,consent,send}=await fixture(), token='c'.repeat(64)
    await consent(true,token);await send(undefined,token)
    db.prepare(`UPDATE users SET ${column}=? WHERE id='member'`).run(value)
    expect((await send(undefined,token)).status).toBe(status)
    expect((await(await call('/admin/octatrack/diagnostics','GET',undefined,'',admin)).json()).events).toEqual([])
    await cleanupOctatrackDiagnostics(env.DB!)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
  })
  it('cannot recreate a regular-member event after account deletion during its body upload',async()=>{
    const {db,env,consent}=await fixture();await consent(true,'c'.repeat(64))
    const member=db.prepare("SELECT * FROM users WHERE id='member'").get() as unknown as User
    const data={id:crypto.randomUUID(),event:'build_failed',phase:'building',buildKind:'elekloader',error:'build'}
    let complete:()=>void=()=>{}
    const stream=new ReadableStream({start(controller){complete=()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({version,data})));controller.close()}}})
    const request=new Request('https://api.example.test/api/octatrack/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit)
    const pending=octatrackDiagnosticRoutes(request,env.DB!,member,false)
    await new Promise(resolve=>setTimeout(resolve,0));db.prepare("DELETE FROM users WHERE id='member'").run();complete()
    expect(await(await pending)!.json()).toEqual({ok:true,stored:false})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_consent').get()).toEqual({n:0})
  })
  it('requires fresh consent for new reports and keeps those sent under the earlier text',async()=>{
    vi.useFakeTimers({toFake:['Date']})
    const acceptedAt=new Date('2026-10-13T12:00:00.000Z')
    vi.setSystemTime(acceptedAt)
    const {call,db,env,consent,send}=await fixture(), token='c'.repeat(64)
    await consent(true,token);await send(undefined,token)
    db.prepare("UPDATE octatrack_diagnostic_consent SET version='2026-10-12' WHERE user_id='member'").run()
    // The stored version tells the site to ask again; a new consent text alone doesn't delete earlier reports.
    expect(await(await call('/octatrack/diagnostics/consent','GET',undefined,token)).json()).toMatchObject({accountId:'member',enabled:false,version:'2026-10-12'})
    expect((await send(undefined,token)).status).toBe(403)
    await cleanupOctatrackDiagnostics(env.DB!)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:1})
    // Equal timestamps cannot supersede the prior consent decision.
    expect(await(await consent(true,token)).json()).toMatchObject({enabled:false})
    expect((await send(undefined,token)).status).toBe(403)
    vi.setSystemTime(acceptedAt.getTime()+1)
    expect(await(await consent(true,token)).json()).toMatchObject({enabled:true,version})
    expect((await send(undefined,token)).status).toBe(200)
  })
  it('deduplicates retries, isolates accounts, permits admin review and deletes on withdrawal',async()=>{
    const {call,db,admin,consent,send,data}=await fixture(),payload=data()
    await consent();await send(payload);await send(payload)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:1})
    expect((await call('/admin/octatrack/diagnostics','GET',undefined,'a'.repeat(64))).status).toBe(403)
    expect(await(await call('/octatrack/diagnostics','GET',undefined,'b'.repeat(64))).json()).toEqual({events:[]})
    const review=await(await call('/admin/octatrack/diagnostics','GET',undefined,'',admin)).json()
    expect(review.events).toHaveLength(1);expect(review.events[0]).toMatchObject({username:'tester',data:payload})
    await consent(false)
    expect((await send(payload)).status).toBe(403)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
  })
  it('lets the read-only diagnostics key page through records and nothing else',async()=>{
    const {db,env,consent,send,data}=await fixture(),key='d'.repeat(64),first=data(),second=data()
    const read=(path:string,value=key)=>handleCommunity(new Request('https://api.example.test/api'+path,{headers:{'X-Modwerk-Diagnostics':value,'CF-Connecting-IP':'192.0.2.1'}}),env)
    expect((await read('/admin/octatrack/diagnostics')).status).toBe(403)
    env.DIAGNOSTICS_READ_KEY_SHA256=await digest(key)
    await consent();await send(first);await send(second)
    const older=new Date(Date.now()-120000).toISOString(),newer=new Date(Date.now()-60000).toISOString()
    db.prepare('UPDATE octatrack_diagnostic_events SET created_at=? WHERE event_id=?').run(older,first.id)
    db.prepare('UPDATE octatrack_diagnostic_events SET created_at=? WHERE event_id=?').run(newer,second.id)
    const ids=async(path:string)=>(await(await read(path)).json()).events.map((entry:{eventId:string})=>entry.eventId)
    expect(await ids('/admin/octatrack/diagnostics')).toEqual([second.id,first.id])
    expect(await ids('/admin/octatrack/diagnostics?since='+older)).toEqual([first.id,second.id])
    expect(await ids('/admin/octatrack/diagnostics?since='+newer)).toEqual([second.id])
    expect((await read('/admin/octatrack/diagnostics?since=yesterday')).status).toBe(400)
    expect((await read('/admin/octatrack/diagnostics','f'.repeat(64))).status).toBe(403)
    for(const path of ['/admin/insights','/admin/statistics','/admin/account-requests'])expect((await read(path)).status).toBe(403)
  })
  it('rejects arbitrary text, raw logs, unknown modules, invalid readings and extra consent fields',async()=>{
    const {call,consent,send,data}=await fixture();await consent()
    for(const extra of [{log:'private raw log'},{project:'My private project'},{serial:'private'},{error:'free-form error'},{refusal:-1},{base:'not-a-hash'},{modules:[{id:'unknown',catalogVersion:'1'}]},{reading:{state:2}},{packages:[{sha256:'a'.repeat(64),bytes:1,data:'raw'}]}])expect((await send({...data(),...extra})).status).toBe(400)
    expect((await call('/octatrack/diagnostics/consent','PUT',{enabled:true,version,logs:true},'a'.repeat(64))).status).toBe(400)
    expect((await call('/octatrack/diagnostics','POST',{version,data:data()},'a'.repeat(64),'','https://evil.test')).status).toBe(403)
  })
  it('expires consent and records, and cascades account deletion',async()=>{
    const {call,db,env,consent,send}=await fixture();await consent();await send()
    db.prepare("UPDATE octatrack_diagnostic_events SET created_at='2020-01-01T00:00:00.000Z'").run()
    expect(await(await call('/octatrack/diagnostics','GET',undefined,'a'.repeat(64))).json()).toEqual({events:[]})
    await cleanupOctatrackDiagnostics(env.DB!)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
    db.prepare("UPDATE octatrack_diagnostic_consent SET changed_at='2020-01-01T00:00:00.000Z'").run()
    expect((await send()).status).toBe(403)
    await consent();await send();db.prepare("DELETE FROM users WHERE id='tester'").run()
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_consent').get()).toEqual({n:0})
  })
  it('rechecks account eligibility after an in-flight request body completes',async()=>{
    const {db,env,consent,data,call,admin}=await fixture();await consent()
    const member=db.prepare("SELECT * FROM users WHERE id='tester'").get() as unknown as User
    async function pending(path:string,method:string,body:unknown,mutate:()=>void) {
      let complete:()=>void=()=>{}
      const stream=new ReadableStream({start(controller){complete=()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));controller.close()}}})
      const request=new Request('https://api.example.test/api'+path,{method,headers:{'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit)
      const response=octatrackDiagnosticRoutes(request,env.DB!,member,false)
      await new Promise(resolve=>setTimeout(resolve,0));mutate();complete();return response
    }
    await pending('/octatrack/diagnostics','POST',{version,data:data()},()=>db.prepare("UPDATE users SET email_verified=0 WHERE id='tester'").run())
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
    db.prepare("UPDATE users SET email_verified=1 WHERE id='tester'").run()
    await pending('/octatrack/diagnostics/consent','PUT',{enabled:true,version},()=>{db.prepare("UPDATE users SET suspended=1,email_verified=0 WHERE id='tester'").run();db.prepare("DELETE FROM octatrack_diagnostic_consent WHERE user_id='tester'").run()})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_consent').get()).toEqual({n:0})
    expect((await(await call('/admin/octatrack/diagnostics','GET',undefined,'',admin)).json()).events).toEqual([])
  })
  it('retains explicit consent and private records when only beta access is removed',async()=>{
    const {db,call,admin,consent,send}=await fixture();await consent();await send()
    expect((await call('/admin/forum/beta-testers/tester','PUT',{betaTester:false,reason:'Beta complete'},'',admin)).status).toBe(200)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:1})
    expect(db.prepare("SELECT enabled FROM octatrack_diagnostic_consent WHERE user_id='tester'").get()).toEqual({enabled:1})
    expect((await send()).status).toBe(200)
    await consent(false)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
  })
  it('does not let a delayed enable from another tab supersede a later withdrawal',async()=>{
    const {db,env,consent,send}=await fixture();await consent();await send()
    const member=db.prepare("SELECT * FROM users WHERE id='tester'").get() as unknown as User
    let complete:()=>void=()=>{}
    const stream=new ReadableStream({start(controller){complete=()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({enabled:true,version})));controller.close()}}})
    const request=new Request('https://api.example.test/api/octatrack/diagnostics/consent',{method:'PUT',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit)
    const pending=octatrackDiagnosticRoutes(request,env.DB!,member,false)
    await new Promise(resolve=>setTimeout(resolve,5));await consent(false);complete();await pending
    expect(db.prepare("SELECT enabled FROM octatrack_diagnostic_consent WHERE user_id='tester'").get()).toEqual({enabled:0})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
    expect((await send()).status).toBe(403)
  })
  it('accepts only fixed browser events and required build categories after opt-in',async()=>{
    const {call,db,consent,send}=await fixture(), token='c'.repeat(64)
    const browser=()=>({id:crypto.randomUUID(),event:'browser_error',phase:'browser',area:'octatrack',kind:'TypeError'})
    expect((await send(browser(),token)).status).toBe(403)
    await consent(true,token)
    for(const event of ['browser_error','unhandled_rejection'])expect((await send({...browser(),event},token)).status).toBe(200)
    for(const [index,buildKind] of DIAGNOSTIC_BUILD_KINDS.entries()) {
      for(const phase of DIAGNOSTIC_BUILD_PHASES)expect((await send({id:crypto.randomUUID(),event:'build_failed',phase,buildKind,error:DIAGNOSTIC_BUILD_ERRORS[index]},token)).status).toBe(200)
    }
    for(const error of DIAGNOSTIC_BUILD_ERRORS)expect((await send({id:crypto.randomUUID(),event:'build_failed',phase:'building',buildKind:'elekloader',error},token)).status).toBe(200)
    const events=(await(await call('/octatrack/diagnostics','GET',undefined,token)).json()).events
    expect(events).toHaveLength(22)
    expect(events.every((entry:{data:{event:string}})=>['browser_error','unhandled_rejection','build_failed'].includes(entry.data.event))).toBe(true)
    expect(db.prepare('SELECT count(*) AS n FROM usage_visitors').get()).toEqual({n:0})
  })
  it('accepts live load, unresponsive and the unit’s log only in their fixed shapes',async()=>{
    const {consent,send}=await fixture(), token='c'.repeat(64);await consent(true,token)
    const ids={id:crypto.randomUUID(),phase:'ready',base:'a'.repeat(64)}, live={samples:10,cpu:[400,600],dsp1to4:[200,250]}
    const load={seq:3,boot:1,minute:5,cpu:[400,600],dsp1to4:[200,250],dsp5to8:[300,350],samples:600,playing:300}
    const incident={seq:4,boot:1,second:9,kind:'freeze',a:0,cpu:950,dsp1to4:0,dsp5to8:0,machines:Array(24).fill(1),fx:Array(16).fill(2),keys:Array(16).fill(255),screen:0x400cbf2c,tempo24:2880,playing:true}
    const fresh=<T extends object>(value:T)=>({...value,id:crypto.randomUUID()})
    for(const value of [{...ids,event:'load',live},{...ids,event:'unresponsive',reason:'ui',live},{...ids,event:'unresponsive',reason:'usb'},
      {...ids,event:'device_log',log:{loads:[load],incidents:[]}},{...ids,event:'device_log',log:{loads:[],incidents:[incident]}}])expect((await send(fresh(value),token)).status).toBe(200)
    const cases=[{...ids,event:'load'},{...ids,event:'load',live:{...live,cpu:[400,1001]}},{...ids,event:'load',live:{...live,note:'x'}},{...ids,event:'load',live,reason:'ui'},
      {...ids,event:'unresponsive',reason:'other'},{...ids,event:'health',live},{...ids,event:'device_log',log:{loads:[],incidents:[]}},
      {...ids,event:'device_log',log:{loads:[load],incidents:[]},modules:[]},{...ids,event:'device_log',log:{loads:[{...load,name:'x'}],incidents:[]}},
      {...ids,event:'device_log',log:{loads:[],incidents:[{...incident,kind:'other'}]}},{...ids,event:'device_log',log:{loads:[],incidents:[{...incident,keys:Array(17).fill(1)}]}},
      {...ids,event:'device_log',log:{loads:[],incidents:[{...incident,fx:Array(16).fill(256)}]}},{...ids,event:'device_log',log:{loads:Array(41).fill(load),incidents:[]}},
      {...ids,event:'device_log',log:{loads:[],incidents:Array(11).fill(incident)}},{...ids,event:'sync_failed',log:{loads:[load],incidents:[]}}]
    for(const value of cases)expect((await send(fresh(value),token)).status).toBe(400)
  })
  it('rejects raw browser/build data and cross-event USB fields instead of storing them',async()=>{
    const {consent,send}=await fixture(), token='c'.repeat(64);await consent(true,token)
    const browser={id:crypto.randomUUID(),event:'browser_error',phase:'browser',area:'octatrack',kind:'TypeError'}
    const build={id:crypto.randomUUID(),event:'build_failed',phase:'composing',buildKind:'octatrack-firmware',error:'build'}
    const cases=[{...browser,error:'unknown'},{...browser,stack:'private stack'},{...browser,url:'https://private.example.test'},{...browser,path:'/private/project'},
      {...browser,filename:'private.bin'},{...browser,message:'private error'},{...browser,base:'a'.repeat(64)},{...browser,modules:[]},{...browser,phase:'sending'},{...browser,area:'/private/route'},{...browser,kind:'private message'},{...browser,area:undefined},
      {...build,phase:'sending'},{...build,buildKind:'private file name'},{...build,error:'private failure'},{...build,reading:{}},{...build,result:'ok'},{...build,packages:[]},
      {...build,phase:undefined},{...build,buildKind:undefined},{...build,error:undefined},{id:crypto.randomUUID(),event:'sync_failed',phase:'browser'},
      {id:crypto.randomUUID(),event:'sync_failed',phase:'sending',buildKind:'elekloader'},{id:crypto.randomUUID(),event:'sync_failed',phase:'sending',error:'input'},
      {id:crypto.randomUUID(),event:'sync_failed',phase:'sending',error:'unknown',kind:'private message'},{id:crypto.randomUUID(),event:'sync_failed',phase:'sending',error:'device',kind:'TypeError'},
      {id:crypto.randomUUID(),event:'kept',phase:'ready',kind:'TypeError'}]
    for(const value of cases)expect((await send(value,token)).status).toBe(400)
    expect((await send({id:crypto.randomUUID(),event:'sync_failed',phase:'sending',error:'unknown',kind:'TypeError'},token)).status).toBe(200)
  })
  it('keeps the 1000 event cap for regular-member collections',async()=>{
    const {db,consent,send,data}=await fixture(), token='c'.repeat(64);await consent(true,token)
    const seeded=db.prepare('INSERT INTO octatrack_diagnostic_events(user_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)')
    const now=new Date().toISOString()
    for(let i=0;i<1000;i++)seeded.run('member','seed-'+i,version,JSON.stringify(data()),now)
    const newest=data();expect((await send(newest,token)).status).toBe(200)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:1000})
    expect(db.prepare("SELECT event_id FROM octatrack_diagnostic_events WHERE event_id='seed-0'").get()).toBeUndefined()
    expect(db.prepare('SELECT event_id FROM octatrack_diagnostic_events WHERE event_id=?').get(newest.id)).toEqual({event_id:newest.id})
  })
  it('counts only fixed actions without identities and honors browser privacy signals',async()=>{
    const {call,db,env,consent,data}=await fixture()
    expect((await call('/usage/count','POST',{event:'usb_sync_started'})).status).toBe(200)
    expect((await call('/usage/count','POST',{event:'usb_sync_started',moduleId:'everb'})).status).toBe(400)
    expect(db.prepare('SELECT day,event,count FROM octatrack_beta_daily').all()).toHaveLength(1)
    expect(db.prepare('SELECT count(*) AS n FROM usage_visitors').get()).toEqual({n:0})
    await consent()
    const response=await handleCommunity(new Request('https://api.example.test/api/octatrack/diagnostics',{method:'POST',headers:{Origin:'https://octamod.test',Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json',DNT:'1'},body:JSON.stringify({version,data:data()})}),env)
    expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,stored:false})
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({n:0})
  })
})
