import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { BETA_RISKS_VERSION, BETA_TESTER_LIMIT } from '../config/beta-invitation'
import betaDraft from '../../docs/news/008-beta-invitation.draft.json'
import { testServer } from './test-server'
import { sendNewsMail } from '../../server/news-mail'

const databases: Array<{ close(): void }> = [], mail: { subject: string; html: string; text: string; to: string[] }[] = []
const password = 'a beta invitation test passphrase'
beforeEach(() => { mail.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { mail.push(JSON.parse(String(options.body))); return Response.json({ id: 'test-email' }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  // D1 transactions are serialized. Keep that property in the in-memory adapter for competing joins.
  const batch = server.env.DB!.batch.bind(server.env.DB), queue = { last: Promise.resolve<unknown>(undefined) }
  server.env.DB!.batch = statements => {
    const result = queue.last.then(() => batch(statements)); queue.last = result.catch(() => {}); return result
  }
  async function member(username: string, newsletter = true) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { username, email, password, newsletter, rulesVersion: COMMUNITY_RULES_VERSION })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    server.db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').run(id)
    server.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(id)
    const session = (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
    return { id, session, email }
  }
  const admin = (await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
  const accept = { acceptRisks: true, risksVersion: BETA_RISKS_VERSION }
  return { ...server, member, admin, accept }
}

it('keeps the beta mail unsent as a draft, then binds a mailed invitation to its verified recipient and explicit risk acceptance', async () => {
  const { db, env, call, member, admin, accept } = await fixture()
  const invited = await member('betainvited'), outsider = await member('betaoutsider', false)
  const id = (await (await call('/admin/news', 'POST', betaDraft, '', admin)).json()).id as string
  mail.length = 0
  expect(await sendNewsMail(env, env.DB!)).toEqual({ sent: 0, queued: 0 })
  expect(mail).toHaveLength(0)
  const path = '/auth/beta-invitations/' + id
  expect((await call(path, 'GET', undefined, invited.session)).status).toBe(403)
  expect((await call('/admin/news/' + id + '/queue', 'POST', {}, '', admin)).status).toBe(200)
  expect((await call(path, 'POST', accept, invited.session)).status).toBe(403) // not mailed yet
  expect(await sendNewsMail(env, env.DB!)).toEqual({ sent: 1, queued: 0 })
  expect(mail).toHaveLength(1)
  expect(mail[0].to).toEqual([invited.email])
  expect(mail[0].html).toContain('href="https://octamod.test/#beta/join/' + id + '"')
  expect(mail[0].html).toContain('50 people')
  expect(mail[0].text).toContain('development Discord')
  expect((await call(path)).status).toBe(401)
  expect((await call(path, 'POST', accept, outsider.session)).status).toBe(403)
  expect(await (await call(path, 'GET', undefined, invited.session)).json()).toMatchObject({ status: 'pending', limit: 50 })
  expect(db.prepare('SELECT beta_tester FROM users WHERE id=?').get(invited.id)).toEqual({ beta_tester: 0 })
  for (const body of [{}, { ...accept, acceptRisks: false }, { ...accept, risksVersion: 'old' }]) expect((await call(path, 'POST', body, invited.session)).status).toBe(400)
  expect((await call(path, 'POST', accept, invited.session, '', 'https://evil.example')).status).toBe(403)
  db.prepare('UPDATE auth_users SET emailVerified=0 WHERE id=?').run(invited.id)
  db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(invited.id)
  expect((await call(path, 'POST', accept, invited.session)).status).toBe(401)
  db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').run(invited.id)
  db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(invited.id)
  expect((await call(path, 'POST', accept, invited.session)).status).toBe(200)
  expect((await call(path, 'POST', accept, invited.session)).status).toBe(200)
  expect(db.prepare('SELECT role,is_admin,beta_tester FROM users WHERE id=?').get(invited.id)).toMatchObject({ role: 'user', is_admin: 0, beta_tester: 1 })
  expect(db.prepare("SELECT COUNT(*) AS n FROM forum_moderation WHERE action='beta-tester:accept'").get()).toEqual({ n: 1 })
  const exported = await (await call('/auth/data-export', 'POST', { password }, invited.session)).json()
  expect(exported.data.betaInvitations).toMatchObject([{ campaign_id: id, state: 'accepted', risks_version: BETA_RISKS_VERSION }])
  expect((await call('/admin/forum/beta-testers/betainvited', 'PUT', { betaTester: false, reason: 'Beta access revoked' }, '', admin)).status).toBe(200)
  expect((await call(path, 'POST', accept, invited.session)).status).toBe(403)
  expect((await call('/auth/account', 'DELETE', { confirm: 'DELETE', password }, invited.session)).status).toBe(200)
  expect(db.prepare('SELECT * FROM member_beta_invitations WHERE user_id=?').all(invited.id)).toEqual([])
}, 120000)

it('admits only one competing member into the final place and caps admin grants and direct writes at the same 50-person pool', async () => {
  const { db, call, member, admin, accept } = await fixture()
  const first = await member('betafinalone'), second = await member('betafinaltwo')
  const path = '/auth/beta-invitations/public'
  expect((await call(path, 'GET', undefined, first.session)).status).toBe(404) // closed until explicitly opened
  const placesLeft = async () => (await (await call('/auth/beta-join')).json()).placesLeft
  expect(await placesLeft()).toBe(0)
  expect((await call('/admin/forum/beta-invitation', 'PUT', { publicEnabled: true }, first.session)).status).toBe(403)
  expect((await call('/admin/forum/beta-invitation', 'PUT', { publicEnabled: true }, '', admin)).status).toBe(200)
  expect(await placesLeft()).toBe(BETA_TESTER_LIMIT)
  for (let i = 0; i < BETA_TESTER_LIMIT - 1; i++) db.prepare('INSERT INTO users(id,display_name,username,email_verified,beta_tester) VALUES(?,?,?,1,1)').run('pool-' + i, 'Pool tester', 'pool' + i)
  expect(await (await call(path, 'GET', undefined, first.session)).json()).toMatchObject({ status: 'pending', testers: 49 })
  expect(await placesLeft()).toBe(1)
  const joins = await Promise.all([call(path, 'POST', accept, first.session), call(path, 'POST', accept, second.session)])
  expect(joins.map(result => result.status).sort()).toEqual([200, 409])
  expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE beta_tester=1').get()).toEqual({ n: 50 })
  const remaining = joins[0].status === 409 ? first : second
  const winner = remaining === first ? second : first
  expect(await (await call(path, 'GET', undefined, remaining.session)).json()).toMatchObject({ status: 'full', testers: 50 })
  expect(await placesLeft()).toBe(0)
  expect((await call('/admin/forum/beta-testers/' + (remaining === first ? 'betafinalone' : 'betafinaltwo'), 'PUT', { betaTester: true, reason: 'Extra beta place' }, '', admin)).status).toBe(409)
  expect(() => db.prepare('UPDATE users SET beta_tester=1 WHERE id=?').run(remaining.id)).toThrow('pool is full')
  expect(await (await call('/auth/beta-discord-invite', 'GET', undefined, winner.session)).json()).toEqual({ show: true })
  expect((await call('/auth/beta-discord-invite', 'POST', {}, winner.session)).status).toBe(200)
  expect(await (await call('/auth/beta-discord-invite', 'GET', undefined, winner.session)).json()).toEqual({ show: false })
  expect((await call('/auth/beta-discord-invite', 'GET', undefined, remaining.session)).status).toBe(403)
  expect((await call('/admin/forum/beta-testers/' + (winner === first ? 'betafinalone' : 'betafinaltwo'), 'PUT', { betaTester: false, reason: 'Beta access revoked' }, '', admin)).status).toBe(200)
  expect((await call(path, 'POST', accept, winner.session)).status).toBe(403)
  expect((await call(path, 'POST', accept, remaining.session)).status).toBe(200)
}, 120000)

it('lets a tester leave the beta on their own and logs it once', async () => {
  const { db, call, member } = await fixture()
  const tester = await member('betaleaver'), other = await member('betastayer')
  db.prepare('UPDATE users SET beta_tester=1 WHERE id IN (?,?)').run(tester.id, other.id)
  expect((await call('/auth/beta-leave', 'GET', undefined, tester.session)).status).toBe(405)
  expect((await call('/auth/beta-leave', 'POST', {})).status).toBe(401)
  expect((await call('/auth/beta-leave', 'POST', {}, tester.session)).status).toBe(200)
  expect((await call('/auth/beta-leave', 'POST', {}, tester.session)).status).toBe(200)
  expect(db.prepare('SELECT id,beta_tester FROM users WHERE id IN (?,?) ORDER BY username').all(tester.id, other.id)).toEqual([{ id: tester.id, beta_tester: 0 }, { id: other.id, beta_tester: 1 }])
  expect(db.prepare("SELECT actor_id,target FROM forum_moderation WHERE action='beta-tester:leave'").all()).toEqual([{ actor_id: tester.id, target: tester.id }])
  expect((await call('/auth/beta-discord-invite', 'GET', undefined, tester.session)).status).toBe(403)
})

it('admits members beyond the full pool only through the current secret extra link', async () => {
  const { db, call, member, admin, accept } = await fixture()
  const late = await member('betalateone'), other = await member('betalatetwo'), outsider = await member('betaoutsiderx')
  for (let i = 0; i < BETA_TESTER_LIMIT; i++) db.prepare('INSERT INTO users(id,display_name,username,email_verified,beta_tester) VALUES(?,?,?,1,1)').run('pool-' + i, 'Pool tester', 'pool' + i)
  expect((await call('/admin/forum/beta-invitation', 'PUT', { extraLink: true }, outsider.session)).status).toBe(403)
  expect(await (await call('/admin/forum/beta-invitation', 'GET', undefined, '', admin)).json()).toMatchObject({ extraToken: null })
  const token = (await (await call('/admin/forum/beta-invitation', 'PUT', { extraLink: true }, '', admin)).json()).extraToken as string
  expect(token).toMatch(/^[a-f0-9]{32}$/)
  const path = '/auth/beta-invitations/' + token
  expect(await (await call(path, 'GET', undefined, late.session)).json()).toMatchObject({ status: 'pending', testers: 50, limit: null })
  expect((await call(path, 'POST', accept, late.session)).status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE beta_tester=1').get()).toEqual({ n: 51 })
  // The cap still holds for every other path.
  expect((await call('/admin/forum/beta-testers/betaoutsiderx', 'PUT', { betaTester: true, reason: 'Extra place' }, '', admin)).status).toBe(409)
  expect(() => db.prepare('UPDATE users SET beta_tester=1 WHERE id=?').run(outsider.id)).toThrow('pool is full')
  const replaced = (await (await call('/admin/forum/beta-invitation', 'PUT', { extraLink: true }, '', admin)).json()).extraToken as string
  expect(replaced).not.toBe(token)
  expect((await call(path, 'POST', accept, other.session)).status).toBe(404)
  expect((await call('/admin/forum/beta-invitation', 'PUT', { extraLink: false }, '', admin)).status).toBe(200)
  expect((await call('/auth/beta-invitations/' + replaced, 'POST', accept, other.session)).status).toBe(404)
  expect(db.prepare("SELECT action FROM forum_moderation WHERE action LIKE 'beta-invitation:extra-%' ORDER BY rowid").all()).toEqual([{ action: 'beta-invitation:extra-new' }, { action: 'beta-invitation:extra-new' }, { action: 'beta-invitation:extra-close' }])
}, 120000)
