import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { testServer } from './test-server'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { digest } from '../../server/security'
import { sendMemberWelcomes } from '../../server/welcome-mail'
import { welcomeEmail, welcomeEmailVersions, WELCOME_EMAIL_VERSION } from '../../server/welcome-email-template'
import worker from '../../worker'

type Sent = { to: string[]; subject: string; text: string; html: string }
const databases: DatabaseSync[] = [], messages: Sent[] = [], keys: string[] = []
const password = 'a private welcome test passphrase'
let provider: () => Promise<Response>
beforeEach(() => {
  messages.length = 0; keys.length = 0
  provider = async () => Response.json({ id: crypto.randomUUID() })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
    messages.push(JSON.parse(String(options.body)))
    keys.push(new Headers(options.headers).get('Idempotency-Key')!)
    return provider()
  }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.WELCOME_MAIL_ENABLED = 'true'
  async function register(username = 'newmember', newsletter = false) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { username, email, password, rulesVersion: COMMUNITY_RULES_VERSION, newsletter })).status).toBe(202)
    const token = messages.at(-1)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    const verify = async () => { expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200) }
    return { id, email, verify }
  }
  const run = (now?: Date) => sendMemberWelcomes(server.env, server.env.DB!, now)
  return { ...server, register, run }
}

