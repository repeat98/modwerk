import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { privacyDeadline } from '../../server/privacy-deadline'
import { PrivacyPage } from './PrivacyPage'
import { LegalPage, CONTENT_REPORT_MAILTO } from '../legal/LegalPage'
import { COMMUNITY_RULES_VERSION, OPERATOR, USAGE_CONSENT_VERSION } from '../legal/policy'
const databases:DatabaseSync[]=[],messages:{to:string[];text:string}[]=[]
const password='synthetic privacy test passphrase'
beforeEach(()=>{messages.length=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{messages.push(JSON.parse(String(options.body)));return Response.json({id:'fictional-delivery'})}))})
afterEach(()=>{vi.unstubAllGlobals();for(const db of databases.splice(0))db.close()})
async function fixture(){
 const server=await testServer();databases.push(server.db)
 async function member(username:string){
  const email=username+'@example.test'
  expect((await server.call('/auth/register','POST',{rulesVersion:COMMUNITY_RULES_VERSION,username,email,password})).status).toBe(202)
  const actionToken=messages.find(item=>item.to[0]===email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
  expect((await server.call('/auth/verify','POST',{token:actionToken,password})).status).toBe(200)
  const token=(await server.call('/auth/login','POST',{email,password})).headers.get('X-Octamod-Session')!
  const id=String(server.db.prepare('SELECT id FROM users WHERE username=?').get(username)!.id)
  return {email,token,id}
 }
 return {...server,member}
}
describe('compliance access boundaries',()=>{
 it('requires reviewed privacy setup and separate, current rules acceptance for registration',async()=>{
  const {call,env,db}=await fixture()
  const body={username:'policy',email:'policy@example.test',password}
  expect((await call('/auth/register','POST',body)).status).toBe(400)
  expect((await call('/auth/register','POST',{...body,rulesVersion:'old'})).status).toBe(400)
  expect(db.prepare('SELECT count(*) AS count FROM auth_users').get()).toEqual({count:0})
  env.PRIVACY_READY='false'
  expect((await call('/auth/register','POST',{...body,rulesVersion:COMMUNITY_RULES_VERSION})).status).toBe(503)
  expect(await(await call('/auth/session')).json()).toMatchObject({emailAvailable:true,registrationAvailable:false})
  env.PRIVACY_READY='true'
  expect((await call('/auth/register','POST',{...body,rulesVersion:COMMUNITY_RULES_VERSION})).status).toBe(202)
  expect(db.prepare('SELECT version FROM account_policy_acceptances').get()).toEqual({version:COMMUNITY_RULES_VERSION})
  expect(db.prepare('SELECT count(*) AS count FROM usage_events').get()).toEqual({count:0})
 })
 it('records agreement even if the requested verification email cannot be delivered',async()=>{
  const {call,db}=await fixture();vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})))
  expect((await call('/auth/register','POST',{rulesVersion:COMMUNITY_RULES_VERSION,username:'mailfail',email:'mailfail@example.test',password})).status).toBe(202)
  expect(db.prepare('SELECT version FROM account_policy_acceptances').get()).toEqual({version:COMMUNITY_RULES_VERSION})
 })
 it('requires a verified owner and password, exports all own rows and no credentials or other member content',async()=>{
  const {call,member,db}=await fixture(),owner=await member('exporter'),other=await member('otherexport')
  expect((await call('/auth/data-export','POST',{password})).status).toBe(401)
  expect((await call('/auth/data-export','POST',{password:'incorrect long password'},owner.token)).status).toBe(403)
  expect((await call('/auth/data-export','GET',undefined,owner.token)).status).toBe(405)
  expect((await call('/auth/data-export','POST',{password},owner.token,'','https://evil.test')).status).toBe(403)
  for(let i=0;i<105;i++)db.prepare('INSERT INTO comments(id,module_id,user_id,body) VALUES(?,?,?,?)').run('own-'+i,'miniverb',owner.id,'own comment '+i)
  db.prepare('INSERT INTO comments(id,module_id,user_id,body) VALUES(?,?,?,?)').run('other-comment','miniverb',other.id,'other private text')
  // Legacy comment exports now come from their migrated forum posts.
  db.exec(readFileSync(new URL('../../migrations/0028_unified_module_discussions.sql',import.meta.url),'utf8'))
  db.prepare('INSERT INTO issues(id,module_id,author_login,reporter_id,title,body) VALUES(?,?,?,?,?,?)').run('own-issue','miniverb','author',owner.id,'private issue','own report')
  db.prepare('INSERT INTO issue_logs(issue_id,text,bytes,summary_json) VALUES(?,?,?,?)').run('own-issue','own synthetic log',17,'{}')
  db.prepare('INSERT INTO configurations(id,user_id,name,modules_json) VALUES(?,?,?,?)').run('own-config',owner.id,'local legacy choice','[]')
  const ownThread=await(await call('/forum/threads','POST',{title:'Own thread',body:'own post',category:'general'},owner.token)).json()
  expect(ownThread).toHaveProperty('id')
  await call('/forum/threads/'+ownThread.id+'/posts','POST',{body:'another members reply'},other.token)
  db.prepare('UPDATE forum_posts SET hidden=1 WHERE user_id=?').run(owner.id)
  const rawCredentials=JSON.stringify(db.prepare('SELECT password,accessToken,refreshToken FROM auth_accounts WHERE userId=?').all(owner.id))
  const result=await call('/auth/data-export','POST',{password,userId:other.id},owner.token),text=await result.text(),exported=JSON.parse(text)
  expect(result.status).toBe(200);expect(result.headers.get('Cache-Control')).toBe('no-store');expect(result.headers.get('Content-Disposition')).toContain('attachment')
  expect(exported.data.account[0]).toMatchObject({id:owner.id,email:owner.email})
  expect(exported.data.comments).toHaveLength(105);expect(exported.data.configurations).toHaveLength(1);expect(exported.data.issueLogs[0].text).toBe('own synthetic log')
  expect(exported.data.posts.find((post:{body:string})=>post.body==='own post')).toMatchObject({body:'own post',hidden:1})
  expect(exported.data.policyAcceptances[0].version).toBe(COMMUNITY_RULES_VERSION)
  for(const secret of [other.email,other.id,'another members reply','other private text',owner.token,'password','accessToken','refreshToken','review_note'])expect(text).not.toContain(secret)
  expect(text).not.toContain(rawCredentials)
 })
 it('cannot complete removal while rules-acceptance personal records remain',async()=>{
  const {call,member,db}=await fixture(),owner=await member('erasure')
  const request=await(await call('/auth/account-removal','POST',{password,confirm:'REQUEST'},owner.token)).json()
  const admin=(await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
  db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(owner.id)
  db.prepare('DELETE FROM auth_verifications WHERE value=?').run(owner.id)
  db.prepare('DELETE FROM auth_users WHERE id=?').run(owner.id)
  db.prepare("UPDATE users SET username=NULL,email_verified=0,suspended=1,display_name='Deleted member' WHERE id=?").run(owner.id)
  expect((await call('/admin/account-requests/'+request.id,'PATCH',{status:'completed',note:'Verified private removal'},'',admin)).status).toBe(409)
  db.prepare('DELETE FROM account_policy_acceptances WHERE user_id=?').run(owner.id)
  expect((await call('/admin/account-requests/'+request.id,'PATCH',{status:'completed',note:'Push data still present'},'',admin)).status).toBe(409)
  db.prepare('DELETE FROM signup_events WHERE user_id=?').run(owner.id)
  expect((await call('/admin/account-requests/'+request.id,'PATCH',{status:'completed',note:'Verified private removal'},'',admin)).status).toBe(200)
 })
 it('rejects absent/stale count consent before storing anything and allows its trusted-origin preflight',async()=>{
  const {env,db}=await fixture()
  for(const path of ['/usage/events','/usage/module-downloads']){
   for(const consent of [undefined,'old']){
    const headers:Record<string,string>={Origin:'https://octamod.test','Content-Type':'application/json'}
    if(consent)headers['X-Octamod-Usage-Consent']=consent
    const result=await handleCommunity(new Request('https://api.example.test/api'+path,{method:'POST',headers,body:'{}'}),env)
    expect(result.status).toBe(403)
   }
  }
  for(const table of ['usage_events','usage_visitors','usage_daily','module_download_events','module_downloads','rate_limits'])expect(db.prepare('SELECT count(*) AS count FROM '+table).get()).toEqual({count:0})
  const current=await handleCommunity(new Request('https://api.example.test/api/usage/events',{method:'POST',headers:{Origin:'https://octamod.test','Content-Type':'application/json','X-Octamod-Usage-Consent':USAGE_CONSENT_VERSION},body:'{}'}),env)
  expect(current.status).toBe(400)
  const preflight=await handleCommunity(new Request('https://api.example.test/api/usage/events',{method:'OPTIONS',headers:{Origin:'https://octamod.test','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type,X-Octamod-Usage-Consent'}}),env)
  expect(preflight.status).toBe(204);expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('X-Octamod-Usage-Consent')
 })
 it('provides the same initial calendar deadline to the owner and separately authorized administrator',async()=>{
  const {call,member}=await fixture(),owner=await member('deadline')
  const request=await(await call('/auth/account-removal','POST',{password,confirm:'REQUEST'},owner.token)).json()
  expect(request.responseDueAt).toBe(privacyDeadline(request.created_at))
  const own=await(await call('/auth/account-removal','GET',undefined,owner.token)).json();expect(own.responseDueAt).toBe(request.responseDueAt)
  const admin=(await(await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
  const queue=await(await call('/admin/account-requests','GET',undefined,'',admin)).json();expect(queue[0].responseDueAt).toBe(request.responseDueAt)
 })
})
describe('public legal information',()=>{
 it.each([['2026-01-31 12:00:00','2026-02-28T12:00:00.000Z'],['2028-01-31 12:00:00','2028-02-29T12:00:00.000Z'],['2026-12-15 00:00:00','2027-01-15T00:00:00.000Z']])('calculates a calendar month from %s',(created,due)=>expect(privacyDeadline(created)).toBe(due))
 it('publishes supplied operator details and an unauthenticated human reporting channel',()=>{
  const imprint=renderToStaticMarkup(createElement(LegalPage,{route:'impressum'})),report=renderToStaticMarkup(createElement(LegalPage,{route:'report-content'})),privacy=renderToStaticMarkup(createElement(PrivacyPage))
  for(const value of [OPERATOR.name,OPERATOR.street,OPERATOR.locality])expect(imprint).toContain(value)
  expect(report).toContain('No account required');expect(report).toContain('2011/93/EU');expect(CONTENT_REPORT_MAILTO).toContain('mailto:support@modwerk.app')
  expect(privacy).toContain('off by default');expect(privacy).toContain(OPERATOR.complaintsUrl);expect(privacy).toContain('Deutsch');expect(privacy).not.toMatch(/type="checkbox"[^>]*checked/)
 })
})
