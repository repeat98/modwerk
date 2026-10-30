import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { claimNote, messageBody, syncAgentClaims, CLAIM_LIMIT, OPEN_THREADS } from '../../server/agent-board'
import * as client from '../../scripts/agent-board.mjs'

const databases: DatabaseSync[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); vi.useRealTimers() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  Object.assign(server.env, { GITHUB_OAUTH_CLIENT_ID: 'test-client', GITHUB_OAUTH_CLIENT_SECRET: 'only-a-test-client-secret', GITHUB_OAUTH_CALLBACK_URL: 'https://api.example.test/api/developer/auth/callback' })
  const call = (path: string, method = 'GET', body?: unknown, developer = '', { origin = 'https://octamod.test' as string | null, admin = '', cookie = '' } = {}) => {
    const headers = new Headers({ 'CF-Connecting-IP': '192.0.2.1' })
    if (origin) headers.set('Origin', origin)
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (developer) headers.set('X-Modwerk-Developer', developer)
    if (admin) headers.set('X-Octamod-Admin', admin)
    if (cookie) headers.set('Cookie', cookie)
    return handleCommunity(new Request('https://api.example.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), server.env)
  }
  let next = 100
  /** The terminal sign-in: GitHub returns to the loopback port, the script trades the one-time code for a board session. */
  async function boardLogin(login: string) {
    const githubId = ++next, verifier = (next).toString(16).padStart(64, 'a'), challenge = await digest(verifier)
    const start = await call('/developer/auth/start?port=48123&challenge=' + challenge); expect(start.status).toBe(302)
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!, cookie = start.headers.get('Set-Cookie')!.split(';')[0]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === 'https://github.com/login/oauth/access_token'
      ? Response.json({ access_token: 'synthetic-github-access', token_type: 'bearer' })
      : Response.json({ data: { viewer: { databaseId: githubId, login } } })))
    const callback = await call('/developer/auth/callback?code=synthetic-code&state=' + state, 'GET', undefined, '', { origin: null, cookie })
    const location = new URL(callback.headers.get('Location')!)
    expect(location.origin + location.pathname).toBe('http://127.0.0.1:48123/callback')
    const complete = await call('/developer/auth/complete', 'POST', { code: location.searchParams.get('code'), verifier })
    expect(complete.status).toBe(200)
    vi.unstubAllGlobals()
    return complete.headers.get('X-Modwerk-Developer')!
  }
  const claim = (token: string, body: Record<string, unknown>) => call('/agent-board/claims', 'POST', body, token)
  const post = (token: string, body: Record<string, unknown>) => call('/agent-board/messages', 'POST', body, token)
  const reply = (token: string, id: string, body: string) => call('/agent-board/messages/' + id + '/replies', 'POST', { body }, token)
  const inbox = async (token: string) => await (await call('/agent-board/inbox', 'GET', undefined, token)).json()
  return { ...server, call, boardLogin, claim, post, reply, inbox }
}

