import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { communityModule } from './modules'
import { testServer } from './test-server'

const databases:DatabaseSync[]=[]
const sent:{to:string[];text:string}[]=[]
const password='forum profile test passphrase'
beforeEach(()=>{sent.length=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{sent.push(JSON.parse(String(options.body)));return Response.json({id:crypto.randomUUID()})}))})
afterEach(()=>{vi.unstubAllGlobals();for(const db of databases.splice(0))db.close()})
async function fixture(){
  const server=await testServer();databases.push(server.db)
  async function member(username:string){
    const email=username+'@example.test'
    expect((await server.call('/auth/register','POST',{rulesVersion:COMMUNITY_RULES_VERSION,username,email,password})).status).toBe(202)
    const token=[...sent].reverse().find(item=>item.to[0]===email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify','POST',{token,password})).status).toBe(200)
    const login=await server.call('/auth/login','POST',{email,password})
    expect(login.status).toBe(200)
    return {token:login.headers.get('X-Octamod-Session')!,id:String(server.db.prepare('SELECT id FROM users WHERE username=?').get(username)!.id)}
  }
  async function admin(){return (await(await server.call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token as string}
  /** A claim confirmed on both sides: the catalog's handle, verified with GitHub, and the member's GitHub sign-in on the same GitHub account. */
  function linkMaintainer(memberId:string,moduleId:string,githubId:string){
    const login=communityModule(moduleId)!.maintainers[0],developerId=crypto.randomUUID(),now=new Date().toISOString()
    server.db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(developerId,'@'+login,githubId,login)
    server.db.prepare('INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES(?,?,?)').run(moduleId,developerId,login)
    server.db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(?,?,'github',?,?,?)").run(crypto.randomUUID(),githubId,memberId,now,now)
    return developerId
  }
  const profile=async(username:string)=>server.call('/forum/profiles/'+username)
  const posts=async(thread:string)=>(await(await server.call('/forum/threads/'+thread)).json()).posts as {id:string;username:string|null;maintainer:boolean}[]
  return {...server,member,admin,linkMaintainer,profile,posts}
}
describe('member profiles',()=>{
  it('lets each member manage only their own public links, preserves omitted fields and clears explicit removals',async()=>{
    const f=await fixture(),author=await f.member('musician'),other=await f.member('listener')
    const links={instagramUrl:'https://www.instagram.com/jannik.assfalg/',soundcloudUrl:'https://soundcloud.com/jannik-asfalg',bandcampUrl:'https://artist.bandcamp.com/'}
    const body={username:'musician',displayName:'Musician',bio:'Music and instruments',...links}
    expect((await f.call('/auth/profile','PATCH',body)).status).toBe(401)
    expect((await f.call('/auth/profile','PATCH',{...body,username:'listener',id:author.id},other.token)).status).toBe(200)
    expect(await(await f.profile('musician')).json()).toMatchObject({instagramUrl:'',soundcloudUrl:'',bandcampUrl:''})
    expect((await f.call('/auth/profile','PATCH',body,author.token)).status).toBe(200)
    expect(await(await f.call('/auth/profile','GET',undefined,author.token)).json()).toMatchObject(links)
    expect(await(await f.profile('musician')).json()).toMatchObject(links)
    expect((await f.call('/auth/profile','PATCH',{username:'musician',displayName:'New name',bio:'Updated by an older client'},author.token)).status).toBe(200)
    expect(await(await f.profile('musician')).json()).toMatchObject(links)
    const exported=await(await f.call('/auth/data-export','POST',{password},author.token)).json()
    expect(exported.data.profileLinks).toEqual([links])
    expect((await f.call('/auth/profile','PATCH',{...body,instagramUrl:'',bandcampUrl:''},author.token)).status).toBe(200)
    expect(await(await f.profile('musician')).json()).toMatchObject({instagramUrl:'',soundcloudUrl:links.soundcloudUrl,bandcampUrl:''})
    expect(await(await f.profile('listener')).json()).toMatchObject(links)
    expect((await f.call('/auth/account','DELETE',{confirm:'DELETE',password},author.token)).status).toBe(200)
    expect(f.db.prepare('SELECT instagram_url,soundcloud_url,bandcamp_url FROM users WHERE id=?').get(author.id)).toEqual({instagram_url:'',soundcloud_url:'',bandcamp_url:''})
    expect((await f.profile('musician')).status).toBe(404)
  })
  it('rejects malformed links before changing any profile data',async()=>{
    const f=await fixture(),author=await f.member('musician')
    for(const links of [{instagramUrl:'javascript:alert(1)'},{soundcloudUrl:'https://soundcloud.com.evil.test/artist'},{bandcampUrl:'https://evil.test'},{bandcampUrl:null}]){
      expect((await f.call('/auth/profile','PATCH',{username:'musician',displayName:'Changed',bio:'Changed',...links},author.token)).status).toBe(400)
      expect(await(await f.profile('musician')).json()).toMatchObject({displayName:'musician',bio:'',instagramUrl:'',soundcloudUrl:'',bandcampUrl:''})
    }
  })
  it('counts visible threads, replies and likes received, lists recent replies and says when the member joined',async()=>{
    const f=await fixture(),author=await f.member('author'),other=await f.member('other'),fan=await f.member('fanone')
    const first=await(await f.call('/forum/threads','POST',{title:'First thread',body:'Opening post',category:'general'},author.token)).json()
    const second=await(await f.call('/forum/threads','POST',{title:'Second thread',body:'Another opening post',category:'requests'},author.token)).json()
    const theirs=await(await f.call('/forum/threads','POST',{title:'Someone else asks',body:'A question',category:'general'},other.token)).json()
    const reply=(await(await f.call('/forum/threads/'+theirs.id+'/replies','POST',{body:'An answer from the author'},author.token)).json()).id
    const hiddenReply=(await(await f.call('/forum/threads/'+first.id+'/replies','POST',{body:'A reply that gets hidden'},author.token)).json()).id
    const opening=f.db.prepare('SELECT id FROM forum_posts WHERE thread_id=? ORDER BY created_at,rowid LIMIT 1').get(first.id)!.id as string
    for(const post of [opening,reply,hiddenReply])expect((await f.call('/forum/posts/'+post+'/react','POST',{liked:true},fan.token)).status).toBe(200)
    expect((await f.call('/forum/posts/'+reply+'/react','POST',{liked:true},other.token)).status).toBe(200)
    const key=await f.admin()
    await f.call('/admin/forum/posts/'+hiddenReply,'PATCH',{action:'hidden',value:true,reason:'Hidden for the test'},'',key)
    await f.call('/admin/forum/threads/'+second.id,'PATCH',{action:'hidden',value:true,reason:'Hidden thread'},'',key)
    const result=await f.profile('author')
    expect(result.status).toBe(200)
    const body=await result.json()
    expect(body).toMatchObject({username:'author',displayName:'author',bio:'',avatar:null,threads:1,replies:1,likesReceived:3,maintains:[]})
    expect(body.memberSince).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(body.recentReplies).toHaveLength(1)
    expect(body.recentReplies[0]).toMatchObject({id:reply,thread_id:theirs.id,title:'Someone else asks',excerpt:'An answer from the author',page:0})
    expect(JSON.stringify(body)).not.toMatch(/"id":"[0-9a-f-]{36}","username"|email|password|token|user_id/)
    // Only public members have a profile.
    expect((await f.profile('nobody')).status).toBe(404)
    f.db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(author.id)
    expect((await f.profile('author')).status).toBe(404)
  })
  it('shows the maintainer badge only for claims confirmed on both sides, in module threads and the module home',async()=>{
    const f=await fixture(),maintainer=await f.member('maintainer'),fan=await f.member('fanone'),pretender=await f.member('pretender')
    const login=communityModule('miniverb')!.maintainers[0]
    // A matching GitHub handle on a forum account, without a claim, earns nothing.
    f.db.prepare('UPDATE users SET github_login=? WHERE id=?').run(login,pretender.id)
    const developerId=f.linkMaintainer(maintainer.id,'miniverb','4242')
    const thread=await(await f.call('/forum/threads','POST',{title:'Reverb tails',body:'How long can they get?',category:'modules',moduleId:'miniverb'},fan.token)).json()
    const general=await(await f.call('/forum/threads','POST',{title:'Unrelated chat',body:'No module here',category:'general'},fan.token)).json()
    for(const id of [thread.id,'module-miniverb',general.id])for(const token of [maintainer.token,pretender.token])expect((await f.call('/forum/threads/'+id+'/replies','POST',{body:'A reply'},token)).status).toBe(201)
    for(const id of [thread.id,'module-miniverb'])expect((await f.posts(id)).map(post=>[post.username,post.maintainer])).toEqual([[id===thread.id?'fanone':null,false],['maintainer',true],['pretender',false]])
    expect((await f.posts(general.id)).every(post=>!post.maintainer)).toBe(true)
    const body=await(await f.profile('maintainer')).json()
    expect(body.maintains).toEqual([{id:'miniverb',name:communityModule('miniverb')!.name,machine:'octatrack',href:'#module/miniverb'}])
    expect((await(await f.profile('pretender')).json()).maintains).toEqual([])
    // A revoked claim, or a suspended developer identity, removes the badge at once.
    f.db.prepare('UPDATE module_maintainers SET revoked=1 WHERE user_id=?').run(developerId)
    expect((await f.posts(thread.id)).some(post=>post.maintainer)).toBe(false)
    expect((await(await f.profile('maintainer')).json()).maintains).toEqual([])
    f.db.prepare('UPDATE module_maintainers SET revoked=0 WHERE user_id=?').run(developerId)
    expect((await f.posts(thread.id)).filter(post=>post.maintainer).map(post=>post.username)).toEqual(['maintainer'])
    f.db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(developerId)
    expect((await f.posts(thread.id)).some(post=>post.maintainer)).toBe(false)
  })
})
