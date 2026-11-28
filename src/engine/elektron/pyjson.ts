// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a module file as Python's raw.decode('utf-8') and json.loads do, so a file is accepted or refused alike,
// with the same message. JSON.parse differs: it refuses NaN and Infinity, which json accepts, and reads 4.0 as the
// integer 4; floats are read as PyFloat so a float stays refused where an integer is wanted.
import { PyFloat } from './py.ts'

export { PyFloat }

export class JSONDecodeError extends Error {}
export class UnicodeDecodeError extends Error {}

/** The longest valid continuation range after each UTF-8 lead byte (Unicode Table 3-7). */
function utf8Lead(b: number): { length: number; low: number; high: number } | null {
  if (b >= 0xc2 && b <= 0xdf) return { length: 2, low: 0x80, high: 0xbf }
  if (b >= 0xe0 && b <= 0xef) return { length: 3, low: b === 0xe0 ? 0xa0 : 0x80, high: b === 0xed ? 0x9f : 0xbf }
  if (b >= 0xf0 && b <= 0xf4) return { length: 4, low: b === 0xf0 ? 0x90 : 0x80, high: b === 0xf4 ? 0x8f : 0xbf }
  return null
}

/** bytes.decode('utf-8'), failing with Python's message at the first invalid sequence. */
export function decodeUtf8(d: Uint8Array): string {
  const refuse = (start: number, end: number, reason: string): never => {
    throw new UnicodeDecodeError(start === end
      ? `'utf-8' codec can't decode byte 0x${d[start].toString(16).padStart(2, '0')} in position ${start}: ${reason}`
      : `'utf-8' codec can't decode bytes in position ${start}-${end}: ${reason}`)
  }
  let i = 0
  while (i < d.length) {
    if (d[i] < 0x80) { i++; continue }
    const lead = utf8Lead(d[i])
    if (!lead) refuse(i, i, 'invalid start byte')
    for (let k = 1; k < lead!.length; k++) {
      if (i + k >= d.length) refuse(i, d.length - 1, 'unexpected end of data')
      const ok = k === 1 ? d[i + k] >= lead!.low && d[i + k] <= lead!.high : d[i + k] >= 0x80 && d[i + k] <= 0xbf
      if (!ok) refuse(i, i + k - 1, 'invalid continuation byte')
    }
    i += lead!.length
  }
  // a leading byte-order mark stays in the text, as Python's decode keeps it (loads then refuses it)
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(d)
}

const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

/** json.loads(text), with Python's error messages. */
export function loads(text: string): unknown {
  let at = 0
  const fail = (message: string, pos: number): never => {
    const line = text.slice(0, pos).split('\n').length
    const column = pos - text.lastIndexOf('\n', pos - 1)
    throw new JSONDecodeError(`${message}: line ${line} column ${column} (char ${pos})`)
  }
  const skip = () => { while (isSpace(text[at])) at++ }

  const hex4 = (pos: number) => {
    const digits = text.slice(pos, pos + 4)
    if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail('Invalid \\uXXXX escape', pos - 1)
    return parseInt(digits, 16)
  }

  /** A string whose opening quote is at `at`. */
  const string = (): string => {
    const opening = at++
    let out = ''
    for (;;) {
      const c = text[at]
      if (c === undefined) fail('Unterminated string starting at', opening)
      if (c === '"') { at++; return out }
      if (c !== '\\') {
        if (c.charCodeAt(0) < 0x20) fail('Invalid control character at', at)
        out += c
        at++
        continue
      }
      const e = text[at + 1]
      if (e === undefined) fail('Unterminated string starting at', opening)
      if (e in SIMPLE_ESCAPES) { out += SIMPLE_ESCAPES[e]; at += 2; continue }
      if (e !== 'u') fail('Invalid \\escape', at)
      const high = hex4(at + 2)
      at += 6
      if (high >= 0xd800 && high <= 0xdbff && text[at] === '\\' && text[at + 1] === 'u') {
        const low = hex4(at + 2)
        if (low >= 0xdc00 && low <= 0xdfff) { out += String.fromCharCode(high, low); at += 6; continue }
      }
      out += String.fromCharCode(high)
    }
  }

  /** The items of an array or object whose opening bracket is at `at`, each read by `item`. */
  const items = (close: string, kind: string, item: () => void) => {
    at++
    skip()
    if (text[at] === close) { at++; return }
    for (;;) {
      item()
      skip()
      if (text[at] === close) { at++; return }
      if (text[at] !== ',') fail("Expecting ',' delimiter", at)
      const comma = at++
      skip()
      if (text[at] === close) fail(`Illegal trailing comma before end of ${kind}`, comma)
    }
  }

  const WORDS: [string, unknown][] = [['null', null], ['true', true], ['false', false], ['NaN', new PyFloat(NaN)], ['Infinity', new PyFloat(Infinity)], ['-Infinity', new PyFloat(-Infinity)]]

  const value = (): unknown => {
    const c = text[at]
    if (c === '"') return string()
    if (c === '[') {
      const out: unknown[] = []
      items(']', 'array', () => out.push(value()))
      return out
    }
    if (c === '{') {
      const out: Record<string, unknown> = {}
      items('}', 'object', () => {
        if (text[at] !== '"') fail('Expecting property name enclosed in double quotes', at)
        const key = string()
        skip()
        if (text[at] !== ':') fail("Expecting ':' delimiter", at)
        at++
        skip()
        out[key] = value()
      })
      return out
    }
    for (const [word, v] of WORDS) if (text.startsWith(word, at)) { at += word.length; return v instanceof PyFloat ? new PyFloat(v.value) : v }
    NUMBER.lastIndex = at
    const m = NUMBER.exec(text)
    if (!m) return fail('Expecting value', at)
    at += m[0].length
    return m[1] || m[2] ? new PyFloat(Number(m[0])) : Number(m[0])
  }

  if (text.startsWith('﻿')) fail('Unexpected UTF-8 BOM (decode using utf-8-sig)', 0)
  skip()
  const result = value()
  skip()
  if (at !== text.length) fail('Extra data', at)
  return result
}
