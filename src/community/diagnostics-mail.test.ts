import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { OCTATRACK_DIAGNOSTICS_VERSION } from './octatrack-diagnostics-contract'

type Sent = { to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> }
const databases: DatabaseSync[] = [], messages: Sent[] = [], password = 'a long original test passphrase'
let provider: () => Promise<Response>
beforeEach(() => {
  messages.length = 0
  provider = async () => Response.json({ id: crypto.randomUUID() })
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (url !== 'https://api.resend.com/emails') return new Response('', { status: 404 })
    messages.push(JSON.parse(String(options.body)))
    return provider()
  }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  async function member(username: string, { verify = true, share = true } = {}) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password, newsletter: false })).status).toBe(202)
    const id = String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id)
    if (!verify) return { id, email, session: '' }
    const token = [...messages].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const session = (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
    if (share) expect((await server.call('/octatrack/diagnostics/consent', 'PUT', { enabled: true, version: OCTATRACK_DIAGNOSTICS_VERSION }, session)).status).toBe(200)
    return { id, email, session }
  }
  const { token: key } = await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()
  const owner = await member('theowner', { share: false })
  server.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(owner.id)
  const draft = (username: string, more: Record<string, unknown> = {}) => server.call('/admin/diagnostics-mail', 'POST',
    { username, kind: 'problem', cause: '#1720', subject: 'Your Octatrack and SC Ringmod', body: 'Your Octatrack left SC Ringmod out at a start on 18 November. I am looking into it.', ...more }, '', key)
  const list = async () => (await (await server.call('/admin/diagnostics-mail', 'GET', undefined, '', key)).json()) as { canSend: boolean; emailAvailable: boolean; mails: { id: string; username: string; status: string; eligible: number }[] }
  const send = (id: string, session = owner.session) => server.call('/admin/diagnostics-mail/' + id + '/send', 'POST', {}, session)
  const status = (id: string) => (server.db.prepare('SELECT status FROM diagnostics_mail WHERE id=?').get(id) as { status: string }).status
  return { ...server, member, key, owner, draft, list, send, status }
}

