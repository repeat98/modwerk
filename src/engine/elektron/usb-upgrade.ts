// SPDX-License-Identifier: GPL-3.0-or-later
// Sending a build from the page to an Elektron unit over USB MIDI: the stock OS upgrade (os-upgrade.ts), through the
// port whose name names the model (os-upgrade-midi.ts). The unit then asks UPGRADE OS NOW?; only YES there erases and
// writes its flash, so a person at the unit decides. Only machines whose upgrade over USB ran on a unit are listed.
import type { DigiMachine } from './ele3'
import { sendUpgrade, type UpgradeProgress } from './os-upgrade'
import { findUnit, midiLine, type MidiAccessLike } from './os-upgrade-midi'

/** The model name each machine's USB MIDI port carries. The Model:Cycles took the upgrade from the site's sender on a
 * unit (sdk/machines/model-cycles/LINK.md). */
export const USB_UPGRADE_PORTS: Partial<Record<DigiMachine, string>> = { 'model-cycles': 'Model:Cycles' }

export function usbUpgradePort(machine: string): string | undefined {
  return Object.hasOwn(USB_UPGRADE_PORTS, machine) ? USB_UPGRADE_PORTS[machine as DigiMachine] : undefined
}

/** The browser's MIDI with SysEx, which asks the person first; null where the browser has none. */
export function browserMidi(): (() => Promise<MidiAccessLike>) | null {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { requestMIDIAccess?: (options: { sysex: boolean }) => Promise<unknown> } : undefined
  return nav?.requestMIDIAccess ? () => nav.requestMIDIAccess!({ sysex: true }) as Promise<MidiAccessLike> : null
}

/** Send `syx` to the one connected unit whose port names `model`. Resolves when the unit has the whole file and asks
 * UPGRADE OS NOW?; throws, with the unit still on its OS, when there is no such unit or it refuses. */
export async function sendOverUsb(requestAccess: () => Promise<MidiAccessLike>, model: string, syx: Uint8Array, onProgress?: (p: UpgradeProgress) => void): Promise<void> {
  const access = await requestAccess(), unit = findUnit(access, model)
  if (!unit) throw new Error('No ' + model + ' found over USB. Connect one ' + model + ', close Elektron Transfer, and try again.')
  const line = midiLine(unit.input, unit.output)
  try { await sendUpgrade(line, syx, onProgress) } finally { line.close() }
}
