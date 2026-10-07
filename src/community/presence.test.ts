import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { cleanupPresence, notePresence } from '../../server/presence'

const databases: DatabaseSync[] = [], sent: { to: string[]; text: string }[] = [], password = 'a long original test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = [...sent].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    return { id: String(server.db.prepare('SELECT id FROM users WHERE username=?').get(username)!.id), session: login.headers.get('X-Octamod-Session')! }
  }
  const online = async () => (await (await server.call('/community/online')).json()) as { online: number; members: { username: string; avatar: string | null }[]; more: number }
  const presence = (id: string) => server.db.prepare('SELECT seen_at FROM member_presence WHERE user_id=?').get(id) as { seen_at: number } | undefined
  const daily = () => server.db.prepare('SELECT day,members FROM member_activity_daily WHERE members>0 ORDER BY day').all()
  return { ...server, member, online, presence, daily }
}

describe('members online', () => {
  it('counts members whose bell polls and names those who show themselves, publicly and without account details', async () => {
    const f = await fixture(), a = await f.member('alpha'), b = await f.member('bravo')
    // Signing in alone is not presence; only the visible tab's bell poll is.
    expect(await f.online()).toEqual({ online: 0, members: [], more: 0 })
    expect((await f.call('/notifications/unread', 'GET', undefined, a.session)).status).toBe(200)
    expect((await f.call('/notifications/unread', 'GET', undefined, b.session)).status).toBe(200)
    const result = await f.call('/community/online')
    expect(result.status).toBe(200)
    const body = await result.json()
    // Seen in the same second, names are listed alphabetically.
    expect(body).toEqual({ online: 2, members: [{ username: 'alpha', avatar: null }, { username: 'bravo', avatar: null }], more: 0 })
    expect(JSON.stringify(body)).not.toMatch(/@|email|user_id|seen_at|password|token/)
    // Guests cannot create presence, and suspension removes a member from the count and the list at once.
    expect((await f.call('/notifications/unread')).status).toBe(401)
    f.db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(b.id)
    expect(await f.online()).toEqual({ online: 1, members: [{ username: 'alpha', avatar: null }], more: 0 })
    // An account still signing up (a social sign-up choosing its name, or an unverified email) is neither counted nor named.
    f.db.prepare('UPDATE users SET suspended=0 WHERE id=?').run(b.id)
    f.db.prepare("INSERT INTO social_pending_accounts(user_id,expires) VALUES(?,?)").run(b.id, Math.floor(Date.now() / 1000) + 600)
    expect(await f.online()).toEqual({ online: 1, members: [{ username: 'alpha', avatar: null }], more: 0 })
    f.db.prepare('DELETE FROM social_pending_accounts WHERE user_id=?').run(b.id)
    f.db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(b.id)
    expect(await f.online()).toEqual({ online: 1, members: [{ username: 'alpha', avatar: null }], more: 0 })
  })

  it('lets a member leave the online list through their profile settings while staying in the count', async () => {
    const f = await fixture(), a = await f.member('alpha'), b = await f.member('bravo'), now = Date.now()
    await notePresence(f.env.DB!, a.id, now); await notePresence(f.env.DB!, b.id, now)
    const profile = await (await f.call('/auth/profile', 'GET', undefined, b.session)).json()
    expect(profile.showOnline).toBe(true)
    expect((await f.call('/auth/profile', 'PATCH', { username: 'bravo', displayName: 'Bravo', bio: '', showOnline: 'no' }, b.session)).status).toBe(400)
    expect((await f.call('/auth/profile', 'PATCH', { username: 'bravo', displayName: 'Bravo', bio: '', showOnline: false }, b.session)).status).toBe(200)
    expect((await (await f.call('/auth/profile', 'GET', undefined, b.session)).json()).showOnline).toBe(false)
    expect(await f.online()).toEqual({ online: 2, members: [{ username: 'alpha', avatar: null }], more: 1 })
    // Saving the profile without the field keeps the choice, and the data export lists it.
    expect((await f.call('/auth/profile', 'PATCH', { username: 'bravo', displayName: 'Bravo again', bio: '' }, b.session)).status).toBe(200)
    expect((await (await f.call('/auth/profile', 'GET', undefined, b.session)).json()).showOnline).toBe(false)
    expect((await (await f.call('/auth/data-export', 'POST', { password }, b.session)).json()).data.onlineList).toEqual([{ shown: 0 }])
    expect((await f.call('/auth/profile', 'PATCH', { username: 'bravo', displayName: 'Bravo', bio: '', showOnline: true }, b.session)).status).toBe(200)
    expect((await f.online()).members.map(member => member.username)).toEqual(['alpha', 'bravo'])
  })

  it('lists at most twelve names, most recently seen first, and counts the rest as more', async () => {
    const f = await fixture(), now = Math.floor(Date.now() / 1000), seen = f.db.prepare('INSERT INTO member_presence(user_id,seen_at) VALUES(?,?)')
    const add = f.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)')
    for (let index = 0; index < 14; index++) { const name = 'member' + String(index).padStart(2, '0'); add.run(name, name, name); seen.run(name, now - index) }
    const body = await f.online()
    expect(body.online).toBe(14)
    expect(body.more).toBe(2)
    expect(body.members.map(member => member.username)).toEqual(Array.from({ length: 12 }, (_, index) => 'member' + String(index).padStart(2, '0')))
  })

  it('keeps one overwritten time per member, written at most every two minutes, and counts each member once a day', async () => {
    const f = await fixture(), a = await f.member('alpha'), start = Date.UTC(2026, 9, 7, 23, 57)
    await notePresence(f.env.DB!, a.id, start)
    await notePresence(f.env.DB!, a.id, start + 60000)
    expect(f.presence(a.id)!.seen_at).toBe(start / 1000)
    await notePresence(f.env.DB!, a.id, start + 120000)
    expect(f.presence(a.id)!.seen_at).toBe(start / 1000 + 120)
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM member_presence').get()!.n).toBe(1)
    expect(f.daily()).toEqual([{ day: '2026-10-07', members: 1 }])
    // The first poll after midnight counts the new day even within two minutes of the last write, and only once.
    await notePresence(f.env.DB!, a.id, start + 180000)
    await notePresence(f.env.DB!, a.id, start + 240000)
    expect(f.daily()).toEqual([{ day: '2026-10-07', members: 1 }, { day: '2026-10-08', members: 1 }])
    // Online means seen within five minutes of the last write, which was the midnight poll.
    expect(f.presence(a.id)!.seen_at).toBe(start / 1000 + 180)
    vi.useFakeTimers({ now: start + 180000 + 299000, toFake: ['Date'] })
    expect((await f.online()).online).toBe(1)
    vi.setSystemTime(start + 180000 + 301000)
    expect(await f.online()).toEqual({ online: 0, members: [], more: 0 })
  })

  it('removes last-seen times after 31 days and with the account, and includes them in the data export', async () => {
    const f = await fixture(), a = await f.member('alpha'), b = await f.member('bravo'), now = Date.now()
    await notePresence(f.env.DB!, a.id, now)
    await notePresence(f.env.DB!, b.id, now - 32 * 86400000)
    await cleanupPresence(f.env.DB!, now)
    expect(f.presence(b.id)).toBeUndefined()
    expect(f.presence(a.id)).toBeDefined()
    expect(f.daily().length).toBeGreaterThan(0)
    const exported = await (await f.call('/auth/data-export', 'POST', { password }, a.session)).json()
    expect(exported.data.lastSeen).toEqual([{ seen_at: new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000', '') }])
    expect((await f.call('/auth/account', 'DELETE', { confirm: 'DELETE', password }, a.session)).status).toBe(200)
    expect(f.presence(a.id)).toBeUndefined()
  })

  it('reports online and active members to administrators as counts', async () => {
    const f = await fixture(), a = await f.member('alpha'), b = await f.member('bravo'), c = await f.member('charlie'), now = Date.now()
    await notePresence(f.env.DB!, a.id, now)
    const seen = f.db.prepare('INSERT INTO member_presence(user_id,seen_at) VALUES(?,?)')
    seen.run(b.id, Math.floor(now / 1000) - 3 * 86400); seen.run(c.id, Math.floor(now / 1000) - 20 * 86400)
    f.db.prepare("UPDATE users SET is_admin=1 WHERE username='alpha'").run()
    const data = await (await f.call('/admin/accounts?days=7', 'GET', undefined, a.session)).json()
    expect(data.totals).toMatchObject({ online: 1, activeDay: 1, activeWeek: 2, activeMonth: 3 })
    const today = new Date(now).toISOString().slice(0, 10)
    expect(data.activeFrom).toBe(today)
    expect(data.daily.at(-1)).toMatchObject({ day: today, active: 1 })
    // Days before counting began are unknown, not zero.
    expect(data.daily[0].active).toBeNull()
    expect(JSON.stringify(data)).not.toMatch(/alpha|bravo|charlie|@/)
  })
})
