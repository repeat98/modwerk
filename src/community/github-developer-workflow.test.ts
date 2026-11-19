import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { handleApi } from '../../server/api'
import { signGithubPayload } from '../../server/github'
import { sendActivityDigests } from '../../server/activity-mail'
import { notificationLines } from './notification-text'
import type { NotificationItem } from './notification-contract'
import { digest } from '../../server/security'
import { testServer } from './test-server'
import { communityModule } from './modules'
import { moduleChangelogs } from './module-changelogs'
import { GithubReplyForm } from './GithubIssueReplies'
import { CommunityContext, emptySession } from './context'
import { DeveloperPage } from './DeveloperPage'
import { BugReportSuccess, ExistingIssues } from './BugReportNotice'
import registeredAuthors from '../../.github/module-authors.json'

const databases: DatabaseSync[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture(moduleId = 'sidechain-compressor') {
  const f = await testServer(); databases.push(f.db)
  Object.assign(f.env, { GITHUB_TOKEN: 'private-test-token', GITHUB_REPOSITORY: 'repeat98/modwerk', GITHUB_WEBHOOK_SECRET: 'test-webhook-secret' })
  const module = communityModule(moduleId)!, session = 'a'.repeat(64)
  f.db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES('listener','Listener','listener',1)").run()
  f.db.prepare("INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES('listener','Listener','listener@example.test',1,0,0)").run()
  f.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(session), 'listener', Math.floor(Date.now() / 1000) + 3600)
  f.db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,public_json,github_number,github_url,maintainer_sharing) VALUES('report',?,?,'listener','Public title','PRIVATE CONFIGURATION','{}',321,'https://github.com/repeat98/modwerk/issues/321',1)").run(module.id, module.author)
  const comments: { id: number; body: string }[] = [], writes: { method: string; body: Record<string, unknown> }[] = []
  let live = true, failPatch = false, dropPost = false
  vi.stubGlobal('fetch', vi.fn(async (value: string | URL, init: RequestInit = {}) => {
    const url = String(value), method = init.method ?? 'GET', body = init.body ? JSON.parse(String(init.body)) : undefined
    if (url === f.env.APP_URL + 'module-releases.json') return Response.json({ format: 'modwerk-module-releases-v1', modules: [{ id: module.id, name: module.name, version: live ? module.version : '0.0.0', href: module.href, ...(live ? { notes: { ...moduleChangelogs[module.id].find(entry => entry.version === module.version) } } : {}) }] })
    if (method === 'GET') return Response.json(comments)
    writes.push({ method, body })
    if (method === 'POST') {
      comments.push({ id: comments.length + 1, body: body.body })
      if (dropPost) { dropPost = false; throw new Error('Response lost after GitHub saved the reply') }
    }
    if (method === 'PATCH' && failPatch) return new Response('{}', { status: 503 })
    return Response.json({ id: comments.length, state: body?.state })
  }))
  const identity = moduleId === 'sidechain-compressor' ? { id: 273702472, login: 'Zac-Kyoti', type: 'User' } : { id: 67785539, login: 'repeat98', type: 'User' }
  function payload(body: string, commentId = 1) { return { action: 'created', repository: { full_name: 'repeat98/modwerk' }, issue: { number: 321 }, comment: { id: commentId, body, user: identity }, sender: identity } }
  async function hook(data: unknown, delivery = crypto.randomUUID(), signature?: string) {
    const body = new TextEncoder().encode(JSON.stringify(data)).buffer
    return handleApi(new Request('https://api.example.test/api/github/webhook', { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'issue_comment', 'X-GitHub-Delivery': delivery, 'X-Hub-Signature-256': signature ?? await signGithubPayload('test-webhook-secret', body) } }), f.env)
  }
  const reply = { body: 'Thanks! **It works**. @repeat98 #12 <script>no</script>', requestId: '11111111-1111-4111-8111-111111111111' }
  const send = (body = reply, path = '/modules/' + module.id + '/issues/report/replies', token = session) => f.call(path, 'POST', body, token)
  return { ...f, module, session, reply, send, payload, hook, comments, writes, offline: () => { live = false }, failPatch: (value: boolean) => { failPatch = value }, dropPost: () => { dropPost = true } }
}

