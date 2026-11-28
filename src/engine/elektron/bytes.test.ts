import { describe, expect, it } from 'vitest'
import { Sha256, ascii, be32, byteSum, concat, decodeAscii, encodeAsciiReplace, equal, find, fromHex, hmacSha256, sha, toHex, u32 } from './bytes.ts'

describe('builder bytes', () => {
  it('hashes as SHA-256 and HMAC-SHA256 (FIPS 180-4 and RFC 4231 vectors), in pieces too', () => {
    expect(sha(ascii('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const long = ascii('a'.repeat(1000))
    const pieces = new Sha256(); for (let i = 0; i < 1000; i += 37) pieces.update(long.subarray(i, i + 37))
    expect(toHex(pieces.digest())).toBe(sha(long))
    expect(toHex(hmacSha256(new Uint8Array(20).fill(0x0b), ascii('Hi There')))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
  })
  it('reads hex, words and bytes as the builder expects', () => {
    expect(fromHex('0a ff\t1B')).toEqual(Uint8Array.of(0x0a, 0xff, 0x1b))
    expect(fromHex('0 a')).toBeNull()
    expect(u32(be32(0xdeadbeef, -1), 4)).toBe(0xffffffff)
    expect(byteSum(Uint8Array.of(255, 255, 3), 1)).toBe(258)
    expect(find(Uint8Array.of(1, 2, 1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(2)
    expect(find(Uint8Array.of(1), new Uint8Array(), 2)).toBe(-1)
    expect(equal(concat([Uint8Array.of(1), Uint8Array.of(2)]), Uint8Array.of(1, 2))).toBe(true)
    expect(decodeAscii(Uint8Array.of(0x41, 0x80))).toBe('A�')
    expect(encodeAsciiReplace('A😀')).toEqual(Uint8Array.of(0x41, 0x3f))
  })
})
