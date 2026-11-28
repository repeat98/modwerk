// SPDX-License-Identifier: Elastic-2.0
import type { Database } from './platform'
import { HttpError } from './security'
import { messageBody } from './agent-board'

const prefix = 'eval-pilot/'
type RecordRow = { number: number; merge: string; authorId: number; verdict: string; task?: string; hint?: string; result?: string; evidence?: number }
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
  // A gap's public evidence goes into the GitHub issue the bot opens for it.
  if (verdict === 'gap' && typeof body.hint === 'string') try { record.hint = messageBody(body.hint.slice(0, 160)) } catch { /* The public PR remains the reference. */ }
  await db.prepare(`INSERT OR IGNORE INTO maintenance_bot_state(key,value) SELECT ?,?
    WHERE (SELECT count(*) FROM maintenance_bot_state WHERE key GLOB 'eval-pilot/*' AND json_extract(value,'$.verdict')!='other')<5`).bind(prefix + number, JSON.stringify(record)).run()
}

export async function finishPilotCase(db: Database, number: number, body: Record<string, unknown>) {
  const result = body.result, evidence = body.evidence
  if (result !== 'different-result' && !(result === 'added' && validNumber(evidence))) throw new HttpError(400, 'Invalid verification result.')
  await db.prepare(`UPDATE maintenance_bot_state SET value=json_set(value,'$.result',?,'$.evidence',?)
    WHERE key=? AND json_extract(value,'$.verdict')='gap' AND json_extract(value,'$.result') IS NULL`).bind(result, evidence ?? null, prefix + number).run()
}