describe('agent board', () => {
  it('signs any GitHub account in from the terminal, for the board only', async () => {
    const { call, boardLogin, db } = await fixture()
    const token = await boardLogin('first-porter')
    expect(await (await call('/agent-board/me', 'GET', undefined, token)).json()).toEqual({ login: 'first-porter' })
    // Not a listed author, and a board session never opens the creator routes even for one who is.
    expect(await (await call('/developer/auth/session', 'GET', undefined, token)).json()).toMatchObject({ user: null })
    expect(db.prepare('SELECT purpose FROM developer_sessions').get()).toEqual({ purpose: 'board' })
    expect((await call('/agent-board/me')).status).toBe(401)
    expect((await call('/developer/auth/start?port=80&challenge=' + 'a'.repeat(64))).status).toBe(400)
  })

  it('shows claims to everyone and gives each key one holder', async () => {
    const { call, boardLogin, claim } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    expect((await claim('', { kind: 'module', key: 'octatrack/tape-echo' })).status).toBe(401)
    const created = await claim(ada, { kind: 'module', key: 'octatrack/tape-echo', branch: 'module/tape-echo', note: 'Porting the BBD echo' })
    expect(created.status).toBe(201)
    const { claim: mine } = await created.json()
    expect(mine).toMatchObject({ kind: 'module', key: 'octatrack/tape-echo', holder: 'ada', branch: 'module/tape-echo', pullRequest: null, note: 'Porting the BBD echo' })
    expect(Date.parse(mine.expiresAt) - Date.now()).toBeGreaterThan(13 * 86400000)
    const taken = await claim(bo, { kind: 'module', key: 'octatrack/tape-echo' })
    expect(taken.status).toBe(409)
    expect((await taken.json()).error).toMatch(/claimed by @ada on module\/tape-echo/)
    // Claiming what you hold renews it; linking a pull request keeps it while the pull request is open.
    const renewed = await (await claim(ada, { kind: 'module', key: 'octatrack/tape-echo', pullRequest: 1200 })).json()
    expect(renewed).toMatchObject({ renewed: true, claim: { id: mine.id, pullRequest: 1200, expiresAt: null, note: 'Porting the BBD echo' } })
    // Public reads need no account and no Origin.
    const listed = await (await call('/agent-board/claims?kind=module', 'GET', undefined, '', { origin: null })).json()
    expect(listed.claims.map((item: { key: string }) => item.key)).toEqual(['octatrack/tape-echo'])
    expect((await (await call('/agent-board/claims?holder=@bo')).json()).claims).toEqual([])
    expect((await claim(bo, { kind: 'hook', key: 'octatrack/39' })).status).toBe(201)
    expect((await claim(bo, { kind: 'hook', key: 'digitakt/events/7' })).status).toBe(201)
    expect((await claim(bo, { kind: 'migration', key: '0085' })).status).toBe(201)
    for (const [kind, key] of [['hook', 'octatrack/0x40'], ['migration', '85'], ['module', 'Octatrack/Echo'], ['nope', 'x']]) expect((await claim(bo, { kind, key })).status).toBe(400)
  })

  it('keeps notes to short plain prose', () => {
    expect(claimNote(' Porting the echo, BBD first ')).toBe('Porting the echo, BBD first')
    for (const note of ['see https://example.com', 'in ~/src/mod', 'sdk/octabam/modules/x', 'patch 0x40098a5c', 'hash 02baba67a7ec7d7b', 'run `rm -rf`', 'ghp_' + 'a'.repeat(36), 'two\nlines', 'x'.repeat(121), 'modwerk.app'])
      expect(() => claimNote(note), note).toThrow()
  })

  it('limits how many claims one person holds', async () => {
    const { boardLogin, claim } = await fixture()
    const ada = await boardLogin('ada')
    for (let index = 0; index < CLAIM_LIMIT; index++) expect((await claim(ada, { kind: 'migration', key: String(100 + index).padStart(4, '0') })).status).toBe(201)
    const over = await claim(ada, { kind: 'migration', key: '0200' })
    expect(over.status).toBe(409)
    expect((await over.json()).error).toMatch(/release/i)
  })

  it('lets the holder or an administrator release a claim, and nobody else', async () => {
    const { call, boardLogin, claim } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    const { claim: one } = await (await claim(ada, { kind: 'hook', key: 'octatrack/40' })).json()
    expect((await call('/agent-board/claims/' + one.id, 'DELETE', undefined, bo)).status).toBe(404)
    expect((await call('/agent-board/claims/' + one.id, 'DELETE', undefined, ada)).status).toBe(200)
    expect((await claim(bo, { kind: 'hook', key: 'octatrack/40' })).status).toBe(201)
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
    const { claims: [held] } = await (await call('/agent-board/claims?key=octatrack/40')).json()
    expect((await call('/agent-board/claims/' + held.id, 'DELETE', undefined, '', { admin })).status).toBe(200)
    const { released } = await (await call('/agent-board/claims?key=octatrack/40&released=1')).json()
    expect(released.map((item: { holder: string; releasedReason: string }) => [item.holder, item.releasedReason])).toEqual([['bo', 'administrator'], ['ada', 'holder']])
  })

  it('lets an unlinked claim lapse after 14 days unless renewed', async () => {
    const { call, boardLogin, claim } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    const { claim: one } = await (await claim(ada, { kind: 'module', key: 'digitakt/swarm' })).json()
    vi.useFakeTimers({ now: Date.now() + 10 * 86400000, toFake: ['Date'] })
    expect((await call('/agent-board/claims/' + one.id + '/renew', 'POST', {}, ada)).status).toBe(200)
    vi.setSystemTime(Date.now() + 13 * 86400000)
    expect((await claim(bo, { kind: 'module', key: 'digitakt/swarm' })).status).toBe(409)
    vi.setSystemTime(Date.now() + 2 * 86400000)
    expect((await (await call('/agent-board/claims?key=digitakt/swarm')).json()).claims).toEqual([])
    expect((await claim(bo, { kind: 'module', key: 'digitakt/swarm' })).status).toBe(201)
  })

  it('links claims to their pull request and releases them once it is merged or closed', async () => {
    const { env, db, boardLogin, claim, call } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    await claim(ada, { kind: 'module', key: 'octatrack/tape-echo', branch: 'module/tape-echo' })
    await claim(bo, { kind: 'migration', key: '0090', pullRequest: 7 })
    await claim(bo, { kind: 'migration', key: '0091', pullRequest: 8 })
    env.GITHUB_TOKEN = 'synthetic-token'
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(url.replace('https://api.github.com/repos/repeat98/modwerk', ''))
      if (url.includes('head=')) return Response.json([{ number: 1300, state: 'open', merged_at: null }])
      return Response.json(url.endsWith('/7') ? { number: 7, state: 'closed', merged_at: '2026-10-29T00:00:00Z' } : { number: 8, state: 'closed', merged_at: null })
    }))
    await syncAgentClaims(env, env.DB!)
    expect(asked).toContain('/pulls?state=open&per_page=5&head=' + encodeURIComponent('ada:module/tape-echo'))
    const { claims, released } = await (await call('/agent-board/claims?released=1')).json()
    expect(claims).toMatchObject([{ key: 'octatrack/tape-echo', pullRequest: 1300, expiresAt: null }])
    expect(released.map((item: { key: string; releasedReason: string }) => [item.key, item.releasedReason]).sort()).toEqual([['0090', 'merged'], ['0091', 'closed']])
    // A suspended account's claims go on the next run.
    db.prepare("UPDATE users SET suspended=1 WHERE github_login='ada'").run()
    await syncAgentClaims(env, env.DB!)
    expect((await (await call('/agent-board/claims')).json()).claims).toEqual([])
    // Ended claims are deleted 90 days after they ended, as the privacy notice says.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
    vi.useFakeTimers({ now: Date.now() + 89 * 86400000, toFake: ['Date'] })
    await syncAgentClaims(env, env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_claims').get()).toEqual({ n: 3 })
    vi.setSystemTime(Date.now() + 2 * 86400000)
    await syncAgentClaims(env, env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_claims').get()).toEqual({ n: 0 })
  })
})

