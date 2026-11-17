import type { Database, Env } from './platform'
import { digest, HttpError, jsonBody, response } from './security'

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

const when = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
function actionText(row: Pick<ActionRow, 'tier' | 'summary' | 'reason' | 'due_at'>, outcome = '') {
  const head = row.tier === 'ask' ? 'Needs your OK' : 'Will do at ' + when(row.due_at) + ' unless you stop it'
  return [head, row.summary, row.reason, outcome].filter(Boolean).join('\n\n')
}
const buttons = (row: Pick<ActionRow, 'id' | 'tier'>) => ({ inline_keyboard: [[{ text: 'Stop', callback_data: 's:' + row.id }, { text: row.tier === 'ask' ? 'Approve' : 'Do it now', callback_data: 'g:' + row.id }]] })

async function state(db: Database) {
  const rows = (await db.prepare('SELECT key,value FROM maintenance_bot_state').all<{ key: string; value: string }>()).results
  const value = (key: string) => rows.find(row => row.key === key)?.value ?? ''
  return { paused: value('paused') === '1', fingerprint: value('fingerprint') }
}
const setState = (db: Database, key: string, value: string) => db.prepare('INSERT INTO maintenance_bot_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run()

function proposal(value: unknown) {
  const item = value as Record<string, unknown>
  if (!item || typeof item !== 'object') throw new HttpError(400, 'Each action must be an object.')
  const { id, kind, target, tier, summary, reason, payload, windowHours } = item
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'An action id must be 16 hex digits.')
  if (typeof kind !== 'string' || !KIND.test(kind)) throw new HttpError(400, 'Unknown action kind.')
  if (!Number.isSafeInteger(target) || (target as number) < 1) throw new HttpError(400, 'An action needs a pull request or issue number.')
  if (typeof tier !== 'string' || !TIERS.has(tier as BotTier)) throw new HttpError(400, 'Unknown action tier.')
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 300) throw new HttpError(400, 'An action needs a summary of at most 300 characters.')
  if (typeof reason !== 'string' || reason.length > 1500) throw new HttpError(400, 'A reason has at most 1500 characters.')
  const json = JSON.stringify(payload ?? {})
  if (json.length > 16000) throw new HttpError(400, 'An action payload has at most 16000 characters.')
  const hours = typeof windowHours === 'number' && windowHours >= 0 && windowHours <= 168 ? windowHours : 12
  return { id, kind, target: target as number, tier: tier as BotTier, summary: summary.trim(), reason: reason.trim(), json, hours }
}

/** Records new proposals once; a proposal the bot already made (same id) keeps its first decision. */
async function propose(env: Env, db: Database, body: Record<string, unknown>) {
  if (!Array.isArray(body.actions) || body.actions.length > 50) throw new HttpError(400, 'Send at most 50 actions.')
  const items = body.actions.map(proposal), created: string[] = [], { chat } = configured(env), at = now()
  for (const item of items) {
    const status = item.tier === 'notify' ? 'approved' : 'pending'
    const due = item.tier === 'window' ? at + Math.round(item.hours * 3600) : at
    const inserted = await db.prepare('INSERT INTO maintenance_bot_actions(id,kind,target,tier,summary,reason,payload_json,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id')
      .bind(item.id, item.kind, item.target, item.tier, item.summary, item.reason, item.json, status, due, at, at).first()
    if (!inserted) continue
    created.push(item.id)
    if (item.tier === 'notify') continue
    // A lost Telegram message must not lose the action: the daily report lists every pending one again.
    try {
      const sent = await telegram(env, 'sendMessage', { chat_id: chat, text: actionText({ ...item, due_at: due }), reply_markup: buttons(item), link_preview_options: { is_disabled: true } })
      if (sent?.message_id) await db.prepare('UPDATE maintenance_bot_actions SET telegram_message_id=? WHERE id=?').bind(sent.message_id, item.id).run()
    } catch (error) { console.error('Maintenance bot could not send action ' + item.id + ': ' + (error instanceof Error ? error.message : String(error))) }
  }
  return { created }
}

const PUBLIC = 'id,kind,target,tier,summary,reason,payload_json,status,due_at,decided_at,result,created_at,updated_at'
const publicRow = ({ payload_json, ...row }: Omit<ActionRow, 'telegram_message_id'>) => ({ ...row, payload: JSON.parse(payload_json) as unknown })

async function due(db: Database) {
  if ((await state(db)).paused) return { paused: true, actions: [] }
  const rows = (await db.prepare(`SELECT ${PUBLIC} FROM maintenance_bot_actions WHERE status='approved' OR (status='pending' AND tier='window' AND due_at<=?) ORDER BY created_at LIMIT 50`).bind(now()).all<ActionRow>()).results
  return { paused: false, actions: rows.map(publicRow) }
}

