import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { cleanupAccounts } from '../../server/accounts'
import { symmetricDecrypt } from 'better-auth/crypto'
import { hashPassword } from 'better-auth/crypto'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { digest } from '../../server/security'
import type { SocialProvider } from '../../server/social-config'

const databases: DatabaseSync[] = []
// RSA key generation is slow; one synthetic provider key serves every test.
const keys = generateKeyPairSync('rsa',{modulusLength:2048}), jwk = {...keys.publicKey.export({format:'jwk'}),kid:'synthetic',alg:'RS256',use:'sig'}
afterEach(() => { vi.unstubAllGlobals(); for(const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const {env,call} = server
  env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  env.SSO_GOOGLE_CLIENT_ID = 'synthetic-google'; env.SSO_GOOGLE_CLIENT_SECRET = 'synthetic-secret'
  env.SSO_GITHUB_CLIENT_ID = 'synthetic-github'; env.SSO_GITHUB_CLIENT_SECRET = 'synthetic-secret'
  env.SSO_DISCORD_CLIENT_ID = 'synthetic-discord'; env.SSO_DISCORD_CLIENT_SECRET = 'synthetic-secret'
  let email = 'member@example.test', verified = true, identity = '42', nonce = '', googleClaims:Record<string,unknown> = {}, corruptSignature = false
  vi.stubGlobal('fetch',vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)
    if(url.includes('oauth2/v3/certs')) return Response.json({keys:[jwk]})
    if(url.includes('oauth2.googleapis.com/token')) {
      const header = Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic',typ:'JWT'})).toString('base64url')
      const body = Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'synthetic-google',sub:identity,email,email_verified:verified,name:'Private provider name',picture:'https://example.test/private.jpg',nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,...googleClaims})).toString('base64url')
      const jwt = header+'.'+body+'.'+sign('RSA-SHA256',Buffer.from(header+'.'+body),keys.privateKey).toString('base64url')
      return Response.json({access_token:'synthetic-access',id_token:corruptSignature?jwt.slice(0,-8)+'invalidx':jwt,token_type:'Bearer',expires_in:3600})
    }
    if(url.includes('oauth/access_token') || url.includes('/oauth2/token')) return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,scope:'identify email read:user user:email'})
    if(url.endsWith('/user/emails')) return Response.json([{email,primary:true,verified}])
    if(url.endsWith('/user')) return Response.json({id:Number(identity),login:'provider_handle',name:'Private provider name',email,avatar_url:'https://example.test/private.jpg'})
    if(decodeURIComponent(url).endsWith('/users/@me')) return Response.json({id:identity,username:'provider_handle',global_name:'Private provider name',avatar:'synthetic-avatar',discriminator:'0',email,verified})
    if(url==='https://api.resend.com/emails') return Response.json({id:'synthetic-mail'})
    throw new Error('Unexpected provider request: '+url)
  }))
  async function begin(provider: SocialProvider, mode: 'login'|'register' = 'register', username = 'member', newsletter = false, client?: string) {
    const verifier = 'a'.repeat(64)
    const initial = await call('/auth/sso','POST',{provider,mode,username,newsletter,rulesVersion:COMMUNITY_RULES_VERSION,challenge:await digest(verifier),...(client?{client}:{})},'','',new URL(env.APP_URL!).origin)
    expect(initial.status).toBe(200)
    const {url} = await initial.json(), start = await handleCommunity(new Request(url),env)
    expect(start.status).toBe(302)
    const authorization = new URL(start.headers.get('Location')!)
    expect(authorization.searchParams.get('redirect_uri')).toBe(env.AUTH_BASE_URL+'/callback/'+provider)
    nonce = authorization.searchParams.get('nonce') ?? ''
    const cookie = start.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
    const callback = env.AUTH_BASE_URL+'/callback/'+provider+'?code=synthetic-code&state='+encodeURIComponent(authorization.searchParams.get('state')!)
    return {verifier,callback,cookie,startUrl:url}
  }
  async function complete(provider: SocialProvider, mode: 'login'|'register' = 'register', username = 'member', newsletter = false) {
    const pending = await begin(provider,mode,username,newsletter)
    const callback = await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),env)
    expect(callback.status).toBe(302)
    const location = new URL(callback.headers.get('Location')!)
    expect(location.hash).toMatch(/^#account\/sso\/[a-f0-9]{64}$/)
    expect(callback.headers.get('set-cookie')).toBeNull()
    const code = location.hash.split('/')[2]
    return {...pending,code}
  }
  async function member(provider: SocialProvider = 'github', username = 'member') {
    const pending = await complete(provider,'register',username), result = await call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})
    expect(result.status).toBe(200)
    return result.headers.get('X-Octamod-Session')!
  }
  return {...server,begin,complete,member,invalidateNonce:()=>{nonce='incorrect-nonce'},setGoogleClaims:(claims:Record<string,unknown>,corrupt=false)=>{googleClaims=claims;corruptSignature=corrupt},setIdentity:(value:string,address:string,isVerified=true)=>{identity=value;email=address;verified=isVerified}}
}
describe('social account sign-in',()=>{
  it('enforces the privacy and rules gates on signup and the provider callback',async()=>{
    const f=await fixture(),body={provider:'github',mode:'register',username:'member',rulesVersion:COMMUNITY_RULES_VERSION,challenge:'a'.repeat(64)}
    f.env.PRIVACY_READY='false'
    expect((await f.call('/auth/sso','POST',body)).status).toBe(503)
    expect((await(await f.call('/auth/session')).json()).registrationAvailable).toBe(false)
    f.env.PRIVACY_READY='true'
    expect((await f.call('/auth/sso','POST',{...body,rulesVersion:'outdated'})).status).toBe(400)
    expect((await f.call('/auth/sso','POST',{...body,newsletter:'yes'})).status).toBe(400)
    const pending=await f.begin('github')
    f.db.exec("UPDATE social_flows SET rules_version='outdated'")
    const denied=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
  })
  it.each([false,true])('records rules acceptance and preserves optional news choice %s',async newsletter=>{
    const f=await fixture(),pending=await f.complete('github','register','member',newsletter)
    const result=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})
    expect(result.status).toBe(200)
    const session=result.headers.get('X-Octamod-Session')!,own=await(await f.call('/auth/session','GET',undefined,session)).json()
    expect(f.db.prepare('SELECT version FROM account_policy_acceptances WHERE user_id=?').get(own.user.id)).toEqual({version:COMMUNITY_RULES_VERSION})
    expect(f.db.prepare('SELECT enabled FROM account_news_preferences WHERE user_id=?').get(own.user.id)).toEqual({enabled:Number(newsletter)})
  })
  it.each(['google','github','discord'] as const)('signs up with %s, using the chosen public identity and private signed session',async provider=>{
    const {call,db,member,complete}=await fixture(),session=await member(provider)
    expect(session).toContain('.')
    const own=await(await call('/auth/session','GET',undefined,session)).json()
    expect(own).toMatchObject({admin:false,user:{username:'member',verified:true,displayName:'member'}})
    expect(JSON.stringify(own)).not.toMatch(/member@example|Private provider|synthetic-secret/)
    expect(db.prepare('SELECT name,image FROM auth_users').get()).toEqual({name:'member',image:null})
    expect((await call('/auth/build-access','POST',{},session)).status).toBe(200)
    const returning=await complete(provider,'login')
    expect((await call('/auth/sso/exchange','POST',{code:returning.code,verifier:returning.verifier})).status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:1})
  })
  it('supports the same-origin HttpOnly cookie session fallback',async()=>{
    const f=await fixture()
    f.env.APP_URL='https://api.example.test/'
    f.env.SESSION_TRANSPORT=undefined
    const pending=await f.complete('discord'),exchange=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier},'','','https://api.example.test')
    expect(exchange.status).toBe(200)
    expect(exchange.headers.get('X-Octamod-Session')).toBeNull()
    const cookies=exchange.headers.getSetCookie()
    expect(cookies.some(value=>value.includes('HttpOnly')&&value.includes('Secure'))).toBe(true)
    const request=new Request('https://api.example.test/api/auth/build-access',{method:'POST',headers:{Origin:'https://api.example.test',Cookie:cookies.map(value=>value.split(';')[0]).join('; '),'Content-Type':'application/json'},body:'{}'})
    expect((await handleCommunity(request,f.env)).status).toBe(200)
  })
  it('returns a sign-in the desktop app started to its modwerk:// hand-off page, still bound to the app\'s verifier',async()=>{
    const {begin,call,env,db}=await fixture()
    const refused=await call('/auth/sso','POST',{provider:'github',mode:'login',challenge:await digest('b'.repeat(64)),client:'tablet'},'','',new URL(env.APP_URL!).origin)
    expect(refused.status).toBe(400)
    const pending=await begin('github','register','member',false,'desktop')
    const callback=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),env)
    const location=new URL(callback.headers.get('Location')!)
    expect(location.hash).toMatch(/^#account\/sso-app\/[a-f0-9]{64}$/)
    const code=location.hash.split('/')[2]
    const row=db.prepare('SELECT client,expires FROM social_flows WHERE token_hash=?').get(await digest(code)) as {client:string;expires:number}
    expect(row.client).toBe('desktop')
    expect(row.expires-Math.floor(Date.now()/1000)).toBeGreaterThan(240) // time for the browser's "Open Modwerk?" prompt
    expect((await call('/auth/sso/exchange','POST',{code,verifier:'c'.repeat(64)})).status).toBe(400) // a code caught from the link is useless alone
    expect((await call('/auth/sso/exchange','POST',{code,verifier:pending.verifier})).status).toBe(200)
  })
  it('rejects missing state cookies, handoff theft, replay and expiry',async()=>{
    const {begin,complete,call,env,db}=await fixture(),start=await begin('github')
    const missing=await handleCommunity(new Request(start.callback),env)
    expect(new URL(missing.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
    expect((await handleCommunity(new Request(start.startUrl),env)).status).toBe(400)
    const pending=await complete('github')
    const body={code:pending.code,verifier:pending.verifier}
    expect(JSON.stringify(db.prepare('SELECT * FROM social_flows').all())).not.toContain(pending.code)
    expect((await call('/auth/sso/exchange','POST',{...body,verifier:'b'.repeat(64)})).status).toBe(400)
    expect((await call('/auth/sso/exchange','POST',body)).status).toBe(200)
    expect((await call('/auth/sso/exchange','POST',body)).status).toBe(400)
    const expired=await complete('github','login');db.exec('UPDATE social_flows SET expires=0')
    expect((await call('/auth/sso/exchange','POST',{code:expired.code,verifier:expired.verifier})).status).toBe(400)
  })
  it('rejects a Google ID token with the wrong nonce',async()=>{
    const f=await fixture(),pending=await f.begin('google')
    f.invalidateNonce()
    const denied=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
  })
  it.each([{iss:'https://wrong.example'},{aud:'another-client'},{exp:1},{nonce:undefined}])('rejects invalid Google claims %j',async claims=>{
    const f=await fixture(),pending=await f.begin('google')
    f.setGoogleClaims(claims)
    const denied=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
  })
  it('rejects a Google token with an invalid signature',async()=>{
    const f=await fixture(),pending=await f.begin('google')
    f.setGoogleClaims({},true)
    const denied=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
  })
  it('rechecks registration policy on the callback',async()=>{
    const f=await fixture(),pending=await f.begin('github')
    f.env.REGISTRATION_OPEN='false'
    const denied=await handleCommunity(new Request(pending.callback,{headers:{Cookie:pending.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:0})
  })
  it('requires verified provider email, refuses implicit email linking, and respects registration closure',async()=>{
    const f=await fixture(),existing=await f.member('github')
    f.setIdentity('42','member@example.test',false)
    const unverified=await f.begin('github','login'), denied=await handleCommunity(new Request(unverified.callback,{headers:{Cookie:unverified.cookie}}),f.env)
    expect(new URL(denied.headers.get('Location')!).hash).toBe('#account/sso-error')
    f.setIdentity('another','member@example.test')
    const linking=await f.begin('discord','register','newhandle'), refused=await handleCommunity(new Request(linking.callback,{headers:{Cookie:linking.cookie}}),f.env)
    expect(new URL(refused.headers.get('Location')!).hash).toBe('#account/sso-error?reason=exists')
    f.env.REGISTRATION_OPEN='false'
    expect((await f.call('/auth/sso','POST',{provider:'github',mode:'register',username:'newmember',challenge:'a'.repeat(64)})).status).toBe(503)
    expect((await f.call('/auth/build-access','POST',{},existing)).status).toBe(200)
  })
  it('fails closed without credentials and never exposes arbitrary Better Auth endpoints',async()=>{
    const {call,env}=await fixture()
    env.SSO_GITHUB_CLIENT_SECRET=undefined
    expect((await(await call('/auth/session')).json()).ssoProviders).toEqual(['google','discord'])
    expect((await call('/auth/sso','POST',{provider:'github',mode:'login',challenge:'a'.repeat(64)})).status).toBe(400)
    expect((await call('/auth/sign-in/social','POST',{provider:'google'})).status).toBe(404)
    expect((await call('/auth/sso','POST',{provider:'google',mode:'login',challenge:'a'.repeat(64)},'','','https://evil.example')).status).toBe(403)
    env.AUTH_BASE_URL=undefined
    expect((await call('/auth/sso','POST',{provider:'google',mode:'login',challenge:'a'.repeat(64)})).status).toBe(503)
    env.AUTH_BASE_URL='http://api.example.test/api/auth'
    expect((await(await call('/auth/session')).json()).ssoProviders).toEqual([])
    env.AUTH_BASE_URL='https://api.example.test/wrong-path'
    expect((await(await call('/auth/session')).json()).ssoProviders).toEqual([])
  })
})
describe('member administrator role',()=>{
  it('restores an existing administrator after repeated logout and GitHub sign-in',async()=>{
    const f=await fixture()
    let session=await f.member('github','owner')
    f.db.exec("UPDATE users SET is_admin=1 WHERE username='owner'")
    for(let attempt=0;attempt<2;attempt++){
      const logout=await f.call('/auth/logout','POST',{},session)
      expect(logout.status).toBe(200)
      expect(logout.headers.get('X-Octamod-Session')).toBe('')
      expect(await(await f.call('/auth/session','GET',undefined,session)).json()).toMatchObject({admin:false,user:null})
      const pending=await f.complete('github','login','')
      const exchange=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})
      expect(exchange.status).toBe(200)
      session=exchange.headers.get('X-Octamod-Session')!
      expect(await(await f.call('/auth/session','GET',undefined,session)).json()).toMatchObject({admin:true,user:{username:'owner',verified:true}})
      expect((await f.call('/admin/overview','GET',undefined,session)).status).toBe(200)
    }
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:1})
  })
  it('grants the admin workspace only to a verified member who holds the role',async()=>{
    const f=await fixture(),session=await f.member('github','owner')
    expect((await f.call('/admin/overview')).status).toBe(403)
    expect((await f.call('/admin/overview','GET',undefined,session)).status).toBe(403)
    expect((await (await f.call('/auth/session','GET',undefined,session)).json()).admin).toBe(false)
    f.db.exec("UPDATE users SET is_admin=1 WHERE username='owner'")
    expect((await f.call('/admin/overview','GET',undefined,session)).status).toBe(200)
    expect((await (await f.call('/auth/session','GET',undefined,session)).json()).admin).toBe(true)
    expect((await f.call('/admin/overview')).status).toBe(403)
    f.db.exec("UPDATE users SET suspended=1 WHERE username='owner'")
    expect((await f.call('/admin/overview','GET',undefined,session)).status).toBe(403)
  })
})
describe('administrator account statistics',()=>{
  const dayBefore=(days:number)=>new Date(Date.now()-days*86400000).toISOString().slice(0,10)
  it('reports aggregate member counts and daily sign-ups to administrators only',async()=>{
    const f=await fixture(),session=await f.member('github','owner')
    expect((await f.call('/admin/accounts','GET',undefined,session)).status).toBe(403)
    expect((await f.call('/notifications/unread','GET',undefined,session)).status).toBe(200)
    f.db.exec("UPDATE users SET is_admin=1 WHERE username='owner'")
    const result=await f.call('/admin/accounts','GET',undefined,session),data=await result.json()
    expect(result.status).toBe(200)
    expect(data.totals).toMatchObject({members:1,administrators:1,suspended:0,deleted:0,online:1,activeDay:1,activeWeek:1,activeMonth:1,postersMonth:0})
    expect(data.signups).toEqual({today:1,last7:1,last30:1})
    expect(data.methods.find((row:{method:string})=>row.method==='github').members).toBe(1)
    expect(data.daily).toHaveLength(30)
    expect(data.days).toBe(30)
    expect(data.daily.at(-1)).toEqual({active:1,day:new Date().toISOString().slice(0,10),signups:1,completed:1,visitors:null})
    expect(data.visitorsFrom).toBeNull()
    expect(data.previous).toEqual({from:dayBefore(58),to:dayBefore(30),signups:0,completed:0,visitors:null})
    expect(JSON.stringify(data)).not.toMatch(/@|owner/)
    expect((await f.call('/admin/accounts?days=12','GET',undefined,session)).status).toBe(400)
  })
  it('reads sign-ups against collected daily visitors, completion and activity per period without naming members',async()=>{
    const f=await fixture(),session=await f.member('github','owner')
    f.db.exec("UPDATE users SET is_admin=1 WHERE username='owner'")
    // Two earlier sign-ups: one completed three days ago, one still unverified eight days ago; one completed sign-up before the window.
    const insert=f.db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
    const userRow=f.db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,?)")
    for(const [id,verified,days] of [['u-complete',1,3],['u-pending',0,8],['u-old',1,40]] as const){const at=new Date(Date.now()-days*86400000).toISOString();insert.run(id,'Private name',id+'@example.test',verified,at,at);userRow.run(id,'Private name',id,verified)}
    // A member last seen nine days ago is active this month but not this week; a stale post counts in 30 days but not after.
    f.db.prepare('INSERT INTO member_presence(user_id,seen_at) VALUES(?,?)').run('u-complete',Math.floor(Date.now()/1000)-9*86400)
    f.db.prepare("INSERT INTO forum_threads(id,user_id,title,category,created_at,updated_at) VALUES('t-1','u-old','Hello','general',?,?)").run(dayBefore(20)+' 10:00:00',dayBefore(20)+' 10:00:00')
    f.db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES('t-1','t-1','u-old','Hello',?)").run(dayBefore(20)+' 10:00:00')
    f.db.prepare("INSERT INTO usage_meta(key,value) VALUES('collection_started',?)").run(dayBefore(5)+'T09:00:00.000Z')
    const usage=f.db.prepare('INSERT INTO usage_daily(day,visitors) VALUES(?,?)')
    for(const [days,visitors] of [[5,10],[4,50],[3,100],[2,40],[0,7]] as const)usage.run(dayBefore(days),visitors)
    const data=await(await f.call('/admin/accounts?days=7','GET',undefined,session)).json()
    expect(data.days).toBe(7); expect(data.daily).toHaveLength(7); expect(data.visitorsFrom).toBe(dayBefore(5))
    expect(data.totals).toMatchObject({members:3,unverified:1,online:0,activeWeek:0,activeMonth:1,postersMonth:1})
    expect(data.signups).toEqual({today:1,last7:2,last30:3})
    expect(data.daily.map((row:{visitors:number|null})=>row.visitors)).toEqual([null,10,50,100,40,0,7])
    expect(data.daily[3]).toEqual({day:dayBefore(3),signups:1,completed:1,visitors:100,active:null})
    expect(data.daily.at(-1)).toMatchObject({signups:1,completed:1,visitors:7})
    expect(data.previous).toEqual({from:dayBefore(12),to:dayBefore(7),signups:1,completed:0,visitors:null})
    const month=await(await f.call('/admin/accounts?days=30','GET',undefined,session)).json()
    expect(month.previous).toMatchObject({signups:1,completed:1,visitors:null})
    expect(JSON.stringify(data)+JSON.stringify(month)).not.toMatch(/@|owner|Private name|token-old/)
  })
})
describe('social onboarding from either account entry point',()=>{
  it.each((['google','github','discord'] as const).flatMap(provider=>(['login','register'] as const).map(mode=>[provider,mode] as const)))('authenticates %s from %s without a username, then activates only after rules confirmation',async(provider,mode)=>{
    const f=await fixture(),pending=await f.complete(provider,mode,'')
    const exchanged=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})
    expect(exchanged.status).toBe(200)
    expect(exchanged.headers.get('X-Octamod-Session')).toBeNull()
    expect(exchanged.headers.get('Set-Cookie')).toBeNull()
    const {onboarding}=await exchanged.json()
    // GitHub and Discord suggest their public handle; Google has none and keeps a generated name.
    expect(onboarding.username).toMatch(provider==='google'?/^member_[a-f0-9]{12}$/:/^provider_handle$/)
    expect((await f.call('/forum/profiles/'+onboarding.username)).status).toBe(404)
    expect(JSON.stringify(onboarding)).not.toMatch(/Private provider|member@example|synthetic-access/)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM account_policy_acceptances').get()).toEqual({count:0})
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM account_news_preferences').get()).toEqual({count:0})
    const flow=f.db.prepare('SELECT payload FROM social_flows WHERE token_hash=?').get(await digest(onboarding.code)) as {payload:string}
    const held=JSON.parse(await symmetricDecrypt({key:f.env.AUTH_SECRET!,data:flow.payload})).session
    expect((await(await f.call('/auth/session','GET',undefined,held)).json()).user).toBeNull()
    for(const path of ['/auth/data-export','/auth/account-removal'])expect((await f.call(path,'POST',{},held)).status).toBe(401)
    for(const path of ['/auth/profile','/auth/sessions','/auth/news'])expect((await f.call(path,'GET',undefined,held)).status).toBe(401)
    expect((await f.call('/forum/threads','POST',{title:'Blocked',body:'Pending',category:'general'},held)).status).toBe(401)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM member_discord_invites').get()).toEqual({count:1})
    // Simulate a social signup begun before the inline welcome rollout.
    f.db.exec('DELETE FROM member_discord_invites')
    const body={code:onboarding.code,verifier:pending.verifier,username:'',rulesVersion:COMMUNITY_RULES_VERSION,newsletter:false}
    expect((await f.call('/auth/sso/complete','POST',{...body,rulesVersion:'outdated'})).status).toBe(400)
    const completed=await f.call('/auth/sso/complete','POST',body)
    expect(completed.status).toBe(200)
    const session=completed.headers.get('X-Octamod-Session')!
    const own=await(await f.call('/auth/session','GET',undefined,session)).json()
    expect(own).toMatchObject({admin:false,user:{username:onboarding.username,displayName:onboarding.username,verified:true}})
    expect(await(await f.call('/auth/discord-invite','POST',{},session)).json()).toEqual({show:false})
    expect(f.db.prepare('SELECT version FROM account_policy_acceptances WHERE user_id=?').get(own.user.id)).toEqual({version:COMMUNITY_RULES_VERSION})
    expect(f.db.prepare('SELECT enabled FROM account_news_preferences WHERE user_id=?').get(own.user.id)).toEqual({enabled:0})
    expect((await f.call('/auth/build-access','POST',{},session)).status).toBe(200)
    expect((await f.call('/forum/profiles/'+onboarding.username)).status).toBe(200)
    expect((await f.call('/auth/sso/complete','POST',body)).status).toBe(400)
    expect((await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})).status).toBe(400)
    const returning=await f.complete(provider,mode,'')
    const signedIn=await f.call('/auth/sso/exchange','POST',{code:returning.code,verifier:returning.verifier})
    expect(signedIn.status).toBe(200)
    expect(signedIn.headers.get('X-Octamod-Session')).toContain('.')
    expect(await signedIn.json()).toEqual({ok:true})
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM auth_users').get()).toEqual({count:1})
  })
  it('allows an optional username and explicit news consent, with retry after duplicates and invalid proof',async()=>{
    const f=await fixture();await f.member('github','already_used')
    f.setIdentity('43','new@example.test')
    const pending=await f.complete('discord','login',''),exchange=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier}),{onboarding}=await exchange.json()
    const body={code:onboarding.code,verifier:pending.verifier,username:'already_used',rulesVersion:COMMUNITY_RULES_VERSION,newsletter:true}
    expect((await f.call('/auth/sso/complete','POST',body)).status).toBe(409)
    expect((await f.call('/auth/sso/complete','POST',{...body,username:'modwerk'})).status).toBe(400)
    expect((await f.call('/auth/sso/complete','POST',{...body,verifier:'b'.repeat(64)})).status).toBe(400)
    expect((await f.call('/auth/sso/complete','POST',{...body,newsletter:'yes'})).status).toBe(400)
    const completed=await f.call('/auth/sso/complete','POST',{...body,username:'My_Choice'}),session=completed.headers.get('X-Octamod-Session')!
    expect(completed.status).toBe(200)
    const own=await(await f.call('/auth/session','GET',undefined,session)).json()
    expect(own.user.username).toBe('my_choice')
    expect(f.db.prepare('SELECT enabled FROM account_news_preferences WHERE user_id=?').get(own.user.id)).toEqual({enabled:1})
  })
  it('retains returning login from either entry point when registration is closed, but never activates a new pending account',async()=>{
    const f=await fixture();await f.member('google')
    f.env.REGISTRATION_OPEN='false'
    for(const mode of ['login','register'] as const){
      const returning=await f.complete('google',mode,'')
      expect((await f.call('/auth/sso/exchange','POST',{code:returning.code,verifier:returning.verifier})).headers.get('X-Octamod-Session')).toContain('.')
    }
    f.env.REGISTRATION_OPEN='true';f.setIdentity('43','new@example.test')
    const pending=await f.complete('discord','login',''),exchange=await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier}),{onboarding}=await exchange.json()
    f.env.PRIVACY_READY='false'
    expect((await f.call('/auth/sso/complete','POST',{code:onboarding.code,verifier:pending.verifier,rulesVersion:COMMUNITY_RULES_VERSION})).status).toBe(503)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM social_pending_accounts').get()).toEqual({count:1})
  })
  it('expires abandoned signup and removes its private identity and all held sessions',async()=>{
    const f=await fixture(),pending=await f.complete('github','login','')
    f.db.exec('UPDATE social_pending_accounts SET expires=0; UPDATE social_flows SET expires=0')
    expect((await f.call('/auth/sso/exchange','POST',{code:pending.code,verifier:pending.verifier})).status).toBe(400)
    await cleanupAccounts(f.env.DB!)
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM users WHERE id NOT IN ('administrator','modwerk','tars')").get()).toEqual({count:0})
    for(const table of ['social_pending_accounts','auth_users','auth_accounts','auth_sessions','social_flows'])expect(f.db.prepare('SELECT COUNT(*) AS count FROM '+table).get()).toEqual({count:0})
  })
})
describe('profile editing and self-service account deletion',()=>{
  it('exports only the social member’s data and requires fresh sign-in for privacy actions',async()=>{
    const f=await fixture(),session=await f.member('github','first')
    f.setIdentity('43','second@example.test');await f.member('discord','second')
    const members=f.db.prepare('SELECT id,username FROM users WHERE username IN (?,?)').all('first','second'),first=members.find(row=>row.username==='first')!,second=members.find(row=>row.username==='second')!
    f.db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body) VALUES('triage-export','miniverb','author',?,'Title','Body')").run(second.id)
    for(const [actor,note] of [[first.id,'Own triage note'],[second.id,'Other private triage note']])f.db.prepare("INSERT INTO issue_triage_events(id,issue_id,actor,triage_state,report_kind,note) VALUES(?,'triage-export',?,'needs_info','bug',?)").run(String(actor),actor,note)
    for(const member of [first,second])f.db.prepare('INSERT INTO octatrack_diagnostic_events(user_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run(member.id,String(member.id),'test',JSON.stringify({event:'sync_failed',refusal:3}),new Date().toISOString())
    expect((await f.call('/working-reports','POST',{testedModuleIds:['miniverb']},session)).status).toBe(200)
    const exported=await f.call('/auth/data-export','POST',{},session)
    expect(exported.status).toBe(200)
    const text=await exported.text()
    expect(JSON.parse(text).data.workingReports).toEqual([expect.objectContaining({module_id:'miniverb',module_version:null,build_json:null})])
    expect(text).toContain('member@example.test')
    expect(JSON.parse(text).data.issueTriageActions).toEqual([expect.objectContaining({note:'Own triage note'})])
    expect(JSON.parse(text).data.octatrackDiagnostics).toEqual([expect.objectContaining({event_id:first.id})])
    expect(text).not.toContain('Other private triage note')
    expect(text).not.toMatch(/second@example|synthetic-access|password|session_token/)
    expect((await f.call('/auth/account-removal','POST',{confirm:'REQUEST'},session)).status).toBe(202)
    f.db.exec('UPDATE auth_sessions SET createdAt=0')
    expect((await f.call('/auth/data-export','POST',{},session)).status).toBe(403)
    expect((await f.call('/auth/account-removal','POST',{confirm:'REQUEST'},session)).status).toBe(403)
  })
  it('updates only the owner’s public profile, preserves email and rejects duplicate/reserved usernames',async()=>{
    const f=await fixture(),first=await f.member('github','first')
    f.setIdentity('43','second@example.test');const second=await f.member('github','second')
    const profile={username:'Renamed',displayName:'New display',bio:'Original bio',userId:'other'}
    expect((await f.call('/auth/profile','PATCH',profile,first)).status).toBe(200)
    expect(await(await f.call('/auth/profile','GET',undefined,first)).json()).toMatchObject({username:'renamed',displayName:'New display',bio:'Original bio',email:'member@example.test'})
    expect(await(await f.call('/auth/profile','GET',undefined,second)).json()).toMatchObject({username:'second',email:'second@example.test'})
    expect((await f.call('/auth/profile','PATCH',{...profile,username:'second'},first)).status).toBe(409)
    expect((await f.call('/auth/profile','PATCH',{...profile,username:'modwerk'},first)).status).toBe(400)
    expect((await f.call('/auth/profile','PATCH',profile)).status).toBe(401)
  })
  it('deletes private data and all sessions while keeping anonymized discussions and other members',async()=>{
    const f=await fixture(),first=await f.member('github','first'),profile=await(await f.call('/auth/profile','GET',undefined,first)).json()
    const own=await(await f.call('/auth/session','GET',undefined,first)).json(),id=own.user.id
    f.db.prepare('INSERT INTO octatrack_diagnostic_consent(user_id,enabled,version,changed_at) VALUES(?,1,?,?)').run(id,'test',new Date().toISOString())
    f.db.prepare('INSERT INTO octatrack_diagnostic_events(user_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run(id,'delete-test','test','{}',new Date().toISOString())
    const created=await f.call('/forum/threads','POST',{title:'A shared discussion',body:'Keep the conversation',category:'general'},first),thread=(await created.json()).id
    expect(created.status).toBe(201)
    f.setIdentity('43','second@example.test');const second=await f.member('github','second')
    await f.call('/modules/miniverb/rating','POST',{value:5},first)
    const other=f.db.prepare("SELECT id FROM users WHERE username='second'").get()!
    f.db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body) VALUES('triage-delete','miniverb','author',?,'Title','Body')").run(other.id)
    f.db.prepare("INSERT INTO issue_triage_events(id,issue_id,actor,triage_state,report_kind,note) VALUES('owned-action','triage-delete',?,'needs_info','bug','Private maintainer note')").run(id)
    await f.call('/working-reports','POST',{testedModuleIds:['miniverb']},first)
    expect((await f.call('/auth/account','DELETE',{confirm:'no'},first)).status).toBe(400)
    expect(profile.passwordRequired).toBe(false)
    expect((await f.call('/auth/account','DELETE',{confirm:'DELETE'},first)).status).toBe(200)
    expect(f.db.prepare('SELECT id FROM auth_users WHERE id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT id FROM auth_sessions WHERE userId=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT * FROM ratings WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare("SELECT id FROM issue_triage_events WHERE id='owned-action'").get()).toBeUndefined()
    expect(f.db.prepare("SELECT id FROM issues WHERE id='triage-delete'").get()).toBeDefined()
    expect(f.db.prepare('SELECT * FROM module_working_reports WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT * FROM account_policy_acceptances WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT * FROM account_news_preferences WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT * FROM octatrack_diagnostic_events WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT * FROM octatrack_diagnostic_consent WHERE user_id=?').get(id)).toBeUndefined()
    expect(f.db.prepare('SELECT username,display_name,suspended FROM users WHERE id=?').get(id)).toEqual({username:null,display_name:'Deleted member',suspended:1})
    expect((await f.call('/auth/profile','GET',undefined,first)).status).toBe(401)
    expect((await f.call('/forum/threads/'+thread)).status).toBe(200)
    expect((await(await f.call('/forum/threads/'+thread)).json()).posts[0].username).toBeNull()
    expect((await f.call('/auth/build-access','POST',{},second)).status).toBe(200)
    expect(await(await f.call('/auth/profile','GET',undefined,second)).json()).toMatchObject({username:'second',email:'second@example.test'})
  })
  it('requires a recent social login or the correct password for deletion',async()=>{
    const f=await fixture(),session=await f.member(),own=await(await f.call('/auth/session','GET',undefined,session)).json()
    f.db.exec('UPDATE auth_sessions SET createdAt=0')
    expect((await f.call('/auth/account','DELETE',{confirm:'DELETE'},session)).status).toBe(403)
    const password='original sufficiently long password'
    f.db.prepare('INSERT INTO auth_accounts(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)').run('credential',own.user.id,'credential',own.user.id,await hashPassword(password),Date.now(),Date.now())
    expect((await f.call('/auth/account','DELETE',{confirm:'DELETE',password:'wrong password'},session)).status).toBe(403)
    expect((await f.call('/auth/account','DELETE',{confirm:'DELETE',password},session)).status).toBe(200)
  })
  it('keeps forum reading public, requires a current member for interaction and lets guests build',async()=>{
    const f=await fixture(),session=await f.member()
    expect((await f.call('/forum/threads')).status).toBe(200)
    expect((await f.call('/auth/build-access','POST',{})).status).toBe(200)
    for(const [path,body] of [['/modules/miniverb/comments',{body:'A comment'}],['/modules/miniverb/rating',{value:5}],['/forum/threads',{title:'Thread',body:'Text',category:'general'}]] as const)expect((await f.call(path,'POST',body)).status).toBe(401)
    f.db.exec('UPDATE auth_sessions SET expiresAt=0')
    expect((await f.call('/auth/build-access','POST',{},session)).status).toBe(200)
  })
})
