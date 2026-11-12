import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { digest } from '../../server/security'
import { ensureModuleThreads } from '../../server/module-threads'
import { communityModule } from './modules'
import recipes from '../catalog/module-sets.json'

const databases:DatabaseSync[]=[]
afterEach(()=>{for(const db of databases.splice(0))db.close()})
async function fixture(){
  const server=await testServer();databases.push(server.db)
  const id='discussion-reader',token='d'.repeat(64)
  server.db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES(?,'Reader','reader',1)").run(id)
  server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(token),id,Math.floor(Date.now()/1000)+600)
  return {...server,id,token}
}

describe('one module discussion',()=>{
  it('rejects bug reports through the thread composer, including structured issues in other categories',async()=>{
    const {call,db,token}=await fixture()
    await call('/forum/threads')
    const before=Object.fromEntries(['forum_threads','forum_posts','forum_follows','notifications','issues'].map(table=>[table,db.prepare('SELECT COUNT(*) AS count FROM '+table).get()!.count]))
    const issue={device:'Octatrack MKII',version:communityModule('miniverb')!.version,steps:'Select Mini Verb.',expected:'Audio plays.',actual:'Audio stops.'}
    for(const payload of [
      {category:'issues',moduleId:'miniverb',issue},
      {category:'issues',moduleId:'digitakt-digihealth',machine:'digitakt',issue},
      {category:'issues',moduleId:'digitone-digihealth',machine:'digitone',issue},
      {category:'issues',machine:'syntakt'},
      {category:'general',moduleId:'miniverb',issue},
    ]){
      const result=await call('/forum/threads','POST',{title:'A module bug',body:'Reproduction details.',...payload},token)
      expect(result.status).toBe(400)
      expect((await result.json()).error).toContain('Report an issue')
    }
    for(const [table,count] of Object.entries(before))expect(db.prepare('SELECT COUNT(*) AS count FROM '+table).get()!.count).toBe(count)
    expect((await call('/forum/threads','POST',{title:'Mini Verb settings',body:'Share your favorite settings.',category:'modules',moduleId:'miniverb'},token)).status).toBe(201)
  })

  it('keeps member feeds, pagination and summaries separate from automatic module homes',async()=>{
    const {call,db,id,token}=await fixture()
    expect((await (await call('/forum/threads')).json()).threads).toEqual([])
    for(let index=0;index<31;index++){
      const thread='member-'+index
      db.prepare("INSERT INTO forum_threads(id,user_id,title,category,machine,module_id,created_at) VALUES(?,?,'Mini Verb settings','modules','octatrack','miniverb','2025-01-01')").run(thread,id)
      db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES(?,?,?,'My settings','2025-01-01')").run(thread,thread,id)
    }
    for(let index=0;index<40;index++)db.prepare("INSERT INTO forum_threads(id,user_id,title,category,machine) VALUES(?,'modwerk','Catalog home','modules','octatrack')").run('catalog-'+index)
    await call('/forum/threads/member-0/replies','POST',{body:'A member conversation'},token)
    await call('/forum/threads/module-miniverb/replies','POST',{body:'A module home conversation'},token)
    for(const query of ['', '?sort=newest','?category=modules&machine=octatrack','?module=miniverb','?q=Mini%20Verb']){
      const first=await (await call('/forum/threads'+query)).json()
      expect(first.threads).toHaveLength(30)
      expect(first.hasMore).toBe(true)
      expect(first.threads.every((thread:{official:number})=>!thread.official)).toBe(true)
      const next=await (await call('/forum/threads'+(query?query+'&':'?')+'page=1')).json()
      expect(next.threads).toHaveLength(1)
      expect(next.hasMore).toBe(false)
      expect(new Set([...first.threads,...next.threads].map((thread:{id:string})=>thread.id)).size).toBe(31)
    }
    const homes=await (await call('/forum/threads?view=modules')).json()
    expect(homes.hasMore).toBe(true)
    expect(homes.threads.every((thread:{official:number})=>thread.official)).toBe(true)
    expect((await (await call('/forum/threads?view=modules&module=miniverb')).json()).threads.map((thread:{id:string})=>thread.id)).toEqual(['module-miniverb'])
    expect(await (await call('/forum/categories')).json()).toEqual([{category:'modules',threads:31,replies:1}])
    expect(await (await call('/forum/machines')).json()).toEqual([expect.objectContaining({machine:'octatrack',threads:31})])
    expect((await (await call('/forum/recent-posts')).json()).map((post:{thread_id:string})=>post.thread_id)).toEqual(['member-0'])
    db.prepare("UPDATE forum_threads SET hidden=1 WHERE id='module-miniverb'").run()
    expect((await (await call('/forum/threads?view=modules&module=miniverb')).json()).threads).toEqual([])
    expect((await call('/forum/threads?view=unknown')).status).toBe(400)
  })

  it('retains module homes in personal follows and bookmarks and direct module links',async()=>{
    const {call,token}=await fixture()
    for(const action of ['follow','bookmark'])expect((await call('/forum/threads/module-miniverb/'+action,'POST',{enabled:true},token)).status).toBe(200)
    for(const view of ['following','saved'])expect((await (await call('/forum/threads?'+view+'=1','GET',undefined,token)).json()).threads.map((thread:{id:string})=>thread.id)).toEqual(['module-miniverb'])
    expect((await (await call('/forum/threads/module-miniverb')).json()).thread.id).toBe('module-miniverb')
    expect((await call('/modules/miniverb')).status).toBe(200)
  })

  it('shares replies, edits, moderation and counts between the module API and forum',async()=>{
    const {call,db,token}=await fixture()
    const legacy=await call('/modules/miniverb/comments','POST',{body:'A question from the module page.'},token)
    expect(legacy.status).toBe(200)
    const {id:first}=await legacy.json()
    const forum=await (await call('/forum/threads/module-miniverb')).json()
    expect(forum.posts.map((post:{id:string})=>post.id)).toContain(first)
    expect(forum.thread.replies).toBe(1)
    const reply=await call('/forum/threads/module-miniverb/replies','POST',{body:'**Same discussion** from the forum.'},token)
    expect(reply.status).toBe(201)
    const {id:second}=await reply.json()
    expect((await (await call('/modules/miniverb', 'GET', undefined, token)).json()).comments.map((post:{id:string})=>post.id)).toEqual([second,first])
    expect(db.prepare('SELECT COUNT(*) AS count FROM comments').get()!.count).toBe(0)
    expect((await call('/forum/posts/'+first,'PATCH',{body:'Edited in the forum.'},token)).status).toBe(200)
    expect((await (await call('/modules/miniverb')).json()).comments.find((post:{id:string})=>post.id===first).body).toBe('Edited in the forum.')
    expect((await call('/comments/'+second,'DELETE',undefined,token)).status).toBe(200)
    expect((await (await call('/modules/miniverb')).json()).comments.map((post:{id:string})=>post.id)).toEqual([first])
    expect((await (await call('/forum/threads/module-miniverb')).json()).posts.find((post:{id:string})=>post.id===second)).toMatchObject({hidden:1,body:'',displayName:null})
    expect((await (await call('/forum/threads/module-miniverb')).json()).thread.replies).toBe(1)
  })

  it('applies forum visibility, locking, ownership and verified membership to legacy clients',async()=>{
    const {call,db,id,token}=await fixture()
    expect((await call('/modules/miniverb/comments','POST',{body:'Anonymous'})).status).toBe(401)
    const posted=await (await call('/modules/miniverb/comments','POST',{body:'Visible'},token)).json()
    db.prepare("UPDATE forum_threads SET locked=1 WHERE id='module-miniverb'").run()
    expect((await call('/modules/miniverb/comments','POST',{body:'Locked'},token)).status).toBe(409)
    expect((await (await call('/modules/miniverb','GET',undefined,token)).json()).comments[0].canDelete).toBe(false)
    await call('/comments/'+posted.id,'DELETE',undefined,token)
    expect(db.prepare('SELECT hidden FROM forum_posts WHERE id=?').get(posted.id)!.hidden).toBe(0)
    db.prepare("UPDATE forum_threads SET hidden=1,locked=0 WHERE id='module-miniverb'").run()
    expect((await call('/modules/miniverb/comments','POST',{body:'Hidden'},token)).status).toBe(404)
    expect((await (await call('/modules/miniverb')).json()).comments).toEqual([])
    db.prepare("UPDATE forum_threads SET hidden=0 WHERE id='module-miniverb'").run()
    db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(id)
    expect((await call('/modules/miniverb/comments','POST',{body:'Unverified'},token)).status).toBe(403)
  })

  it('returns the new reply page including hidden placeholders so either composer can show it',async()=>{
    const {call,db,id,token}=await fixture()
    await call('/modules/miniverb')
    for(let index=0;index<35;index++)db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,hidden) VALUES(?,'module-miniverb',?,'An earlier reply',?)").run('earlier-'+index,id,index<8?1:0)
    const posted=await call('/forum/threads/module-miniverb/replies','POST',{body:'On the second page.'},token)
    expect(posted.status).toBe(201)
    const result=await posted.json()
    expect(result.page).toBe(1)
    const secondPage=await (await call('/forum/threads/module-miniverb?page='+result.page)).json()
    expect(secondPage.posts.map((post:{id:string})=>post.id)).toContain(result.id)
    expect(secondPage.thread.replies).toBe(28)
  })

  it('gives published modules the same fixed home thread and forum filter',async()=>{
    const {call,db,id,token}=await fixture()
    await call('/forum/threads')
    db.prepare("INSERT INTO submissions(id,owner_id,module_id,title,repository_url,description,usage,test_report_url,stress_notes,quality_notes,resource_notes,license,status) VALUES('publication',?,'community-filter','Community Filter','https://github.com/example/filter','A published filter','Use it','https://github.com/example/filter','Checked','Checked','Checked','MIT','approved')").run(id)
    db.prepare("INSERT INTO module_publications(module_id,submission_id) VALUES('community-filter','publication')").run()
    for(const module of ['community-filter']){
      const posted=await call('/modules/'+module+'/comments','POST',{body:'Shared module discussion'},token)
      expect(posted.status).toBe(200)
      const detail=await (await call('/forum/threads/module-'+module)).json()
      expect(detail.thread).toMatchObject({module_id:module,replies:1,official:1})
      expect((await (await call('/forum/threads?view=modules&module='+module)).json()).threads[0].id).toBe('module-'+module)
    }
    expect((await call('/forum/threads?module=does-not-exist')).status).toBe(400)
  })

  it('never creates set discussions through page reads, old composers or forum filters',async()=>{
    const {call,db,token}=await fixture()
    for(const recipe of recipes){
      const module='remix-'+recipe.id
      const detail=await call('/modules/'+module)
      expect(detail.status).toBe(200)
      expect((await detail.json()).comments).toEqual([])
      expect((await call('/modules/'+module+'/comments','POST',{body:'Old set composer'},token)).status).toBe(404)
      expect((await call('/forum/threads/module-'+module)).status).toBe(404)
      expect((await call('/forum/threads?module='+module)).status).toBe(400)
      expect((await call('/forum/threads','POST',{title:'A set thread',body:'Opening post',category:'modules',moduleId:module},token)).status).toBe(400)
    }
    // Legacy set statistics remain usable without opening a discussion.
    expect((await call('/modules/remix-tapeecho/like','POST',{liked:true},token)).status).toBe(200)
    expect((await call('/modules/remix-tapeecho/rating','POST',{value:4},token)).status).toBe(200)
    expect((await (await call('/modules/remix-tapeecho','GET',undefined,token)).json())).toMatchObject({comments:[],liked:true,ownRating:4})
    expect(db.prepare("SELECT COUNT(*) AS count FROM forum_threads WHERE module_id GLOB 'remix-*'").get()!.count).toBe(0)
    expect((await call('/forum/threads/module-tapeecho')).status).toBe(200)
  })

  it('removes automatic set threads from public views once while preserving posts and other discussions',async()=>{
    const {call,db,id,token}=await fixture()
    await call('/forum/threads/module-tapeecho')
    db.prepare("INSERT INTO forum_threads(id,user_id,title,category,module_id,machine) VALUES('module-remix-tapeecho','modwerk','Module set · tapeecho discussion','modules','remix-tapeecho','octatrack'),('member-set-thread',?,'A member conversation','general','remix-tapeecho','octatrack')").run(id)
    db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES('module-remix-tapeecho','module-remix-tapeecho','modwerk','Set intro'),('set-reply','module-remix-tapeecho',?,'Retained reply')").run(id)
    db.prepare("INSERT INTO forum_follows(thread_id,user_id) VALUES('module-remix-tapeecho',?)").run(id)
    db.prepare("INSERT INTO forum_bookmarks(thread_id,user_id) VALUES('module-remix-tapeecho',?)").run(id)
    db.prepare("INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id) VALUES('set-notification',?,'reply',?,'module-remix-tapeecho','set-reply')").run(id,id)
    const migration=readFileSync(new URL('../../migrations/0033_remove_module_set_discussions.sql',import.meta.url),'utf8')
    db.exec(migration);db.exec(migration)
    expect(db.prepare("SELECT hidden,locked FROM forum_threads WHERE id='module-remix-tapeecho'").get()).toEqual({hidden:1,locked:1})
    expect(db.prepare("SELECT hidden,locked FROM forum_threads WHERE id='module-tapeecho'").get()).toEqual({hidden:0,locked:0})
    expect(db.prepare("SELECT hidden,locked FROM forum_threads WHERE id='member-set-thread'").get()).toEqual({hidden:0,locked:0})
    expect(db.prepare("SELECT body FROM forum_posts WHERE id='set-reply'").get()!.body).toBe('Retained reply')
    expect(db.prepare("SELECT COUNT(*) AS count FROM forum_moderation WHERE target='module-remix-tapeecho'").get()!.count).toBe(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect((await call('/forum/threads/module-remix-tapeecho')).status).toBe(404)
    expect((await call('/forum/threads/module-remix-tapeecho/replies','POST',{body:'No new set replies'},token)).status).toBe(404)
    expect((await (await call('/forum/threads')).json()).threads.map((thread:{id:string})=>thread.id)).not.toContain('module-remix-tapeecho')
    expect((await (await call('/modules/remix-tapeecho')).json()).comments).toEqual([])
    expect((await (await call('/notifications','GET',undefined,token)).json()).items).not.toContainEqual(expect.objectContaining({id:'set-notification'}))
    expect(db.prepare("SELECT hidden,locked FROM forum_threads WHERE id='module-remix-tapeecho'").get()).toEqual({hidden:1,locked:1})
  })

  it('migrates historical comments once, preserving identity, order, moderation and notification state',async()=>{
    const {call,db,env,id}=await fixture()
    db.prepare("INSERT INTO users(id,display_name) VALUES('old-guest','Historical guest')").run()
    db.prepare("INSERT INTO forum_threads(id,user_id,title,category,module_id,machine,locked,hidden,created_at,updated_at) VALUES('module-miniverb','modwerk','Mini Verb discussion','modules','miniverb','octatrack',1,1,'2024-01-01','2024-01-01')").run()
    db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES('module-miniverb','module-miniverb','modwerk','Original introduction','2024-01-01')").run()
    db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES('existing-reply','module-miniverb',?,'Existing forum reply','2023-01-01')").run(id)
    db.prepare("INSERT INTO comments(id,module_id,user_id,body,created_at) VALUES('legacy-one','miniverb','old-guest','Historical question','2020-01-01'),('legacy-two','recorder-loop-fix',?,'Another question','2021-01-01')").run(id)
    db.prepare("INSERT INTO notifications(id,user_id,kind,actor_id,module_id,comment_id,seen,emailed) VALUES('old-notification',?,'module_comment','old-guest','miniverb','legacy-one',1,1)").run(id)
    const migration=readFileSync(new URL('../../migrations/0028_unified_module_discussions.sql',import.meta.url),'utf8')
    db.exec(migration);db.exec(migration)
    await ensureModuleThreads(env.DB!)
    expect(db.prepare("SELECT id,body,user_id,created_at FROM forum_posts WHERE thread_id='module-miniverb' ORDER BY created_at,rowid").all()).toEqual([
      {id:'module-miniverb',body:'Original introduction',user_id:'modwerk',created_at:'2020-01-01'},
      {id:'comment-legacy-one',body:'Historical question',user_id:'old-guest',created_at:'2020-01-01'},
      {id:'existing-reply',body:'Existing forum reply',user_id:id,created_at:'2023-01-01'},
    ])
    expect(db.prepare("SELECT locked,hidden FROM forum_threads WHERE id='module-miniverb'").get()).toEqual({locked:1,hidden:1})
    expect(db.prepare("SELECT title,machine FROM forum_threads WHERE id='module-recorder-loop-fix'").get()).toEqual({title:communityModule('recorder-loop-fix')!.name+' discussion',machine:'octatrack'})
    expect(db.prepare("SELECT kind,thread_id,post_id,comment_id,seen,emailed FROM notifications WHERE id='old-notification'").get()).toEqual({kind:'reply',thread_id:'module-miniverb',post_id:'comment-legacy-one',comment_id:null,seen:1,emailed:1})
    const admin=await (await call('/auth/admin','POST',{key:'e'.repeat(64)})).json()
    const detail=await (await call('/forum/threads/module-miniverb','GET',undefined,'',admin.token)).json()
    expect(detail.posts[1]).toMatchObject({displayName:'Historical guest',username:null,canEdit:false,official:false})
    await call('/comments/legacy-one','DELETE',undefined,'',admin.token)
    expect(db.prepare("SELECT hidden FROM forum_posts WHERE id='comment-legacy-one'").get()!.hidden).toBe(1)
  })
})