/** One executor at a time: a run claims an action before acting, so two overlapping runs never post twice. */
async function claim(db: Database, id: string) {
  const at = now()
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET status='running',updated_at=? WHERE id=? AND (status='approved' OR (status='pending' AND tier='window' AND due_at<=?)) RETURNING id`).bind(at, id, at).first()
  if (!row) throw new HttpError(409, 'That action was decided, claimed or is not due.')
  return { ok: true }
}

async function finish(env: Env, db: Database, id: string, body: Record<string, unknown>) {
  const status = body.status, result = typeof body.result === 'string' ? body.result.slice(0, 1500) : ''
  if (status !== 'done' && status !== 'failed' && status !== 'expired') throw new HttpError(400, 'A result is done, failed or expired.')
  const row = await db.prepare(`UPDATE maintenance_bot_actions SET status=?,result=?,updated_at=? WHERE id=? AND status='running' RETURNING ${PUBLIC},telegram_message_id`).bind(status, result, now(), id).first<ActionRow>()
  if (!row) throw new HttpError(409, 'That action is not claimed.')
  if (row.telegram_message_id) {
    const outcome = (status === 'done' ? 'Done' : status === 'failed' ? 'Failed' : 'Dropped: things changed since') + (result ? ': ' + result : '.')
    await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text: actionText(row, outcome) }).catch(() => undefined)
  }
  return { ok: true }
}

async function recent(db: Database, hours: number) {
  const since = now() - Math.min(Math.max(hours, 1), 24 * 14) * 3600
  const rows = (await db.prepare(`SELECT ${PUBLIC} FROM maintenance_bot_actions WHERE updated_at>=? OR status IN ('pending','approved','running') ORDER BY updated_at DESC LIMIT 300`).bind(since).all<ActionRow>()).results
  return { ...(await state(db)), actions: rows.map(publicRow) }
}

async function report(env: Env, body: Record<string, unknown>) {
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 30000) throw new HttpError(400, 'A report is 1 to 30000 characters.')
  const { chat } = configured(env)
  for (const text of chunks(body.text)) await telegram(env, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } })
  return { ok: true }
}

type TelegramUpdate = {
  callback_query?: { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number } } }
  message?: { text?: string; chat: { id: number } }
}

async function decide(env: Env, db: Database, query: NonNullable<TelegramUpdate['callback_query']>) {
  const [verb, id] = (query.data ?? '').split(':')
  if ((verb !== 's' && verb !== 'g') || !ID.test(id ?? '')) return 'Unknown button.'
  const at = now()
  const row = verb === 's'
    ? await db.prepare(`UPDATE maintenance_bot_actions SET status='vetoed',decided_at=?,updated_at=? WHERE id=? AND status IN ('pending','approved') RETURNING ${PUBLIC},telegram_message_id`).bind(at, at, id).first<ActionRow>()
    : await db.prepare(`UPDATE maintenance_bot_actions SET status='approved',decided_at=?,updated_at=? WHERE id=? AND status='pending' RETURNING ${PUBLIC},telegram_message_id`).bind(at, at, id).first<ActionRow>()
  if (!row) return 'Already decided or finished.'
  const outcome = verb === 's' ? 'Stopped. The bot will not propose this again unless it changes.' : 'Approved: runs at the next hourly pass.'
  if (row.telegram_message_id) await telegram(env, 'editMessageText', { chat_id: configured(env).chat, message_id: row.telegram_message_id, text: actionText(row, outcome) }).catch(() => undefined)
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
    reply = (paused ? 'Paused.' : 'Running.') + ' Waiting: ' + count('pending') + ', approved: ' + count('approved') + '. Last 24 h: ' + count('done') + ' done, ' + count('failed') + ' failed, ' + count('vetoed') + ' stopped. Commands: /pause, /resume, /status.'
  } else return
  await telegram(env, 'sendMessage', { chat_id: chat, text: reply })
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
  } else if (update.message?.text && String(update.message.chat.id) === chat) await command(env, db, update.message.text)
  return response({ ok: true })
}

/** Routes under /api/maintenance-bot/. They run server-to-server, before the Origin check. */
export async function maintenanceBotRoutes(request: Request, env: Env, db: Database, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/maintenance-bot/')) return null
  const route = path.slice('/api/maintenance-bot'.length), method = request.method
  if (route === '/telegram' && method === 'POST') return await webhook(request, env, db)
  const { key } = configured(env), bearer = request.headers.get('Authorization')?.match(/^Bearer (\S{32,200})$/)?.[1] ?? ''
  if (!same(await digest(bearer), key)) throw new HttpError(401, 'Wrong maintenance bot key.')
  if (route === '/state' && method === 'GET') return response(await state(db))
  if (route === '/state' && method === 'PUT') {
    const body = await jsonBody(request)
    if (typeof body.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint)) throw new HttpError(400, 'A fingerprint is a SHA-256 hex digest.')
    await setState(db, 'fingerprint', body.fingerprint)
    return response({ ok: true })
  }
  if (route === '/actions' && method === 'POST') return response(await propose(env, db, await jsonBody(request, 256 * 1024)))
  if (route === '/actions/due' && method === 'GET') return response(await due(db))
  if (route === '/actions/recent' && method === 'GET') return response(await recent(db, Number(new URL(request.url).searchParams.get('hours') ?? 24) || 24))
  const item = route.match(/^\/actions\/([a-f0-9]{16})\/(claim|result)$/)
  if (item && method === 'POST') return response(item[2] === 'claim' ? await claim(db, item[1]) : await finish(env, db, item[1], await jsonBody(request)))
  if (route === '/report' && method === 'POST') return response(await report(env, await jsonBody(request, 64 * 1024)))
  throw new HttpError(404, 'Unknown maintenance bot route.')
}