async function participant(f: Awaited<ReturnType<typeof fixture>>, id = 'participant') {
  const token = await digest('session:' + id)
  f.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run(id, id, id)
  f.db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run(id, id, id + '@example.test')
  f.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(token), id, Math.floor(Date.now() / 1000) + 3600)
  return token
}

describe('frontend public replies into GitHub', () => {
  it('posts an attributed public reply for a verified Modwerk member without a GitHub account, and retries only once', async () => {
    const f = await fixture()
    expect((await f.send()).status).toBe(201)
    expect((await f.send()).status).toBe(201)
    expect(f.comments).toHaveLength(1)
    expect(f.comments[0].body).toContain('[listener on Modwerk](https://octamod.test/forum/profile/listener/)')
    expect(f.comments[0].body).toContain('> Thanks! **It works**.')
    expect(f.comments[0].body).not.toMatch(/PRIVATE CONFIGURATION|private-test-token|<script>|@repeat98|#12/)
    expect(f.db.prepare('SELECT completed FROM github_actions').get()!.completed).toBe(1)
    await f.hook(f.payload(f.comments[0].body, 99))
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
    expect((await f.send({ ...f.reply, body: 'Different text' })).status).toBe(409)
    expect(f.comments).toHaveLength(1)
  })
  it('recovers a reply saved on GitHub when its response was lost, using the same draft identifier', async () => {
    const f = await fixture(); f.dropPost()
    expect((await f.send()).status).toBe(502)
    expect((await f.send()).status).toBe(201)
    expect(f.comments).toHaveLength(1)
  })
  it('notifies the reporter once with the frontend member identity when another member replies, including bot relay redelivery', async () => {
    const f = await fixture()
    f.db.exec("INSERT INTO users(id,display_name,username,email_verified) VALUES('reporter','Reporter','reporter',1); UPDATE issues SET reporter_id='reporter'")
    await f.send(); await f.send()
    const p = f.payload(f.comments[0].body, 99)
    await f.hook(p)
    await f.hook({ ...p, comment: { ...p.comment, user: { ...p.comment.user, type: 'Bot' } } })
    expect(f.db.prepare('SELECT user_id,actor_id,kind,excerpt FROM notifications').all()).toEqual([{ user_id: 'reporter', actor_id: 'listener', kind: 'issue_comment', excerpt: f.reply.body }])
  })
  it('notifies the reporter of the maintenance bot\'s replies as TARS, once, and still ignores other bots', async () => {
    const f = await fixture(), delivery = crypto.randomUUID()
    const bot = (login: string, body: string) => ({ ...f.payload(body, 77), comment: { id: 77, body, user: { id: 41898282, login, type: 'Bot' } } })
    const marked = 'Which OS version is on the unit?\n\n<!-- modwerk-maintenance-bot -->'
    expect(await (await f.hook(bot('github-actions[bot]', 'CI passed'))).json()).toMatchObject({ handled: false })
    expect(await (await f.hook(bot('someone-else[bot]', marked))).json()).toMatchObject({ handled: false })
    expect(await (await f.hook(bot('github-actions[bot]', marked), delivery)).json()).toMatchObject({ handled: true })
    await f.hook(bot('github-actions[bot]', marked), delivery)
    expect(f.db.prepare('SELECT user_id,actor_id,kind,excerpt FROM notifications').all()).toEqual([{ user_id: 'listener', actor_id: 'tars', kind: 'issue_comment', excerpt: 'Which OS version is on the unit?' }])
  })
  it('notifies authenticated report participants of GitHub replies once and opens the public conversation', async () => {
    const f = await fixture(), token = await participant(f)
    const reply = { body: 'I have the same freeze.', requestId: crypto.randomUUID() }
    expect((await f.call('/modules/' + f.module.id + '/issues/report/replies', 'POST', reply, token)).status).toBe(201)
    expect((await f.call('/modules/' + f.module.id + '/issues/report/replies', 'POST', { ...reply, requestId: crypto.randomUUID() }, token)).status).toBe(201)
    f.db.exec('DELETE FROM notifications')
    const message = f.payload('Please try a fresh build and report the track and page.', 123), delivery = crypto.randomUUID()
    await f.hook(message, delivery); await f.hook(message, delivery)
    expect(f.db.prepare('SELECT user_id,github_actor FROM notifications ORDER BY user_id').all()).toEqual([{ user_id: 'listener', github_actor: 'Zac-Kyoti' }, { user_id: 'participant', github_actor: 'Zac-Kyoti' }])
    const items = (await (await f.call('/notifications', 'GET', undefined, token)).json()).items as NotificationItem[]
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ issueReporter: false, issuePublic: true, excerpt: message.comment.body })
    expect(notificationLines(items)[0]).toMatchObject({ text: '@Zac-Kyoti on GitHub replied to the bug report “Public title”', href: f.module.href + '?tab=issues' })
    expect(JSON.stringify(items)).not.toContain('PRIVATE CONFIGURATION')
  })

  it('notifies prior participants when the reporter replies in Modwerk, without notifying the sender or replaying the relay', async () => {
    const f = await fixture(), token = await participant(f)
    expect((await f.call('/modules/' + f.module.id + '/issues/report/replies', 'POST', { body: 'Same here.', requestId: crypto.randomUUID() }, token)).status).toBe(201)
    f.db.exec('DELETE FROM notifications')
    await f.send(); await f.send()
    await f.hook(f.payload(f.comments.at(-1)!.body, 99))
    expect(f.db.prepare('SELECT user_id,actor_id,kind FROM notifications').all()).toEqual([{ user_id: 'participant', actor_id: 'listener', kind: 'issue_comment' }])
  })

  it('uses only completed replies on this report, excludes suspended and unverified members, and proves GitHub self identity', async () => {
    const f = await fixture()
    for (const id of ['joined','failed','command','elsewhere','suspended','unverified','named','self']) await participant(f, id)
    f.db.exec("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body) VALUES('other','sidechain-compressor','Zac-Kyoti','listener','Other','PRIVATE')")
    const receipt = f.db.prepare('INSERT INTO github_actions(id,issue_id,actor,body_hash,completed) VALUES(?,?,?,?,?)')
    for (const id of ['joined','failed','command','elsewhere','suspended','unverified','self']) receipt.run((id === 'command' ? 'command:' : 'reply:') + id, id === 'elsewhere' ? 'other' : 'report', id, 'hash', id === 'failed' ? 0 : 1)
    f.db.exec("UPDATE users SET suspended=1 WHERE id='suspended'; UPDATE users SET email_verified=0 WHERE id='unverified'")
    f.db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('self-github','273702472','github','self',0,0)").run()
    await f.hook(f.payload('Thanks @named and @self. Please test the new build.', 321))
    expect(f.db.prepare('SELECT user_id FROM notifications ORDER BY user_id').all()).toEqual([{ user_id: 'joined' }, { user_id: 'listener' }])
    f.db.exec('DELETE FROM notifications; UPDATE issues SET public_json=NULL')
    await f.hook(f.payload('This should never notify public participants of a private report.', 322))
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
  })

  it('includes participant replies in ordinary bug digests and preserves email opt-outs', async () => {
    const f = await fixture(); await participant(f); await participant(f, 'muted')
    for (const id of ['participant','muted']) f.db.prepare("INSERT INTO github_actions(id,issue_id,actor,body_hash,completed) VALUES(?,'report',?,'hash',1)").run('reply:' + id, id)
    f.db.exec("INSERT INTO notification_preferences(user_id,email_enabled) VALUES('muted',0)")
    await f.hook(f.payload('Please test a fresh download.', 123))
    f.db.exec("UPDATE notifications SET created_at='2026-10-13 10:00:00'")
    const mails: { to: string[]; text: string }[] = [], provider = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) !== 'https://api.resend.com/emails') return provider(url, init)
      mails.push(JSON.parse(String(init?.body))); return Response.json({ id: 'accepted' })
    }))
    expect(await sendActivityDigests(f.env, f.env.DB!, new Date('2026-10-13T11:00:00Z'))).toEqual({ sent: 2 })
    expect(mails.map(mail => mail.to[0]).sort()).toEqual(['listener@example.test','participant@example.test'])
    expect(mails.find(mail => mail.to[0] === 'participant@example.test')!.text).toContain('replied to the bug report')
    expect(mails.find(mail => mail.to[0] === 'participant@example.test')!.text).toContain('?tab=issues')
    expect(f.db.prepare("SELECT seen,emailed FROM notifications WHERE user_id='muted'").get()).toEqual({ seen: 0, emailed: 0 })
    expect(JSON.stringify(mails)).not.toContain('PRIVATE CONFIGURATION')
  })

  it('blocks anonymous, unverified and suspended users and private or other-module reports before writing', async () => {
    const f = await fixture()
    expect((await f.send(f.reply, undefined, '')).status).toBe(401)
    f.db.exec("UPDATE users SET email_verified=0 WHERE id='listener'")
    expect((await f.send()).status).toBe(403)
    f.db.exec("UPDATE users SET email_verified=1,suspended=1 WHERE id='listener'")
    expect((await f.send()).status).toBe(401)
    f.db.exec("UPDATE users SET suspended=0 WHERE id='listener'")
    expect((await f.send(f.reply, '/modules/miniverb/issues/report/replies')).status).toBe(404)
    f.db.exec("UPDATE issues SET public_json=NULL")
    expect((await f.send()).status).toBe(404)
    expect(f.writes).toEqual([])
  })
  it('serializes simultaneous retries instead of opening two comments', async () => {
    const f = await fixture()
    let release!: () => void, entered!: () => void
    const held = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const provider = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => { if (init.method === 'GET') { entered(); await held } return provider(url, init) }))
    const first = f.send(); await started
    expect((await f.send()).status).toBe(409)
    release(); expect((await first).status).toBe(201)
    expect(f.comments).toHaveLength(1)
  })
  it('caps frontend public writes and rejects malformed request identities', async () => {
    const f = await fixture()
    expect((await f.send({ ...f.reply, requestId: 'bad' })).status).toBe(400)
    for (let index = 0; index < 20; index++) expect((await f.send({ ...f.reply, requestId: crypto.randomUUID() })).status).toBe(201)
    expect((await f.send({ ...f.reply, requestId: crypto.randomUUID() })).status).toBe(429)
    expect(f.comments).toHaveLength(20)
  })
})

