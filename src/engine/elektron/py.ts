// SPDX-License-Identifier: GPL-3.0-or-later
// Python behaviours the firmware builder's messages and files follow, so a build says and writes the same as the
// Python tools for the same inputs: repr() and str() of JSON values, int(x, 0), truthiness and json.dumps.

/** A value read from a JSON document of any shape, used as Python uses it: checked where it is read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- module packages are JSON of any shape, read as Python reads them
export type Loose = any

/** A JSON number written with a fraction or an exponent (or NaN, Infinity): a Python float, so 4.0 is refused where
 * an integer is wanted. */
export class PyFloat {
  readonly value: number
  constructor(value: number) { this.value = value }
}

/** Python's exception kinds that a malformed module lets through. */
export class PyException extends Error {}
export class TypeError_ extends PyException {}
export class AttributeError extends PyException {}
export class ValueError extends PyException {}
export class KeyError extends PyException {}

/** type(v).__name__ of a JSON value. */
export function pyType(v: unknown): string {
  switch (true) {
    case v == null: return 'NoneType'
    case typeof v === 'boolean': return 'bool'
    case typeof v === 'number': return 'int'
    case v instanceof PyFloat: return 'float'
    case typeof v === 'string': return 'str'
    case Array.isArray(v): return 'list'
    default: return 'dict'
  }
}

/** bool(v) of a JSON value. */
export function truthy(v: unknown): boolean {
  if (v instanceof PyFloat) return v.value !== 0
  if (Array.isArray(v)) return v.length > 0
  if (v !== null && typeof v === 'object') return Object.keys(v).length > 0
  return v !== undefined && v !== null && v !== false && v !== 0 && v !== ''
}

/** '%0Nx': hex zero-padded to `width`, a minus sign counted inside the width. */
export function hexw(n: number, width = 8): string {
  const digits = Math.abs(n).toString(16)
  return n < 0 ? '-' + digits.padStart(width - 1, '0') : digits.padStart(width, '0')
}

/** '0x%08x'. */
export const hex8 = (n: number): string => `0x${hexw(n, 8)}`

/** repr(v) of a JSON value, or of a list or Map built from them. */
export function repr(v: unknown): string {
  if (v == null) return 'None'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v).toString() : floatRepr(v)
  if (v instanceof PyFloat) return floatRepr(v.value)
  if (typeof v === 'string') return stringRepr(v)
  const pairs = (entries: Iterable<[unknown, unknown]>) => '{' + Array.from(entries, ([k, x]) => `${repr(k)}: ${repr(x)}`).join(', ') + '}'
  if (v instanceof Map) return pairs(v)
  if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']'
  if (typeof v === 'object') return pairs(Object.entries(v))
  return String(v)
}

/** A tuple's repr: (a, b), and (a,) for one item. */
export const tupleRepr = (items: unknown[]): string => `(${items.map(repr).join(', ')}${items.length === 1 ? ',' : ''})`

/** str(v): a string as itself, anything else as its repr. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : repr(v))

/** repr() of a float: the shortest round-trip digits; positional for decimal exponents -4..15 (whole numbers end
 * in .0), otherwise d.ddde±XX with at least two exponent digits. */
export function floatRepr(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (n === Infinity) return 'inf'
  if (n === -Infinity) return '-inf'
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0'
  const sign = n < 0 ? '-' : ''
  const [mantissa, exponent] = Math.abs(n).toExponential().split('e')
  const digits = mantissa.replace('.', ''), e = Number(exponent)
  if (e < -4 || e >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
    return `${sign}${m}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  if (e < 0) return `${sign}0.${'0'.repeat(-e - 1)}${digits}`
  const whole = digits.slice(0, e + 1).padEnd(e + 1, '0'), fraction = digits.slice(e + 1)
  return `${sign}${whole}.${fraction || '0'}`
}

const STRING_ESCAPES: Record<string, string> = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' }

function stringRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'"
  let body = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    body += ch === quote ? '\\' + ch : STRING_ESCAPES[ch] ?? (code < 0x20 || code === 0x7f ? '\\x' + hexw(code, 2) : ch)
  }
  return quote + body + quote
}

/** The value of a Unicode decimal digit (Python reads '٣' as 3): its distance from the first digit of its run. */
function digitValue(ch: string): string {
  const code = ch.codePointAt(0)!
  if (code < 0x80) return ch
  let zero = code
  while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--
  return String((code - zero) % 10)
}

const INT_LITERAL = /^\s*([+-]?)(?:0[xX]((?:_?[0-9a-fA-F])+)|0[oO]((?:_?[0-7])+)|0[bB]((?:_?[01])+)|(0(?:_?0)*|[1-9](?:_?[0-9])*))\s*$/

/** int(v, 0) as the builder reads a number: an int stays one, a bool is 0 or 1, and a string must be a Python
 * integer literal (0x, 0o, 0b, underscores between digits, no leading zeros). null for anything else. */
export function pyInt(v: unknown): number | null {
  if (typeof v === 'boolean') return Number(v)
  if (typeof v === 'number') return Number.isInteger(v) ? v : null
  if (typeof v !== 'string') return null
  const m = INT_LITERAL.exec(v.replace(/\p{Nd}/gu, digitValue))
  if (!m) return null
  const [, sign, hex, oct, bin, dec] = m
  const [text, radix] = hex !== undefined ? [hex, 16] : oct !== undefined ? [oct, 8] : bin !== undefined ? [bin, 2] : [dec, 10]
  const n = parseInt(text.replace(/_/g, ''), radix)
  return sign === '-' ? -n : n
}

/** A JSON value; a Map keeps its keys in the order they were set, numeric ones too, as a Python dict. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json } | Map<string, Json>

/** json.dumps(value, indent=...) as Python writes it: ensure_ascii, ', ' and ': ' separators (',' between items
 * once indented), and objects in their own key order. */
export function dumps(v: unknown, indent?: number): string {
  const indented = indent !== undefined
  const open = (level: number) => (indented ? '\n' + ' '.repeat(indent * level) : '')
  const write = (x: unknown, level: number): string => {
    if (x == null) return 'null'
    if (typeof x === 'boolean') return String(x)
    if (typeof x === 'number') return jsonNumber(x)
    if (x instanceof PyFloat) return Number.isFinite(x.value) ? floatRepr(x.value) : jsonNumber(x.value)
    if (typeof x === 'string') return jsonString(x)
    const items = Array.isArray(x) ? x.map(y => write(y, level + 1))
      : (x instanceof Map ? [...x] : Object.entries(x)).map(([k, y]) => `${jsonString(String(k))}: ${write(y, level + 1)}`)
    const [l, r] = Array.isArray(x) ? ['[', ']'] : ['{', '}']
    if (!items.length) return l + r
    return l + open(level + 1) + items.join((indented ? ',' : ', ') + open(level + 1)) + open(level) + r
  }
  return write(v, 0)
}

function jsonNumber(n: number): string {
  if (Number.isInteger(n)) return BigInt(n).toString()
  if (Number.isNaN(n)) return 'NaN'
  if (Math.abs(n) === Infinity) return n > 0 ? 'Infinity' : '-Infinity'
  return floatRepr(n)
}

const JSON_ESCAPES: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }

/** A JSON string with every unit outside printable ASCII as \uXXXX (UTF-16 units, so a surrogate pair stays a pair). */
function jsonString(s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i)
    out += JSON_ESCAPES[s[i]] ?? (unit < 0x20 || unit > 0x7e ? '\\u' + hexw(unit, 4) : s[i])
  }
  return out + '"'
}
