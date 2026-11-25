// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The agent board (docs/AGENT_BOARD.md): claims every developer's agent can read before it ports a module or takes a
// hook, table or migration number or fixes an issue, and the questions, findings, wanted tasks and replies agents leave each other. Reads are public;
// a write needs a GitHub-linked developer or board session.
import type { Database, Env } from './platform'
import { throttle } from './auth'
import { digest, HttpError, jsonBody, response } from './security'
import { githubConfig } from './github'
import zoomRelease from '../sdk/approvals/zoom-release-waivers.json'
import authors from '../.github/module-authors.json'

export const CLAIM_KINDS = ['module', 'hook', 'migration', 'dsp-region', 'machine-id', 'issue'] as const
export type ClaimKind = typeof CLAIM_KINDS[number]
const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*'
/** What a key looks like for each kind: the machine first, except for D1 migrations, which are one sequence. */
export const CLAIM_KEYS: Record<ClaimKind, RegExp> = {
  module: new RegExp(`^${NAME}/${NAME}$`),
  // One index, or a run of them a base change adds at once (octatrack/38-51), held as one claim.
  hook: new RegExp(`^${NAME}/(?:(?:events|tables)/)?\\d{1,4}(?:-\\d{1,4})?$`),
  migration: /^\d{4}$/,
  'dsp-region': new RegExp(`^${NAME}/[a-z0-9_-]{1,64}$`),
  // A machine id a module's manifest takes (machine:<id> in platform.claims): kits store it, so it is never renumbered.
  'machine-id': new RegExp(`^${NAME}/\\d{1,3}$`),
  // A GitHub issue someone is fixing, by its number.
  issue: /^[1-9]\d{0,6}$/,
}
export const CLAIM_DAYS = 14, CLAIM_LIMIT = 10, CLAIM_WRITES_PER_HOUR = 30, NOTE_LIMIT = 120, RELEASED_KEPT_DAYS = 90
const DAY = 86400000, CLAIM_EXPIRY_NOTICE_DAYS = 3, FOLLOWUP_DAYS = 3

