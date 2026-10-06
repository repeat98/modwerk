import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
const databases:DatabaseSync[]=[]
const sent:{to:string[];text:string}[]=[]
const password='a long original test passphrase'
beforeEach(()=>{sent.length=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{sent.push(JSON.parse(String(options.body)));return Response.json({id:crypto.randomUUID()})}))})
afterEach(()=>{vi.unstubAllGlobals();for(const db of databases.splice(0))db.close()})
const png=(size=64)=>{const bytes=new Uint8Array(size);bytes.set([137,80,78,71,13,10,26,10]);for(let index=8;index<size;index++)bytes[index]=index&255;return bytes}
const ogg=()=>{const bytes=new Uint8Array(200);bytes.set([79,103,103,83]);return bytes}
async function fixture(){
 const server=await testServer();databases.push(server.db)
 const objects=new Map<string,Uint8Array<ArrayBuffer>>()
 server.env.MEDIA={async put(key,bytes){objects.set(key,new Uint8Array(bytes))},async get(key){const bytes=objects.get(key);return bytes?{body:new Response(bytes).body!}:null},async delete(key){objects.delete(key)}}
 async function member(username:string){
  const email=username+'@example.test'
  expect((await server.call('/auth/register','POST',{rulesVersion:COMMUNITY_RULES_VERSION,username,email,password})).status).toBe(202)
  const token=[...sent].reverse().find(message=>message.to[0]===email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
  expect((await server.call('/auth/verify','POST',{token,password})).status).toBe(200)
  return login(username)
 }
 const login=async(username:string)=>(await server.call('/auth/login','POST',{email:username+'@example.test',password})).headers.get('X-Octamod-Session')!
 function raw(method:'POST'|'DELETE',bytes:Uint8Array<ArrayBuffer>|undefined,session:string){
  const headers=new Headers({Origin:'https://octamod.test','CF-Connecting-IP':'192.0.2.1','Content-Type':'application/octet-stream'})
  if(session)headers.set('Authorization','Bearer '+session)
  return handleCommunity(new Request('https://api.example.test/api/forum/avatar',{method,headers,body:bytes}),server.env)
 }
 const picture=(id:string)=>handleCommunity(new Request('https://api.example.test/api/forum/avatars/'+id),server.env)
 const admin=async()=>(await(await server.call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token as string
 return {...server,objects,member,login,raw,picture,admin}
}
describe('profile pictures',()=>{
 it('lets a verified member set a picture that then appears everywhere they are named',async()=>{
  const f=await fixture(),author=await f.member('portrait')
  expect((await f.raw('POST',png(),'')).status).toBe(401)
  expect((await f.raw('POST',ogg(),author)).status).toBe(415)
  const first=await f.raw('POST',png(),author);expect(first.status).toBe(201)
  const {avatar}=await first.json();expect(avatar).toMatch(/^[a-f0-9-]{36}$/)
  expect(f.objects.has('avatars/'+avatar)).toBe(true)
  expect(await(await f.call('/auth/session','GET',undefined,author)).json()).toMatchObject({user:{username:'portrait',avatar}})
  expect(await(await f.call('/forum/profiles/portrait')).json()).toMatchObject({avatar})
  const {id}=await(await f.call('/forum/threads','POST',{title:'With a face',body:'Hello',category:'general'},author)).json()
  expect((await(await f.call('/forum/threads')).json()).threads[0]).toMatchObject({id,avatar})
  expect((await(await f.call('/forum/threads/'+id)).json()).posts[0]).toMatchObject({avatar})
  expect((await f.call('/forum/shouts','POST',{body:'Hi'},author)).status).toBe(201)
  expect((await(await f.call('/forum/shouts')).json()).messages[0]).toMatchObject({avatar})
  const served=await f.picture(avatar);expect(served.status).toBe(200)
  expect(Object.fromEntries(['content-type','x-content-type-options','content-security-policy'].map(name=>[name,served.headers.get(name)]))).toEqual({'content-type':'image/png','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"})
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(png())
  // A new picture gets a new ID; the old file and URL go away.
  const second=await(await f.raw('POST',png(80),author)).json()
  expect(second.avatar).not.toBe(avatar)
  expect(f.objects.has('avatars/'+avatar)).toBe(false);expect(f.objects.has('avatars/'+second.avatar)).toBe(true)
  expect((await f.picture(avatar)).status).toBe(404)
  expect(JSON.stringify(await(await f.call('/forum/threads/'+id)).json())).not.toMatch(/avatar_mime|object_key|email/)
 })
 it('hides the picture of a suspended member and removes it on request or with the account',async()=>{
  const f=await fixture(),author=await f.member('leaving'),other=await f.member('staying')
  const {avatar}=await(await f.raw('POST',png(),author)).json()
  const otherAvatar=(await(await f.raw('POST',png(),other)).json()).avatar
  const userId=String(f.db.prepare('SELECT id FROM users WHERE username=?').get('leaving')!.id)
  const key=await f.admin()
  await f.call('/admin/forum/users/'+userId,'PATCH',{action:'suspended',value:true,reason:'Test suspension'},'',key)
  expect((await f.picture(avatar)).status).toBe(404)
  await f.call('/admin/forum/users/'+userId,'PATCH',{action:'suspended',value:false,reason:'Test restore'},'',key)
  expect((await f.picture(avatar)).status).toBe(200)
  const exported=await(await f.call('/auth/data-export','POST',{password},other)).json()
  expect(exported.data.profilePicture).toEqual([{id:otherAvatar,mime:'image/png'}])
  expect((await f.raw('DELETE',undefined,other)).status).toBe(200)
  expect(f.objects.has('avatars/'+otherAvatar)).toBe(false)
  expect(await(await f.call('/auth/session','GET',undefined,other)).json()).toMatchObject({user:{avatar:null}})
  // Suspension revoked the author's sessions, so they sign in again before deleting the account.
  expect((await f.call('/auth/account','DELETE',{confirm:'DELETE',password},await f.login('leaving'))).status).toBe(200)
  expect(f.objects.has('avatars/'+avatar)).toBe(false)
  expect(f.db.prepare('SELECT avatar_id,avatar_mime FROM users WHERE id=?').get(userId)).toEqual({avatar_id:null,avatar_mime:null})
  expect((await f.picture(avatar)).status).toBe(404)
 })
})
