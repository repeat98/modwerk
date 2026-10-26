import { describe, expect, it } from 'vitest'
import { CLOSE_AFTER_DAYS, NEEDS_WORK, ONE_AT_A_TIME, decide, queuedPulls } from './pr-triage.mjs'

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
  it('queues every newer module PR from a contributor without a published module', () => {
    const pulls = [{ number: 12, author: 'new', module: true }, { number: 10, author: 'new', module: true }, { number: 11, author: 'new', module: false }, { number: 13, author: 'known', module: true }, { number: 14, author: 'known', module: true }]
    expect([...queuedPulls(pulls, new Set(['known']))]).toEqual([12])
    expect(decide({ ...base, queued: true })).toEqual([{ add: ONE_AT_A_TIME }])
    expect(decide({ ...base, labels: [ONE_AT_A_TIME] })).toEqual([{ remove: ONE_AT_A_TIME }])
  })
})
