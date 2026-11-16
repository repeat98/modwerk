import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { testServer } from './test-server'

// The Worker reads the same switch as the site; here it is on, as after the release.
vi.mock('../config/octatrack-base', () => ({ OCTATRACK_BASE_RELEASED: true }))

const databases: Array<{ close(): void }> = []
const password = 'a released base install prompt test password'
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'test-email' }))) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

describe('base install prompt once the Octatrack base path is released', () => {
  it('is due to every verified member, beta tester or not, until their unit reports a base', async () => {
    const server = await testServer(); databases.push(server.db)
    const email = 'released@example.test'
    expect((await server.call('/auth/register', 'POST', { username: 'releasedplain', email, password, rulesVersion: COMMUNITY_RULES_VERSION })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    server.db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').run(id)
    server.db.prepare('UPDATE users SET email_verified=1, beta_tester=0 WHERE id=?').run(id)
    const token = (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
    const due = async () => (await (await server.call('/auth/base-install-prompt', 'GET', undefined, token)).json()).show
    expect(await due()).toBe(true)
    expect((await server.call('/auth/base-install-prompt', 'POST', {}, token)).status).toBe(200)
    expect(await due()).toBe(false)
    expect((await server.call('/auth/base-install-prompt', 'GET')).status).toBe(401) // still members only
  })
})