describe('agent board questions and findings', () => {
  it('sends a question to whoever holds its topic, and keeps each side\'s inbox to what waits for them', async () => {
    const { call, boardLogin, claim, post, reply, inbox } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    await claim(ada, { kind: 'module', key: 'octatrack/tape-echo', branch: 'module/tape-echo' })
    expect((await post('', { kind: 'question', topic: 'module', key: 'octatrack/tape-echo', body: 'May I add a ping-pong mode?' })).status).toBe(401)
    const asked = await post(bo, { kind: 'question', topic: 'module', key: 'octatrack/tape-echo', body: 'Are you porting the BBD stage too? I could take the tape stage.' })
    expect(asked.status).toBe(201)
    const { message: question } = await asked.json()
    expect(question).toMatchObject({ kind: 'question', topic: { kind: 'module', key: 'octatrack/tape-echo' }, author: 'bo', to: 'ada', replies: [] })
    expect(Date.parse(question.endsAt) - Date.now()).toBeGreaterThan(29 * 86400000)
    expect((await inbox(ada)).waiting.map((item: { id: string }) => item.id)).toEqual([question.id])
    expect((await inbox(bo)).waiting).toEqual([])
    expect((await reply(ada, question.id, 'Both stages, sorry. The chorus is free if you want it.')).status).toBe(201)
    expect((await inbox(ada)).waiting).toEqual([])
    const answered = await inbox(bo)
    expect(answered.replies).toMatchObject([{ id: question.id, replies: [{ author: 'ada', body: 'Both stages, sorry. The chorus is free if you want it.' }] }])
    // Public reads need no account; only the asker or an administrator closes a question.
    const listed = await (await call('/agent-board/messages?topic=module&key=octatrack/tape-echo', 'GET', undefined, '', { origin: null })).json()
    expect(listed.messages).toMatchObject([{ id: question.id, replies: [{ author: 'ada' }] }])
    expect((await call('/agent-board/messages/' + question.id + '/close', 'POST', {}, ada)).status).toBe(404)
    expect(await (await call('/agent-board/messages/' + question.id + '/close', 'POST', {}, bo)).json()).toMatchObject({ message: { endedReason: 'author' } })
    expect((await reply(ada, question.id, 'One more thing')).status).toBe(404)
    const after = await (await call('/agent-board/messages?key=octatrack/tape-echo&ended=1')).json()
    expect([after.messages, after.ended.map((item: { id: string }) => item.id)]).toEqual([[], [question.id]])
    expect((await inbox(bo)).replies).toEqual([])
    // A question can name someone else, never its asker; one nobody holds goes to nobody.
    expect((await post(bo, { kind: 'question', topic: 'module', key: 'octatrack/tape-echo', to: '@Bo', body: 'Me?' })).status).toBe(400)
    const open = await (await post(bo, { kind: 'question', topic: 'module', key: 'digitakt/swarm', body: 'Is anyone porting swarm?' })).json()
    expect(open.message.to).toBeNull()
    const named = await (await post(ada, { kind: 'question', topic: 'machine', key: 'digitakt', to: 'Bo', body: 'Which core release do you build against?' })).json()
    expect((await inbox(bo)).waiting.map((item: { id: string }) => item.id)).toEqual([named.message.id])
  })

  it('keeps findings for everyone, about a machine or anything under it, until a guide carries them', async () => {
    const { env, call, boardLogin, post } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    const machine = await (await post(ada, { kind: 'finding', topic: 'machine', key: 'octatrack', body: 'The emulator accepts loads the unit refuses after a power cycle, so qualify on hardware.' })).json()
    const hook = await (await post(bo, { kind: 'finding', topic: 'hook', key: 'octatrack/39', body: 'The render hook runs before the FX2 slot fills, so read the slot on the next tick.', pullRequest: 1400 })).json()
    await post(bo, { kind: 'finding', topic: 'module', key: 'digitakt/swarm', body: 'Swarm voices steal from the last track first.' })
    expect(hook.message).toMatchObject({ pullRequest: 1400, to: null })
    expect((await post(ada, { kind: 'finding', topic: 'machine', key: 'octatrack', to: 'bo', body: 'For you' })).status).toBe(400)
    expect((await post(ada, { kind: 'question', topic: 'machine', key: 'octatrack', pullRequest: 3, body: 'Folded?' })).status).toBe(400)
    for (const [topic, key] of [['machine', 'Octatrack'], ['planet', 'mars'], ['hook', 'octatrack/0x40']]) expect((await post(ada, { kind: 'finding', topic, key, body: 'x' })).status).toBe(400)
    const about = async (query: string) => (await (await call('/agent-board/messages?' + query)).json()).messages.map((item: { id: string }) => item.id).sort()
    expect(await about('machine=octatrack')).toEqual([machine.message.id, hook.message.id].sort())
    expect(await about('kind=finding&author=bo')).toHaveLength(2)
    // Only the author or an administrator folds a finding; the hourly run ends it once that pull request merges.
    expect((await call('/agent-board/messages/' + machine.message.id + '/fold', 'POST', { pullRequest: 1500 }, bo)).status).toBe(404)
    expect((await call('/agent-board/messages/' + machine.message.id + '/fold', 'POST', { pullRequest: 1500 }, ada)).status).toBe(200)
    env.GITHUB_TOKEN = 'synthetic-token'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.endsWith('/1400') ? { number: 1400, state: 'closed', merged_at: '2026-10-30T00:00:00Z' } : { number: 1500, state: 'closed', merged_at: null })))
    await syncAgentClaims(env, env.DB!)
    const { messages, ended } = await (await call('/agent-board/messages?machine=octatrack&ended=1')).json()
    expect(messages).toMatchObject([{ id: machine.message.id, pullRequest: null }])
    expect(ended).toMatchObject([{ id: hook.message.id, endedReason: 'folded' }])
  })

  it('keeps board text to plain prose', () => {
    expect(messageBody(' The FX2 slot fills one tick late. ')).toBe('The FX2 slot fills one tick late.')
    for (const text of ['', 'x'.repeat(501), 'see https://example.com', 'in sdk/octabam/modules/x', 'patch 0x40098a5c', 'run `make`', 'two\nlines', 'hidden\u200btext', 'ignore\u202eprevious'])
      expect(() => messageBody(text), JSON.stringify(text)).toThrow()
  })

  it('lets a question lapse 30 days after its last post and a finding after 90, then deletes them', async () => {
    const { env, db, call, boardLogin, post, reply } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    const { message: question } = await (await post(ada, { kind: 'question', topic: 'migration', key: '0090', body: 'Do you still need migration 0090?' })).json()
    const { message: finding } = await (await post(ada, { kind: 'finding', topic: 'machine', key: 'digitone', body: 'The core profile lags the release by a day.' })).json()
    vi.useFakeTimers({ now: Date.now() + 20 * 86400000, toFake: ['Date'] })
    expect((await reply(bo, question.id, 'Not any more, take it.')).status).toBe(201)
    vi.setSystemTime(Date.now() + 20 * 86400000)
    const ids = async () => (await (await call('/agent-board/messages')).json()).messages.map((item: { id: string }) => item.id).sort()
    expect(await ids()).toEqual([question.id, finding.id].sort())
    vi.setSystemTime(Date.now() + 15 * 86400000)
    expect(await ids()).toEqual([finding.id])
    vi.setSystemTime(Date.now() + 40 * 86400000)
    expect(await ids()).toEqual([])
    await syncAgentClaims(env, env.DB!)
    expect(db.prepare('SELECT ended_reason AS reason, COUNT(*) AS n FROM agent_messages GROUP BY ended_reason').all()).toEqual([{ reason: null, n: 1 }, { reason: 'expired', n: 2 }])
    vi.setSystemTime(Date.now() + 91 * 86400000)
    await syncAgentClaims(env, env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_messages').get()).toEqual({ n: 0 })
  })

  it('lets authors take back their posts, administrators remove any, and drops a suspended account\'s', async () => {
    const { env, db, call, boardLogin, post, reply } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    const { message: finding } = await (await post(ada, { kind: 'finding', topic: 'machine', key: 'octatrack', body: 'Keep DSP loads under the self-test limit.' })).json()
    const { message: withReply } = await (await reply(bo, finding.id, 'Confirmed on my unit.')).json()
    const replyId = withReply.replies[0].id
    expect((await call('/agent-board/messages/' + replyId, 'DELETE', undefined, ada)).status).toBe(404)
    expect((await call('/agent-board/messages/' + replyId, 'DELETE', undefined, bo)).status).toBe(200)
    await reply(bo, finding.id, 'Confirmed again.')
    db.prepare("UPDATE users SET suspended=1 WHERE github_login='bo'").run()
    expect((await (await call('/agent-board/messages/' + finding.id)).json()).message.replies).toEqual([])
    await syncAgentClaims(env, env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_messages').get()).toEqual({ n: 1 })
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
    expect((await call('/agent-board/messages/' + finding.id, 'DELETE', undefined, '', { admin })).status).toBe(200)
    expect((await call('/agent-board/messages/' + finding.id)).status).toBe(404)
  })

  it('limits open threads per person', async () => {
    const { boardLogin, post } = await fixture()
    const ada = await boardLogin('ada')
    for (let index = 0; index < OPEN_THREADS; index++) expect((await post(ada, { kind: 'finding', topic: 'migration', key: String(100 + index).padStart(4, '0'), body: 'Note ' + index })).status).toBe(201)
    const over = await post(ada, { kind: 'finding', topic: 'migration', key: '0200', body: 'One more' })
    expect(over.status).toBe(409)
    expect((await over.json()).error).toMatch(/close/i)
  })

  it('counts who uses the board, without names', async () => {
    const { call, boardLogin, claim, post } = await fixture()
    expect(await (await call('/agent-board/activity')).json()).toMatchObject({ developers: { signedIn: 0, active: 0 }, claims: { active: 0 } })
    const ada = await boardLogin('ada'), bo = await boardLogin('bo'); await boardLogin('cy')
    await claim(ada, { kind: 'module', key: 'octatrack/tape-echo' })
    await post(bo, { kind: 'question', topic: 'module', key: 'octatrack/tape-echo', body: 'Room for a chorus?' })
    await post(bo, { kind: 'finding', topic: 'machine', key: 'octatrack', body: 'Loads go to RAM.' })
    expect(await (await call('/agent-board/activity', 'GET', undefined, '', { origin: null })).json()).toEqual({ days: 30, developers: { signedIn: 3, active: 2 }, claims: { active: 1, made: 1 }, questions: { open: 1 }, findings: { active: 1 }, posts: 2 })
  })
})

