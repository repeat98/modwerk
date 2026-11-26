import type { Database, Env, User } from './platform'
import { digest, HttpError, jsonBody, response } from './security'
import { finishPilotCase, pilotRecords, recordPilot } from './eval-pilot'
import { boardReply, boardUser, messageBody } from './agent-board'
import { forum } from './forum'
import { shoutbox } from './shoutbox'
import { avatarRoutes } from './avatars'

/**
 * The maintenance bot's ledger and its Telegram channel (docs/MAINTENANCE_BOT.md).
 * The GitHub job proposes and executes actions; this Worker only stores them, tells the owner, and records the
 * owner's Stop or Go. The tier comes from the job's trusted policy script, never from the model.
 */
export type BotTier = 'notify' | 'window' | 'ask'
type ActionRow = { id: string; kind: string; target: number; tier: BotTier; summary: string; reason: string; payload_json: string; status: string; due_at: number; telegram_message_id: number | null; decided_at: number | null; result: string | null; created_at: number; updated_at: number }

const TIERS = new Set<BotTier>(['notify', 'window', 'ask'])
const ID = /^[a-f0-9]{16}$/
const KIND = /^[a-z_]{2,24}$/
const TELEGRAM_LIMIT = 4000
const now = () => Math.floor(Date.now() / 1000)

function configured(env: Env) {
  const key = env.MAINTENANCE_BOT_KEY_SHA256?.trim().toLowerCase() ?? ''
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? '', chat = env.TELEGRAM_CHAT_ID?.trim() ?? '', secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? ''
  if (!/^[a-f0-9]{64}$/.test(key) || !token || !/^-?\d+$/.test(chat) || secret.length < 32) throw new HttpError(503, 'The maintenance bot is not set up.')
  return { key, token, chat, secret }
}

/** Equal-length strings compared without an early exit. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

export async function telegram(env: Env, method: string, body: Record<string, unknown>) {
  const { token } = configured(env)
  const reply = await fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await reply.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null
  if (!data?.ok) throw new Error('Telegram ' + method + ' failed: ' + (data?.description ?? reply.status))
  return data.result
}

/** Splits on line breaks so each Telegram message stays under its 4096-character limit. */
export function chunks(text: string, limit = TELEGRAM_LIMIT) {
  const parts: string[] = []
  let part = ''
  for (const line of text.split('\n')) {
    for (let start = 0; start < Math.max(line.length, 1); start += limit) {
      const piece = line.slice(start, start + limit)
      if (part && part.length + piece.length + 1 > limit) { parts.push(part); part = '' }
      part = part ? part + '\n' + piece : piece
    }
  }
  if (part.trim()) parts.push(part)
  return parts
}

/** The owner's local time; the owner lives in Berlin. */
const when = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
/** Two lines the owner can read at a glance: what, and what happens next. The reason shows only after Why?. */
function actionText(row: Pick<ActionRow, 'tier' | 'summary' | 'reason' | 'due_at'>, expanded = false) {
  const next = row.tier === 'ask' ? 'Needs your OK.' : 'Runs at ' + when(row.due_at) + ' unless you stop it.'
  return [row.summary, next, expanded && row.reason].filter(Boolean).join('\n')
}
const outcomeText = (mark: string, row: Pick<ActionRow, 'summary'>, detail = '') => mark + ' ' + row.summary + (detail ? ' (' + detail + ')' : '')
function buttons(row: Pick<ActionRow, 'id' | 'tier'>, expanded = false) {
  const go = { text: row.tier === 'ask' ? 'Approve' : 'Now', callback_data: 'g:' + row.id }, stop = { text: 'Stop', callback_data: 's:' + row.id }
  return { inline_keyboard: [[...(row.tier === 'ask' ? [go, stop] : [stop, go]), ...(expanded ? [] : [{ text: 'Why?', callback_data: 'w:' + row.id }])]] }
}

async function state(db: Database) {
  const rows = (await db.prepare('SELECT key,value FROM maintenance_bot_state').all<{ key: string; value: string }>()).results
  const value = (key: string) => rows.find(row => row.key === key)?.value ?? ''
  return { paused: value('paused') === '1', fingerprint: value('fingerprint'), items: value('items'), usage: value('usage'), upstream: value('upstream'), pilotReported: value('eval-pilot-reported') === '1' }
}
const setState = (db: Database, key: string, value: string) => db.prepare('INSERT INTO maintenance_bot_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run()

function proposal(value: unknown) {
  const item = value as Record<string, unknown>
  if (!item || typeof item !== 'object') throw new HttpError(400, 'Each action must be an object.')
  const { id, kind, target, tier, summary, reason, payload, windowHours } = item
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'An action id must be 16 hex digits.')
  if (typeof kind !== 'string' || !KIND.test(kind)) throw new HttpError(400, 'Unknown action kind.')
  // Board and Discord actions have no number: their thread, claim or message id is in the payload.
  if (!Number.isSafeInteger(target) || (target as number) < (/^(board|discord|forum|shout)_/.test(kind) ? 0 : 1)) throw new HttpError(400, 'An action needs a pull request or issue number.')
  if (typeof tier !== 'string' || !TIERS.has(tier as BotTier)) throw new HttpError(400, 'Unknown action tier.')
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 300) throw new HttpError(400, 'An action needs a summary of at most 300 characters.')
  if (typeof reason !== 'string' || reason.length > 1500) throw new HttpError(400, 'A reason has at most 1500 characters.')
  const json = JSON.stringify(payload ?? {})
  if (json.length > 16000) throw new HttpError(400, 'An action payload has at most 16000 characters.')
  const hours = typeof windowHours === 'number' && windowHours >= 0 && windowHours <= 168 ? windowHours : 12
  return { id, kind, target: target as number, tier: tier as BotTier, summary: summary.trim(), reason: reason.trim(), json, hours }
}

/**
 * Records new proposals once; a proposal the bot already made (same id) keeps its first decision. One exception:
 * an ask still waiting for the owner runs when the policy now lets it run at once (a first-time contributor's checks).
 */
