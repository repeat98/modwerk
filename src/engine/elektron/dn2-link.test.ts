import { describe, expect, it } from 'vitest'
import { ask, frameRows, get32, ident, LINK_HEADER, linkRequest, LinkError, mem, parseLinkReply, readLog, screen, u32, type LinkLine } from './dn2-link'

// What link.c packs: groups of seven, each led by a byte holding their top bits.
function pack7(data: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.subarray(i, i + 7)
    out.push(chunk.reduce((top, b, k) => top | (b & 0x80 ? 0x40 >> k : 0), 0), ...Array.from(chunk, b => b & 0x7f))
  }
  return out
}

/** A unit running the development link: it answers ident, mem (DDR only) and diag as link.c does, from `memory`. */
function unit(memory: Map<number, number>, log?: { at: number; size: number }): LinkLine & { requests: number } {
  const queue: Uint8Array[] = []
  const reply = (seq: number, cmd: number, status: number, payload: number[] = []) =>
    queue.push(Uint8Array.from([...LINK_HEADER, seq, cmd | 0x40, status, ...payload, 0xf7]))
  const line = {
    requests: 0,
    send(data: Uint8Array) {
      line.requests++
      const seq = data[6], cmd = data[7]
      if (cmd === 0x01) reply(seq, cmd, 0, [1, 7, 0, 300, 1, 0, 3, 40, 0, 1, 0x1bf3c432, 0x47feffbc].flatMap(u32))
      else if (cmd === 0x22) reply(seq, cmd, 0, [log!.at, log!.size, 1500, 30].flatMap(u32))
      else if (cmd === 0x21) {
        const address = get32(data, 8), n = get32(data, 13)
        if (n < 1 || n > 128 || address < 0x40000000 || address + n > 0x48000000) return reply(seq, cmd, 4)
        reply(seq, cmd, 0, [...u32(address), ...pack7(Uint8Array.from({ length: n }, (_, i) => memory.get(address + i) ?? 0))])
      } else reply(seq, cmd, 2)
    },
    async next() { return queue.shift() ?? null },
  }
  return line
}
const put = (memory: Map<number, number>, address: number, bytes: number[]) => bytes.forEach((b, i) => memory.set(address + i, b))
const be = (value: number) => [value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff]

describe('the Digitone II link from the site', () => {
  it('builds requests and reads replies in the Rytm link\'s format', () => {
    expect(Array.from(linkRequest(5, 'ident'))).toEqual([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, 5, 0x01, 0xf7])
    const request = linkRequest(9, 'mem', 0x47f00000, 64)
    expect([request.length, get32(request, 8), get32(request, 13)]).toEqual([19, 0x47f00000, 64])
    expect(Array.from(request.subarray(1, -1)).every(b => b < 0x80)).toBe(true)
    expect(parseLinkReply(Uint8Array.of(0xf0, 1, 2, 0xf7))).toBeNull()
  })

  it('reads the identity and memory, and names a refusal', async () => {
    const memory = new Map<number, number>()
    put(memory, 0x47f00000, [0x2f, 0x0a, 0x45, 0xf9, 0x80, 0xff])
    const line = unit(memory)
    expect(await ident(line)).toMatchObject({ version: 1, received: 7, ticks: 300, armed: true, person: false, bootStatus: 1 })
    expect(Array.from(await mem(line, 0x47f00000, 6))).toEqual([0x2f, 0x0a, 0x45, 0xf9, 0x80, 0xff])
    await expect(mem(line, 0x0, 4)).rejects.toThrow('out of range')
    await expect(ask(line, 'mem', [0x40000000])).rejects.toBeInstanceOf(LinkError)
  })

  it('reads the frame on the screen through its pointer', async () => {
    const memory = new Map<number, number>(), frame = 0x44623fc8
    put(memory, 0x402a10c8, [...be(0x44623bc8), ...be(frame)])
    put(memory, frame + 7, [0x01])               // x 0, y 0
    put(memory, frame + 8 * 127, [0x80])         // x 127, y 63
    const rows = await screen(unit(memory))
    expect(rows.flatMap((row, y) => row.flatMap((px, x) => px ? [[x, y]] : []))).toEqual([[0, 0], [127, 63]])
    expect(frameRows(new Uint8Array(1024))[0]).toHaveLength(128)
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
    expect(line.requests).toBe(1 + Math.ceil(size / 128))
    expect(log).toMatchObject({ version: 2, boot: 1, seq: 2, loads: [] })
    expect(log!.incidents.map(i => [i.kind, i.second, i.a, i.keys.filter(k => k !== 0xff)])).toEqual([['start', 0, 0, []], ['freeze', 14, 9050, [3]]])
  })
})
