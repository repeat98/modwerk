import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digest } from '../../server/security'
import { handleCommunity } from '../../server/transport'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { communityModule } from './modules'
import { notificationLines } from './notification-text'
import type { NotificationItem } from './notification-contract'
import { testServer } from './test-server'

const databases: DatabaseSync[] = []
const sent: { to: string[]; text: string }[] = []
const password = 'private report test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const f = await testServer(); databases.push(f.db)
  Object.assign(f.env, { GITHUB_OAUTH_CLIENT_ID: 'reply-test', GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-client-secret', GITHUB_OAUTH_CALLBACK_URL: 'https://api.example.test/api/developer/auth/callback' })
  const email = 'reporter@example.test'
  expect((await f.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username: 'reporter', email, password })).status).toBe(202)
  const verify = sent.find(item => item.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
  expect((await f.call('/auth/verify', 'POST', { token: verify, password })).status).toBe(200)
  const session = (await f.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
  const reporterId = String(f.db.prepare("SELECT id FROM users WHERE username='reporter'").get()!.id)
  const module = communityModule('miniverb')!, login = module.maintainers[0]
  f.db.prepare("INSERT INTO users(id,display_name,github_id,github_login) VALUES('maker',?,'67785539',?)").run('@' + login, login)
  const developer = await digest('developer-token:maker')
  f.db.prepare('INSERT INTO developer_sessions(token_hash,user_id,client_hash,expires) VALUES(?,?,?,?)').run(await digest(developer), 'maker', await digest('reply-test:synthetic-client-secret'), Math.floor(Date.now() / 1000) + 600)
  f.db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,maintainer_sharing) VALUES('report',?,?,?,'Crackle on FX2','Private details',1)").run(module.id, module.author, reporterId)
  async function as(path: string, method: string, body: unknown, token: { member?: string; developer?: string }) {
    const headers = new Headers({ Origin: 'https://octamod.test', 'CF-Connecting-IP': '192.0.2.1' })
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (token.member) headers.set('Authorization', 'Bearer ' + token.member)
    if (token.developer) headers.set('X-Modwerk-Developer', token.developer)
    return handleCommunity(new Request('https://api.example.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), f.env)
  }
  expect((await as('/developer/modules/' + module.id + '/claim', 'POST', {}, { developer })).status).toBe(201)
  return { ...f, session, developer, reporterId, module, as }
}

describe('replies on a private report', () => {
  it('tell the reporter when a maintainer replies, and the maintainers when the reporter replies', async () => {
    const f = await fixture()
    expect((await f.as('/issues/report/replies', 'POST', { body: 'Can you attach OCTAMOD.LOG?' }, { developer: f.developer })).status).toBe(201)
    const mine = (await (await f.as('/notifications', 'GET', undefined, { member: f.session })).json()).items as NotificationItem[]
    expect(mine).toHaveLength(1)
    expect(notificationLines(mine)[0]).toMatchObject({ text: 'A module developer replied to your bug report “Crackle on FX2”', excerpt: 'Can you attach OCTAMOD.LOG?', href: '#account/report/report' })

    expect((await f.as('/issues/report/replies', 'POST', { body: 'Attached, thanks.' }, { member: f.session })).status).toBe(201)
    const inbox = await (await f.as('/developer/notifications', 'GET', undefined, { developer: f.developer })).json() as NotificationItem[]
    expect(inbox).toHaveLength(1)
    expect(notificationLines(inbox)[0]).toMatchObject({ text: '@reporter replied to the private report “Crackle on FX2”', excerpt: 'Attached, thanks.', href: '#developer/report/report' })
    // Each side hears only about the other side's reply.
    expect(f.db.prepare("SELECT user_id FROM notifications WHERE kind='issue_comment' ORDER BY rowid").all()).toEqual([{ user_id: f.reporterId }, { user_id: 'maker' }])
  })

  it('stay quiet for maintainers once the reporter withdraws sharing', async () => {
    const f = await fixture()
    f.db.prepare("UPDATE issues SET maintainer_sharing=0 WHERE id='report'").run()
    expect((await f.as('/issues/report/replies', 'POST', { body: 'Note to self.' }, { member: f.session })).status).toBe(201)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()).toEqual({ count: 0 })
  })
})

describe('deleting an account', () => {
  it('succeeds when GitHub actions were recorded on the member’s report', async () => {
    const f = await fixture()
    f.db.prepare("INSERT INTO github_actions(id,issue_id,actor,body_hash) VALUES('command:1','report','67785539','hash'),('reply:other:1','report','other','hash')").run()
    expect((await f.as('/auth/account', 'DELETE', { confirm: 'DELETE', password }, { member: f.session })).status).toBe(200)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issues').get()).toEqual({ count: 0 })
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM github_actions').get()).toEqual({ count: 0 })
  })
})
