import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { cleanupAudioPreviews } from '../../server/audio-previews'
import { digest } from '../../server/security'
const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
function wav() {
  const bytes = new Uint8Array(44+16000), view = new DataView(bytes.buffer)
  const text = (offset:number,value:string) => bytes.set(new TextEncoder().encode(value),offset)
  text(0,'RIFF'); view.setUint32(4,bytes.length-8,true); text(8,'WAVE'); text(12,'fmt ')
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true)
  view.setUint32(24,8000,true); view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true)
  text(36,'data'); view.setUint32(40,16000,true)
  for(let i=0;i<8000;i++) view.setInt16(44+i*2,Math.round(Math.sin(i/8000*440*Math.PI*2)*10000),true)
  return bytes
}
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const objects = new Map<string,Uint8Array<ArrayBuffer>>()
  server.env.MEDIA = {
    async put(key,bytes) { objects.set(key,new Uint8Array(bytes)) },
    async get(key,options) { const bytes=objects.get(key); if(!bytes)return null; const part=options?.range?bytes.slice(options.range.offset,options.range.offset+options.range.length):bytes; return {body:new Response(part).body!} },
    async delete(key) { objects.delete(key) },
  }
  const tokens={author:'a'.repeat(64),other:'b'.repeat(64),unverified:'c'.repeat(64)}
  for(const [id,token] of Object.entries(tokens)) {
    server.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,?)').run(id,id,id,id==='unverified'?0:1)
    server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(token),id,Math.floor(Date.now()/1000)+600)
  }
  async function upload(values:Record<string,string>={},bytes=wav(),token=tokens.author,module='tapeecho') {
    const form=new FormData()
    for(const [key,value] of Object.entries({id:crypto.randomUUID(),credit:'Synth contributor',caption:'Dry then wet',duration:'1',permission:'true',...values}))form.set(key,value)
    form.set('file',new File([bytes],'preview.wav',{type:'audio/wav'}))
    return handleCommunity(new Request('https://api.example.test/api/modules/'+module+'/audio-previews',{method:'POST',headers:{Origin:'https://octamod.test',Authorization:'Bearer '+token},body:form}),server.env)
  }
  async function media(id:string,range?:string) {
    return handleCommunity(new Request('https://api.example.test/api/audio-previews/'+id,{headers:range?{Range:range}:{}}),server.env)
  }
  return {...server,objects,tokens,upload,media}
}
describe('public module audio previews',() => {
  it('requires a verified member, permission, credit, audio bytes and bounded files',async() => {
    const f=await fixture()
    expect((await f.upload({},wav(),'')).status).toBe(401)
    expect((await f.upload({},wav(),f.tokens.unverified)).status).toBe(403)
    expect((await f.upload({permission:'false'})).status).toBe(400)
    expect((await f.upload({credit:''})).status).toBe(400)
    for(const duration of ['0','-1','NaN'])expect((await f.upload({duration})).status).toBe(400)
    expect((await f.upload({},new TextEncoder().encode('firmware is never an audio file'.repeat(3)))).status).toBe(415)
    expect(f.objects.size).toBe(0)
  })
  it('publishes persistent metadata with the server username and serves real bytes and ranges',async() => {
    const f=await fixture(), created=await f.upload()
    expect(created.status).toBe(201)
    const item=await created.json()
    expect(item).toMatchObject({moduleId:'tapeecho',credit:'Synth contributor',caption:'Dry then wet',username:'author',canRemove:true})
    const list=await(await f.call('/audio-previews')).json()
    expect(list.items).toEqual([{...item,canRemove:false}])
    expect(list.uploadsAvailable).toBe(true)
    expect(new Uint8Array(await(await f.media(item.id)).arrayBuffer())).toEqual(wav())
    const partial=await f.media(item.id,'bytes=5-10')
    expect(partial.status).toBe(206);expect(partial.headers.get('Content-Range')).toBe('bytes 5-10/'+wav().length)
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(wav().slice(5,11))
    expect((await f.media(item.id,'bytes=999999-')).status).toBe(416)
  })
  it('accepts a long recording; only the 12 MB cap bounds it',async() => {
    const f=await fixture(), created=await f.upload({duration:'240'})
    expect(created.status).toBe(201)
    expect((await created.json()).duration).toBe(240)
  })
  it('deduplicates a retried upload and prevents another member taking its identifier',async() => {
    const f=await fixture(), id=crypto.randomUUID()
    expect((await f.upload({id})).status).toBe(201)
    expect((await f.upload({id})).status).toBe(200)
    expect((await f.upload({id},wav(),f.tokens.other)).status).toBe(409)
    expect(f.objects.size).toBe(1)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_audio_previews').get()).toEqual({count:1})
  })
  it('checks byte limits, unknown modules, captions and storage availability',async() => {
    const f=await fixture()
    expect((await f.upload({caption:'x'.repeat(301)})).status).toBe(400)
    expect((await f.upload({},wav(),f.tokens.author,'unknown')).status).toBe(404)
    expect((await f.upload({},new Uint8Array(12*1024*1024+1))).status).toBe(413)
    delete f.env.MEDIA
    expect((await f.upload()).status).toBe(503)
    expect(await(await f.call('/audio-previews')).json()).toMatchObject({uploadsAvailable:false,items:[]})
  })
  it('limits daily uploads and exposes owner and moderator removal only',async() => {
    const f=await fixture(), id=(await(await f.upload()).json()).id
    expect((await f.call('/audio-previews/'+id,'DELETE',undefined,f.tokens.other)).status).toBe(404)
    expect((await f.call('/audio-previews/'+id,'DELETE',undefined,f.tokens.author)).status).toBe(200)
    expect((await f.media(id)).status).toBe(404)
    expect((await(await f.call('/audio-previews')).json()).items).toEqual([])
    await cleanupAudioPreviews(f.env);expect(f.objects.size).toBe(0)
    const other=(await(await f.upload({},wav(),f.tokens.other)).json()).id
    const admin=(await(await f.call('/auth/admin','POST',{key:'e'.repeat(64)})).json()).token
    expect((await f.call('/audio-previews/'+other,'DELETE',undefined,'',admin)).status).toBe(200)
    for(let i=0;i<5;i++)expect((await f.upload()).status).toBe(201)
    expect((await f.upload()).status).toBe(429)
  })
  it('cleans failed storage and abandoned pending rows without exposing them',async() => {
    const f=await fixture()
    f.env.MEDIA!.put=async()=>{throw new Error('unavailable')}
    expect((await f.upload()).status).toBe(502)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_audio_previews').get()).toEqual({count:0})
    const id=crypto.randomUUID(), key='module-previews/'+id
    f.objects.set(key,wav())
    f.db.prepare("INSERT INTO module_audio_previews(id,module_id,module_version,user_id,credit,mime,bytes,sha256,duration,object_key,created_at) VALUES(?,'tapeecho','0.1.0','author','Author','audio/wav',16044,'hash',1,?,datetime('now','-2 hours'))").run(id,key)
    expect((await(await f.call('/audio-previews')).json()).items).toEqual([])
    expect((await f.media(id)).status).toBe(404)
    await cleanupAudioPreviews(f.env)
    expect(f.objects.size).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_audio_previews').get()).toEqual({count:0})
  })
  it('hides suspended contributors and purges previews from deleted accounts',async() => {
    const f=await fixture(), id=(await(await f.upload()).json()).id
    f.db.prepare("UPDATE users SET suspended=1 WHERE id='author'").run()
    expect((await(await f.call('/audio-previews')).json()).items).toEqual([])
    expect((await f.media(id)).status).toBe(404)
    f.db.prepare("UPDATE users SET username=NULL WHERE id='author'").run()
    await cleanupAudioPreviews(f.env)
    expect(f.objects.size).toBe(0)
  })
})
