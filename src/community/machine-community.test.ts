import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { COMMUNITY_MODULES } from './modules'
import { sharedConfiguration } from './forum-contract'
import { ensureModuleThreads } from '../../server/module-threads'
import { newConfiguration, configurationDevice } from '../config/workspace'

const databases:DatabaseSync[]=[]
afterEach(()=>{for(const db of databases.splice(0))db.close();vi.unstubAllGlobals()})
async function fixture(){
  const server=await testServer();databases.push(server.db)
  server.env.GITHUB_OAUTH_CLIENT_ID='test-client'
  server.env.GITHUB_OAUTH_CLIENT_SECRET='only-a-test-client-secret'
  server.env.GITHUB_OAUTH_CALLBACK_URL='https://api.example.test/api/developer/auth/callback'
  let counter=0
  async function member(username='reporter'){
    const id=crypto.randomUUID(),token=(++counter).toString(16).padStart(64,'0')
    server.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run(id,username,username)
    server.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(await digest(token),id,Math.floor(Date.now()/1000)+600)
    return {id,token}
  }
  async function call(path:string,method='GET',body?:unknown,member='',developer='',admin='',cookie='',origin:string|null='https://octamod.test'){
    const headers=new Headers({'CF-Connecting-IP':'192.0.2.1'})
    if(origin)headers.set('Origin',origin)
    if(body!==undefined)headers.set('Content-Type','application/json')
    if(member)headers.set('Authorization','Bearer '+member)
    if(developer)headers.set('X-Modwerk-Developer',developer)
    if(admin)headers.set('X-Octamod-Admin',admin)
    if(cookie)headers.set('Cookie',cookie)
    return handleCommunity(new Request('https://api.example.test/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),server.env)
  }
  async function githubLogin(login='irpina',githubId=42,listed=true){
    const verifier='a'.repeat(64),challenge=await digest(verifier)
    const start=await call('/developer/auth/start?challenge='+challenge);expect(start.status).toBe(302)
    const authorization=new URL(start.headers.get('Location')!),state=authorization.searchParams.get('state')!,cookie=start.headers.get('Set-Cookie')!.split(';')[0]
    vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
      expect(options.redirect).toBe('manual')
      if(url==='https://github.com/login/oauth/access_token'){
        const body=JSON.parse(String(options.body));expect(body).toMatchObject({client_id:'test-client',code:'synthetic-code',redirect_uri:server.env.GITHUB_OAUTH_CALLBACK_URL})
        const digestBytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.code_verifier)))
        expect(authorization.searchParams.get('code_challenge')).toBe(Buffer.from(digestBytes).toString('base64url'))
        return Response.json({access_token:'synthetic-github-access',token_type:'bearer'})
      }
      expect(url).toBe('https://api.github.com/graphql');expect(String(options.body)).not.toMatch(/email|repositories|mutation/)
      return Response.json({data:{viewer:{databaseId:githubId,login}}})
    }))
    const callback=await call('/developer/auth/callback?code=synthetic-code&state='+state,'GET',undefined,'','','',cookie,null);expect(callback.status).toBe(302)
    const location=callback.headers.get('Location')!,code=location.split('/complete/')[1]
    if(!listed){expect(location).toBe('https://octamod.test/#account/developer/unlisted');return {token:'',code:'',verifier,state,cookie,location}}
    const result=await call('/developer/auth/complete','POST',{code,verifier});expect(result.status).toBe(200)
    const token=result.headers.get('X-Modwerk-Developer')!
    expect(await result.text()).not.toContain(token)
    return {token,code,verifier,state,cookie,location}
  }
  return {...server,member,call,githubLogin}
}
const details={title:'Unexpected behavior',steps:'Select the module and turn a control.',expected:'The chosen setting.',actual:'The setting changes.'}
const context={machine:'digitakt',model:'mk1',flash:'not-flashed',os:'1.53',moduleVersion:'1.0.1-experimental',modules:[{id:'digihealth',version:'1.0.1-experimental'}],keepStockFx2:null,build:''}

