import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtModules, hardwareReportBody } from './build-follow-up'
import { dueHardwareFeedback, FEEDBACK_DELAY, FEEDBACK_RETENTION, FEEDBACK_SNOOZE, pendingFeedback, readHardwareFeedback, rememberHardwareFeedback, updateHardwareFeedback } from './hardware-feedback'

let storage: Map<string, string>
const now = Date.UTC(2026, 9, 7), build = { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapeecho'], { miniverb: '0.0.1', tapeecho: '0.0.2' }) }
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => vi.unstubAllGlobals())

describe('hardware feedback on a later visit', () => {
  it('survives returning to the site, waits an hour, and retains the downloaded versions', () => {
    rememberHardwareFeedback('alice', build, now)
    expect(dueHardwareFeedback('alice', now + FEEDBACK_DELAY - 1)).toBeUndefined()
    const restored = dueHardwareFeedback('alice', now + FEEDBACK_DELAY)!
    expect(restored.modules).toEqual(build.modules)
    expect(hardwareReportBody(restored.machine, restored.os, restored.modules[0], restored.modules)).toContain('0.0.1')
    expect(hardwareReportBody(restored.machine, restored.os, restored.modules[0], restored.modules)).toContain('0.0.2')
    expect(dueHardwareFeedback('bob', now + FEEDBACK_DELAY)).toBeUndefined()
    expect(dueHardwareFeedback('', now + FEEDBACK_DELAY)).toBeUndefined()
  })
  it('snoozes for a day and preserves that choice on another download of the same build', () => {
    rememberHardwareFeedback('alice', build, now)
    updateHardwareFeedback('alice', build, 'later', now + FEEDBACK_DELAY)
    rememberHardwareFeedback('alice', build, now + 2 * FEEDBACK_DELAY)
    expect(dueHardwareFeedback('alice', now + FEEDBACK_SNOOZE)).toBeUndefined()
    expect(dueHardwareFeedback('alice', now + FEEDBACK_DELAY + FEEDBACK_SNOOZE)).toBeDefined()
  })
  it('can request a tomorrow reminder after reopening a previously dismissed build', () => {
    rememberHardwareFeedback('alice', build, now)
    updateHardwareFeedback('alice', build, 'dismiss', now)
    rememberHardwareFeedback('alice', build, now + FEEDBACK_DELAY)
    updateHardwareFeedback('alice', build, 'later', now + FEEDBACK_DELAY)
    expect(dueHardwareFeedback('alice', now + FEEDBACK_DELAY + FEEDBACK_SNOOZE - 1)).toBeUndefined()
    expect(dueHardwareFeedback('alice', now + FEEDBACK_DELAY + FEEDBACK_SNOOZE)).toBeDefined()
  })
  it('keeps dismissed and completed builds quiet, while still asking for unfinished modules', () => {
    rememberHardwareFeedback('alice', build, now)
    updateHardwareFeedback('alice', build, { completed: 'miniverb' }, now + FEEDBACK_DELAY)
    expect(pendingFeedback(dueHardwareFeedback('alice', now + FEEDBACK_DELAY)!)).toEqual([build.modules[1]])
    // Full build context remains available in a report about the remaining module.
    expect(readHardwareFeedback('alice', now + FEEDBACK_DELAY)[0].modules).toHaveLength(2)
    updateHardwareFeedback('alice', build, { completed: ['miniverb', 'tapeecho'] }, now + FEEDBACK_DELAY)
    rememberHardwareFeedback('alice', build, now + 2 * FEEDBACK_DELAY)
    expect(dueHardwareFeedback('alice', now + 3 * FEEDBACK_DELAY)).toBeUndefined()
    rememberHardwareFeedback('bob', build, now)
    updateHardwareFeedback('bob', build, 'dismiss', now)
    rememberHardwareFeedback('bob', build, now + FEEDBACK_DELAY)
    expect(dueHardwareFeedback('bob', now + 2 * FEEDBACK_DELAY)).toBeUndefined()
  })
  it('replaces an older build of the same machine without losing a different machine', () => {
    rememberHardwareFeedback('alice', build, now)
    const digi = { machine: 'Digitakt', os: '1.54', modules: builtModules(['digitakt-euclidean']) }
    rememberHardwareFeedback('alice', digi, now + 1)
    const newer = { ...build, modules: builtModules(['miniverb'], { miniverb: '0.0.3' }) }
    rememberHardwareFeedback('alice', newer, now + 2)
    updateHardwareFeedback('alice', build, { completed: 'miniverb' }, now + 3)
    const records = readHardwareFeedback('alice', now + 3)
    expect(records).toHaveLength(2)
    expect(records[0].modules).toEqual(newer.modules)
    expect(records[0].completed).toEqual([])
    expect(records[1].machine).toBe('Digitakt')
  })
  it('expires records, rejects malformed storage and tolerates unavailable browser storage', () => {
    rememberHardwareFeedback('alice', build, now)
    expect(dueHardwareFeedback('alice', now + FEEDBACK_RETENTION)).toBeUndefined()
    const [key] = storage.keys()
    for (const value of ['broken', '{}', '[null]', '[{"machine":"Octatrack"}]']) {
      storage.set(key, value)
      expect(readHardwareFeedback('alice', now)).toEqual([])
    }
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } })
    expect(() => rememberHardwareFeedback('alice', build, now)).not.toThrow()
    expect(() => updateHardwareFeedback('alice', build, { completed: 'miniverb' }, now)).not.toThrow()
    expect(dueHardwareFeedback('alice', now)).toBeUndefined()
  })
})
