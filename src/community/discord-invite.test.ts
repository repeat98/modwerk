import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY_RULES_VERSION, USAGE_CONSENT_VERSION } from '../legal/policy'
import { testServer } from './test-server'
import { DISCORD_INVITE_CAMPAIGN } from '../config/development-discord'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

const databases: Array<{ close(): void }> = []
const password = 'a Discord invitation test password'
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'test-email' }))) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  async function member(username: string, existing = true) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { username, email, password, rulesVersion: COMMUNITY_RULES_VERSION })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    server.db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').run(id)
    server.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(id)
    // Existing members predate the inline welcome; fresh signups retain its suppression marker.
    if (existing) server.db.prepare('DELETE FROM member_discord_invites WHERE user_id=?').run(id)
    async function login() { return (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')! }
    return { id, token: await login(), login }
  }
  return { ...server, member }
}

describe('once-per-account Discord invitation', () => {
  it('resends once to a previously invited account across simultaneous devices and later sessions', async () => {
    const { call, member, db } = await fixture(), owner = await member('resendmember')
    db.prepare("INSERT INTO member_discord_invites(user_id,shown_at) VALUES(?,'2026-10-07 12:00:00')").run(owner.id)
    const campaign = { campaign: DISCORD_INVITE_CAMPAIGN }
    const results = await Promise.all([owner.token, await owner.login()].map(async token => (await call('/auth/discord-invite', 'POST', campaign, token)).json()))
    expect(results.filter(result => result.show)).toHaveLength(1)
    expect(results.every(result => result.campaign === DISCORD_INVITE_CAMPAIGN)).toBe(true)
    expect(await (await call('/auth/discord-invite', 'POST', campaign, await owner.login())).json()).toEqual({ show: false, ...campaign })
    expect(db.prepare('SELECT campaign FROM member_discord_invites WHERE user_id=?').get(owner.id)).toEqual(campaign)
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_discord_invites').get()).toEqual({ count: 1 })
  })
  it('keeps older frontend claims separate and refuses stale rounds without resetting the current claim', async () => {
    const { call, member, db } = await fixture(), owner = await member('mixedversions')
    const campaign = { campaign: DISCORD_INVITE_CAMPAIGN }
    expect(await (await call('/auth/discord-invite', 'POST', {}, owner.token)).json()).toEqual({ show: true })
    expect((await call('/auth/discord-invite', 'POST', { campaign: 'development-discord-2026-10-07' }, owner.token)).status).toBe(400)
    expect(await (await call('/auth/discord-invite', 'POST', campaign, owner.token)).json()).toEqual({ show: true, ...campaign })
    expect(await (await call('/auth/discord-invite', 'POST', {}, owner.token)).json()).toEqual({ show: false })
    expect((await call('/auth/discord-invite', 'POST', { campaign: null }, owner.token)).status).toBe(400)
    expect(await (await call('/auth/discord-invite', 'POST', campaign, owner.token)).json()).toEqual({ show: false, ...campaign })
    expect(db.prepare('SELECT campaign FROM member_discord_invites WHERE user_id=?').get(owner.id)).toEqual(campaign)
  })
  it('carries the new visitor round into the account without inviting it again on another device', async () => {
    const { call, member } = await fixture(), owner = await member('resendvisitor')
    const campaign = { campaign: DISCORD_INVITE_CAMPAIGN }
    expect(await (await call('/auth/discord-invite', 'POST', { ...campaign, alreadyShown: true }, owner.token)).json()).toEqual({ show: false, ...campaign })
    expect(await (await call('/auth/discord-invite', 'POST', campaign, await owner.login())).json()).toEqual({ show: false, ...campaign })
  })
  it('reserves the current round for a fresh signup’s inline welcome', async () => {
    const { call, member } = await fixture(), owner = await member('newroundsignup', false)
    const campaign = { campaign: DISCORD_INVITE_CAMPAIGN }
    expect(await (await call('/auth/discord-invite', 'POST', campaign, owner.token)).json()).toEqual({ show: false, ...campaign })
  })
  it('allows one of simultaneous visits, and remembers it across independent sessions and members', async () => {
    const { call, member, db } = await fixture(), first = await member('inviteone'), other = await member('invitetwo')
    const secondDevice = await first.login()
    const results = await Promise.all([first.token, secondDevice].map(async token => (await call('/auth/discord-invite', 'POST', {}, token)).json()))
    expect(results.filter(result => result.show)).toHaveLength(1)
    expect(await (await call('/auth/discord-invite', 'POST', {}, await first.login())).json()).toEqual({ show: false })
    expect(await (await call('/auth/discord-invite', 'POST', {}, other.token)).json()).toEqual({ show: true })
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_discord_invites').get()).toEqual({ count: 2 })
  })
  it('permanently suppresses the member popup after a browser invitation without claiming another member', async () => {
    const { call, member } = await fixture(), owner = await member('visitedbefore'), other = await member('stilleligible')
    expect(await (await call('/auth/discord-invite', 'POST', { alreadyShown: true }, owner.token)).json()).toEqual({ show: false })
    expect(await (await call('/auth/discord-invite', 'POST', {}, await owner.login())).json()).toEqual({ show: false })
    expect(await (await call('/auth/discord-invite', 'POST', {}, other.token)).json()).toEqual({ show: true })
  })
  it('reserves fresh signups for the inline welcome, with no modal impression count', async () => {
    const { call, member, db } = await fixture(), owner = await member('newsignup', false)
    expect(await (await call('/auth/discord-invite', 'POST', {}, owner.token)).json()).toEqual({ show: false })
    expect(db.prepare('SELECT * FROM usage_daily').all()).toEqual([])
  })
  it('rejects invalid suppression input without consuming the invitation', async () => {
    const { call, member } = await fixture(), owner = await member('badpreference')
    expect((await call('/auth/discord-invite', 'POST', { alreadyShown: 'yes' }, owner.token)).status).toBe(400)
    expect(await (await call('/auth/discord-invite', 'POST', {}, owner.token)).json()).toEqual({ show: true })
  })
  it('requires a verified owner and the site origin, and never claims on a GET', async () => {
    const { call, member, db } = await fixture(), owner = await member('inviteowner')
    expect((await call('/auth/discord-invite', 'POST', {})).status).toBe(401)
    expect((await call('/auth/discord-invite', 'GET', undefined, owner.token)).status).toBe(405)
    expect((await call('/auth/discord-invite', 'POST', {}, owner.token, '', 'https://evil.example')).status).toBe(403)
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(owner.id)
    expect((await call('/auth/discord-invite', 'POST', {}, owner.token)).status).toBe(401)
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_discord_invites').get()).toEqual({ count: 0 })
  })
  it('exports the invitation marker privately and removes it with the account', async () => {
    const { call, member, db } = await fixture(), owner = await member('inviteexport')
    await call('/auth/discord-invite', 'POST', { campaign: DISCORD_INVITE_CAMPAIGN }, owner.token)
    const exported = await call('/auth/data-export', 'POST', { password }, owner.token)
    expect(exported.status).toBe(200)
    expect((await exported.json()).data.discordInvitation).toEqual([{ campaign: DISCORD_INVITE_CAMPAIGN, shown_at: expect.any(String) }])
    db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(owner.id)
    db.prepare('DELETE FROM auth_users WHERE id=?').run(owner.id)
    expect(db.prepare('SELECT COUNT(*) AS count FROM member_discord_invites').get()).toEqual({ count: 0 })
  })
})

