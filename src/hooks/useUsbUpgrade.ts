// SPDX-License-Identifier: GPL-3.0-or-later
// Send a built OS upgrade to the unit over USB MIDI, as Elektron Transfer does (os-upgrade.ts): the browser asks the
// person for MIDI access with SysEx, the unit's ports are found by its name, and each block waits for the unit's
// answer. When the unit has the whole upload it asks UPGRADE OS NOW?; only YES on the unit erases and writes the flash,
// and NO leaves it on its OS. Nothing here presses anything on the unit.
import { useCallback, useRef, useState } from 'react'
import { sendUpgrade, UpgradeError, type UpgradeProgress } from '../engine/elektron/os-upgrade'
import { findUnit, midiLine, type MidiAccessLike } from '../engine/elektron/os-upgrade-midi'

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

/** One upload, the states it passes through given to `onState`: connecting, sending with its progress, then confirm
 * once the unit has it all (it now asks UPGRADE OS NOW?), or failed with what to tell the person. */
export async function runUsbUpgrade(midi: MidiAccessRequest, unitName: string, syx: Uint8Array, onState: (state: UsbUpgradeState) => void, now = () => Date.now()) {
  onState({ phase: 'connecting' })
  const started = now()
  let close = () => {}
  try {
    const access = await midi()
    const unit = findUnit(access, unitName)
    if (!unit) throw new UpgradeError(`No ${unitName} found over USB MIDI. Connect it, close Elektron Transfer and any other MIDI program, and try again.`)
    const line = midiLine(unit.input, unit.output)
    close = line.close
    await sendUpgrade(line, syx, (progress: UpgradeProgress) => onState({ phase: 'sending', sent: progress.sent, total: progress.total }))
    onState({ phase: 'confirm', seconds: (now() - started) / 1000 })
  } catch (error) {
    onState({ phase: 'failed', error: upgradeErrorText(error) })
  } finally {
    close()
  }
}

export function useUsbUpgrade(unitName: string, midi: MidiAccessRequest = browserMidi) {
  const [state, setState] = useState<UsbUpgradeState>({ phase: 'idle' })
  const running = useRef(false)
  const send = useCallback(async (syx: Uint8Array) => {
    if (running.current) return
    running.current = true
    try {
      await runUsbUpgrade(midi, unitName, syx, setState)
    } finally {
      running.current = false
    }
  }, [midi, unitName])
  const reset = useCallback(() => { if (!running.current) setState({ phase: 'idle' }) }, [])
  return { state, send, reset }
}
