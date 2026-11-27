// SPDX-License-Identifier: GPL-3.0-or-later
// Byte helpers for the firmware builder: synchronous SHA-256 and HMAC-SHA256 (Web Crypto's are asynchronous, and the
// builder runs the same in a page, a worker and Node), hex, big-endian words and the Python-style byte operations
// whose results the build manifests and checks depend on.

// FIPS 180-4: the first 32 bits of the fractional parts of the cube roots of the first 64 primes
const ROUND = Uint32Array.from({ length: 64 }, (_, i) => {
  const primes: number[] = []
  for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n)
  return Math.floor((Math.cbrt(primes[i]) % 1) * 2 ** 32) >>> 0
})
const START = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19)
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** Incremental SHA-256 (FIPS 180-4). */
export class Sha256 {
  private state = START.slice()
  private schedule = new Uint32Array(64)
  private pending = new Uint8Array(64)
  private filled = 0
  private length = 0

  update(data: Uint8Array): this {
    this.length += data.length
    let at = 0
    while (at < data.length) {
      const take = Math.min(64 - this.filled, data.length - at)
      this.pending.set(data.subarray(at, at + take), this.filled)
      this.filled += take
      at += take
      if (this.filled === 64) { this.compress(this.pending); this.filled = 0 }
    }
    return this
  }

  digest(): Uint8Array {
    const bits = this.length * 8
    const tail = new Uint8Array((this.filled < 56 ? 56 : 120) - this.filled + 8)
    tail[0] = 0x80
    const view = new DataView(tail.buffer)
    view.setUint32(tail.length - 8, Math.floor(bits / 2 ** 32))
    view.setUint32(tail.length - 4, bits >>> 0)
    const length = this.length
    this.update(tail)
    this.length = length
    const out = new Uint8Array(32), outView = new DataView(out.buffer)
    this.state.forEach((word, i) => outView.setUint32(4 * i, word))
    return out
  }

  private compress(block: Uint8Array) {
    const w = this.schedule, view = new DataView(block.buffer, block.byteOffset, 64)
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(4 * t)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = this.state
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + ROUND[t] + w[t]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    const s = this.state
    s[0] += a; s[1] += b; s[2] += c; s[3] += d; s[4] += e; s[5] += f; s[6] += g; s[7] += h
  }
}

export const sha256 = (data: Uint8Array): Uint8Array => new Sha256().update(data).digest()
export const sha = (data: Uint8Array): string => toHex(sha256(data))

/** HMAC-SHA256 (RFC 2104). */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const block = new Uint8Array(64)
  block.set(key.length > 64 ? sha256(key) : key)
  const inner = new Sha256().update(block.map(x => x ^ 0x36)).update(data).digest()
  return new Sha256().update(block.map(x => x ^ 0x5c)).update(inner).digest()
}

export const toHex = (data: Uint8Array): string => Array.from(data, x => x.toString(16).padStart(2, '0')).join('')

/** Hex digit pairs, with ASCII whitespace allowed between pairs (as Python's bytes.fromhex); null for anything else. */
export function fromHex(text: string): Uint8Array | null {
  const out: number[] = []
  for (let i = 0; i < text.length;) {
    if (' \t\n\r\f\v'.includes(text[i])) { i++; continue }
    if (!/^[0-9a-fA-F]{2}$/.test(text.slice(i, i + 2))) return null
    out.push(parseInt(text.slice(i, i + 2), 16))
    i += 2
  }
  return Uint8Array.from(out)
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0)
  return out
}

export const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i])

export const u32 = (d: Uint8Array, at: number): number => ((d[at] << 24) | (d[at + 1] << 16) | (d[at + 2] << 8) | d[at + 3]) >>> 0

export function putU32(d: Uint8Array, at: number, value: number) {
  for (let k = 0; k < 4; k++) d[at + k] = (value >>> (24 - 8 * k)) & 0xff
}

export function be32(...values: number[]): Uint8Array {
  const out = new Uint8Array(4 * values.length)
  values.forEach((value, i) => putU32(out, 4 * i, value >>> 0))
  return out
}

/** The sum of bytes from..to, mod 2**32. */
export function byteSum(d: Uint8Array, from = 0, to = d.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += d[i]
  return sum >>> 0
}

/** The first index of `needle` in `hay` at or after `from`, or -1 (Python's bytes.find). */
export function find(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  if (!needle.length) return from <= hay.length ? from : -1
  for (let i = hay.indexOf(needle[0], from); i >= 0 && i + needle.length <= hay.length; i = hay.indexOf(needle[0], i + 1)) {
    let k = 1
    while (k < needle.length && hay[i + k] === needle[k]) k++
    if (k === needle.length) return i
  }
  return -1
}

export const ascii = (text: string): Uint8Array => Uint8Array.from(text, c => c.charCodeAt(0) & 0xff)

/** Bytes as ASCII, U+FFFD for a byte of 0x80 or more (Python's decode('ascii', 'replace')). */
export const decodeAscii = (d: Uint8Array): string => Array.from(d, x => (x < 0x80 ? String.fromCharCode(x) : '�')).join('')

/** One byte per code point, '?' for a non-ASCII one (Python's encode('ascii', 'replace')). */
export const encodeAsciiReplace = (text: string): Uint8Array => Uint8Array.from(Array.from(text), c => (c.codePointAt(0)! < 0x80 ? c.codePointAt(0)! : 0x3f))

// eslint-disable-next-line no-control-regex -- ASCII includes the control characters
export const isAscii = (text: string): boolean => /^[\x00-\x7f]*$/.test(text)