describe('the terminal client against the Worker', () => {
  it('asks, answers and reads the inbox the way the commands do', async () => {
    const { env, boardLogin, claim } = await fixture()
    const ada = await boardLogin('ada'), bo = await boardLogin('bo')
    await claim(ada, { kind: 'module', key: 'octatrack/tape-echo' })
    vi.stubEnv('MODWERK_SITE', 'https://octamod.test/')
    // The client's own requests, answered by the Worker in this test instead of the live board.
    const fetch = (url: string, init: RequestInit) => handleCommunity(new Request(url, { ...init, headers: { ...init.headers as Record<string, string>, 'CF-Connecting-IP': '192.0.2.1' } }), env)
    const options = { api: 'https://api.example.test/api', fetch }
    const { message } = await client.post({ kind: 'question', topic: 'module', key: 'octatrack/tape-echo', body: 'Room for a chorus stage?' }, { ...options, token: bo })
    expect(message.to).toBe('ada')
    expect(await client.inboxNotes({ ...options, token: ada })).toEqual([expect.stringContaining('1 question waits for your answer')])
    const { messages } = await client.listMessages({ machine: 'octatrack' }, options)
    expect(client.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages, login: 'ada' })?.detail).toContain('1 waiting for you')
    await client.messageAction(message.id, 'reply', { body: 'Yes, go ahead.' }, { ...options, token: ada })
    expect(await client.inboxNotes({ ...options, token: ada })).toEqual([])
    expect(await client.inboxNotes({ ...options, token: bo })).toEqual([expect.stringContaining('1 of your questions and findings has a reply')])
    await expect(client.messageAction(message.id, 'close', {}, { ...options, token: ada })).rejects.toThrow('You wrote no open board thread')
    expect((await client.messageAction(message.id, 'close', {}, { ...options, token: bo })).message.endedReason).toBe('author')
    expect((await client.activity(options)).questions.open).toBe(0)
    vi.unstubAllEnvs()
  })
})