describe('diagnostics emails', () => {
  it('drafts only for a verified, unsuspended member who shares diagnostics now and has not stopped them', async () => {
    const { call, db, member, draft, list, key } = await fixture()
    const sharer = await member('sharerone')
    await member('quietone', { share: false })
    await member('unverified', { verify: false, share: false })
    const suspended = await member('suspended'), expired = await member('expired'), off = await member('turnedoff')
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(suspended.id)
    db.prepare("UPDATE octatrack_diagnostic_consent SET changed_at='2026-01-01T00:00:00.000Z' WHERE user_id=?").run(expired.id)
    expect((await call('/octatrack/diagnostics/consent', 'PUT', { enabled: false, version: OCTATRACK_DIAGNOSTICS_VERSION }, off.session)).status).toBe(200)
    for (const name of ['quietone', 'unverified', 'suspended', 'expired', 'turnedoff', 'nobody', 'guest:3269c410']) {
      const refused = await draft(name)
      expect(refused.status, name).toBe(400)
      expect((await refused.json()).error).toContain('cannot get a diagnostics email')
    }
    expect((await draft('sharerone', { kind: 'other' })).status).toBe(400)
    expect((await draft('sharerone', { body: 'too short' })).status).toBe(400)
    expect((await call('/admin/diagnostics-mail', 'GET', undefined, sharer.session)).status).toBe(403)
    const created = await draft('sharerone')
    expect(created.status).toBe(201)
    const listed = await list()
    expect(listed.mails).toMatchObject([{ username: 'sharerone', status: 'draft', eligible: 1 }])
    expect(listed.canSend).toBe(false) // the administrator key drafts; it never sends
    expect(JSON.stringify(listed)).not.toContain('@example.test')
    const { id } = await created.json()
    expect((await call('/admin/diagnostics-mail/' + id, 'DELETE', undefined, '', key)).status).toBe(200)
    expect((await call('/admin/diagnostics-mail/' + id, 'DELETE', undefined, '', key)).status).toBe(409)
  }, 15000) // several sign-ups, each hashing a passphrase: past the 5 s default under load, as news-mail.test.ts

  it('sends only when the owner, signed in, sends it, and only once', async () => {
    const { db, member, draft, send, status, key, call } = await fixture()
    const sharer = await member('sharerone')
    const { id } = await (await draft('sharerone')).json()
    messages.length = 0
    expect((await call('/admin/diagnostics-mail/' + id + '/send', 'POST', {}, '', key)).status).toBe(403)
    expect((await send(id, sharer.session)).status).toBe(403)
    expect(messages).toEqual([])
    expect((await send(id)).status).toBe(200)
    expect(messages).toHaveLength(1)
    const [mail] = messages
    expect(mail.to).toEqual([sharer.email])
    expect(mail.subject).toBe('Your Octatrack and SC Ringmod')
    expect(mail.text).toContain('Hey sharerone,')
    expect(mail.text).toContain('left SC Ringmod out')
    expect(mail.text).toMatch(/#account\/diagnostics-mail-off\/[^\s]+/)
    expect(mail.headers?.['List-Unsubscribe']).toContain('/api/diagnostics/mail/unsubscribe?token=')
    expect(status(id)).toBe('sent')
    expect((await send(id)).status).toBe(409)
    expect(messages).toHaveLength(1)
    expect(db.prepare("SELECT accepted FROM account_mail_daily WHERE purpose='diagnostics'").get()).toEqual({ accepted: 1 })
  })

  it('checks the member again when it is sent, and records a provider failure', async () => {
    const { call, member, draft, send, status } = await fixture()
    const sharer = await member('sharerone')
    const { id } = await (await draft('sharerone')).json()
    expect((await call('/octatrack/diagnostics/consent', 'PUT', { enabled: false, version: OCTATRACK_DIAGNOSTICS_VERSION }, sharer.session)).status).toBe(200)
    messages.length = 0
    expect((await send(id)).status).toBe(409)
    expect(messages).toEqual([])
    expect(status(id)).toBe('draft') // kept for the owner to discard
    expect((await call('/octatrack/diagnostics/consent', 'PUT', { enabled: true, version: OCTATRACK_DIAGNOSTICS_VERSION }, sharer.session)).status).toBe(200)
    provider = async () => new Response('', { status: 500 })
    expect((await send(id)).status).toBe(503)
    expect(status(id)).toBe('failed')
    expect((await send(id)).status).toBe(409)
  })

  it('stops them for the member a signed link names', async () => {
    const { call, db, member, draft, send, list } = await fixture()
    const sharer = await member('sharerone')
    const { id } = await (await draft('sharerone')).json()
    await draft('sharerone', { kind: 'fixed', subject: 'Fixed in base 0.7.10' })
    messages.length = 0
    expect((await send(id)).status).toBe(200)
    const token = messages[0].text.match(/#account\/diagnostics-mail-off\/([^\s]+)/)![1]
    expect((await call('/diagnostics/mail/unsubscribe', 'POST', { token: token.slice(0, -1) + (token.endsWith('0') ? '1' : '0') })).status).toBe(400)
    expect((await call('/news/unsubscribe', 'POST', { token })).status).toBe(400) // one purpose per link
    expect((await call('/diagnostics/mail/unsubscribe', 'POST', { token })).status).toBe(200)
    expect(db.prepare('SELECT user_id FROM diagnostics_mail_optout').all()).toEqual([{ user_id: sharer.id }])
    expect((await list()).mails.find(mail => mail.status === 'draft')).toMatchObject({ eligible: 0 })
    expect((await draft('sharerone')).status).toBe(400)
  })

  it('keeps taking reports and choices from a page still open on the previous consent text', async () => {
    const { call, member } = await fixture()
    const sharer = await member('sharerone', { share: false })
    const saved = await call('/octatrack/diagnostics/consent', 'PUT', { enabled: true, version: '2026-11-11.1' }, sharer.session)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ enabled: true, version: '2026-11-11.1' })
    expect((await call('/octatrack/diagnostics/consent', 'PUT', { enabled: true, version: '2026-10-01.1' }, sharer.session)).status).toBe(400)
  })
})
