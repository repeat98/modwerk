import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { testServer } from './test-server'
import { PushSettings } from './PushSettings'
import { dispatchPush, pushEndpoint } from '../../server/push'
import { handleCommunity } from '../../server/transport'
import worker from '../../worker'
import { digest } from '../../server/security'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import type { DevicePush, DeviceSubscription } from './push-contract'

const databases: DatabaseSync[] = [], mail: { to: string[]; text: string }[] = []
const password = 'synthetic push notification passphrase'
const to64 = (value: ArrayBuffer | Uint8Array) => Buffer.from(new Uint8Array(value)).toString('base64url')
type Captured = { endpoint: string; options: RequestInit }
let captured: Captured[] = [], pushStatus = 201
beforeEach(() => {
  mail.length = 0; captured = []; pushStatus = 201
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (url === 'https://api.resend.com/emails') { mail.push(JSON.parse(String(options.body))); return Response.json({ id: 'synthetic-mail' }) }
    captured.push({ endpoint: url, options }); return new Response(null, { status: pushStatus })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const key = await crypto.subtle.exportKey('jwk', vapid.privateKey)
  Object.assign(server.env, { WEB_PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: to64(await crypto.subtle.exportKey('raw', vapid.publicKey)), VAPID_PRIVATE_KEY: key.d, VAPID_SUBJECT: 'https://modwerk.app/' })
  async function member(username: string, admin = false) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { username, email, password, rulesVersion: COMMUNITY_RULES_VERSION })).status).toBe(202)
    const action = mail.find(item => item.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token: action, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    const id = String(server.db.prepare('SELECT id FROM users WHERE username=?').get(username)!.id)
    if (admin) server.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(id)
    return { id, email, session: login.headers.get('X-Octamod-Session')! }
  }
  return { ...server, member, vapid }
}
async function device(label: string) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const auth = crypto.getRandomValues(new Uint8Array(16)), publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const subscription: DeviceSubscription = { endpoint: 'https://web.push.apple.com/' + label, keys: { p256dh: to64(publicKey), auth: to64(auth) } }
  return { keys, auth, publicKey, subscription, id: await digest(subscription.endpoint) }
}
/** Independently decode RFC 8291 using the device's private key. */
async function decrypt(record: Captured, receiver: Awaited<ReturnType<typeof device>>): Promise<DevicePush> {
  const bytes = new Uint8Array(record.options.body as ArrayBuffer), salt = bytes.slice(0, 16), keyLength = bytes[20], sender = bytes.slice(21, 21 + keyLength)
  expect(new DataView(bytes.buffer).getUint32(16)).toBe(4096); expect(keyLength).toBe(65)
  expect(record.options.redirect).toBe('manual')
  const server = await crypto.subtle.importKey('raw', sender, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, receiver.keys.privateKey, 256)
  const encoder = new TextEncoder()
  async function hkdf(input: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
    const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
  }
  const prefix = encoder.encode('WebPush: info\0'), info = new Uint8Array(prefix.length + 130)
  info.set(prefix); info.set(receiver.publicKey, prefix.length); info.set(sender, prefix.length + 65)
  const ikm = await hkdf(new Uint8Array(shared), receiver.auth, info, 32)
  const cek = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, bytes.slice(21 + keyLength)))
  let end = plain.length - 1; while (plain[end] === 0) end--
  expect(plain[end]).toBe(2)
  return JSON.parse(new TextDecoder().decode(plain.slice(0, end)))
}
const count = (db: DatabaseSync) => Number(db.prepare('SELECT COUNT(*) AS count FROM push_deliveries').get()!.count)

