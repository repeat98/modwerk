// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The agent board (docs/AGENT_BOARD.md): claims every developer's agent can read before it ports a module or takes a
// hook, table or migration number. Reads are public; a claim needs a GitHub-linked developer or board session.
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

/** A claim's note reaches other developers' agents, so it is short plain prose: no links, paths, addresses, code or tokens. */
export function claimNote(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new HttpError(400, 'The note must be text.')
  const note = value.trim()
  if (note.length > NOTE_LIMIT) throw new HttpError(400, `Keep the note to ${NOTE_LIMIT} characters.`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(note)) throw new HttpError(400, 'The note must be one line of text.')
  if (/https?:|www\.|\b[a-z0-9-]+\.(?:com|org|net|app|io|dev)\b/i.test(note)) throw new HttpError(400, 'Leave links out of the note; the pull request carries them.')
  if (/~\/|\S*\/\S*\/|\\/.test(note)) throw new HttpError(400, 'Leave file paths out of the note.')
  if (/0x[0-9a-f]{3,}|\b[0-9a-f]{12,}\b/i.test(note)) throw new HttpError(400, 'Leave addresses and hashes out of the note.')
  if (/[`{}<>;$]|[A-Za-z0-9_+=-]{32,}/.test(note)) throw new HttpError(400, 'Leave code and tokens out of the note.')
  return note
}
function claimKind(value: unknown): ClaimKind {
  if (!CLAIM_KINDS.includes(value as ClaimKind)) throw new HttpError(400, 'Choose a kind: ' + CLAIM_KINDS.join(', ') + '.')
  return value as ClaimKind
}
function claimKey(kind: ClaimKind, value: unknown): string {
  if (typeof value !== 'string' || value.length > 120 || !CLAIM_KEYS[kind].test(value)) throw new HttpError(400, `That is not a ${kind} key (for example ${{ module: 'octatrack/tape-echo', hook: 'octatrack/39', migration: '0085', 'dsp-region': 'octatrack/fx2-delay-line' }[kind]}).`)
  return value
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
const held = (row: ClaimRow) => `${row.kind} ${row.claim_key} is claimed by @${row.github_login}` + (row.branch ? ` on ${row.branch}` : '') + (row.pull_request ? ` (pull request #${row.pull_request})` : '') + (row.expires_at ? ` until ${row.expires_at.slice(0, 10)}` : '') + '. Ask them, or pick another.'

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

export async function agentBoardRoutes(request: Request, env: Env, db: Database, adminId: string | null): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (path !== '/api/agent-board/me' && !path.startsWith('/api/agent-board/claims')) return null
  const nowMs = Date.now(), now = new Date(nowMs).toISOString()
  if (path === '/api/agent-board/me' && request.method === 'GET') return response({ login: needBoardUser(await boardUser(request, env, db)).github_login })
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

/** Hourly: release expired claims and those of suspended accounts, delete claims released more than 90 days ago (the privacy
 * notice's retention), link claims to their pull request by branch, and release claims whose pull request was merged or
 * closed. A bounded batch per run, the least recently checked first. */
export async function syncAgentClaims(env: Env, db: Database, batch = 25) {
  const now = new Date().toISOString()
  await db.batch([
    db.prepare('DELETE FROM agent_claims WHERE released_at IS NOT NULL AND released_at<=?').bind(new Date(Date.now() - RELEASED_KEPT_DAYS * DAY).toISOString()),
    db.prepare("UPDATE agent_claims SET released_at=?,released_reason='expired' WHERE released_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").bind(now, now),
    db.prepare("UPDATE agent_claims SET released_at=?,released_reason='suspended' WHERE released_at IS NULL AND user_id IN (SELECT id FROM users WHERE suspended=1)").bind(now),
  ])
  if (!githubConfig(env)) return
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
