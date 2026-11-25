import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { testServer } from '../src/community/test-server.ts'
import { handleCommunity } from '../server/transport.ts'
import { SESSION_CONSENT_VERSION } from '../src/community/agent-sessions.ts'
import { COMMUNITY_RULES_VERSION } from '../src/legal/policy.ts'
import { accountRequest, alreadyShared, asAccount, buildSession, pullSessions, sharedMoments } from './agent-session.mjs'
import { BoardError } from './agent-board.mjs'

const password = 'private session pull test passphrase'
const cleanup = []
afterEach(async () => { vi.unstubAllGlobals(); for (const step of cleanup.splice(0)) await step() })

async function fixture() {
  const server = await testServer()
  const site = process.env.MODWERK_SITE
  process.env.MODWERK_SITE = 'https://octamod.test'
  cleanup.push(() => { server.db.close(); if (site === undefined) delete process.env.MODWERK_SITE; else process.env.MODWERK_SITE = site })
  // Account mail goes out through fetch: keep the verification link it carries.
  const mails = []
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { mails.push(JSON.parse(String(init.body))); return Response.json({ id: 'mock-email' }) }))
  async function member(username, admin = false) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = mails.at(-1).text.match(/#account\/verify\/([^\s]+)/)[1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    if (admin) server.db.prepare('UPDATE users SET is_admin=1 WHERE username=?').run(username)
    return email
  }
  const options = { api: 'https://api.example.test/api', fetch: (url, init) => handleCommunity(new Request(url, { ...init, headers: { 'CF-Connecting-IP': '192.0.2.1', ...init.headers } }), server.env) }
  server.db.prepare("INSERT INTO users(id,username,display_name,github_id,github_login) VALUES('u1','porter','Porter',7,'first-porter')").run()
  const session = { format: 1, agent: 'claude-code', note: 'The doctor said nothing.', entries: [{ who: 'developer', text: 'Port the tape echo.' }], removed: {} }
  server.db.prepare("INSERT INTO agent_sessions(id,user_id,agent,note,entries,consent_version,bytes,data,created_at) VALUES('00000000-0000-4000-8000-000000000001','u1','claude-code','The doctor said nothing.',1,?,10,?,?)")
    .run(SESSION_CONSENT_VERSION, gzipSync(JSON.stringify(session)).toString('base64'), new Date().toISOString())
  const folder = await mkdtemp(join(tmpdir(), 'sessions-'))
  cleanup.push(() => rm(folder, { recursive: true, force: true }))
  return { ...server, member, options, folder }
}

describe('npm run session -- pull', () => {
  it('signs in with the owner\'s account, saves every shared session, and signs out again', async () => {
    const { member, options, folder } = await fixture()
    const email = await member('owner', true)
    let used
    const count = await asAccount({ email, password }, session => { used = session; return pullSessions(folder, async path => (await accountRequest(path, { ...options, session })).value) }, options)
    expect(count).toBe(1)
    const files = (await readdir(folder)).sort()
    expect(files).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}-first-porter-00000000\.json$/), 'INDEX.md'])
    expect(JSON.parse(await readFile(join(folder, files[0]), 'utf8'))).toMatchObject({ login: 'first-porter', session: { entries: [{ text: 'Port the tape echo.' }] } })
    expect(await readFile(join(folder, 'INDEX.md'), 'utf8')).toContain('«The doctor said nothing.»')
    // Signed out: the session the pull used no longer reads anything.
    await expect(accountRequest('/agent-sessions?all=1', { ...options, session: used })).rejects.toBeInstanceOf(BoardError)
  })

  it('refuses a wrong password and an account without the administrator role', async () => {
    const { member, options, folder } = await fixture()
    const admin = await member('owner', true), plain = await member('somebody')
    await expect(asAccount({ email: admin, password: 'not the right passphrase' }, () => { throw new Error('must not run') }, options)).rejects.toBeInstanceOf(BoardError)
    await expect(asAccount({ email: plain, password }, session => pullSessions(folder, async path => (await accountRequest(path, { ...options, session })).value), options)).rejects.toMatchObject({ status: 401 })
  })
})

describe('npm run session -- share --new', () => {
  it('leaves out what an earlier share of the same session already sent, and fetches only shares made since it started', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'session-new-'))
    cleanup.push(() => rm(folder, { recursive: true, force: true }))
    const line = (type, text, timestamp) => JSON.stringify({ type, timestamp, message: { role: type, content: type === 'user' ? text : [{ type: 'text', text }] } })
    const file = join(folder, 'transcript.jsonl')
    await writeFile(file, [
      line('user', 'Measure the rest peaks.', '2026-11-20T12:00:00.000Z'),
      line('assistant', 'POLY8 is the one.', '2026-11-20T12:05:00.000Z'),
      line('user', 'Now the curves.', '2026-11-24T10:00:00.000Z'),
      line('assistant', 'FM Synth first is 17.3.', '2026-11-24T10:20:00.000Z'),
    ].join('\n') + '\n')
    const fetched = []
    const get = async path => {
      fetched.push(path)
      if (path === '/agent-sessions') return { sessions: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', createdAt: '2026-11-20T12:10:00.000Z' }, { id: 'bbbbbbbb-0000-4000-8000-000000000002', createdAt: '2026-11-01T09:00:00.000Z' }] }
      return { session: { entries: [{ who: 'developer', text: 'Measure the rest peaks.', at: '2026-11-20T12:00:00.000Z' }, { who: 'agent', text: 'POLY8 is the one.', at: '2026-11-20T12:05:00.000Z' }] } }
    }
    const session = await buildSession({ file, agent: 'claude-code', note: 'rest', shared: since => sharedMoments(get, since) })
    expect(session.entries.map(entry => entry.text)).toEqual(['Now the curves.', 'FM Synth first is 17.3.'])
    // The share from before this transcript started cannot hold any of it and is not fetched.
    expect(fetched).toEqual(['/agent-sessions', '/agent-sessions/aaaaaaaa-0000-4000-8000-000000000001'])
    expect(alreadyShared([{ who: 'agent', at: '2026-11-20T12:05:00.000Z' }, { who: 'developer', at: '2026-11-20T12:05:00.000Z' }, { who: 'tool' }], new Set(['agent 2026-11-20T12:05:00.000Z']))).toEqual([0])
  })
})