describe('new member welcome email', () => {
  it('sends the approved welcome once after verification, even when news is off', async () => {
    const { register, run, db, env, call } = await fixture(), member = await register()
    expect((await run()).sent).toBe(0)
    expect(messages).toHaveLength(1)
    await member.verify()
    const jobs: Promise<unknown>[] = []
    worker.scheduled({ cron: '*/5 * * * *' }, env, { waitUntil: job => { jobs.push(job) } })
    await Promise.all(jobs)
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ to: [member.email], ...welcomeEmail })
    expect(db.prepare('SELECT enabled FROM account_news_preferences WHERE user_id=?').get(member.id)).toEqual({ enabled: 0 })
    expect(db.prepare('SELECT state,attempts,template_version FROM member_welcome_mail WHERE user_id=?').get(member.id)).toEqual({ state: 'accepted', attempts: 1, template_version: WELCOME_EMAIL_VERSION })
    expect(keys[1]).toBe(WELCOME_EMAIL_VERSION + '-' + await digest(member.id))
    expect(db.prepare("SELECT accepted FROM account_mail_daily WHERE purpose='welcome'").get()).toEqual({ accepted: 1 })
    expect((await call('/auth/login', 'POST', { email: member.email, password })).status).toBe(200)
    expect((await run()).sent).toBe(0)
    expect(messages).toHaveLength(2)
  })

  it('matches the readable previews and describes signup rather than news consent', () => {
    expect(welcomeEmail.html).toBe(readFileSync(new URL('../../docs/news/007-member-welcome.html', import.meta.url), 'utf8'))
    const plain = readFileSync(new URL('../../docs/news/007-member-welcome.txt', import.meta.url), 'utf8')
    expect(plain).toBe('Subject: ' + welcomeEmail.subject + '\nPreheader: More modules are coming, and the repo is open for contributions.\n\n' + welcomeEmail.text)
    // The forum tour of modwerk-welcome-003 and -004 is gone again.
    expect(welcomeEmail.html).not.toContain('Introductions')
    expect(welcomeEmail.html).not.toContain('#account/notifications')
    expect(welcomeEmail.html).toContain('href="https://modwerk.app/#submit"')
    expect(welcomeEmail.text).toContain('Start developing:\nhttps://modwerk.app/#submit')
    expect(welcomeEmail.html).toContain('https://github.com/repeat98/modwerk')
    expect(welcomeEmail.html).toContain('href="https://discord.gg/vzfAdMBtn5"')
    expect(welcomeEmail.text).toContain('Join the development Discord:\nhttps://discord.gg/vzfAdMBtn5')
    expect(welcomeEmail.html).toContain('https://modwerk.app/#account" style')
    expect(welcomeEmail.html).not.toMatch(/opted in|<script|<img|<iframe|<form|mailto:|—/i)
  })

  it('keeps the earlier template payloads byte for byte, so queued retries resend what was first attempted', () => {
    const discord = welcomeEmailVersions['modwerk-welcome-002']
    expect(discord.html).toBe(readFileSync(new URL('../../docs/news/001-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/001-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + discord.subject + '\nPreheader: More modules are coming, and the repo is open for contributions.\n\n' + discord.text)
    expect(welcomeEmailVersions['modwerk-welcome-001'].html).not.toContain('discord.gg')
    for (const version of ['modwerk-welcome-001', 'modwerk-welcome-002']) expect(welcomeEmailVersions[version].html).not.toContain('Introductions')
    const forum = welcomeEmailVersions['modwerk-welcome-003']
    expect(forum.html).toBe(readFileSync(new URL('../../docs/news/002-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/002-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + forum.subject + '\nPreheader: Say hello in the forum and follow the modules for your machine.\n\n' + forum.text)
    expect(forum.html).not.toContain('#submit')
    const submit = welcomeEmailVersions['modwerk-welcome-004']
    expect(submit.html).toBe(readFileSync(new URL('../../docs/news/003-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/003-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + submit.subject + '\nPreheader: Say hello in the forum and follow the modules for your machine.\n\n' + submit.text)
    const previous = welcomeEmailVersions['modwerk-welcome-005']
    expect(previous.html).toBe(readFileSync(new URL('../../docs/news/004-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/004-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + previous.subject + '\nPreheader: More modules are coming, and the repo is open for contributions.\n\n' + previous.text)
    const development = welcomeEmailVersions['modwerk-welcome-006']
    expect(development.html).toBe(readFileSync(new URL('../../docs/news/005-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/005-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + development.subject + '\nPreheader: More modules are coming, and the repo is open for contributions.\n\n' + development.text)
    const lastInvite = welcomeEmailVersions['modwerk-welcome-007']
    expect(lastInvite.html).toBe(readFileSync(new URL('../../docs/news/006-member-welcome.html', import.meta.url), 'utf8'))
    expect(readFileSync(new URL('../../docs/news/006-member-welcome.txt', import.meta.url), 'utf8')).toBe('Subject: ' + lastInvite.subject + '\nPreheader: More modules are coming, and the repo is open for contributions.\n\n' + lastInvite.text)
    expect(Object.keys(welcomeEmailVersions)).toEqual(['modwerk-welcome-001', 'modwerk-welcome-002', 'modwerk-welcome-003', 'modwerk-welcome-004', 'modwerk-welcome-005', 'modwerk-welcome-006', 'modwerk-welcome-007', WELCOME_EMAIL_VERSION])
  })

  it('keeps queued messages and retry keys stable while new members receive the current welcome', async () => {
    const { register, run, db } = await fixture(), queued = await register('queuedmember'), discord = await register('discordmember')
    await queued.verify(); await discord.verify()
    db.prepare('INSERT INTO member_welcome_mail(user_id,template_version,first_attempt_at,attempts) VALUES(?,?,?,1)')
      .run(queued.id, 'modwerk-welcome-001', Math.floor(Date.now() / 1000))
    db.prepare('INSERT INTO member_welcome_mail(user_id,template_version,first_attempt_at,attempts) VALUES(?,?,?,1)')
      .run(discord.id, 'modwerk-welcome-002', Math.floor(Date.now() / 1000))
    expect((await run()).sent).toBe(2)
    const first = messages.find(message => message.to[0] === queued.email && message.subject === welcomeEmail.subject)!, second = messages.find(message => message.to[0] === discord.email && message.subject === welcomeEmail.subject)!
    expect(first).toMatchObject(welcomeEmailVersions['modwerk-welcome-001'])
    expect(first.html).not.toContain('discord.gg')
    expect(second).toMatchObject(welcomeEmailVersions['modwerk-welcome-002'])
    expect(second.html).not.toContain('Introductions')
    expect(keys.slice(-2).sort()).toEqual(['modwerk-welcome-001-' + await digest(queued.id), 'modwerk-welcome-002-' + await digest(discord.id)].sort())

    const member = await register('forummember')
    await member.verify()
    expect((await run()).sent).toBe(1)
    expect(messages.at(-1)).toMatchObject({ to: [member.email], ...welcomeEmail })
    expect(keys.at(-1)).toBe(WELCOME_EMAIL_VERSION + '-' + await digest(member.id))
    expect((await run()).sent).toBe(0)
    expect(messages).toHaveLength(6)
  })

  it('upgrades only never-attempted welcomes when refreshing the Discord invite', async () => {
    const { register, db } = await fixture()
    for (const [username, state, attempts, firstAttempt] of [
      ['unsentinvite', 'pending', 0, null], ['retryinvite', 'pending', 1, 1234],
      ['sendinginvite', 'sending', 1, 1234], ['acceptedinvite', 'accepted', 1, 1234],
    ] as const) {
      const member = await register(username)
      db.prepare('INSERT INTO member_welcome_mail(user_id,template_version,state,attempts,first_attempt_at) VALUES(?,?,?,?,?)')
        .run(member.id, 'modwerk-welcome-006', state, attempts, firstAttempt)
    }
    const before = db.prepare('SELECT * FROM member_welcome_mail ORDER BY user_id').all()
    const migration = readFileSync(new URL('../../migrations/0055_refresh_development_discord.sql', import.meta.url), 'utf8')
    db.exec(migration); db.exec(migration)
    expect(db.prepare('SELECT * FROM member_welcome_mail ORDER BY user_id').all()).toEqual(before.map(row => ({
      ...row, template_version: row.attempts === 0 ? 'modwerk-welcome-007' : 'modwerk-welcome-006',
    })))
  })

  it('refreshes never-attempted welcomes without changing provider retries', async () => {
    const { register, db } = await fixture()
    for (const [username, state, attempts, firstAttempt] of [
      ['newunsent', 'pending', 0, null], ['oldretry', 'pending', 1, 1234],
      ['oldsending', 'sending', 1, 1234], ['oldaccepted', 'accepted', 1, 1234],
    ] as const) {
      const member = await register(username)
      db.prepare('INSERT INTO member_welcome_mail(user_id,template_version,state,attempts,first_attempt_at) VALUES(?,?,?,?,?)')
        .run(member.id, 'modwerk-welcome-007', state, attempts, firstAttempt)
    }
    const before = db.prepare('SELECT * FROM member_welcome_mail ORDER BY user_id').all()
    const migration = readFileSync(new URL('../../migrations/0056_refresh_development_discord.sql', import.meta.url), 'utf8')
    db.exec(migration); db.exec(migration)
    expect(db.prepare('SELECT * FROM member_welcome_mail ORDER BY user_id').all()).toEqual(before.map(row => ({
      ...row, template_version: row.attempts === 0 ? WELCOME_EMAIL_VERSION : 'modwerk-welcome-007',
    })))
  })

  it('waits for social signup completion and excludes suspended members', async () => {
    const { register, run, db } = await fixture(), social = await register('socialmember'), suspended = await register('suspendedmember')
    await social.verify(); await suspended.verify()
    db.prepare('INSERT INTO social_pending_accounts(user_id,expires) VALUES(?,?)').run(social.id, Math.floor(Date.now() / 1000) + 600)
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(suspended.id)
    expect((await run()).sent).toBe(0)
    db.prepare('DELETE FROM social_pending_accounts WHERE user_id=?').run(social.id)
    expect((await run()).sent).toBe(1)
    expect(messages.at(-1)!.to).toEqual([social.email])
  })

  it('claims atomically across overlapping scheduled runs', async () => {
    const { register, run } = await fixture(), member = await register()
    await member.verify()
    let release!: () => void, reached!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { reached = resolve })
    provider = async () => { reached(); await gate; return Response.json({ id: 'accepted-once' }) }
    const first = run()
    await started
    expect((await run()).sent).toBe(0)
    release()
    expect((await first).sent).toBe(1)
    expect(messages).toHaveLength(2)
  })

  it('retries failures with the same key and stops uncertain retries before key expiry', async () => {
    const { register, run, db } = await fixture(), member = await register()
    await member.verify()
    const now = new Date()
    provider = async () => { throw new Error('private provider address/key payload') }
    expect((await run(now)).sent).toBe(0)
    expect((await run(new Date(now.getTime() + 60000))).sent).toBe(0)
    expect(messages).toHaveLength(2)
    provider = async () => Response.json({ id: 'retried' })
    expect((await run(new Date(now.getTime() + 6 * 60000))).sent).toBe(1)
    expect(keys.at(-1)).toBe(keys.at(-2))
    const uncertain = await register('uncertainmember')
    await uncertain.verify()
    provider = async () => { throw new Error('unknown network result') }
    const future = new Date(now.getTime() + 6 * 60000)
    await run(future)
    expect((await run(new Date(future.getTime() + 21 * 3600000))).review).toBe(1)
    expect(db.prepare('SELECT state FROM member_welcome_mail WHERE user_id=?').get(uncertain.id)).toEqual({ state: 'review' })
  })

  it('leaves exhausted-quota welcomes pending without starting the idempotency window', async () => {
    const { register, run, db } = await fixture(), member = await register()
    await member.verify()
    const seconds = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires').run(await digest('welcome-mail:daily:' + Math.floor(seconds / 86400)), 20, seconds + 86400)
    expect((await run()).sent).toBe(0)
    expect(messages).toHaveLength(1)
    expect(db.prepare('SELECT state,first_attempt_at,attempts FROM member_welcome_mail WHERE user_id=?').get(member.id)).toEqual({ state: 'pending', first_attempt_at: null, attempts: 0 })
    expect(db.prepare("SELECT limited FROM account_mail_daily WHERE purpose='welcome'").get()).toEqual({ limited: 1 })
    await register('verificationstillworks')
    expect(messages).toHaveLength(2)
    expect(messages.at(-1)!.subject).toBe('Verify your email address · Modwerk')
  })

  it('sends pending welcomes even when the account budget is exhausted', async () => {
    const { register, run, db } = await fixture(), member = await register()
    await member.verify()
    const seconds = Math.floor(Date.now() / 1000)
    db.prepare('UPDATE rate_limits SET count=60 WHERE key=?').run(await digest('account-mail:daily:' + Math.floor(seconds / 86400)))
    expect((await run()).sent).toBe(1)
    expect(messages).toHaveLength(2)
    expect(db.prepare('SELECT state FROM member_welcome_mail WHERE user_id=?').get(member.id)).toEqual({ state: 'accepted' })
  })

  it('can be paused and removes welcome state when an account is deleted', async () => {
    const { register, run, db, env } = await fixture(), member = await register()
    await member.verify()
    env.WELCOME_MAIL_ENABLED = 'false'
    expect((await run()).sent).toBe(0)
    env.WELCOME_MAIL_ENABLED = 'true'
    expect((await run()).sent).toBe(1)
    db.prepare('DELETE FROM auth_users WHERE id=?').run(member.id)
    expect(db.prepare('SELECT user_id FROM member_welcome_mail WHERE user_id=?').get(member.id)).toBeUndefined()
  })

  it('excludes existing completed members during the real schema upgrade', () => {
    const db = new DatabaseSync(':memory:'); databases.push(db)
    const folder = new URL('../../migrations/', import.meta.url)
    for (const name of readdirSync(folder).filter(name => name.endsWith('.sql') && name < '0029').sort()) db.exec(readFileSync(new URL(name, folder), 'utf8'))
    for (const [id, verified] of [['oldmember', 1], ['unfinished', 0], ['socialpending', 1]] as const) {
      db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(id, id, id + '@example.test', verified, new Date().toISOString(), new Date().toISOString())
      db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,?)').run(id, id, id, verified)
    }
    db.prepare('INSERT INTO social_pending_accounts(user_id,expires) VALUES(?,?)').run('socialpending', Math.floor(Date.now() / 1000) + 600)
    db.prepare("INSERT INTO account_mail_daily(day,purpose,accepted) VALUES('2026-10-05','verify',12)").run()
    db.exec(readFileSync(new URL('0029_member_welcome.sql', folder), 'utf8'))
    expect(db.prepare('SELECT user_id,state FROM member_welcome_mail').all()).toEqual([{ user_id: 'oldmember', state: 'existing' }])
    expect(db.prepare("SELECT accepted FROM account_mail_daily WHERE purpose='verify'").get()).toEqual({ accepted: 12 })
    db.prepare('INSERT INTO member_welcome_mail(user_id,first_attempt_at,attempts) VALUES(?,?,?)').run('unfinished', 1234, 2)
    db.exec(readFileSync(new URL('0030_welcome_template_version.sql', folder), 'utf8'))
    expect(db.prepare('SELECT user_id,state,template_version,first_attempt_at,attempts FROM member_welcome_mail ORDER BY user_id').all()).toEqual([
      { user_id: 'oldmember', state: 'existing', template_version: 'modwerk-welcome-001', first_attempt_at: null, attempts: 0 },
      { user_id: 'unfinished', state: 'pending', template_version: 'modwerk-welcome-001', first_attempt_at: 1234, attempts: 2 },
    ])
  })
})
