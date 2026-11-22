// SPDX-License-Identifier: Elastic-2.0
import { expect, it, vi } from 'vitest'
import { pilotCandidates, pilotReport, recordPilotReviews, settlePilot } from './eval-pilot.mjs'

import { parseVerdict } from './screen-pilot.mjs'

it('requires one verdict and binds it to the source even if the model omits or substitutes identity', () => {
  const candidate = { number: 1918, merge: 'a'.repeat(40), hints: ['Check the last row'] }
  const run = answer => JSON.stringify({ subtype: 'success', result: JSON.stringify(answer) })
  expect(() => parseVerdict(run({ actions: [], todos: [], drop: [] }), candidate)).toThrow(/verdict/)
  expect(() => parseVerdict(run({ verdict: 'gap', hint: 3 }), candidate)).toThrow(/verdict/)
  expect(() => parseVerdict('{"is_error":true}', candidate)).toThrow(/completed review/)
  expect(parseVerdict(run({ number: 42, merge: 'other', verdict: 'gap', hint: 0 }), candidate)).toEqual({
    number: candidate.number, merge: candidate.merge, verdict: 'gap', hint: 0,
  })
  expect(parseVerdict(run({ verdict: 'other' }), candidate).verdict).toBe('other')
})

const pulls = Array.from({ length: 9 }, (_, i) => ({
  number: i + 1, merged_at: '2026-11-22T00:00:0' + i + 'Z', updated_at: '2026-11-22T00:01:00Z',
  merge_commit_sha: String(i + 1).repeat(40), user: { id: i + 100, login: 'dev' }, title: 'Correct the selection',
}))
const api = async path => {
  if (path.startsWith('/pulls?')) return [...pulls].reverse()
  const n = Number(path.split('/')[2])
  return [{ filename: n === 1 ? 'scripts/one.test.mjs' : 'scripts/one.mjs' }]
}
it('screens chronological production changes, stops at a missing verdict and excludes non-fixes from the five', async () => {
  const records = [{ number: 2, verdict: 'other' }, { number: 3, verdict: 'covered' }]
  const batch = await pilotCandidates(api, records)
  expect(batch.map(pr => pr.number)).toEqual([4, 5, 6, 7, 8])
  const bot = vi.fn(async () => ({ records }))
  await recordPilotReviews(api, bot, batch.filter(row => row.number !== 6).map(row => ({ ...row, verdict: 'gap', hint: 0, body: 'private note' })))
  expect(bot.mock.calls.filter(([, method]) => method === 'POST').map(([, , row]) => [row.number, row.hint])).toEqual([[4, 'Correct the selection'], [5, 'Correct the selection']])
  expect(await pilotCandidates(() => { throw Error('pilot already full') }, pulls.slice(0, 5).map(() => ({ verdict: 'covered' })))).toEqual([])
})

it('pins the landed commit from the merged timeline event when GitHub omits the PR field', async () => {
  const pr = { ...pulls[2], merge_commit_sha: undefined }
  const sha = 'e'.repeat(40)
  const events = [{ event: 'merged', commit_id: sha }, { event: 'closed', commit_id: 'f'.repeat(40) }]
  const read = async path => {
    if (path.startsWith('/pulls?')) return [pr]
    if (path.startsWith('/issues/3/timeline?')) return events
    return [{ filename: 'scripts/check.mjs' }]
  }
  expect(await pilotCandidates(read, [])).toEqual([expect.objectContaining({ number: 3, merge: sha })])
  events.shift()
  await expect(pilotCandidates(read, [])).rejects.toThrow(/Missing merge commit.*#3/)
})

it('counts a case only on independent, merged and passing evidence for the exact source revision', async () => {
  const row = { number: 8, merge: 'f'.repeat(40), authorId: 10, verdict: 'gap', task: 'task' }
  const thread = async () => ({ message: { to: 'ada', pullRequest: 42, replies: [] } })
  const pr = { number: 42, merged: true, base: { ref: 'main' }, head: { sha: 'test', ref: 'feature', repo: { id: 7 } }, user: { id: 11, login: 'ada' } }
  const item = { id: 'node-fix-8', pr: 8, merge: row.merge }
  const run = { conclusion: 'success', head_sha: 'test', head_repository: { id: 7 }, head_branch: 'feature', pull_requests: [] }
  const read = async path => path.includes('/files?') ? [{ filename: 'scripts/agent-eval/cases.mjs', patch: "+  id: 'node-fix-8'" }]
    : path.startsWith('/actions/') ? { workflow_runs: [run] } : pr
  const bot = vi.fn()
  await settlePilot(read, bot, thread, [row], [{ ...item, merge: 'old' }])
  pr.user.id = row.authorId
  await settlePilot(read, bot, thread, [row], [item])
  pr.user.id = 11
  run.conclusion = 'failure'
  await settlePilot(read, bot, thread, [row], [item])
  expect(bot).not.toHaveBeenCalled()
  run.conclusion = 'success'
  await settlePilot(read, bot, thread, [row], [item])
  expect(bot).toHaveBeenCalledWith('/eval-pilot/8', 'POST', { result: 'added', evidence: 42 })
  const records = [...Array.from({ length: 4 }, () => ({ verdict: 'covered' })), row]
  expect(pilotReport(records)).toMatch(/0 verified cases added.*1 awaiting/)
  row.result = 'added'; row.evidence = 42
  expect(pilotReport(records)).toMatch(/complete: 5\/5 fixes screened, 1 verified cases? added.*#42/)
})
