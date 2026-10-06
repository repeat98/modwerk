import type { Database, Env, User } from './platform'
import { needMember, throttle } from './auth'
import { boundedBody, detectMedia, HttpError, response } from './security'

export const AVATAR_MAX_BYTES = 1024 * 1024
export const avatarKey = (id: string) => 'avatars/' + id

/** Profile pictures: members set or remove their own; anyone can load one by its random ID while the member is not suspended. */
export async function avatarRoutes(request: Request, env: Env, db: Database, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (path === '/api/forum/avatar' && (request.method === 'POST' || request.method === 'DELETE')) {
    const member = needMember(user)
    if (!env.MEDIA) throw new HttpError(503, 'Profile pictures are not available yet.')
    const current = await db.prepare('SELECT avatar_id FROM users WHERE id=?').bind(member.id).first<{avatar_id: string | null}>()
    if (request.method === 'DELETE') {
      if (current?.avatar_id) {
        await db.prepare('UPDATE users SET avatar_id=NULL,avatar_mime=NULL WHERE id=?').bind(member.id).run()
        await env.MEDIA.delete(avatarKey(current.avatar_id))
      }
      return response({ avatar: null })
    }
    await throttle(db, 'avatar:' + member.id, 10, 86400)
    const bytes = await boundedBody(request, AVATAR_MAX_BYTES)
    let detected: ReturnType<typeof detectMedia>
    try { detected = detectMedia(bytes, '') } catch { throw new HttpError(415, 'Use a PNG, JPEG or WebP image.') }
    if (detected.kind !== 'image') throw new HttpError(415, 'Use a PNG, JPEG or WebP image.')
    const id = crypto.randomUUID()
    // The object goes first so the row never names a missing file; a failed row update removes it again.
    await env.MEDIA.put(avatarKey(id), bytes, { httpMetadata: { contentType: detected.mime } })
    const updated = await db.prepare('UPDATE users SET avatar_id=?,avatar_mime=? WHERE id=? AND suspended=0 RETURNING id').bind(id, detected.mime, member.id).first()
    if (!updated) { await env.MEDIA.delete(avatarKey(id)); throw new HttpError(403, 'Your profile picture could not be saved.') }
    if (current?.avatar_id) await env.MEDIA.delete(avatarKey(current.avatar_id))
    return response({ avatar: id }, 201)
  }
  const match = path.match(/^\/api\/forum\/avatars\/([a-f0-9-]{36})$/)
  if (!match || request.method !== 'GET') return null
  const row = await db.prepare('SELECT avatar_mime FROM users WHERE avatar_id=? AND suspended=0').bind(match[1]).first<{avatar_mime: string}>()
  const object = row && env.MEDIA ? await env.MEDIA.get(avatarKey(match[1])) : null
  if (!row || !object) throw new HttpError(404, 'Picture not found.')
  // The ID changes with every new picture, so a long cache life is safe.
  return new Response(object.body, { headers: { 'Content-Type': row.avatar_mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'public, max-age=86400' } })
}
