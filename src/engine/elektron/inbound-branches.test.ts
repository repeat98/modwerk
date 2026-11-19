import { describe, expect, it } from 'vitest'
import { inboundBranches, type CodeSite } from './inbound-branches.ts'

const BASE = 0x40000400, NOP = 0x4e71
/** An image of nops with `words` written at byte offsets: authored test code, no firmware. */
function image(length: number, writes: Record<number, number[]>): Uint8Array {
  const data = new Uint8Array(length)
  const put = (at: number, word: number) => data.set([word >> 8, word & 0xff], at)
  for (let i = 0; i < length; i += 2) put(i, NOP)
  for (const [offset, words] of Object.entries(writes)) words.forEach((word, k) => put(+offset + 2 * k, word))
  return data
}
const long = (value: number) => [value >>> 16, value & 0xffff]
// The site at +0x40: moveq #1,d0; moveq #2,d1; move.l #$11112222,d2 (six bytes); nop. Instructions start at +0, +2, +4, +10.
const SITE: CodeSite = { addr: BASE + 0x40, length: 12, owner: 'a detour' }
const body = { 0x40: [0x7001, 0x7202, 0x243c, 0x1111, 0x2222, NOP] }
const found = (writes: Record<number, number[]>, sites: CodeSite[] = [SITE]) =>
  inboundBranches(image(0x200, { ...body, ...writes }), BASE, sites).map(entry => `${entry.how} ${entry.flow} +${(entry.from - BASE).toString(16)} -> +${(entry.target - BASE).toString(16)}`)

describe('stock entries into a patched site', () => {
  it('finds a branch, a call and a pointer to an instruction after the first', () => {
    expect(found({
      0x20: [0x6020],                              // bra.s +0x42
      0x80: [0x4eb9, ...long(BASE + 0x44)],        // jsr +0x44
      0xa0: [0x6600, 0xffa8],                      // bne.w +0x4a
      0x100: long(BASE + 0x42),                    // a table word
    })).toEqual(['branch bra +20 -> +42', 'pointer pointer +100 -> +42', 'branch jsr +80 -> +44', 'branch bcc +a0 -> +4a'])
  })
  it('leaves the site’s first byte, its end and the middle of an instruction alone', () => {
    expect(found({
      0x20: [0x601e],                              // bra.s to the site's start: what a detour expects
      0x24: [0x6026],                              // bra.s past its end
      0x80: [0x4eb9, ...long(BASE + 0x46)],        // into the six-byte instruction: no code enters there
      0x100: long(BASE + 0x45),                    // an odd address
    })).toEqual([])
  })
  it('does not take an operand for a branch', () => {
    // move.l #$0000601c,d0 at +0x20: its last word reads as bra.s to +0x42 only when read out of step.
    expect(found({ 0x20: [0x203c, 0x0000, 0x601c] })).toEqual([])
  })
  it('leaves out a branch inside the site, which the patch replaces too', () => {
    expect(found({ 0x40: [0x6002, 0x7202, 0x7001, NOP, NOP, NOP] })).toEqual([])
  })
  it('names each site an entry meets, and ignores a site outside the image', () => {
    const shorter = { addr: BASE + 0x40, length: 4, owner: 'shortened' }, outside = { addr: BASE + 0x400, length: 8, owner: 'elsewhere' }
    const entries = inboundBranches(image(0x200, { ...body, 0x20: [0x6022] }), BASE, [SITE, shorter, outside]) // bra.s +0x44
    expect(entries.map(entry => entry.site.owner)).toEqual(['a detour'])
  })
})