it('upgrades existing invitation records without changing their timestamps or breaking old inserts', () => {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  db.exec('CREATE TABLE auth_users(id TEXT PRIMARY KEY)')
  db.exec(readFileSync(new URL('../../migrations/0054_discord_invitation.sql', import.meta.url), 'utf8').split('-- Additive counters')[0])
  db.exec("INSERT INTO auth_users(id) VALUES('previous'),('oldworker'); INSERT INTO member_discord_invites(user_id,shown_at) VALUES('previous','2026-10-07 12:00:00')")
  db.exec(readFileSync(new URL('../../migrations/0069_discord_invite_campaign.sql', import.meta.url), 'utf8'))
  expect(db.prepare('SELECT * FROM member_discord_invites').get()).toEqual({ user_id: 'previous', campaign: 'development-discord-2026-10-07', shown_at: '2026-10-07 12:00:00' })
  db.exec("INSERT OR IGNORE INTO member_discord_invites(user_id) VALUES('oldworker')")
  expect(db.prepare("SELECT campaign FROM member_discord_invites WHERE user_id='oldworker'").get()).toEqual({ campaign: 'development-discord-2026-10-07' })
})

describe('invitation action statistics', () => {
  it('counts every choice for the correct audience through both collectors and deduplicates opted-in events', async () => {
    const { call, db, env } = await fixture()
    const events = {
      discord_member_prompt_shown: 'discord_member_shown', discord_member_join_clicked: 'discord_member_joins', discord_member_dismissed: 'discord_member_dismissals',
      discord_visitor_prompt_shown: 'discord_visitor_shown', discord_visitor_signup_clicked: 'discord_visitor_signups', discord_visitor_join_clicked: 'discord_visitor_joins', discord_visitor_dismissed: 'discord_visitor_dismissals', discord_welcome_join_clicked: 'discord_welcome_joins',
    }
    const { recordUsage } = await import('../../server/usage')
    for (const event of Object.keys(events)) {
      expect((await call('/usage/count', 'POST', { event })).status).toBe(200)
      const request = new Request('https://api.example.test/api/usage/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octamod-Usage-Consent': USAGE_CONSENT_VERSION }, body: JSON.stringify({ event, eventId: crypto.randomUUID(), visitor: crypto.randomUUID() }) })
      expect((await recordUsage(request.clone(), env, env.DB!)).status).toBe(200)
      expect((await recordUsage(request.clone(), env, env.DB!)).status).toBe(200)
    }
    const expected = Object.fromEntries(Object.values(events).map(column => [column, 2]))
    expect(db.prepare('SELECT * FROM usage_daily').get()).toMatchObject(expected)
    expect(db.prepare('SELECT * FROM usage_hourly').get()).toMatchObject(expected)
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token
    const statistics = await (await call('/admin/statistics?days=7', 'GET', undefined, '', admin)).json()
    expect(statistics.discordInvitesStarted).toBeTruthy()
    expect(statistics.rows[0]).toMatchObject(expected)
    expect((await call('/usage/count', 'POST', { event: 'discord_member_join_clicked', userId: 'private-member' })).status).toBe(400)
  })
})
