// SPDX-License-Identifier: GPL-3.0-or-later
// Byte helpers for the firmware builder: synchronous SHA-256 and HMAC-SHA256 (Web Crypto's are asynchronous, and the
// builder runs the same in a page, a worker and Node), hex, big-endian words and the Python-style byte operations
// whose results the build manifests and checks depend on.
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

/** Incremental SHA-256. */
export class Sha256 {
  private hash = nobleSha256.create()
  update(data: Uint8Array): this { this.hash.update(data); return this }
  digest(): Uint8Array { return this.hash.digest() }
}

export const sha256 = (data: Uint8Array): Uint8Array => nobleSha256(data)
export const sha = (data: Uint8Array): string => toHex(sha256(data))
export const hmacSha256 = (key: Uint8Array, data: Uint8Array): Uint8Array => hmac(nobleSha256, key, data)

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

export const isAscii = (text: string): boolean => /^[\x00-\x7f]*$/.test(text)
