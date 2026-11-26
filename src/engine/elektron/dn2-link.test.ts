import { describe, expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../elekloader/upload-session'
import { UploadCommand, UploadPhase, UploadResult } from '../elekloader/upload-wire'
import { frameRows, get32, ident, LINK_HEADER, linkRequest, LinkError, pack7 as linkPack7, parseLinkReply, readLog, screen, u32, unpack7, uploadTransport, type LinkLine, LINK_COMMANDS } from './dn2-link'

// What link.c packs: groups of seven, each led by a byte holding their top bits.
function pack7(data: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.subarray(i, i + 7)
    out.push(chunk.reduce((top, b, k) => top | (b & 0x80 ? 0x40 >> k : 0), 0), ...Array.from(chunk, b => b & 0x7f))
  }
  return out
}

/** A unit running the development link: it answers ident, screen, diag and log as link.c does, from `memory` and
 * `frame` (screen copies it at part 0; `recopy` makes every later part claim another copy); the log is `log.size` bytes
 * of `memory` from `log.at`, read by the unit, and `log.before(n)` runs before the n-th request (a record written).
 * Anything else, mem included, is refused with status 2. */
function unit(memory: Map<number, number>, log?: { at: number; size: number; before?: (n: number) => void }, frame = new Uint8Array(1024), recopy = false): LinkLine & { requests: number } {
  let copy = 0, copied = new Uint8Array(1024)
  const queue: Uint8Array[] = []
  const reply = (seq: number, cmd: number, status: number, payload: number[] = []) =>
    queue.push(Uint8Array.from([...LINK_HEADER, seq, cmd | 0x40, status, ...payload, 0xf7]))
  const line = {
    requests: 0,
    send(data: Uint8Array) {
      line.requests++
      log?.before?.(line.requests)
      const seq = data[6], cmd = data[7]
      if (cmd === 0x01) reply(seq, cmd, 0, [1, 7, 0, 300, 1, 0, 3, 40, 0, 1, 0x1bf3c432, 0x47feffbc].flatMap(u32))
      else if (cmd === 0x22) reply(seq, cmd, 0, [log!.at, log!.size, 1500, 30].flatMap(u32))
      else if (cmd === 0x20) {
        const off = get32(data, 8)
        if (off >= 1024 || off % 128 || (off && !copy)) return reply(seq, cmd, 4)
        if (off === 0) { copy++; copied = frame.slice() }
        reply(seq, cmd, 0, [...u32(off), ...u32(recopy && off ? copy + 1 : copy), ...pack7(copied.subarray(off, off + 128))])
      }
      else if (cmd === 0x24 && log) {
        const off = get32(data, 8), n = Math.min(128, log.size - off), byte = (i: number) => memory.get(log.at + i) ?? 0
        if (off >= log.size || off % 128) return reply(seq, cmd, 4)
        const logSeq = byte(16) * 2 ** 24 + (byte(17) << 16 | byte(18) << 8 | byte(19))
        reply(seq, cmd, 0, [...u32(off), ...u32(logSeq), ...pack7(Uint8Array.from({ length: n }, (_, i) => byte(off + i)))])
      } else reply(seq, cmd, 2)
    },
    async next() { return queue.shift() ?? null },
  }
  return line
}
const put = (memory: Map<number, number>, address: number, bytes: number[]) => bytes.forEach((b, i) => memory.set(address + i, b))
const be = (value: number) => [value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff]
const get32be = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at)

