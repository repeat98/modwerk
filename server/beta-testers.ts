import type { Database, User } from './platform'
import { HttpError, jsonBody, required, response } from './security'

export const memberBetaAccess = (member: User) => !!(member.email_verified && !member.suspended && (member.beta_tester || member.is_admin))
export async function betaTesterIds(db: Database, ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Set<string>()
  const rows = await db.prepare(`SELECT id FROM users WHERE beta_tester=1 AND suspended=0 AND id IN (${unique.map(() => '?').join(',')})`).bind(...unique).all<{ id: string }>()
  return new Set(rows.results.map(row => row.id))
}
export async function adminBetaTesterRoutes(request: Request, db: Database, path: string, actorId: string): Promise<Response | null> {
  if (path === '/api/admin/forum/beta-testers' && request.method === 'GET')
    return response((await db.prepare('SELECT username,display_name AS displayName FROM users WHERE beta_tester=1 AND suspended=0 AND username IS NOT NULL ORDER BY username LIMIT 200').all()).results)
  const match = path.match(/^\/api\/admin\/forum\/beta-testers\/([a-z0-9_]{3,24})$/)
  if (!match || request.method !== 'PUT') return null
  const body = await jsonBody(request), reason = required(body.reason, 'Reason', 1000)
  if (typeof body.betaTester !== 'boolean') throw new HttpError(400, 'Choose whether to grant beta tester access.')
  const member = await db.prepare('SELECT id FROM users WHERE username=? AND suspended=0 AND email_verified=1').bind(match[1]).first<{ id: string }>()
  if (!member) throw new HttpError(404, 'Verified member not found.')
  await db.batch([
    db.prepare('UPDATE users SET beta_tester=? WHERE id=?').bind(Number(body.betaTester), member.id),
    db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), actorId, member.id, body.betaTester ? 'beta-tester:grant' : 'beta-tester:remove', reason),
  ])
  return response({ ok: true })
}
