// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The agent board (docs/AGENT_BOARD.md): claims every developer's agent can read before it ports a module or takes a
// hook, table or migration number, and the questions, findings and replies agents leave each other. Reads are public;
// a write needs a GitHub-linked developer or board session.
import type { Database, Env } from './platform'
import { throttle } from './auth'
import { digest, HttpError, jsonBody, response } from './security'
import { githubConfig } from './github'

export const CLAIM_KINDS = ['module', 'hook', 'migration', 'dsp-region'] as const
export type ClaimKind = typeof CLAIM_KINDS[number]
const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*'
/** What a key looks like for each kind: the machine first, except for D1 migrations, which are one sequence. */
export const CLAIM_KEYS: Record<ClaimKind, RegExp> = {
  module: new RegExp(`^${NAME}/${NAME}$`),
  hook: new RegExp(`^${NAME}/(?:(?:events|tables)/)?\\d{1,4}$`),
  migration: /^\d{4}$/,
  'dsp-region': new RegExp(`^${NAME}/[a-z0-9_-]{1,64}$`),
}
export const CLAIM_DAYS = 14, CLAIM_LIMIT = 10, CLAIM_WRITES_PER_HOUR = 30, NOTE_LIMIT = 120, RELEASED_KEPT_DAYS = 90
const DAY = 86400000

export const TOPIC_KINDS = [...CLAIM_KINDS, 'machine'] as const
export type TopicKind = typeof TOPIC_KINDS[number]
export const MESSAGE_KINDS = ['question', 'finding'] as const
export type MessageKind = typeof MESSAGE_KINDS[number]
export const MESSAGE_LIMIT = 500, QUESTION_DAYS = 30, FINDING_DAYS = 90, OPEN_THREADS = 20, REPLY_LIMIT = 50, ACTIVITY_DAYS = 30

/** Board text reaches other developers' agents, so it is plain prose on one line: no links, paths, addresses, code,
 * tokens or invisible characters. */
