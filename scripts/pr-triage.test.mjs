import { describe, expect, it } from 'vitest'
import { CLOSE_AFTER_DAYS, NEEDS_WORK, ONE_AT_A_TIME, decide, newestRuns, queuedPulls } from './pr-triage.mjs'

const day = 86400000, now = Date.parse('2026-10-25T12:00:00Z'), ago = days => new Date(now - days * day).toISOString()
const base = { red: false, labels: [], labeledAt: undefined, headDate: ago(30), now, queued: false }

describe('PR triage policy', () => {
  it('labels a red PR once and unlabels it when the checks go green', () => {
    expect(decide({ ...base, red: true })).toEqual([{ add: NEEDS_WORK }])
    expect(decide({ ...base, red: true, labels: [NEEDS_WORK], labeledAt: ago(1) })).toEqual([])
    expect(decide({ ...base, labels: [NEEDS_WORK], labeledAt: ago(1) })).toEqual([{ remove: NEEDS_WORK }])
  })
  it('closes only after the label has stood for the whole period with no new commit', () => {
    const red = { ...base, red: true, labels: [NEEDS_WORK] }
    expect(decide({ ...red, labeledAt: ago(CLOSE_AFTER_DAYS), headDate: ago(CLOSE_AFTER_DAYS + 1) })).toEqual([{ close: true }])
    expect(decide({ ...red, labeledAt: ago(CLOSE_AFTER_DAYS - 1), headDate: ago(30) })).toEqual([])
    expect(decide({ ...red, labeledAt: ago(CLOSE_AFTER_DAYS), headDate: ago(2) })).toEqual([])
    expect(decide({ ...red, labeledAt: undefined })).toEqual([])
  })
  it('reads only the newest run of each check, so a green rerun replaces an earlier failure', () => {
    const run = (id, name, conclusion, started_at) => ({ id, name, conclusion, started_at })
    const runs = [run(1, 'module-pr-ok', 'failure', ago(1)), run(2, 'module-pr-ok', 'success', ago(0.5)), run(3, 'module-contract', 'cancelled', ago(1)), run(4, 'flag', 'success', ago(1))]
    expect(newestRuns(runs).map(r => r.id).sort()).toEqual([2, 3, 4])
    expect(newestRuns([run(5, 'x', 'failure', ago(1)), run(6, 'x', 'success', ago(1))]).map(r => r.id)).toEqual([6])
    expect(newestRuns([run(7, 'x', 'failure', ago(1)), run(8, 'x', null, null)]).map(r => r.id)).toEqual([8])
    expect(newestRuns([run(9, 'x', 'success', ago(1)), run(10, 'x', 'failure', ago(0.5))]).map(r => r.id)).toEqual([10])
  })
  it('queues every newer module PR from a contributor without a published module', () => {
    const pulls = [{ number: 12, author: 'new', module: true }, { number: 10, author: 'new', module: true }, { number: 11, author: 'new', module: false }, { number: 13, author: 'known', module: true }, { number: 14, author: 'known', module: true }]
    expect([...queuedPulls(pulls, new Set(['known']))]).toEqual([12])
    expect(decide({ ...base, queued: true })).toEqual([{ add: ONE_AT_A_TIME }])
    expect(decide({ ...base, labels: [ONE_AT_A_TIME] })).toEqual([{ remove: ONE_AT_A_TIME }])
  })
})
