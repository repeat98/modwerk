// SPDX-License-Identifier: GPL-3.0-or-later
// Send a built OS upgrade to the unit over USB MIDI, as Elektron Transfer does (os-upgrade.ts): the browser asks the
// person for MIDI access with SysEx, the unit's ports are found by its name, and each block waits for the unit's
// answer. When the unit has the whole upload it asks UPGRADE OS NOW?; only YES on the unit erases and writes the flash,
// and NO leaves it on its OS. Nothing here presses anything on the unit.
import { useCallback, useEffect, useRef, useState } from 'react'
import { sendUpgrade, UpgradeError, type UpgradeProgress } from '../engine/elektron/os-upgrade'
import { findUnit, midiLine, type MidiAccessLike } from '../engine/elektron/os-upgrade-midi'
import type { UpgradeLine } from '../engine/elektron/os-upgrade'

export type UsbUpgradeState =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'sending'; sent: number; total: number }
  | { phase: 'confirm'; seconds: number }
  | { phase: 'failed'; error: string }

export type MidiAccessRequest = () => Promise<MidiAccessLike>

/** The browser's Web MIDI with SysEx, or a refusal the page can show. */
export const browserMidi: MidiAccessRequest = async () => {
  const request = (navigator as Navigator & { requestMIDIAccess?: (options: { sysex: boolean }) => Promise<MidiAccessLike> }).requestMIDIAccess
  if (!request) throw new UpgradeError('This browser has no Web MIDI. Use a Chromium-based browser (Chrome, Edge, Brave) on a computer.')
  try { return await request.call(navigator, { sysex: true }) }
  catch { throw new UpgradeError('MIDI access was not allowed. Allow MIDI with SysEx for this site and try again.') }
}

/** What a failed send tells the person: the sender's own words, or a plain one. */
export function upgradeErrorText(error: unknown): string {
  return error instanceof UpgradeError ? error.message : 'The upload stopped: ' + (error instanceof Error ? error.message : 'unknown error') + '. The unit stays on its OS.'
}

/** Thrown inside a run once its build is no longer the one on the page: nothing more is sent. */
class Cancelled extends Error {}

/** The line, stopped by `signal`: no message goes out after it fires, and a wait for the unit's answer ends with it. */
function cancellable(line: UpgradeLine, signal: AbortSignal): UpgradeLine {
  return {
    send(data) { if (signal.aborted) throw new Cancelled(); line.send(data) },
    next(ms) {
      if (signal.aborted) return Promise.reject(new Cancelled())
      return new Promise((resolve, reject) => {
        const stop = () => reject(new Cancelled())
        signal.addEventListener('abort', stop, { once: true })
        line.next(ms).then(m => { signal.removeEventListener('abort', stop); resolve(m) }, e => { signal.removeEventListener('abort', stop); reject(e) })
      })
    },
  }
}

/** One upload, the states it passes through given to `onState`: connecting, sending with its progress, then confirm
 * once the unit has it all (it now asks UPGRADE OS NOW?), or failed with what to tell the person. `signal` belongs to
 * the build the person chose: once it fires (they left the page or chose another build), the run reports nothing more
 * and sends nothing more, even if the browser's MIDI permission is granted only afterwards; the unit stays on its OS. */
export async function runUsbUpgrade(midi: MidiAccessRequest, unitName: string, syx: Uint8Array, onState: (state: UsbUpgradeState) => void,
  now = () => Date.now(), signal: AbortSignal = new AbortController().signal) {
  const report = (state: UsbUpgradeState) => { if (!signal.aborted) onState(state) }
  report({ phase: 'connecting' })
  const started = now()
  let close = () => {}
  try {
    const access = await midi()
    if (signal.aborted) throw new Cancelled()           // permission came after the build changed: send nothing
    const unit = findUnit(access, unitName)
    if (!unit) throw new UpgradeError(`No ${unitName} found over USB MIDI. Connect it, close Elektron Transfer and any other MIDI program, and try again.`)
    const line = midiLine(unit.input, unit.output)
    close = line.close
    await sendUpgrade(cancellable(line, signal), syx, (progress: UpgradeProgress) => report({ phase: 'sending', sent: progress.sent, total: progress.total }))
    report({ phase: 'confirm', seconds: (now() - started) / 1000 })
  } catch (error) {
    if (!(error instanceof Cancelled)) report({ phase: 'failed', error: upgradeErrorText(error) })
  } finally {
    close()                                             // the MIDI listener is given back, cancelled or not
  }
}

/** The page's one upload at a time, across panels: a send from a panel mounted while an earlier run winds down (its
 * permission prompt still open, say) starts once that run has ended. */
let pageRun: Promise<void> | null = null

/** Sends `build` (its SHA-256: what the page shows now). Choosing another build or leaving the page cancels a run that
 * has not finished, a pending MIDI permission included, and a run only ever sends the bytes of the build it started for. */
export function useUsbUpgrade(unitName: string, build: string, midi: MidiAccessRequest = browserMidi) {
  // The state is the build's and the run's it was reported for: another build shows idle, without a render of the old
  // state, and so does a cancelled run's when the person comes back to its build (A, then B, then A again).
  const [held, setHeld] = useState<{ build: string; state: UsbUpgradeState; run?: AbortController }>({ build, state: { phase: 'idle' } })
  const state: UsbUpgradeState = held.build === build && !held.run?.signal.aborted ? held.state : { phase: 'idle' }
  const run = useRef<{ build: string; controller: AbortController } | null>(null)
  useEffect(() => () => { run.current?.controller.abort(); run.current = null }, [build, unitName])
  const send = useCallback(async (syx: Uint8Array, forBuild: string) => {
    if (run.current || forBuild !== build) return
    const controller = new AbortController()
    run.current = { build: forBuild, controller }
    const previous = pageRun
    const setState = (next: UsbUpgradeState) => setHeld({ build: forBuild, state: next, run: controller })
    setState({ phase: 'connecting' })
    const mine = (async () => {
      await previous
      if (!controller.signal.aborted) await runUsbUpgrade(midi, unitName, syx, setState, undefined, controller.signal)
    })()
    pageRun = mine
    try {
      await mine
    } finally {
      if (pageRun === mine) pageRun = null
      if (run.current?.controller === controller) run.current = null
      // A cancelled run leaves nothing behind: its last state (connecting, say) is not shown again for its build.
      if (controller.signal.aborted) setHeld(h => h.run === controller ? { build: h.build, state: { phase: 'idle' } } : h)
    }
  }, [midi, unitName, build])
  const reset = useCallback(() => { if (!run.current) setHeld({ build, state: { phase: 'idle' } }) }, [build])
  return { state, send, reset }
}