async function propose(env: Env, db: Database, body: Record<string, unknown>) {
  if (!Array.isArray(body.actions) || body.actions.length > 50) throw new HttpError(400, 'Send at most 50 actions.')
  const items = body.actions.map(proposal), created: string[] = [], at = now()
  for (const item of items) {
    const status = item.tier === 'notify' ? 'approved' : 'pending'
    const due = item.tier === 'window' ? at + Math.round(item.hours * 3600) : at
    const inserted = await db.prepare(`INSERT INTO maintenance_bot_actions(id,kind,target,tier,summary,reason,payload_json,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tier='notify',status='approved',updated_at=excluded.updated_at WHERE maintenance_bot_actions.status='pending' AND maintenance_bot_actions.tier='ask' AND excluded.tier='notify' RETURNING id`)
      .bind(item.id, item.kind, item.target, item.tier, item.summary, item.reason, item.json, status, due, at, at).first()
    if (inserted) created.push(item.id)
    if (!inserted || item.tier !== 'notify') await deliverNotice(env, db, item.id)
  }
  return { created }
}

const PUBLIC = 'id,kind,target,tier,summary,reason,payload_json,status,due_at,decided_at,result,created_at,updated_at'
const publicRow = ({ payload_json, ...row }: Omit<ActionRow, 'telegram_message_id'>) => ({ ...row, payload: JSON.parse(payload_json) as unknown })

// Before delivery, due_at - created_at holds the original proposal's window, including for older rows.
// Reserve the send briefly so overlapping passes share one notice. A stalled sender can be retried.
async function deliverNotice(env: Env, db: Database, id: string) {
  const at = now(), lease = at + 90
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET updated_at=? WHERE id=? AND status='pending'
    AND tier IN ('ask','window') AND telegram_message_id IS NULL AND updated_at<=? RETURNING ${PUBLIC}`)
    .bind(lease, id, at).first<ActionRow>()
  if (!row) return
  const seconds = row.due_at - row.created_at
  try {
    const sent = await telegram(env, 'sendMessage', { chat_id: configured(env).chat, text: actionText({ ...row, due_at: at + seconds }), reply_markup: buttons(row), link_preview_options: { is_disabled: true }, disable_notification: row.tier === 'window' })
    if (!sent?.message_id) throw new Error('Missing Telegram message ID')
    const delivered = now()
    await db.prepare('UPDATE maintenance_bot_actions SET telegram_message_id=?,due_at=?,updated_at=? WHERE id=? AND updated_at=? AND telegram_message_id IS NULL')
      .bind(sent.message_id, delivered + seconds, delivered, id, lease).run()
  } catch (error) {
    await db.prepare('UPDATE maintenance_bot_actions SET updated_at=? WHERE id=? AND updated_at=? AND telegram_message_id IS NULL').bind(now(), id, lease).run()
    console.error('Maintenance bot could not send action ' + id + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

// Only what needs the owner makes the phone buzz: an ask, a failure, an urgent to-do. A window arrives silently.
const eligible = "status='approved' OR (status='pending' AND tier='window' AND telegram_message_id IS NOT NULL AND due_at<=?)"

async function due(env: Env, db: Database) {
  if ((await state(db)).paused) return { paused: true, actions: [] }
  const pending = await db.prepare(`SELECT id FROM maintenance_bot_actions WHERE status='pending' AND tier IN ('ask','window')
    AND telegram_message_id IS NULL AND updated_at<=? ORDER BY updated_at,id LIMIT 8`).bind(now()).all<{ id: string }>()
  for (const row of pending.results) await deliverNotice(env, db, row.id)
  const rows = (await db.prepare(`SELECT ${PUBLIC} FROM maintenance_bot_actions WHERE ${eligible} ORDER BY created_at LIMIT 50`).bind(now()).all<ActionRow>()).results
  return { paused: false, actions: rows.map(publicRow) }
}

/** One executor at a time: a run claims an action before acting, so two overlapping runs never post twice. */
async function claim(db: Database, id: string) {
  const at = now()
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET status='running',updated_at=? WHERE id=? AND (${eligible}) RETURNING id`).bind(at, id, at).first()
  if (!row) throw new HttpError(409, 'That action was decided, claimed or is not due.')
  return { ok: true }
}

async function finish(env: Env, db: Database, id: string, body: Record<string, unknown>) {
  const status = body.status, result = typeof body.result === 'string' ? body.result.slice(0, 1500) : ''
  if (status !== 'done' && status !== 'failed' && status !== 'expired') throw new HttpError(400, 'A result is done, failed or expired.')
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET status=?,result=?,updated_at=? WHERE id=? AND status='running' RETURNING ${PUBLIC},telegram_message_id`).bind(status, result, now(), id).first<ActionRow>()
  if (!row) throw new HttpError(409, 'That action is not claimed.')
  if (row.telegram_message_id) {
    const text = status === 'done' ? outcomeText('✅', row) : status === 'failed' ? outcomeText('❌ Failed:', row, result) : outcomeText('➖ Dropped:', row, 'changed since')
    await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text }).catch(() => undefined)
  }
  return { ok: true }
}

/** Drops an action that still waits but can no longer happen (closed, merged, new commits), and says so in Telegram. */
async function expire(env: Env, db: Database, id: string, body: Record<string, unknown>) {
  const result = typeof body.result === 'string' ? body.result.slice(0, 200) : ''
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET status='expired',result=?,updated_at=? WHERE id=? AND status='pending' RETURNING ${PUBLIC},telegram_message_id`).bind(result, now(), id).first<ActionRow>()
  if (!row) throw new HttpError(409, 'That action no longer waits.')
  if (row.telegram_message_id) await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text: outcomeText('➖ Dropped:', row, result) }).catch(() => undefined)
  return { ok: true }
}

async function recent(db: Database, hours: number) {
  const since = now() - Math.min(Math.max(hours, 1), 24 * 14) * 3600
  const rows = (await db.prepare(`SELECT ${PUBLIC} FROM maintenance_bot_actions WHERE updated_at>=? OR status IN ('pending','approved','running') ORDER BY updated_at DESC LIMIT 300`).bind(since).all<ActionRow>()).results
  return { ...(await state(db)), actions: rows.map(publicRow) }
}