describe('the Digitone II link from the site', () => {
  it('builds requests and reads replies in the Rytm link\'s format', () => {
    expect(Array.from(linkRequest(5, 'ident'))).toEqual([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, 5, 0x01, 0xf7])
    const request = linkRequest(9, 'log', 256)
    expect([request.length, request[7], get32(request, 8)]).toEqual([14, 0x24, 256])
    expect(Array.from(request.subarray(1, -1)).every(b => b < 0x80)).toBe(true)
    expect(parseLinkReply(Uint8Array.of(0xf0, 1, 2, 0xf7))).toBeNull()
  })

  it('reads the identity, and has no request for an address', async () => {
    const line = unit(new Map())
    expect(await ident(line)).toMatchObject({ version: 1, received: 7, ticks: 300, armed: true, person: false, bootStatus: 1 })
    expect(Object.keys(LINK_COMMANDS)).not.toContain('mem')
  })

  it('reads the frame on the screen in eight parts of one copy, asking for no address', async () => {
    const frame = new Uint8Array(1024)
    frame[7] = 0x01                              // x 0, y 0
    frame[8 * 127] = 0x80                        // x 127, y 63
    const line = unit(new Map(), undefined, frame), sent: number[][] = [], send = line.send
    line.send = data => { sent.push([data[7], get32(data, 8)]); send(data) }
    const rows = await screen(line)
    expect(rows.flatMap((row, y) => row.flatMap((px, x) => px ? [[x, y]] : []))).toEqual([[0, 0], [127, 63]])
    expect(sent).toEqual([0, 128, 256, 384, 512, 640, 768, 896].map(off => [0x20, off]))
    expect(frameRows(new Uint8Array(1024))[0]).toHaveLength(128)
  })

  it('refuses a screen whose parts come from two copies', async () => {
    await expect(screen(unit(new Map(), undefined, new Uint8Array(1024), true))).rejects.toThrow('copied the screen again')
  })

  it('reads the diagnostics log the unit keeps, in the Octatrack\'s layout, with the site\'s parser', async () => {
    // As diag.c left it on a unit (19 November 2026): a START, then a FREEZE of 9,050 frames after FLTR (0x03).
    const memory = new Map<number, number>(), at = 0x47f0315c, size = 6148
    const incident = (n: number, seq: number, second: number, a: number, kind: number, keys: number[]) => {
      const base = at + 40 + 92 + 32 * 96 + 92 * n
      put(memory, base, [...be(seq), ...be(1), ...be(second), ...be(a), 0, kind])
      put(memory, base + 64, [...keys, ...Array(16 - keys.length).fill(0xff)])
    }
    put(memory, at, [...be(0x4d574447), ...be(2), ...be(0x1234), ...be(1), ...be(2), ...be(0), ...be(2)])
    incident(0, 1, 0, 0, 1, [])
    incident(1, 2, 14, 9050, 3, [3])
    const line = unit(memory, { at, size }), { bytes, log } = await readLog(line)
    expect(bytes).toHaveLength(size)
    expect(line.requests).toBe(1 + Math.ceil(size / 128) + 1)   // diag, the parts, part 0 again
    expect(log).toMatchObject({ version: 2, boot: 1, seq: 2, loads: [] })
    expect(log!.incidents.map(i => [i.kind, i.second, i.a, i.keys.filter(k => k !== 0xff)])).toEqual([['start', 0, 0, []], ['freeze', 14, 9050, [3]]])
  })

  it('reads the log again when a record is written during the read, and never mixes before and after', async () => {
    const memory = new Map<number, number>(), at = 0x47f0315c, size = 6148
    put(memory, at, [...be(0x4d574447), ...be(2), ...be(0x1234), ...be(1), ...be(2), ...be(0), ...be(1)])
    const write = () => { put(memory, at + 16, be(3)); put(memory, at + 24, be(2)); put(memory, at + 40 + 92 + 32 * 96 + 92, [...be(3), ...be(1)]) }
    const requests = 1 + Math.ceil(size / 128) + 1
    const line = unit(memory, { at, size, before: n => { if (n === 20) write() } }), { bytes, log } = await readLog(line)
    expect(line.requests).toBe(requests + requests - 1)          // read again, without a second diag
    expect(log).toMatchObject({ seq: 3 })
    expect(get32be(bytes, 16)).toBe(3)
    const keeps = unit(memory, { at, size, before: n => { if (n % 30 === 0) put(memory, at + 16, be(n)) } })
    await expect(readLog(keeps)).rejects.toThrow('changed during each of 3 reads')
  })

  it('reads the log a part at a time, each in its own turn, naming only offsets into it', async () => {
    const memory = new Map<number, number>(), at = 0x47f0315c
    put(memory, at, [...be(0x4d574447), ...be(2), ...be(0x1234), ...be(1), ...be(2)])
    let turns = 0
    const whole = unit(memory, { at, size: 6148 }), offsets: number[] = [], wholeSend = whole.send
    whole.send = data => { if (data[7] === 0x24) offsets.push(get32(data, 8)); wholeSend(data) }
    turns = 0
    await readLog(whole, async work => { turns++; return work() })
    expect(offsets).toEqual([...Array.from({ length: 49 }, (_, i) => i * 128), 0])
    expect(turns).toBe(51)
  })
})

/** The base this test's unit names in HELLO: its own value, so nothing here binds an offer to a fixed string (a
 * development base names its build's digest). */
const TEST_BASE = sha(new TextEncoder().encode('a Digitone II base in dn2-link.test.ts'))

