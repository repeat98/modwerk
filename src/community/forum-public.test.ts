import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { threadPath } from './forum-links'
const databases:DatabaseSync[]=[]
const sent:{to:string[];text:string}[]=[]
const password='a long original test passphrase'
beforeEach(()=>{sent.length=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{sent.push(JSON.parse(String(options.body)));return Response.json({id:crypto.randomUUID()})}))})
afterEach(()=>{vi.unstubAllGlobals();for(const db of databases.splice(0))db.close()})
const png=()=>{const bytes=new Uint8Array(64);bytes.set([137,80,78,71,13,10,26,10]);for(let index=8;index<64;index++)bytes[index]=index&255;return bytes}
async function fixture(){
 const server=await testServer();databases.push(server.db)
 const objects=new Map<string,Uint8Array<ArrayBuffer>>()
 server.env.MEDIA={async put(key,bytes){objects.set(key,new Uint8Array(bytes))},async get(key){const bytes=objects.get(key);return bytes?{body:new Response(bytes).body!}:null},async delete(key){objects.delete(key)}}
 async function member(username:string){
  const email=username+'@example.test'
  expect((await server.call('/auth/register','POST',{rulesVersion:COMMUNITY_RULES_VERSION,username,email,password})).status).toBe(202)
  const token=[...sent].reverse().find(message=>message.to[0]===email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
  expect((await server.call('/auth/verify','POST',{token,password})).status).toBe(200)
  return (await server.call('/auth/login','POST',{email,password})).headers.get('X-Octamod-Session')!
 }
 async function upload(session:string){
  const headers=new Headers({Origin:'https://octamod.test','CF-Connecting-IP':'192.0.2.1','Content-Type':'application/octet-stream',Authorization:'Bearer '+session})
  return (await(await handleCommunity(new Request('https://api.example.test/api/forum/media',{method:'POST',headers,body:png()}),server.env)).json()).id as string
 }
 /** Crawlers and feed readers send no Origin and no session. */
 const anonymous=(path:string)=>handleCommunity(new Request('https://api.example.test/api'+path),server.env)
 const admin=async()=>(await(await server.call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token as string
 async function thread(session:string,title:string,body:string,extra:Record<string,unknown>={}){const created=await server.call('/forum/threads','POST',{title,body,category:'general',...extra},session);expect(created.status).toBe(201);return (await created.json()).id as string}
 return {...server,member,upload,anonymous,admin,thread}
}
describe('public thread pages, feed and sitemap',()=>{
 it('lists public member threads with excerpts and the first image, never hidden threads, suspended members or module homes',async()=>{
  const f=await fixture(),author=await f.member('synth_fan'),other=await f.member('other_one'),admin=await f.admin()
  const image=await f.upload(author)
  const first=await f.thread(author,'Granular pad from Tapehead','# Hello\n\nHere is **how** it sounds, see [the clip](https://example.test).\n\n```\ncode\n```',{machine:'octatrack',attachments:[{id:image}]})
  const hidden=await f.thread(other,'Spam thread','Buy now')
  const suspended=await f.thread(other,'Another thread','Fine text')
  expect((await f.call('/forum/threads/'+first+'/replies','POST',{body:'Nice.'},other)).status).toBe(201)
  expect((await f.call('/admin/forum/threads/'+hidden,'PATCH',{action:'hidden',value:true,reason:'Spam'},'',admin)).status).toBe(200)
  const pages=await f.anonymous('/forum/pages.json')
  expect(pages.status).toBe(200);expect(pages.headers.get('Cache-Control')).toBe('public, max-age=300')
  let listed=(await pages.json()).threads as {id:string;title:string;username:string;excerpt:string;image:string|null;replies:number;category:string;machine:string|null}[]
  expect(listed.map(item=>item.id).sort()).toEqual([first,suspended].sort())
  expect(listed.find(item=>item.id===first)).toMatchObject({title:'Granular pad from Tapehead',username:'synth_fan',excerpt:'Hello Here is how it sounds, see the clip.',image:'https://api.example.test/api/forum/media/'+image,replies:1,category:'general',machine:'octatrack'})
  expect(listed.find(item=>item.id===suspended)).toMatchObject({image:null,excerpt:'Fine text'})
  expect(JSON.stringify(listed)).not.toMatch(/email|module-/)
  f.db.prepare('UPDATE users SET suspended=1 WHERE username=?').run('other_one')
  listed=(await(await f.anonymous('/forum/pages.json')).json()).threads
  expect(listed.map(item=>item.id)).toEqual([first])
  expect((await f.anonymous('/forum/pages.json')).headers.get('Access-Control-Allow-Origin')).toBeNull()
 })
 it('serves an Atom feed of new threads and module releases with escaped text and site links',async()=>{
  const f=await fixture(),author=await f.member('feed_author'),admin=await f.admin()
  const id=await f.thread(author,'Reverb <script>alert(1)</script> & more','Try a *short* decay & "tails".')
  const hidden=await f.thread(author,'Hidden later','Gone')
  expect((await f.call('/admin/forum/threads/'+hidden,'PATCH',{action:'hidden',value:true,reason:'Test'},'',admin)).status).toBe(200)
  f.db.prepare("INSERT INTO module_releases(module_id,version,name,href,detected_at) VALUES('miniverb','1.2.0','Miniverb','#module/miniverb','2026-10-03 08:00:00'),('digitakt-digihealth','0.2.0','Digihealth','#digitakt/module/digihealth','2026-10-04 08:00:00')").run()
  const feed=await f.anonymous('/forum/feed.xml'),body=await feed.text()
  expect(feed.status).toBe(200);expect(feed.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');expect(feed.headers.get('Cache-Control')).toBe('public, max-age=900')
  expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
  expect(body).toContain('<link rel="self" type="application/atom+xml" href="https://api.example.test/api/forum/feed.xml"/>')
  expect(body).toContain('<title>Reverb &lt;script&gt;alert(1)&lt;/script&gt; &amp; more</title>')
  expect(body).toContain('<link href="https://octamod.test/'+threadPath(id,'Reverb <script>alert(1)</script> & more')+'?utm_source=forum-feed"/>')
  expect(body).toContain('<id>https://octamod.test/forum/thread/'+id+'/</id>')
  expect(body).toContain('<author><name>@feed_author</name><uri>https://octamod.test/forum/profile/feed_author/</uri></author>')
  expect(body).toContain('<summary>Try a short decay &amp; &quot;tails&quot;.</summary>')
  expect(body).toContain('<title>Miniverb 1.2.0 released</title><link href="https://octamod.test/module/miniverb/?utm_source=forum-feed"/>')
  expect(body).toContain('<title>Digihealth 0.2.0 released</title><link href="https://octamod.test/?utm_source=forum-feed#digitakt/module/digihealth"/>')
  expect(body).toContain('<published>2026-10-04T08:00:00.000Z</published>')
  expect(body).not.toContain('Hidden later');expect(body).not.toContain('<script>')
  expect(body.indexOf('Reverb')).toBeLessThan(body.indexOf('Digihealth'))
  expect(body.indexOf('Digihealth')).toBeLessThan(body.indexOf('Miniverb'))
  expect(body.match(/<entry>/g)).toHaveLength(3)
 })
 it('serves a sitemap of the home, module pages, public threads and active profiles',async()=>{
  const f=await fixture(),author=await f.member('map_author'),quiet=await f.member('quiet_one'),admin=await f.admin()
  const id=await f.thread(author,'Sitemap thread','Text')
  expect((await f.call('/forum/threads/'+id+'/replies','POST',{body:'A reply'},quiet)).status).toBe(201)
  const removed=await f.member('removed_one'),gone=await f.thread(removed,'Removed thread','Text')
  expect((await f.call('/admin/forum/threads/'+gone,'PATCH',{action:'hidden',value:true,reason:'Test'},'',admin)).status).toBe(200)
  f.db.prepare('UPDATE users SET suspended=1 WHERE username=?').run('removed_one')
  const map=await f.anonymous('/forum/sitemap.xml'),body=await map.text()
  expect(map.status).toBe(200);expect(map.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
  expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  expect(body).toContain('<url><loc>https://octamod.test/</loc></url>')
  expect(body).toContain('<url><loc>https://octamod.test/module/fm-synth/</loc></url>')
  expect(body).toMatch(new RegExp('<url><loc>https://octamod.test/forum/thread/'+id+'-sitemap-thread/</loc><lastmod>\\d{4}-\\d\\d-\\d\\dT[^<]+</lastmod></url>'))
  expect(body).toContain('<loc>https://octamod.test/forum/profile/map_author/</loc>')
  expect(body).toContain('<loc>https://octamod.test/forum/profile/quiet_one/</loc>')
  expect(body).not.toContain('removed');expect(body).not.toContain('module-miniverb')
  expect((await f.anonymous('/forum/sitemap.xml?x=1')).status).toBe(200)
  expect((await f.call('/forum/feed.xml','POST',{})).status).not.toBe(200)
 })
})