/** The chat's command menu. The daily report sets it again, so a command added here shows without running setup. */
export const TELEGRAM_COMMANDS = [
  { command: 'status', description: 'What is waiting and what was done' }, { command: 'todos', description: 'Your open to-do list' },
  { command: 'lessons', description: 'What your replies taught the bot' },
  { command: 'pause', description: 'Stop all actions until /resume' }, { command: 'resume', description: 'Start again' },
]

async function report(env: Env, body: Record<string, unknown>) {
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 30000) throw new HttpError(400, 'A report is 1 to 30000 characters.')
  const { chat } = configured(env)
  await telegram(env, 'setMyCommands', { commands: TELEGRAM_COMMANDS }).catch(() => undefined)
  for (const text of chunks(body.text)) await telegram(env, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } })
  return { ok: true }
}

type TelegramUpdate = {
  callback_query?: { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number } } }
  message?: { text?: string; chat: { id: number }; reply_to_message?: { message_id: number } }
}

/**
 * How the bot learns (docs/MAINTENANCE_BOT.md, "How it improves"). The owner replies to an action's message with
 * a few words: why it was stopped, or what was wrong with it. That is kept as a lesson, and every later pass
 * reads the lessons as standing rules. They change what the model proposes, never the policy.
 */
type Lesson = { kind: string; summary: string; why: string; at: number }
const LESSONS = 60
async function lessons(db: Database) {
  const rows = (await db.prepare("SELECT key,value FROM maintenance_bot_state WHERE key LIKE 'lesson/%'").all<{ key: string; value: string }>()).results
  return rows.map(row => ({ key: row.key, ...JSON.parse(row.value) as Lesson })).sort((a, b) => b.at - a.at)
}
async function learn(env: Env, db: Database, messageId: number, text: string) {
  const why = text.trim().replace(/\s+/g, ' ').slice(0, 300)
  const row = await db.prepare('SELECT id,kind,summary FROM maintenance_bot_actions WHERE telegram_message_id=?').bind(messageId).first<{ id: string; kind: string; summary: string }>()
  if (row && why) {
    await setState(db, 'lesson/' + row.id, JSON.stringify({ kind: row.kind, summary: row.summary, why, at: now() } satisfies Lesson))
    for (const old of (await lessons(db)).slice(LESSONS)) await db.prepare('DELETE FROM maintenance_bot_state WHERE key=?').bind(old.key).run()
  }
  await telegram(env, 'sendMessage', { chat_id: configured(env).chat, text: row && why ? 'Noted as a rule for similar cases. /lessons lists them.' : 'Reply to one of my action messages to teach me something.', disable_notification: true }).catch(() => undefined)
}

async function decide(env: Env, db: Database, query: NonNullable<TelegramUpdate['callback_query']>) {
  const [verb, id] = (query.data ?? '').split(':')
  if ((verb !== 's' && verb !== 'g' && verb !== 'w') || !ID.test(id ?? '')) return 'Unknown button.'
  const at = now()
  if (verb === 'w') {
    const row = await db.prepare(`SELECT ${PUBLIC},telegram_message_id FROM maintenance_bot_actions WHERE id=?`).bind(id).first<ActionRow>()
    if (!row || !row.telegram_message_id || (row.status !== 'pending' && row.status !== 'approved')) return 'Already decided or finished.'
    await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text: actionText(row, true), reply_markup: buttons(row, true) }).catch(() => undefined)
    return ''
  }
  const row = verb === 's'
    ? await db.prepare(`UPDATE maintenance_bot_actions SET status='vetoed',decided_at=?,updated_at=? WHERE id=? AND status IN ('pending','approved') RETURNING ${PUBLIC},telegram_message_id`).bind(at, at, id).first<ActionRow>()
    : await db.prepare(`UPDATE maintenance_bot_actions SET status='approved',decided_at=?,updated_at=? WHERE id=? AND status='pending' RETURNING ${PUBLIC},telegram_message_id`).bind(at, at, id).first<ActionRow>()
  if (!row) return 'Already decided or finished.'
  const text = verb === 's' ? outcomeText('✋ Stopped:', row) : outcomeText('👍 Approved:', row, 'runs within 30 min')
  if (row.telegram_message_id) await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text }).catch(() => undefined)
  return verb === 's' ? 'Stopped' : 'Approved'
}

async function command(env: Env, db: Database, text: string) {
  const { chat } = configured(env), word = text.trim().split(/\s+/)[0]?.split('@')[0]?.toLowerCase()
  let reply: string
  if (word === '/pause') { await setState(db, 'paused', '1'); reply = 'Paused. The bot proposes and does nothing until /resume.' }
  else if (word === '/resume') { await setState(db, 'paused', '0'); reply = 'Resumed. Actions whose time has come run at the next hourly pass.' }
  else if (word === '/status' || word === '/start') {
    const { paused, actions } = await recent(db, 24)
    const count = (status: string) => actions.filter(action => action.status === status).length
    const last = JSON.parse((await db.prepare("SELECT value FROM maintenance_bot_state WHERE key='dispatch'").first<{ value: string }>())?.value ?? 'null') as { slot: string; ok: boolean } | null
    reply = (paused ? 'Paused.' : 'Running.') + (last ? ' Last start: ' + last.slot.slice(11) + ' UTC' + (last.ok ? '' : ' (failed)') + '.' : '') + ' Waiting: ' + count('pending') + '. Done today: ' + count('done') + (count('failed') ? ', failed: ' + count('failed') : '') + '.'
  } else if (word === '/lessons') {
    const all = await lessons(db)
    reply = all.length ? all.map((lesson, index) => (index + 1) + '. ' + lesson.why + '\n   on: ' + lesson.summary).join('\n') + '\n/forget <number> removes one.' : 'No lessons yet. Reply to one of my action messages with a few words on why.'
  } else if (word === '/forget') {
    const lesson = (await lessons(db))[Number(text.trim().split(/\s+/)[1]) - 1]
    if (lesson) await db.prepare('DELETE FROM maintenance_bot_state WHERE key=?').bind(lesson.key).run()
    reply = lesson ? 'Forgotten: ' + lesson.why : 'Send /forget with a number from /lessons.'
  } else if (word === '/todos' || word === '/todo') {
    const { todos } = await openTodos(db)
    reply = todos.length
      ? todos.length + ' open to-dos, for /modwerk-todo at your computer:\n' + todos.map(todo => (todo.urgent ? '⚠️ ' : '• ') + (todo.target ? '#' + todo.target + ' ' : '') + todo.note + '\n   ' + todo.command).join('\n')
      : 'No open to-dos.'
  } else return
  for (const text of chunks(reply)) await telegram(env, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } })
}