describe('machine-aware community',()=>{
  it('keeps same-named modules on separate machines and validates immutable snapshots',async()=>{
    const {call,member}=await fixture(),reporter=await member()
    expect(COMMUNITY_MODULES.filter(module=>module.moduleId==='digihealth').map(module=>module.id)).toEqual(['digitakt-digihealth','digitone-digihealth'])
    for(const device of ['digitakt','digitone']){
      const configuration={name:'Shared '+device,device,moduleIds:['digihealth'],moduleVersions:{digihealth:'1.0.1-experimental'},keepStockFx2:true}
      const result=await call('/forum/threads','POST',{title:configuration.name,body:'Settings to try.',category:'configs',machine:device,moduleId:device+'-digihealth',configuration},reporter.token)
      expect(await result.clone().json()).not.toHaveProperty('error');expect(result.status).toBe(201)
      const {id}=await result.json(),snapshot=(await(await call('/forum/threads/'+id)).json()).configuration
      expect(snapshot).toEqual(configuration)
      const local=newConfiguration(snapshot.name,snapshot.moduleIds,snapshot.keepStockFx2,snapshot.moduleVersions,snapshot.device)
      expect(configurationDevice(local)).toBe(device);expect(local.moduleIds).toEqual(['digihealth'])
      expect((await(await call('/forum/threads?machine='+device+'&module='+device+'-digihealth')).json()).threads.filter((item:{official:number})=>!item.official)).toHaveLength(1)
      expect((await call('/forum/threads','POST',{title:'Wrong machine',body:'Text',category:'modules',machine:device,moduleId:'miniverb'},reporter.token)).status).toBe(400)
      expect((await call('/forum/threads','POST',{title:'Wrong snapshot',body:'Text',category:'configs',machine:device==='digitakt'?'digitone':'digitakt',configuration},reporter.token)).status).toBe(400)
    }
    const old={name:'Old Octatrack',moduleIds:['miniverb'],moduleVersions:{miniverb:'0.1.0'},keepStockFx2:true}
    expect(sharedConfiguration(old)).toEqual(old)
    for(const extra of [{firmware:'untrusted bytes'},{device:'analog-rytm'},{device:'digitakt'},{moduleVersions:{}}])expect(()=>sharedConfiguration({...old,...extra})).toThrow()
  })
  it('accepts structured reports for both new machines without pretending they have Octatrack logs',async()=>{
    const {call,member}=await fixture(),reporter=await member()
    for(const [machine,model,os] of [['digitakt','mk1','1.53'],['digitone','mk1','1.44']]){
      const report={...details,context:{...context,machine,model,os},maintainerSharing:true}
      const result=await call('/modules/'+machine+'-digihealth/issues','POST',report,reporter.token)
      expect(await result.clone().json()).not.toHaveProperty('error');expect(result.status).toBe(201)
      for(const extra of [{log:'untrusted bytes'},{firmware:'bytes'},{logMissing:{reason:'other'}},{context:{...report.context,machine:'octatrack'}},{context:{...report.context,modules:[{id:'miniverb',version:'0.1.0'}]}},{context:{...report.context,modules:[]}},{context:{...report.context,os:'99.99'}},{context:{...report.context,keepStockFx2:true}}])expect((await call('/modules/'+machine+'-digihealth/issues','POST',{...report,...extra},reporter.token)).status).toBe(400)
    }
    expect((await call('/modules/miniverb/issues','POST',{...details,context},reporter.token)).status).toBe(400)
    const mine=await(await call('/issues/mine','GET',undefined,reporter.token)).json();expect(mine).toHaveLength(2)
    expect(mine.every((report:{maintainer_sharing:number})=>report.maintainer_sharing===1)).toBe(true)
  })
})
describe('GitHub developer claims and private report access',()=>{
  it('rejects verified GitHub handles absent from the reviewed catalog before creating developer identities or sessions',async()=>{
    const {call,githubLogin,db,member}=await fixture(),pretender=await member('irpina')
    await githubLogin('irpina-pretender',42,false)
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE github_id IS NOT NULL').get()!.count).toBe(0)
    for(const table of ['developer_auth_codes','developer_sessions'])expect(db.prepare('SELECT COUNT(*) AS count FROM '+table).get()!.count).toBe(0)
    expect((await(await call('/developer/auth/session','GET',undefined,pretender.token)).json()).user).toBeNull()
    expect((await call('/developer/modules','GET',undefined,pretender.token)).status).toBe(401)
    expect((await call('/developer/issues','GET',undefined,pretender.token)).status).toBe(401)
  })
  it('matches catalog handles without case sensitivity and rechecks both pending handoffs and existing sessions',async()=>{
    const {call,githubLogin,db}=await fixture(),login=await githubLogin('IRPINA')
    expect((await(await call('/developer/auth/session','GET',undefined,'',login.token)).json()).user).toEqual({login:'irpina'})
    const user=String(db.prepare('SELECT id FROM users WHERE github_id IS NOT NULL').get()!.id),code='c'.repeat(64)
    db.prepare('INSERT INTO developer_auth_codes(code_hash,user_id,browser_challenge,expires) VALUES(?,?,?,?)').run(await digest(code),user,await digest(login.verifier),Math.floor(Date.now()/1000)+60)
    const modules=COMMUNITY_MODULES.filter(module=>module.maintainers.includes('irpina'))
    const saved=modules.map(module=>[...module.maintainers])
    try {
      for(const module of modules)module.maintainers.splice(0,module.maintainers.length)
      expect((await(await call('/developer/auth/session','GET',undefined,'',login.token)).json()).user).toBeNull()
      for(const path of ['/developer/modules','/developer/issues'])expect((await call(path,'GET',undefined,'',login.token)).status).toBe(401)
      expect((await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',login.token)).status).toBe(401)
      expect((await call('/developer/auth/complete','POST',{code,verifier:login.verifier})).status).toBe(403)
      expect(db.prepare('SELECT COUNT(*) AS count FROM developer_sessions').get()!.count).toBe(1)
    } finally{modules.forEach((module,index)=>module.maintainers.push(...saved[index]))}
  })
  it('rejects provider failure and unverified identities, and handles denied authorization without signing in',async()=>{
    const {call,db,env}=await fixture()
    async function begin(){
      const start=await call('/developer/auth/start?challenge='+await digest('a'.repeat(64)))
      return {state:new URL(start.headers.get('Location')!).searchParams.get('state')!,cookie:start.headers.get('Set-Cookie')!.split(';')[0]}
    }
    const denied=await begin()
    const cancelled=await call('/developer/auth/callback?error=access_denied&state='+denied.state,'GET',undefined,'','','',denied.cookie,null)
    expect(cancelled.status).toBe(302);expect(cancelled.headers.get('Location')).toBe('https://octamod.test/#account/developer')
    for(const failure of ['network','credential','identity','token-redirect','identity-redirect']){
      const flow=await begin()
      const provider=vi.fn(async(url:string,options:RequestInit)=>{
        expect(options.redirect).toBe('manual')
        if(failure==='network')throw new Error('Private provider diagnostics')
        if((failure==='token-redirect'&&url==='https://github.com/login/oauth/access_token')||(failure==='identity-redirect'&&url==='https://api.github.com/graphql'))return new Response(null,{status:307,headers:{Location:'https://untrusted.example.test/credentials'}})
        if(url==='https://github.com/login/oauth/access_token')return Response.json(failure==='credential'?{error:'private-provider-error'}:{access_token:'synthetic-access',token_type:'bearer'})
        return Response.json({data:{viewer:{databaseId:42,login:'not/a/github/handle'}}})
      })
      vi.stubGlobal('fetch',provider)
      const result=await call('/developer/auth/callback?code=synthetic-code&state='+flow.state,'GET',undefined,'','','',flow.cookie,null)
      expect(result.status).toBe(502);expect(await result.text()).not.toMatch(/Private provider|private-provider|synthetic-access/)
      expect(provider).toHaveBeenCalledTimes(failure==='identity'||failure==='identity-redirect'?2:1)
      expect(provider.mock.calls.every(([url])=>url==='https://github.com/login/oauth/access_token'||url==='https://api.github.com/graphql')).toBe(true)
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM developer_sessions').get()!.count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE github_id IS NOT NULL').get()!.count).toBe(0)
    env.GITHUB_OAUTH_CALLBACK_URL='invalid callback'
    expect((await(await call('/developer/auth/session')).json()).available).toBe(false)
    expect((await call('/developer/auth/start?challenge='+'a'.repeat(64))).status).toBe(503)
  })
  it('rejects a wrong browser proof and expired handoffs, and permanently revokes sessions on suspension',async()=>{
    const {call,githubLogin,db}=await fixture(),login=await githubLogin()
    const user=String(db.prepare('SELECT id FROM users WHERE github_id IS NOT NULL').get()!.id),code='c'.repeat(64)
    db.prepare('INSERT INTO developer_auth_codes(code_hash,user_id,browser_challenge,expires) VALUES(?,?,?,?)').run(await digest(code),user,await digest(login.verifier),Math.floor(Date.now()/1000)+60)
    expect((await call('/developer/auth/complete','POST',{code,verifier:'b'.repeat(64)})).status).toBe(400)
    expect((await call('/developer/auth/complete','POST',{code,verifier:login.verifier})).status).toBe(200)
    db.prepare('INSERT INTO developer_auth_codes(code_hash,user_id,browser_challenge,expires) VALUES(?,?,?,0)').run(await digest(code),user,await digest(login.verifier))
    expect((await call('/developer/auth/complete','POST',{code,verifier:login.verifier})).status).toBe(400)
    const admin=(await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
    for(const value of [true,false])expect((await call('/admin/forum/users/'+user,'PATCH',{action:'suspended',value,reason:'Synthetic moderation'},'','',admin)).status).toBe(200)
    expect((await call('/developer/modules','GET',undefined,'',login.token)).status).toBe(401)
    expect(db.prepare('SELECT COUNT(*) AS count FROM developer_auth_codes').get()!.count).toBe(0)
  })
  it('gates Octatrack log downloads by module ownership and revocable consent',async()=>{
    const {call,githubLogin,member}=await fixture(),module=COMMUNITY_MODULES.find(module=>module.id==='miniverb')!,developer=await githubLogin(module.author),other=await githubLogin('irpina',43),reporter=await member()
    await call('/developer/modules/miniverb/claim','POST',{},'',developer.token)
    const log=readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log',import.meta.url),'utf8')
    const result=await call('/modules/miniverb/issues','POST',{...details,context:{model:'mk2',flash:'flashed',os:'1.40C',modules:[{id:'miniverb',version:module.version}],keepStockFx2:true,build:''},log,maintainerSharing:true},reporter.token)
    expect(result.status).toBe(201)
    const report=(await(await call('/issues/mine','GET',undefined,reporter.token)).json())[0]
    expect(await(await call('/issues/'+report.id+'/log','GET',undefined,'',developer.token)).text()).toBe(log)
    expect((await call('/issues/'+report.id+'/log','GET',undefined,'',other.token)).status).toBe(404)
    await call('/issues/'+report.id,'PATCH',{maintainerSharing:false},reporter.token)
    expect((await call('/issues/'+report.id+'/log','GET',undefined,'',developer.token)).status).toBe(404)
    expect((await call('/issues/'+report.id+'/log','GET',undefined,reporter.token)).status).toBe(200)
  })
  it('binds OAuth to the starting browser and PKCE, consumes codes once, and returns no GitHub credentials',async()=>{
    const {call,githubLogin,db}=await fixture(),login=await githubLogin()
    expect((await(await call('/developer/auth/session','GET',undefined,'',login.token)).json()).user).toEqual({login:'irpina'})
    expect(JSON.stringify(db.prepare('SELECT * FROM developer_sessions').all())).not.toContain(login.token)
    expect(JSON.stringify(db.prepare('SELECT * FROM developer_sessions').all())).not.toContain('synthetic-github-access')
    expect(login.location).toMatch(/^https:\/\/octamod.test\/#account\/developer\/complete\/[a-f0-9]{64}$/)
    expect((await call('/developer/auth/complete','POST',{code:login.code,verifier:login.verifier})).status).toBe(400)
    expect((await call('/developer/auth/callback?code=synthetic-code&state='+login.state,'GET',undefined,'','','',login.cookie,null)).status).toBe(400)
    const verifier='b'.repeat(64),start=await call('/developer/auth/start?challenge='+await digest(verifier)),state=new URL(start.headers.get('Location')!).searchParams.get('state')!
    expect((await call('/developer/auth/callback?code=synthetic-code&state='+state,'GET',undefined,'','','','',null)).status).toBe(400)
    db.exec('UPDATE developer_oauth_states SET expires=0')
    expect((await call('/developer/auth/callback?code=synthetic-code&state='+state,'GET',undefined,'','','',start.headers.get('Set-Cookie')!.split(';')[0],null)).status).toBe(400)
    expect((await call('/developer/auth/complete','POST',{code:login.code,verifier:login.verifier},'','','','','https://evil.test')).status).toBe(403)
  })
  it('lets DigiSophie’s developer claim it without granting access to the upstream algorithm author',async()=>{
    const {call,githubLogin,db,member}=await fixture(),login=await githubLogin('soejrd'),reporter=await member()
    const modules=await(await call('/developer/modules','GET',undefined,'',login.token)).json()
    expect(modules.map((module:{id:string})=>module.id)).toEqual(['digitakt-digisophie'])
    expect((await call('/developer/modules/digitakt-digisophie/claim','POST',{},'',login.token)).status).toBe(201)
    expect((await call('/admin/maintainers','GET',undefined,'',login.token)).status).toBe(403)
    const moduleVersion=COMMUNITY_MODULES.find(module=>module.id==='digitakt-digisophie')!.version
    expect((await call('/modules/digitakt-digisophie/issues','POST',{...details,context:{...context,moduleVersion,modules:[{id:'digisophie',version:moduleVersion}]}},reporter.token)).status).toBe(201)
    expect(db.prepare('SELECT author_login FROM issues WHERE module_id=?').get('digitakt-digisophie')!.author_login).toBe('soejrd')
    await githubLogin('mestela',43,false)
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE github_id=?').get(43)!.count).toBe(0)
  })

  it('lets developers claim declared modules while matching forum usernames confer no access',async()=>{
    const {call,githubLogin,member}=await fixture(),login=await githubLogin(),pretender=await member('irpina')
    const modules=await(await call('/developer/modules','GET',undefined,'',login.token)).json()
    expect(modules.map((module:{id:string})=>module.id)).toContain('digitakt-digihealth')
    expect(modules.map((module:{id:string})=>module.id)).toContain('digitone-digihealth')
    expect((await call('/developer/modules/digitakt-digihealth/claim','POST',{},pretender.token)).status).toBe(401)
    expect((await call('/developer/modules/digitakt-digisophie/claim','POST',{},'',login.token)).status).toBe(403)
    for(const id of ['digitakt-digihealth','digitone-digihealth'])expect((await call('/developer/modules/'+id+'/claim','POST',{},'',login.token)).status).toBe(201)
    expect((await call('/admin/maintainers','GET',undefined,'',login.token)).status).toBe(403)
    expect((await(await call('/auth/session','GET',undefined,'',login.token)).json()).user).toBeNull()
    expect((await call('/modules/digitakt-digihealth/rating','POST',{value:5},'',login.token)).status).toBe(401)
    const reused=await githubLogin('irpina',999)
    expect((await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',reused.token)).status).toBe(409)
  })
  it('requires reporter consent, supports private replies and resolution, and immediately enforces revocation',async()=>{
    const {call,githubLogin,member,db}=await fixture(),login=await githubLogin(),reporter=await member(),stranger=await member('stranger')
    await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',login.token)
    expect((await call('/modules/digitakt-digihealth/issues','POST',{...details,context},reporter.token)).status).toBe(201)
    const id=String(db.prepare('SELECT id FROM issues').get()!.id)
    expect(await(await call('/developer/issues','GET',undefined,'',login.token)).json()).toEqual([])
    expect((await call('/issues/'+id,'GET',undefined,'',login.token)).status).toBe(404)
    expect((await call('/issues/'+id,'PATCH',{maintainerSharing:true},stranger.token)).status).toBe(404)
    expect((await call('/issues/'+id,'PATCH',{maintainerSharing:true},reporter.token)).status).toBe(200)
    expect((await(await call('/developer/issues','GET',undefined,'',login.token)).json())[0].id).toBe(id)
    const detail=await(await call('/issues/'+id,'GET',undefined,'',login.token)).json();expect(detail).toMatchObject({canManage:true,canShare:false})
    expect(JSON.stringify(detail)).not.toMatch(/reporter_id|user_id|email|password|token_hash/)
    expect((await call('/issues/'+id+'/replies','POST',{body:'I can reproduce this.'},'',login.token)).status).toBe(201)
    expect((await(await call('/issues/'+id,'GET',undefined,reporter.token)).json()).replies[0].body).toBe('I can reproduce this.')
    expect((await call('/issues/'+id,'PATCH',{status:'closed'},reporter.token)).status).toBe(403)
    expect((await call('/issues/'+id,'PATCH',{status:'closed'},'',login.token)).status).toBe(200)
    expect((await call('/developer/issues?moduleId=digitakt-digisophie','GET',undefined,'',login.token)).status).toBe(403)
    await call('/issues/'+id,'PATCH',{maintainerSharing:false},reporter.token)
    expect((await call('/issues/'+id,'GET',undefined,'',login.token)).status).toBe(404)
    await call('/issues/'+id,'PATCH',{maintainerSharing:true},reporter.token)
    const admin=(await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
    const grant=db.prepare('SELECT user_id FROM module_maintainers').get()!
    expect((await call('/admin/maintainers/digitakt-digihealth/'+grant.user_id,'DELETE',{note:'Reviewed suspension'},'','',admin)).status).toBe(200)
    expect((await call('/issues/'+id+'/replies','POST',{body:'Bypass'},'',login.token)).status).toBe(404)
    expect((await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',login.token)).status).toBe(403)
    const module=(await(await call('/developer/modules','GET',undefined,'',login.token)).json()).find((module:{id:string})=>module.id==='digitakt-digihealth')
    expect(module).toMatchObject({blocked:true,claimed:false,reports:{total:0,open:0}})
    expect((await call('/admin/maintainers/digitakt-digihealth/'+grant.user_id,'PATCH',{note:'Reviewed restoration'},'','',admin)).status).toBe(200)
    expect((await call('/issues/'+id,'GET',undefined,'',login.token)).status).toBe(200)
  })
  it('fails closed without configuration and invalidates sessions on logout, suspension or secret rotation',async()=>{
    const {call,githubLogin,env,db}=await fixture(),login=await githubLogin()
    env.GITHUB_OAUTH_CLIENT_SECRET='rotated-synthetic-secret'
    expect((await call('/developer/modules','GET',undefined,'',login.token)).status).toBe(401)
    env.GITHUB_OAUTH_CLIENT_SECRET='only-a-test-client-secret';db.exec('UPDATE users SET suspended=1 WHERE github_id IS NOT NULL')
    expect((await call('/developer/modules','GET',undefined,'',login.token)).status).toBe(401)
    db.exec('UPDATE users SET suspended=0')
    const ended=await call('/developer/auth/session','DELETE',undefined,'',login.token);expect(ended.headers.get('X-Modwerk-Developer')).toBe('')
    expect((await call('/developer/modules','GET',undefined,'',login.token)).status).toBe(401)
    env.GITHUB_OAUTH_CLIENT_ID=undefined
    expect((await(await call('/developer/auth/session')).json()).available).toBe(false)
    expect((await call('/developer/auth/start?challenge='+'a'.repeat(64))).status).toBe(503)
  })
})


describe('public bug reporting and developer delivery',()=>{
  it('posts both Digi machines to Bug Reports, delivers to their maintainers and follows replies',async()=>{
    const {call,githubLogin,member,db}=await fixture(),developer=await githubLogin(),reporter=await member(),other=await member('otherreporter')
    for(const machine of ['digitakt','digitone'])await call('/developer/modules/'+machine+'-digihealth/claim','POST',{},'',developer.token)
    for(const [machine,os] of [['digitakt','1.53'],['digitone','1.44']]){
      const result=await call('/modules/'+machine+'-digihealth/issues','POST',{...details,context:{...context,machine,os,build:'a'.repeat(64)},visibility:'forum'},reporter.token)
      expect(result.status).toBe(201)
      const {id,forumThreadId}=await result.json()
      expect(id).toBeTruthy();expect(forumThreadId).toBeTruthy()
      const publicThread=await(await call('/forum/threads/'+forumThreadId)).json()
      expect(publicThread.thread).toMatchObject({category:'issues',machine,module_id:machine+'-digihealth',status:'open'})
      expect(publicThread.issue).toEqual({device:'mk1 · OS '+os,version:context.moduleVersion,steps:details.steps,expected:details.expected,actual:details.actual})
      expect(JSON.stringify(publicThread)).not.toContain('a'.repeat(64))
      expect(publicThread.configuration).toBeNull()
      expect((await(await call('/developer/issues','GET',undefined,'',developer.token)).json()).some((item:{id:string;forum_thread_id:string})=>item.id===id&&item.forum_thread_id===forumThreadId)).toBe(true)
      const mine=await(await call('/issues/mine','GET',undefined,reporter.token)).json()
      expect(mine.find((item:{id:string})=>item.id===id)).toMatchObject({forum_thread_id:forumThreadId,maintainer_sharing:1,public_sharing:0})
      expect((await call('/forum/threads/'+forumThreadId+'/replies','POST',{body:'I see this too.'},other.token)).status).toBe(201)
    }
    const notifications=await(await call('/developer/notifications','GET',undefined,'',developer.token)).json()
    expect(notifications).toHaveLength(4);expect(notifications.every((item:{seen:boolean})=>!item.seen)).toBe(true)
    expect((await call('/developer/notifications','PATCH',{},'',developer.token)).status).toBe(200)
    expect((await(await call('/developer/notifications','GET',undefined,'',developer.token)).json()).every((item:{seen:boolean})=>item.seen)).toBe(true)
    expect((await call('/developer/notifications','GET',undefined,reporter.token)).status).toBe(401)
    expect((await call('/admin/issues','GET',undefined,'',developer.token)).status).toBe(403)
    expect(db.prepare("SELECT COUNT(*) AS count FROM forum_threads WHERE user_id<>'modwerk'").get()!.count).toBe(2)
  })
  it('keeps Octatrack logs and full configuration private while publishing the reproduction details',async()=>{
    const {call,githubLogin,member}=await fixture(),module=COMMUNITY_MODULES.find(module=>module.id==='miniverb')!,developer=await githubLogin(module.author),reporter=await member()
    await call('/developer/modules/miniverb/claim','POST',{},'',developer.token)
    const log=readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log',import.meta.url),'utf8')
    const result=await call('/modules/miniverb/issues','POST',{...details,context:{model:'mk2',flash:'flashed',os:'1.40C',modules:[{id:'miniverb',version:module.version},{id:'euclid',version:'0.1.0'}],keepStockFx2:true,build:'b'.repeat(64)},log,visibility:'forum'},reporter.token)
    expect(result.status).toBe(201)
    const {id,forumThreadId}=await result.json(),thread=await(await call('/forum/threads/'+forumThreadId)).json()
    expect(thread.posts[0].body).toContain(details.steps)
    expect(JSON.stringify(thread)).not.toContain(log.trim());expect(JSON.stringify(thread)).not.toMatch(/euclid|keepStockFx2|OCTAMOD.LOG/);expect(JSON.stringify(thread)).not.toContain('b'.repeat(64))
    expect((await call('/issues/'+id+'/log')).status).toBe(404)
    expect(await(await call('/issues/'+id+'/log','GET',undefined,'',developer.token)).text()).toBe(log)
    expect((await call('/issues/'+id,'PATCH',{maintainerSharing:false},reporter.token)).status).toBe(200)
    expect((await call('/issues/'+id+'/log','GET',undefined,'',developer.token)).status).toBe(404)
    expect((await call('/forum/threads/'+forumThreadId)).status).toBe(200)
  })
  it('keeps report and forum status in step in both directions, including administrator changes',async()=>{
    const {call,githubLogin,member}=await fixture(),developer=await githubLogin(),reporter=await member(),stranger=await member('stranger')
    await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',developer.token)
    const {id,forumThreadId}=await(await call('/modules/digitakt-digihealth/issues','POST',{...details,context,visibility:'forum'},reporter.token)).json()
    expect((await call('/forum/threads/'+forumThreadId+'/status','PATCH',{status:'resolved'},stranger.token)).status).toBe(403)
    expect((await call('/forum/threads/'+forumThreadId+'/status','PATCH',{status:'resolved'},reporter.token)).status).toBe(200)
    expect((await(await call('/issues/'+id,'GET',undefined,'',developer.token)).json()).status).toBe('closed')
    expect((await call('/issues/'+id,'PATCH',{status:'open'},'',developer.token)).status).toBe(200)
    expect((await(await call('/forum/threads/'+forumThreadId)).json()).thread.status).toBe('open')
    const admin=(await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
    expect((await call('/admin/issues/'+id,'PATCH',{status:'closed'},'','',admin)).status).toBe(200)
    expect((await(await call('/forum/threads/'+forumThreadId)).json()).thread.status).toBe('resolved')
  })
  it('notifies developers through the issue report flow and removes revoked or hidden notifications',async()=>{
    const {call,githubLogin,member,db}=await fixture(),developer=await githubLogin(),reporter=await member()
    await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',developer.token)
    const payload={...details,context,visibility:'forum'}
    const result=await call('/modules/digitakt-digihealth/issues','POST',payload,reporter.token)
    expect(result.status).toBe(201)
    const {forumThreadId:id}=await result.json()
    expect((await(await call('/developer/notifications','GET',undefined,'',developer.token)).json())[0].thread_id).toBe(id)
    db.prepare('UPDATE forum_threads SET hidden=1 WHERE id=?').run(id)
    expect(await(await call('/developer/notifications','GET',undefined,'',developer.token)).json()).toEqual([])
    db.prepare('UPDATE forum_threads SET hidden=0 WHERE id=?').run(id)
    db.exec('UPDATE module_maintainers SET revoked=1')
    expect(await(await call('/developer/notifications','GET',undefined,'',developer.token)).json()).toEqual([])
    expect((await call('/modules/digitakt-digihealth/issues','POST',payload,reporter.token)).status).toBe(201)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(1)
  })
  it('rolls back the public thread and developer delivery if storing the validated log fails',async()=>{
    const {call,githubLogin,member,db}=await fixture(),module=COMMUNITY_MODULES.find(module=>module.id==='miniverb')!,developer=await githubLogin(module.author),reporter=await member()
    await call('/developer/modules/miniverb/claim','POST',{},'',developer.token)
    db.exec("CREATE TRIGGER reject_log BEFORE INSERT ON issue_logs BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END")
    const log=readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log',import.meta.url),'utf8')
    const result=await call('/modules/miniverb/issues','POST',{...details,context:{model:'mk2',flash:'flashed',os:'1.40C',modules:[],keepStockFx2:true,build:''},log,visibility:'forum'},reporter.token)
    expect(result.status).toBe(500)
    for(const table of ['issues','issue_logs','forum_threads','forum_posts','forum_follows','notifications'])expect(db.prepare('SELECT COUNT(*) AS count FROM '+table).get()!.count).toBe(0)
  })
  it('requires a named configuration without a log and reads the configuration from an attached log',async()=>{
    const {call,member,db}=await fixture(),reporter=await member()
    const context={model:'mk2',flash:'flashed',os:'1.40C',modules:[],keepStockFx2:true,build:''}
    const refused=await call('/modules/miniverb/issues','POST',{...details,context,visibility:'forum'},reporter.token)
    expect(refused.status).toBe(400);expect((await refused.json()).error).toContain('Choose the configuration')
    const log=readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log',import.meta.url),'utf8')
    expect((await call('/modules/miniverb/issues','POST',{...details,context:{...context,keepStockFx2:false,os:'1.40B'},log,visibility:'forum'},reporter.token)).status).toBe(201)
    expect(JSON.parse(String(db.prepare('SELECT context_json FROM issues').get()!.context_json))).toMatchObject({os:'1.40C',keepStockFx2:true,modules:[{id:'repitch',version:'0.1.0'},{id:'miniverb',version:'0.1.2'}]})
  })
  it('does not publish old private clients or rejected and unverified submissions',async()=>{
    const {call,member,db}=await fixture(),reporter=await member()
    expect((await call('/modules/digitakt-digihealth/issues','POST',{...details,context},reporter.token)).status).toBe(201)
    expect(db.prepare('SELECT forum_thread_id,maintainer_sharing FROM issues').get()).toEqual({forum_thread_id:null,maintainer_sharing:0})
    for(const extra of [{visibility:'unexpected'},{visibility:'forum',firmware:'bytes'},{visibility:'forum',log:'firmware bytes'}])expect((await call('/modules/digitakt-digihealth/issues','POST',{...details,context,...extra},reporter.token)).status).toBe(400)
    db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(reporter.id)
    expect((await call('/modules/digitakt-digihealth/issues','POST',{...details,context,visibility:'forum'},reporter.token)).status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS count FROM forum_threads').get()!.count).toBe(0)
  })
})

describe('module forum threads',()=>{
  it('gives every catalog module one server-created thread that its claimed maintainers follow',async()=>{
    const {call,githubLogin,member,db,env}=await fixture()
    const listed=await(await call('/forum/threads?view=modules&module=digitakt-digihealth')).json()
    expect(listed.threads[0]).toMatchObject({id:'module-digitakt-digihealth',title:COMMUNITY_MODULES.find(module=>module.id==='digitakt-digihealth')!.name+' discussion',category:'modules',machine:'digitakt',module_id:'digitakt-digihealth',username:null,official:1,replies:0})
    expect(db.prepare("SELECT module_id FROM forum_threads WHERE user_id='modwerk' ORDER BY module_id").all().map(row=>row.module_id)).toEqual(COMMUNITY_MODULES.map(module=>module.id).sort())
    const detail=await(await call('/forum/threads/module-miniverb')).json()
    expect(detail.posts).toHaveLength(1);expect(detail.posts[0]).toMatchObject({official:true,canEdit:false,username:null})
    expect(detail.posts[0].body).toContain(COMMUNITY_MODULES.find(module=>module.id==='miniverb')!.summary)
    // Member threads about a module stay in the community view.
    const reader=await member('reader')
    expect((await call('/forum/threads','POST',{title:'Mini Verb on drums',body:'Short decay works.',category:'modules',moduleId:'miniverb'},reader.token)).status).toBe(201)
    expect((await(await call('/forum/threads?module=miniverb')).json()).threads.map((item:{title:string})=>item.title)).toEqual(['Mini Verb on drums'])
    const developer=await githubLogin()
    expect((await call('/developer/modules/digitakt-digihealth/claim','POST',{},'',developer.token)).status).toBe(201)
    expect((await call('/forum/threads/module-digitakt-digihealth/replies','POST',{body:'Does FAST AUDIO help with SOPHIE?'},reader.token)).status).toBe(201)
    const notifications=await(await call('/developer/notifications','GET',undefined,'',developer.token)).json()
    expect(notifications.map((item:{thread_id:string})=>item.thread_id)).toEqual(['module-digitakt-digihealth'])
    expect((await(await call('/forum/threads/module-digitakt-digihealth')).json()).thread.replies).toBe(1)
    const {token:admin}=await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()
    expect((await call('/admin/forum/users/modwerk','PATCH',{action:'suspended',value:true,reason:'Test'},'','',admin)).status).toBe(400)
    // Repeated runs, as in the hourly job, add nothing.
    expect(await ensureModuleThreads(env.DB!)).toBe(0)
  })
})
