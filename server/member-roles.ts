import type { Database } from './platform'
import { HttpError, jsonBody, required, response } from './security'
import { COMMUNITY_MODULES } from '../src/community/modules'
import { effectiveRole, isMemberRole, type MemberRole } from '../src/community/member-standing'
import { CONFIRMED } from './recognition'
import { adminBetaTesterRoutes } from './beta-testers'

const listed = (moduleId: string, login: string) => COMMUNITY_MODULES.some(module => module.id === moduleId && module.maintainers.some(handle => handle.toLowerCase() === login.toLowerCase()))

/** Member IDs that earn the developer role through a confirmed claim on a module the reviewed catalog still lists:
 * the GitHub developer identity itself and the forum account signed in through the same GitHub account. */
export async function claimedDevelopers(db: Database, ids?: string[]): Promise<Set<string>> {
  if (ids && !ids.length) return new Set()
  const scope = ids ? `AND (d.id IN (${ids.map(() => '?').join(',')}) OR g.userId IN (${ids.map(() => '?').join(',')}))` : ''
  const rows = (await db.prepare(`SELECT d.id,g.userId AS member,m.module_id,m.github_login FROM module_maintainers m JOIN users d ON d.id=m.user_id LEFT JOIN auth_accounts g ON g.providerId='github' AND g.accountId=d.github_id WHERE ${CONFIRMED} ${scope}`)
    .bind(...(ids ?? []), ...(ids ?? [])).all<{ id: string; member: string | null; module_id: string; github_login: string }>()).results
  return new Set(rows.filter(row => listed(row.module_id, row.github_login)).flatMap(row => row.member ? [row.id, row.member] : [row.id]))
}


/** Roles for the authors on one page of posts, keyed by member ID. */
export async function memberRoles(db: Database, ids: string[]): Promise<Map<string, MemberRole>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const [stored, developers] = await Promise.all([
    db.prepare(`SELECT id,role FROM users WHERE id IN (${unique.map(() => '?').join(',')})`).bind(...unique).all<{ id: string; role: string }>(),
    claimedDevelopers(db, unique),
  ])
  return new Map(stored.results.map(row => [row.id, effectiveRole(row.role, developers.has(row.id))]))
}

/** Administrators grant or remove the developer role by username. The owner role is assigned only by migration, so it
 * can neither be granted nor taken away here; each change is recorded in the moderation history with its reason. */
export async function adminRoleRoutes(request: Request, db: Database, path: string, actorId: string): Promise<Response | null> {
  const beta = await adminBetaTesterRoutes(request, db, path, actorId)
  if (beta) return beta
  if (path === '/api/admin/forum/roles' && request.method === 'GET')
    return response((await db.prepare("SELECT username,display_name AS displayName,role FROM users WHERE role<>'user' AND suspended=0 AND username IS NOT NULL ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,username LIMIT 200").all()).results)
  const match = path.match(/^\/api\/admin\/forum\/roles\/([a-z0-9_]{3,24})$/)
  if (!match || request.method !== 'PUT') return null
  const body = await jsonBody(request), reason = required(body.reason, 'Reason', 1000)
  if (!isMemberRole(body.role) || body.role === 'owner') throw new HttpError(400, 'Choose Member or Developer.')
  const member = await db.prepare('SELECT id,role FROM users WHERE username=? AND suspended=0').bind(match[1]).first<{ id: string; role: string }>()
  if (!member) throw new HttpError(404, 'Member not found.')
  if (member.role === 'owner') throw new HttpError(409, 'The owner role cannot be changed here.')
  await db.batch([
    db.prepare("UPDATE users SET role=? WHERE id=? AND role<>'owner'").bind(body.role, member.id),
    db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), actorId, member.id, 'role:' + body.role, reason),
  ])
  return response({ ok: true })
}
