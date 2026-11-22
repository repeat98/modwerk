// SPDX-License-Identifier: GPL-3.0-or-later
// A Digitone II with a development base, from Node: the site's link client (src/engine/elektron/dn2-link.ts) over the
// computer's MIDI (zoom-device.ts's nodeMidiAccess), for the developer MCP (scripts/frontend-mcp.mjs). Read: the link's
// identity, the runtime loader's state and the diagnostics log. Write (the MCP gates it): a runtime package as a trial
// through the site's UploadSession, then Keep or Undo. No raw memory, keys or flashing. Node only.
import { createHash } from 'node:crypto'
import type { MidiAccessLike, MidiIn, MidiOut } from '../src/engine/zoom/zoom-link.ts'
import { ident, readLog, uploadTransport, type LinkLine } from '../src/engine/elektron/dn2-link.ts'
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

/** One complete request and reply at a time on the unit's line: an upload frame (a session's or the keepalive's), an
 * ident or a whole log read. The line hands replies over in order, so two requests in flight could take each other's. */
export class LineLock {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(work)
    this.tail = turn.catch(() => {})
    return turn
  }
}

/** The base the unit's upload controller names in HELLO (link.c upload_start): a development build's layout digest
 * (machine-base.py), read from the response without judging it, so a session can be bound to it. */
export async function helloBase(transport: UploadTransport): Promise<string> {
  const response = await transport.exchange(encodeUploadRequest({ command: 'hello' }), new AbortController().signal)
  if (response.length < 80) throw new Error('HELLO: a short response')
  return Buffer.from(response.subarray(48, 80)).toString('hex')
}

export class DigitoneUnit {
  private readonly line: LinkLine
  private readonly lock = new LineLock()
  private readonly transport: UploadTransport
  private session?: UploadSession
  private keepalive?: ReturnType<typeof setInterval>
  private readonly keepaliveMs: number
  private readonly expectedBase?: string
  /** `base`: the development build the packages are made for (its .identity); without it, the base HELLO names. */
  constructor(line: LinkLine, keepaliveMs = KEEPALIVE_MS, base?: string) {
    const raw = uploadTransport(line)
    this.line = line; this.keepaliveMs = keepaliveMs; this.expectedBase = base?.toLowerCase()
    this.transport = { exchange: (frame, signal) => this.lock.run(() => raw.exchange(frame, signal)) }
  }
  private async base() {
    const named = await helloBase(this.transport)
    if (this.expectedBase && named !== this.expectedBase)
      throw new Error(`The unit runs development build ${named.slice(0, 16)}, not ${this.expectedBase.slice(0, 16)}: flash or RAM boot that build first.`)
    return named
  }

  /** The link's counters, the RAM boot status, the modules live and the loader's phase. Read-only. */
  async status() {
    const link = await this.lock.run(() => ident(this.line))
    const base = await this.base()
    const loader = (await UploadSession.connect(this.transport, base)).status
    return { link, base, loader: { phase: loader.phase, generation: loader.generation, activeKnown: loader.activeKnown, active: loader.active }, trialOpen: !!this.session }
  }
  /** The diagnostics log, as the site parses the Octatrack's. Read-only. */
  async log() { return (await this.lock.run(() => readLog(this.line))).log ?? null }
  /** Loads a runtime package (sdk/runtime/loader/build.py) for a trial; never keeps it. The unit must be stopped and
   * SETTINGS > REMOTE CTRL on. Until keep or undo, a frame every KEEPALIVE_MS holds the trial open. */
  async trial(data: Uint8Array) {
    if (this.session) throw new Error('A trial is open: keep or undo it first.')
    const base = await this.base()
    const session = await UploadSession.connect(this.transport, base)
    if (session.status.phase !== 'normal') throw new Error('The loader is in phase ' + session.status.phase + '; a host that left rolls back by itself within ten seconds once the unit is stopped.')
    const sha256 = createHash('sha256').update(data).digest('hex')
    await session.stage({ base, data, sha256 })
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
    let status
    try {
      if (keep) { await session.holdTrial(); await session.accept() } else await session.rollback()
      status = await session.leaveUploadMode()
    } catch (error) {
      // Unconfirmed: this session cannot go on. Stop the keepalive so the unit's own timeout settles the trial (a
      // trial nobody keeps rolls back), and read where it stands through a fresh session.
      this.close()
      let now = 'unknown'
      try { now = (await this.status()).loader.phase } catch { /* the unit may be resetting the controller */ }
      throw new Error(`${keep ? 'Keep' : 'Undo'} was not confirmed (${error instanceof Error ? error.message : String(error)}). The keepalive stopped, so the unit settles the trial by itself within ten seconds once it is stopped; the loader now reads ${now}.`, { cause: error })
    }
    this.close()
    return { kept: keep, phase: status.phase, active: status.active }
  }
  get trialOpen() { return !!this.session }
  close() { clearInterval(this.keepalive); this.keepalive = undefined; this.session = undefined }
}
