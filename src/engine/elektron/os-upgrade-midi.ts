// SPDX-License-Identifier: GPL-3.0-or-later
// The Web MIDI line os-upgrade.ts talks through: the unit's USB MIDI input and output, found by the port name the
// unit gives (e.g. "Digitone II"), and every SysEx message it sends, queued until asked for. The page asks for
// MIDI access with SysEx; the browser asks the person first.
import type { UpgradeLine } from './os-upgrade'

export type MidiPort = { readonly id: string; readonly name?: string | null; readonly state?: string }
export type MidiIn = MidiPort & { onmidimessage: ((event: { data: Uint8Array }) => void) | null }
export type MidiOut = MidiPort & { send(data: number[], timestamp?: number): void }
export type MidiAccessLike = { readonly inputs: Iterable<[string, MidiIn]> | Map<string, MidiIn>; readonly outputs: Iterable<[string, MidiOut]> | Map<string, MidiOut> }

const connected = (port: MidiPort) => port.state !== 'disconnected'
const named = (name: string) => (port: MidiPort) => connected(port) && (port.name ?? '').toLowerCase().includes(name.toLowerCase())

/** The unit's input and output whose names hold `name`; null unless exactly one of each is connected. */
export function findUnit(access: MidiAccessLike, name: string): { input: MidiIn; output: MidiOut } | null {
  const inputs = [...access.inputs].map(([, p]) => p).filter(named(name)), outputs = [...access.outputs].map(([, p]) => p).filter(named(name))
  return inputs.length === 1 && outputs.length === 1 ? { input: inputs[0], output: outputs[0] } : null
}

/** A line over the unit's ports. close() gives the input back. SysEx split across events is joined. */
export function midiLine(input: MidiIn, output: MidiOut): UpgradeLine & { close(): void } {
  const queue: Uint8Array[] = []
  let waiting: ((m: Uint8Array | null) => void) | null = null, partial: number[] | null = null
  const deliver = (m: Uint8Array) => { if (waiting) { const w = waiting; waiting = null; w(m) } else queue.push(m) }
  input.onmidimessage = event => {
    for (const b of event.data) {
      if (b === 0xf0) partial = [b]
      else if (partial && b === 0xf7) { partial.push(b); deliver(Uint8Array.from(partial)); partial = null }
      else if (partial && b < 0x80) partial.push(b)
      else if (b < 0xf8) partial = null   // a status byte ends a SysEx message; real-time bytes may sit inside one
    }
  }
  return {
    send(data) { output.send(Array.from(data)) },
    next(ms) {
      const queued = queue.shift()
      if (queued) return Promise.resolve(queued)
      return new Promise(resolve => {
        const timer = setTimeout(() => { if (waiting === done) waiting = null; resolve(null) }, ms)
        const done = (m: Uint8Array | null) => { clearTimeout(timer); resolve(m) }
        waiting = done
      })
    },
    close() { input.onmidimessage = null },
  }
}
