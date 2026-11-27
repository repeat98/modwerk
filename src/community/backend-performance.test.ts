import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountAuth, withAccountAuth } from '../../server/accounts'
import { schemaCheckFor } from '@better-auth/core/db/internal'
import { ensureModuleThreadsOnce } from '../../server/module-threads'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { testServer } from './test-server'

const databases: Array<{close():void}>=[]
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const db of databases.splice(0))db.close()})
async function fixture(){
 const service=await testServer();databases.push(service.db)
 return service
}
async function member(){
 const service=await fixture()
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'simulated-email'})))
 const password='a diagnostic password with enough words',email='performance@example.test'
 const registered=await service.call('/auth/register','POST',{username:'performance_member',email,password,rulesVersion:COMMUNITY_RULES_VERSION})
 expect(registered.status).toBe(202)
 service.db.prepare('UPDATE auth_users SET emailVerified=1').run()
 service.db.prepare('UPDATE users SET email_verified=1').run()
 const login=await service.call('/auth/login','POST',{email,password})
 expect(login.status).toBe(200)
 const token=login.headers.get('X-Octamod-Session')!
 expect(token).toBeTruthy()
 return {...service,token}
}
describe('community request database budgets',()=>{
 it('does not initialize account schema for anonymous session or catalog reads',async()=>{
  const {env,call}=await fixture(),prepare=vi.spyOn(env.DB!,'prepare')
  expect((await call('/auth/session')).status).toBe(200)
  expect(prepare).not.toHaveBeenCalled()
  expect((await call('/catalog')).status).toBe(200)
  expect(prepare).toHaveBeenCalledTimes(1)
 })
 it('reuses auth only within one request and observes secret rotation',async()=>{
  const {env}=await fixture(),db=env.DB!
  const first=withAccountAuth(()=>{
   const auth=accountAuth(env,db)
   expect(accountAuth({...env},db)).toBe(auth)
   expect(accountAuth({...env,AUTH_SECRET:'a different auth secret with sufficient entropy'},db)).not.toBe(auth)
   return auth
  })
  expect(withAccountAuth(()=>accountAuth(env,db))).not.toBe(first)
 })
 it('validates the migrated account schema explicitly without background request checks',async()=>{
  const {env}=await fixture(),auth=accountAuth(env,env.DB!)
  const check=schemaCheckFor((await auth.$context).adapter)
  expect(check).toBeTypeOf('function')
  await check!()
 })
 it('resolves a member once per request and observes suspension on the next request',async()=>{
  const {env,db,call,token}=await member(),prepare=vi.spyOn(env.DB!,'prepare')
  const session=await (await call('/auth/session','GET',undefined,token)).json()
  expect(session.user.username).toBe('performance_member')
  expect(prepare.mock.calls.length).toBeLessThanOrEqual(4)
  expect(prepare.mock.calls.some(([sql])=>sql.includes('sqlite_master'))).toBe(false)
  db.prepare('UPDATE users SET suspended=1').run()
  const suspended=await (await call('/auth/session','GET',undefined,token)).json()
  expect(suspended).toMatchObject({user:null,admin:false})
 })
 it('keeps a stalled member lookup from blocking the next request',async()=>{
  const {env,call,token}=await member(),db=env.DB!,prepare=db.prepare.bind(db)
  let release!:()=>void,started!:()=>void,parkNext=true
  const parked=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{started=resolve})
  vi.spyOn(db,'prepare').mockImplementation(sql=>{
   const statement=prepare(sql)
   if(!parkNext||!sql.includes('"auth_sessions"'))return statement
   parkNext=false
   const bind=statement.bind.bind(statement)
   return {...statement,bind(...values){
    const bound=bind(...values),all=bound.all.bind(bound)
    return {...bound,async all(){started();await parked;return all()}}
   }}
  })
  const first=call('/auth/session','GET',undefined,token)
  await entered
  const next=call('/auth/session','GET',undefined,token)
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
   const result=await Promise.race([next,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1000)})])
   expect(result,'a separate request must not wait for the stalled adapter').not.toBeNull()
   expect(await result!.json()).toMatchObject({user:{username:'performance_member'}})
  }finally{
   clearTimeout(timer);release();await Promise.all([first,next])
  }
 })
 it('returns correct member statistics with at most six queries and no schema inspection',async()=>{
  const {env,db,call,token}=await member()
  // Steady state: the once-per-process thread check has already run, so it costs this request nothing.
  await ensureModuleThreadsOnce(env.DB!)
  const id=(db.prepare('SELECT id FROM users WHERE username=?').get('performance_member') as {id:string}).id
  db.prepare('INSERT INTO ratings(module_id,user_id,value) VALUES(?,?,?)').run('digitakt-digiutils',id,4)
  db.prepare('INSERT INTO likes(module_id,user_id) VALUES(?,?)').run('digitakt-digiutils',id)
  db.prepare("UPDATE module_download_meta SET value=? WHERE key='collection_started'").run('2026-10-01T00:00:00Z')
  for(const [post,hidden] of [['count-visible',0],['count-hidden',1]] as const)db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body,hidden) VALUES(?,?,?,?,?)').run(post,'module-digitakt-digiutils',id,'A comment',hidden)
  const prepare=vi.spyOn(env.DB!,'prepare')
  const data=await (await call('/modules/digitakt-digiutils','GET',undefined,token)).json()
  expect(data).toMatchObject({ratings:{average:4,count:1},ownRating:4,likes:1,liked:true,downloads:0,downloadsStarted:'2026-10-01T00:00:00Z',discussionCount:1})
  expect(prepare.mock.calls.length).toBeLessThanOrEqual(6)
  expect(prepare.mock.calls.some(([sql])=>sql.includes('sqlite_master'))).toBe(false)
  const anonymous=await (await call('/modules/digitakt-digiutils')).json()
  expect(anonymous).toMatchObject({ratings:{average:4,count:1},ownRating:0,likes:1,liked:false})
 })

 it('shares cold forum initialization across concurrent home-page reads',async()=>{
  const {env,call}=await fixture(),prepare=vi.spyOn(env.DB!,'prepare')
  const responses=await Promise.all(['/forum/threads','/forum/categories','/forum/machines'].map(path=>call(path)))
  expect(responses.map(response=>response.status)).toEqual([200,200,200])
  expect(prepare.mock.calls.filter(([sql])=>sql.includes("WHERE id>='module-'")).length).toBe(1)
 })
 it('keeps signed-in catalog, chat, forum and statistics reads within their budgets',async()=>{
  const {env,db,call,token}=await member()
  db.prepare('UPDATE users SET is_admin=1').run()
  await call('/forum/threads')
  const prepare=vi.spyOn(env.DB!,'prepare')
  for(const [path,budget] of [
   ['/catalog',1],['/forum/shouts?compact=1',4],['/forum/threads',4],
   // A member's thread view also records the last post they received, so it writes once.
   ['/forum/threads/module-digitakt-digiutils',9],
   // Each period reads page totals once; the 7-day view also reads its hours.
   ['/admin/statistics?days=7',8],['/admin/statistics?days=30',7],['/admin/insights',8],
  ] as const){
   prepare.mockClear()
   expect((await call(path,'GET',undefined,token)).status,path).toBe(200)
   expect(prepare.mock.calls.length,path).toBeLessThanOrEqual(budget)
   expect(prepare.mock.calls.some(([sql])=>sql.includes('sqlite_master')),path).toBe(false)
  }
  db.prepare('UPDATE users SET is_admin=0').run()
  expect((await call('/admin/statistics?days=7','GET',undefined,token)).status).toBe(403)
 })
})