/** A unit whose link carries upload frames (link.c's upload command) to a controller as far as a trial reaches it
 * (sdk/runtime/upload/upload.c): hello, enter, begin, chunk, verify, commit, leave. */
function uploadUnit() {
  const names = Object.fromEntries(Object.entries(UploadCommand).map(([name, code]) => [code, name]))
  const state = { phase: 'normal', last: 0, current: 0, received: 0, generation: 0, active: TEST_BASE, digest: '', frames: 0, longest: 0 }
  const respond = (command: number, transaction: number, result = 'ok') => {
    const out = new Uint8Array(144), view = new DataView(out.buffer)
    view.setUint32(0, 0x4d575552); view.setUint16(4, 1); view.setUint16(6, command); view.setUint32(8, transaction); view.setUint32(12, 128)
    ;[UploadResult.indexOf(result as never), UploadPhase.indexOf(state.phase as never), 1, state.generation, state.last, state.current, state.received, 262144]
      .forEach((value, i) => view.setUint32(16 + 4 * i, value))
    out.set(Buffer.from(TEST_BASE, 'hex'), 48); out.set(new Uint8Array(32).fill(0x53), 80); out.set(Buffer.from(state.active, 'hex'), 112)
    return out
  }
  const controller = (frame: Uint8Array) => {
    const view = new DataView(frame.buffer, frame.byteOffset), command = view.getUint16(6), transaction = view.getUint32(8)
    switch (names[command]) {
      case 'enter': state.phase = state.phase === 'trial' ? 'pending' : 'ready'; break
      case 'leave': state.phase = state.phase === 'pending' ? 'trial' : 'normal'; break
      case 'begin': state.last = state.current = transaction; state.phase = 'receiving'; state.received = 0
        state.digest = Buffer.from(frame.subarray(80, 112)).toString('hex'); break
      case 'chunk': state.received += frame.length - 52; break
      case 'verify': state.phase = 'verified'; break
      case 'commit': state.phase = 'pending'; state.active = state.digest; state.generation++; break
    }
    return respond(command, transaction)
  }
  const queue: Uint8Array[] = []
  const line: LinkLine = {
    send(data) {
      const seq = data[6], cmd = data[7]
      if (cmd !== 0x30) return void queue.push(Uint8Array.from([...LINK_HEADER, seq, cmd | 0x40, 2, 0xf7]))
      state.frames++; state.longest = Math.max(state.longest, data.length)
      const frame = unpack7(data.subarray(8, -1))
      queue.push(Uint8Array.from([...LINK_HEADER, seq, 0x70, 0, ...linkPack7(controller(frame)), 0xf7]))
    },
    async next() { return queue.shift() ?? null },
  }
  return { line, state }
}

describe('the runtime loader over the Digitone II link', () => {
  it('stages a package, publishes it and opens a trial through UploadSession', async () => {
    const unit = uploadUnit(), data = new Uint8Array(10000).map((_, i) => i * 7), pkg = { base: TEST_BASE, data, sha256: sha(data) }
    const session = await UploadSession.connect(uploadTransport(unit.line), TEST_BASE)
    await session.stage(pkg)
    expect(unit.state.received).toBe(data.length)
    expect(await session.activate()).toMatchObject({ result: 'ok', phase: 'pending', active: pkg.sha256 })
    expect((await session.startTrial()).phase).toBe('trial')
    expect(unit.state.longest).toBeLessThanOrEqual(8192)          // stock passed 8,192-byte link messages on a unit
    expect(Array.from(linkRequest(1, 'upload')).slice(7, 8)).toEqual([0x30])
  })

  it.each([20, 145])('refuses an upload response of %i bytes', async length => {
    const queue: Uint8Array[] = []
    const line: LinkLine = { send(data) { queue.push(Uint8Array.from([...LINK_HEADER, data[6], 0x70, 0, ...linkPack7(new Uint8Array(length)), 0xf7])) }, async next() { return queue.shift() ?? null } }
    const transport = uploadTransport(line)
    await expect(transport.exchange(new Uint8Array(48), new AbortController().signal)).rejects.toThrow(`${length}-byte response`)
  })

  it('refuses a cancelled exchange before sending', async () => {
    const transport = uploadTransport({ send() { throw new Error('unexpected send') }, async next() { return null } })
    const cancelled = new AbortController(); cancelled.abort()
    await expect(transport.exchange(new Uint8Array(48), cancelled.signal)).rejects.toBeInstanceOf(LinkError)
  })
})
