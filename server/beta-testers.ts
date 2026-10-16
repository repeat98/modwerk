import type { Database, User } from './platform'
import { BETA_TESTER_LIMIT } from '../src/config/beta-invitation'
import { HttpError, jsonBody, required, response } from './security'

export const memberBetaAccess = (member: User) => !!(member.email_verified && !member.suspended && (member.beta_tester || member.is_admin))
export async function betaTesterIds(db: Database, ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Set<string>()
  const rows = await db.prepare(`SELECT id FROM users WHERE beta_tester=1 AND suspended=0 AND id IN (${unique.map(() => '?').join(',')})`).bind(...unique).all<{ id: string }>()
  return new Set(rows.results.map(row => row.id))
}
export async function adminBetaTesterRoutes(request: Request, db: Database, path: string, actorId: string): Promise<Response | null> {
  if (path === '/api/admin/forum/beta-invitation') {
    if (request.method === 'PUT') {
      const body = await jsonBody(request)
      // A new random token retires any earlier extra link; false closes it.
      if (typeof body.extraLink === 'boolean') await db.batch([
        db.prepare('UPDATE beta_invitation_settings SET extra_token=? WHERE id=1').bind(body.extraLink ? crypto.randomUUID().replaceAll('-', '') : null),
        db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), actorId, 'beta-pool', 'beta-invitation:extra-' + (body.extraLink ? 'new' : 'close'), 'Extra beta invitation link'),
      ])
      else if (typeof body.publicEnabled !== 'boolean') throw new HttpError(400, 'Choose whether the public beta invitation is open.')
      else await db.batch([
        db.prepare('UPDATE beta_invitation_settings SET public_enabled=? WHERE id=1').bind(Number(body.publicEnabled)),
        db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), actorId, 'beta-pool', 'beta-invitation:' + (body.publicEnabled ? 'open' : 'close'), 'Public beta invitation'),
      ])
    } else if (request.method !== 'GET') throw new HttpError(405, 'Use GET or PUT for the beta invitation.')
    const settings = await db.prepare('SELECT public_enabled,extra_token FROM beta_invitation_settings WHERE id=1').first<{ public_enabled: number; extra_token: string | null }>()
    const pool = await db.prepare('SELECT COUNT(*) AS total FROM users WHERE beta_tester=1').first<{ total: number }>()
    return response({ publicEnabled: !!settings?.public_enabled, extraToken: settings?.extra_token ?? null, testers: pool?.total ?? 0, limit: BETA_TESTER_LIMIT })
  }
  if (path === '/api/admin/forum/beta-testers' && request.method === 'GET')
    return response((await db.prepare('SELECT username,display_name AS displayName FROM users WHERE beta_tester=1 AND suspended=0 AND username IS NOT NULL ORDER BY username LIMIT 200').all()).results)
  const match = path.match(/^\/api\/admin\/forum\/beta-testers\/([a-z0-9_]{3,24})$/)
  if (!match || request.method !== 'PUT') return null
  const body = await jsonBody(request), reason = required(body.reason, 'Reason', 1000)
  if (typeof body.betaTester !== 'boolean') throw new HttpError(400, 'Choose whether to grant beta tester access.')
  const member = await db.prepare('SELECT id FROM users WHERE username=? AND (?=0 OR suspended=0) AND email_verified=1').bind(match[1], Number(body.betaTester)).first<{ id: string }>()
  if (!member) throw new HttpError(404, 'Verified member not found.')
  const results = await db.batch([
    db.prepare('UPDATE users SET beta_tester=? WHERE id=? AND (?=0 OR beta_tester=1 OR (SELECT COUNT(*) FROM users WHERE beta_tester=1)<?) RETURNING id').bind(Number(body.betaTester), member.id, Number(body.betaTester), BETA_TESTER_LIMIT),
    ...(body.betaTester ? [] : [
      db.prepare("INSERT INTO member_beta_invitations(campaign_id,user_id,state) SELECT 'public',id,'revoked' FROM auth_users WHERE id=? ON CONFLICT(campaign_id,user_id) DO UPDATE SET state='revoked'").bind(member.id),
      db.prepare("UPDATE member_beta_invitations SET state='revoked' WHERE user_id=?").bind(member.id),
    ]),
    db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND beta_tester=?)').bind(crypto.randomUUID(), actorId, member.id, body.betaTester ? 'beta-tester:grant' : 'beta-tester:remove', reason, member.id, Number(body.betaTester)),
  ]) as { results: unknown[] }[]
  if (!results[0].results.length) throw new HttpError(409, 'The beta tester pool is full (50 people).')
  return response({ ok: true })
}