/** Telegram's webhook. It retries anything but a 200, so only a wrong secret is refused. */
async function webhook(request: Request, env: Env, db: Database) {
  const { chat, secret } = configured(env)
  if (!same(await digest(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''), await digest(secret))) throw new HttpError(403, 'Wrong webhook secret.')
  const update = await jsonBody(request, 64 * 1024) as TelegramUpdate
  const query = update.callback_query
  if (query) {
    // Only the owner's private chat decides; anyone else who finds the bot is ignored.
    const text = String(query.from?.id) === chat && String(query.message?.chat.id) === chat ? await decide(env, db, query) : 'Not yours.'
    await telegram(env, 'answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => undefined)
  } else if (update.message?.text && String(update.message.chat.id) === chat) {
    const about = update.message.reply_to_message?.message_id
    if (about && !update.message.text.startsWith('/')) await learn(env, db, about, update.message.text)
    else await command(env, db, update.message.text)
  }
  return response({ ok: true })
}

type TodoRow = { id: string; target: number; command: string; note: string; urgent: number; status: string; created_at: number; updated_at: number }
const COMMAND = /^(\/modwerk-[a-z-]{2,30}(?: [^\n]{1,100})?|npm run board -- (?:reply|followups) [0-9a-f-]{36}|gh run view \d{1,20} --log-failed)$/

/** Work for a session at the owner's computer. The bot adds and drops; /modwerk-todo lists and ticks off. */
async function addTodos(env: Env, db: Database, body: Record<string, unknown>) {
  if (!Array.isArray(body.todos) || body.todos.length > 30) throw new HttpError(400, 'Send at most 30 to-dos.')
  const at = now(), statements = body.todos.map(value => {
    const { id, target, command, note, urgent } = (value ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || !ID.test(id) || !Number.isSafeInteger(target) || (target as number) < 0) throw new HttpError(400, 'A to-do needs an id and a pull request or issue number (0 for the board).')
    if (typeof command !== 'string' || !COMMAND.test(command)) throw new HttpError(400, 'A to-do command is a /modwerk-* command on one line, or a board reply.')
    if (typeof note !== 'string' || !note.trim() || note.length > 200) throw new HttpError(400, 'A to-do note is 1 to 200 characters.')
    return db.prepare('INSERT INTO maintenance_bot_todos(id,target,command,note,urgent,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET note=excluded.note,urgent=excluded.urgent,updated_at=excluded.updated_at WHERE status=\'open\'')
      .bind(id, target, command, note.trim().replace(/\s+/g, ' '), urgent === true ? 1 : 0, at, at)
  })
  const known = new Set((await db.prepare('SELECT id FROM maintenance_bot_todos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(body.todos.map(todo => (todo as { id: string }).id))).all<{ id: string }>()).results.map(row => row.id))
  if (statements.length) await db.batch(statements)
  // An urgent to-do (a red main, the unit's safety) cannot wait for the morning report.
  for (const todo of body.todos as { id: string; target: number; note: string; urgent?: boolean }[]) {
    if (todo.urgent !== true || known.has(todo.id)) continue
    await telegram(env, 'sendMessage', { chat_id: configured(env).chat, text: '⚠️ ' + (todo.target ? '#' + todo.target + ' ' : '') + todo.note.trim() + '\nTo-do: /modwerk-todo', link_preview_options: { is_disabled: true } }).catch(() => undefined)
  }
  return { ok: true }
}

/** Shared diagnostics, counted by failure and never by person: the last 24 hours against the 7 days before. */
export function failureKey(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>, text = (key: string) => typeof value[key] === 'string' ? value[key] as string : ''
  const event = text('event') || (text('kind') ? 'incident' : ''), why = text('failure') || text('error') || text('refusal') || (event === 'incident' ? text('kind') : '')
  return /fail|error|refus|crash/.test(event) || why ? [event, why].filter(Boolean).join(':') : null
}
async function diagnostics(db: Database) {
  const day = 86400000, now = Date.now(), since = new Date(now - 8 * day).toISOString(), recent = new Date(now - day).toISOString()
  const rows = (await db.prepare('SELECT data_json,created_at FROM octatrack_diagnostic_events WHERE created_at>=? UNION ALL SELECT data_json,created_at FROM octatrack_guest_diagnostic_events WHERE created_at>=? LIMIT 20000').bind(since, since).all<{ data_json: string; created_at: string }>()).results
  const counts = new Map<string, { today: number; week: number }>()
  for (const row of rows) {
    let key: string | null
    try { key = failureKey(JSON.parse(row.data_json)) } catch { continue }
    if (!key) continue
    const entry = counts.get(key) ?? { today: 0, week: 0 }
    if (row.created_at >= recent) entry.today++; else entry.week++
    counts.set(key, entry)
  }
  return { failures: [...counts].map(([key, value]) => ({ key, ...value })).filter(row => row.today).sort((a, b) => b.today - a.today).slice(0, 20) }
}
const openTodos = async (db: Database) => ({ todos: (await db.prepare("SELECT id,target,command,note,urgent,created_at FROM maintenance_bot_todos WHERE status='open' ORDER BY urgent DESC,created_at LIMIT 100").all<TodoRow>()).results.map(row => ({ ...row, urgent: row.urgent === 1 })) })
async function todoStatus(db: Database, id: string, body: Record<string, unknown>) {
  if (body.status !== 'done' && body.status !== 'dropped') throw new HttpError(400, 'A to-do is done or dropped.')
  const row = await db.prepare("UPDATE maintenance_bot_todos SET status=?,updated_at=? WHERE id=? AND status='open' RETURNING id").bind(body.status, now(), id).first()
  if (!row) throw new HttpError(404, 'No open to-do has that id.')
  return { ok: true }
}

/**
 * The shared to-do list is the agent board's wanted tasks (docs/AGENT_BOARD.md). Every open to-do about a pull
 * request or issue stands there as a task from TARS that anyone signed in can take, and the two end together:
 * a task whose pull request merged finishes its to-do, a task someone closed drops it, and a to-do that is
 * settled ends its task. A to-do with no number (Discord, diagnostics, the bot's own health) can name a tester
 * and stays the owner's. A note the board's text rules refuse stays private too.
 */
async function shareTodos(db: Database) {
  const at = new Date().toISOString(), stamp = now()
  const todos = (await db.prepare("SELECT id,target,command,note,urgent FROM maintenance_bot_todos WHERE status='open' AND target>0").all<TodoRow>()).results
  const tasks = (await db.prepare("SELECT id,topic_key,body,ended_at,ended_reason FROM agent_messages WHERE user_id='tars' AND kind='wanted' AND topic_kind='issue' AND parent_id IS NULL AND (ended_at IS NULL OR ended_reason<>'expired')")
    .all<{ id: string; topic_key: string; body: string; ended_at: string | null; ended_reason: string | null }>()).results
  const of = (todo: TodoRow) => tasks.filter(task => task.topic_key === String(todo.target) && task.body.endsWith(' ' + todo.command + '.'))
  let shared = 0
  for (const todo of todos) {
    const mine = of(todo), ended = mine.find(task => task.ended_at)
    if (ended) await db.prepare("UPDATE maintenance_bot_todos SET status=?,updated_at=? WHERE id=? AND status='open'").bind(ended.ended_reason === 'merged' ? 'done' : 'dropped', stamp, todo.id).run()
    else if (mine.length) shared++
    else {
      let text
      try { text = messageBody(todo.note.replace(/\s*;\s*/g, '. ').replace(/[.\s]+$/, '') + '. To do it: ' + todo.command + '.') } catch { continue }
      await db.prepare("INSERT INTO agent_messages(id,kind,topic_kind,topic_key,user_id,body,priority,created_at,active_at) VALUES(?,'wanted','issue',?,'tars',?,?,?,?)")
        .bind(crypto.randomUUID(), String(todo.target), text, todo.urgent ? 'high' : 'normal', at, at).run()
      shared++
    }
  }
  const open = new Set(todos.flatMap(todo => of(todo).map(task => task.id)))
  for (const task of tasks) if (!task.ended_at && !open.has(task.id)) await db.prepare("UPDATE agent_messages SET ended_at=?,ended_reason='administrator' WHERE id=? AND ended_at IS NULL").bind(at, task.id).run()
  return { shared }
}

/** The bot acts on the agent board as the owner: replies through the board's own rules, closes and releases as administrator. */
async function boardAction(env: Env, db: Database, kind: string, id: string, body: Record<string, unknown>) {
  const at = new Date().toISOString()
  if (kind === 'reply') {
    // A question to TARS is answered by TARS; one to the owner, on the owner's behalf.
    const login = (env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk').split('/')[0].toLowerCase()
    const author = body.as === 'tars' ? await db.prepare("SELECT id FROM users WHERE id='tars' AND github_login='tars'").first<{ id: string }>()
      : await db.prepare('SELECT id FROM users WHERE lower(github_login)=? AND github_id IS NOT NULL').bind(login).first<{ id: string }>()
    if (!author) throw new HttpError(409, body.as === 'tars' ? 'TARS has no board name yet.' : 'The owner has no board account yet.')
    await boardReply(db, author.id, id, body.body, null, Date.now())
  } else if (kind === 'close') {
    const row = await db.prepare("UPDATE agent_messages SET ended_at=?,ended_reason='administrator' WHERE id=? AND parent_id IS NULL AND ended_at IS NULL RETURNING id").bind(at, id).first()
    if (!row) throw new HttpError(404, 'No open board thread has that id.')
  } else {
    const row = await db.prepare("UPDATE agent_claims SET released_at=?,released_reason='administrator' WHERE id=? AND released_at IS NULL RETURNING id").bind(at, id).first()
    if (!row) throw new HttpError(404, 'No active claim has that id.')
  }
  return { ok: true }
}

/**
 * TARS in the forum and the shoutbox (migration 0093). It reads recent activity, and it posts through the site's own
 * handlers as its member account, so validation, rate limits and notifications are the same as anyone's.
 */
const TARS = 'tars'
async function siteHelpers(env: Env, db: Database) {
  const login = (env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk').split('/')[0].toLowerCase()
  const rows = (await db.prepare("SELECT id FROM users WHERE id=? OR is_admin=1 OR role='owner' OR lower(github_login)=?").bind(TARS, login).all<{ id: string }>()).results
  return new Set(rows.map(row => row.id))
}
async function forumActivity(env: Env, db: Database) {
  const since = new Date(Date.now() - 3 * 86400000).toISOString().replace('T', ' ').slice(0, 19), us = await siteHelpers(env, db)
  const threads = (await db.prepare("SELECT t.id,t.title,COALESCE(t.section,t.category) AS section,t.locked FROM forum_threads t WHERE t.hidden=0 AND t.updated_at>=? ORDER BY t.updated_at DESC LIMIT 40").bind(since).all<{ id: string; title: string; section: string; locked: number }>()).results
  const out = []
  for (const thread of threads) {
    const posts = (await db.prepare('SELECT p.id,p.body,p.created_at,p.user_id,u.username FROM forum_posts p JOIN users u ON u.id=p.user_id WHERE p.thread_id=? AND p.hidden=0 ORDER BY p.created_at DESC,p.rowid DESC LIMIT 6').bind(thread.id).all<{ id: string; body: string; created_at: string; user_id: string; username: string | null }>()).results.reverse()
    out.push({ id: thread.id, title: thread.title, section: thread.section, locked: !!thread.locked, posts: posts.map(post => ({ id: post.id, author: post.username ?? 'Modwerk', helper: us.has(post.user_id), at: post.created_at, body: post.body.slice(0, 800) })) })
  }
  const shouts = (await db.prepare('SELECT s.id,s.body,s.created_at,s.user_id,u.username FROM forum_shouts s JOIN users u ON u.id=s.user_id WHERE s.hidden=0 AND s.created_at>=? ORDER BY s.rowid DESC LIMIT 60').bind(since).all<{ id: string; body: string; created_at: string; user_id: string; username: string | null }>()).results.reverse()
  return { threads: out, shouts: shouts.map(shout => ({ id: shout.id, author: shout.username, helper: us.has(shout.user_id), at: shout.created_at, body: shout.body })) }
}
async function tarsUser(db: Database) {
  const tars = await db.prepare('SELECT id,display_name,username,avatar_id,email_verified,suspended,beta_tester FROM users WHERE id=?').bind(TARS).first<User>()
  if (!tars?.username || tars.suspended) throw new HttpError(409, 'The TARS account is missing or suspended.')
  // A system account, not a member (migration 0093): it counts as verified only for the bot's own posts.
  return { ...tars, email_verified: 1 }
}
/** Posts as TARS through a site handler, as if TARS had sent the request itself. */
async function asTars(db: Database, handler: typeof shoutbox, path: string, body: unknown) {
  const tars = await tarsUser(db)
  const request = new Request('https://bot.internal' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'maintenance-bot' }, body: JSON.stringify(body) })
  const result = await handler(request, db, tars, false)
  if (!result || result.status >= 300) throw new HttpError(result?.status ?? 500, 'The site refused the post.')
  return { ok: true }
}
/** A reply only while the thread still ends with the post the bot read, and that post is not from a helper. */
async function forumReply(env: Env, db: Database, thread: string, body: Record<string, unknown>) {
  const last = await db.prepare('SELECT id,user_id FROM forum_posts WHERE thread_id=? AND hidden=0 ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(thread).first<{ id: string; user_id: string }>()
  if (!last || last.id !== body.after || (await siteHelpers(env, db)).has(last.user_id)) throw new HttpError(409, 'Someone answered in the meantime.')
  return await asTars(db, forum, '/api/forum/threads/' + thread + '/replies', { body: body.body })
}
/** A shout reply only while no helper has written in the shoutbox since. */
async function shoutReply(env: Env, db: Database, shout: string, body: Record<string, unknown>) {
  const row = await db.prepare('SELECT rowid AS n,user_id FROM forum_shouts WHERE id=? AND hidden=0').bind(shout).first<{ n: number; user_id: string }>()
  const us = await siteHelpers(env, db)
  if (!row || us.has(row.user_id)) throw new HttpError(409, 'That message is gone or from a helper.')
  const later = (await db.prepare('SELECT user_id FROM forum_shouts WHERE rowid>? AND hidden=0').bind(row.n).all<{ user_id: string }>()).results
  if (later.some(next => us.has(next.user_id))) throw new HttpError(409, 'Someone answered in the meantime.')
  return await asTars(db, shoutbox, '/api/forum/shouts', { body: body.body })
}

/** The bot's key, or (for the to-do list only) the owner's own board session from `npm run board -- login`. */
async function caller(request: Request, env: Env, db: Database, key: string) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S{32,200})$/)?.[1] ?? ''
  if (bearer && same(await digest(bearer), key)) return 'bot'
  const user = await boardUser(request, env, db), owner = (env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk').split('/')[0].toLowerCase()
  return user?.github_login.toLowerCase() === owner ? 'owner' : null
}

/**
 * The bot's clock. GitHub runs scheduled workflows hours late in this repository, so the Worker's 5-minute cron starts
 * the workflow itself: a pass at :05 and :35, the daily run at 07:00 UTC. A slot starts once, and not while paused.
 * Needs MAINTENANCE_BOT_GITHUB_TOKEN, a fine-grained token for this repository with Actions: read and write.
 */
export function dispatchSlot(now: Date) {
  const minute = Math.floor(now.getUTCMinutes() / 5) * 5, hour = now.getUTCHours()
  const mode = hour === 7 && minute === 0 ? 'daily' : minute === 5 || minute === 35 ? 'pass' : null
  return mode && { mode, slot: now.toISOString().slice(0, 11) + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') }
}
export async function dispatchMaintenance(env: Env, db: Database, now = new Date()) {
  const token = env.MAINTENANCE_BOT_GITHUB_TOKEN?.trim(), due = dispatchSlot(now)
  if (!token || !due || !env.MAINTENANCE_BOT_KEY_SHA256) return
  const current = await state(db)
  if (current.paused) return
  // Claim the slot first, so a retried cron never starts the same run twice.
  const claimed = await db.prepare("INSERT INTO maintenance_bot_state(key,value) VALUES('slot',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value RETURNING value").bind(due.slot).first()
  if (!claimed) return
  const repository = env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk'
  const reply = await fetch('https://api.github.com/repos/' + repository + '/actions/workflows/maintenance-bot.yml/dispatches', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'modwerk-maintenance-bot', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: due.mode } }),
  }).catch(() => null)
  const ok = reply?.status === 204
  await setState(db, 'dispatch', JSON.stringify({ slot: due.slot, mode: due.mode, ok, status: reply?.status ?? 0 }))
  if (ok) return
  console.error('Maintenance bot could not start its ' + due.mode + ' run: HTTP ' + (reply?.status ?? 'no answer'))
  // One Telegram line a day at most: the bot is silently not running otherwise.
  const day = due.slot.slice(0, 10)
  if (await db.prepare("INSERT INTO maintenance_bot_state(key,value) VALUES('dispatch_alert',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value RETURNING value").bind(day).first())
    await telegram(env, 'sendMessage', { chat_id: configured(env).chat, text: '⚠️ The maintenance bot could not start its run (GitHub said ' + (reply?.status ?? 'nothing') + '). Its GitHub token may have expired: see docs/MAINTENANCE_BOT.md.' }).catch(() => undefined)
}