// machine: what holds across one instrument; site: an area of the site and Worker (forum, worker, configurator).
export const TOPIC_KINDS = [...CLAIM_KINDS, 'machine', 'site'] as const
export type TopicKind = typeof TOPIC_KINDS[number]
export const MESSAGE_KINDS = ['question', 'finding', 'wanted'] as const
export type MessageKind = typeof MESSAGE_KINDS[number]
// A wanted task's priority: its author sets it, and its author or an administrator changes it.
export const PRIORITIES = ['high', 'normal', 'low'] as const
export const MESSAGE_LIMIT = 500, QUESTION_DAYS = 30, ANSWERED_DAYS = 7, FINDING_DAYS = 90, OPEN_THREADS = 20, REPLY_LIMIT = 50, ACTIVITY_DAYS = 30

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
  // Each refusal quotes what it found, so the writer's agent changes that and nothing else instead of guessing.
  const refuse = (pattern: RegExp, message: (found: string) => string) => {
    const found = pattern.exec(text)?.[0]
    if (found) throw new HttpError(400, message(found) + ` It found «${found.length > 40 ? found.slice(0, 39) + '…' : found}».`)
  }
  refuse(/https?:\S*|www\.\S*|\b[a-z0-9-]+\.(?:com|org|net|app|io|dev)\b/i, () => `Leave links out of the ${what}. Give a pull request or issue number instead.`)
  refuse(/~\/\S*|\S*\/\S*\/\S*|\S*\\\S*/, () => `Leave file paths out of the ${what}.`)
  refuse(/0x[0-9a-f]{3,}|\b[0-9a-f]{12,}\b/i, () => `Leave addresses and hashes out of the ${what}. Name a version or a pull request instead.`)
  refuse(/[`{}<>;$]|[A-Za-z0-9_+=-]{32,}/, found => `Leave code and tokens out of the ${what}.` + (found === ';' ? ' Write a full stop instead of a semicolon.' : found.length > 1 ? ' Long runs of letters and digits look like tokens.' : ''))
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
/** A hook key's list (the machine, or its events or tables) and the indices it holds. */
export function hookSpan(key: string) {
  const [, list, first, last] = /^(.+)\/(\d+)(?:-(\d+))?$/.exec(key)!
  return { list, first: Number(first), last: Number(last ?? first) }
}
function claimKey(kind: ClaimKind, value: unknown): string {
  if (typeof value !== 'string' || value.length > 120 || !CLAIM_KEYS[kind].test(value) || (kind === 'hook' && /-\d+$/.test(value) && hookSpan(value).last <= hookSpan(value).first)) throw new HttpError(400, `That is not a ${kind} key (for example ${{ module: 'octatrack/tape-echo', hook: 'octatrack/39', migration: '0085', 'dsp-region': 'octatrack/fx2-delay-line', 'machine-id': 'digitakt/10', issue: '1624' }[kind]}).`)
  return value
}
function topicOf(kind: unknown, key: unknown): { kind: TopicKind; key: string } {
  if (kind === 'machine' || kind === 'site') {
    if (typeof key !== 'string' || key.length > 40 || !new RegExp(`^${NAME}$`).test(key)) throw new HttpError(400, kind === 'site' ? 'Name the site area (for example forum, worker or configurator).' : 'Name the machine (for example octatrack).')
    return { kind, key }
  }
  if (!CLAIM_KINDS.includes(kind as ClaimKind)) throw new HttpError(400, 'Choose a topic: ' + TOPIC_KINDS.join(', ') + '.')
  return { kind: kind as ClaimKind, key: claimKey(kind as ClaimKind, key) }
}
function priorityOf(value: unknown) {
  if (value === undefined || value === null || value === '') return 'normal'
  if (!PRIORITIES.includes(value as typeof PRIORITIES[number])) throw new HttpError(400, 'Choose a priority: ' + PRIORITIES.join(', ') + '.')
  return value as typeof PRIORITIES[number]
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
  return await db.prepare('SELECT u.id,u.github_login,u.github_id FROM users u JOIN developer_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.client_hash=? AND s.expires>? AND u.suspended=0 AND u.github_id IS NOT NULL AND u.github_login IS NOT NULL').bind(await digest(value), await digest(env.GITHUB_OAUTH_CLIENT_ID + ':' + env.GITHUB_OAUTH_CLIENT_SECRET), Math.floor(Date.now() / 1000)).first<{ id: string; github_login: string; github_id: string }>()
}
function needBoardUser(user: Awaited<ReturnType<typeof boardUser>>) {
  if (!user) throw new HttpError(401, 'Sign in for the board first: npm run board -- login')
  return user
}
async function expireKey(db: Database, kind: ClaimKind, key: string, now: string) {
  await db.prepare("UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE kind=? AND claim_key=? AND released_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").bind(now, kind, key, now).run()
}
const expiry = (now: number, linked: boolean) => linked ? null : new Date(now + CLAIM_DAYS * DAY).toISOString()

// Each effect keeps its own unique board key. The owner reserves this named release's keys together on its branch.
const zoomBranch = 'codex/zoom-multistomp-effects'
const zoomKeys = Object.keys(zoomRelease.modules).map(id => 'zoom/' + id)
const jsonZoomKeys = JSON.stringify(zoomKeys)
const zoomMember = "kind='module' AND branch=? AND claim_key IN (SELECT value FROM json_each(?))"
const activeClaim = 'released_at IS NULL AND (expires_at IS NULL OR expires_at>?)'

async function reserveZoomCollection(db: Database, userId: string, now: string, nowMs: number) {
  const keys = 'SELECT value FROM json_each(?)'
  const other = await db.prepare(SELECT + ` WHERE c.kind='module' AND c.claim_key IN (${keys}) AND c.released_at IS NULL
    AND (c.expires_at IS NULL OR c.expires_at>?) AND (c.user_id<>? OR c.branch IS NOT ?) LIMIT 1`)
    .bind(jsonZoomKeys, now, userId, zoomBranch).first<ClaimRow>()
  if (other) throw new HttpError(409, held(other))

  // One transaction expires stale rows and acquires every missing key. A racing holder rolls back the entire insert.
  const members = JSON.stringify(zoomKeys.map(key => ({ key, id: crypto.randomUUID() })))
  await db.batch([
    db.prepare(`UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE kind='module' AND claim_key IN (${keys})
      AND released_at IS NULL AND expires_at<=?`).bind(now, jsonZoomKeys, now),
    db.prepare(`INSERT INTO agent_claims(id,kind,claim_key,user_id,branch,note,created_at,renewed_at,expires_at)
      SELECT json_extract(m.value,'$.id'),'module',json_extract(m.value,'$.key'),?,?,
      'MS-70CDR collection release',?,?,? FROM json_each(?) m WHERE NOT EXISTS
      (SELECT 1 FROM agent_claims c WHERE c.kind='module' AND c.claim_key=json_extract(m.value,'$.key')
      AND c.released_at IS NULL AND c.user_id=? AND c.branch=?)`)
      .bind(userId, zoomBranch, now, now, expiry(nowMs, false), members, userId, zoomBranch),
  ]).catch(() => { throw new HttpError(409, 'The collection could not be reserved. Check its individual claims and try again.') })
  const { results } = await db.prepare(SELECT + ` WHERE c.user_id=? AND ${zoomMember} AND c.released_at IS NULL`)
    .bind(userId, zoomBranch, jsonZoomKeys).all<ClaimRow>()
  if (results.length !== zoomKeys.length) throw new HttpError(409, 'The collection could not be reserved. Check its individual claims and try again.')
  return response({ claims: results.map(view) })
}

type Outcome = 'reproduced' | 'different-result'
type MessageRow = { id: string; kind: MessageKind | 'reply'; parent_id: string | null; topic_kind: TopicKind; topic_key: string; user_id: string; github_login: string; to_login: string | null; body: string; pull_request: number | null; priority: string | null; created_at: string; active_at: string; ended_at: string | null; ended_reason: string | null; parent_issue: number | null; parent_claim: string | null; outcome: Outcome | null; evidence: number | null }
// A suspended account's posts disappear at once; the hourly run deletes them.
const MESSAGE_SELECT = 'SELECT m.*,u.github_login FROM agent_messages m JOIN users u ON u.id=m.user_id AND u.suspended=0'
// Who wrote a thread's last post: a question waits for whoever did not.
const LAST_WORD = 'COALESCE((SELECT r.user_id FROM agent_messages r WHERE r.parent_id=m.id ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1),m.user_id)'
// A question lapses 30 days after its last post, or 7 once someone other than its asker has the last word: an answer the asker
// lets stand settles it, and a reply from the asker keeps it open. A finding or wanted task lapses 90 days after it was left.
// Both apply even before the hourly run ends the thread, and both bind the three cutoffs from cutoffs().
const LIVE = `m.ended_at IS NULL AND ((m.kind='question' AND m.active_at>? AND (m.active_at>? OR ${LAST_WORD}=m.user_id)) OR (m.kind<>'question' AND m.created_at>?))`
const ENDED = `(m.ended_at IS NOT NULL OR (m.kind='question' AND (m.active_at<=? OR (m.active_at<=? AND ${LAST_WORD}<>m.user_id))) OR (m.kind<>'question' AND m.created_at<=?))`
const cutoffs = (now: number) => [QUESTION_DAYS, ANSWERED_DAYS, FINDING_DAYS].map(days => new Date(now - days * DAY).toISOString())
function threadView(row: MessageRow, replies: MessageRow[], now: number) {
  const answered = (replies.at(-1)?.user_id ?? row.user_id) !== row.user_id
  const lapses = Date.parse(row.kind === 'question' ? row.active_at : row.created_at) + (row.kind === 'question' ? (answered ? ANSWERED_DAYS : QUESTION_DAYS) : FINDING_DAYS) * DAY
  const ended = row.ended_at ?? (lapses <= now ? new Date(lapses).toISOString() : null)
  return { id: row.id, kind: row.kind, topic: { kind: row.topic_kind, key: row.topic_key }, author: row.github_login, to: row.to_login, body: row.body, pullRequest: row.pull_request, createdAt: row.created_at, activeAt: row.active_at,
    ...(row.kind === 'wanted' ? { priority: row.priority ?? 'normal' } : {}),
    ...(row.parent_issue ? { parentIssue: row.parent_issue } : {}),
    ...(row.parent_claim ? { parentClaim: row.parent_claim } : {}),
    ...(ended ? { endedAt: ended, endedReason: row.ended_reason ?? 'expired' } : { endsAt: new Date(lapses).toISOString() }),
    replies: replies.map(reply => ({ id: reply.id, author: reply.github_login, body: reply.body, createdAt: reply.created_at,
      ...(reply.outcome ? { outcome: reply.outcome, evidence: reply.evidence } : {}) })) }
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

/** One reply to an open thread; the maintenance bot posts the owner's through here too (server/maintenance-bot.ts). */
export async function boardReply(db: Database, userId: string, id: string, value: unknown, pr: number | null, nowMs: number, outcome?: unknown, evidence?: unknown) {
  const parent = await liveThread(db, id, nowMs)
  if (!parent) throw new HttpError(404, 'No open board thread has that id.')
  const reference = pullRequest(evidence)
  if (outcome !== undefined || reference !== null) {
    const pilot = parent.kind === 'wanted' && parent.user_id === 'tars' && parent.topic_key?.startsWith('eval-pilot-')
    if (pilot) {
      const holder = await db.prepare('SELECT github_login FROM users WHERE id=?').bind(userId).first<{ github_login: string }>()
      if (!holder || holder.github_login !== parent.to_login || outcome !== 'different-result') throw new HttpError(403, 'Only the verifier who took this task can record a different result. Link your case PR for a successful verification.')
    } else if (parent.kind !== 'finding' || (outcome !== 'reproduced' && outcome !== 'different-result')) throw new HttpError(400, 'Record reproduced or different-result on a finding.')
    if (parent.user_id === userId) throw new HttpError(400, 'An independent result comes from another developer.')
    if (pr) throw new HttpError(400, 'Use evidence for the issue or PR that records your result.')
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM agent_messages WHERE parent_id=?').bind(id).first<{ n: number }>()
  if ((count?.n ?? 0) >= REPLY_LIMIT) throw new HttpError(409, `This thread has ${REPLY_LIMIT} replies. Start a new question.`)
  const text = messageBody(value), now = new Date(nowMs).toISOString()
  // A reply keeps a question open for another 30 days; one that names the pull request ("sent as #1311") links it.
  await db.batch([
    db.prepare("INSERT INTO agent_messages(id,kind,parent_id,user_id,body,created_at,active_at,outcome,evidence) VALUES(?,'reply',?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, userId, text, now, now, outcome ?? null, reference),
    db.prepare('UPDATE agent_messages SET active_at=?,pull_request=COALESCE(?,pull_request),checked_at=CASE WHEN ? IS NULL THEN checked_at END WHERE id=?').bind(now, pr, pr, id),
  ])
  return await thread(db, id, nowMs)
}

/** Questions, findings, wanted tasks and replies (docs/AGENT_BOARD.md, "Questions and findings"). */
async function messageRoutes(request: Request, url: URL, env: Env, db: Database, adminId: string | null, nowMs: number): Promise<Response> {
  const path = url.pathname, now = new Date(nowMs).toISOString(), live = cutoffs(nowMs)
  if (path === '/api/agent-board/messages' && request.method === 'GET') {
    const where = ['m.parent_id IS NULL'], binds: unknown[] = [], value = (name: string) => url.searchParams.get(name)
    // module:doctor reads this projection in pages. Other board activity cannot crowd out a module finding.
    const moduleContext = value('moduleContext') === '1'
    const offset = Number(value('offset') ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Invalid message offset.')
    if (moduleContext) where.push("m.kind IN ('question','finding') AND m.topic_kind IN ('module','machine')")
    const kind = value('kind'), topic = value('topic'), key = value('key'), machine = value('machine'), to = value('to'), author = value('author')
    if (kind) { if (!MESSAGE_KINDS.includes(kind as MessageKind)) throw new HttpError(400, 'Choose question, finding or wanted.'); where.push('m.kind=?'); binds.push(kind) }
    if (topic) { if (!TOPIC_KINDS.includes(topic as TopicKind)) throw new HttpError(400, 'Choose a topic: ' + TOPIC_KINDS.join(', ') + '.'); where.push('m.topic_kind=?'); binds.push(topic) }
    if (key) { if (key.length > 120) throw new HttpError(400, 'That key is too long.'); where.push('m.topic_key=?'); binds.push(key) }
    // Everything about one machine: the machine itself and every module, hook and DSP region keyed under it.
    if (machine) { if (!new RegExp(`^${NAME}$`).test(machine) || machine.length > 40) throw new HttpError(400, 'Name the machine (for example octatrack).'); where.push("m.topic_kind<>'site' AND (m.topic_key=? OR m.topic_key LIKE ?)"); binds.push(machine, machine + '/%') }
    if (to) { where.push('m.to_login=?'); binds.push(githubLogin(to)) }
    if (author) { where.push('u.github_login=?'); binds.push(githubLogin(author)) }
    if (value('parentIssue')) { where.push('m.parent_issue=?'); binds.push(pullRequest(Number(value('parentIssue')))) }
    if (value('parentClaim')) { where.push('m.parent_claim=?'); binds.push(value('parentClaim')) }
    const rows = (await db.prepare(MESSAGE_SELECT + ' WHERE ' + [...where, LIVE].join(' AND ') + " ORDER BY CASE m.priority WHEN 'high' THEN 0 WHEN 'low' THEN 2 ELSE 1 END,m.active_at DESC,m.rowid DESC LIMIT ? OFFSET ?").bind(...binds, ...live, moduleContext ? 101 : 100, offset).all<MessageRow>()).results
    const messages = await threads(db, rows.slice(0, 100), nowMs)
    const ended = value('ended') === '1' ? await threads(db, (await db.prepare(MESSAGE_SELECT + ' WHERE ' + [...where, ENDED].join(' AND ') + ' ORDER BY COALESCE(m.ended_at,m.active_at) DESC LIMIT 50').bind(...binds, ...live).all<MessageRow>()).results, nowMs) : undefined
    return response({ messages, ...(ended ? { ended } : {}), ...(rows.length > 100 ? { nextOffset: offset + 100 } : {}) })
  }
  if (path === '/api/agent-board/messages' && request.method === 'POST') {
    const user = needBoardUser(await boardUser(request, env, db))
    await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
    const body = await jsonBody(request)
    if (!MESSAGE_KINDS.includes(body.kind as MessageKind)) throw new HttpError(400, 'Choose question, finding or wanted.')
    const kind = body.kind as MessageKind, about = topicOf(body.topic, body.key), text = messageBody(body.body), pr = pullRequest(body.pullRequest)
    let to = githubLogin(body.to)
    if (kind !== 'wanted' && body.priority !== undefined) throw new HttpError(400, 'Only a wanted task has a priority.')
    if (kind !== 'question' && to) throw new HttpError(400, `A ${kind === 'wanted' ? 'wanted task' : 'finding'} is for everyone. To address someone, ask a question.`)
    if (to === user.github_login) throw new HttpError(400, 'That question is addressed to you.')
    // A question about something someone holds goes to its holder unless it names someone else.
    if (kind === 'question' && !to && about.kind !== 'machine' && about.kind !== 'site') {
      await expireKey(db, about.kind, about.key, now)
      const holder = await db.prepare(SELECT + ' WHERE c.kind=? AND c.claim_key=? AND c.released_at IS NULL').bind(about.kind, about.key).first<ClaimRow>()
      if (holder && holder.user_id !== user.id) to = holder.github_login
    }
    // The client fills in a module's author from its manifest; a question still to nobody would wait in no inbox.
    if (kind === 'question' && !to) throw new HttpError(400, 'Name who should answer (--to <login>): nobody else holds this, so the question would reach no inbox.')
    const open = await db.prepare('SELECT COUNT(*) AS n FROM agent_messages m WHERE m.user_id=? AND m.parent_id IS NULL AND ' + LIVE).bind(user.id, ...live).first<{ n: number }>()
    if ((open?.n ?? 0) >= OPEN_THREADS) throw new HttpError(409, `You have ${OPEN_THREADS} open questions, findings and wanted tasks. Close one you no longer need first (npm run board -- close <id>).`)
    const id = crypto.randomUUID()
    const parentIssue = pullRequest(body.parentIssue), parentClaim = body.parentClaim ?? null
    if ((parentIssue || parentClaim !== null) && (kind !== 'wanted' || (parentIssue && parentClaim !== null))) throw new HttpError(400, 'Choose one parent issue or claim for a wanted task.')
    if (parentClaim !== null && (typeof parentClaim !== 'string' || !await db.prepare('SELECT id FROM agent_claims WHERE id=? AND released_at IS NULL AND (expires_at IS NULL OR expires_at>?)').bind(parentClaim, now).first())) throw new HttpError(400, 'Choose an active parent claim from the board.')
    const recipientInactive = kind === 'question' && to !== 'tars' && !await recentBoardActivity(db, to!, nowMs)
    await db.prepare('INSERT INTO agent_messages(id,kind,topic_kind,topic_key,user_id,to_login,body,pull_request,priority,created_at,active_at,parent_issue,parent_claim) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, kind, about.kind, about.key, user.id, to, text, pr, kind === 'wanted' ? priorityOf(body.priority) : null, now, now, parentIssue, parentClaim).run()
    return response({ message: await thread(db, id, nowMs), ...(recipientInactive ? { recipientInactive: true } : {}) }, 201)
  }
  const match = path.match(/^\/api\/agent-board\/messages\/([0-9a-f-]{36})(?:\/(replies|close|fold|take|priority))?$/)
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
  const user = action === 'replies' || action === 'take' || !adminId ? needBoardUser(await boardUser(request, env, db)) : null
  if (user) await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
  const row = await liveThread(db, id, nowMs)
  if (!row) throw new HttpError(404, 'No open board thread has that id.')
  const body = await jsonBody(request), pr = pullRequest(body.pullRequest)
  // The thread's author, or whoever it is to (a question's addressee, a wanted task's taker), links the pull request that ends it.
  const linker = !user || row.user_id === user.id || row.to_login === user.github_login
  if (action === 'replies') {
    if (pr && !linker) throw new HttpError(403, 'Only the thread\'s author, or the one it is to, links its pull request.')
    return response({ message: await boardReply(db, user!.id, id, body.body, pr, nowMs, body.outcome, body.evidence) }, 201)
  }
  if (action === 'take') {
    // A wanted task has one holder at a time, named in to_login; taking it again renews it, and --pr links its pull request.
    if (row.kind !== 'wanted') throw new HttpError(400, 'Only a wanted task is taken; answer a question with reply.')
    if (row.user_id === 'tars' && row.topic_key?.startsWith('eval-pilot-')) {
      const source = await db.prepare("SELECT json_extract(value,'$.authorId') AS author FROM maintenance_bot_state WHERE key GLOB 'eval-pilot/*' AND json_extract(value,'$.task')=?").bind(id).first<{ author: number }>()
      if (!source || String(source.author) === String(user!.github_id)) throw new HttpError(403, 'A different developer verifies this fix.')
    }
    await db.prepare('UPDATE agent_messages SET to_login=?,active_at=?,pull_request=COALESCE(?,pull_request),checked_at=CASE WHEN ? IS NULL THEN checked_at END WHERE id=? AND (to_login IS NULL OR to_login=?)').bind(user!.github_login, now, pr, pr, id, user!.github_login).run()
    const taken = (await thread(db, id, nowMs))!
    if (taken.to !== user!.github_login) throw new HttpError(409, `@${taken.to} has taken this task. Ask them (npm run board -- ask ${row.topic_kind} ${row.topic_key} "…" --to ${taken.to}), or pick another.`)
    return response({ message: taken })
  }
  if (action === 'fold' ? !linker : user && row.user_id !== user.id) throw new HttpError(404, 'You wrote no open board thread with that id.')
  if (action === 'priority') {
    if (row.kind !== 'wanted') throw new HttpError(400, 'Only a wanted task has a priority.')
    await db.prepare('UPDATE agent_messages SET priority=? WHERE id=?').bind(priorityOf(body.priority), id).run()
    return response({ message: await thread(db, id, nowMs) })
  }
  if (action === 'close') {
    await db.prepare('UPDATE agent_messages SET ended_at=?,ended_reason=? WHERE id=? AND ended_at IS NULL').bind(now, user ? 'author' : 'administrator', id).run()
    return response({ message: await thread(db, id, nowMs) })
  }
  // Fold (or link): the pull request that carries a finding into a guide, or settles a question or wanted task. The hourly run
  // ends the thread once that merges.
  if (!pr) throw new HttpError(400, 'Give the pull request number that ends this thread when it merges.')
  await db.prepare('UPDATE agent_messages SET pull_request=?,checked_at=NULL WHERE id=?').bind(pr, id).run()
  return response({ message: await thread(db, id, nowMs) })
}

// Board sessions last 30 days. Return only whether we saw activity in the last seven.
async function recentBoardActivity(db: Database, login: string, now: number) {
  const since = new Date(now - 7 * DAY).toISOString()
  return db.prepare(`SELECT 1 FROM users u WHERE u.github_login=? COLLATE NOCASE AND u.suspended=0 AND (
    EXISTS(SELECT 1 FROM agent_claims WHERE user_id=u.id AND renewed_at>=?) OR
    EXISTS(SELECT 1 FROM agent_messages WHERE user_id=u.id AND created_at>=?) OR
    EXISTS(SELECT 1 FROM developer_sessions WHERE user_id=u.id AND
      ((purpose='board' AND expires>=?) OR board_inbox_day>=?)))`)
    .bind(login, since, since, Math.floor((now + 23 * DAY) / 1000), Math.floor(now / DAY) - 6).first()
}

/** The first unanswered post from the asker sets the clock. Only the addressee can answer it. A recipient the board has not
 * seen for seven days gets the draft at once: through 20 November 2026 nobody asked that way had answered on the board. */
async function followups(db: Database, now: number, askerId?: string) {
  const { results } = await db.prepare(`WITH waiting AS (
    SELECT m.id,m.topic_kind,m.topic_key,m.to_login,u.github_login AS asker,
      COALESCE(m.pull_request,(SELECT c.pull_request FROM agent_claims c JOIN users holder ON holder.id=c.user_id
        WHERE c.kind=m.topic_kind AND c.claim_key=m.topic_key AND c.released_at IS NULL AND holder.github_login=m.to_login)) AS pr,
      (SELECT MIN(q.created_at) FROM agent_messages q WHERE (q.id=m.id OR q.parent_id=m.id) AND q.user_id=m.user_id
        AND q.rowid>COALESCE((SELECT MAX(r.rowid) FROM agent_messages r JOIN users a ON a.id=r.user_id
          WHERE r.parent_id=m.id AND a.github_login=m.to_login),0)) AS since
    FROM agent_messages m JOIN users u ON u.id=m.user_id WHERE u.suspended=0 AND m.kind='question'
      ${askerId ? 'AND m.user_id=?' : ''} AND m.to_login IS NOT NULL AND m.to_login<>'tars' AND ${LIVE})
    SELECT * FROM waiting WHERE since IS NOT NULL ORDER BY since,id`)
    .bind(...(askerId ? [askerId] : []), ...cutoffs(now)).all<{
      id: string; asker: string; to_login: string; topic_kind: TopicKind; topic_key: string; pr: number | null; since: string
    }>()
  const waited = new Date(now - FOLLOWUP_DAYS * DAY).toISOString(), seen = new Map<string, boolean>(), due = []
  for (const row of results) {
    if (row.since > waited) {
      if (!seen.has(row.to_login)) seen.set(row.to_login, !!await recentBoardActivity(db, row.to_login, now))
      if (seen.get(row.to_login)) continue
    }
    due.push(row)
  }
  return due.map(row => ({
    id: row.id, since: row.since, to: row.to_login,
    target: row.pr ? 'pull/' + row.pr : row.topic_kind === 'issue' ? 'issues/' + row.topic_key : 'issues/new',
    draft: `@${row.to_login}, @${row.asker} has a question on the Modwerk agent board about ${row.topic_kind} ${row.topic_key}. Could you check your board inbox and reply to thread ${row.id}?`,
  }))
}

/** Questions, replies and claims nearing expiry for the signed-in developer. */
async function inbox(db: Database, user: { id: string; github_login: string }, nowMs: number) {
  const now = new Date(nowMs).toISOString(), live = cutoffs(nowMs)
  // Addressed to you, or to nobody about something you hold; and the last word is not yours.
  const waiting = (await db.prepare(MESSAGE_SELECT + " WHERE m.parent_id IS NULL AND m.kind='question' AND " + LIVE + ' AND m.user_id<>? AND (m.to_login=? OR (m.to_login IS NULL AND EXISTS(SELECT 1 FROM agent_claims c WHERE c.user_id=? AND c.kind=m.topic_kind AND c.claim_key=m.topic_key AND c.released_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>?)))) AND ' + LAST_WORD + '<>? ORDER BY m.active_at, m.rowid LIMIT 50').bind(...live, user.id, user.github_login, user.id, now, user.id).all<MessageRow>()).results
  const replies = (await db.prepare(MESSAGE_SELECT + ' WHERE m.parent_id IS NULL AND m.user_id=? AND ' + LIVE + ' AND ' + LAST_WORD + '<>? ORDER BY m.active_at DESC, m.rowid DESC LIMIT 50').bind(user.id, ...live, user.id).all<MessageRow>()).results
  const expiresBy = new Date(nowMs + CLAIM_EXPIRY_NOTICE_DAYS * DAY).toISOString()
  const { results: expiring } = await db.prepare(SELECT + ' WHERE c.user_id=? AND c.released_at IS NULL AND c.pull_request IS NULL AND c.expires_at>? AND c.expires_at<=? ORDER BY c.expires_at, c.id').bind(user.id, now, expiresBy).all<ClaimRow>()
  const drafts = await followups(db, nowMs, user.id)
  const { results: pilotTasks } = await db.prepare(`SELECT m.id,m.body,json_extract(s.value,'$.number') AS source FROM maintenance_bot_state s
    JOIN agent_messages m ON m.id=json_extract(s.value,'$.task') JOIN users u ON u.id=?
    WHERE s.key GLOB 'eval-pilot/*' AND json_extract(s.value,'$.result') IS NULL AND m.ended_at IS NULL
      AND m.created_at>? AND (m.to_login IS NULL OR m.to_login=u.github_login) AND CAST(json_extract(s.value,'$.authorId') AS TEXT)<>CAST(u.github_id AS TEXT)
    ORDER BY m.created_at LIMIT 5`).bind(user.id, live[2]).all<{ id: string; source: number; body: string }>()
  return { login: user.github_login, ...(pilotTasks.length ? { pilotTasks } : {}), waiting: await threads(db, waiting, nowMs), replies: await threads(db, replies, nowMs), expiring: expiring.map(view), ...(drafts.length ? { followups: drafts } : {}) }
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

const WEEK = 7 * DAY, ACTIVITY_WEEK_LIMIT = Math.floor(RELEASED_KEPT_DAYS / 7)

/** Counts by UTC week from the retained claim and message records. No author IDs leave the database. */
async function weeklyActivity(db: Database, nowMs: number, requested: string) {
  const weeks = Number(requested)
  if (!/^[1-9]\d?$/.test(requested) || weeks > ACTIVITY_WEEK_LIMIT) throw new HttpError(400, `Choose 1 to ${ACTIVITY_WEEK_LIMIT} weeks.`)
  const monday = new Date(nowMs)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const start = monday.getTime() - (weeks - 1) * WEEK
  const from = new Date(start).toISOString(), asOf = new Date(nowMs).toISOString()
  const { results } = await db.prepare(`WITH contributions AS (
      SELECT created_at AS at, user_id, 'claim' AS kind FROM agent_claims
      UNION ALL
      SELECT created_at, user_id, CASE WHEN parent_id IS NULL THEN kind ELSE 'reply' END FROM agent_messages
    ), events AS (
      SELECT at, user_id, kind FROM contributions
      UNION ALL
      SELECT MIN(at), NULL, 'first' FROM contributions GROUP BY user_id
      UNION ALL
      SELECT CASE WHEN released_reason='expired' THEN COALESCE(expires_at,released_at) ELSE COALESCE(released_at,expires_at) END,
        NULL, CASE WHEN released_at IS NULL OR released_reason='expired' THEN 'expired'
          WHEN released_reason='merged' THEN 'merged' WHEN released_reason='holder' THEN 'holder' ELSE 'other' END
      FROM agent_claims WHERE released_at IS NOT NULL OR expires_at<=?
    )
    SELECT CAST((julianday(at)-julianday(?))/7 AS INTEGER) AS week,
      COUNT(*) FILTER (WHERE kind='claim') AS claimsMade,
      COUNT(*) FILTER (WHERE kind='merged') AS merged, COUNT(*) FILTER (WHERE kind='holder') AS releasedByHolder,
      COUNT(*) FILTER (WHERE kind='expired') AS expired, COUNT(*) FILTER (WHERE kind='other') AS other,
      COUNT(DISTINCT user_id) AS active, COUNT(*) FILTER (WHERE kind='first') AS firstSeen,
      COUNT(*) FILTER (WHERE kind='question') AS questions, COUNT(*) FILTER (WHERE kind='finding') AS findings,
      COUNT(*) FILTER (WHERE kind='wanted') AS wanted, COUNT(*) FILTER (WHERE kind='reply') AS replies
    FROM events WHERE at>=? AND at<=? GROUP BY week`).bind(asOf, from, from, asOf).all<Record<string, number>>()
  const byWeek = new Map(results.map(row => [row.week, row]))
  return { asOf, weeks: Array.from({ length: weeks }, (_, index) => {
    const startsAt = start + index * WEEK, endsAt = startsAt + WEEK, row = byWeek.get(index)
    return {
      startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), complete: endsAt <= nowMs,
      claims: { made: row?.claimsMade ?? 0, ended: { merged: row?.merged ?? 0, releasedByHolder: row?.releasedByHolder ?? 0, expired: row?.expired ?? 0, other: row?.other ?? 0 } },
      developers: { active: row?.active ?? 0, firstSeen: row?.firstSeen ?? 0 },
      threads: { questions: row?.questions ?? 0, findings: row?.findings ?? 0, wanted: row?.wanted ?? 0 },
      replies: row?.replies ?? 0,
    }
  }) }
}

export async function agentBoardRoutes(request: Request, env: Env, db: Database, adminId: string | null): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (!path.startsWith('/api/agent-board/')) return null
  const nowMs = Date.now(), now = new Date(nowMs).toISOString()
  if (path === '/api/agent-board/me' && request.method === 'GET') return response({ login: needBoardUser(await boardUser(request, env, db)).github_login })
  if (path === '/api/agent-board/inbox' && request.method === 'GET') {
    const user = needBoardUser(await boardUser(request, env, db)), today = Math.floor(nowMs / DAY)
    await db.prepare('UPDATE developer_sessions SET board_inbox_day=? WHERE token_hash=? AND board_inbox_day IS NOT ?')
      .bind(today, await digest(request.headers.get('X-Modwerk-Developer')!), today).run()
    return response(await inbox(db, user, nowMs))
  }
  if (path === '/api/agent-board/followups' && request.method === 'GET') return response({ followups: await followups(db, nowMs) })
  if (path === '/api/agent-board/activity' && request.method === 'GET') {
    const weeks = url.searchParams.get('weeks')
    return response(weeks === null ? await activity(db, nowMs) : await weeklyActivity(db, nowMs, weeks))
  }
  if (path === '/api/agent-board/messages' || path.startsWith('/api/agent-board/messages/')) return await messageRoutes(request, url, env, db, adminId, nowMs)
  if (path === '/api/agent-board/collections/zoom-multistomp' && request.method === 'POST') {
    const user = needBoardUser(await boardUser(request, env, db))
    if (user.github_id !== String(authors.accounts.repeat98)) throw new HttpError(403, 'This reservation belongs to the release owner.')
    await throttle(db, 'agent-board:' + user.id, CLAIM_WRITES_PER_HOUR)
    return await reserveZoomCollection(db, user.id, now, nowMs)
  }
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
    if (kind === 'hook' && !current) {
      // Hook claims overlap by index: someone else's in the run refuses it, and the holder's own inside it give way to it.
      const span = hookSpan(key), active = await db.prepare(SELECT + " WHERE c.kind='hook' AND c.claim_key LIKE ? AND c.released_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>?)").bind(span.list + '/%', now).all<ClaimRow>()
      const near = active.results.filter(row => { const other = hookSpan(row.claim_key); return other.list === span.list && other.first <= span.last && span.first <= other.last })
      const theirs = near.find(row => row.user_id !== user.id), partly = near.find(row => { const other = hookSpan(row.claim_key); return other.first < span.first || other.last > span.last })
      if (theirs) throw new HttpError(409, held(theirs))
      if (partly) throw new HttpError(409, `You hold hook ${partly.claim_key}, which reaches past ${key}. Release it first (npm run board -- release ${partly.id}).`)
      for (const row of near) await db.prepare("UPDATE agent_claims SET released_at=?,released_reason='holder' WHERE id=? AND released_at IS NULL").bind(now, row.id).run()
    }
    if (current) {
      // Claiming what you already hold renews it, so pr:ready can claim on every run.
      await db.prepare('UPDATE agent_claims SET renewed_at=?,branch=COALESCE(?,branch),pull_request=COALESCE(?,pull_request),note=CASE WHEN ?=1 THEN ? ELSE note END,expires_at=CASE WHEN COALESCE(?,pull_request) IS NULL THEN ? ELSE NULL END WHERE id=?').bind(now, branch, pr, body.note === undefined ? 0 : 1, note, pr, expiry(nowMs, false), current.id).run()
      return response({ claim: view((await db.prepare(SELECT + ' WHERE c.id=?').bind(current.id).first<ClaimRow>())!), renewed: true })
    }
    // The limit keeps one developer's agents from hoarding keys. The owner, who assigns the work, has none (24 Nov 2026).
    if (user.github_id !== String(authors.accounts.repeat98)) {
      const count = await db.prepare(`SELECT COUNT(*) AS n FROM agent_claims WHERE user_id=? AND ${activeClaim}`).bind(user.id, now).first<{ n: number }>()
      if ((count?.n ?? 0) >= CLAIM_LIMIT) throw new HttpError(409, `You hold ${CLAIM_LIMIT} claims. Release one you no longer need first (npm run board -- release <id>).`)
    }
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
 * request by branch, release claims whose pull request was merged or closed, and end threads whose linked pull request
 * merged (a finding as folded, a question or wanted task as merged). A bounded batch per run, the least recently checked first. */
export async function syncAgentClaims(env: Env, db: Database, batch = 25) {
  const nowMs = Date.now(), now = new Date(nowMs).toISOString(), kept = new Date(nowMs - RELEASED_KEPT_DAYS * DAY).toISOString()
  const suspended = 'SELECT id FROM users WHERE suspended=1'
  await db.batch([
    db.prepare('DELETE FROM agent_claims WHERE released_at IS NOT NULL AND released_at<=?').bind(kept),
    db.prepare("UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE released_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").bind(now, now),
    db.prepare(`UPDATE agent_claims SET released_at=?,released_reason='suspended' WHERE released_at IS NULL AND user_id IN (${suspended})`).bind(now),
    db.prepare(`DELETE FROM agent_messages WHERE parent_id IN (SELECT id FROM agent_messages WHERE parent_id IS NULL AND (user_id IN (${suspended}) OR ended_at<=?))`).bind(kept),
    db.prepare(`DELETE FROM agent_messages WHERE user_id IN (${suspended}) OR (parent_id IS NULL AND ended_at<=?)`).bind(kept),
    db.prepare(`UPDATE agent_messages AS m SET ended_at=?,ended_reason='expired' WHERE m.parent_id IS NULL AND m.ended_at IS NULL AND ${ENDED}`).bind(now, ...cutoffs(nowMs)),
  ])
  if (!githubConfig(env)) return
  // Pilot tasks close when their independent case passes the controls and enters the suite.
  const folds = (await db.prepare("SELECT id,pull_request FROM agent_messages WHERE parent_id IS NULL AND ended_at IS NULL AND pull_request IS NOT NULL AND NOT (user_id='tars' AND kind='wanted' AND topic_key GLOB 'eval-pilot-*') ORDER BY checked_at IS NOT NULL,checked_at LIMIT ?").bind(batch).all<{ id: string; pull_request: number }>()).results
  for (const row of folds) {
    try {
      const pull = await pulls(env, '/pulls/' + row.pull_request) as PullState
      // Merged: a guide carries the finding, the question or task is settled. Closed without merging: the thread stays, unlinked.
      if (pull.state === 'closed' && pull.merged_at) await db.prepare("UPDATE agent_messages SET ended_at=?,ended_reason=CASE WHEN kind='finding' THEN 'folded' ELSE 'merged' END,checked_at=? WHERE id=? AND ended_at IS NULL").bind(now, now, row.id).run()
      else await db.prepare('UPDATE agent_messages SET pull_request=CASE WHEN ?=1 THEN NULL ELSE pull_request END,checked_at=? WHERE id=?').bind(pull.state === 'closed' ? 1 : 0, now, row.id).run()
    } catch (error) { console.error(`Board thread ${row.id} could not be checked on GitHub: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const rows = (await db.prepare("SELECT c.id,c.branch,c.pull_request,c.created_at,u.github_login FROM agent_claims c JOIN users u ON u.id=c.user_id WHERE c.released_at IS NULL AND (c.pull_request IS NOT NULL OR c.branch IS NOT NULL) ORDER BY c.checked_at IS NOT NULL,c.checked_at LIMIT ?").bind(batch).all<{ id: string; branch: string | null; pull_request: number | null; created_at: string; github_login: string }>()).results
  for (const row of rows) {
    try {
      if (row.pull_request) {
        const pull = await pulls(env, '/pulls/' + row.pull_request) as PullState
        if (pull.state === 'closed') await db.prepare('UPDATE agent_claims SET released_at=?,released_reason=?,checked_at=? WHERE id=? AND released_at IS NULL').bind(now, pull.merged_at ? 'merged' : 'closed', now, row.id).run()
        else await db.prepare('UPDATE agent_claims SET checked_at=? WHERE id=?').bind(now, row.id).run()
        continue
      }
      const found = await pulls(env, '/pulls?state=all&per_page=5&head=' + encodeURIComponent(row.github_login + ':' + row.branch)) as PullState[]
      // One merged between two runs was never seen open; linked now, the next run releases the claim. One merged before the claim is older work.
      const open = found.find(pull => pull.state === 'open') ?? found.find(pull => pull.merged_at && Date.parse(pull.merged_at) > Date.parse(row.created_at))
      await db.prepare('UPDATE agent_claims SET pull_request=COALESCE(?,pull_request),expires_at=CASE WHEN ? IS NULL THEN expires_at ELSE NULL END,checked_at=? WHERE id=?').bind(open?.number ?? null, open?.number ?? null, now, row.id).run()
    } catch (error) { console.error(`Board claim ${row.id} could not be checked on GitHub: ${error instanceof Error ? error.message : String(error)}`) }
  }
}
