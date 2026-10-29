import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { claimNote, syncAgentClaims, CLAIM_LIMIT } from '../../server/agent-board'

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
  return { ...server, call, boardLogin, claim }
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
