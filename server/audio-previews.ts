// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { Database, Env, User } from './platform'
import { needMember, throttle } from './auth'
import { boundedBody, detectMedia, HttpError, optional, required, response } from './security'
import { communityModule } from '../src/community/modules'
import { byteRange } from './forum-media'

const MAX_BYTES = 12 * 1024 * 1024
type Preview = { id: string; module_id: string; module_version: string; user_id: string|null; credit: string; caption: string; mime: string; bytes: number; sha256: string; duration: number; object_key: string; published: number; removed: number; username?: string|null; suspended?: number }
const missing = () => new HttpError(404, 'Audio preview not found.')
const publicPreview = (item: Preview, user: User|null, admin: boolean) => ({
  id: item.id, moduleId: item.module_id, version: item.module_version, credit: item.credit,
  duration: item.duration, caption: item.caption, username: item.username, canRemove: admin || item.user_id === user?.id,
})
const fields = 'p.*,u.username,u.suspended'
const visible = "p.published=1 AND p.removed=0 AND u.username IS NOT NULL AND (u.suspended=0 OR ?=1)"

export async function audioPreviewRoutes(request: Request, env: Env, db: Database, user: User|null, admin: boolean): Promise<Response|null> {
  const path = new URL(request.url).pathname
  if (path === '/api/audio-previews' && request.method === 'GET') {
    const items = (await db.prepare(`SELECT ${fields} FROM module_audio_previews p JOIN users u ON u.id=p.user_id WHERE ${visible} ORDER BY p.created_at,p.id`).bind(Number(admin)).all<Preview>()).results
    return response({ items: items.map(item => publicPreview(item,user,admin)), uploadsAvailable: !!env.MEDIA })
  }
  const collection = path.match(/^\/api\/modules\/([a-z0-9-]+)\/audio-previews$/)
  if (collection && request.method === 'POST') {
    const member = needMember(user), module = communityModule(collection[1])
    if (!module) throw new HttpError(404, 'Module not found.')
    if (!env.MEDIA) throw new HttpError(503, 'Audio submissions are temporarily unavailable.')
    await throttle(db,'audio-preview:'+member.id,6,86400)
    await throttle(db,'audio-preview-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),12,86400)
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new HttpError(415, 'Choose an audio file.')
    const body = await boundedBody(request, MAX_BYTES + 8192)
    let form: FormData
    try { form = await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData() }
    catch { throw new HttpError(400, 'The audio submission could not be read.') }
    const file = form.get('file'), id = form.get('id'), credit = required(form.get('credit'),'Credit',100), duration = Number(form.get('duration'))
    const caption = optional(form.get('caption'),'Caption',300)
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) throw new HttpError(413, 'Choose a recording smaller than 12 MB.')
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(400, 'This submission needs a valid identifier.')
    if (form.get('permission') !== 'true') throw new HttpError(400, 'Confirm you have permission to share this recording.')
    if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(400, 'This recording could not be read.')
    const bytes = await file.arrayBuffer(), detected = detectMedia(bytes,'')
    if (detected.kind !== 'audio') throw new HttpError(415, 'Choose a WAV, MP3 or Ogg recording.')
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')
    const existing = await db.prepare('SELECT * FROM module_audio_previews WHERE id=?').bind(id).first<Preview>()
    if (existing) {
      if (existing.user_id !== member.id || existing.module_id !== module.id || existing.sha256 !== sha || existing.credit !== credit || existing.caption !== caption || existing.removed) throw new HttpError(409, 'This submission identifier is already in use. Choose the recording again.')
      if (!existing.published) throw new HttpError(409, 'This preview is still being saved. Try again shortly.')
      return response(publicPreview({...existing,username:member.username},member,admin),200)
    }
    const counts = await db.prepare("SELECT (SELECT COUNT(*) FROM module_audio_previews WHERE module_id=? AND removed=0) AS clips,(SELECT COALESCE(SUM(bytes),0) FROM module_audio_previews WHERE user_id=? AND created_at>datetime('now','-1 day')) AS dailyBytes").bind(module.id,member.id).first<{clips:number;dailyBytes:number}>()
    if ((counts?.clips??0) >= 24) throw new HttpError(429, 'This module already has 24 previews. Remove an older recording before adding another.')
    if ((counts?.dailyBytes??0) + bytes.byteLength > 36*1024*1024) throw new HttpError(429, 'You have reached today’s audio upload allowance. Try again tomorrow.')
    const key = 'module-previews/' + id
    await db.prepare('INSERT INTO module_audio_previews(id,module_id,module_version,user_id,credit,caption,mime,bytes,sha256,duration,object_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,module.id,module.version,member.id,credit,caption,detected.mime,bytes.byteLength,sha,duration,key).run()
    try { await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:detected.mime}}) }
    catch { await db.prepare('DELETE FROM module_audio_previews WHERE id=?').bind(id).run(); throw new HttpError(502,'The recording could not be stored. Try again.') }
    await db.prepare('UPDATE module_audio_previews SET published=1 WHERE id=?').bind(id).run()
    return response(publicPreview({id,module_id:module.id,module_version:module.version,user_id:member.id,username:member.username,credit,caption,mime:detected.mime,bytes:bytes.byteLength,sha256:sha,duration,object_key:key,published:1,removed:0},member,admin),201)
  }
  const item = path.match(/^\/api\/audio-previews\/([a-f0-9-]{36})$/)
  if (!item) return null
  if (request.method === 'DELETE') {
    const member = admin ? user : needMember(user)
    const removed = await db.prepare('UPDATE module_audio_previews SET removed=1 WHERE id=? AND removed=0 AND (user_id=? OR ?=1) RETURNING id').bind(item[1],member?.id??'',Number(admin)).first()
    if (!removed) throw missing()
    return response({ok:true})
  }
  if (request.method === 'GET') {
    const clip = await db.prepare(`SELECT ${fields} FROM module_audio_previews p JOIN users u ON u.id=p.user_id WHERE p.id=? AND ${visible}`).bind(item[1],Number(admin)).first<Preview>()
    if (!clip || !env.MEDIA) throw missing()
    const range = byteRange(request.headers.get('Range'),clip.bytes)
    const headers = new Headers({'Content-Type':clip.mime,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline','Cross-Origin-Resource-Policy':'cross-origin','Cache-Control':'no-store'})
    if (range === 'unsatisfiable') { headers.set('Content-Range','bytes */'+clip.bytes); return new Response(null,{status:416,headers}) }
    const object = await env.MEDIA.get(clip.object_key,range?{range}:undefined)
    if (!object) throw missing()
    if (range) headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${clip.bytes}`)
    return new Response(object.body,{status:range?206:200,headers})
  }
  return null
}

export async function cleanupAudioPreviews(env: Env) {
  if (!env.DB || !env.MEDIA) return
  const rows = (await env.DB.prepare("SELECT id,object_key FROM module_audio_previews WHERE removed=1 OR (published=0 AND created_at<=datetime('now','-1 hour')) OR user_id IS NULL OR user_id IN (SELECT id FROM users WHERE username IS NULL) LIMIT 200").all<{id:string;object_key:string}>()).results
  for (const row of rows) { await env.MEDIA.delete(row.object_key); await env.DB.prepare('DELETE FROM module_audio_previews WHERE id=?').bind(row.id).run() }
}
