import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { digest } from '../../server/security'
import { sendNewsMail } from '../../server/news-mail'
import { NEWS_EMAIL_VERSION, renderNewsEmail } from '../../server/news-email-template'
import worker from '../../worker'

type Sent = { to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> }
const databases: DatabaseSync[] = [], messages: Sent[] = [], keys: string[] = [], password = 'a long original test passphrase'
let provider: () => Promise<Response>
beforeEach(() => {
  messages.length = 0; keys.length = 0
  provider = async () => Response.json({ id: crypto.randomUUID() })
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    // The hourly run also polls the site's release inventory; a 404 there means "nothing published yet".
    if (url !== 'https://api.resend.com/emails') return new Response('', { status: 404 })
    messages.push(JSON.parse(String(options.body)))
    keys.push(new Headers(options.headers).get('Idempotency-Key')!)
    return provider()
  }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  async function member(username: string, newsletter = true, verify = true) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password, newsletter })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    if (!verify) return { id, email, session: '' }
    const token = [...messages].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    return { id, email, session: login.headers.get('X-Octamod-Session')! }
  }
  const { token: admin } = await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()
  const news = async (body: Record<string, unknown>) => (await server.call('/admin/news', 'POST', body, '', admin)).json() as Promise<{ id: string }>
  const overview = async () => (await server.call('/admin/news', 'GET', undefined, '', admin)).json() as Promise<{ optIns: number; dailyLimit: number; testAvailable: boolean; campaigns: Record<string, unknown>[] }>
  const act = (id: string, action: string) => server.call('/admin/news/' + id + '/' + action, 'POST', {}, '', admin)
  const delivery = (id: string, memberId: string) => server.db.prepare('SELECT status,attempts,idempotency_key FROM news_deliveries WHERE campaign_id=? AND member_id=?').get(id, memberId) as { status: string; attempts: number; idempotency_key: string } | undefined
  const run = () => { messages.length = 0; keys.length = 0; return sendNewsMail(server.env, server.env.DB!) }
  return { ...server, member, admin, news, overview, act, delivery, run }
}
const campaign = { subject: 'What landed on Modwerk in October', body: 'Hi,\n\n## New modules\n\n- [Mini Verb](https://modwerk.app/#module/miniverb) — new\n\nSee you around,\nJannik' }