/**
 * Merges for the bot in the owner's name, with MAINTENANCE_BOT_GITHUB_TOKEN (Contents and Pull requests: write).
 * The site publishes only owner merges (scripts/release-approval.mjs), and an owner merge starts the push workflows.
 * GitHub refuses unless the head is still exactly the commit the bot checked.
 */
async function mergeAsOwner(env: Env, body: Record<string, unknown>, message?: string) {
  const token = env.MAINTENANCE_BOT_GITHUB_TOKEN?.trim(), { number, sha, method } = body
  if (!token) throw new HttpError(503, 'The bot has no GitHub token to merge with.')
  if (!Number.isSafeInteger(number) || (number as number) < 1 || typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha) || (method !== 'merge' && method !== 'squash')) throw new HttpError(400, 'A merge needs a number, the checked commit and merge or squash.')
  const repository = env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk'
  const reply = await fetch('https://api.github.com/repos/' + repository + '/pulls/' + number + '/merge', {
    method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'modwerk-maintenance-bot', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha, merge_method: method, ...(message ? { commit_message: message } : {}) }),
  })
  const result = await reply.json().catch(() => null) as { merged?: boolean; sha?: string; message?: string } | null
  if (!reply.ok || !result?.merged || !result.sha) throw new HttpError(409, 'GitHub refused the merge: ' + (result?.message ?? 'HTTP ' + reply.status))
  return { merged: true, sha: result.sha }
}

