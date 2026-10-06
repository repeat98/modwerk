import { verifyPassword } from 'better-auth/crypto'
import type { Database, Env } from './platform'
import { accountAuth, accountUser } from './accounts'
import { needMember, throttle } from './auth'
import { cookie, HttpError, jsonBody, response } from './security'
import { validUsername } from './social-config'
import { avatarKey } from './avatars'

export async function profileRoutes(request: Request, env: Env, db: Database, path: string): Promise<Response | null> {
  if (path !== '/api/auth/profile' && path !== '/api/auth/account') return null
  const owner = needMember(await accountUser(request, env, db)), auth = accountAuth(env, db)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new HttpError(401, 'Sign in again to continue.')
  const credential = await db.prepare("SELECT password FROM auth_accounts WHERE userId=? AND providerId='credential'").bind(owner.id).first<{password: string | null}>()
  const freshLogin = Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60 * 1000
  if (path === '/api/auth/profile' && request.method === 'GET') {
    const profile = await db.prepare('SELECT display_name AS displayName,username,profile_bio AS bio FROM users WHERE id=?').bind(owner.id).first()
    const methods = (await db.prepare('SELECT providerId FROM auth_accounts WHERE userId=?').bind(owner.id).all()).results
    return response({ ...profile, email: session.user.email, passwordRequired: !!credential?.password, freshLogin, methods: methods.map(method => method.providerId) })
  }
  await throttle(db, 'account-settings:' + owner.id, 10, 900)
  const body = await jsonBody(request)
  if (path === '/api/auth/profile' && request.method === 'PATCH') {
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    if (!validUsername(username)) throw new HttpError(400, 'Use 3–24 letters, numbers or underscores, excluding reserved usernames.')
    if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 60 || typeof body.bio !== 'string' || body.bio.length > 500) throw new HttpError(400, 'Choose a display name up to 60 characters and a bio up to 500 characters.')
    const duplicate = await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE AND id<>?').bind(username, owner.id).first()
    if (duplicate) throw new HttpError(409, 'This username is already in use.')
    try {
      await db.batch([
        db.prepare('UPDATE users SET username=?,display_name=?,profile_bio=? WHERE id=? AND suspended=0').bind(username, body.displayName.trim(), body.bio.trim(), owner.id),
        db.prepare('UPDATE auth_users SET username=?,displayUsername=?,name=?,updatedAt=? WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND suspended=0)').bind(username, username, body.displayName.trim(), Date.now(), owner.id, owner.id),
      ])
    } catch { throw new HttpError(409, 'Your profile could not be saved. Check whether the username is available and try again.') }
    return response({ ok: true })
  }
  if (path !== '/api/auth/account' || request.method !== 'DELETE') throw new HttpError(405, 'Choose a supported account action.')
  if (body.confirm !== 'DELETE') throw new HttpError(400, 'Confirm account deletion by typing DELETE.')
  if (credential?.password) {
    if (typeof body.password !== 'string' || body.password.length > 128 || !await verifyPassword({ hash: credential.password, password: body.password })) throw new HttpError(403, 'Your password was not accepted.')
  } else if (!freshLogin) throw new HttpError(403, 'Sign in again before deleting your account. This confirmation requires a sign-in within the last ten minutes.')
  // One transaction revokes access and removes private account data. Public
  // discussion keeps a non-signing-in tombstone to preserve other replies.
  const tables = [['account_tokens','user_id'],['auth_verifications','value'],['sessions','user_id'],['configurations','user_id'],['developer_sessions','user_id'],['developer_auth_codes','user_id'],['module_maintainers','user_id'],['issue_replies','user_id'],['developer_events','actor_id'],['issues','reporter_id'],['ratings','user_id'],['likes','user_id'],['forum_reactions','user_id'],['forum_follows','user_id'],['forum_bookmarks','user_id'],['push_subscriptions','user_id'],['signup_events','user_id'],['notifications','user_id'],['notification_preferences','user_id'],['forum_reports','user_id'],['forum_shout_reports','user_id'],['forum_shouts','user_id'],['account_removal_requests','user_id'],['account_policy_acceptances','user_id']] as const
  const picture = await db.prepare('SELECT avatar_id FROM users WHERE id=?').bind(owner.id).first<{avatar_id: string | null}>()
  await db.batch([
    db.prepare('DELETE FROM module_update_subscriptions WHERE user_id=?').bind(owner.id),
    ...tables.map(([table, column]) => db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).bind(owner.id)),
    db.prepare('DELETE FROM auth_users WHERE id=?').bind(owner.id),
    // Posted text stays as anonymous discussion; images and sound clips are removed (the hourly job purges the files).
    db.prepare('UPDATE forum_media SET removed=1 WHERE user_id=?').bind(owner.id),
    db.prepare("UPDATE users SET username=NULL,display_name='Deleted member',profile_bio='',avatar_id=NULL,avatar_mime=NULL,email_verified=0,suspended=1,github_id=NULL,github_login=NULL WHERE id=?").bind(owner.id),
  ])
  if (picture?.avatar_id && env.MEDIA) await env.MEDIA.delete(avatarKey(picture.avatar_id))
  const out = response({ ok: true }); out.headers.set('X-Octamod-Session', '')
  out.headers.set('X-Modwerk-Developer', '')
  if(env.SESSION_TRANSPORT!=='bearer')for(const name of ['octamod-account.session_token','__Secure-octamod-account.session_token','octamod_session'])out.headers.append('Set-Cookie',cookie(name,'',env,0))
  return out
}
