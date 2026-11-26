import { describe, expect, it } from 'vitest'
import { askLink, get32, LINK_HEADER, linkExchange, linkFrame, LinkError, pack7, parseLinkReply, u32, unpack7, type LinkLine } from './link-wire'

/** A unit on the shared wire: answers every request with `status` and `payload` for the same sequence and command,
 * after an unrelated message and an echo of the request. */
function unit(status: number, payload: number[], answer = true): LinkLine & { sent: Uint8Array[] } {
  const queue: Uint8Array[] = [], sent: Uint8Array[] = []
  return {
    sent,
    send(data) {
      sent.push(data)
      queue.push(Uint8Array.of(0xf0, 0x00, 0x20, 0x3c, 0x10, 0, 0xf7), data)
      if (answer) queue.push(Uint8Array.from([...LINK_HEADER, data[6], data[7] | 0x40, status, ...payload, 0xf7]))
    },
    async next() { return queue.shift() ?? null },
  }
}

describe('the shared link wire', () => {
  it('frames a request and parses its reply with a numeric command', () => {
    expect([...linkFrame(0x85, 0x24, u32(300))]).toEqual([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, 0x05, 0x24, 44, 2, 0, 0, 0, 0xf7])
    expect(parseLinkReply(Uint8Array.from([...LINK_HEADER, 5, 0x64, 0, 1, 2, 0xf7]))).toEqual({ seq: 5, command: 0x24, status: 0, payload: Uint8Array.of(1, 2) })
    expect(parseLinkReply(linkFrame(5, 0x24))).toBeNull()               // a request, not a reply
    expect(get32(Uint8Array.from(u32(0xf2fe7324)), 0)).toBe(0xf2fe7324)
    const bytes = Uint8Array.of(0x80, 1, 0xff, 3, 4, 5, 6, 0x87, 9)
    expect(unpack7(Uint8Array.from(pack7(bytes)))).toEqual(bytes)
  })
  it('passes over other messages and the echo, and gives null without a reply', async () => {
    expect(await linkExchange(unit(0, [7]), 9, 0x23, [], 50)).toEqual({ seq: 9, command: 0x23, status: 0, payload: Uint8Array.of(7) })
    expect(await linkExchange(unit(0, [], false), 9, 0x23, [], 50)).toBeNull()
  })
  it('asks with the caller\'s wording and names no machine', async () => {
    expect(await askLink(unit(0, [1, 2]), 0x01)).toEqual(Uint8Array.of(1, 2))
    await expect(askLink(unit(2, []), 0x23, [], { label: 'load', status: { 2: 'bad request' } })).rejects.toThrow('load: bad request')
    const quiet = askLink(unit(0, [], false), 0x23, [], { timeoutMs: 20 })
    await expect(quiet).rejects.toBeInstanceOf(LinkError)
    await expect(quiet).rejects.toThrow('command 0x23: no answer. Is a Modwerk base with the link on the unit?')
  })
})
