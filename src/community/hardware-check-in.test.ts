import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtModules } from './build-follow-up'
import { watchHardwareCheckIn } from './hardware-check-in'
import { CHECK_IN_DELAY, dueHardwareFeedback, FEEDBACK_DELAY, FEEDBACK_SNOOZE, nextHardwareCheckIn, readHardwareFeedback, rememberHardwareFeedback, updateHardwareFeedback } from './hardware-feedback'

const now = Date.UTC(2026, 9, 8), build = { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapeecho'], { miniverb: '0.0.1', tapeecho: '0.0.2' }) }
let storage: Map<string, string>, page: EventTarget, observers: (() => void)[], stops: (() => void)[]
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  storage = new Map(); page = new EventTarget(); observers = []; stops = []
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(page, { body: {} }))
  vi.stubGlobal('MutationObserver', class { constructor(check: () => void) { observers.push(check) } observe() {} disconnect() {} })
  const locks = new Map<string, Promise<unknown>>()
  vi.stubGlobal('navigator', { locks: { request: (name: string, run: () => void) => {
    const next = (locks.get(name) ?? Promise.resolve()).then(run)
    locks.set(name, next.catch(() => {})); return next
  } } })
})
afterEach(() => { stops.forEach(stop => stop()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the post-download check-in', () => {
  it('opens after five minutes without navigation and retains the downloaded versions', async () => {
    const open = vi.fn()
    stops.push(watchHardwareCheckIn('alice', open, () => true))
    rememberHardwareFeedback('alice', build)
    expect(CHECK_IN_DELAY).toBe(5 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY - 1); expect(open).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledOnce()
    expect(open.mock.calls[0][0].modules).toEqual(build.modules)
    expect(readHardwareFeedback('alice')[0].checkInShownAt).toBe(now + CHECK_IN_DELAY)
    window.dispatchEvent(new Event('focus')); page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(FEEDBACK_DELAY); expect(open).toHaveBeenCalledOnce()
    expect(dueHardwareFeedback('bob')).toBeUndefined()
  })
  it('waits for visibility and a closed dialog, then claims only once across tabs', async () => {
    let visible = false, otherDialog = true
    const first = vi.fn(), second = vi.fn(), ready = () => visible && !otherDialog
    rememberHardwareFeedback('alice', build)
    stops.push(watchHardwareCheckIn('alice', first, ready), watchHardwareCheckIn('alice', second, ready))
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY + 1000)
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled()
    visible = true; page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0); expect(first).not.toHaveBeenCalled()
    otherDialog = false; observers.forEach(check => check())
    await vi.advanceTimersByTimeAsync(0)
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1)
    stops.push(watchHardwareCheckIn('alice', vi.fn(() => { throw new Error('Repeat popup') }), () => true))
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY)
    expect(nextHardwareCheckIn('alice')).toBeUndefined()
  })
  it('uses a fresh deadline for a changed build and never confirms companion modules', async () => {
    const open = vi.fn()
    rememberHardwareFeedback('alice', build)
    stops.push(watchHardwareCheckIn('alice', open, () => true))
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY / 2)
    const changed = { ...build, modules: builtModules(['miniverb', 'euclid'], { miniverb: '0.0.3' }) }
    rememberHardwareFeedback('alice', changed)
    updateHardwareFeedback('alice', changed, { completed: 'miniverb' })
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY / 2); expect(open).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY / 2)
    expect(open).toHaveBeenCalledOnce()
    expect(open.mock.calls[0][0].completed).toEqual(['miniverb'])
    expect(open.mock.calls[0][0].modules).toEqual(changed.modules)
  })
  it('keeps completed, dismissed and snoozed builds quiet, including another download', async () => {
    const open = vi.fn()
    rememberHardwareFeedback('done', build); updateHardwareFeedback('done', build, { completed: build.modules.map(module => module.id) })
    rememberHardwareFeedback('dismissed', build); updateHardwareFeedback('dismissed', build, 'dismiss')
    rememberHardwareFeedback('later', build); updateHardwareFeedback('later', build, 'later')
    for (const member of ['done', 'dismissed', 'later']) stops.push(watchHardwareCheckIn(member, open, () => true))
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY)
    rememberHardwareFeedback('later', build)
    expect(open).not.toHaveBeenCalled()
    expect(dueHardwareFeedback('later')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(FEEDBACK_SNOOZE - CHECK_IN_DELAY)
    expect(dueHardwareFeedback('later')).toBeDefined()
    expect(open).not.toHaveBeenCalled()
  })
  it('preserves legacy inline reminders without turning them into new popups', async () => {
    rememberHardwareFeedback('alice', build)
    const [key] = storage.keys(), [record] = JSON.parse(storage.get(key)!)
    delete record.checkInAt; storage.set(key, JSON.stringify([record]))
    const open = vi.fn(); stops.push(watchHardwareCheckIn('alice', open, () => true))
    await vi.advanceTimersByTimeAsync(FEEDBACK_DELAY)
    expect(open).not.toHaveBeenCalled(); expect(dueHardwareFeedback('alice')).toBeDefined()
  })
  it('cancels a queued claim on sign-out or unmount, without consuming the reminder', async () => {
    let queued: (() => void) | undefined
    vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => void) => { queued = run; return Promise.resolve() } } })
    rememberHardwareFeedback('alice', build)
    const open = vi.fn(), stop = watchHardwareCheckIn('alice', open, () => true)
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY); stop(); queued!()
    expect(open).not.toHaveBeenCalled()
    expect(nextHardwareCheckIn('alice')).toBeDefined()
    window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY)
    expect(open).not.toHaveBeenCalled()
  })
  it('does not open an unrecorded popup when storage becomes unwritable', async () => {
    rememberHardwareFeedback('alice', build)
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: () => { throw new Error('Full') } })
    const open = vi.fn(); stops.push(watchHardwareCheckIn('alice', open, () => true))
    await vi.advanceTimersByTimeAsync(CHECK_IN_DELAY + 1000)
    expect(open).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