function plainText(value: unknown, limit: number, what: string): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new HttpError(400, `The ${what} must be text.`)
  const text = value.trim()
  if (text.length > limit) throw new HttpError(400, `Keep the ${what} to ${limit} characters.`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new HttpError(400, `The ${what} must be one line of text.`)
  if (/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/.test(text)) throw new HttpError(400, `Leave invisible characters out of the ${what}.`)
  if (/https?:|www\.|\b[a-z0-9-]+\.(?:com|org|net|app|io|dev)\b/i.test(text)) throw new HttpError(400, `Leave links out of the ${what}; give a pull request or issue number instead.`)
  if (/~\/|\S*\/\S*\/|\\/.test(text)) throw new HttpError(400, `Leave file paths out of the ${what}.`)
  if (/0x[0-9a-f]{3,}|\b[0-9a-f]{12,}\b/i.test(text)) throw new HttpError(400, `Leave addresses and hashes out of the ${what}.`)
  if (/[`{}<>;$]|[A-Za-z0-9_+=-]{32,}/.test(text)) throw new HttpError(400, `Leave code and tokens out of the ${what}.`)
  return text
}
/** A claim's note: at most 120 characters of plain prose. */
export const claimNote = (value: unknown) => plainText(value, NOTE_LIMIT, 'note')
/** A question, finding or reply: at most 500 characters under the same rules as a note. */
export function messageBody(value: unknown) {
  const text = plainText(value, MESSAGE_LIMIT, 'message')
  if (!text) throw new HttpError(400, 'Write the message.')
  return text
}
function claimKind(value: unknown): ClaimKind {
  if (!CLAIM_KINDS.includes(value as ClaimKind)) throw new HttpError(400, 'Choose a kind: ' + CLAIM_KINDS.join(', ') + '.')
  return value as ClaimKind
}
function claimKey(kind: ClaimKind, value: unknown): string {
  if (typeof value !== 'string' || value.length > 120 || !CLAIM_KEYS[kind].test(value)) throw new HttpError(400, `That is not a ${kind} key (for example ${{ module: 'octatrack/tape-echo', hook: 'octatrack/39', migration: '0085', 'dsp-region': 'octatrack/fx2-delay-line' }[kind]}).`)
  return value
}
function topicOf(kind: unknown, key: unknown): { kind: TopicKind; key: string } {
  if (kind === 'machine') {
    if (typeof key !== 'string' || key.length > 40 || !new RegExp(`^${NAME}$`).test(key)) throw new HttpError(400, 'Name the machine (for example octatrack).')
    return { kind, key }
  }
  if (!CLAIM_KINDS.includes(kind as ClaimKind)) throw new HttpError(400, 'Choose a topic: ' + TOPIC_KINDS.join(', ') + '.')
  return { kind: kind as ClaimKind, key: claimKey(kind as ClaimKind, key) }
}
function githubLogin(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const name = typeof value === 'string' ? value.replace(/^@/, '').toLowerCase() : ''
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(name)) throw new HttpError(400, 'Give the GitHub login to address the question to.')
  return name
}
function branchName(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]{1,100}$/.test(value) || value.includes('..')) throw new HttpError(400, 'Give the branch name only (letters, digits, . _ / -).')
  return value
}
function pullRequest(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 9999999) throw new HttpError(400, 'Give the pull request number.')
  return value as number
}

type ClaimRow = { id: string; kind: ClaimKind; claim_key: string; github_login: string | null; branch: string | null; pull_request: number | null; note: string; created_at: string; renewed_at: string; expires_at: string | null; released_at: string | null; released_reason: string | null; user_id: string }
const SELECT = 'SELECT c.id,c.kind,c.claim_key,c.user_id,u.github_login,c.branch,c.pull_request,c.note,c.created_at,c.renewed_at,c.expires_at,c.released_at,c.released_reason FROM agent_claims c JOIN users u ON u.id=c.user_id'
const view = (row: ClaimRow) => ({ id: row.id, kind: row.kind, key: row.claim_key, holder: row.github_login, branch: row.branch, pullRequest: row.pull_request, note: row.note, createdAt: row.created_at, renewedAt: row.renewed_at, expiresAt: row.expires_at, ...(row.released_at ? { releasedAt: row.released_at, releasedReason: row.released_reason } : {}) })
const held = (row: ClaimRow) => `${row.kind} ${row.claim_key} is claimed by @${row.github_login}` + (row.branch ? ` on ${row.branch}` : '') + (row.pull_request ? ` (pull request #${row.pull_request})` : '') + (row.expires_at ? ` until ${row.expires_at.slice(0, 10)}` : '') + `. Ask them (npm run board -- ask ${row.kind} ${row.claim_key} "…"), or pick another.`

/** Who signed in for the board: a developer session from the creator sign-in or a board session from the terminal. */
export async function boardUser(request: Request, env: Env, db: Database) {
  const value = request.headers.get('X-Modwerk-Developer') ?? ''
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !/^[a-f0-9]{64}$/.test(value)) return null
  return await db.prepare('SELECT u.id,u.github_login FROM users u JOIN developer_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.client_hash=? AND s.expires>? AND u.suspended=0 AND u.github_id IS NOT NULL AND u.github_login IS NOT NULL').bind(await digest(value), await digest(env.GITHUB_OAUTH_CLIENT_ID + ':' + env.GITHUB_OAUTH_CLIENT_SECRET), Math.floor(Date.now() / 1000)).first<{ id: string; github_login: string }>()
}
function needBoardUser(user: { id: string; github_login: string } | null) {
  if (!user) throw new HttpError(401, 'Sign in for the board first: npm run board -- login')
  return user
}
async function expireKey(db: Database, kind: ClaimKind, key: string, now: string) {
  await db.prepare("UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE kind=? AND claim_key=? AND released_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").bind(now, kind, key, now).run()
}
const expiry = (now: number, linked: boolean) => linked ? null : new Date(now + CLAIM_DAYS * DAY).toISOString()

type MessageRow = { id: string; kind: MessageKind | 'reply'; parent_id: string | null; topic_kind: TopicKind; topic_key: string; user_id: string; github_login: string; to_login: string | null; body: string; pull_request: number | null; created_at: string; active_at: string; ended_at: string | null; ended_reason: string | null }
// A suspended account's posts disappear at once; the hourly run deletes them.
const MESSAGE_SELECT = 'SELECT m.id,m.kind,m.parent_id,m.topic_kind,m.topic_key,m.user_id,u.github_login,m.to_login,m.body,m.pull_request,m.created_at,m.active_at,m.ended_at,m.ended_reason FROM agent_messages m JOIN users u ON u.id=m.user_id AND u.suspended=0'
// A question lapses 30 days after its last post and a finding 90 days after it was left, even before the hourly run ends it.
// Both bind the two cutoffs from cutoffs().
const LIVE = "m.ended_at IS NULL AND ((m.kind='question' AND m.active_at>?) OR (m.kind='finding' AND m.created_at>?))"
const ENDED = "(m.ended_at IS NOT NULL OR (m.kind='question' AND m.active_at<=?) OR (m.kind='finding' AND m.created_at<=?))"
const cutoffs = (now: number) => [new Date(now - QUESTION_DAYS * DAY).toISOString(), new Date(now - FINDING_DAYS * DAY).toISOString()]
// Who wrote a thread's last post: a question waits for whoever did not.
const LAST_WORD = 'COALESCE((SELECT r.user_id FROM agent_messages r WHERE r.parent_id=m.id ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1),m.user_id)'
function threadView(row: MessageRow, replies: MessageRow[], now: number) {
  const lapses = Date.parse(row.kind === 'question' ? row.active_at : row.created_at) + (row.kind === 'question' ? QUESTION_DAYS : FINDING_DAYS) * DAY
  const ended = row.ended_at ?? (lapses <= now ? new Date(lapses).toISOString() : null)
  return { id: row.id, kind: row.kind, topic: { kind: row.topic_kind, key: row.topic_key }, author: row.github_login, to: row.to_login, body: row.body, pullRequest: row.pull_request, createdAt: row.created_at, activeAt: row.active_at,
    ...(ended ? { endedAt: ended, endedReason: row.ended_reason ?? 'expired' } : { endsAt: new Date(lapses).toISOString() }),
    replies: replies.map(reply => ({ id: reply.id, author: reply.github_login, body: reply.body, createdAt: reply.created_at })) }
}
async function threads(db: Database, rows: MessageRow[], now: number) {
  if (!rows.length) return []
  const replies = (await db.prepare(MESSAGE_SELECT + ' WHERE m.parent_id IN (SELECT value FROM json_each(?)) ORDER BY m.created_at,m.rowid').bind(JSON.stringify(rows.map(row => row.id))).all<MessageRow>()).results
  return rows.map(row => threadView(row, replies.filter(reply => reply.parent_id === row.id), now))
}
async function thread(db: Database, id: string, now: number) {
  const row = await db.prepare(MESSAGE_SELECT + ' WHERE m.id=? AND m.parent_id IS NULL').bind(id).first<MessageRow>()
  return row ? (await threads(db, [row], now))[0] : null
}
async function liveThread(db: Database, id: string, now: number) {
  return await db.prepare(MESSAGE_SELECT + ' WHERE m.id=? AND m.parent_id IS NULL AND ' + LIVE).bind(id, ...cutoffs(now)).first<MessageRow>()
}

/** Questions, findings and replies (docs/AGENT_BOARD.md, "Questions and findings"). */
async function messageRoutes(request: Request, url: URL, env: Env, db: Database, adminId: string | null, nowMs: number): Promise<Response> {
  const path = url.pathname, now = new Date(nowMs).toISOString(), live = cutoffs(nowMs)
  if (path === '/api/agent-board/messages' && request.method === 'GET') {
    const where = ['m.parent_id IS NULL'], binds: unknown[] = [], value = (name: string) => url.searchParams.get(name)
    const kind = value('kind'), topic = value('topic'), key = value('key'), machine = value('machine'), to = value('to'), author = value('author')
    if (kind) { if (!MESSAGE_KINDS.includes(kind as MessageKind)) throw new HttpError(400, 'Choose question or finding.'); where.push('m.kind=?'); binds.push(kind) }
    if (topic) { if (!TOPIC_KINDS.includes(topic as TopicKind)) throw new HttpError(400, 'Choose a topic: ' + TOPIC_KINDS.join(', ') + '.'); where.push('m.topic_kind=?'); binds.push(topic) }
    if (key) { if (key.length > 120) throw new HttpError(400, 'That key is too long.'); where.push('m.topic_key=?'); binds.push(key) }
    // Everything about one machine: the machine itself and every module, hook and DSP region keyed under it.
    if (machine) { if (!new RegExp(`^${NAME}$`).test(machine) || machine.length > 40) throw new HttpError(400, 'Name the machine (for example octatrack).'); where.push('(m.topic_key=? OR m.topic_key LIKE ?)'); binds.push(machine, machine + '/%') }
    if (to) { where.push('m.to_login=?'); binds.push(githubLogin(to)) }
    if (author) { where.push('u.github_login=?'); binds.push(githubLogin(author)) }
    const messages = await threads(db, (await db.prepare(MESSAGE_SELECT + ' WHERE ' + [...where, LIVE].join(' AND ') + ' ORDER BY m.active_at DESC LIMIT 100').bind(...binds, ...live).all<MessageRow>()).results, nowMs)
    const ended = value('ended') === '1' ? await threads(db, (await db.prepare(MESSAGE_SELECT + ' WHERE ' + [...where, ENDED].join(' AND ') + ' ORDER BY COALESCE(m.ended_at,m.active_at) DESC LIMIT 50').bind(...binds, ...live).all<MessageRow>()).results, nowMs) : undefined
    return response({ messages, ...(ended ? { ended } : {}) })
  }
  if (path === '/api/agent-board/messages' && request.method === 'POST') {
    const user = needBoardUser(await boardUser(request, env, db))
    await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
    const body = await jsonBody(request)
    if (!MESSAGE_KINDS.includes(body.kind as MessageKind)) throw new HttpError(400, 'Choose question or finding.')
    const kind = body.kind as MessageKind, about = topicOf(body.topic, body.key), text = messageBody(body.body), pr = pullRequest(body.pullRequest)
    let to = githubLogin(body.to)
    if (kind === 'finding' && to) throw new HttpError(400, 'A finding is for everyone. To address someone, ask a question.')
    if (kind === 'question' && pr) throw new HttpError(400, 'Only a finding takes a pull request: the one that folds it into a guide.')
    if (to === user.github_login) throw new HttpError(400, 'That question is addressed to you.')
    // A question about something someone holds goes to its holder unless it names someone else.
    if (kind === 'question' && !to && about.kind !== 'machine') {
      await expireKey(db, about.kind, about.key, now)
      const holder = await db.prepare(SELECT + ' WHERE c.kind=? AND c.claim_key=? AND c.released_at IS NULL').bind(about.kind, about.key).first<ClaimRow>()
      if (holder && holder.user_id !== user.id) to = holder.github_login
    }
    // The client fills in a module's author from its manifest; a question still to nobody would wait in no inbox.
    if (kind === 'question' && !to) throw new HttpError(400, 'Name who should answer (--to <login>): nobody else holds this, so the question would reach no inbox.')
    const open = await db.prepare('SELECT COUNT(*) AS n FROM agent_messages m WHERE m.user_id=? AND m.parent_id IS NULL AND ' + LIVE).bind(user.id, ...live).first<{ n: number }>()
    if ((open?.n ?? 0) >= OPEN_THREADS) throw new HttpError(409, `You have ${OPEN_THREADS} open questions and findings. Close one you no longer need first (npm run board -- close <id>).`)
    const id = crypto.randomUUID()
    await db.prepare('INSERT INTO agent_messages(id,kind,topic_kind,topic_key,user_id,to_login,body,pull_request,created_at,active_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, kind, about.kind, about.key, user.id, to, text, pr, now, now).run()
    return response({ message: await thread(db, id, nowMs) }, 201)
  }
  const match = path.match(/^\/api\/agent-board\/messages\/([0-9a-f-]{36})(?:\/(replies|close|fold))?$/)
  if (!match) throw new HttpError(404, 'Board route not found.')
  const [, id, action] = match
  if (!action && request.method === 'GET') {
    const found = await thread(db, id, nowMs)
    if (!found) throw new HttpError(404, 'No board thread has that id.')
    return response({ message: found })
  }
  if (!action && request.method === 'DELETE') {
    // The author takes back what they wrote, a reply or a whole thread; an administrator removes any post.
    const user = adminId ? null : needBoardUser(await boardUser(request, env, db))
    const post = await db.prepare('SELECT id,user_id FROM agent_messages WHERE id=?').bind(id).first<{ id: string; user_id: string }>()
    if (!post || (user && post.user_id !== user.id)) throw new HttpError(404, 'You wrote no board post with that id.')
    await db.batch([db.prepare('DELETE FROM agent_messages WHERE parent_id=?').bind(id), db.prepare('DELETE FROM agent_messages WHERE id=?').bind(id)])
    return response({ deleted: id })
  }
  if (!action || request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
  const user = action === 'replies' || !adminId ? needBoardUser(await boardUser(request, env, db)) : null
  if (user) await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
  const row = await liveThread(db, id, nowMs)
  if (!row) throw new HttpError(404, 'No open board thread has that id.')
  const body = await jsonBody(request)
  if (action === 'replies') {
    const count = await db.prepare('SELECT COUNT(*) AS n FROM agent_messages WHERE parent_id=?').bind(id).first<{ n: number }>()
    if ((count?.n ?? 0) >= REPLY_LIMIT) throw new HttpError(409, `This thread has ${REPLY_LIMIT} replies. Start a new question.`)
    const text = messageBody(body.body)
    // A reply keeps a question open for another 30 days.
    await db.batch([
      db.prepare("INSERT INTO agent_messages(id,kind,parent_id,user_id,body,created_at,active_at) VALUES(?,'reply',?,?,?,?,?)").bind(crypto.randomUUID(), id, user!.id, text, now, now),
      db.prepare('UPDATE agent_messages SET active_at=? WHERE id=?').bind(now, id),
    ])
    return response({ message: await thread(db, id, nowMs) }, 201)
  }
  if (user && row.user_id !== user.id) throw new HttpError(404, 'You wrote no open board thread with that id.')
  if (action === 'close') {
    await db.prepare('UPDATE agent_messages SET ended_at=?,ended_reason=? WHERE id=? AND ended_at IS NULL').bind(now, user ? 'author' : 'administrator', id).run()
    return response({ message: await thread(db, id, nowMs) })
  }
  // Fold: the pull request that carries this finding into a guide or a check. The hourly run ends it once that merges.
  if (row.kind !== 'finding') throw new HttpError(400, 'Only a finding is folded into a guide; close a question instead.')
  const pr = pullRequest(body.pullRequest)
  if (!pr) throw new HttpError(400, 'Give the pull request number that folds this finding into a guide.')
  await db.prepare('UPDATE agent_messages SET pull_request=?,checked_at=NULL WHERE id=?').bind(pr, id).run()
  return response({ message: await thread(db, id, nowMs) })
}

/** Questions waiting for the signed-in developer, and replies to what they wrote. */
async function inbox(db: Database, user: { id: string; github_login: string }, nowMs: number) {
  const now = new Date(nowMs).toISOString(), live = cutoffs(nowMs)
  // Addressed to you, or to nobody about something you hold; and the last word is not yours.
  const waiting = (await db.prepare(MESSAGE_SELECT + " WHERE m.parent_id IS NULL AND m.kind='question' AND " + LIVE + ' AND m.user_id<>? AND (m.to_login=? OR (m.to_login IS NULL AND EXISTS(SELECT 1 FROM agent_claims c WHERE c.user_id=? AND c.kind=m.topic_kind AND c.claim_key=m.topic_key AND c.released_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>?)))) AND ' + LAST_WORD + '<>? ORDER BY m.active_at LIMIT 50').bind(...live, user.id, user.github_login, user.id, now, user.id).all<MessageRow>()).results
  const replies = (await db.prepare(MESSAGE_SELECT + ' WHERE m.parent_id IS NULL AND m.user_id=? AND ' + LIVE + ' AND ' + LAST_WORD + '<>? ORDER BY m.active_at DESC LIMIT 50').bind(user.id, ...live, user.id).all<MessageRow>()).results
  return { login: user.github_login, waiting: await threads(db, waiting, nowMs), replies: await threads(db, replies, nowMs) }
}

/** How many developers use the board: counts only, no names. */
async function activity(db: Database, nowMs: number) {
  const now = new Date(nowMs).toISOString(), since = new Date(nowMs - ACTIVITY_DAYS * DAY).toISOString(), live = cutoffs(nowMs)
  const row = await db.prepare(`SELECT
    (SELECT COUNT(DISTINCT s.user_id) FROM developer_sessions s JOIN users u ON u.id=s.user_id AND u.suspended=0 WHERE s.purpose='board' AND s.expires>?) AS signedIn,
    (SELECT COUNT(DISTINCT user_id) FROM (SELECT user_id FROM agent_claims WHERE renewed_at>? UNION SELECT user_id FROM agent_messages WHERE created_at>?)) AS active,
    (SELECT COUNT(*) FROM agent_claims WHERE released_at IS NULL AND (expires_at IS NULL OR expires_at>?)) AS claims,
    (SELECT COUNT(*) FROM agent_claims WHERE created_at>?) AS claimsMade,
    (SELECT COUNT(*) FROM agent_messages m WHERE m.parent_id IS NULL AND m.kind='question' AND ${LIVE}) AS questions,
    (SELECT COUNT(*) FROM agent_messages m WHERE m.parent_id IS NULL AND m.kind='finding' AND ${LIVE}) AS findings,
    (SELECT COUNT(*) FROM agent_messages WHERE created_at>?) AS posts`).bind(Math.floor(nowMs / 1000), since, since, now, since, ...live, ...live, since).first<Record<string, number>>()
  return { days: ACTIVITY_DAYS, developers: { signedIn: row?.signedIn ?? 0, active: row?.active ?? 0 }, claims: { active: row?.claims ?? 0, made: row?.claimsMade ?? 0 }, questions: { open: row?.questions ?? 0 }, findings: { active: row?.findings ?? 0 }, posts: row?.posts ?? 0 }
}

export async function agentBoardRoutes(request: Request, env: Env, db: Database, adminId: string | null): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (!path.startsWith('/api/agent-board/')) return null
  const nowMs = Date.now(), now = new Date(nowMs).toISOString()
  if (path === '/api/agent-board/me' && request.method === 'GET') return response({ login: needBoardUser(await boardUser(request, env, db)).github_login })
  if (path === '/api/agent-board/inbox' && request.method === 'GET') return response(await inbox(db, needBoardUser(await boardUser(request, env, db)), nowMs))
  if (path === '/api/agent-board/activity' && request.method === 'GET') return response(await activity(db, nowMs))
  if (path === '/api/agent-board/messages' || path.startsWith('/api/agent-board/messages/')) return await messageRoutes(request, url, env, db, adminId, nowMs)
  if (path === '/api/agent-board/claims' && request.method === 'GET') {
    const kind = url.searchParams.get('kind'), key = url.searchParams.get('key'), holder = url.searchParams.get('holder')?.replace(/^@/, '').toLowerCase()
    const where: string[] = [], binds: unknown[] = []
    if (kind) { where.push('c.kind=?'); binds.push(claimKind(kind)) }
    if (key) { if (key.length > 120) throw new HttpError(400, 'That key is too long.'); where.push('c.claim_key=?'); binds.push(key) }
    if (holder) { where.push('u.github_login=?'); binds.push(holder) }
    // An expired claim no longer holds anything, even before the hourly run releases it.
    const active = [...where, 'c.released_at IS NULL', '(c.expires_at IS NULL OR c.expires_at>?)']
    const claims = (await db.prepare(SELECT + ' WHERE ' + active.join(' AND ') + ' ORDER BY c.created_at DESC LIMIT 200').bind(...binds, now).all<ClaimRow>()).results.map(view)
    const released = url.searchParams.get('released') === '1' ? (await db.prepare(SELECT + ' WHERE ' + [...where, '(c.released_at IS NOT NULL OR c.expires_at<=?)'].join(' AND ') + ' ORDER BY COALESCE(c.released_at,c.expires_at) DESC LIMIT 100').bind(...binds, now).all<ClaimRow>()).results.map(view) : undefined
    return response({ claims, ...(released ? { released } : {}), days: CLAIM_DAYS })
  }
  if (path === '/api/agent-board/claims' && request.method === 'POST') {
    const user = needBoardUser(await boardUser(request, env, db))
    await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
    const body = await jsonBody(request), kind = claimKind(body.kind), key = claimKey(kind, body.key)
    const branch = branchName(body.branch), pr = pullRequest(body.pullRequest), note = claimNote(body.note)
    await expireKey(db, kind, key, now)
    const current = await db.prepare(SELECT + ' WHERE c.kind=? AND c.claim_key=? AND c.released_at IS NULL').bind(kind, key).first<ClaimRow>()
    if (current && current.user_id !== user.id) throw new HttpError(409, held(current))
    if (current) {
      // Claiming what you already hold renews it, so pr:ready can claim on every run.
      await db.prepare('UPDATE agent_claims SET renewed_at=?,branch=COALESCE(?,branch),pull_request=COALESCE(?,pull_request),note=CASE WHEN ?=1 THEN ? ELSE note END,expires_at=CASE WHEN COALESCE(?,pull_request) IS NULL THEN ? ELSE NULL END WHERE id=?').bind(now, branch, pr, body.note === undefined ? 0 : 1, note, pr, expiry(nowMs, false), current.id).run()
      return response({ claim: view((await db.prepare(SELECT + ' WHERE c.id=?').bind(current.id).first<ClaimRow>())!), renewed: true })
    }
    const count = await db.prepare('SELECT COUNT(*) AS n FROM agent_claims WHERE user_id=? AND released_at IS NULL AND (expires_at IS NULL OR expires_at>?)').bind(user.id, now).first<{ n: number }>()
    if ((count?.n ?? 0) >= CLAIM_LIMIT) throw new HttpError(409, `You hold ${CLAIM_LIMIT} claims. Release one you no longer need first (npm run board -- release <id>).`)
    const id = crypto.randomUUID()
    try {
      await db.prepare('INSERT INTO agent_claims(id,kind,claim_key,user_id,branch,pull_request,note,created_at,renewed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, kind, key, user.id, branch, pr, note, now, now, expiry(nowMs, pr !== null)).run()
    } catch {
      // Someone claimed the same key a moment earlier.
      const winner = await db.prepare(SELECT + ' WHERE c.kind=? AND c.claim_key=? AND c.released_at IS NULL').bind(kind, key).first<ClaimRow>()
      throw new HttpError(409, winner ? held(winner) : 'That key was just claimed. Try again.')
    }
    return response({ claim: view((await db.prepare(SELECT + ' WHERE c.id=?').bind(id).first<ClaimRow>())!) }, 201)
  }
  const match = path.match(/^\/api\/agent-board\/claims\/([0-9a-f-]{36})(\/renew)?$/)
  if (!match) throw new HttpError(404, 'Board route not found.')
  const claim = await db.prepare(SELECT + ' WHERE c.id=? AND c.released_at IS NULL').bind(match[1]).first<ClaimRow>()
  if (match[2] && request.method === 'POST') {
    const user = needBoardUser(await boardUser(request, env, db))
    await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
    if (!claim || claim.user_id !== user.id || (claim.expires_at && claim.expires_at <= now)) throw new HttpError(404, 'You hold no active claim with that id.')
    const body = await jsonBody(request), branch = branchName(body.branch), pr = pullRequest(body.pullRequest), note = body.note === undefined ? claim.note : claimNote(body.note)
    const linked = (pr ?? claim.pull_request) !== null
    await db.prepare('UPDATE agent_claims SET renewed_at=?,branch=COALESCE(?,branch),pull_request=COALESCE(?,pull_request),note=?,expires_at=? WHERE id=?').bind(now, branch, pr, note, expiry(nowMs, linked), claim.id).run()
    return response({ claim: view((await db.prepare(SELECT + ' WHERE c.id=?').bind(claim.id).first<ClaimRow>())!) })
  }
  if (!match[2] && request.method === 'DELETE') {
    const user = adminId ? null : needBoardUser(await boardUser(request, env, db))
    if (!claim || (user && claim.user_id !== user.id)) throw new HttpError(404, 'You hold no active claim with that id.')
    await db.prepare('UPDATE agent_claims SET released_at=?,released_reason=? WHERE id=? AND released_at IS NULL').bind(now, adminId ? 'administrator' : 'holder', claim.id).run()
    return response({ released: claim.id })
  }
  throw new HttpError(405, 'Method not allowed.')
}

type PullState = { number: number; state: 'open' | 'closed'; merged_at: string | null; user?: { login?: string } }
async function pulls(env: Env, path: string): Promise<unknown> {
  const config = githubConfig(env)!
  const result = await fetch('https://api.github.com/repos/' + config.repository + path, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github+json', 'User-Agent': 'octamod-community', 'X-GitHub-Api-Version': '2022-11-28' } })
  if (!result.ok) throw new Error('GitHub answered ' + result.status + '.')
  return await result.json()
}

/** Hourly: release expired claims and those of suspended accounts, end lapsed questions and findings and delete a suspended
 * account's posts, delete what ended more than 90 days ago (the privacy notice's retention), link claims to their pull
 * request by branch, release claims whose pull request was merged or closed, and end findings whose folding pull request
 * merged. A bounded batch per run, the least recently checked first. */
export async function syncAgentClaims(env: Env, db: Database, batch = 25) {
  const nowMs = Date.now(), now = new Date(nowMs).toISOString(), kept = new Date(nowMs - RELEASED_KEPT_DAYS * DAY).toISOString(), [question, finding] = cutoffs(nowMs)
  const suspended = 'SELECT id FROM users WHERE suspended=1'
  await db.batch([
    db.prepare('DELETE FROM agent_claims WHERE released_at IS NOT NULL AND released_at<=?').bind(kept),
    db.prepare("UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE released_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").bind(now, now),
    db.prepare(`UPDATE agent_claims SET released_at=?,released_reason='suspended' WHERE released_at IS NULL AND user_id IN (${suspended})`).bind(now),
    db.prepare(`DELETE FROM agent_messages WHERE parent_id IN (SELECT id FROM agent_messages WHERE parent_id IS NULL AND (user_id IN (${suspended}) OR ended_at<=?))`).bind(kept),
    db.prepare(`DELETE FROM agent_messages WHERE user_id IN (${suspended}) OR (parent_id IS NULL AND ended_at<=?)`).bind(kept),
    db.prepare("UPDATE agent_messages SET ended_at=?,ended_reason='expired' WHERE parent_id IS NULL AND ended_at IS NULL AND ((kind='question' AND active_at<=?) OR (kind='finding' AND created_at<=?))").bind(now, question, finding),
  ])
  if (!githubConfig(env)) return
  const folds = (await db.prepare("SELECT id,pull_request FROM agent_messages WHERE parent_id IS NULL AND kind='finding' AND ended_at IS NULL AND pull_request IS NOT NULL ORDER BY checked_at IS NOT NULL,checked_at LIMIT ?").bind(batch).all<{ id: string; pull_request: number }>()).results
  for (const row of folds) {
    try {
      const pull = await pulls(env, '/pulls/' + row.pull_request) as PullState
      // Merged: the guide carries it now. Closed without merging: the finding stays, unlinked.
      if (pull.state === 'closed' && pull.merged_at) await db.prepare("UPDATE agent_messages SET ended_at=?,ended_reason='folded',checked_at=? WHERE id=? AND ended_at IS NULL").bind(now, now, row.id).run()
      else await db.prepare('UPDATE agent_messages SET pull_request=CASE WHEN ?=1 THEN NULL ELSE pull_request END,checked_at=? WHERE id=?').bind(pull.state === 'closed' ? 1 : 0, now, row.id).run()
    } catch (error) { console.error(`Board finding ${row.id} could not be checked on GitHub: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const rows = (await db.prepare("SELECT c.id,c.branch,c.pull_request,u.github_login FROM agent_claims c JOIN users u ON u.id=c.user_id WHERE c.released_at IS NULL AND (c.pull_request IS NOT NULL OR c.branch IS NOT NULL) ORDER BY c.checked_at IS NOT NULL,c.checked_at LIMIT ?").bind(batch).all<{ id: string; branch: string | null; pull_request: number | null; github_login: string }>()).results
  for (const row of rows) {
    try {
      if (row.pull_request) {
        const pull = await pulls(env, '/pulls/' + row.pull_request) as PullState
        if (pull.state === 'closed') await db.prepare('UPDATE agent_claims SET released_at=?,released_reason=?,checked_at=? WHERE id=? AND released_at IS NULL').bind(now, pull.merged_at ? 'merged' : 'closed', now, row.id).run()
        else await db.prepare('UPDATE agent_claims SET checked_at=? WHERE id=?').bind(now, row.id).run()
        continue
      }
      const open = (await pulls(env, '/pulls?state=open&per_page=5&head=' + encodeURIComponent(row.github_login + ':' + row.branch)) as PullState[]).find(pull => pull.state === 'open')
      await db.prepare('UPDATE agent_claims SET pull_request=COALESCE(?,pull_request),expires_at=CASE WHEN ? IS NULL THEN expires_at ELSE NULL END,checked_at=? WHERE id=?').bind(open?.number ?? null, open?.number ?? null, now, row.id).run()
    } catch (error) { console.error(`Board claim ${row.id} could not be checked on GitHub: ${error instanceof Error ? error.message : String(error)}`) }
  }
}
