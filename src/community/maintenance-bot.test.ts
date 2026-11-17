import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { chunks } from '../../server/maintenance-bot'

const KEY = 'k'.repeat(64), SECRET = 's'.repeat(40), CHAT = '4242'
const databases: DatabaseSync[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); vi.useRealTimers() })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  Object.assign(server.env, { MAINTENANCE_BOT_KEY_SHA256: await digest(KEY), TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: SECRET })
  const sent: { method: string; body: Record<string, unknown> }[] = []
  let message = 900
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split('/').at(-1)!
    sent.push({ method, body: JSON.parse(String(init.body)) })
    return Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: ++message } : true })
  }))
  // Server-to-server, like the GitHub job: no Origin.
  const bot = (path: string, method = 'GET', body?: unknown, key = KEY) => handleCommunity(new Request('https://api.example.test/api/maintenance-bot' + path, {
    method, headers: { Authorization: 'Bearer ' + key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body),
  }), server.env)
  const hook = (update: unknown, secret = SECRET) => handleCommunity(new Request('https://api.example.test/api/maintenance-bot/telegram', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update),
  }), server.env)
  const press = (data: string, from = Number(CHAT)) => hook({ callback_query: { id: 'q', data, from: { id: from }, message: { message_id: 1, chat: { id: from } } } })
  return { ...server, sent, bot, hook, press }
}
const action = (id: string, tier: string, extra = {}) => ({ id, kind: 'merge', target: 7, tier, summary: '#7 Merge the thing', reason: 'Green and reviewed.', payload: { kind: 'merge', number: 7 }, ...extra })

describe('maintenance bot ledger', () => {
  it('refuses a wrong key, and answers 503 until it is set up', async () => {
    const { bot, env } = await fixture()
    expect((await bot('/state', 'GET', undefined, 'x'.repeat(64))).status).toBe(401)
    delete env.TELEGRAM_BOT_TOKEN
    expect((await bot('/state')).status).toBe(503)
  })

  it('records a proposal once, sends it to Telegram with buttons, and runs it only after its window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))
    const { bot, sent } = await fixture()
    expect(await (await bot('/actions', 'POST', { actions: [action('a'.repeat(16), 'window', { windowHours: 2 })] })).json()).toEqual({ created: ['a'.repeat(16)] })
    expect(await (await bot('/actions', 'POST', { actions: [action('a'.repeat(16), 'window', { summary: 'Changed wording' })] })).json()).toEqual({ created: [] })
    expect(sent).toHaveLength(1)
    expect(sent[0].body.text).toContain('unless you stop it')
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain('s:' + 'a'.repeat(16))
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
    vi.setSystemTime(new Date('2026-11-17T12:00:01Z'))
    expect((await (await bot('/actions/due')).json()).actions.map((row: { id: string }) => row.id)).toEqual(['a'.repeat(16)])
    expect((await bot('/actions/' + 'a'.repeat(16) + '/claim', 'POST')).status).toBe(200)
    // A second, overlapping run cannot claim it again.
    expect((await bot('/actions/' + 'a'.repeat(16) + '/claim', 'POST')).status).toBe(409)
    expect((await bot('/actions/' + 'a'.repeat(16) + '/result', 'POST', { status: 'done', result: 'merged abc' })).status).toBe(200)
    expect(sent.at(-1)).toMatchObject({ method: 'editMessageText', body: { message_id: 901 } })
    expect(String(sent.at(-1)!.body.text)).toContain('Done: merged abc')
  })

  it('runs a notice at once without a Telegram message, and an ask never without approval', async () => {
    const { bot, sent, press } = await fixture()
    await bot('/actions', 'POST', { actions: [action('b'.repeat(16), 'notify', { kind: 'label' }), action('c'.repeat(16), 'ask')] })
    expect(sent.map(item => item.method)).toEqual(['sendMessage'])
    expect(sent[0].body.text).toContain('Needs your OK')
    expect((await (await bot('/actions/due')).json()).actions.map((row: { id: string }) => row.id)).toEqual(['b'.repeat(16)])
    await press('g:' + 'c'.repeat(16))
    expect((await (await bot('/actions/due')).json()).actions.map((row: { id: string }) => row.id)).toEqual(['b'.repeat(16), 'c'.repeat(16)])
  })

  it('stops an action from Telegram, and ignores anyone but the owner', async () => {
    const { bot, sent, press, hook } = await fixture()
    await bot('/actions', 'POST', { actions: [action('d'.repeat(16), 'window', { windowHours: 0 })] })
    await press('s:' + 'd'.repeat(16), 999)
    expect(sent.at(-1)).toMatchObject({ method: 'answerCallbackQuery', body: { text: 'Not yours.' } })
    expect((await hook({ callback_query: { id: 'q', data: 's:' + 'd'.repeat(16) } }, 'w'.repeat(40))).status).toBe(403)
    expect((await (await bot('/actions/due')).json()).actions).toHaveLength(1)
    await press('s:' + 'd'.repeat(16))
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
    expect((await bot('/actions/' + 'd'.repeat(16) + '/claim', 'POST')).status).toBe(409)
    const recent = await (await bot('/actions/recent')).json()
    expect(recent.actions[0]).toMatchObject({ status: 'vetoed', payload: { number: 7 } })
  })

  it('pauses and resumes from Telegram', async () => {
    const { bot, hook, sent } = await fixture()
    await bot('/actions', 'POST', { actions: [action('e'.repeat(16), 'notify')] })
    await hook({ message: { text: '/pause', chat: { id: Number(CHAT) } } })
    expect(await (await bot('/actions/due')).json()).toEqual({ paused: true, actions: [] })
    expect((await (await bot('/state')).json()).paused).toBe(true)
    await hook({ message: { text: '/pause', chat: { id: 1 } } })
    await hook({ message: { text: '/resume', chat: { id: Number(CHAT) } } })
    expect((await (await bot('/actions/due')).json()).actions).toHaveLength(1)
    expect(sent.filter(item => item.method === 'sendMessage')).toHaveLength(2)
  })

  it('keeps the fingerprint and splits long reports', async () => {
    const { bot, sent } = await fixture()
    expect((await bot('/state', 'PUT', { fingerprint: 'nope' })).status).toBe(400)
    await bot('/state', 'PUT', { fingerprint: 'f'.repeat(64) })
    expect((await (await bot('/state')).json()).fingerprint).toBe('f'.repeat(64))
    await bot('/report', 'POST', { text: ('line\n').repeat(2000) })
    expect(sent.filter(item => item.method === 'sendMessage').length).toBe(3)
    expect(chunks('x'.repeat(9000)).map(part => part.length)).toEqual([4000, 4000, 1000])
  })
})
