// SPDX-License-Identifier: GPL-3.0-or-later
// A Digitone II with a development base, from Node: the site's link client (src/engine/elektron/dn2-link.ts) over the
// computer's MIDI (zoom-device.ts's nodeMidiAccess), for the developer MCP (scripts/frontend-mcp.mjs). Read: the link's
// identity, the runtime loader's state and the diagnostics log. Write (the MCP gates it): a runtime package as a trial
// through the site's UploadSession, then Keep or Undo. No raw memory, keys or flashing. Node only.
import { createHash } from 'node:crypto'
import type { MidiAccessLike, MidiIn, MidiOut } from '../src/engine/zoom/zoom-link.ts'
import { ident, readLog, uploadTransport, UPLOAD_BASE, type LinkLine } from '../src/engine/elektron/dn2-link.ts'
import { UploadSession, type UploadTransport } from '../src/engine/elekloader/upload-session.ts'
import { encodeUploadRequest } from '../src/engine/elekloader/upload-wire.ts'

const PORT = /digitone ii/i
/** A frame at least this often while a trial is open: the unit rolls a trial back after ten seconds without one. */
export const KEEPALIVE_MS = 3000
const ports = <T>(list: MidiAccessLike['inputs'] | MidiAccessLike['outputs']) => [...(list as Iterable<[string, T]>)].map(([, port]) => port)

/** The link over Web MIDI's shape: the unit's one input and output, whole SysEx messages in a queue. RtMidi hands a
 * long SysEx over in pieces, so the pieces from F0 to F7 are joined first. */
export function midiLinkLine(access: MidiAccessLike): LinkLine {
  const input = ports<MidiIn>(access.inputs).filter(port => PORT.test(port.name ?? ''))
  const output = ports<MidiOut>(access.outputs).filter(port => PORT.test(port.name ?? ''))
  if (input.length !== 1 || output.length !== 1) throw new Error('Connect one Digitone II over USB (found ' + input.length + ' inputs and ' + output.length + ' outputs named Digitone II).')
  const queue: Uint8Array[] = []
  let waiting: ((message: Uint8Array) => void) | undefined, partial: number[] | undefined
  input[0].onmidimessage = ({ data }) => {
    for (const byte of data) {
      if (byte === 0xf0) partial = [byte]
      else if (partial && byte >= 0xf8) continue      // real-time bytes may sit inside a SysEx
      else if (partial) partial.push(byte)
      if (byte !== 0xf7 || !partial) continue
      const message = Uint8Array.from(partial)
      partial = undefined
      if (waiting) { const deliver = waiting; waiting = undefined; deliver(message) } else queue.push(message)
    }
  }
  return {
    send: data => output[0].send(Array.from(data)),
    next: ms => {
      const ready = queue.shift()
      if (ready) return Promise.resolve(ready)
      return new Promise(done => {
        const timer = setTimeout(() => { waiting = undefined; done(null) }, ms)
        waiting = message => { clearTimeout(timer); done(message) }
      })
    },
  }
}

/** One frame at a time: the link holds one upload frame, so a keepalive never meets a session's frame. */
function serial(transport: UploadTransport): UploadTransport {
  let tail: Promise<unknown> = Promise.resolve()
  return { exchange: (frame, signal) => { const run = tail.then(() => transport.exchange(frame, signal)); tail = run.catch(() => {}); return run } }
}

export class DigitoneUnit {
  private readonly line: LinkLine
  private readonly transport: UploadTransport
  private session?: UploadSession
  private keepalive?: ReturnType<typeof setInterval>
  private readonly keepaliveMs: number
  constructor(line: LinkLine, keepaliveMs = KEEPALIVE_MS) { this.line = line; this.transport = serial(uploadTransport(line)); this.keepaliveMs = keepaliveMs }

  /** The link's counters, the RAM boot status, the modules live and the loader's phase. Read-only. */
  async status() {
    const link = await ident(this.line)
    const loader = (await UploadSession.connect(this.transport, UPLOAD_BASE)).status
    return { link, loader: { phase: loader.phase, generation: loader.generation, activeKnown: loader.activeKnown, active: loader.active }, trialOpen: !!this.session }
  }
  /** The diagnostics log, as the site parses the Octatrack's. Read-only. */
  async log() { return (await readLog(this.line)).log ?? null }
  /** Loads a runtime package (sdk/runtime/loader/build.py) for a trial; never keeps it. The unit must be stopped and
   * SETTINGS > REMOTE CTRL on. Until keep or undo, a frame every KEEPALIVE_MS holds the trial open. */
  async trial(data: Uint8Array) {
    if (this.session) throw new Error('A trial is open: keep or undo it first.')
    const session = await UploadSession.connect(this.transport, UPLOAD_BASE)
    if (session.status.phase !== 'normal') throw new Error('The loader is in phase ' + session.status.phase + '; a host that left rolls back by itself within ten seconds once the unit is stopped.')
    const sha256 = createHash('sha256').update(data).digest('hex')
    await session.stage({ base: UPLOAD_BASE, data, sha256 })
    await session.activate()
    const status = await session.startTrial()
    this.session = session
    this.keepalive = setInterval(() => { void this.transport.exchange(encodeUploadRequest({ command: 'hello' }), new AbortController().signal).catch(() => {}) }, this.keepaliveMs)
    return { phase: status.phase, active: status.active, sha256, bytes: data.length }
  }
  async keep() { return this.finish(true) }
  async undo() { return this.finish(false) }
  private async finish(keep: boolean) {
    const session = this.session
    if (!session) throw new Error('No trial is open from this session. A trial a host leaves rolls back by itself within ten seconds once the unit is stopped.')
    if (keep) { await session.holdTrial(); await session.accept() } else await session.rollback()
    const status = await session.leaveUploadMode()
    this.close()
    return { kept: keep, phase: status.phase, active: status.active }
  }
  get trialOpen() { return !!this.session }
  close() { clearInterval(this.keepalive); this.keepalive = undefined; this.session = undefined }
}
