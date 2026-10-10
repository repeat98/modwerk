import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleApi } from '../../server/api'
import { signGithubPayload } from '../../server/github'
import { moduleStatistics } from '../../server/module-statistics'
import { digest } from '../../server/security'
import { handleCommunity } from '../../server/transport'
import { DEVICES_BY_ID } from '../devices/registry'
import { moduleChangelogs } from './module-changelogs'
import { communityModule } from './modules'
import { notificationLines } from './notification-text'
import { testServer } from './test-server'

const databases: DatabaseSync[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
const otLog = readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log', import.meta.url), 'utf8')
const version = (id: string) => communityModule(id)?.version ?? '1.0.0'
const context = (ids: string[]) => ({ model: 'mk2', flash: 'flashed', os: '1.40C', modules: ids.map(id => ({ id, version: version(id) })), keepStockFx2: true, build: 'c'.repeat(64) })
const report = (ids = ['sidechain-compressor', 'miniverb'], extra: Record<string, unknown> = {}) => ({ title: 'Freeze with both loaded', actual: 'The Octatrack freezes when both effects run.', visibility: 'forum', context: context(ids), ...extra })
const ZAC = { id: 273702472, login: 'Zac-Kyoti', type: 'User' }, REPEAT = { id: 67785539, login: 'repeat98', type: 'User' }, TIM = { id: 57099780, login: 'timhastie', type: 'User' }

async function fixture({ github = true }: { github?: boolean } = {}) {
  const f = await testServer(); databases.push(f.db)
  if (github) Object.assign(f.env, { GITHUB_TOKEN: 'private-test-token', GITHUB_REPOSITORY: 'repeat98/modwerk', GITHUB_WEBHOOK_SECRET: 'test-webhook-secret' })
  const session = 'a'.repeat(64)
  f.db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES('reporter','Reporter','reporter',1)").run()
  f.db.prepare("INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES('reporter','Reporter','reporter@example.test',1,0,0)").run()
  f.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(session), 'reporter', Math.floor(Date.now() / 1000) + 3600)
  const requests: { url: string; method: string; body: Record<string, unknown> | undefined }[] = [], comments: { id: number; body: string }[] = []
  let live = true
  vi.stubGlobal('fetch', vi.fn(async (value: string | URL, init: RequestInit = {}) => {
    const url = String(value), method = init.method ?? 'GET', body = init.body ? JSON.parse(String(init.body)) : undefined
    if (url === f.env.APP_URL + 'module-releases.json') return Response.json({ format: 'modwerk-module-releases-v1', modules: ['miniverb', 'repitch', 'sidechain-compressor'].map(id => { const module = communityModule(id)!; return { id, name: module.name, version: live ? module.version : '0.0.0', href: module.href, ...(live ? { notes: moduleChangelogs[id].find(entry => entry.version === module.version) } : {}) } }) })
    requests.push({ url, method, body })
    if (method === 'GET') return Response.json(comments)
    if (method === 'POST' && url.endsWith('/issues')) return Response.json({ number: 321, html_url: 'https://github.com/repeat98/modwerk/issues/321' }, { status: 201 })
    if (method === 'POST') comments.push({ id: comments.length + 1, body: String(body?.body) })
    return Response.json({ id: comments.length, state: body?.state })
  }))
  async function request(path: string, method = 'GET', body?: unknown, token = '', developer = '') {
    const headers = new Headers({ Origin: 'https://octamod.test', 'CF-Connecting-IP': '192.0.2.1' })
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', 'Bearer ' + token)
    if (developer) headers.set('X-Modwerk-Developer', developer)
    return handleCommunity(new Request('https://api.example.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), f.env)
  }
  const post = (data: unknown = report(), token = session) => request('/configuration-reports', 'POST', data, token)
  async function hook(identity: typeof ZAC, text: string, commentId = 1, number = 321) {
    const data = { action: 'created', repository: { full_name: 'repeat98/modwerk' }, issue: { number }, comment: { id: commentId, body: text, user: identity }, sender: identity }
    const raw = new TextEncoder().encode(JSON.stringify(data)).buffer
    const result = await handleApi(new Request('https://api.example.test/api/github/webhook', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'issue_comment', 'X-GitHub-Delivery': crypto.randomUUID(), 'X-Hub-Signature-256': await signGithubPayload('test-webhook-secret', raw) } }), f.env)
    return result.json() as Promise<Record<string, unknown>>
  }
  const row = () => f.db.prepare('SELECT * FROM issues').get()!
  // A developer's GitHub sign-in, as the creator-support tests create one.
  Object.assign(f.env, { GITHUB_OAUTH_CLIENT_ID: 'config-test', GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-client-secret', GITHUB_OAUTH_CALLBACK_URL: 'https://api.example.test/api/developer/auth/callback' })
  async function developer(id: string, login: string, githubId: number) {
    f.db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(id, login, String(githubId), login)
    const token = await digest('developer-token:' + id)
    f.db.prepare('INSERT INTO developer_sessions(token_hash,user_id,client_hash,expires) VALUES(?,?,?,?)').run(await digest(token), id, await digest('config-test:synthetic-client-secret'), Math.floor(Date.now() / 1000) + 600)
    return token
  }
  return { ...f, session, request, post, hook, row, requests, comments, developer, offline: () => { live = false } }
}
describe('a report about a whole configuration', () => {
  it('opens one public GitHub issue that names every module and mentions each author once', async () => {
    const f = await fixture()
    const response = await f.post(report(['sidechain-compressor', 'miniverb', 'repitch']))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ github: 'synced', githubUrl: 'https://github.com/repeat98/modwerk/issues/321', modules: 3, owners: ['Zac-Kyoti', 'repeat98'] })
    const [created] = f.requests.filter(item => item.method === 'POST')
    expect(created.body!.title).toBe('[configuration] Freeze with both loaded')
    expect(created.body!.labels).toEqual(['issue-report', 'configuration', 'module:sidechain-compressor', 'module:miniverb', 'module:repitch'])
    const markdown = String(created.body!.body)
    expect(markdown).toContain('for the **whole configuration** by [reporter]')
    expect(markdown).toContain('· @Zac-Kyoti @repeat98')
    expect(markdown.match(/@repeat98/g)).toHaveLength(1)
    expect(markdown).toContain('| Configuration | 3 modules |')
    for (const id of ['sidechain-compressor', 'miniverb', 'repitch']) expect(markdown).toContain('- `' + id + '` ' + version(id))
    expect(markdown).toContain('`/modwerk resolve <module-id> <version> verified-download`')
    // The build fingerprint, the FX2 choice and the token stay out of the public issue.
    for (const secret of ['c'.repeat(64), 'private-test-token', 'stock FX2']) expect(markdown).not.toContain(secret)
    expect(f.row()).toMatchObject({ scope: 'configuration', module_id: 'sidechain-compressor', github_state: 'synced', github_number: 321, maintainer_sharing: 1, public_sharing: 0 })
    expect(f.db.prepare('SELECT module_id,version FROM issue_modules ORDER BY rowid').all()).toEqual(['sidechain-compressor', 'miniverb', 'repitch'].map(id => ({ module_id: id, version: version(id) })))
    expect(JSON.parse(String(f.row().public_json)).modules.map((item: { id: string }) => item.id)).toEqual(['sidechain-compressor', 'miniverb', 'repitch'])
  })

  it('lists the report on each module it contains and on no other', async () => {
    const f = await fixture()
    await f.post()
    for (const id of ['sidechain-compressor', 'miniverb']) {
      const listed = await (await f.request('/modules/' + id + '/issues')).json()
      expect(listed).toMatchObject({ openCount: 1, closedCount: 0, issues: [{ title: 'Freeze with both loaded', scope: 'configuration', number: 321, reporter: 'reporter', details: { version: '2 modules' } }] })
      expect(listed.issues[0].details.modules).toEqual([{ id: 'sidechain-compressor', name: communityModule('sidechain-compressor')!.name, version: version('sidechain-compressor') }, { id: 'miniverb', name: communityModule('miniverb')!.name, version: version('miniverb') }])
    }
    expect(await (await f.request('/modules/synth/issues')).json()).toMatchObject({ openCount: 0, issues: [] })
  })

  it('opens the public GitHub conversation from any module in the configuration, and from no other', async () => {
    const f = await fixture()
    await f.post()
    for (const id of ['sidechain-compressor', 'miniverb']) expect((await f.request('/modules/' + id + '/issues/' + f.row().id + '/replies')).status).toBe(200)
    expect((await f.request('/modules/synth/issues/' + f.row().id + '/replies')).status).toBe(404)
  })

  it('follows release updates for each module the reporter has not opted out of', async () => {
    const f = await fixture()
    f.db.prepare("INSERT INTO module_update_opt_outs(user_id,module_id) VALUES('reporter','miniverb')").run()
    await f.post()
    expect(f.db.prepare('SELECT module_id FROM module_update_subscriptions WHERE user_id=?').all('reporter')).toEqual([{ module_id: 'sidechain-compressor' }])
    const other = await fixture()
    await other.post(report(undefined, { notifyUpdates: false }))
    expect(other.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions').get()).toEqual({ count: 0 })
  })

  it('keeps a private report off GitHub and off the module pages', async () => {
    const f = await fixture()
    const response = await f.post(report(undefined, { visibility: undefined }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ github: 'none', githubUrl: null, forumThreadId: null })
    expect(f.requests.filter(item => item.method === 'POST')).toEqual([])
    expect(f.row()).toMatchObject({ scope: 'configuration', public_json: null, maintainer_sharing: 0 })
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issue_modules').get()).toEqual({ count: 2 })
    expect(await (await f.request('/modules/miniverb/issues')).json()).toMatchObject({ openCount: 0, issues: [] })
    expect(await (await f.request('/issues/mine', 'GET', undefined, f.session)).json()).toMatchObject([{ scope: 'configuration', module_count: 2, module_id: 'sidechain-compressor' }])
  })

  it('takes the modules from an attached log, not from what the browser listed', async () => {
    const f = await fixture()
    expect((await f.post(report(['sidechain-compressor'], { log: otLog }))).status).toBe(201)
    expect(f.db.prepare('SELECT module_id FROM issue_modules ORDER BY rowid').all()).toEqual([{ module_id: 'repitch' }, { module_id: 'miniverb' }])
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issue_logs').get()).toEqual({ count: 1 })
    expect(JSON.parse(String(f.row().context_json)).modules.map((item: { id: string }) => item.id)).toEqual(['repitch', 'miniverb'])
  })

  it('reports a Digitakt configuration against the modules of that machine', async () => {
    const f = await fixture(), device = DEVICES_BY_ID.digitakt
    const ids = ['digitakt-digihealth', 'digitakt-digieq'], natives = ids.map(id => communityModule(id)!)
    const body = { title: 'Slow startup', actual: 'Takes a minute to boot.', visibility: 'forum', context: { machine: 'digitakt', model: device.variants?.[0] ?? device.name, flash: 'flashed', os: device.firmware!.releases[0], moduleVersion: natives[0].version, modules: natives.map(item => ({ id: item.moduleId, version: item.version })), keepStockFx2: null, build: '' } }
    expect((await f.post(body)).status).toBe(201)
    expect(f.db.prepare('SELECT module_id FROM issue_modules ORDER BY rowid').all()).toEqual(ids.map(id => ({ module_id: id })))
    expect(f.requests.find(item => item.method === 'POST')!.body!.labels).toEqual(['issue-report', 'configuration', ...ids.map(id => 'module:' + id)])
    expect((await f.post({ ...body, log: otLog })).status).toBe(400)
  })

  it.each([
    ['no module at all', () => report([]), 400],
    ['only modules the catalogue does not list', () => report(['not-in-catalog']), 400],
    ['an unknown machine', () => ({ ...report(), context: { ...context(['miniverb']), machine: 'syntakt' } }), 400],
    ['a field a module report has', () => ({ ...report(), moduleId: 'miniverb' }), 400],
    ['a missing description', () => ({ ...report(), actual: '' }), 400],
    ['a bad update choice', () => report(undefined, { notifyUpdates: 'yes' }), 400],
    ['a bad visibility', () => report(undefined, { visibility: 'everyone' }), 400],
  ])('refuses %s', async (_name, body, status) => {
    const f = await fixture()
    expect((await f.post(body())).status).toBe(status)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issues').get()).toEqual({ count: 0 })
  })

  it('needs a verified member and honours the same report limits as a module report', async () => {
    const f = await fixture()
    expect((await f.post(report(), '')).status).toBe(401)
    f.db.exec("UPDATE users SET email_verified=0 WHERE id='reporter'")
    expect((await f.post()).status).toBe(403)
    f.db.exec("UPDATE users SET email_verified=1 WHERE id='reporter'")
    for (let sent = 0; sent < 10; sent++) expect((await f.post(report(undefined, { visibility: undefined }))).status).toBe(201)
    expect((await f.post()).status).toBe(429)
  })

  it('does not count against a module’s own issue totals or stability grade', async () => {
    const f = await fixture()
    await f.post()
    const statistics = await moduleStatistics(f.env.DB!)
    for (const id of ['sidechain-compressor', 'miniverb']) expect(statistics.find(item => item.module_id === id)).toMatchObject({ openIssues: 0, lastIssueAt: null })
  })

  it('goes into the forum thread and one developer notification when GitHub is not configured', async () => {
    const f = await fixture({ github: false })
    f.db.prepare("INSERT INTO users(id,display_name,github_id,github_login) VALUES('maker','Maker','67785539','repeat98')").run()
    for (const id of ['miniverb', 'repitch']) f.db.prepare("INSERT INTO module_maintainers(module_id,user_id,github_login,revoked) VALUES(?,'maker','repeat98',0)").run(id)
    const response = await f.post(report(['miniverb', 'repitch']))
    expect(response.status).toBe(201)
    const { forumThreadId } = await response.json()
    expect(forumThreadId).toEqual(expect.any(String))
    expect(f.db.prepare("SELECT category,module_id FROM forum_threads WHERE id=?").get(forumThreadId)).toEqual({ category: 'issues', module_id: 'miniverb' })
    expect(f.db.prepare('SELECT body FROM forum_posts WHERE thread_id=?').get(forumThreadId)!.body).toMatch(/^Configuration \(2 modules\): .+\n\nActual:/)
    expect(f.db.prepare("SELECT user_id FROM notifications WHERE kind='bug_report'").all()).toEqual([{ user_id: 'maker' }])
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM forum_follows WHERE thread_id=? AND user_id=?').get(forumThreadId, 'maker')).toEqual({ count: 1 })
  })

  it('is removed with the report', async () => {
    const f = await fixture()
    await f.post()
    f.db.exec('DELETE FROM issues')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issue_modules').get()).toEqual({ count: 0 })
  })
})

describe('maintainers of every module in the configuration', () => {
  it('see the private report, its configuration and its reply thread; other developers do not', async () => {
    const f = await fixture()
    await f.post()
    const id = String(f.row().id)
    const zac = await f.developer('zac', 'Zac-Kyoti', ZAC.id), repeat = await f.developer('repeat', 'repeat98', REPEAT.id), tim = await f.developer('tim', 'timhastie', TIM.id)
    for (const [token, module] of [[zac, 'sidechain-compressor'], [repeat, 'miniverb'], [tim, 'synth']]) expect((await f.request('/developer/modules/' + module + '/claim', 'POST', {}, '', token)).status).toBe(201)
    for (const token of [zac, repeat]) {
      const detail = await (await f.request('/issues/' + id, 'GET', undefined, '', token)).json()
      expect(detail).toMatchObject({ scope: 'configuration', reportedModules: ['sidechain-compressor', 'miniverb'], canManage: true, context: { build: 'c'.repeat(64) } })
      expect(await (await f.request('/developer/issues', 'GET', undefined, '', token)).json()).toMatchObject([{ id, scope: 'configuration' }])
    }
    expect((await f.request('/issues/' + id, 'GET', undefined, '', tim)).status).toBe(404)
    expect(await (await f.request('/developer/issues', 'GET', undefined, '', tim)).json()).toEqual([])
    const modules = await (await f.request('/developer/modules', 'GET', undefined, '', repeat)).json()
    expect(modules.find((item: { id: string }) => item.id === 'miniverb').reports).toMatchObject({ total: 1, open: 1 })
  })

  it('can close the report from Modwerk, with the reporter told once', async () => {
    const f = await fixture()
    await f.post()
    const id = String(f.row().id), zac = await f.developer('zac', 'Zac-Kyoti', ZAC.id)
    await f.request('/developer/modules/sidechain-compressor/claim', 'POST', {}, '', zac)
    const closed = await f.request('/issues/' + id, 'PATCH', { status: 'closed', closureReason: 'configuration', note: 'Use a smaller FX2 setup.' }, '', zac)
    expect(closed.status).toBe(200)
    expect(f.row().status).toBe('closed')
    expect(f.db.prepare('SELECT kind,issue_id FROM notifications').all()).toEqual([{ kind: 'issue_closed', issue_id: id }])
  })
})

describe('GitHub commands on a configuration report', () => {
  it('let a maintainer of any module close and reopen it, and no one else', async () => {
    const f = await fixture()
    await f.post(report(['sidechain-compressor', 'miniverb']))
    expect(await f.hook(TIM, '/modwerk close duplicate Already reported.')).toMatchObject({ command: 'denied' })
    expect(await f.hook(ZAC, '/modwerk close configuration Remove the second effect.', 1)).toMatchObject({ command: 'completed' })
    expect(f.row().status).toBe('closed')
    expect(await f.hook(REPEAT, '/modwerk reopen Still failing on my unit.', 2)).toMatchObject({ command: 'completed' })
    expect(f.row().status).toBe('open')
    expect(f.db.prepare('SELECT kind,github_actor FROM notifications ORDER BY rowid').all()).toEqual([{ kind: 'issue_closed', github_actor: 'Zac-Kyoti' }, { kind: 'issue_reopened', github_actor: 'repeat98' }])
  })

  it('release a fix only for a module the sender maintains, named in the command', async () => {
    const f = await fixture()
    await f.post(report(['sidechain-compressor', 'miniverb']))
    f.db.exec("UPDATE module_update_subscriptions SET after_version='0.0.0' WHERE module_id='miniverb'")
    const miniverb = '/modwerk resolve miniverb ' + version('miniverb') + ' verified-download'
    // The version alone is ambiguous with several modules, and a maintainer cannot release another author's module.
    expect(await f.hook(ZAC, '/modwerk resolve ' + version('miniverb') + ' verified-download', 1)).toMatchObject({ command: 'rejected' })
    expect(await f.hook(ZAC, miniverb, 2)).toMatchObject({ command: 'rejected' })
    expect(f.row().status).toBe('open')
    expect(await f.hook(REPEAT, '/modwerk resolve miniverb 9.9.9 verified-download', 3)).toMatchObject({ command: 'rejected' })
    expect(f.row().status).toBe('open')
    expect(await f.hook(REPEAT, miniverb, 4)).toMatchObject({ command: 'completed' })
    expect(f.row().status).toBe('closed')
    expect(f.db.prepare('SELECT kind FROM notifications ORDER BY kind').all()).toEqual([{ kind: 'issue_resolved' }, { kind: 'module_update' }])
    expect(f.comments.some(comment => comment.body.includes('Released **miniverb ' + version('miniverb') + '**'))).toBe(true)
  })

  it('keep the live-release gate: a version that is not published yet resolves nothing', async () => {
    const f = await fixture()
    await f.post(report(['sidechain-compressor', 'miniverb']))
    f.offline()
    await f.hook(REPEAT, '/modwerk resolve miniverb ' + version('miniverb') + ' verified-download')
    expect(f.row().status).toBe('open')
  })

  it('drop a revoked maintainer for that module only', async () => {
    const f = await fixture()
    await f.post(report(['miniverb', 'repitch']))
    f.db.exec("INSERT INTO users(id,display_name,github_id,github_login) VALUES('maker','Maker','67785539','repeat98'); INSERT INTO module_maintainers(module_id,user_id,github_login,revoked) VALUES('miniverb','maker','repeat98',1)")
    // repitch is still theirs, so they can act on the report, but not release miniverb.
    expect(await f.hook(REPEAT, '/modwerk resolve miniverb ' + version('miniverb') + ' verified-download', 1)).toMatchObject({ command: 'rejected' })
    expect(await f.hook(REPEAT, '/modwerk close duplicate Already reported.', 2)).toMatchObject({ command: 'completed' })
    f.db.exec("UPDATE issues SET status='open'; INSERT INTO module_maintainers(module_id,user_id,github_login,revoked) VALUES('repitch','maker','repeat98',1)")
    expect(await f.hook(REPEAT, '/modwerk reopen Not a duplicate.', 3)).toMatchObject({ command: 'denied' })
  })
})

describe('how a configuration report reads to its reporter', () => {
  it('says configuration report in the bell and email', () => {
    const item = { id: 'n', kind: 'issue_resolved' as const, seen: false, created_at: '2026-10-10 10:00:00', thread_id: null, post_id: null, module_id: 'miniverb', actor: null, actorOfficial: false, title: 'Freeze', excerpt: null, rating: null, issue_id: 'r', github_actor: 'repeat98', url: null }
    expect(notificationLines([{ ...item, issue_scope: 'configuration' }])[0]).toMatchObject({ text: '@repeat98 on GitHub marked your configuration report “Freeze” as fixed' })
    expect(notificationLines([{ ...item, issue_scope: 'module' }])[0]).toMatchObject({ text: expect.stringContaining('your bug report') })
  })
})
