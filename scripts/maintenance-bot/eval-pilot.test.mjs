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

it('opens one issue per gap unless one names the source PR, and counts a case only once main holds it with passing controls', async () => {
  const gap = { number: 8, merge: 'f'.repeat(40), authorId: 10, verdict: 'gap', hint: 'Keeps the last row.' }
  const covered = { ...gap, number: 1921 }
  const issues = [{ number: 2379, state: 'open', title: 'Eval cases', body: 'Gaps from #1921, #1923 and #1925.' }, { number: 50, pull_request: {}, state: 'open', title: 'Fix #8', body: '' }]
  const jobs = [{ name: 'controls', conclusion: 'failure' }]
  const sent = []
  const api = async (path, method, body) => {
    if (method === 'POST') { sent.push([path, body]); return { number: 2400, state: 'open', ...body } }
    if (path.startsWith('/issues?')) return issues
    if (path.startsWith('/actions/workflows/')) { expect(path).toContain('head_sha=main-sha'); return { workflow_runs: [{ id: 1 }] } }
    return { jobs }
  }
  const bot = vi.fn()
  await settlePilot(api, bot, [gap, covered], 'main-sha', [])
  // #2379 already names #1921; the pull request that names #8 is not an issue.
  expect(sent).toEqual([['/issues', expect.objectContaining({ labels: ['workflow', 'help wanted'], title: 'Eval case for the Node fix in #8', body: expect.stringContaining('Keeps the last row. ') })]])
  const item = { id: 'node-fix-8', pr: 8, merge: gap.merge }
  issues.push({ number: 2400, state: 'open', title: 'Eval case for the Node fix in #8', body: '' })
  await settlePilot(api, bot, [gap], 'main-sha', [{ ...item, merge: 'old' }])
  await settlePilot(api, bot, [gap], 'main-sha', [item])
  expect(bot).not.toHaveBeenCalled()
  jobs[0].conclusion = 'success'
  await settlePilot(api, bot, [gap], 'main-sha', [item])
  expect(bot).toHaveBeenCalledWith('/eval-pilot/8', 'POST', { result: 'added', evidence: 2400 })
  Object.assign(issues[0], { state: 'closed', state_reason: 'not_planned' })
  await settlePilot(api, bot, [covered], 'main-sha', [])
  expect(bot).toHaveBeenLastCalledWith('/eval-pilot/1921', 'POST', { result: 'different-result' })
  expect(sent).toHaveLength(1)
  const records = [...Array.from({ length: 4 }, () => ({ verdict: 'covered' })), gap]
  expect(pilotReport(records)).toMatch(/0 verified cases added.*1 awaiting a case on main/)
  gap.result = 'added'; gap.evidence = 2400
  expect(pilotReport(records)).toMatch(/complete: 5\/5 fixes screened, 1 verified cases? added.*#2400/)
})