describe('scoped GitHub maintainer commands', () => {
  it('triages through one public command receipt, preserves confirmation while waiting, and retries quietly', async () => {
    const f = await fixture()
    const waiting = f.payload('/modwerk needs-info Which FX slot and steps reproduce this?')
    expect(await (await f.hook(waiting)).json()).toMatchObject({command:'completed'})
    expect(f.db.prepare('SELECT status,triage_state,confirmed_at FROM issues').get()).toEqual({status:'open',triage_state:'needs_info',confirmed_at:null})
    expect(f.comments).toHaveLength(1)
    expect(f.comments[0].body).toContain('Waiting for reporter')
    await f.hook(waiting)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issue_triage_events').get()!.count).toBe(1)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(1)
    // The service account is a User with a personal token; a signed echo of its verified receipt stays quiet.
    await f.hook(f.payload(f.comments[0].body,99))
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(1)
    await f.hook(f.payload('/modwerk confirm '+f.module.version+' Reproduced on track 8 with stock delay.',2))
    await f.hook(f.payload('/modwerk needs-info Can you test a second track?',3))
    expect(f.db.prepare('SELECT status,triage_state,affected_version,confirmed_at FROM issues').get()).toMatchObject({status:'open',triage_state:'needs_info',affected_version:f.module.version,confirmed_at:expect.any(String)})
    expect((await (await f.call('/modules/'+f.module.id+'/issues')).json()).issues[0]).toMatchObject({triage_state:'needs_info',affected_version:f.module.version})
    expect(f.comments.map(comment => comment.body).join('\n')).not.toContain('PRIVATE CONFIGURATION')
  })

  it('classifies suggestions separately and closes missing-information reports without claiming a fix', async () => {
    const f = await fixture()
    await f.hook(f.payload('/modwerk classify feature This asks for an additional control.'))
    expect(f.db.prepare('SELECT report_kind,confirmed_at FROM issues').get()).toEqual({report_kind:'feature',confirmed_at:null})
    expect(await (await f.hook(f.payload('/modwerk confirm unknown I think so.',2))).json()).toMatchObject({command:'rejected'})
    await f.hook(f.payload('/modwerk close insufficient_information Please reply with reproduction steps to reopen.',3))
    expect(f.db.prepare('SELECT status,closure_reason,closure_note FROM issues').get()).toEqual({status:'closed',closure_reason:'insufficient_information',closure_note:'Please reply with reproduction steps to reopen.'})
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE kind='issue_resolved'").get()!.count).toBe(0)
  })

  it('lets a verified current maintainer triage without release-author registration, while keeping release authority separate',async()=>{
    const f=await fixture(),accounts=registeredAuthors.accounts as Record<string,number>,id=accounts['zac-kyoti']
    f.db.exec("INSERT INTO users(id,display_name,github_id,github_login) VALUES('maker','Maker','273702472','Zac-Kyoti'); INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES('sidechain-compressor','maker','Zac-Kyoti')")
    delete accounts['zac-kyoti']
    try {
      expect(await (await f.hook(f.payload('/modwerk needs-info Which track?'))).json()).toMatchObject({command:'completed'})
      expect(await (await f.hook(f.payload('/modwerk resolve '+f.module.version+' verified-download',2))).json()).toMatchObject({command:'rejected'})
      expect(await (await f.hook(f.payload('/modwerk close insufficient_information Please reply with details.',3))).json()).toMatchObject({command:'completed'})
      f.db.exec("UPDATE module_maintainers SET revoked=1")
      expect(await (await f.hook(f.payload('/modwerk reopen More details arrived.',4))).json()).toMatchObject({command:'denied'})
    } finally {accounts['zac-kyoti']=id}
  })

  it('does not let a site claim replace a registered author’s numeric identity',async()=>{
    const f=await fixture(),p=f.payload('/modwerk needs-info Which track?')
    f.db.exec("INSERT INTO users(id,display_name,github_id,github_login) VALUES('recycled','Someone else','1','Zac-Kyoti'); INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES('sidechain-compressor','recycled','Zac-Kyoti')")
    const identity={...p.sender,id:1}
    expect(await (await f.hook({...p,sender:identity,comment:{...p.comment,user:identity}})).json()).toMatchObject({command:'denied'})
    expect(f.writes).toEqual([])
  })

  it('requires evidence and confirmation before marking a candidate fix, and allows explicit unconfirmation', async () => {
    const f = await fixture()
    for (const [index,command] of ['/modwerk confirm unknown','/modwerk confirm nonsense Tested it.','/modwerk awaiting-verification PR ready.'].entries()) {
      expect(await (await f.hook(f.payload(command,index+1))).json()).toMatchObject({command:'rejected'})
    }
    await f.hook(f.payload('/modwerk confirm unknown Reproduced; affected versions not established.',4))
    await f.hook(f.payload('/modwerk awaiting-verification Candidate PR ready; hardware check pending.',5))
    expect(f.db.prepare('SELECT status,triage_state FROM issues').get()).toEqual({status:'open',triage_state:'awaiting_verification'})
    await f.hook(f.payload('/modwerk unconfirm Reproduction was stock behavior; reassessing.',6))
    expect(f.db.prepare('SELECT confirmed_at,affected_version FROM issues').get()).toEqual({confirmed_at:null,affected_version:null})
  })

  it('keeps triage unchanged when the GitHub acknowledgement fails and recovers a lost response once', async () => {
    const f = await fixture(),command=f.payload('/modwerk needs-info Please supply reproduction steps.')
    f.dropPost()
    expect((await f.hook(command)).status).toBe(502)
    expect(f.db.prepare('SELECT triage_state FROM issues').get()!.triage_state).toBe('untriaged')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM issue_triage_events').get()!.count).toBe(0)
    await f.hook(command)
    expect(f.comments.filter(comment=>comment.body.includes('Status:'))).toHaveLength(1)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(1)
  })

  it('allows Zac to close and reopen his module report without a site claim or repository write access', async () => {
    const f = await fixture()
    const close = f.payload('/modwerk close configuration Set the preceding track’s CUE volume to zero.')
    expect(await (await f.hook(close)).json()).toMatchObject({ command: 'completed' })
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('closed')
    expect(f.writes.find(write => write.method === 'PATCH')!.body).toEqual({ state: 'closed', state_reason: 'not_planned' })
    expect(f.db.prepare('SELECT kind,github_actor FROM notifications').all()).toEqual([{ kind: 'issue_closed', github_actor: 'Zac-Kyoti' }])
    expect(f.comments.map(comment => comment.body).join('\n')).not.toContain('PRIVATE CONFIGURATION')
    expect(await (await f.hook(f.payload('/modwerk reopen Please check the new reproduction steps.', 2))).json()).toMatchObject({ command: 'completed' })
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('open')
    const count = f.writes.length
    expect(await (await f.hook(close)).json()).toMatchObject({ command: 'already-completed' })
    expect(f.writes).toHaveLength(count)
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('open')
  })
  it('ignores forged signatures, PR comments, edits, bots and wrong repositories', async () => {
    const f = await fixture(), p = f.payload('/modwerk close duplicate Already reported.')
    expect((await f.hook(p, undefined, 'sha256=bad')).status).toBe(401)
    for (const data of [{ ...p, issue: { number: 321, pull_request: {} } }, { ...p, action: 'edited' }, { ...p, comment: { ...p.comment, user: { ...p.comment.user, type: 'Bot' } } }, { ...p, repository: { full_name: 'someone/else' } }]) expect(await (await f.hook(data)).json()).toMatchObject({ handled: false })
    expect(f.writes).toEqual([])
  })
  it('denies recycled handles, another author, mismatched senders, withdrawn sharing and suspended/revoked identities', async () => {
    const f = await fixture(), p = f.payload('/modwerk close duplicate Already reported.')
    for (const identity of [{ ...p.comment.user, id: 1 }, { id: 67785539, login: 'repeat98', type: 'User' }]) expect(await (await f.hook({ ...p, comment: { ...p.comment, user: identity }, sender: identity })).json()).toMatchObject({ command: 'denied' })
    expect(await (await f.hook({ ...p, sender: { ...p.sender, id: 1 } })).json()).toMatchObject({ command: 'ignored' })
    f.db.exec('UPDATE issues SET maintainer_sharing=0')
    expect(await (await f.hook(p)).json()).toMatchObject({ command: 'denied' })
    f.db.exec("UPDATE issues SET maintainer_sharing=1; INSERT INTO users(id,display_name,github_id,github_login,suspended) VALUES('maker','Maker','273702472','Zac-Kyoti',1)")
    expect(await (await f.hook(p)).json()).toMatchObject({ command: 'denied' })
    f.db.exec("UPDATE users SET suspended=0 WHERE id='maker'; INSERT INTO module_maintainers(module_id,user_id,github_login,revoked) VALUES('sidechain-compressor','maker','Zac-Kyoti',1)")
    expect(await (await f.hook(p)).json()).toMatchObject({ command: 'denied' })
    expect(f.writes).toEqual([])
  })
  it('keeps the local report open on GitHub failure and retries without duplicate explanations', async () => {
    const f = await fixture(), p = f.payload('/modwerk close not_reproducible Tested both FX slots.')
    f.failPatch(true)
    expect((await f.hook(p)).status).toBe(502)
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('open')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
    f.failPatch(false)
    expect((await f.hook(p)).status).toBe(200)
    expect(f.comments.filter(comment => comment.body.includes('No new firmware fix'))).toHaveLength(1)
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('closed')
  })
  it('requires an explanation or version-bound download confirmation and explains errors publicly', async () => {
    const f = await fixture()
    for (const [index, text] of ['/modwerk close configuration', '/modwerk reopen', '/modwerk resolve 9.0.0', '/modwerk resolve 9.0.0 verified-download'].entries()) expect((await f.hook(f.payload(text, index + 1))).status).toBe(200)
    expect(f.comments).toHaveLength(4)
    expect(f.comments.every(comment => comment.body.startsWith('Command could not complete:'))).toBe(true)
    expect(f.writes.some(write => write.method === 'PATCH')).toBe(false)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
  })
  it('uses the existing live release gate and preference-aware fanout after the author confirms the published download', async () => {
    const f = await fixture('miniverb')
    f.db.exec("INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES('listener','miniverb','0.0.0')")
    f.offline()
    await f.hook(f.payload('/modwerk resolve ' + f.module.version + ' verified-download'))
    expect(f.db.prepare('SELECT status FROM issues').get()!.status).toBe('open')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
    const live = await fixture('miniverb')
    live.db.exec("INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES('listener','miniverb','0.0.0')")
    const p = live.payload('/modwerk resolve ' + live.module.version + ' verified-download')
    expect(await (await live.hook(p)).json()).toMatchObject({ command: 'completed' })
    await live.hook(p)
    expect(live.db.prepare('SELECT status FROM issues').get()!.status).toBe('closed')
    expect(live.db.prepare('SELECT kind FROM notifications ORDER BY kind').all()).toEqual([{ kind: 'issue_resolved' }, { kind: 'module_update' }])
    expect(live.comments.at(-1)!.body).toContain('1 module update notifications queued')
    expect(live.writes.filter(write => write.method === 'PATCH')).toHaveLength(1)
  })
})