describe('news mail campaigns', () => {
  it('lets only administrators compose news and counts the members whose consent is current', async () => {
    const { call, member, news, overview, admin } = await fixture()
    const reader = await member('readerone'), other = await member('othertwo', false)
    await member('unverified', true, false)
    expect((await call('/admin/news', 'GET', undefined, reader.session)).status).toBe(403)
    expect((await call('/admin/news', 'POST', campaign, other.session)).status).toBe(403)
    expect((await call('/admin/news', 'GET')).status).toBe(403)
    expect((await overview()).optIns).toBe(1)
    expect((await call('/admin/news', 'POST', { ...campaign, subject: 'no' }, '', admin)).status).toBe(400)
    expect((await call('/admin/news', 'POST', { ...campaign, body: 'bad\u0007' }, '', admin)).status).toBe(400)
    const { id } = await news(campaign)
    expect(id).toMatch(/^[a-f0-9]{32}$/)
    expect((await call('/admin/news/' + id, 'PATCH', { ...campaign, subject: 'Edited subject' }, '', admin)).status).toBe(200)
    const listed = await overview()
    expect(listed.campaigns).toMatchObject([{ id, subject: 'Edited subject', body: campaign.body, status: 'draft', recipient_count: 0, sent: 0, queued: 0, template_version: NEWS_EMAIL_VERSION }])
    expect(JSON.stringify(listed)).not.toContain('@example.test')
    expect(listed.testAvailable).toBe(false)
    expect((await call('/admin/news/' + id, 'DELETE', undefined, '', admin)).status).toBe(200)
    expect((await overview()).campaigns).toEqual([])
  })

  it('sends a queued campaign once per consenting member, rechecking consent at send time', async () => {
    const { call, member, news, act, delivery, run, db, env, overview, admin } = await fixture()
    const first = await member('firstone'), second = await member('secondtwo'), declined = await member('declined', false), suspended = await member('suspended'), withdrawn = await member('withdrawn')
    const { id } = await news(campaign)
    expect(await (await act(id, 'queue')).json()).toEqual({ ok: true, recipients: 4 })
    expect((await act(id, 'queue')).status).toBe(409)
    expect((await call('/admin/news/' + id, 'PATCH', campaign, '', admin)).status).toBe(409)
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(suspended.id)
    expect((await call('/auth/news', 'PATCH', { enabled: false }, withdrawn.session)).status).toBe(200)
    expect(await run()).toEqual({ sent: 2, queued: 0 })
    expect(messages.map(message => message.to[0]).sort()).toEqual([first.email, second.email].sort())
    expect(delivery(id, declined.id)).toBeUndefined()
    expect(delivery(id, suspended.id)).toMatchObject({ status: 'skipped', attempts: 0 })
    expect(delivery(id, withdrawn.id)).toMatchObject({ status: 'skipped' })
    expect(delivery(id, first.id)).toMatchObject({ status: 'sent', attempts: 1, idempotency_key: 'news-' + await digest(id + ':' + first.id) })
    expect(keys.sort()).toEqual([delivery(id, first.id)!.idempotency_key, delivery(id, second.id)!.idempotency_key].sort())
    const message = messages.find(item => item.to[0] === first.email)!
    expect(message.subject).toBe(campaign.subject)
    expect(message.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(message.headers!['List-Unsubscribe']).toMatch(/^<https:\/\/api\.example\.test\/api\/news\/unsubscribe\?token=[^>]+>$/)
    expect(message.html).toContain('<a href="https://modwerk.app/#module/miniverb"')
    expect(message.html).toContain('<li style="margin:0 0 8px;">')
    expect(message.html).toContain('href="https://octamod.test/#account/notifications"')
    expect(message.html).not.toMatch(/<script|<img|<iframe|<form/i)
    expect(message.text).toContain('Mini Verb (https://modwerk.app/#module/miniverb)')
    expect(message.text).toContain('https://octamod.test/#account/notifications')
    expect((await overview()).campaigns[0]).toMatchObject({ status: 'sent', recipient_count: 4, sent: 2, skipped: 2, failed: 0, queued: 0 })
    expect(db.prepare("SELECT accepted,failed,limited FROM account_mail_daily WHERE purpose='news'").get()).toEqual({ accepted: 2, failed: 0, limited: 0 })
    // A second run, including the hourly trigger, never mails the campaign again.
    expect(await run()).toEqual({ sent: 0, queued: 0 })
    const jobs: Promise<unknown>[] = []
    worker.scheduled({ cron: '17 * * * *' }, env, { waitUntil: job => { jobs.push(job) } })
    await Promise.all(jobs)
    expect(messages).toHaveLength(0)
  })

  it('keeps within the daily news budget without touching the account mail budget', async () => {
    const { member, news, act, run, db, call, env } = await fixture()
    env.NEWS_MAIL_DAILY_LIMIT = '1'
    for (const name of ['budgetone', 'budgettwo', 'budgetthree']) await member(name)
    const { id } = await news(campaign)
    await act(id, 'queue')
    expect(await run()).toEqual({ sent: 1, queued: 2 })
    expect(messages).toHaveLength(1)
    expect(db.prepare("SELECT accepted,limited FROM account_mail_daily WHERE purpose='news'").get()).toEqual({ accepted: 1, limited: 1 })
    expect(db.prepare("SELECT status FROM news_campaigns WHERE id=?").get(id)).toEqual({ status: 'sending' })
    // Verification mail still goes out: its budget is separate from the news cap.
    expect((await call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username: 'latecomer', email: 'latecomer@example.test', password, newsletter: false })).status).toBe(202)
    expect(messages.at(-1)!.to).toEqual(['latecomer@example.test'])
    expect(db.prepare("SELECT limited FROM account_mail_daily WHERE purpose='verify'").get()).toEqual({ limited: 0 })
  })

  it('retries a failed delivery with the same key and gives it up after three attempts', async () => {
    const { member, news, act, delivery, run, db } = await fixture()
    const reader = await member('retryone')
    const { id } = await news(campaign)
    await act(id, 'queue')
    provider = async () => new Response('upstream', { status: 500 })
    const attempt = async (attempts: number) => {
      db.prepare('UPDATE news_deliveries SET attempted_at=attempted_at-400 WHERE campaign_id=?').run(id)
      expect(await run()).toEqual({ sent: 0, queued: attempts < 3 ? 1 : 0 })
      expect(messages).toHaveLength(1)
      expect(delivery(id, reader.id)).toMatchObject({ status: attempts < 3 ? 'queued' : 'failed', attempts, idempotency_key: keys[0] })
    }
    await attempt(1)
    // Within the retry window nothing is attempted again.
    expect(await run()).toEqual({ sent: 0, queued: 1 }); expect(messages).toHaveLength(0)
    await attempt(2); await attempt(3)
    expect(db.prepare('SELECT status FROM news_campaigns WHERE id=?').get(id)).toEqual({ status: 'sent' })
    expect(db.prepare("SELECT failed FROM account_mail_daily WHERE purpose='news'").get()).toEqual({ failed: 3 })
  })

  it('withdraws consent through the one-click unsubscribe without a session', async () => {
    const { call, member, news, act, run, db } = await fixture()
    const reader = await member('unsubone')
    const { id } = await news(campaign)
    await act(id, 'queue')
    await run()
    const oneClick = messages[0].headers!['List-Unsubscribe'].slice(1, -1), token = new URL(oneClick).searchParams.get('token')!
    // Always change the MAC: a valid token can already end in 0.
    const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')
    expect((await call('/news/unsubscribe?token=' + encodeURIComponent(tampered), 'POST', undefined)).status).toBe(400)
    expect(db.prepare('SELECT enabled FROM account_news_preferences WHERE user_id=?').get(reader.id)).toEqual({ enabled: 1 })
    expect((await call('/news/unsubscribe?token=' + encodeURIComponent(token), 'POST', undefined)).status).toBe(200)
    expect(db.prepare('SELECT enabled,consent_version FROM account_news_preferences WHERE user_id=?').get(reader.id)).toEqual({ enabled: 0, consent_version: null })
    expect(await (await call('/auth/news', 'GET', undefined, reader.session)).json()).toMatchObject({ enabled: false })
    // The activity unsubscribe token does not withdraw news consent, and vice versa: separate purposes, separate keys.
    expect((await call('/notifications/unsubscribe?token=' + encodeURIComponent(token), 'POST', undefined)).status).toBe(400)
    expect((await call('/news/unsubscribe', 'POST', { token })).status).toBe(200)
  })

  it('sends a test to the signed-in administrator only, and cancels a queued campaign', async () => {
    const { call, member, news, act, delivery, run, db, admin } = await fixture()
    const owner = await member('ownerone'), reader = await member('readertwo')
    const { id } = await news(campaign)
    messages.length = 0; keys.length = 0
    expect((await act(id, 'test')).status).toBe(400)
    expect(messages).toHaveLength(0)
    db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(owner.id)
    expect(await (await call('/admin/news', 'GET', undefined, owner.session)).json()).toMatchObject({ testAvailable: true, optIns: 2 })
    expect((await call('/admin/news/' + id + '/test', 'POST', {}, owner.session)).status).toBe(200)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ to: [owner.email], subject: '[Test] ' + campaign.subject })
    expect(keys.at(-1)).toMatch(/^news-test-[a-f0-9]{64}$/)
    expect(delivery(id, owner.id)).toBeUndefined()
    expect((await act(id, 'cancel')).status).toBe(409)
    await act(id, 'queue')
    expect((await call('/admin/news/' + id, 'DELETE', undefined, '', admin)).status).toBe(409)
    expect((await act(id, 'cancel')).status).toBe(200)
    expect(db.prepare('SELECT status FROM news_campaigns WHERE id=?').get(id)).toEqual({ status: 'cancelled' })
    expect(delivery(id, reader.id)).toBeUndefined()
    expect(await run()).toEqual({ sent: 0, queued: 0 })
    expect((await act(id, 'cancel')).status).toBe(409)
    expect((await act(id, 'queue')).status).toBe(409)
  })

  it('suggests a digest from recent releases, busy discussions and showcase posts, linking to the site', async () => {
    const { call, member, admin, db } = await fixture()
    const author = await member('authorone'), fan = await member('fanone')
    db.prepare("INSERT INTO module_release_inventory(singleton,initialized_at) VALUES(1,datetime('now','-40 days'))").run()
    db.prepare("INSERT INTO module_releases(module_id,version,name,href,detected_at) VALUES('oldmodule','1.0','Old Module','#module/oldmodule',datetime('now','-45 days'))").run()
    db.prepare("INSERT INTO module_releases(module_id,version,name,href,detected_at) VALUES('miniverb','1.0','Mini Verb','#module/miniverb',datetime('now','-20 days'))").run()
    db.prepare("INSERT INTO module_releases(module_id,version,name,href,detected_at) VALUES('miniverb','1.1','Mini Verb','#module/miniverb',datetime('now','-2 days'))").run()
    db.prepare("INSERT INTO module_releases(module_id,version,name,href,detected_at) VALUES('newcomer','0.9','New [Comer]','#module/newcomer',datetime('now','-1 days'))").run()
    const { id } = await (await call('/forum/threads', 'POST', { title: 'How do you use Mini Verb?', body: 'Share your settings.', category: 'modules', moduleId: 'miniverb' }, author.session)).json()
    expect((await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Short decay, long predelay.' }, fan.session)).status).toBe(201)
    const postId = (await (await call('/forum/threads/' + id)).json()).posts[0].id
    expect((await call('/forum/posts/' + postId + '/react', 'POST', { liked: true }, fan.session)).status).toBe(200)
    const { id: quiet } = await (await call('/forum/threads', 'POST', { title: 'Nobody answered this', body: 'Hello?', category: 'general' }, author.session)).json()
    const { id: showcase } = await (await call('/forum/threads', 'POST', { title: 'My live set', body: 'Recorded last night.', category: 'showcase' }, author.session)).json()
    const showcasePost = (await (await call('/forum/threads/' + showcase)).json()).posts[0].id
    db.prepare("INSERT INTO forum_media(id,user_id,post_id,kind,mime,bytes,object_key) VALUES('media1',?,?,'audio','audio/mpeg',1000,'key1')").run(author.id, showcasePost)
    const suggestion = await (await call('/admin/news/suggest', 'GET', undefined, '', admin)).json() as { subject: string; body: string }
    expect(suggestion.subject).toMatch(/^What landed on Modwerk in [A-Z][a-z]+ \d{4}$/)
    expect(suggestion.body).toContain('- [Mini Verb](https://octamod.test/#module/miniverb) — updated to 1.1')
    expect(suggestion.body).toContain('- [New \\[Comer\\]](https://octamod.test/#module/newcomer) — new, version 0.9')
    expect(suggestion.body).not.toContain('Old Module')
    expect(suggestion.body).toContain(`- [How do you use Mini Verb?](https://octamod.test/#forum/thread/${id}) — 1 reply, 1 like`)
    expect(suggestion.body).not.toContain(quiet)
    expect(suggestion.body).toContain(`- [My live set](https://octamod.test/#forum/thread/${showcase}?post=${showcasePost}&page=0) by @authorone`)
    expect(suggestion.body.split('\n').filter(line => line.startsWith('## '))).toEqual(['## New and updated modules', '## Busiest discussions', '## Fresh from the showcase'])
    expect((await call('/admin/news/suggest', 'GET', undefined, author.session)).status).toBe(403)
  })

  it('renders a standalone safe link as an email button while preserving inline links and the plain-text destination', () => {
    const rendered = renderNewsEmail({ subject: 'October modules', body: '[Explore **the modules** & more](https://modwerk.app/#all)\n\nRead the [release notes](https://modwerk.app/#module/miniverb) first.\n\n[Do not run](javascript:alert(1))' }, { app: 'https://modwerk.app/', settings: 'https://modwerk.app/#account/notifications' })
    expect(rendered.html).toContain('bgcolor="#c7a16c" style="border-radius:7px;text-align:center;"')
    expect(rendered.html).toMatch(/<a href="https:\/\/modwerk.app\/#all" style="display:inline-block;[^>]+>Explore the modules &amp; more<\/a>/)
    expect(rendered.html).toContain('<a href="https://modwerk.app/#module/miniverb" style="color:#c4c9ff;text-decoration:underline;">release notes</a>')
    expect(rendered.html).not.toContain('javascript:')
    expect(rendered.html).toContain('Do not run')
    expect(rendered.text).toContain('Explore the modules & more (https://modwerk.app/#all)')
  })

  it('renders markdown safely in both parts of the message', () => {
    const rendered = renderNewsEmail({ subject: 'Hello <everyone>', body: '# Title\n\nPlain **bold** `code` <script>alert(1)</script>\n\n[safe](https://modwerk.app/) [unsafe](javascript:alert(1))\n\n> quoted\n\n1. one\n2. two\n\n---\n\n```\nraw < text\n```' }, { app: 'https://modwerk.app/', settings: 'https://modwerk.app/#account/notifications' })
    expect(rendered.subject).toBe('Hello <everyone>')
    expect(rendered.html).toContain('<title>Hello &lt;everyone&gt;</title>')
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rendered.html).not.toMatch(/<script|javascript:/)
    expect(rendered.html).toContain('<a href="https://modwerk.app/" style="color:#c4c9ff;text-decoration:underline;">safe</a>')
    expect(rendered.html).toContain('unsafe')
    expect(rendered.html).toContain('<ol style=')
    expect(rendered.html).toContain('<blockquote style=')
    expect(rendered.html).toContain('raw &lt; text')
    expect(rendered.html).toContain('<h2 style=')
    expect(rendered.text).toContain('TITLE\n\nPlain bold code <script>alert(1)</script>\n\nsafe (https://modwerk.app/) unsafe\n\n> quoted\n\n1. one\n2. two\n\n---\n\n    raw < text')
  })
})
