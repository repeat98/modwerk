import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { notificationLines } from './notification-text'
import type { NotificationItem } from './notification-contract'

const databases: DatabaseSync[] = [], sent: { to: string[]; text: string }[] = [], password = 'a long original test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

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
  const admin = async () => (await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
  return { ...server, member, admin }
}
type Message = { body: string; mine: boolean; hidden: boolean }

describe('direct messages', () => {
  it('carries a conversation between two members with unread counts, one bell entry and read state', async () => {
    const f = await fixture(), a = await f.member('alpha'), b = await f.member('bravo')
    expect((await f.call('/forum/messages')).status).toBe(401)
    expect((await f.call('/forum/messages/nobody', 'POST', { body: 'Hi' }, a.session)).status).toBe(404)
    expect((await f.call('/forum/messages/alpha', 'POST', { body: 'Hi me' }, a.session)).status).toBe(404)
    expect((await f.call('/forum/messages/bravo', 'POST', { body: '' }, a.session)).status).toBe(400)
    expect((await f.call('/forum/messages/bravo', 'POST', { body: 'Hello Bravo' }, a.session)).status).toBe(201)
    expect((await f.call('/forum/messages/bravo', 'POST', { body: 'Second line' }, a.session)).status).toBe(201)
    const inbox = await (await f.call('/forum/messages', 'GET', undefined, b.session)).json()
    expect(inbox.enabled).toBe(true); expect(inbox.conversations).toHaveLength(1)
    expect(inbox.conversations[0]).toMatchObject({ username: 'alpha', unread: 2, excerpt: 'Second line', mine: 0 })
    expect(JSON.stringify(inbox)).not.toMatch(/user_id|email|pair_key/)
    expect((await (await f.call('/forum/messages', 'GET', undefined, a.session)).json()).conversations[0]).toMatchObject({ username: 'bravo', unread: 0, mine: 1 })
    // Two messages make one bell entry, which points at the conversation.
    const bell = await (await f.call('/notifications', 'GET', undefined, b.session)).json() as { items: NotificationItem[]; unread: number }
    expect(bell.items.filter(item => item.kind === 'message')).toHaveLength(1); expect(bell.unread).toBe(1)
    const line = notificationLines(bell.items)[0]
    expect(line.text).toBe('@alpha sent you a message'); expect(line.href).toBe('#forum/messages/alpha'); expect(line.excerpt).toBe('Hello Bravo')
    expect((await (await f.call('/notifications', 'GET', undefined, a.session)).json()).items).toHaveLength(0)
    // Opening the conversation reads it.
    const view = await (await f.call('/forum/messages/alpha', 'GET', undefined, b.session)).json()
    expect(view.member).toMatchObject({ username: 'alpha' }); expect(view.canSend).toBe(true)
    expect(view.messages.map((item: Message) => [item.body, item.mine])).toEqual([['Hello Bravo', false], ['Second line', false]])
    expect((await (await f.call('/forum/messages', 'GET', undefined, b.session)).json()).conversations[0].unread).toBe(0)
    expect((await (await f.call('/notifications/unread', 'GET', undefined, b.session)).json()).unread).toBe(0)
    // The reply notifies the first sender and shows as theirs on the other side.
    expect((await f.call('/forum/messages/alpha', 'POST', { body: 'Hi Alpha' }, b.session)).status).toBe(201)
    expect((await (await f.call('/notifications', 'GET', undefined, a.session)).json()).items[0]).toMatchObject({ kind: 'message', actor: 'bravo' })
    expect((await (await f.call('/forum/messages/bravo', 'GET', undefined, a.session)).json()).messages.at(-1)).toMatchObject({ body: 'Hi Alpha', mine: false })
    expect(await (await f.call('/notifications/preferences', 'GET', undefined, a.session)).json()).toMatchObject({ messages: true })
  })
  it('respects the off switch and blocks, keeps conversations private until reported, and lets the administrator act on reports', async () => {
    const f = await fixture(), a = await f.member('sender'), b = await f.member('quiet'), key = await f.admin()
    expect((await f.call('/forum/messages/settings', 'PATCH', { enabled: false }, b.session)).status).toBe(200)
    expect((await f.call('/forum/messages/quiet', 'POST', { body: 'Hello?' }, a.session)).status).toBe(403)
    expect((await (await f.call('/forum/messages/quiet', 'GET', undefined, a.session)).json()).canSend).toBe(false)
    expect((await f.call('/forum/messages/settings', 'PATCH', { enabled: true }, b.session)).status).toBe(200)
    expect((await f.call('/forum/messages/quiet', 'POST', { body: 'Hello again' }, a.session)).status).toBe(201)
    // Blocking stops the other side without telling them why.
    expect((await f.call('/forum/messages/sender/block', 'POST', { blocked: true }, b.session)).status).toBe(200)
    expect(await (await f.call('/forum/messages/quiet', 'POST', { body: 'Still there?' }, a.session)).json()).toMatchObject({ error: 'This member is not accepting messages.' })
    expect(await (await f.call('/forum/messages/sender', 'GET', undefined, b.session)).json()).toMatchObject({ blocked: true, canSend: false })
    expect((await f.call('/forum/messages/sender', 'POST', { body: 'No' }, b.session)).status).toBe(403)
    expect((await f.call('/forum/messages/sender/block', 'POST', { blocked: false }, b.session)).status).toBe(200)
    expect((await f.call('/forum/messages/quiet', 'POST', { body: 'Thanks' }, a.session)).status).toBe(201)
    // Nothing is readable by the administrator until a member reports the conversation.
    const conversationId = String(f.db.prepare('SELECT id FROM conversations').get()!.id)
    expect((await f.call('/admin/forum/messages/' + conversationId, 'GET', undefined, '', key)).status).toBe(404)
    expect((await f.call('/forum/messages/sender/report', 'POST', { reason: 'Unwanted messages' }, b.session)).status).toBe(201)
    const reports = await (await f.call('/admin/forum/reports', 'GET', undefined, '', key)).json() as { id: string; kind: string; username: string; body: string; post_id: string; thread_id: string }[]
    const report = reports.find(item => item.kind === 'message')!
    expect(report).toMatchObject({ username: 'sender', body: 'Thanks', thread_id: conversationId })
    const transcript = await (await f.call('/admin/forum/messages/' + conversationId, 'GET', undefined, '', key)).json() as { username: string; body: string }[]
    expect(transcript.map(item => item.username + ': ' + item.body)).toEqual(['sender: Hello again', 'sender: Thanks'])
    expect((await f.call('/admin/forum/messages/' + report.post_id, 'PATCH', { action: 'hidden', value: true, reason: 'Hide it' }, '', key)).status).toBe(200)
    expect((await (await f.call('/forum/messages/sender', 'GET', undefined, b.session)).json()).messages.at(-1)).toMatchObject({ hidden: true, body: '' })
    expect((await f.call('/admin/forum/message-reports/' + report.id, 'PATCH', { action: 'resolved', value: true, reason: 'Reviewed' }, '', key)).status).toBe(200)
    // The export holds only the member's own words; deleting the account removes them.
    const exported = await (await f.call('/auth/data-export', 'POST', { password }, a.session)).json()
    expect(exported.data.messagesSent.map((item: { body: string }) => item.body)).toEqual(['Hello again', 'Thanks'])
    expect(exported.data.conversations).toHaveLength(1)
    expect(JSON.stringify(exported)).not.toContain('Unwanted messages')
    expect((await (await f.call('/auth/data-export', 'POST', { password }, b.session)).json()).data.messageReports).toHaveLength(1)
    expect((await f.call('/auth/account', 'DELETE', { confirm: 'DELETE', password }, a.session)).status).toBe(200)
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id=?').get(a.id)!.n).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM conversation_members WHERE user_id=?').get(a.id)!.n).toBe(0)
    expect((await (await f.call('/forum/messages', 'GET', undefined, b.session)).json()).conversations).toEqual([])
  })
})