/** Save the human approval before sending the merge to GitHub. */
async function reviewedMerge(env: Env, db: Database, body: Record<string, unknown>) {
  if (!body.review || typeof body.review !== 'object') throw new HttpError(400, 'A review receipt is required.')
  const review = body.review as Record<string, unknown>, number = Number(body.number)
  const { base, id, actorId, role, login, checkRun } = review
  if (!Number.isSafeInteger(number) || number < 1 || body.method !== 'merge' || !/^[a-f0-9]{40}$/.test(String(base)) ||
    !/^[a-f0-9]{40}$/.test(String(body.sha)) || ![id, actorId, checkRun].every(n => Number.isSafeInteger(n) && Number(n) > 0) ||
    !/^[a-z0-9-]{1,39}$/i.test(String(login)) || !['maintainer','device-reviewer'].includes(String(role))) throw new HttpError(400, 'Invalid review receipt.')
  if ((await state(db)).paused) throw new HttpError(409, 'Maintenance is paused.')
  const veto = await db.prepare("SELECT 1 FROM maintenance_bot_actions WHERE target=? AND kind='merge' AND status='vetoed' AND json_extract(payload_json,'$.head')=?").bind(number,body.sha).first()
  if (veto) throw new HttpError(409, 'The owner stopped this merge.')
  const key = (await digest('github-review:' + number + ':' + id)).slice(0,16), stamp = now()
  const summary = 'Merge #' + number + ' approved by @' + login
  const claim = await db.prepare(`INSERT INTO maintenance_bot_actions(id,kind,target,tier,summary,reason,payload_json,status,due_at,decided_at,created_at,updated_at)
    VALUES(?,'review_merge',?,'notify',?,?,?,'running',?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status='running',updated_at=excluded.updated_at WHERE status='failed' OR (status='running' AND updated_at<?)`)
    .bind(key,number,summary,String(role),JSON.stringify(body),stamp,stamp,stamp,stamp,stamp-300).run()
  if (!claim.meta.changes) {
    const row = await db.prepare('SELECT status,result FROM maintenance_bot_actions WHERE id=?').bind(key).first<ActionRow>()
    if (row?.status === 'done') return { merged: true, sha: row.result }
    throw new HttpError(409, 'This review is being processed.')
  }
  const message = ['Modwerk reviewed merge', 'Base: ' + base, 'Head: ' + body.sha, 'Review: ' + id, 'Approved by: ' + login + ' (' + actorId + ', ' + role + ')'].join('\n')
  const read = async (path: string) => {
    const token = env.MAINTENANCE_BOT_GITHUB_TOKEN?.trim()
    if (!token) throw new HttpError(503, 'The bot has no GitHub token to merge with.')
    const repo = env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk'
    const reply = await fetch('https://api.github.com/repos/' + repo + path, { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'modwerk-maintenance-bot' }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    if (!reply.ok) throw new HttpError(502, 'Unable to verify reviewed merge on GitHub.')
    return reply.json()
  }
  try {
    const pull = await read('/pulls/' + number) as { state: string; draft: boolean; merged: boolean; merge_commit_sha: string; head: { sha: string }; base: { ref: string; sha: string } }
    let result
    if (pull.merged) {
      // Recover a successful GitHub write if the Worker stopped before recording its result.
      const commit = await read('/git/commits/' + pull.merge_commit_sha) as { message: string; parents: { sha: string }[] }
      if (!commit.message.endsWith('\n\n' + message) || commit.parents.length !== 2 || commit.parents[0].sha !== base || commit.parents[1].sha !== body.sha) throw new HttpError(409, 'This PR was merged under a different decision.')
      result = { merged: true, sha: pull.merge_commit_sha }
    } else {
      if (pull.state !== 'open' || pull.draft || pull.base.ref !== 'main' || pull.base.sha !== base || pull.head.sha !== body.sha) throw new HttpError(409, 'The reviewed PR changed before merge.')
      const decision = await read('/pulls/' + number + '/reviews/' + id) as { state: string; commit_id: string; user: { id: number } }
      if (decision.state !== 'APPROVED' || decision.commit_id !== body.sha || decision.user.id !== actorId) throw new HttpError(409, 'The GitHub approval changed before merge.')
      result = await mergeAsOwner(env, body, message)
    }
    await db.prepare("UPDATE maintenance_bot_actions SET status='done',result=?,updated_at=? WHERE id=?").bind(result.sha,now(),key).run()
    return result
  } catch (error) {
    await db.prepare("UPDATE maintenance_bot_actions SET status='failed',result=?,updated_at=? WHERE id=?").bind(String(error).slice(0,200),now(),key).run()
    throw error
  }
}

/** Routes under /api/maintenance-bot/. They run server-to-server, before the Origin check. */
export async function maintenanceBotRoutes(request: Request, env: Env, db: Database, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/maintenance-bot/')) return null
  const route = path.slice('/api/maintenance-bot'.length), method = request.method
  if (route === '/telegram' && method === 'POST') return await webhook(request, env, db)
  const who = await caller(request, env, db, configured(env).key)
  const todo = route.match(/^\/todos\/([a-f0-9]{16})\/status$/)
  if (who && route === '/todos' && method === 'GET') return response(await openTodos(db))
  if (who && todo && method === 'POST') return response(await todoStatus(db, todo[1], await jsonBody(request)))
  if (who && route === '/lessons' && method === 'GET') return response({ lessons: (await lessons(db)).map(({ kind, summary, why }) => ({ kind, summary, why })) })
  if (who !== 'bot') throw new HttpError(401, who ? 'Only the bot may do that.' : 'Wrong maintenance bot key. The owner signs in with npm run board -- login.')
  if (route === '/eval-pilot' && method === 'GET') return response({ records: await pilotRecords(db) })
  const pilotCase = route.match(/^\/eval-pilot\/([1-9]\d{0,6})$/)
  if (method === 'POST' && (route === '/eval-pilot' || pilotCase)) {
    if ((await state(db)).paused) throw new HttpError(409, 'Maintenance is paused.')
    const body = await jsonBody(request)
    if (pilotCase) await finishPilotCase(db, Number(pilotCase[1]), body)
    else await recordPilot(db, body)
    return response({ ok: true })
  }
  if (route === '/todos' && method === 'POST') return response(await addTodos(env, db, await jsonBody(request, 64 * 1024)))
  if (route === '/todos/share' && method === 'POST') return response(await shareTodos(db))
  if (route === '/diagnostics' && method === 'GET') return response(await diagnostics(db))
  if (route === '/merge' && method === 'POST') return response(await mergeAsOwner(env, await jsonBody(request)))
  if (route === '/merge/reviewed' && method === 'POST') return response(await reviewedMerge(env, db, await jsonBody(request)))
  if (route === '/forum' && method === 'GET') return response(await forumActivity(env, db))
  // TARS's profile picture, through the site's own avatar upload (size, type and storage checks included).
  if (route === '/tars/avatar' && method === 'POST') {
    const upload = new Request('https://bot.internal/api/forum/avatar', { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type') ?? 'application/octet-stream' }, body: await request.arrayBuffer() })
    return (await avatarRoutes(upload, env, db, await tarsUser(db)))!
  }
  const site = route.match(/^\/forum\/(threads|shouts)\/([a-zA-Z0-9-]{1,80})\/reply$/)
  if (site && method === 'POST') { const body = await jsonBody(request); return response(site[1] === 'threads' ? await forumReply(env, db, site[2], body) : await shoutReply(env, db, site[2], body)) }
  const board = route.match(/^\/board\/(messages|claims)\/([0-9a-f-]{36})\/(reply|close|release)$/)
  if (board && method === 'POST' && (board[1] === 'claims') === (board[3] === 'release')) return response(await boardAction(env, db, board[3], board[2], await jsonBody(request)))
  if (route === '/state' && method === 'GET') return response(await state(db))
  if (route === '/state' && method === 'PUT') {
    const body = await jsonBody(request, 256 * 1024)
    if (body.fingerprint !== undefined && (typeof body.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint))) throw new HttpError(400, 'A fingerprint is a SHA-256 hex digest.')
    if (body.upstream !== undefined && (typeof body.upstream !== 'string' || body.upstream.length > 4000)) throw new HttpError(400, 'The upstream heads are a short JSON text.')
    if (body.items !== undefined && (typeof body.items !== 'string' || body.items.length > 200000)) throw new HttpError(400, 'The item map is a JSON text of at most 200000 characters.')
    if (body.usage !== undefined && (typeof body.usage !== 'string' || body.usage.length > 2000)) throw new HttpError(400, 'The usage record is a short JSON text.')
    if (body.fingerprint === undefined && body.upstream === undefined && body.items === undefined && body.usage === undefined && body.pilotReported !== true) throw new HttpError(400, 'Send a fingerprint, the item map, the usage record or the upstream heads.')
    if (body.pilotReported === true) await setState(db, 'eval-pilot-reported', '1')
    if (typeof body.fingerprint === 'string') await setState(db, 'fingerprint', body.fingerprint)
    if (typeof body.upstream === 'string') await setState(db, 'upstream', body.upstream)
    if (typeof body.items === 'string') await setState(db, 'items', body.items)
    if (typeof body.usage === 'string') await setState(db, 'usage', body.usage)
    return response({ ok: true })
  }
  if (route === '/actions' && method === 'POST') return response(await propose(env, db, await jsonBody(request, 256 * 1024)))
  if (route === '/actions/due' && method === 'GET') return response(await due(env, db))
  if (route === '/actions/recent' && method === 'GET') return response(await recent(db, Number(new URL(request.url).searchParams.get('hours') ?? 24) || 24))
  const item = route.match(/^\/actions\/([a-f0-9]{16})\/(claim|result|expire)$/)
  if (item && method === 'POST') return response(item[2] === 'claim' ? await claim(db, item[1]) : item[2] === 'expire' ? await expire(env, db, item[1], await jsonBody(request)) : await finish(env, db, item[1], await jsonBody(request)))
  if (route === '/report' && method === 'POST') return response(await report(env, await jsonBody(request, 64 * 1024)))
  throw new HttpError(404, 'Unknown maintenance bot route.')
}
