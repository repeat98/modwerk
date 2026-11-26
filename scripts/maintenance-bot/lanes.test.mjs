// SPDX-License-Identifier: Elastic-2.0
import { expect, it } from 'vitest'
import { HARD_CAP, plan } from './lanes.mjs'

const pr = (number, extra = {}) => ({ number, head: 'a' + number, draft: false, checks: 'green', comments: 0, labels: [], waitingRuns: 0, updated: '2026-11-25T10:00:00Z', ...extra })
const quietWorld = { prs: [], issues: [], threads: [], rooms: [], forum: [], shouts: [] }
const now = Date.parse('2026-11-26T07:00:00Z')

it('gives changed pull requests to the hard lane and everything else that changed to the light lane', () => {
  const world = { ...quietWorld, prs: [pr(1)], issues: [{ number: 9, comments: 1, labels: [] }], rooms: [{ id: 'r1', last: 'm1' }] }
  const first = plan({ ...world, now })
  expect(first.hard).toEqual([1])
  expect(first.light).toMatchObject({ issues: [9], discord: ['r1'], board: [], forum: [] })
  // Nothing changed since: no lane has work, so no model starts.
  expect(plan({ ...world, seen: first.items, now })).toMatchObject({ hard: [], light: null })
  const next = plan({ ...world, prs: [pr(1, { head: 'b1' })], seen: first.items, now })
  expect(next).toMatchObject({ hard: [1], light: null })
})

it('waits for running checks, then judges the pull request once they settle', () => {
  const seen = plan({ ...quietWorld, prs: [pr(1)], now }).items
  const running = plan({ ...quietWorld, prs: [pr(1, { head: 'b1', checks: 'pending' })], seen, now })
  expect(running.hard).toEqual([])
  expect(running.items.p1).toBe(seen.p1)
  expect(plan({ ...quietWorld, prs: [pr(1, { head: 'b1' })], seen: running.items, now }).hard).toEqual([1])
  // Required checks that have not started: wait after a fresh push, judge a pull request they never start on.
  const fresh = pr(1, { head: 'c1', checks: 'incomplete', updated: '2026-11-26T06:50:00Z' })
  expect(plan({ ...quietWorld, prs: [fresh], seen, now }).hard).toEqual([])
  expect(plan({ ...quietWorld, prs: [{ ...fresh, updated: '2026-11-26T05:00:00Z' }], seen, now }).hard).toEqual([1])
})

it('takes ready pull requests first, caps the hard lane, and keeps the rest for the next pass', () => {
  const prs = [pr(1, { draft: true }), ...Array.from({ length: HARD_CAP }, (_, index) => pr(index + 2))]
  const first = plan({ ...quietWorld, prs, now })
  expect(first.hard).toEqual(prs.slice(1).map(item => item.number))
  expect(first.items.p1).toBeUndefined()
  expect(plan({ ...quietWorld, prs, seen: first.items, now }).hard).toEqual([1])
})

it('sweeps issues, board threads and week-quiet pull requests on the daily run, in the light lane', () => {
  const world = { ...quietWorld, prs: [pr(1), pr(2, { updated: '2026-11-10T10:00:00Z' })], issues: [{ number: 9, comments: 1, labels: [] }], threads: [{ id: 't1', replies: [] }] }
  const seen = plan({ ...world, now }).items
  expect(plan({ ...world, seen, daily: true, now })).toMatchObject({ hard: [], light: { issues: [9], pullRequests: [2], board: ['t1'], discord: [] } })
})
