// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OctatrackLoad } from './OctatrackLoad'
import { DSP_STOPPED, FROZEN_READINGS, LOAD_INTERVAL, recordLoad } from '../hooks/useOctatrackLoad'
import { loadPath } from '../config/octatrack-load'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { LoadReading } from '../engine/elekloader/upload-wire'

const reading = (ticks = 120): LoadReading => ({ ticks, frames: ticks * 50, cpu: 123, tracks1to4: 234, tracks5to8: 345, peak1to4: 456, peak5to8: 567 })
let container: HTMLDivElement, root: ReturnType<typeof createRoot>, stops: (() => void)[] = []
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(0); stops = []; container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { stops.forEach(stop => stop()); await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function device(implementation: () => Promise<LoadReading | undefined> = async () => reading(), log: () => Promise<unknown> = async () => undefined) {
  const load = vi.fn(implementation), deviceLog = vi.fn(log)
  let state: LinkState = { status: 'ready', identity: { base: 'a'.repeat(64), canSubmit: true, model: 'OT' } }
  const listeners = new Set<() => void>()
  const link = { liveLoad: load, deviceLog, start: () => () => {}, getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) } } as unknown as OctatrackLink
  return { link, load, deviceLog, update(next: LinkState) { state = next; for (const listener of listeners) listener() } }
}
const record = (link: OctatrackLink) => act(() => { stops.push(recordLoad(link)) })
const render = async (link: OctatrackLink | null, active = true) => { if (link && !stops.length) await record(link); await act(() => root.render(createElement(OctatrackLoad, { link, active }))) }
it('shows current and historical readings, with separate peaks and an accessible table', async () => {
  const unit = device(); await render(unit.link)
  expect(container.textContent).toContain('12.3%'); expect(container.textContent).toContain('Recent device peak 45.6%')
  expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Missing readings')
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  expect(container.querySelector('.load-highest')?.textContent).toContain('Highest 34.5% · DSP tracks 5–8')
  await act(() => container.querySelector<HTMLButtonElement>('button')!.click())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
})
it('records before Status opens, pauses during a sync and keeps the history, and stops with the recorder', async () => {
  const unit = device(); await record(unit.link); expect(unit.load).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(4000)); expect(unit.load).toHaveBeenCalledTimes(3)
  await act(() => unit.update({ status: 'testing', identity: unit.link.getState().identity }))
  await act(() => vi.advanceTimersByTimeAsync(10000)); expect(unit.load).toHaveBeenCalledTimes(3)
  await act(() => unit.update({ status: 'ready', identity: unit.link.getState().identity })); expect(unit.load).toHaveBeenCalledTimes(4)
  await render(unit.link); expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
  stops.pop()!(); await act(() => vi.advanceTimersByTimeAsync(10000)); expect(unit.load).toHaveBeenCalledTimes(4)
})
it('never overlaps requests or appends a late reply after the recorder stops', async () => {
  let complete: (value: LoadReading) => void = () => {}
  const load = vi.fn(() => new Promise<LoadReading>(resolve => { complete = resolve })), unit = device(load)
  await render(unit.link); await act(() => vi.advanceTimersByTimeAsync(10000)); expect(load).toHaveBeenCalledTimes(1)
  stops.pop()!(); await act(() => complete(reading()))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
})
it('limits history to 150 samples and treats transport failures or frozen counters as gaps', async () => {
  let ticks = 0
  const unit = device(vi.fn(async () => reading(++ticks)))
  await render(unit.link); await act(() => vi.advanceTimersByTimeAsync(302000))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(150)
  unit.load.mockRejectedValueOnce(new Error('Busy')); await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(container.querySelector('tbody tr:last-child')?.textContent).toContain('———')
  unit.load.mockResolvedValueOnce(reading(ticks)); await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(container.textContent).toContain('Waiting for fresh')
})
it('stops reading an unsupported base and does not present self-test peaks as current load', async () => {
  const unit = device(vi.fn(async () => undefined)); await render(unit.link)
  await act(() => vi.advanceTimersByTimeAsync(10000)); expect(unit.load).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('Live load needs a newer Modwerk base')
  expect(container.querySelector('.load-meter strong')?.textContent).toBe('—'); expect(container.querySelector('svg')).toBeNull()
})
it('expires current values during a stalled read and resets history on a different base', async () => {
  const unit = device(); await render(unit.link)
  unit.load.mockImplementationOnce(() => new Promise(() => {}))
  await act(() => vi.advanceTimersByTimeAsync(8001))
  expect(container.querySelector('.load-meter strong')?.textContent).toBe('—')
  await act(() => unit.update({ status: 'ready', identity: { base: 'b'.repeat(64), canSubmit: true, model: 'OT' } }))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
})
it('breaks graph lines across missing, stale or hidden intervals', () => {
  const sample = reading()
  const path = loadPath([{ at: 1000, reading: sample }, { at: 3000, reading: null }, { at: 5000, reading: sample }, { at: 15000, reading: sample }], 'cpu', 15000)
  expect(path.match(/M/g)).toHaveLength(3); expect(path).not.toContain('L')
  expect(loadPath([{ at: 0, reading: sample }], 'cpu', 300001)).toBe('')
})
it('shows one line instead of empty meters while no unit is connected', async () => {
  const unit = device(); unit.update({ status: 'idle' }); await render(unit.link)
  expect(unit.load).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Connect your Octatrack over USB')
  expect(container.querySelectorAll('.load-meter strong')).toHaveLength(3); expect(container.querySelector('svg')).toBeNull()
})
it('reads the unit’s stall record once readings stay frozen, and asks for a power cycle only when its DSP stopped', async () => {
  const stalled = { stallSeen: 1, stall: { count: 2, reason: 1, ticks: 0, report: [] } }
  const frozen = async (log: () => Promise<unknown>) => {
    const unit = device(async () => reading(7), log); await render(unit.link)
    await act(() => vi.advanceTimersByTimeAsync(LOAD_INTERVAL * FROZEN_READINGS - 1)); expect(unit.deviceLog).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1)); expect(unit.deviceLog).toHaveBeenCalledTimes(1)
    const text = container.textContent!; stops.pop()!(); return { unit, text }
  }
  // An earlier start's stall, or another tab holding the unit, is no reason; a stall since this start or a failed transfer is.
  expect((await frozen(async () => ({ ...stalled, stallSeen: 2 }))).text).not.toContain(DSP_STOPPED)
  expect((await frozen(() => Promise.reject(new Error('busy')))).text).not.toContain(DSP_STOPPED)
  expect((await frozen(() => Promise.reject(new Error('busy', { cause: new Error('transfer') })))).text).toContain(DSP_STOPPED)
  const { unit, text } = await frozen(async () => stalled)
  expect(text).toContain(DSP_STOPPED)
  // The next poll (the unit back after its power cycle) starts without it.
  await record(unit.link); expect(container.textContent).not.toContain(DSP_STOPPED)
})