describe('shared configurations on module pages',()=>{
  it('counts public configuration threads whose snapshot includes the module and lists them under the module filter',async()=>{
    const {call,db,token}=await fixture()
    const octatrack=(moduleIds:string[])=>({name:'Set',moduleIds,moduleVersions:Object.fromEntries(moduleIds.map(id=>[id,communityModule(id)!.version])),keepStockFx2:true})
    const share=async(configuration:unknown,title='Shared set')=>{const result=await call('/forum/threads','POST',{title,body:'Try this set.',category:'configs',configuration},token);expect(result.status).toBe(201);return (await result.json()).id as string}
    const first=await share(octatrack(['miniverb','recorder-loop-fix']),'Ambient set'),second=await share(octatrack(['miniverb']),'Verb only'),hidden=await share(octatrack(['miniverb']),'Hidden later')
    await share(octatrack(['recorder-loop-fix']),'No verb')
    const digi=await share({name:'Digi',device:'digitakt',moduleIds:['digihealth'],moduleVersions:{digihealth:communityModule('digitakt-digihealth')!.version},keepStockFx2:false},'Digitakt set')
    await call('/forum/threads','POST',{title:'A question',body:'Not a configuration.',category:'general',moduleId:'miniverb'},token)
    db.prepare('UPDATE forum_threads SET hidden=1 WHERE id=?').run(hidden)
    expect((await (await call('/modules/miniverb')).json()).sharedConfigurations).toBe(2)
    expect((await (await call('/modules/recorder-loop-fix')).json()).sharedConfigurations).toBe(2)
    expect((await (await call('/modules/digitakt-digihealth')).json()).sharedConfigurations).toBe(1)
    expect((await (await call('/modules/remix-tapeecho')).json()).sharedConfigurations).toBe(0)
    const listed=async(query:string)=>((await (await call('/forum/threads?'+query)).json()).threads as {id:string}[]).map(thread=>thread.id).sort()
    expect(await listed('category=configs&module=miniverb')).toEqual([first,second].sort())
    expect(await listed('category=configs&module=digitakt-digihealth')).toEqual([digi])
    expect((await listed('module=miniverb')).length).toBe(3)
    expect(await listed('category=general&module=miniverb')).toHaveLength(1)
  })
})
