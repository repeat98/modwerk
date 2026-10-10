import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { testServer } from './test-server'

const databases: Array<{ close(): void }> = []
const password = 'a base install prompt test password'
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'test-email' }))) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { username, email, password, rulesVersion: COMMUNITY_RULES_VERSION })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    server.db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').run(id)
    server.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(id)
    async function login() { return (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')! }
    return { id, token: await login(), login }
  }
  return { ...server, member }
}
const due = async (call: Awaited<ReturnType<typeof fixture>>['call'], token: string) => (await (await call('/auth/base-install-prompt', 'GET', undefined, token)).json()).show

describe('once-per-account base install prompt', () => {
  it('stays due on every visit until closed, then never again on any device; other members are unaffected', async () => {
    const { call, member } = await fixture(), owner = await member('baseowner'), other = await member('baseother')
    expect(await due(call, owner.token)).toBe(true)
    expect(await due(call, owner.token)).toBe(true) // asking does not consume it, so a reload mid-countdown shows it again
    expect((await call('/auth/base-install-prompt', 'POST', {}, owner.token)).status).toBe(200)
    expect((await call('/auth/base-install-prompt', 'POST', {}, owner.token)).status).toBe(200)
    expect(await due(call, await owner.login())).toBe(false)
    expect(await due(call, other.token)).toBe(true)
  })
  it('requires a verified member and the site origin to record it', async () => {
    const { call, member, db } = await fixture(), owner = await member('baseguard')
    expect((await call('/auth/base-install-prompt', 'GET')).status).toBe(401)
    expect((await call('/auth/base-install-prompt', 'POST', {})).status).toBe(401)
    expect((await call('/auth/base-install-prompt', 'POST', {}, owner.token, '', 'https://evil.example')).status).toBe(403)
    expect((await call('/auth/base-install-prompt', 'PUT', {}, owner.token)).status).toBe(405)
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_base_install_prompts').get()).toEqual({ count: 0 })
  })
  it('exports the marker privately and removes it with the account', async () => {
    const { call, member, db } = await fixture(), owner = await member('baseexport')
    await call('/auth/base-install-prompt', 'POST', {}, owner.token)
    const exported = await call('/auth/data-export', 'POST', { password }, owner.token)
    expect((await exported.json()).data.baseInstallPrompt).toEqual([{ seen_at: expect.any(String) }])
    db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(owner.id)
    db.prepare('DELETE FROM auth_users WHERE id=?').run(owner.id)
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_base_install_prompts').get()).toEqual({ count: 0 })
  })
})