describe('private device push', () => {
  it('upgrades the current schema without replaying signups or disturbing welcomes and announcements', () => {
    const db = new DatabaseSync(':memory:'); databases.push(db)
    const folder = new URL('../../migrations/', import.meta.url)
    for (const name of readdirSync(folder).filter(name => name.endsWith('.sql') && name < '0032').sort()) db.exec(readFileSync(new URL(name, folder), 'utf8'))
    for (const id of ['existingadmin', 'pendingmember']) {
      db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').run(id, id, id + '@example.test', new Date().toISOString(), new Date().toISOString())
      db.prepare('INSERT INTO users(id,display_name,username,email_verified,is_admin) VALUES(?,?,?,1,?)').run(id, id, id, Number(id === 'existingadmin'))
    }
    db.prepare('INSERT INTO account_policy_acceptances(user_id,version) VALUES(?,?)').run('existingadmin', COMMUNITY_RULES_VERSION)
    db.prepare("INSERT INTO member_welcome_mail(user_id,state) VALUES('existingadmin','accepted')").run()
    db.prepare("INSERT INTO announcements(id,slug,title,body,created_by) VALUES('oldannouncement','schema-upgrade','Existing announcement','Keep this announcement.','existingadmin')").run()
    db.prepare("INSERT INTO announcement_reads(user_id,announcement_id) VALUES('existingadmin','oldannouncement')").run()
    db.exec(readFileSync(new URL('0032_web_push.sql', folder), 'utf8'))
    expect(db.prepare('SELECT user_id,username FROM signup_events').all()).toEqual([{ user_id: 'existingadmin', username: 'existingadmin' }])
    expect(db.prepare('SELECT state,template_version FROM member_welcome_mail').get()).toEqual({ state: 'accepted', template_version: 'modwerk-welcome-001' })
    expect(db.prepare('SELECT announcement_id FROM announcement_reads').get()).toEqual({ announcement_id: 'oldannouncement' })
    db.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key,signups) VALUES('device','existingadmin','https://web.push.apple.com/upgrade','synthetic-public','synthetic-auth','synthetic-vapid',1)").run()
    db.prepare('INSERT INTO account_policy_acceptances(user_id,version) VALUES(?,?)').run('existingadmin', 'later-version')
    expect(count(db)).toBe(0)
    db.prepare('INSERT INTO account_policy_acceptances(user_id,version) VALUES(?,?)').run('pendingmember', COMMUNITY_RULES_VERSION)
    expect(db.prepare('SELECT subscription_id,signup_id FROM push_deliveries').all()).toEqual([{ subscription_id: 'device', signup_id: 'pendingmember' }])
  })
  it('dispatches minute push jobs independently of five-minute welcome emails', async () => {
    const { call, member, env, db } = await fixture(), admin = await member('cronadmin', true), receiver = await device('cron')
    await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)
    env.WELCOME_MAIL_ENABLED = 'true'
    const joined = await member('cronmember'), mailCount = mail.length
    const jobs: Promise<unknown>[] = [], context = { waitUntil(job: Promise<unknown>) { jobs.push(job) } }
    worker.scheduled({ cron: '* * * * *' }, env, context)
    await Promise.all(jobs.splice(0))
    expect(captured).toHaveLength(1); expect(count(db)).toBe(0); expect(mail).toHaveLength(mailCount)
    expect(await decrypt(captured[0], receiver)).toMatchObject({ body: '@cronmember created an account.' })
    worker.scheduled({ cron: '*/5 * * * *' }, env, context)
    await Promise.all(jobs.splice(0))
    expect(captured).toHaveLength(1)
    expect(db.prepare('SELECT state FROM member_welcome_mail WHERE user_id=?').get(joined.id)).toEqual({ state: 'accepted' })
    expect(mail.length).toBeGreaterThan(mailCount)
  })
  it('requires verified membership, hides private keys, and forbids member signup subscriptions', async () => {
    const { call, member, env, db } = await fixture(), owner = await member('pushmember'), receiver = await device('member')
    expect((await call('/push/config')).status).toBe(401)
    const config = await (await call('/push/config', 'GET', undefined, owner.session)).json()
    expect(config).toEqual({ available: true, publicKey: env.VAPID_PUBLIC_KEY, admin: false })
    expect(JSON.stringify(config)).not.toContain(env.VAPID_PRIVATE_KEY)
    expect((await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, owner.session)).status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get()).toEqual({ count: 0 })
    expect((await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: receiver.subscription }, owner.session, '', 'https://evil.test')).status).toBe(403)
    expect((await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: { ...receiver.subscription, keys: { ...receiver.subscription.keys, auth: 'bad' } } }, owner.session)).status).toBe(400)
    env.WEB_PUSH_ENABLED = 'false'
    expect((await (await call('/push/config', 'GET', undefined, owner.session)).json()).available).toBe(false)
  })
  it('encrypts one alert per signup for admins without putting signup events into member bells', async () => {
    const { call, member, env, db, vapid } = await fixture(), admin = await member('pushadmin', true), visitor = await member('visitor'), receiver = await device('admin')
    expect((await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)).status).toBe(200)
    expect(count(db)).toBe(0)
    await member('brandnew'); expect(count(db)).toBe(1)
    await call('/auth/register', 'POST', { username: 'brandnew', email: 'brandnew@example.test', password, rulesVersion: COMMUNITY_RULES_VERSION })
    await call('/auth/login', 'POST', { email: 'brandnew@example.test', password })
    const newId = String(db.prepare("SELECT id FROM users WHERE username='brandnew'").get()!.id)
    db.prepare('INSERT INTO account_policy_acceptances(user_id,version) VALUES(?,?)').run(newId, 'later-version')
    expect(count(db)).toBe(1)
    expect(await (await call('/notifications', 'GET', undefined, visitor.session)).json()).toMatchObject({ items: [], unread: 0 })
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 1 })
    expect(await decrypt(captured[0], receiver)).toMatchObject({ title: 'New Modwerk sign-up', body: '@brandnew created an account.', href: '#admin', tag: 'modwerk-signup-' + newId })
    const headers = new Headers(captured[0].options.headers)
    expect(headers.get('content-encoding')).toBe('aes128gcm')
    const jwt = headers.get('authorization')!.match(/vapid t=([^, ]+), k=/)![1], [head, body, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://modwerk.app/' })
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey, new Uint8Array(Buffer.from(signature, 'base64url')), new TextEncoder().encode(head + '.' + body))).toBe(true)
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 0 }); expect(count(db)).toBe(0)
  })
  it('waits for social onboarding and rechecks administrator access at dispatch', async () => {
    const { call, member, env, db } = await fixture(), admin = await member('socialadmin', true), receiver = await device('social')
    await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)
    const id = 'pending-social'
    db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').run(id, 'pending', 'private@example.test', new Date().toISOString(), new Date().toISOString())
    db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run(id, 'pending', 'pending')
    db.prepare('INSERT INTO social_pending_accounts(user_id,expires) VALUES(?,?)').run(id, Math.floor(Date.now() / 1000) + 600)
    expect(count(db)).toBe(0)
    await env.DB!.batch([env.DB!.prepare('UPDATE users SET username=? WHERE id=?').bind('socialmember', id), env.DB!.prepare('INSERT INTO account_policy_acceptances(user_id,version) VALUES(?,?)').bind(id, COMMUNITY_RULES_VERSION), env.DB!.prepare('DELETE FROM social_pending_accounts WHERE user_id=?').bind(id)])
    expect(count(db)).toBe(1)
    db.prepare('UPDATE users SET is_admin=0 WHERE id=?').run(admin.id)
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 0 }); expect(captured).toHaveLength(0)
    expect((await call('/push/subscriptions', 'DELETE', { topic: 'signups', endpoint: receiver.subscription.endpoint }, admin.session)).status).toBe(200)
  })
  it('pushes only the recipient bell activity and suppresses read or hidden entries', async () => {
    const { call, member, db, env } = await fixture(), owner = await member('threadowner'), actor = await member('threadactor'), receiver = await device('activity')
    await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: receiver.subscription }, owner.session)
    const { id } = await (await call('/forum/threads', 'POST', { title: 'Push thread', body: 'Synthetic discussion.', category: 'general' }, owner.session)).json()
    expect((await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Hello @threadowner' }, actor.session)).status).toBe(201)
    expect(count(db)).toBe(1)
    expect(await (await call('/push/subscriptions/' + receiver.id, 'GET', undefined, actor.session)).json()).toEqual({ activity: false, signups: false })
    expect((await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: receiver.subscription }, actor.session)).status).toBe(409)
    await call('/push/subscriptions', 'DELETE', { topic: 'activity', endpoint: receiver.subscription.endpoint }, actor.session)
    expect(count(db)).toBe(1); expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 1 })
    expect(await decrypt(captured[0], receiver)).toMatchObject({ title: 'Modwerk community', body: '@threadactor mentioned you in “Push thread”' })
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Another reply' }, actor.session)
    await call('/notifications', 'PATCH', {}, owner.session)
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 0 })
    await call('/forum/threads/' + id + '/replies', 'POST', { body: 'Hidden reply' }, actor.session)
    db.prepare('UPDATE forum_threads SET hidden=1 WHERE id=?').run(id)
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 0 }); expect(captured).toHaveLength(1)
  })
  it('includes linked developer notifications and respects revoked GitHub identity links', async () => {
    const { call, member, env, db } = await fixture(), owner = await member('developerpush'), actor = await member('developerfan'), receiver = await device('developer')
    db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run('github-developer', '@synthetic', '4242', 'synthetic')
    db.prepare("INSERT INTO auth_accounts(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(?,?,'github',?,?,?)").run('github-link', '4242', owner.id, new Date().toISOString(), new Date().toISOString())
    await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: receiver.subscription }, owner.session)
    db.prepare("INSERT INTO notifications(id,user_id,kind,actor_id,module_id) VALUES(?,?,'module_like',?,'miniverb')").run('linked', 'github-developer', actor.id)
    expect(count(db)).toBe(1); expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 1 })
    db.prepare("INSERT INTO notifications(id,user_id,kind,actor_id,module_id) VALUES(?,?,'module_like',?,'repitch')").run('revoked', 'github-developer', actor.id)
    db.prepare("DELETE FROM auth_accounts WHERE id='github-link'").run()
    expect(await dispatchPush(env, env.DB!)).toEqual({ sent: 0 }); expect(captured).toHaveLength(1)
  })
  it('retries failures, claims concurrent work once, and drops expired endpoints', async () => {
    const { call, member, env, db } = await fixture(), admin = await member('retryadmin', true), receiver = await device('retry')
    await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)
    await member('retrynew'); const time = Math.floor(Date.now() / 1000); pushStatus = 503
    expect(await dispatchPush(env, env.DB!, time)).toEqual({ sent: 0 }); expect(count(db)).toBe(1)
    expect(await dispatchPush(env, env.DB!, time + 59)).toEqual({ sent: 0 }); expect(captured).toHaveLength(1)
    pushStatus = 201
    const results = await Promise.all([dispatchPush(env, env.DB!, time + 60), dispatchPush(env, env.DB!, time + 60)])
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1); expect(captured).toHaveLength(2)
    expect((await decrypt(captured[0], receiver)).tag).toBe((await decrypt(captured[1], receiver)).tag)
    await member('expirednew'); pushStatus = 410
    expect(await dispatchPush(env, env.DB!, time + 61)).toEqual({ sent: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get()).toEqual({ count: 0 }); expect(count(db)).toBe(0)
  })
  it('keeps topics independent, excludes credentials from export and deletes push data with the account', async () => {
    const { call, member, env, db } = await fixture(), admin = await member('topicadmin', true), receiver = await device('topics')
    await call('/push/subscriptions', 'POST', { topic: 'activity', subscription: receiver.subscription }, admin.session)
    expect(await (await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)).json()).toEqual({ activity: true, signups: true })
    await member('topicsnew'); expect(count(db)).toBe(1)
    expect(await (await call('/push/subscriptions', 'DELETE', { topic: 'signups', endpoint: receiver.subscription.endpoint }, admin.session)).json()).toEqual({ activity: true, signups: false })
    expect(count(db)).toBe(0)
    const exported = await (await call('/auth/data-export', 'POST', { password }, admin.session)).json()
    expect(exported.data.pushDevices).toEqual([{ activity: 1, signups: 0, created_at: expect.any(String) }])
    expect(JSON.stringify(exported)).not.toContain(receiver.subscription.endpoint); expect(JSON.stringify(exported)).not.toContain(receiver.subscription.keys.auth)
    env.WEB_PUSH_ENABLED = 'false'
    expect(await (await call('/push/subscriptions/' + receiver.id, 'GET', undefined, admin.session)).json()).toEqual({ activity: true, signups: false })
    expect((await call('/push/subscriptions', 'DELETE', { topic: 'activity', endpoint: receiver.subscription.endpoint }, admin.session)).status).toBe(200)
    env.WEB_PUSH_ENABLED = 'true'
    await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)
    await member('deletionnew'); expect(count(db)).toBe(1)
    expect((await call('/auth/account', 'DELETE', { confirm: 'DELETE', password }, admin.session)).status).toBe(200)
    expect(count(db)).toBe(0); expect(db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT user_id FROM signup_events WHERE user_id=?').get(admin.id)).toBeUndefined()
  })
  it('sends a device test and dispatches via waitUntil without delaying account responses', async () => {
    const { call, member, env } = await fixture(), admin = await member('backgroundadmin', true), receiver = await device('background')
    await call('/push/subscriptions', 'POST', { topic: 'signups', subscription: receiver.subscription }, admin.session)
    expect((await call('/push/test', 'POST', { topic: 'signups', endpoint: receiver.subscription.endpoint }, admin.session)).status).toBe(200)
    expect(await decrypt(captured[0], receiver)).toMatchObject({ title: 'Modwerk', href: '#admin' })
    const pending: Promise<unknown>[] = []
    const result = await handleCommunity(new Request('https://api.example.test/api/auth/register', { method: 'POST', headers: { Origin: 'https://octamod.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'backgroundnew', email: 'background@example.test', password, rulesVersion: COMMUNITY_RULES_VERSION }) }), env, { waitUntil(promise) { pending.push(promise) } })
    expect(result.status).toBe(202); expect(pending).toHaveLength(1)
    await Promise.all(pending); expect(captured).toHaveLength(2)
  })
})
it('restricts push endpoints and renders admin controls without browser globals', () => {
  for (const endpoint of ['https://evil.test/push', 'https://web.push.apple.com.evil.test/push', 'http://web.push.apple.com/push', 'https://web.push.apple.com:8443/push', 'https://x:y@web.push.apple.com/push', 'https://127.0.0.1/push']) expect(() => pushEndpoint(endpoint)).toThrow()
  const html = renderToStaticMarkup(createElement(PushSettings, { topic: 'signups' }))
  expect(html).toContain('Admin sign-up alerts'); expect(html).toContain('Available only to administrator accounts.')
})
it('shows visible notifications and restricts clicks to the installed app scope', async () => {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const shown = vi.fn<(title: string, options: unknown) => Promise<void>>().mockResolvedValue(undefined), openWindow = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
  const self = { addEventListener(name: string, handler: (event: Record<string, unknown>) => void) { listeners.set(name, handler) }, registration: { scope: 'https://modwerk.app/project/', showNotification: shown }, clients: { matchAll: async () => [], openWindow }, skipWaiting: async () => undefined }
  runInNewContext(readFileSync(new URL('../../public/push-sw.js', import.meta.url), 'utf8'), { self, URL })
  let pending: Promise<unknown> = Promise.resolve()
  listeners.get('push')!({ data: { json: () => ({ title: 'Signup', body: 'A member joined.', href: 'https://evil.test/' }) }, waitUntil(value: Promise<unknown>) { pending = value } })
  await pending
  expect(shown.mock.calls[0]).toEqual(['Signup', expect.objectContaining({ data: { href: 'https://modwerk.app/project/?utm_source=push#account' } })])
  listeners.get('notificationclick')!({ notification: { close() {}, data: { href: 'https://evil.test/' } }, waitUntil(value: Promise<unknown>) { pending = value } })
  await pending; expect(openWindow).not.toHaveBeenCalled()
  listeners.get('notificationclick')!({ notification: { close() {}, data: { href: 'https://modwerk.app/project/#admin' } }, waitUntil(value: Promise<unknown>) { pending = value } })
  await pending; expect(openWindow).toHaveBeenCalledWith('https://modwerk.app/project/#admin')
})