describe('GitHub-first presentation', () => {
  it('shows a public frontend reply form with explicit attribution and verification gates', () => {
    const render = (user: { id: string; username: string; displayName: string; verified: boolean } | null) => renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session: { ...emptySession, user }, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(GithubReplyForm, { moduleId: 'miniverb', issueId: 'report', onSent: () => {} })))
    expect(render(null)).toContain('Sign in to reply on Modwerk')
    expect(render({ id: 'listener', username: 'listener', displayName: 'Listener', verified: false })).toContain('Verify your email')
    const verified = render({ id: 'listener', username: 'listener', displayName: 'Listener', verified: true })
    expect(verified).toContain('Send public reply')
    expect(verified).toContain('publicly here and on GitHub')
  })
  it('keeps creator settings and GitHub entry points while removing the duplicated report/activity inbox', () => {
    const html = renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session: emptySession, developer: { available: true, user: { login: 'Zac-Kyoti' } }, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(DeveloperPage, { route: 'developer' })))
    expect(html).toContain('Creator settings')
    expect(html).toContain('GitHub reports')
    expect(html).not.toMatch(/Module activity|Mark all read|View reports|Open report to reply or close/)
  })
  it('keeps report submission and duplicate-report reply entry points on the frontend', () => {
    const success = renderToStaticMarkup(createElement(BugReportSuccess, { report: { id: 'report', author: 'Zac-Kyoti', github: 'synced', githubUrl: 'https://github.com/repeat98/modwerk/issues/321', forumThreadId: null } }))
    expect(success).toContain('href="#account/report/report">Read and reply on Modwerk')
    const existing = renderToStaticMarkup(createElement(ExistingIssues, { id: 'sidechain-compressor', tracker: { tracker: 'github', issues: [], allUrl: 'https://github.com/repeat98/modwerk/issues', openCount: 0, closedCount: 0, hasMore: false } }))
    expect(existing).toContain('href="#module/sidechain-compressor?tab=issues"')
    expect(existing).not.toContain('target="_blank"')
  })
})
