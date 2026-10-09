import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { communityModule } from './modules'

const databases: DatabaseSync[] = [], sent: { to: string[]; text: string }[] = [], password = 'a long original test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = [...sent].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    return { id: String(server.db.prepare('SELECT id FROM users WHERE username=?').get(username)!.id), session: login.headers.get('X-Octamod-Session')! }
  }
  const admin = async () => (await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
  const role = (id: string) => server.db.prepare('SELECT role FROM users WHERE id=?').get(id)!.role
  /** Roles shown beside each author on a thread page. */
  async function badges(threadId: string) {
    const { posts } = await (await server.call('/forum/threads/' + threadId)).json() as { posts: { username: string; role: string | null }[] }
    return Object.fromEntries(posts.map(post => [post.username, post.role]))
  }
  return { ...server, member, admin, role, badges }
}

describe('member roles', () => {
  it('makes the GitHub account 67785539 the owner, never a lookalike username', async () => {
    const f = await fixture(), signedIn = await f.member('owner_gh'), squatter = await f.member('repeat98'), other = await f.member('someone')
    f.db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('gh','67785539','github',?,0,0)").run(signedIn.id)
    f.db.prepare("INSERT INTO users(id,display_name,github_id,github_login) VALUES('dev-identity','@repeat98','67785539','repeat98')").run()
    f.db.exec(readFileSync(new URL('../../migrations/0048_member_roles.sql', import.meta.url), 'utf8').split('\n').filter(line => !line.startsWith('ALTER')).join('\n'))
    expect([f.role(signedIn.id), f.role('dev-identity'), f.role(squatter.id), f.role(other.id)]).toEqual(['owner', 'owner', 'user', 'user'])
    // The administrator named repeat98 is the owner too.
    f.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(squatter.id)
    f.db.exec("UPDATE users SET role='owner' WHERE username='repeat98' AND is_admin=1")
    expect(f.role(squatter.id)).toBe('owner')
  })

  it('lets administrators grant and remove the developer role, logged, but never touch the owner', async () => {
    const f = await fixture(), alice = await f.member('alice'), owner = await f.member('ownername'), admin = await f.admin()
    f.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(owner.id)
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'developer', reason: 'Builds modules' }, alice.session)).status).toBe(403)
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'developer', reason: 'Builds modules' }, '', admin)).status).toBe(200)
    expect(f.role(alice.id)).toBe('developer')
    expect(await (await f.call('/admin/forum/roles', 'GET', undefined, '', admin)).json()).toEqual([{ username: 'ownername', displayName: 'ownername', role: 'owner' }, { username: 'alice', displayName: 'alice', role: 'developer' }])
    expect(f.db.prepare("SELECT action,reason FROM forum_moderation WHERE target=?").all(alice.id)).toEqual([{ action: 'role:developer', reason: 'Builds modules' }])
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'owner', reason: 'x' }, '', admin)).status).toBe(400)
    expect((await f.call('/admin/forum/roles/ownername', 'PUT', { role: 'user', reason: 'x' }, '', admin)).status).toBe(409)
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'developer' }, '', admin)).status).toBe(400)
    expect((await f.call('/admin/forum/roles/nobody', 'PUT', { role: 'developer', reason: 'x' }, '', admin)).status).toBe(404)
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'user', reason: 'Asked to' }, '', admin)).status).toBe(200)
    expect([f.role(alice.id), f.role(owner.id)]).toEqual(['user', 'owner'])
  })

  it('grants and revokes beta access independently of roles and checks builds on the server', async () => {
    const f = await fixture(), tester = await f.member('00schneider'), admin = await f.admin()
    const beta = '/admin/forum/beta-testers/00schneider'
    const access = () => f.call('/auth/build-access', 'POST', { moduleIds: ['airwindows-chorus'] }, tester.session)
    expect((await access()).status).toBe(403)
    expect((await f.call(beta, 'PUT', { betaTester: true, reason: 'Beta invitation' }, tester.session)).status).toBe(403)
    f.db.prepare("UPDATE users SET role='developer' WHERE id=?").run(tester.id)
    expect((await f.call(beta, 'PUT', { betaTester: true, reason: 'Beta invitation' }, '', admin)).status).toBe(200)
    expect(f.role(tester.id)).toBe('developer')
    expect(await (await f.call('/auth/session', 'GET', undefined, tester.session)).json()).toMatchObject({ admin: false, user: { betaTester: true } })
    expect((await access()).status).toBe(200)
    expect((await f.call('/auth/build-access', 'POST', { moduleIds: ['spectrum'] }, tester.session)).status).toBe(403)
    expect((await f.call('/modules/airwindows-chorus/download', 'POST', {}, tester.session)).status).toBe(200)
    expect(await (await f.call('/forum/profiles/00schneider')).json()).toMatchObject({ role: 'developer', betaTester: true })
    const thread = await (await f.call('/forum/threads', 'POST', { title: 'Testing', body: 'Beta', category: 'general' }, tester.session)).json() as { id: string }
    expect(await (await f.call('/forum/threads/' + thread.id)).json()).toMatchObject({ posts: [{ betaTester: true, role: 'developer' }] })
    expect((await f.call(beta, 'PUT', { betaTester: false, reason: 'Testing complete' }, '', admin)).status).toBe(200)
    expect((await access()).status).toBe(403)
    expect((await f.call('/modules/airwindows-chorus/download', 'POST', {}, tester.session)).status).toBe(400)
    expect(f.role(tester.id)).toBe('developer')
    expect(f.db.prepare('SELECT action FROM forum_moderation WHERE target=?').all(tester.id)).toEqual([{ action: 'beta-tester:grant' }, { action: 'beta-tester:remove' }])
  })

  it('shows Owner and Developer beside posts, including developers by confirmed module claim', async () => {
    const f = await fixture(), maker = await f.member('maker'), owner = await f.member('ownername'), plain = await f.member('plain')
    f.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(owner.id)
    const author = communityModule('miniverb')!.author
    f.db.prepare("INSERT INTO users(id,display_name,github_id,github_login) VALUES('dev-identity',?,'4242',?)").run(author, author)
    f.db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('gh','4242','github',?,0,0)").run(maker.id)
    f.db.prepare("INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES('miniverb','dev-identity',?)").run(author)
    const created = await (await f.call('/forum/threads', 'POST', { title: 'Roles', body: 'Hello', category: 'general' }, plain.session)).json() as { id: string }
    for (const who of [maker, owner]) expect((await f.call('/forum/threads/' + created.id + '/replies', 'POST', { body: 'Hi' }, who.session)).status).toBe(201)
    expect(await f.badges(created.id)).toEqual({ plain: 'user', maker: 'developer', ownername: 'owner' })
    // A revoked claim no longer makes a developer.
    f.db.exec('UPDATE module_maintainers SET revoked=1')
    expect((await f.badges(created.id)).maker).toBe('user')
  })

  it('puts the role, public bug reports and likes from others on the profile', async () => {
    const f = await fixture(), alice = await f.member('alice'), fan = await f.member('fanone'), owner = await f.member('ownername')
    f.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(owner.id)
    const thread = await (await f.call('/forum/threads', 'POST', { title: 'Mine', body: 'Hello', category: 'general' }, alice.session)).json() as { id: string }
    const opening = String(f.db.prepare('SELECT id FROM forum_posts WHERE thread_id=?').get(thread.id)!.id)
    for (const who of [alice, fan]) expect((await f.call('/forum/posts/' + opening + '/react', 'POST', { liked: true }, who.session)).status).toBe(200)
    const report = f.db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,public_json) VALUES(?,'miniverb','x',?,'t','b',?)")
    report.run('public-report', alice.id, '{}'); report.run('private-report', alice.id, null)
    const profile = async (name: string) => (await (await f.call('/forum/profiles/' + name)).json()) as { role: string; threads: number; likesReceived: number; reports: number }
    expect(await profile('alice')).toMatchObject({ role: 'user', threads: 1, likesReceived: 1, reports: 1 })
    expect((await profile('ownername')).role).toBe('owner')
    expect((await f.call('/admin/forum/roles/alice', 'PUT', { role: 'developer', reason: 'Builds modules' }, '', await f.admin())).status).toBe(200)
    expect((await profile('alice')).role).toBe('developer')
  })
})
