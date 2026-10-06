import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { sendActivityDigests } from '../../server/activity-mail'
import { handleCommunity } from '../../server/transport'
import { mentionedUsernames } from '../../server/notifications'
import type { NotificationItem } from './notification-contract'
import { notificationLines } from './notification-text'

type Sent = { to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> }
const databases: DatabaseSync[] = [], sent: Sent[] = [], password = 'a long original test passphrase'
let accept = true
beforeEach(() => { sent.length = 0; accept = true; vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { expect(url).toBe('https://api.resend.com/emails'); sent.push(JSON.parse(String(options.body))); return accept ? Response.json({ id: crypto.randomUUID() }) : new Response('{}', { status: 500 }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
const later = (minutes: number) => new Date(Date.now() + minutes * 60000)

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = [...sent].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    return { email, id, username, session: login.headers.get('X-Octamod-Session')! }
  }
  const items = async (session: string) => (await (await server.call('/notifications', 'GET', undefined, session)).json()) as { items: NotificationItem[]; unread: number }
  const digests = async (minutes = 15) => { sent.length = 0; return sendActivityDigests(server.env, server.env.DB!, later(minutes)) }
  return { ...server, member, items, digests }
}
const thread = { title: 'How do you use Mini Verb?', body: 'Share your settings.', category: 'modules', moduleId: 'miniverb' }

describe('activity notifications', () => {
  it('collects replies, mentions and likes in the bell, privately and without double notifying', async () => {
    const { call, member, items } = await fixture(), author = await member('authorone'), other = await member('othertwo'), third = await member('thirdone')
    const { id } = await (await call('/forum/threads', 'POST', thread, author.session)).json()
    expect((await call('/forum/threads/' + id + '/follow', 'POST', { enabled: true }, third.session)).status).toBe(200)
    expect((await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Try a short decay, @thirdone and @nobodyhere.' }, other.session)).status).toBe(201)
    // The mentioned follower gets one mention, not a reply as well; the author gets the reply.
    expect((await items(third.session)).items.map(item => item.kind)).toEqual(['mention'])
    const own = await items(author.session)
    expect(own.unread).toBe(1); expect(own.items[0]).toMatchObject({ kind: 'reply', actor: 'othertwo', title: thread.title, thread_id: id, seen: false })
    expect(own.items[0].excerpt).toContain('short decay')
    const postId = (await (await call('/forum/threads/' + id)).json()).posts[0].id
    for (let i = 0; i < 2; i++) await call('/forum/posts/' + postId + '/react', 'POST', { liked: true }, other.session)
    expect((await items(author.session)).items.filter(item => item.kind === 'post_like')).toHaveLength(1)
    // Unliking before the author sees it withdraws the notification.
    await call('/forum/posts/' + postId + '/react', 'POST', { liked: false }, other.session)
    expect((await items(author.session)).items.map(item => item.kind)).toEqual(['reply'])
    await call('/forum/posts/' + postId + '/react', 'POST', { liked: true }, third.session)
    expect((await (await call('/notifications/unread', 'GET', undefined, author.session)).json()).unread).toBe(2)
    const reply = (await items(author.session)).items.find(item => item.kind === 'reply')!
    expect((await call('/notifications', 'PATCH', { ids: [reply.id] }, other.session)).status).toBe(200)
    expect((await items(author.session)).unread).toBe(2)
    expect((await call('/notifications', 'PATCH', { ids: [reply.id] }, author.session)).status).toBe(200)
    expect((await items(author.session)).unread).toBe(1)
    expect((await call('/notifications', 'PATCH', {}, author.session)).status).toBe(200)
    expect((await items(author.session)).unread).toBe(0)
    expect((await call('/notifications')).status).toBe(401)
    expect((await call('/notifications', 'PATCH', { ids: 'all' }, author.session)).status).toBe(400)
  })

  it('links a reply notification to the thread page that holds the reply', async () => {
    const { call, member, items, db } = await fixture(), author = await member('pageauthor'), other = await member('pagereplier')
    const { id } = await (await call('/forum/threads', 'POST', thread, author.session)).json()
    const authorId = String(db.prepare('SELECT user_id FROM forum_posts WHERE thread_id=?').get(id)!.user_id)
    for (let i = 0; i < 30; i++) db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES(?,?,?,?)').run('filler-' + i, id, authorId, 'Filler ' + i)
    expect((await call('/forum/threads/' + id + '/replies', 'POST', { body: 'A late reply' }, other.session)).status).toBe(201)
    const [reply] = (await items(author.session)).items
    expect(reply).toMatchObject({ kind: 'reply', post_page: 1 })
    expect(notificationLines([reply])[0].href).toBe('#forum/thread/' + id + '?post=' + reply.post_id + '&page=1')
  })
  it('caps mentions and ignores emails, paths and doubled @', () => {
    expect(mentionedUsernames('@Alice and @alice, mail bob@example.test, path /@carol, @@dave, @ab')).toEqual(['alice'])
    expect(mentionedUsernames(Array.from({ length: 15 }, (_, index) => '@member' + index).join(' '))).toHaveLength(10)
  })

  it('hides notifications whose content an administrator removed', async () => {
    const { call, member, items } = await fixture(), author = await member('authorone'), other = await member('othertwo')
    const { id } = await (await call('/forum/threads', 'POST', thread, author.session)).json()
    const { id: replyId } = await (await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Spam' }, other.session)).json()
    const { token: admin } = await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()
    expect((await call('/admin/forum/posts/' + replyId, 'PATCH', { action: 'hidden', value: true, reason: 'Spam' }, '', admin)).status).toBe(200)
    expect((await items(author.session)).items).toEqual([])
  })

  it('delivers module comments, ratings and likes to the maintainer through their linked GitHub sign-in', async () => {
    const { call, db, member, items } = await fixture(), maintainer = await member('maintainer'), fan = await member('fanone')
    // A claimed GitHub developer identity and the member's GitHub social sign-in share the GitHub account ID.
    const developerId = crypto.randomUUID(), author = (await import('./modules')).communityModule('miniverb')!.author
    db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(developerId, '@' + author, '4242', author)
    db.prepare('INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES(?,?,?)').run('miniverb', developerId, author)
    db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(?,?,'github',?,?,?)").run(crypto.randomUUID(), '4242', maintainer.id, new Date().toISOString(), new Date().toISOString())
    expect((await call('/modules/miniverb/comments', 'POST', { body: 'Lovely on pads.' }, fan.session)).status).toBe(200)
    expect((await call('/modules/miniverb/rating', 'POST', { value: 4 }, fan.session)).status).toBe(200)
    expect((await call('/modules/miniverb/rating', 'POST', { value: 5 }, fan.session)).status).toBe(200)
    expect((await call('/modules/miniverb/like', 'POST', { liked: true }, fan.session)).status).toBe(200)
    const listed = (await items(maintainer.session)).items
    expect(listed.map(item => item.kind).sort()).toEqual(['module_like', 'module_rating', 'reply'])
    expect(listed.find(item => item.kind === 'reply')).toMatchObject({ module_id: 'miniverb', actor: 'fanone', excerpt: 'Lovely on pads.' })
    expect(listed.find(item => item.kind === 'module_rating')!.rating).toBe(5)
    // The maintainer's own activity does not notify them, and removed comments take their notification along.
    expect((await call('/modules/miniverb/comments', 'POST', { body: 'Thanks!' }, maintainer.session)).status).toBe(200)
    expect((await items(maintainer.session)).items).toHaveLength(3)
    const comment = (await (await call('/modules/miniverb', 'GET', undefined, fan.session)).json()).comments.find((item: { canDelete: boolean }) => item.canDelete)
    expect((await call('/comments/' + comment.id, 'DELETE', undefined, fan.session)).status).toBe(200)
    expect((await items(maintainer.session)).items.map(item => item.kind).sort()).toEqual(['module_like', 'module_rating'])
    expect((await items(fan.session)).items).toMatchObject([{kind:'reply',thread_id:'module-miniverb',excerpt:'Thanks!'}])
  })

  it('emails one escaped digest per interval, skipping what was read, turned off or hidden', async () => {
    const { call, db, member, digests } = await fixture(), author = await member('authorone'), other = await member('othertwo')
    const { id } = await (await call('/forum/threads', 'POST', { ...thread, title: 'Reverb <script>alert(1)</script>' }, author.session)).json()
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Try <b>short</b> decay.' }, other.session)
    // Too fresh: a burst gets a few minutes to settle.
    expect((await digests(1)).sent).toBe(0)
    expect((await digests()).sent).toBe(1)
    const [mail] = sent
    expect(mail.to).toEqual([author.email]); expect(mail.subject).toBe('@othertwo replied in “Reverb <script>alert(1)</script>”')
    expect(mail.html).not.toContain('<script>'); expect(mail.html).toContain('&lt;script&gt;'); expect(mail.html).not.toContain('<b>short')
    expect(mail.text).toContain('https://octamod.test/#forum/thread/' + id)
    expect(mail.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(mail.headers!['List-Unsubscribe']).toMatch(/^<https:\/\/api\.example\.test\/api\/notifications\/unsubscribe\?token=/)
    expect(JSON.stringify(mail)).not.toContain(other.email)
    expect(db.prepare("SELECT accepted FROM account_mail_daily WHERE purpose='activity'").get()).toEqual({ accepted: 1 })
    // Nothing new, then something new inside the 6-hour window: no second email until the window passes.
    expect((await digests()).sent).toBe(0)
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Another idea.' }, other.session)
    expect((await digests(60)).sent).toBe(0)
    expect((await digests(60 * 7)).sent).toBe(1)
    expect(sent[0].text).toContain('Another idea.'); expect(sent[0].text).not.toContain('short')
    // Read in the bell first: never emailed.
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Seen already.' }, other.session)
    await call('/notifications', 'PATCH', {}, author.session)
    expect((await digests(60 * 14)).sent).toBe(0)
    // A turned-off topic is settled without an email.
    expect((await call('/notifications/preferences', 'PATCH', { replies: false }, author.session)).status).toBe(200)
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Muted topic.' }, other.session)
    expect((await digests(60 * 21)).sent).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()).toEqual({ count: 0 })
  })

  it('stops at the activity quota and retries failed deliveries later', async () => {
    const { call, db, env, member, digests } = await fixture(), author = await member('authorone'), other = await member('othertwo')
    const { id } = await (await call('/forum/threads', 'POST', thread, author.session)).json()
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Hello.' }, other.session)
    accept = false
    expect((await digests()).sent).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()).toEqual({ count: 1 })
    env.ACTIVITY_MAIL_DAILY_LIMIT = '1'
    accept = true
    expect((await digests()).sent).toBe(0)
    expect(sent).toHaveLength(0)
    expect(db.prepare("SELECT failed,limited FROM account_mail_daily WHERE purpose='activity'").get()).toEqual({ failed: 1, limited: 1 })
  })

  it('defaults to email on and unsubscribes with the signed one-click link, without a session or Origin', async () => {
    const { call, env, member, digests } = await fixture(), author = await member('authorone'), other = await member('othertwo')
    expect(await (await call('/notifications/preferences', 'GET', undefined, author.session)).json()).toEqual({ emailEnabled: true, frequency: 'hours', replies: true, likes: true, modules: true, bugs: true, updates: true, messages: true, emailAvailable: true })
    expect((await call('/notifications/preferences', 'PATCH', { frequency: 'weekly' }, author.session)).status).toBe(400)
    expect((await call('/notifications/preferences', 'PATCH', { likes: 'no' }, author.session)).status).toBe(400)
    const { id } = await (await call('/forum/threads', 'POST', thread, author.session)).json()
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Hello.' }, other.session)
    await digests()
    const oneClick = sent[0].headers!['List-Unsubscribe'].slice(1, -1), page = sent[0].text.match(/#account\/unsubscribe\/([^\s]+)/)![1]
    expect(decodeURIComponent(new URL(oneClick).searchParams.get('token')!)).toBe(page)
    expect((await call('/notifications/unsubscribe', 'POST', { token: page.slice(0, -1) + (page.endsWith('0') ? '1' : '0') })).status).toBe(400)
    const mailClient = await handleCommunity(new Request(oneClick, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), env)
    expect(mailClient.status).toBe(200)
    expect((await (await call('/notifications/preferences', 'GET', undefined, author.session)).json()).emailEnabled).toBe(false)
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Again.' }, other.session)
    expect((await digests(60 * 7)).sent).toBe(0)
    // The bell keeps working.
    expect((await (await call('/notifications/unread', 'GET', undefined, author.session)).json()).unread).toBe(2)
  })
})
