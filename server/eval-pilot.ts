// SPDX-License-Identifier: Elastic-2.0
import type { Database } from './platform'
import { HttpError } from './security'
import { messageBody } from './agent-board'

const prefix = 'eval-pilot/'
type RecordRow = { number: number; merge: string; authorId: number; verdict: string; task?: string; result?: string; evidence?: number }
const validNumber = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
export async function pilotRecords(db: Database): Promise<RecordRow[]> {
  const { results } = await db.prepare("SELECT value FROM maintenance_bot_state WHERE key GLOB 'eval-pilot/*' ORDER BY rowid").all<{ value: string }>()
  return results.map(row => JSON.parse(row.value))
}

export async function recordPilot(db: Database, body: Record<string, unknown>) {
  const { number, authorId, merge, verdict } = body
  if (!validNumber(number) || !validNumber(authorId) || typeof merge !== 'string' || !/^[a-f0-9]{40}$/.test(merge) ||
      typeof verdict !== 'string' || !['other', 'covered', 'unsuitable', 'gap'].includes(verdict)) throw new HttpError(400, 'Invalid Node fix review.')
  const record: RecordRow = { number, authorId, merge, verdict }
  const key = prefix + number
  const statements = []
  if (verdict === 'gap') record.task = crypto.randomUUID()
  const value = JSON.stringify(record)
  statements.push(db.prepare(`INSERT OR IGNORE INTO maintenance_bot_state(key,value) SELECT ?,?
    WHERE (SELECT count(*) FROM maintenance_bot_state WHERE key GLOB 'eval-pilot/*' AND json_extract(value,'$.verdict')!='other')<5`).bind(key, value))
  if (record.task) {
    // Only the transaction which inserted this UUID can create its public task.
    const at = new Date().toISOString()
    let hint = ''
    try { if (typeof body.hint === 'string') hint = messageBody(body.hint.slice(0, 160)) + '. ' } catch { /* The public PR remains the reference. */ }
    const text = messageBody('Independently verify the Node script behavior from PR #' + number + '. ' + hint
      + 'Check the parent fails, the merge passes and a working case stays green. See the five-fix pilot in the agent eval guide.')
    statements.push(db.prepare(`INSERT INTO agent_messages(id,kind,topic_kind,topic_key,user_id,body,priority,created_at,active_at)
      SELECT ?,'wanted','site',?,'tars',?,'normal',?,? WHERE EXISTS (SELECT 1 FROM maintenance_bot_state WHERE key=? AND value=?)`)
      .bind(record.task, 'eval-pilot-' + number, text, at, at, key, value))
  }
  await db.batch(statements)
}

export async function finishPilotCase(db: Database, number: number, body: Record<string, unknown>) {
  const result = body.result, evidence = body.evidence
  if (result !== 'different-result' && !(result === 'added' && validNumber(evidence))) throw new HttpError(400, 'Invalid verification result.')
  const key = prefix + number
  const at = new Date().toISOString()
  await db.batch([
    db.prepare(`UPDATE maintenance_bot_state SET value=json_set(value,'$.result',?,'$.evidence',?)
      WHERE key=? AND json_extract(value,'$.task') IS NOT NULL AND json_extract(value,'$.result') IS NULL`).bind(result, evidence ?? null, key),
    db.prepare(`UPDATE agent_messages SET ended_at=?,ended_reason='administrator' WHERE ended_at IS NULL AND
      id=(SELECT json_extract(value,'$.task') FROM maintenance_bot_state WHERE key=? AND json_extract(value,'$.result') IS NOT NULL)`).bind(at, key),
  ])
}
