import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { TELEGRAM_COMMANDS, chunks, dispatchMaintenance, dispatchSlot, failureKey } from '../../server/maintenance-bot'

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
    expect(sent[0].body.text).toBe('#7 Merge the thing\nRuns at 13:00 unless you stop it.')
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain('w:' + 'a'.repeat(16))
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain('s:' + 'a'.repeat(16))
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
    vi.setSystemTime(new Date('2026-11-17T12:00:01Z'))
    expect((await (await bot('/actions/due')).json()).actions.map((row: { id: string }) => row.id)).toEqual(['a'.repeat(16)])
    expect((await bot('/actions/' + 'a'.repeat(16) + '/claim', 'POST')).status).toBe(200)
    // A second, overlapping run cannot claim it again.
    expect((await bot('/actions/' + 'a'.repeat(16) + '/claim', 'POST')).status).toBe(409)
    expect((await bot('/actions/' + 'a'.repeat(16) + '/result', 'POST', { status: 'done', result: 'merged abc' })).status).toBe(200)
    expect(sent.at(-1)).toMatchObject({ method: 'editMessageText', body: { message_id: 901 } })
    expect(sent.at(-1)!.body.text).toBe('✅ #7 Merge the thing')
  })

  it.each(['resubmit', 'scheduled pass'])('starts the full veto window on successful delivery by %s', async retry => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))
    const { bot, sent } = await fixture(), id = 'a'.repeat(16)
    const actions = [action(id, 'window', { windowHours: 2 })]
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: false }, { status: 503 }))
    await bot('/actions', 'POST', { actions })
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
    expect((await bot('/actions/' + id + '/claim', 'POST')).status).toBe(409)
    if (retry === 'resubmit') await bot('/actions', 'POST', { actions: [action(id, 'window', { windowHours: 0 })] })
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
    expect(sent).toHaveLength(1)
    expect(sent[0].body.text).toContain('13:00')
    vi.setSystemTime(new Date('2026-11-18T11:59:59Z'))
    expect((await bot('/actions/' + id + '/claim', 'POST')).status).toBe(409)
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'))
    expect((await bot('/actions/' + id + '/claim', 'POST')).status).toBe(200)
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

  it('shows the reason only after Why?, and keeps the other buttons', async () => {
    const { bot, sent, press } = await fixture()
    await bot('/actions', 'POST', { actions: [action('f'.repeat(16), 'ask')] })
    expect(sent[0].body.text).toBe('#7 Merge the thing\nNeeds your OK.')
    await press('w:' + 'f'.repeat(16))
    const edit = sent.find(item => item.method === 'editMessageText')!
    expect(edit.body.text).toBe('#7 Merge the thing\nNeeds your OK.\nGreen and reviewed.')
    expect(JSON.stringify(edit.body.reply_markup)).not.toContain('w:')
    expect(JSON.stringify(edit.body.reply_markup)).toContain('g:' + 'f'.repeat(16))
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
  })

  it('keeps the owner’s reply to an action as a lesson, lists and forgets it, and ignores anyone else', async () => {
    const { bot, hook, sent } = await fixture()
    await bot('/actions', 'POST', { actions: [action('a'.repeat(16), 'window', { kind: 'shout_reply', summary: 'Shoutbox: Tell a member NRPN is not a module yet', windowHours: 1 })] })
    const message = sent.find(item => item.method === 'sendMessage')!, id = 901
    expect(message.body.text).toContain('Shoutbox: Tell a member NRPN')
    const say = (text: string, chat = Number(CHAT), reply?: number) => hook({ message: { text, chat: { id: chat }, ...(reply ? { reply_to_message: { message_id: reply } } : {}) } })
    await say('feature requests go to the forum, never answer them in the shoutbox', 1, id)
    expect((await (await bot('/lessons')).json()).lessons).toEqual([])
    await say('  feature requests go to the forum,\n never answer them in the shoutbox ', Number(CHAT), id)
    expect((await (await bot('/lessons')).json()).lessons).toEqual([{ kind: 'shout_reply', summary: 'Shoutbox: Tell a member NRPN is not a module yet', why: 'feature requests go to the forum, never answer them in the shoutbox' }])
    await say('/lessons')
    expect(sent.at(-1)!.body.text).toBe('1. feature requests go to the forum, never answer them in the shoutbox\n   on: Shoutbox: Tell a member NRPN is not a module yet\n/forget <number> removes one.')
    await say('not one of yours', Number(CHAT), 5)
    expect(sent.at(-1)!.body.text).toContain('Reply to one of my action messages')
    await say('/forget 1')
    expect((await (await bot('/lessons')).json()).lessons).toEqual([])
    // The weekly usage record travels in the state like the fingerprint.
    await bot('/state', 'PUT', { usage: '{"week":"2026-11-23"}' })
    expect((await (await bot('/state')).json()).usage).toBe('{"week":"2026-11-23"}')
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

  it('lists the open to-dos in Telegram, urgent first, only to the owner', async () => {
    const { bot, hook, sent } = await fixture()
    const texts = () => sent.filter(item => item.method === 'sendMessage').map(item => item.body.text)
    await hook({ message: { text: '/todos', chat: { id: Number(CHAT) } } })
    expect(texts()).toEqual(['No open to-dos.'])
    await bot('/todos', 'POST', { todos: [
      { id: '8'.repeat(16), target: 0, command: 'npm run board -- reply ' + '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), note: 'twwwy asks about Kits', urgent: false },
      { id: '9'.repeat(16), target: 1690, command: '/modwerk-fix-issue 1690', note: 'Euclid NOTCH stays audible', urgent: true },
    ] })
    await hook({ message: { text: '/todos@modwerk_bot', chat: { id: Number(CHAT) } } })
    expect(texts().at(-1)).toBe('2 open to-dos, for /modwerk-todo at your computer:\n⚠️ #1690 Euclid NOTCH stays audible\n   /modwerk-fix-issue 1690\n• twwwy asks about Kits\n   npm run board -- reply 00000000-0000-0000-0000-000000000000')
    await hook({ message: { text: '/todos', chat: { id: 1 } } })
    expect(texts()).toHaveLength(3)
  })

  it('keeps a to-do list the bot adds to and only the owner reads and ticks off', async () => {
    const { bot, env, db } = await fixture()
    Object.assign(env, { GITHUB_OAUTH_CLIENT_ID: 'client', GITHUB_OAUTH_CLIENT_SECRET: 'secret' })
    const client = await digest('client:secret')
    const session = async (login: string, token: string, id: number) => {
      db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(login, login, id, login)
      db.prepare("INSERT INTO developer_sessions(token_hash,user_id,client_hash,expires,purpose) VALUES(?,?,?,?,'board')").run(await digest(token), login, client, 4102444800)
    }
    await session('repeat98', '1'.repeat(64), 1)
    await session('mallory', '2'.repeat(64), 2)
    const as = (token: string, path: string, method = 'GET', body?: unknown) => handleCommunity(new Request('https://api.example.test/api/maintenance-bot' + path, {
      method, headers: { 'X-Modwerk-Developer': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body),
    }), env)
    const todo = { id: '9'.repeat(16), target: 1386, command: '/modwerk-fix-issue 1386', note: 'USB base update  stuck', urgent: true }
    expect((await bot('/todos', 'POST', { todos: [{ ...todo, command: 'rm -rf /' }] })).status).toBe(400)
    await bot('/todos', 'POST', { todos: [{ ...todo, id: '8'.repeat(16), target: 5, command: '/modwerk-pr-ready 5', note: 'refresh', urgent: false }, todo] })
    await bot('/todos', 'POST', { todos: [{ ...todo, note: 'USB base update stuck in recovery' }] })
    const list = await (await as('1'.repeat(64), '/todos')).json()
    expect(list.todos.map((row: { id: string; urgent: boolean; note: string }) => [row.id, row.urgent, row.note])).toEqual([['9'.repeat(16), true, 'USB base update stuck in recovery'], ['8'.repeat(16), false, 'refresh']])
    expect((await as('2'.repeat(64), '/todos')).status).toBe(401)
    expect((await as('2'.repeat(64), '/todos/' + '9'.repeat(16) + '/status', 'POST', { status: 'done' })).status).toBe(401)
    expect((await as('1'.repeat(64), '/todos', 'POST', { todos: [] })).status).toBe(401)
    expect((await as('1'.repeat(64), '/actions/due')).status).toBe(401)
    expect((await as('1'.repeat(64), '/todos/' + '9'.repeat(16) + '/status', 'POST', { status: 'done' })).status).toBe(200)
    expect((await as('1'.repeat(64), '/todos/' + '9'.repeat(16) + '/status', 'POST', { status: 'done' })).status).toBe(404)
    // A finished to-do stays finished when the bot proposes the same work again.
    await bot('/todos', 'POST', { todos: [todo] })
    expect((await (await bot('/todos')).json()).todos.map((row: { id: string }) => row.id)).toEqual(['8'.repeat(16)])
  })

  it('shares to-dos about an issue or pull request as wanted tasks anyone can take, and keeps the others private', async () => {
    const { bot, db } = await fixture()
    const tasks = () => db.prepare("SELECT topic_key,body,priority,ended_reason FROM agent_messages WHERE user_id='tars' AND kind='wanted' AND topic_kind='issue' ORDER BY topic_key").all() as { topic_key: string; body: string; priority: string; ended_reason: string | null }[]
    const todo = (id: string, target: number, command: string, note: string, urgent = false) => ({ id: id.repeat(16), target, command, note, urgent })
    await bot('/todos', 'POST', { todos: [
      todo('1', 1680, '/modwerk-fix-issue 1680', 'Bar LED never green on MKII over USB; only ever run on an MKI', true),
      todo('2', 1763, '/modwerk-review-prs 1763', 'Needs an emulator run of the link'),
      todo('3', 0, '/modwerk-discord', 'a tester asks about fader CPU spikes'),
      todo('4', 1900, '/modwerk-fix-issue 1900', 'see src/engine/assets/x for the table'),
    ] })
    expect(await (await bot('/todos/share', 'POST')).json()).toEqual({ shared: 2 })
    await bot('/todos/share', 'POST')
    // Once each. The Discord one and the one the board's text rules refuse stay in the owner's list.
    expect(tasks()).toEqual([
      { topic_key: '1680', body: 'Bar LED never green on MKII over USB. only ever run on an MKI. To do it: /modwerk-fix-issue 1680.', priority: 'high', ended_reason: null },
      { topic_key: '1763', body: 'Needs an emulator run of the link. To do it: /modwerk-review-prs 1763.', priority: 'normal', ended_reason: null },
    ])
    // A task whose pull request merged finishes its to-do; a to-do that is settled ends its task.
    db.prepare("UPDATE agent_messages SET ended_at='2026-11-27T10:00:00.000Z',ended_reason='merged' WHERE topic_key='1680'").run()
    db.prepare("UPDATE maintenance_bot_todos SET status='dropped' WHERE target=1763").run()
    await bot('/todos/share', 'POST')
    expect(db.prepare("SELECT status FROM maintenance_bot_todos WHERE target=1680").get()).toEqual({ status: 'done' })
    expect(tasks().map(task => task.ended_reason)).toEqual(['merged', 'administrator'])
    await bot('/todos/share', 'POST')
    expect(tasks().length).toBe(2)
  })

  it('answers, closes and releases on the agent board as the owner, through the board’s own rules', async () => {
    const { bot, db } = await fixture()
    const now = new Date().toISOString(), thread = '11111111-1111-4111-8111-111111111111', claim = '22222222-2222-4222-8222-222222222222'
    db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run('alice', 'alice', 7, 'alice')
    db.prepare("INSERT INTO agent_messages(id,kind,topic_kind,topic_key,user_id,to_login,body,created_at,active_at) VALUES(?,'question','site','forum','alice','repeat98','Which hook?',?,?)").run(thread, now, now)
    db.prepare("INSERT INTO agent_claims(id,kind,claim_key,user_id,note,created_at,renewed_at) VALUES(?,'migration','0099','alice','',?,?)").run(claim, now, now)
    expect((await bot('/board/messages/' + thread + '/reply', 'POST', { body: 'See docs/AGENT_BOARD.md.' })).status).toBe(409)
    db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run('owner', 'Jannik', 1, 'repeat98')
    expect((await bot('/board/messages/' + thread + '/reply', 'POST', { body: 'See docs/AGENT_BOARD.md.' })).status).toBe(200)
    expect(db.prepare("SELECT user_id,body FROM agent_messages WHERE parent_id=?").get(thread)).toEqual({ user_id: 'owner', body: 'See docs/AGENT_BOARD.md.' })
    expect((await bot('/board/messages/' + thread + '/reply', 'POST', { body: 'x'.repeat(501) })).status).toBe(400)
    // An agent's question to TARS gets TARS's own answer (migration 0094 gives it the board name).
    expect((await bot('/board/messages/' + thread + '/reply', 'POST', { body: 'TARS here: hook 39 is free.', as: 'tars' })).status).toBe(200)
    expect(db.prepare("SELECT u.github_login AS login FROM agent_messages m JOIN users u ON u.id=m.user_id WHERE m.parent_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1").get(thread)).toEqual({ login: 'tars' })
    expect((await bot('/board/claims/' + thread + '/reply', 'POST', {})).status).toBe(404)
    expect((await bot('/board/claims/' + claim + '/release', 'POST', {}, 'x'.repeat(64))).status).toBe(401)
    expect((await bot('/board/claims/' + claim + '/release', 'POST', {})).status).toBe(200)
    expect(db.prepare('SELECT released_reason FROM agent_claims WHERE id=?').get(claim)).toEqual({ released_reason: 'administrator' })
    expect((await bot('/board/claims/' + claim + '/release', 'POST', {})).status).toBe(404)
    expect((await bot('/board/messages/' + thread + '/close', 'POST', {})).status).toBe(200)
    expect((await bot('/board/messages/' + thread + '/reply', 'POST', { body: 'late' })).status).toBe(404)
    // A board action has no pull request number.
    expect((await bot('/actions', 'POST', { actions: [{ ...action('7'.repeat(16), 'window'), kind: 'board_reply', target: 0 }] })).status).toBe(200)
    expect((await bot('/actions', 'POST', { actions: [{ ...action('6'.repeat(16), 'window'), target: 0 }] })).status).toBe(400)
  })

  it('tells the owner about a new urgent to-do at once, and only once', async () => {
    const { bot, sent } = await fixture()
    const red = { id: '5'.repeat(16), target: 0, command: 'gh run view 123 --log-failed', note: 'main is red: Deploy community Worker at abc', urgent: true }
    await bot('/todos', 'POST', { todos: [red, { ...red, id: '4'.repeat(16), urgent: false, command: '/modwerk-diagnostics', note: 'New: link_failed:timeout (3)' }] })
    await bot('/todos', 'POST', { todos: [red] })
    expect(sent.filter(item => item.method === 'sendMessage').map(item => item.body.text)).toEqual(['⚠️ main is red: Deploy community Worker at abc\nTo-do: /modwerk-todo'])
  })

  it('counts shared diagnostics by failure, never by person', async () => {
    const { bot, db } = await fixture()
    expect(failureKey({ event: 'link_failed', failure: 'timeout', id: 'x', phase: 'claim' })).toBe('link_failed:timeout')
    expect(failureKey({ event: 'sync_kept', id: 'x' })).toBeNull()
    expect(failureKey({ kind: 'freeze', seq: 1 })).toBe('incident:freeze')
    db.prepare("INSERT INTO octatrack_guest_diagnostic_consent(guest_id,enabled,version,changed_at) VALUES('g',1,'1',?)").run(new Date().toISOString())
    const event = (n: number, ago: number) => db.prepare('INSERT INTO octatrack_guest_diagnostic_events(guest_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run('g', 'e' + n, '1', JSON.stringify({ event: 'link_failed', failure: 'timeout', id: 'e' + n, phase: 'claim' }), new Date(Date.now() - ago * 3600000).toISOString())
    event(1, 1); event(2, 2); event(3, 50)
    expect(await (await bot('/diagnostics')).json()).toEqual({ failures: [{ key: 'link_failed:timeout', today: 2, week: 1 }] })
  })

  it('remembers where upstream was', async () => {
    const { bot } = await fixture()
    expect((await bot('/state', 'PUT', {})).status).toBe(400)
    await bot('/state', 'PUT', { upstream: '{"elekloader":"abc"}' })
    expect((await (await bot('/state')).json()).upstream).toBe('{"elekloader":"abc"}')
  })

  it('answers in the forum and the shoutbox as TARS, through the site’s own handlers, only while nobody has', async () => {
    const { bot, db } = await fixture()
    db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES('ana','Ana','ana',1)").run()
    db.prepare("INSERT INTO users(id,display_name,username,email_verified,is_admin) VALUES('jannik','Jannik','jannik',1,1)").run()
    db.prepare("INSERT INTO forum_threads(id,user_id,title,category) VALUES('t1','ana','Keep does nothing','general')").run()
    db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES('p1','t1','ana','I press Keep and nothing happens. What am I missing?')").run()
    db.prepare("INSERT INTO forum_shouts(id,user_id,body) VALUES('s1','ana','anyone know how to undo a set?')").run()
    const activity = await (await bot('/forum')).json()
    expect(activity.threads[0]).toMatchObject({ id: 't1', posts: [{ id: 'p1', author: 'ana', helper: false }] })
    expect(activity.shouts).toMatchObject([{ id: 's1', author: 'ana', helper: false }])
    expect((await bot('/forum/threads/t1/reply', 'POST', { body: 'Hi Ana!', after: 'p0' })).status).toBe(409)
    expect((await bot('/forum/threads/t1/reply', 'POST', { body: 'Hi Ana! After Keep, power the Octatrack off and on once.', after: 'p1' })).status).toBe(200)
    expect(db.prepare("SELECT user_id,body FROM forum_posts WHERE thread_id='t1' AND user_id='tars'").get()).toEqual({ user_id: 'tars', body: 'Hi Ana! After Keep, power the Octatrack off and on once.' })
    // The thread now ends with TARS's own post: nothing more until Ana writes again.
    const last = (db.prepare("SELECT id FROM forum_posts WHERE user_id='tars'").get() as { id: string }).id
    expect((await bot('/forum/threads/t1/reply', 'POST', { body: 'Again', after: last })).status).toBe(409)
    expect((await bot('/forum/shouts/s1/reply', 'POST', { body: '@ana Undo is in the device panel.' })).status).toBe(200)
    expect((await bot('/forum/shouts/s1/reply', 'POST', { body: '@ana Twice' })).status).toBe(409)
    db.prepare("INSERT INTO forum_shouts(id,user_id,body) VALUES('s2','ana','thanks!')").run()
    db.prepare("INSERT INTO forum_shouts(id,user_id,body) VALUES('s3','jannik','np')").run()
    expect((await bot('/forum/shouts/s2/reply', 'POST', { body: '@ana You are welcome.' })).status).toBe(409)
  })

  it('starts its own runs on time from the Worker’s clock, once per slot and never while paused', async () => {
    const { env, db, hook } = await fixture()
    expect(dispatchSlot(new Date('2026-11-17T07:01:30Z'))).toEqual({ mode: 'daily', slot: '2026-11-17T07:00' })
    expect(dispatchSlot(new Date('2026-11-17T09:36:00Z'))).toEqual({ mode: 'pass', slot: '2026-11-17T09:35' })
    expect(dispatchSlot(new Date('2026-11-17T09:10:00Z'))).toBeNull()
    const calls: { url: string; body: unknown }[] = []
    let status = 204
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return url.includes('api.telegram.org') ? Response.json({ ok: true, result: { message_id: 1 } }) : new Response(null, { status })
    }))
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T09:05:10Z'))
    expect(calls).toEqual([])
    env.MAINTENANCE_BOT_GITHUB_TOKEN = 'github_pat_test'
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T09:05:10Z'))
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T09:05:50Z'))
    expect(calls).toEqual([{ url: 'https://api.github.com/repos/repeat98/modwerk/actions/workflows/maintenance-bot.yml/dispatches', body: { ref: 'main', inputs: { mode: 'pass' } } }])
    await hook({ message: { text: '/pause', chat: { id: Number(CHAT) } } })
    calls.length = 0
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T09:35:10Z'))
    expect(calls.filter(call => call.url.includes('github'))).toEqual([])
    await hook({ message: { text: '/resume', chat: { id: Number(CHAT) } } })
    status = 401; calls.length = 0
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T10:05:10Z'))
    await dispatchMaintenance(env, env.DB!, new Date('2026-11-17T10:35:10Z'))
    expect(calls.filter(call => call.url.includes('sendMessage')).length).toBe(1)
    expect(JSON.parse((db.prepare("SELECT value FROM maintenance_bot_state WHERE key='dispatch'").get() as { value: string }).value)).toEqual({ slot: '2026-11-17T10:35', mode: 'pass', ok: false, status: 401 })
  })

  it('merges in the owner’s name at exactly the checked commit', async () => {
    // The unattended owner path continues to use the same endpoint without a human review receipt.
    const { bot, env } = await fixture()
    const sha = 'a'.repeat(40), calls: { url: string; auth: string; body: unknown }[] = []
    expect((await bot('/merge', 'POST', { number: 7, sha, method: 'squash' })).status).toBe(503)
    env.MAINTENANCE_BOT_GITHUB_TOKEN = 'github_pat_owner'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get('Authorization')!, body: JSON.parse(String(init.body)) })
      return calls.length === 1 ? Response.json({ merged: true, sha: 'b'.repeat(40) }) : Response.json({ message: 'Head branch was modified.' }, { status: 409 })
    }))
    expect((await bot('/merge', 'POST', { number: 7, sha: 'nope', method: 'squash' })).status).toBe(400)
    expect(await (await bot('/merge', 'POST', { number: 7, sha, method: 'squash' })).json()).toEqual({ merged: true, sha: 'b'.repeat(40) })
    expect(calls[0]).toEqual({ url: 'https://api.github.com/repos/repeat98/modwerk/pulls/7/merge', auth: 'Bearer github_pat_owner', body: { sha, merge_method: 'squash' } })
    const refused = await bot('/merge', 'POST', { number: 7, sha, method: 'merge' })
    expect([refused.status, (await refused.json()).error]).toEqual([409, 'GitHub refused the merge: Head branch was modified.'])
  })

  it('records the reviewed commit and human decision, respecting paused, stopped and repeated requests', async () => {
    const { bot,env,db } = await fixture()
    env.MAINTENANCE_BOT_GITHUB_TOKEN = 'owner-token'
    const head = 'b'.repeat(40), base = 'a'.repeat(40), merged = 'c'.repeat(40)
    const body = { number: 12, sha: head, method: 'merge', review: { base,id:18,actorId:42,login:'device-tester',role:'device-reviewer',machine:'digitakt',module:'digitakt-example',registered:true,checkRun:76 } }
    const github = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Response.json({merged:true,sha:merged})
      if (url.endsWith('/reviews/18')) return Response.json({state:'APPROVED',commit_id:head,user:{id:42}})
      return Response.json({state:'open',draft:false,base:{ref:'main',sha:base},head:{sha:head}})
    })
    vi.stubGlobal('fetch',github)
    db.prepare("INSERT INTO maintenance_bot_state(key,value) VALUES('paused','1')").run()
    expect((await bot('/merge/reviewed','POST',body)).status).toBe(409)
    db.prepare("UPDATE maintenance_bot_state SET value='0' WHERE key='paused'").run()
    db.prepare("INSERT INTO maintenance_bot_actions(id,kind,target,tier,summary,reason,payload_json,status,due_at,created_at,updated_at) VALUES('v','merge',12,'ask','held','held',?,'vetoed',0,0,0)").run(JSON.stringify({head}))
    expect((await bot('/merge/reviewed','POST',body)).status).toBe(409)
    db.prepare("DELETE FROM maintenance_bot_actions WHERE id='v'").run()
    for (let i=0;i<2;i++) expect(await (await bot('/merge/reviewed','POST',body)).json()).toEqual({merged:true,sha:merged})
    expect(github).toHaveBeenCalledTimes(3)
    expect(db.prepare("SELECT status,result,payload_json FROM maintenance_bot_actions WHERE kind='review_merge'").get()).toMatchObject({ status:'done',result:merged,payload_json:JSON.stringify(body) })
  })

  it('drops a waiting action that can no longer happen, starts a waiting ask the policy now runs at once, and buzzes only for asks', async () => {
    const { bot, sent, db } = await fixture()
    await bot('/actions', 'POST', { actions: [action('a'.repeat(16), 'ask'), action('b'.repeat(16), 'window', { windowHours: 1 }), action('c'.repeat(16), 'ask', { kind: 'approve_run' })] })
    expect(sent.filter(item => item.method === 'sendMessage').map(item => item.body.disable_notification)).toEqual([false, true, false])
    expect((await bot('/actions/' + 'a'.repeat(16) + '/expire', 'POST', { result: 'it was closed in the meantime' })).status).toBe(200)
    expect(sent.at(-1)).toMatchObject({ method: 'editMessageText', body: { text: '➖ Dropped: #7 Merge the thing (it was closed in the meantime)' } })
    expect((await bot('/actions/' + 'a'.repeat(16) + '/expire', 'POST', { result: 'again' })).status).toBe(409)
    // The same proposal, now a notice: the waiting ask runs. A stopped one stays stopped.
    await bot('/actions', 'POST', { actions: [action('c'.repeat(16), 'notify', { kind: 'approve_run' })] })
    expect((await (await bot('/actions/due')).json()).actions.map((row: { id: string }) => row.id)).toEqual(['c'.repeat(16)])
    db.prepare("UPDATE maintenance_bot_actions SET status='vetoed' WHERE id=?").run('c'.repeat(16))
    await bot('/actions', 'POST', { actions: [action('c'.repeat(16), 'notify', { kind: 'approve_run' })] })
    expect((await (await bot('/actions/due')).json()).actions).toEqual([])
    // The map of what the last pass saw travels with the fingerprint.
    await bot('/state', 'PUT', { items: '{"p7":"abc"}' })
    expect((await (await bot('/state')).json()).items).toBe('{"p7":"abc"}')
  })

  it('keeps the fingerprint and splits long reports', async () => {
    const { bot, sent } = await fixture()
    expect((await bot('/state', 'PUT', { fingerprint: 'nope' })).status).toBe(400)
    await bot('/state', 'PUT', { fingerprint: 'f'.repeat(64) })
    expect((await (await bot('/state')).json()).fingerprint).toBe('f'.repeat(64))
    await bot('/report', 'POST', { text: ('line\n').repeat(2000) })
    expect(sent.filter(item => item.method === 'sendMessage').length).toBe(3)
    // The daily report keeps the chat's command menu current, so a new command shows without running setup again.
    expect(sent.find(item => item.method === 'setMyCommands')?.body.commands).toEqual(TELEGRAM_COMMANDS)
    expect(chunks('x'.repeat(9000)).map(part => part.length)).toEqual([4000, 4000, 1000])
  })
})
