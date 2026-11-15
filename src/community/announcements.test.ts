import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { sendActivityDigests } from '../../server/activity-mail'
import { announcementLink } from '../../server/announcements'
import { SUPPORT_URL } from '../config/support'
import { notificationLines } from './notification-text'
import type { BellItem } from './notification-contract'
import { DEVELOPMENT_DISCORD_URL, DISCORD_INVITE_CAMPAIGN } from '../config/development-discord'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotificationList } from './NotificationList'

type Sent = { to: string[]; subject: string; text: string }
const databases: DatabaseSync[] = [], sent: Sent[] = [], password = 'a long original test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: 'synthetic-email' }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = [...sent].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    return { id: String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id), session: login.headers.get('X-Octamod-Session')! }
  }
  const bell = async (session: string) => (await (await server.call('/notifications', 'GET', undefined, session)).json()) as { items: BellItem[]; unread: number }
  const unread = async (session: string) => (await (await server.call('/notifications/unread', 'GET', undefined, session)).json()).unread as number
  const { token: admin } = await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()
  const announce = (body: Record<string, unknown>) => server.call('/admin/announcements', 'POST', body, '', admin)
  return { ...server, member, bell, unread, admin, announce }
}
// Any catalog module will do; the announcement links to its page.
const release = { slug: 'miniverb-update-2026-10-05', title: 'Mini Verb has a new release', body: 'Plain words about what changed and where to find it.', moduleId: 'miniverb' }

