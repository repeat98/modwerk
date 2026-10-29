// A pretend Zoom MultiStomp for tests: answers the identity request and the file commands the link sends,
// in the pedal's reply formats (zoom-protocol.ts), over a fake Web MIDI access.
import { crc32, pack7 } from '../engine/zoom/zoom-protocol'
import type { MidiAccessLike, MidiIn, MidiOut } from '../engine/zoom/zoom-link'

export type FakePedalFile = { name: string; data: number[] }
const BLOCK = 512

export function fakeZoomPedal({ deviceId = 0x61, firmware = '2.10', files = [] as FakePedalFile[], free = 400_000, portName = 'ZOOM MS Series', silent = false, slow = undefined as { cmd: number; nth: number; ms: number | null } | undefined, latency = 0 } = {}) {
  const sent: number[][] = []
  let listAt = 0, reading: FakePedalFile | undefined, readAt = 0, step = 0
  const input: MidiIn = { id: 'in', name: portName, state: 'connected', onmidimessage: null }
  // Every reply takes `latency` ms; with `slow`, the nth reply to file command `cmd` comes `ms` later still, or never (null).
  let seen = 0, current = -1
  const reply = (m: number[]) => {
    let ms: number | null = 0
    if (slow && current === slow.cmd && ++seen === slow.nth) ms = slow.ms
    if (ms !== null) setTimeout(() => input.onmidimessage?.({ data: Uint8Array.from(m) }), latency + ms)
  }
  const head = [0xf0, 0x52, 0x00, deviceId, 0x60, 0x04]
  const ack = () => reply([...head, 0, 0xf7])
  const nope = () => reply([0xf0, 0x52, 0x00, deviceId, 0x60, 0x7f, 0xf7])
  const size5 = (n: number) => [n & 0x7f, (n >> 7) & 0x7f, (n >> 14) & 0x7f, (n >> 21) & 0x7f, (n >> 28) & 0x7f]
  function entry(file: FakePedalFile) {
    const m = [...head, ...Array(30).fill(0), 0xf7]
    Array.from(file.name).forEach((c, i) => { m[15 + i] = c.charCodeAt(0) })
    size5(file.data.length).forEach((b, i) => { m[30 + i] = b })
    reply(m)
  }
  function block() {
    const data = reading ? reading.data.slice(readAt, readAt + BLOCK) : []
    readAt += data.length
    const v = (crc32(data) ^ 0xffffffff) >>> 0
    reply([...head, 0x22, 0, 0, data.length & 0x7f, (data.length >> 7) & 0x7f, ...pack7(data), v & 0x7f, (v >>> 7) & 0x7f, (v >>> 14) & 0x7f, (v >>> 21) & 0x7f, (v >>> 28) & 0x0f, 0xf7])
  }
  const output: MidiOut = {
    id: 'out', name: portName, state: 'connected',
    send(data) {
      const m = Array.from(data); sent.push(m)
      if (silent) return
      if (m[0] === 0xf0 && m[1] === 0x7e && m[4] === 0x01) return reply([0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, deviceId, 0, 0, 0, ...Array.from(firmware.padEnd(4), c => c.charCodeAt(0)), 0xf7])
      if (m[1] !== 0x52 || m[3] !== deviceId || m[4] !== 0x60) return
      current = m[5]
      const cmd = m[5], name = cmd === 0x20 ? String.fromCharCode(...m.slice(16, m.indexOf(0, 16))) : ''   // read: 9 zero bytes, then the name
      if (cmd === 0x25) { listAt = 0; return files[0] ? entry(files[listAt++]) : nope() }
      if (cmd === 0x26) return listAt < files.length ? entry(files[listAt++]) : nope()
      if (cmd === 0x20) { reading = files.find(f => f.name === name); readAt = 0; step = 0; return ack() }
      if (cmd === 0x05 || cmd === 0x22) { step++; return step % 3 === 0 ? block() : ack() }
      if (cmd === 0x29) { const m = [...head, ...Array(15).fill(0), 0xf7]; size5(free).forEach((b, i) => { m[16 + i] = b }); return reply(m) }
      return ack()
    },
  }
  const access: MidiAccessLike = { inputs: new Map([['in', input]]), outputs: new Map([['out', output]]), onstatechange: null }
  return { access, sent, input, output }
}

/** A stand-in effect file: Zoom's header (SIZE, group, effect id, version) before an ELF signature. */
export function fakeEffect(name: string, gid: number, fxid: number, version: string, size = 1200): FakePedalFile {
  const data = Array(size).fill(0).map((_, i) => (i * 7) & 0xff)
  Array.from('SIZE').forEach((c, i) => { data[4 + i] = c.charCodeAt(0) })
  data[0x3c] = gid; data[0x40] = fxid & 0xff; data[0x41] = fxid >> 8
  Array.from(version).forEach((c, i) => { data[0x44 + i] = c.charCodeAt(0) })
  data[0x4c] = 0x7f; Array.from('ELF').forEach((c, i) => { data[0x4d + i] = c.charCodeAt(0) })
  return { name, data }
}
