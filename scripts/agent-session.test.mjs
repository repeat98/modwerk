import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { testServer } from '../src/community/test-server.ts'
import { handleCommunity } from '../server/transport.ts'
import { SESSION_CONSENT_VERSION } from '../src/community/agent-sessions.ts'
import { COMMUNITY_RULES_VERSION } from '../src/legal/policy.ts'
import { accountRequest, asAccount, pullSessions } from './agent-session.mjs'
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