describe('operator announcements in the bell', () => {
  it('lets only the operator send, list and remove them', async () => {
    const { call, member, announce, admin } = await fixture(), reader = await member('readerone')
    expect((await call('/admin/announcements', 'POST', release)).status).toBe(403)
    expect((await call('/admin/announcements', 'POST', release, reader.session)).status).toBe(403)
    expect((await call('/admin/announcements', 'GET', undefined, reader.session)).status).toBe(403)
    const created = await announce(release)
    expect(created.status).toBe(201)
    const { id } = await created.json()
    expect((await call('/admin/announcements/' + id, 'DELETE', undefined, reader.session)).status).toBe(403)
    expect(await (await call('/admin/announcements', 'GET', undefined, '', admin)).json()).toMatchObject([{ id, slug: release.slug, title: release.title, reads: 0, audience: 1 }]) // The reader joined before it was sent.
  })

  it('exposes only public announcements to visitors while keeping private activity protected', async () => {
    const { call, member, announce, bell, db } = await fixture(), author = await member('publicauthor'), other = await member('publicreply')
    await announce({ ...release, slug: 'signed-in-note', title: 'Member announcement', visibility: 'signed-in' })
    await announce({ ...release, visibility: 'public' })
    const { id } = await (await call('/forum/threads', 'POST', { title: 'Module settings discussion', body: 'Share your settings.', category: 'modules', moduleId: 'miniverb' }, author.session)).json()
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'A reply for the author.' }, other.session)
    expect((await bell(author.session)).items.map(item => item.kind).sort()).toEqual(['announcement', 'reply'])
    // Public reads also work with stale credentials and never include admin/read metadata.
    const result = await call('/announcements', 'GET', undefined, 'stale-session')
    expect(result.status).toBe(200)
    const publicBell = await result.json() as { items: BellItem[] }
    expect(publicBell.items).toEqual([expect.objectContaining({ kind: 'announcement', title: release.title, excerpt: release.body, seen: true })])
    for (const field of ['slug', 'created_by', 'reads', 'audience', 'user_id']) expect(publicBell.items[0]).not.toHaveProperty(field)
    for (const path of ['/notifications', '/notifications/unread']) expect((await call(path)).status).toBe(401)
    expect((await call('/notifications', 'PATCH', { ids: [publicBell.items[0].id] })).status).toBe(401)
    expect((await call('/announcements', 'PATCH', { ids: [publicBell.items[0].id] })).status).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcement_reads').get()).toEqual({ n: 0 })
  })

  it('includes public history for new members while keeping signed-in history and read state private', async () => {
    const { call, member, announce, bell, unread, db, admin } = await fixture(), early = await member('publicearly')
    db.prepare("UPDATE users SET created_at='1999-01-01 00:00:00' WHERE id=?").run(early.id)
    await announce({ ...release, slug: 'private-history', visibility: 'signed-in' })
    await announce({ ...release, slug: 'public-history', visibility: 'public' })
    db.prepare("UPDATE announcements SET created_at='2000-01-01 00:00:00'").run()
    const late = await member('publiclate')
    expect(await unread(early.session)).toBe(1)
    const laterBell = await bell(late.session)
    expect(laterBell.items).toEqual([]); expect(laterBell.unread).toBe(0)
    expect((await call('/notifications', 'PATCH', {}, late.session)).status).toBe(200)
    expect(await unread(late.session)).toBe(0); expect(await unread(early.session)).toBe(1)
    const mine = await (await call('/announcements/mine', 'GET', undefined, late.session)).json()
    expect(mine.items).toEqual([expect.objectContaining({ title: release.title, seen: false })])
    await call('/announcements/mine', 'PATCH', { ids: [mine.items[0].id] }, late.session)
    expect((await (await call('/announcements/mine', 'GET', undefined, late.session)).json()).items[0].seen).toBe(true)
    const listed = await (await call('/admin/announcements', 'GET', undefined, '', admin)).json() as { visibility: string; audience: number; reads: number }[]
    expect(listed.find(item => item.visibility === 'public')).toMatchObject({ audience: 2, reads: 1 })
    expect(listed.find(item => item.visibility === 'signed-in')).toMatchObject({ audience: 1, reads: 0 })
    const publicItems = await (await call('/announcements')).json()
    expect(publicItems.items).toHaveLength(1)
    expect(publicItems.items[0].seen).toBe(true)
  })

  it('lets only admins change visibility without resending or resetting existing reads', async () => {
    const { call, member, announce, bell, db, admin } = await fixture(), reader = await member('visibilityreader')
    const { id } = await (await announce(release)).json()
    await call('/notifications', 'PATCH', { ids: ['announcement-' + id] }, reader.session)
    const before = db.prepare('SELECT * FROM announcements WHERE id=?').get(id), reads = db.prepare('SELECT * FROM announcement_reads').all()
    expect(before).toHaveProperty('visibility', 'signed-in')
    expect((await (await call('/announcements')).json()).items).toEqual([])
    const path = '/admin/announcements/' + id
    expect((await call(path, 'PATCH', { visibility: 'public' })).status).toBe(403)
    expect((await call(path, 'PATCH', { visibility: 'public' }, reader.session)).status).toBe(403)
    expect((await call(path, 'PATCH', { visibility: 'everyone' }, '', admin)).status).toBe(400)
    expect((await call(path, 'PATCH', { visibility: 'public', body: 'Changed message' }, '', admin)).status).toBe(400)
    expect((await call('/admin/announcements/' + 'f'.repeat(32), 'PATCH', { visibility: 'public' }, '', admin)).status).toBe(404)
    expect((await call(path, 'PATCH', { visibility: 'public' }, '', admin)).status).toBe(200)
    expect((await (await call('/announcements')).json()).items).toHaveLength(1)
    expect(db.prepare('SELECT * FROM announcements WHERE id=?').get(id)).toEqual({ ...before, visibility: 'public' })
    expect(db.prepare('SELECT * FROM announcement_reads').all()).toEqual(reads)
    expect((await bell(reader.session)).items).toEqual([])
    expect((await (await call('/announcements/mine', 'GET', undefined, reader.session)).json()).items[0].seen).toBe(true)
    expect((await call(path, 'PATCH', { visibility: 'signed-in' }, '', admin)).status).toBe(200)
    expect((await (await call('/announcements')).json()).items).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcements').get()).toEqual({ n: 1 })
    expect((await call(path, 'DELETE', undefined, '', admin)).status).toBe(200)
    expect((await (await call('/announcements')).json()).items).toEqual([])
  })

  it('limits the public feed to the newest ten without letting newer signed-in entries displace them', async () => {
    const { call, db } = await fixture()
    const insert = db.prepare('INSERT INTO announcements(id,slug,title,body,created_by,visibility,created_at) VALUES(?,?,?,?,?,?,?)')
    for (let n = 1; n <= 12; n++) insert.run('public-' + n, 'public-' + n, 'Public ' + n, 'A public message.', 'administrator', 'public', '2000-01-' + String(n).padStart(2, '0') + ' 00:00:00')
    insert.run('private-one', 'private-one', 'Member message', 'Private audience.', 'administrator', 'signed-in', '2099-01-01 00:00:00')
    const { items } = await (await call('/announcements')).json() as { items: BellItem[] }
    expect(items.map(item => item.title)).toEqual(Array.from({ length: 10 }, (_, n) => 'Public ' + (12 - n)))
  })

  it('keeps public acknowledgements separate from every bell read action and private to each member', async () => {
    const { call, announce, member, bell, unread, db } = await fixture(), one = await member('cardreader'), two = await member('othercardreader')
    const privateId = 'announcement-' + (await (await announce(release)).json()).id
    const publicId = 'announcement-' + (await (await announce({ ...release, slug: 'public-card', visibility: 'public' })).json()).id
    const mine = async (session: string) => (await (await call('/announcements/mine', 'GET', undefined, session)).json()).items as BellItem[]
    for (const session of ['', 'stale-session']) {
      expect((await call('/announcements/mine', 'GET', undefined, session)).status).toBe(401)
      expect((await call('/announcements/mine', 'PATCH', { ids: [publicId] }, session)).status).toBe(401)
    }
    for (const ids of [undefined, [], ['bad-id'], Array(51).fill(publicId)]) expect((await call('/announcements/mine', 'PATCH', { ids }, one.session)).status).toBe(400)
    expect((await mine(one.session)).map(item => item.id)).toEqual([publicId])
    await call('/notifications', 'PATCH', { ids: [publicId] }, one.session)
    expect((await mine(one.session))[0].seen).toBe(false)
    await call('/announcements/mine', 'PATCH', { ids: [privateId] }, one.session)
    expect(await unread(one.session)).toBe(1)
    await call('/notifications', 'PATCH', {}, one.session)
    expect(await unread(one.session)).toBe(0)
    expect((await mine(one.session))[0].seen).toBe(false)
    await call('/announcements/mine', 'PATCH', { ids: [publicId] }, one.session)
    await call('/announcements/mine', 'PATCH', { ids: [publicId] }, one.session) // Retry is idempotent.
    expect((await mine(one.session))[0].seen).toBe(true)
    expect((await mine(two.session))[0].seen).toBe(false)
    expect(await unread(two.session)).toBe(1)
    expect((await bell(two.session)).items.map(item => item.id)).toEqual([privateId])
    expect(db.prepare('SELECT COUNT(*) AS count FROM announcement_reads WHERE user_id=?').get(one.id)).toEqual({ count: 2 })
  })

  it('upgrades existing manual announcements without making them public or changing read markers', () => {
    const db = new DatabaseSync(':memory:'); databases.push(db)
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES('reader')")
    db.exec(readFileSync(new URL('../../migrations/0031_announcements.sql', import.meta.url), 'utf8'))
    db.exec("INSERT INTO announcements(id,slug,title,body,created_by) VALUES('manual','manual-note','Member note','Preserve this audience.','administrator'),('release','module-release-vector','VECTOR is now available','Public catalog information.','administrator')")
    db.exec("INSERT INTO announcement_reads(user_id,announcement_id) VALUES('reader','manual')")
    const reads = db.prepare('SELECT * FROM announcement_reads').all()
    db.exec(readFileSync(new URL('../../migrations/0057_announcement_visibility.sql', import.meta.url), 'utf8'))
    expect(db.prepare('SELECT id,visibility FROM announcements ORDER BY id').all()).toEqual([{ id: 'manual', visibility: 'signed-in' }, { id: 'release', visibility: 'public' }])
    expect(db.prepare('SELECT * FROM announcement_reads').all()).toEqual(reads)
    expect(() => db.prepare("UPDATE announcements SET visibility='invalid'").run()).toThrow()
  })

  it('keeps the Ko-fi review draft unsent and accepts only the exact configured support destination', async () => {
    const { announce, call } = await fixture()
    const draft = JSON.parse(readFileSync(new URL('../../docs/announcements/kofi-hosting-2026-10-08.draft.json', import.meta.url), 'utf8'))
    expect((await (await call('/announcements')).json()).items).toEqual([])
    expect(draft.url).toBe(SUPPORT_URL)
    expect((await announce(draft)).status).toBe(201)
    expect((await (await call('/announcements')).json()).items).toEqual([expect.objectContaining({ title: draft.title, excerpt: draft.body, url: SUPPORT_URL })])
    for (const url of ['https://ko-fi.com/another-profile', SUPPORT_URL + '/', SUPPORT_URL + '?redirect=elsewhere', SUPPORT_URL + '#other', 'http://ko-fi.com/jannikassfalg', 'https://ko-fi.com.evil.example/jannikassfalg']) {
      expect(() => announcementLink(url)).toThrow()
      expect((await announce({ ...draft, slug: 'bad-kofi-destination', url })).status).toBe(400)
    }
  })

  it('keeps the Discord community draft unsent and valid as the public replacement for the visitor popup', async () => {
    const { announce, call } = await fixture()
    const draft = JSON.parse(readFileSync(new URL('../../docs/announcements/discord-community-2026-10-08.draft.json', import.meta.url), 'utf8'))
    expect((await (await call('/announcements')).json()).items).toEqual([])
    expect(draft).toMatchObject({ url: DEVELOPMENT_DISCORD_URL, visibility: 'public' })
    expect((await announce(draft)).status).toBe(201)
    expect((await (await call('/announcements')).json()).items).toEqual([expect.objectContaining({ title: draft.title, excerpt: draft.body, url: DEVELOPMENT_DISCORD_URL })])
  })

  it('keeps the maintainers call unsent, valid and off the Discord invitation round, which would hide it from members who handled that round', async () => {
    const { announce, call } = await fixture()
    const draft = JSON.parse(readFileSync(new URL('../../docs/announcements/maintainers-wanted-2026-11-15.draft.json', import.meta.url), 'utf8'))
    expect((await (await call('/announcements')).json()).items).toEqual([])
    expect(draft.visibility).toBe('public')
    expect(draft.url).not.toBe(DEVELOPMENT_DISCORD_URL)
    expect((await announce(draft)).status).toBe(201)
    expect((await (await call('/announcements')).json()).items).toEqual([expect.objectContaining({ title: draft.title, excerpt: draft.body, url: draft.url })])
  })

  it('prepares the approved resend with the same copy and link under a fresh unique key', async () => {
    const { announce, call } = await fixture()
    const draft = JSON.parse(readFileSync(new URL('../../docs/announcements/discord-community-2026-10-12.draft.json', import.meta.url), 'utf8'))
    const original = JSON.parse(readFileSync(new URL('../../docs/news/development-discord-announcement.json', import.meta.url), 'utf8'))
    expect(draft).toEqual({ ...original, slug: DISCORD_INVITE_CAMPAIGN, visibility: 'public' })
    expect((await (await call('/announcements')).json()).items).toEqual([])
    expect((await announce(draft)).status).toBe(201)
    expect((await announce(draft)).status).toBe(409)
    expect((await (await call('/announcements')).json()).items).toEqual([expect.objectContaining({ title: original.title, excerpt: original.body, url: DEVELOPMENT_DISCORD_URL })])
  })

  it('counts public cards for everyone, signed in or not, without storing who saw them', async () => {
    const { announce, call, admin, db } = await fixture()
    const publicId = (await (await announce({ ...release, visibility: 'public' })).json()).id as string
    const memberId = (await (await announce({ ...release, slug: 'members-only-note', visibility: 'signed-in' })).json()).id as string
    const count = (event: string, id: string) => call('/usage/count', 'POST', { event, announcementId: 'announcement-' + id })
    for (const event of ['announcement_shown', 'announcement_shown', 'announcement_opened', 'announcement_dismissed']) expect((await count(event, publicId)).status).toBe(200)
    // Bell-only and unknown announcements gain nothing; the response does not reveal which exist.
    expect((await count('announcement_shown', memberId)).status).toBe(200)
    expect((await count('announcement_shown', 'f'.repeat(32))).status).toBe(200)
    for (const bad of [{ event: 'announcement_clicked', announcementId: 'announcement-' + publicId }, { event: 'announcement_shown', announcementId: publicId }, { event: 'announcement_shown', announcementId: 'announcement-' + publicId, userId: 'someone' }, { event: 'page_view', announcementId: 'announcement-' + publicId }])
      expect((await call('/usage/count', 'POST', bad)).status, JSON.stringify(bad)).toBe(400)
    expect(db.prepare('SELECT * FROM announcement_counts').all()).toEqual([{ announcement_id: publicId, shown: 2, opened: 1, dismissed: 1 }])
    const listed = await (await call('/admin/announcements', 'GET', undefined, '', admin)).json() as Array<Record<string, unknown>>
    expect(listed.find(item => item.id === publicId)).toMatchObject({ shown: 2, opened: 1, dismissed: 1, counts_started: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })
    expect(listed.find(item => item.id === memberId)).toMatchObject({ shown: 0, opened: 0, dismissed: 0 })
    expect((await call('/admin/announcements/' + publicId, 'DELETE', undefined, '', admin)).status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcement_counts').get()).toEqual({ n: 0 })
  })

  it('refuses what a bell entry may not contain', async () => {
    const { announce } = await fixture()
    for (const bad of [
      { ...release, visibility: 'members' }, { ...release, visibility: null }, { ...release, visibility: true },
      { ...release, slug: 'Bad Key' }, { ...release, slug: 'ab' }, { ...release, title: 'no' }, { ...release, title: 'x'.repeat(121) },
      { ...release, body: '' }, { ...release, body: 'x'.repeat(401) }, { ...release, body: 'bell\u0007' }, { ...release, moduleId: 'not-a-module' },
      { ...release, url: 'https://evil.example/phish' }, { ...release, url: 'javascript:alert(1)' }, { ...release, url: 'https://modwerk.app.evil.example/' }, { ...release, url: '//evil.example' },
    ]) expect((await announce(bad)).status, JSON.stringify(bad).slice(0, 80)).toBe(400)
    expect((await announce({ ...release, url: '#module/miniverb' })).status).toBe(201)
    expect((await announce({ ...release, slug: 'second-one', url: 'https://modwerk.app/#library' })).status).toBe(201)
    expect(announcementLink(undefined)).toBeNull(); expect(announcementLink('')).toBeNull()
  })

  it('sends a development Discord invite once and opens it as an external bell link', async () => {
    const { member, bell, unread, announce, call, db } = await fixture(), reader = await member('discordreader')
    const invitation = { slug: 'development-discord-2026-10-07', title: 'Join the development Discord', body: 'Ask questions about modules and share what you are building.', url: DEVELOPMENT_DISCORD_URL }
    expect((await announce(invitation)).status).toBe(201)
    expect((await announce(invitation)).status).toBe(409)
    const items = await bell(reader.session)
    expect(items.unread).toBe(1)
    const lines = notificationLines(items.items)
    expect(lines[0].href).toBe(DEVELOPMENT_DISCORD_URL)
    expect(renderToStaticMarkup(createElement(NotificationList, { lines, onOpen() {} }))).toContain('href="' + DEVELOPMENT_DISCORD_URL + '" target="_blank" rel="noreferrer"')
    expect((await call('/notifications', 'PATCH', { ids: lines[0].ids }, reader.session)).status).toBe(200)
    expect(await unread(reader.session)).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()).toEqual({ count: 0 })
    expect(announcementLink(DEVELOPMENT_DISCORD_URL)).toBe(DEVELOPMENT_DISCORD_URL)
    for (const url of ['https://discord.gg/another-invite', DEVELOPMENT_DISCORD_URL + '?redirect=evil', DEVELOPMENT_DISCORD_URL + '/extra', 'http://discord.gg/vzfAdMBtn5', 'https://discord.gg.evil.example/vzfAdMBtn5']) expect(() => announcementLink(url)).toThrow()
  })

  it('refreshes the existing Discord bell link without resetting reads or sending again', async () => {
    const { member, bell, unread, announce, call, db } = await fixture()
    const reader = await member('readinvite'), unreadMember = await member('unreadinvite')
    const invitation = { slug: 'development-discord-2026-10-07', title: 'Join the development Discord', body: 'Ask questions about modules.', url: DEVELOPMENT_DISCORD_URL }
    const { id } = await (await announce(invitation)).json()
    db.prepare('UPDATE announcements SET url=? WHERE id=?').run('https://discord.gg/previous-invite', id)
    await call('/notifications', 'PATCH', { ids: ['announcement-' + id] }, reader.session)
    const before = db.prepare('SELECT * FROM announcements WHERE id=?').get(id)
    const reads = db.prepare('SELECT * FROM announcement_reads').all()
    const migration = readFileSync(new URL('../../migrations/0056_refresh_development_discord.sql', import.meta.url), 'utf8')
    db.exec(migration); db.exec(migration)
    expect(db.prepare('SELECT * FROM announcements WHERE id=?').get(id)).toEqual({ ...before, url: DEVELOPMENT_DISCORD_URL })
    expect(db.prepare('SELECT * FROM announcement_reads').all()).toEqual(reads)
    expect((await bell(reader.session)).items[0]).toMatchObject({ seen: true, url: DEVELOPMENT_DISCORD_URL })
    expect(await unread(reader.session)).toBe(0)
    expect(await unread(unreadMember.session)).toBe(1)
    expect((await announce(invitation)).status).toBe(409)
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcements').get()).toEqual({ n: 1 })
  })

  it('reaches every member, with their own read state and no second send of the same key', async () => {
    const { member, bell, unread, announce, call } = await fixture(), one = await member('readerone'), two = await member('readertwo')
    expect((await announce(release)).status).toBe(201)
    expect((await announce(release)).status).toBe(409)
    expect(await unread(one.session)).toBe(1); expect(await unread(two.session)).toBe(1)
    const first = await bell(one.session)
    expect(first.unread).toBe(1)
    expect(first.items).toEqual([expect.objectContaining({ kind: 'announcement', seen: false, actorOfficial: true, title: release.title, excerpt: release.body, module_id: 'miniverb', url: null })])
    // One member reading it changes nothing for the other.
    expect((await call('/notifications', 'PATCH', { ids: [first.items[0].id] }, one.session)).status).toBe(200)
    expect(await unread(one.session)).toBe(0); expect(await unread(two.session)).toBe(1)
    expect((await bell(one.session)).items[0].seen).toBe(true)
    expect((await call('/notifications', 'PATCH', {}, two.session)).status).toBe(200)
    expect(await unread(two.session)).toBe(0)
  })

  it('shows announcements beside activity, newest first, and marks either kind without touching the other', async () => {
    const { member, bell, unread, announce, call } = await fixture(), author = await member('authorone'), other = await member('othertwo')
    const { id } = await (await call('/forum/threads', 'POST', { title: 'How do you use Mini Verb?', body: 'Share your settings.', category: 'modules', moduleId: 'miniverb' }, author.session)).json()
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Short decay.' }, other.session)
    await announce(release)
    const items = await bell(author.session)
    expect(items.unread).toBe(2)
    expect(items.items.map(item => item.kind).sort()).toEqual(['announcement', 'reply'])
    const note = items.items.find(item => item.kind === 'announcement')!, reply = items.items.find(item => item.kind === 'reply')!
    expect((await call('/notifications', 'PATCH', { ids: [reply.id] }, author.session)).status).toBe(200)
    expect(await unread(author.session)).toBe(1)
    expect((await call('/notifications', 'PATCH', { ids: ['announcement-' + 'f'.repeat(32), note.id] }, author.session)).status).toBe(200)
    expect(await unread(author.session)).toBe(0)
    expect((await call('/notifications', 'PATCH', { ids: [note.id] }, other.session)).status).toBe(200)
    expect(await unread(other.session)).toBe(0)
  })

  it('does not show history to a member who joins later, and a removal takes it out of every bell', async () => {
    const { member, bell, unread, announce, call, db, admin } = await fixture(), early = await member('earlyone')
    const { id } = await (await announce(release)).json()
    // Sent a day before the late member's account exists.
    db.prepare("UPDATE announcements SET created_at='2000-01-01 00:00:00' WHERE id=?").run(id)
    const late = await member('latetwo')
    expect(await unread(late.session)).toBe(0); expect((await bell(late.session)).items).toEqual([])
    db.prepare("UPDATE announcements SET created_at=CURRENT_TIMESTAMP WHERE id=?").run(id)
    expect(await unread(late.session)).toBe(1)
    expect((await call('/notifications', 'PATCH', {}, early.session)).status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcement_reads').get()).toEqual({ n: 1 })
    expect((await call('/admin/announcements/' + id, 'DELETE', undefined, '', admin)).status).toBe(200)
    expect((await call('/admin/announcements/' + id, 'DELETE', undefined, '', admin)).status).toBe(404)
    expect(await unread(late.session)).toBe(0); expect((await bell(early.session)).items).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM announcement_reads').get()).toEqual({ n: 0 })
  })

  it('is never mailed, and no activity entry is made for it', async () => {
    const { member, announce, db } = await fixture()
    await member('readerone'); await member('readertwo')
    await announce(release)
    expect(db.prepare('SELECT COUNT(*) AS n FROM notifications').get()).toEqual({ n: 0 })
    const server = await testServer(); databases.push(server.db)
    sent.length = 0
    await sendActivityDigests(server.env, server.env.DB!, new Date(Date.now() + 3 * 60 * 60 * 1000))
    expect(sent).toEqual([])
  })

  it('renders as an official line that opens its link, or the module page, or the library', () => {
    const base = { seen: false, created_at: '2026-10-05 12:00:00', thread_id: null, post_id: null, actor: null, actorOfficial: true, rating: null, issue_id: null, github_actor: null, kind: 'announcement' as const, title: 'Mini Verb has a new release', excerpt: 'Plain words about what changed.' }
    const lines = notificationLines([
      { ...base, id: 'announcement-1', module_id: 'miniverb', url: null },
      { ...base, id: 'announcement-2', module_id: null, url: 'https://modwerk.app/#library' },
      { ...base, id: 'announcement-3', module_id: null, url: null, title: null },
    ])
    expect(lines.map(line => line.text)).toEqual(['Mini Verb has a new release', 'Mini Verb has a new release', 'News'])
    expect(lines.map(line => line.href)).toEqual(['#module/miniverb', 'https://modwerk.app/#library', '#library'])
    expect(lines[0].excerpt).toBe('Plain words about what changed.')
  })
})
