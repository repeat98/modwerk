import type { Database, User } from './platform'
import { HttpError, jsonBody, response } from './security'
import { needMember, throttle } from './auth'
import { memberBetaAccess } from './beta-testers'
import { BETA_RISKS_VERSION, BETA_TESTER_LIMIT } from '../src/config/beta-invitation'

// The public round must be opened by an administrator. Email rounds belong to the receiving account.
// The secret extra link is open while its token is current and admits members beyond the pool limit.
const INVITATION = `SELECT i.state FROM member_beta_invitations i JOIN users u ON u.id=i.user_id
 WHERE i.campaign_id=? AND i.user_id=? AND u.suspended=0 AND u.email_verified=1 AND (
 (i.campaign_id='public' AND EXISTS(SELECT 1 FROM beta_invitation_settings WHERE id=1 AND public_enabled=1)) OR
 EXISTS(SELECT 1 FROM beta_invitation_settings WHERE id=1 AND extra_token=i.campaign_id) OR
 EXISTS(SELECT 1 FROM news_campaigns c JOIN news_deliveries d ON d.campaign_id=c.id
 WHERE c.id=i.campaign_id AND c.beta_invitation=1 AND c.status IN ('sending','sent') AND d.member_id=i.user_id AND d.status='sent'))`
const poolCount = (db: Database) => db.prepare('SELECT COUNT(*) AS total FROM users WHERE beta_tester=1').first<{ total: number }>()

export async function betaInvitationRoutes(request: Request, db: Database, path: string, user: User | null): Promise<Response | null> {
  // Anyone may see whether the public round is open, so the site can invite visitors while places are left.
  if (path === '/api/auth/beta-join') {
    if (request.method !== 'GET') throw new HttpError(405, 'Use GET to see whether the beta is open.')
    const row = await db.prepare('SELECT ?-(SELECT COUNT(*) FROM users WHERE beta_tester=1) AS places FROM beta_invitation_settings WHERE id=1 AND public_enabled=1').bind(BETA_TESTER_LIMIT).first<{ places: number }>()
    return response({ placesLeft: Math.max(0, row?.places ?? 0) })
  }
  if (path === '/api/auth/beta-discord-invite') {
    const member = needMember(user)
    if (!memberBetaAccess(member)) throw new HttpError(403, 'Beta tester access is required.')
    if (request.method === 'GET') return response({ show: !await db.prepare('SELECT 1 FROM member_beta_discord_invites WHERE user_id=?').bind(member.id).first() })
    if (request.method !== 'POST') throw new HttpError(405, 'Use GET or POST for the beta Discord invitation.')
    await db.prepare('INSERT OR IGNORE INTO member_beta_discord_invites(user_id) VALUES(?)').bind(member.id).run()
    return response({ ok: true })
  }
  // A tester can leave on their own; the used invitation cannot admit them again, only an administrator can.
  if (path === '/api/auth/beta-leave') {
    const member = needMember(user)
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST to leave the beta.')
    await db.batch([
      db.prepare("INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,'beta-tester:leave','left from the beta tester note' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND beta_tester=1)").bind(crypto.randomUUID(), member.id, member.id, member.id),
      db.prepare('UPDATE users SET beta_tester=0 WHERE id=?').bind(member.id),
    ])
    return response({ ok: true })
  }
  const match = /^\/api\/auth\/beta-invitations\/(public|[a-f0-9]{32})$/.exec(path)
  if (!match) return null
  const member = needMember(user), campaign = match[1]
  if (!['GET', 'POST'].includes(request.method)) throw new HttpError(405, 'Use GET to read the invitation or POST to accept it.')
  const extra = campaign !== 'public' && !!await db.prepare('SELECT 1 FROM beta_invitation_settings WHERE id=1 AND extra_token=?').bind(campaign).first()
  const selfServe = campaign === 'public' || extra
  const open = campaign === 'public'
    ? await db.prepare('SELECT 1 FROM beta_invitation_settings WHERE id=1 AND public_enabled=1').first()
    : extra || await db.prepare('SELECT 1 FROM news_campaigns WHERE id=? AND beta_invitation=1').bind(campaign).first()
  if (!open) throw new HttpError(404, 'This beta invitation is not open yet.')
  const pool = { testers: (await poolCount(db))?.total ?? 0, limit: extra ? null : BETA_TESTER_LIMIT, risksVersion: BETA_RISKS_VERSION }
  if (memberBetaAccess(member)) return response({ status: 'active', ...pool })
  const invitation = selfServe
    ? await db.prepare('SELECT state FROM member_beta_invitations WHERE campaign_id=? AND user_id=?').bind(campaign, member.id).first<{ state: string }>()
    : await db.prepare(INVITATION).bind(campaign, member.id).first<{ state: string }>()
  if (!selfServe && !invitation) throw new HttpError(403, 'Sign in with the account that received this beta invitation.')
  if (invitation && invitation.state !== 'pending') throw new HttpError(403, 'This invitation can no longer grant beta access. Please contact support if you need help.')
  if (request.method === 'GET') return response({ status: pool.limit !== null && pool.testers >= pool.limit ? 'full' : 'pending', ...pool })
  const body = await jsonBody(request)
  if (body.acceptRisks !== true || body.risksVersion !== BETA_RISKS_VERSION) throw new HttpError(400, 'Read and accept the current beta risks before joining.')
  await throttle(db, 'beta-invitation:' + member.id, 10, 900)
  const eligible = `EXISTS (${INVITATION} AND i.state='pending')`
  // One transaction binds the current risk acknowledgement, available place and role update.
  await db.batch([
    ...(selfServe ? [db.prepare('INSERT OR IGNORE INTO member_beta_invitations(campaign_id,user_id) VALUES(?,?)').bind(campaign, member.id)] : []),
    db.prepare(`UPDATE users SET beta_tester=1 WHERE id=? AND ${eligible} AND (?=1 OR (SELECT COUNT(*) FROM users WHERE beta_tester=1)<?)`).bind(member.id, campaign, member.id, Number(extra), BETA_TESTER_LIMIT),
    db.prepare(`INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?, 'beta-tester:accept',? WHERE ${eligible} AND EXISTS(SELECT 1 FROM users WHERE id=? AND beta_tester=1)`)
      .bind(crypto.randomUUID(), member.id, member.id, BETA_RISKS_VERSION + ' · campaign ' + campaign, campaign, member.id, member.id),
    db.prepare(`UPDATE member_beta_invitations SET state='accepted',risks_version=?,accepted_at=CURRENT_TIMESTAMP WHERE campaign_id=? AND user_id=? AND state='pending' AND ${eligible} AND EXISTS(SELECT 1 FROM users WHERE id=? AND beta_tester=1)`)
      .bind(BETA_RISKS_VERSION, campaign, member.id, campaign, member.id, member.id),
  ])
  const active = await db.prepare('SELECT beta_tester FROM users WHERE id=? AND suspended=0 AND email_verified=1').bind(member.id).first<{ beta_tester: number }>()
  if (!active?.beta_tester) {
    if (!extra && ((await poolCount(db))?.total ?? 0) >= BETA_TESTER_LIMIT) throw new HttpError(409, 'The beta tester pool is full (50 people).')
    throw new HttpError(403, 'Beta access could not be granted. Refresh the invitation and try again.')
  }
  return response({ status: 'active', ...pool, testers: (await poolCount(db))?.total ?? 0 })
}
