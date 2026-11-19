import { useSyncExternalStore } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { LoadReading } from '../engine/elekloader/upload-wire'
import type { LoadPoint } from '../config/octatrack-load'
import { useOctatrackLink } from './useOctatrackLink'

export const LOAD_INTERVAL = 2000, LOAD_HISTORY = 150
/** Readings in a row with frozen counters (10 s, twice the base's 5 s freeze limit, diag.c) before the unit's stall
 * record is read, and again every as many while they stay frozen. */
export const FROZEN_READINGS = 5
export const DSP_STOPPED = 'Your Octatrack’s DSP stopped, so it makes no sound. Switch it off and on: it starts as usual, with the modules you kept.'
interface History { link: OctatrackLink; base: string; points: LoadPoint[]; notice: string; unsupported: boolean; stopped: boolean; now: number }
let history: History | undefined
const listeners = new Set<() => void>(), reading = new WeakSet<OctatrackLink>()
const publish = (next: History) => { history = next; for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
/** Whether the unit's DSP stalled since it started (dsp.c's stall record, read from its log here and never uploaded),
 * or the read failed in transfer, so the unit no longer answers it. */
const dspStopped = (link: OctatrackLink, signal: AbortSignal) => link.deviceLog(signal).then(log => !!log?.stall && log.stall.count !== log.stallSeen,
  // The link's LinkBusyError, by shape: another tab or a load holding the unit (no transfer cause) is no stall.
  error => error instanceof Error && error.cause instanceof Error && error.cause.name !== 'AbortError')

/** One cached read every two seconds while the unit is idle; stopped by the returned function. */
function poll(link: OctatrackLink, base: string) {
  const same = () => history?.link === link && history.base === base
  if (same() && history!.unsupported) return () => {}
  if (same() && history!.stopped) publish({ ...history!, notice: '', stopped: false }) // a new connection, as after the power cycle
  let live = true, timer: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined
  let previous: { ticks: number; frames: number } | undefined, frozen = 0, stopped = false
  const update = (value: LoadReading | null | undefined, notice: string, unsupported = false) => {
    const now = Date.now(), points = same() ? history!.points : []
    publish({ link, base, points: value === undefined ? points : [...points, { at: now, reading: value }].slice(-LOAD_HISTORY), notice: stopped ? DSP_STOPPED : notice, unsupported, stopped, now })
  }
  const schedule = () => { if (live) timer = setTimeout(() => void read(), LOAD_INTERVAL) }
  const read = async () => {
    if (!live) return
    if (reading.has(link)) { schedule(); return }
    reading.add(link); controller = new AbortController()
    // Expire displayed values even if a USB transfer takes longer than normal.
    expiry = setTimeout(() => { if (live) update(undefined, 'Waiting for a fresh USB reading.') }, 6001)
    let again = true
    try {
      const value = await link.liveLoad(controller.signal, () => live)
      if (!live) return
      if (!value) { again = false; update(undefined, 'This base does not provide live load yet. Install the current Modwerk base to see it.', true); return }
      const last = previous
      previous = { ticks: value.ticks, frames: value.frames }
      // Frozen tick/frame counters indicate unavailable timing, not an idle instrument.
      const stalled = !!last && (last.ticks === value.ticks || last.frames === value.frames)
      frozen = stalled ? frozen + 1 : 0
      // Frozen this long, the unit's own record says whether its DSP stopped, which only a power cycle undoes.
      if (!stalled) stopped = false
      else if (!stopped && frozen % FROZEN_READINGS === 0) { stopped = await dspStopped(link, controller.signal); if (!live) return }
      update(stalled ? null : value, stalled ? 'Waiting for fresh device meter windows.' : '')
    } catch { if (live) update(null, 'USB is busy or unavailable. History resumes when a read succeeds.') }
    finally { clearTimeout(expiry); reading.delete(link); if (again) schedule() }
  }
  void read()
  return () => { live = false; clearTimeout(timer); clearTimeout(expiry); controller?.abort() }
}

/** Records the unit's load on every page while it is connected and idle (a sync takes priority), so Status shows
 * the last five minutes when it opens. Returns its stop. */
export function recordLoad(link: OctatrackLink) {
  let base = '', stop = () => {}
  const check = () => {
    const state = link.getState(), next = state.status === 'ready' && state.identity?.canSubmit ? state.identity.base : ''
    if (next === base) return
    stop(); base = next; stop = next ? poll(link, next) : () => {}
  }
  const unsubscribe = link.subscribe(check)
  check()
  return () => { unsubscribe(); stop() }
}

/** The recorded load of this link's current base. */
export function useOctatrackLoad(link: OctatrackLink | null) {
  const state = useOctatrackLink(link), base = state.identity?.base
  const recorded = useSyncExternalStore(subscribe, () => history, () => undefined)
  const current = recorded?.link === link && recorded?.base === base ? recorded : undefined
  const ready = state.status === 'ready' && !!state.identity?.canSubmit
  return { points: current?.points ?? [], notice: current?.notice ?? '', now: current?.now ?? 0, ready, unsupported: !!current?.unsupported, stopped: ready && !!current?.stopped, clear: () => { if (current) publish({ ...current, points: [] }) } }
}
