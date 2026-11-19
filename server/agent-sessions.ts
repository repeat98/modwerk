// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Shared agent sessions (docs/AGENT_SESSIONS.md). A developer signed in for the board sends the conversation of one
// coding-agent session, scrubbed on their computer; the Worker checks it again with the same rules and keeps it for the
// owner for 90 days. Only the developer who shared it and administrators read it; the developer deletes it at any time.
import type { Database, Env } from './platform'
import { throttle } from './auth'
import { HttpError, jsonBody, response } from './security'
import { boardUser } from './agent-board'
import { SESSION_CONSENT_VERSION, SESSION_GZIP_LIMIT, SESSION_RETENTION_DAYS, validateSession } from '../src/community/agent-sessions'

export const SESSIONS_PER_DAY = 10, SESSIONS_KEPT = 30
const DAY = 86400000, UNPACKED_LIMIT = 8_000_000
const ID = /^[0-9a-f-]{36}$/

type SessionRow = { id: string; user_id: string; github_login: string | null; agent: string; branch: string | null; note: string; entries: number; started_at: string | null; ended_at: string | null; bytes: number; created_at: string }
const SELECT = 'SELECT s.id,s.user_id,u.github_login,s.agent,s.branch,s.note,s.entries,s.started_at,s.ended_at,s.bytes,s.created_at FROM agent_sessions s JOIN users u ON u.id=s.user_id'
const expires = (createdAt: string) => new Date(Date.parse(createdAt) + SESSION_RETENTION_DAYS * DAY).toISOString()
const view = (row: SessionRow) => ({ id: row.id, login: row.github_login, agent: row.agent, branch: row.branch, note: row.note, entries: row.entries, startedAt: row.started_at, endedAt: row.ended_at, bytes: row.bytes, createdAt: row.created_at, expiresAt: expires(row.created_at) })

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new HttpError(400, 'Send the session as base64.')
  const binary = atob(value), bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
/** Unpacks a gzip body, stopping at the limit so a small upload cannot expand into a large one. */
async function gunzip(bytes: Uint8Array<ArrayBuffer>) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > UNPACKED_LIMIT) { await reader.cancel(); throw new HttpError(413, 'The session is too large.') }
      parts.push(value)
    }
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'The session is not valid gzip.') }
  const all = new Uint8Array(size); let at = 0
  for (const part of parts) { all.set(part, at); at += part.length }
  return new TextDecoder().decode(all)
}

/** A board user who is also a site administrator: the owner reads shared sessions from the terminal with their board session. */
async function adminBoardUser(db: Database, userId: string) {
  return !!await db.prepare('SELECT 1 FROM users WHERE id=? AND is_admin=1 AND email_verified=1 AND suspended=0').bind(userId).first()
}

export async function agentSessionRoutes(request: Request, env: Env, db: Database, adminId: string | null): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (path !== '/api/agent-sessions' && !path.startsWith('/api/agent-sessions/')) return null
  const user = await boardUser(request, env, db)
  if (!user && !adminId) throw new HttpError(401, 'Sign in for the board first: npm run board -- login')
  const admin = !!adminId || (!!user && await adminBoardUser(db, user.id))

  if (path === '/api/agent-sessions' && request.method === 'POST') {
    if (!user) throw new HttpError(401, 'Share a session from the terminal: npm run session -- share')
    const body = await jsonBody(request, Math.ceil(SESSION_GZIP_LIMIT * 4 / 3) + 1024)
    if (body.consent !== SESSION_CONSENT_VERSION) throw new HttpError(400, 'Update your checkout: the sharing terms changed (docs/AGENT_SESSIONS.md).')
    if (typeof body.data !== 'string') throw new HttpError(400, 'Send the session.')
    const packed = decodeBase64(body.data)
    if (packed.length > SESSION_GZIP_LIMIT) throw new HttpError(413, 'The session is too large.')
    let parsed: unknown
    try { parsed = JSON.parse(await gunzip(packed)) } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'The session is not valid JSON.') }
    const checked = validateSession(parsed)
    if (!checked.ok) throw new HttpError(422, checked.error)
    const kept = await db.prepare('SELECT COUNT(*) AS n FROM agent_sessions WHERE user_id=?').bind(user.id).first<{ n: number }>()
    if ((kept?.n ?? 0) >= SESSIONS_KEPT) throw new HttpError(409, `You have ${SESSIONS_KEPT} shared sessions. Delete one first: npm run session -- list, then delete <id>.`)
    await throttle(db, 'agent-session:' + user.id, SESSIONS_PER_DAY, 86400)
    const { session } = checked, id = crypto.randomUUID(), now = new Date().toISOString()
    await db.prepare('INSERT INTO agent_sessions(id,user_id,agent,branch,note,entries,started_at,ended_at,consent_version,bytes,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, user.id, session.agent, session.branch ?? null, session.note, session.entries.length, session.startedAt ?? null, session.endedAt ?? null, SESSION_CONSENT_VERSION, packed.length, body.data, now).run()
    return response({ id, expiresAt: expires(now) }, 201)
  }

  if (path === '/api/agent-sessions' && request.method === 'GET') {
    const all = url.searchParams.get('all') === '1'
    if (all && !admin) throw new HttpError(403, 'Only the owner reads everyone\'s shared sessions.')
    if (!all && !user) throw new HttpError(401, 'Sign in for the board first: npm run board -- login')
    const rows = all
      ? (await db.prepare(SELECT + ' ORDER BY s.created_at DESC LIMIT 500').all<SessionRow>()).results
      : (await db.prepare(SELECT + ' WHERE s.user_id=? ORDER BY s.created_at DESC').bind(user!.id).all<SessionRow>()).results
    return response({ sessions: rows.map(view) })
  }

  const id = path.slice('/api/agent-sessions/'.length)
  if (!ID.test(id)) throw new HttpError(404, 'Session not found.')
  const row = await db.prepare(SELECT + ' WHERE s.id=?').bind(id).first<SessionRow>()
  // Someone else's session answers like a missing one.
  if (!row || (!admin && row.user_id !== user?.id)) throw new HttpError(404, 'Session not found.')
  if (request.method === 'GET') {
    const data = await db.prepare('SELECT data FROM agent_sessions WHERE id=?').bind(id).first<{ data: string }>()
    return response({ ...view(row), session: JSON.parse(await gunzip(decodeBase64(data!.data))) })
  }
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM agent_sessions WHERE id=?').bind(id).run()
    return response({ deleted: id })
  }
  throw new HttpError(405, 'Use GET or DELETE.')
}

/** Hourly: sessions older than 90 days and those of suspended accounts go. */
export async function cleanupAgentSessions(db: Database, now = new Date()) {
  await db.prepare('DELETE FROM agent_sessions WHERE created_at<? OR user_id IN (SELECT id FROM users WHERE suspended=1)').bind(new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY).toISOString()).run()
}
