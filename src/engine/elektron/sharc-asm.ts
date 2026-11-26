// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A small SHARC+ assembler for Modwerk's sound-chip code (the Digitakt II's section 7).
 *
 * It reads a plain-text source in the instruction syntax of Analog Devices' public *SHARC+ Core Programming
 * Reference* (a subset, below) and returns the loader blocks: code as 16-bit parcels, data as 32-bit words, both
 * little-endian, at loader byte addresses in L2. Encodings follow the reference's instruction types; only the forms a
 * Modwerk player needs exist. Every program is checked against the rules in sdk/machines/digitakt-ii/README.md
 * ("SHARC code rules"): the last 11 instructions of a hardware loop are 48-bit, and no DAG register is stored through
 * an index register of the same DAG.
 *
 * Source syntax (one statement per line, `;` or `//` starts a comment, case-insensitive mnemonics):
 *
 *   .code 0x200d0000          code from this loader byte address (labels are program counters)
 *   .data 0x200d8000          data from this loader byte address (labels are byte addresses)
 *   .equ NAME, expression     a constant
 *   .word e, e, ...           32-bit words (data)        .float 0.5, -1.0   32-bit floats (data)
 *   .space bytes              zero words, loaded with the program (data)
 *   label:
 *
 *   ureg = expression                      type 17a      ureg = DM(expression) / DM(expression) = ureg   type 14a
 *   ureg = DM(Ii, Mm) / DM(Ii, Mm) = ureg  type 3a, post-modify     DM(Mm, Ii): pre-modify, no update
 *   compute, ureg = DM(Ii, Mm)             type 3a with a computation in the same instruction
 *   DM(Ii, Mm) = expression                type 16a
 *   [IF cond] compute                      type 2a: Rn = Rx + Ry, Rx - Ry, Rx AND/OR/XOR Ry, PASS Rx, -Rx, Rx + 1,
 *                                          Rx - 1, ABS Rx, MIN(Rx, Ry), MAX(Rx, Ry), COMP(Rx, Ry), Rx * Ry (SSI),
 *                                          LSHIFT Rx BY Ry, ASHIFT Rx BY Ry; Fn = Fx + Fy, Fx - Fy, Fx * Fy, PASS Fx,
 *                                          -Fx, ABS Fx, MIN(Fx, Fy), MAX(Fx, Fy), COMP(Fx, Fy), FLOAT Rx, RECIPS Fx,
 *                                          RSQRTS Fx (the reference's seeds, about 8 bits); Rn = FIX Fx
 *   [IF cond] ureg = ureg                  type 5b (32-bit: never in the last 11 instructions of a loop)
 *   [IF cond] JUMP target                  type 8a, absolute, not delayed
 *   [IF cond] CALL target                  type 8a, absolute, not delayed, pushing the return address
 *   [IF cond] RTS                          type 11a, not delayed, no computation (bit 39 clear: with it set the word
 *                                          decodes as type 11c, and a conditional RTS whose condition fails hung the
 *                                          unit and stops the emulator; an unconditional or taken one ran either way)
 *   LCNTR = count, DO label UNTIL LCE      type 12a (label: the loop's last instruction)
 *   NOP
 *   CCALL target                           a linked call as the stock render loop makes one (the call, then the old
 *                                          frame pointer and the return address pushed in its two delay slots)
 *   CRET                                   the stock player's epilogue: I12 = DM(M7, I6), RETURN, RFRAME
 */

/** A loader block: `code` for instructions, false for data words (the two never share a block). */
export type SharcBlock = { address: number; bytes: Uint8Array; code: boolean }
export type SharcProgram = { blocks: SharcBlock[]; symbols: Map<string, number> }

const L2_START = 0x20000000, L2_END = 0x20100000
/** The short-word program counter of an L2 loader byte address. */
export const sharcProgramCounter = (address: number) => 0xb80000 + (address - L2_START) / 2

const CONDITIONS: Record<string, number> = {
  EQ: 0x00, LT: 0x01, LE: 0x02, AC: 0x03, AV: 0x04, MV: 0x05, MS: 0x06, SV: 0x07, SZ: 0x08,
  NE: 0x10, GE: 0x11, GT: 0x12, NOT_AC: 0x13, NOT_AV: 0x14, NOT_MV: 0x15, NOT_MS: 0x16, NOT_SV: 0x17, NOT_SZ: 0x18,
}
const TRUE = 0x1f

function universalRegister(name: string): number | null {
  const n = name.toUpperCase()
  const match = /^([RFIMLB])(\d{1,2})$/.exec(n)
  if (match) {
    const index = Number(match[2])
    if (index > 15) return null
    return ({ R: 0x00, F: 0x00, I: 0x10, M: 0x20, L: 0x30, B: 0x40 } as Record<string, number>)[match[1]] + index
  }
  return ({ MODE1: 0x72, MODE2: 0x74, ASTATX: 0x76, ASTATY: 0x77, STKYX: 0x78, STKYY: 0x79, USTAT1: 0x60,
    USTAT2: 0x61, LCNTR: 0x6b } as Record<string, number>)[n] ?? null
}

type Item =
  | { kind: 'code'; pc: number; width: 16 | 32 | 48; line: number; build: (labels: Map<string, number>) => bigint;
      store?: { index: number; ureg: number }; loopEnd?: string }
  | { kind: 'data'; address: number; line: number; build: (labels: Map<string, number>) => number }

class SourceError extends Error {
  constructor(line: number, message: string) { super(`line ${line}: ${message}`) }
}

function evaluate(text: string, symbols: Map<string, number>, line: number): number {
  const tokens = text.match(/0x[0-9a-f]+|\d+(?:\.\d+)?|[A-Za-z_.$][\w.$]*|<<|>>|[-+*/&|()~]/gi)
  if (!tokens || tokens.join('').replace(/\s/g, '') !== text.replace(/\s/g, '')) throw new SourceError(line, 'bad expression: ' + text)
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]
  const primary = (): number => {
    const token = take()
    if (token === undefined) throw new SourceError(line, 'incomplete expression: ' + text)
    if (token === '(') { const value = or(); if (take() !== ')') throw new SourceError(line, 'missing ) in ' + text); return value }
    if (token === '-') return -primary()
    if (token === '~') return ~primary()
    if (/^0x/i.test(token)) return parseInt(token, 16)
    if (/^\d/.test(token)) return Number(token)
    const value = symbols.get(token)
    if (value === undefined) throw new SourceError(line, 'unknown symbol ' + token)
    return value
  }
  const product = (): number => { let v = primary(); while (peek() === '*' || peek() === '/') v = take() === '*' ? v * primary() : Math.trunc(v / primary()); return v }
  const sum = (): number => { let v = product(); while (peek() === '+' || peek() === '-') v = take() === '+' ? v + product() : v - product(); return v }
  const shift = (): number => { let v = sum(); while (peek() === '<<' || peek() === '>>') v = take() === '<<' ? v * 2 ** sum() : Math.floor(v / 2 ** sum()); return v }
  const and = (): number => { let v = shift(); while (peek() === '&') { take(); v = Number(BigInt.asUintN(32, BigInt(v)) & BigInt.asUintN(32, BigInt(shift()))) } return v }
  const or = (): number => { let v = and(); while (peek() === '|') { take(); v = Number(BigInt.asUintN(32, BigInt(v)) | BigInt.asUintN(32, BigInt(and()))) } return v }
  const value = or()
  if (at !== tokens.length) throw new SourceError(line, 'bad expression: ' + text)
  return value
}

const u32 = (value: number) => BigInt.asUintN(32, BigInt(Math.trunc(value)))
const float32Bits = (value: number) => { const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value); return view.getUint32(0) }

const ALU: Record<string, number> = { '+': 0x01, '-': 0x02, AND: 0x40, OR: 0x41, XOR: 0x42 }
const FLOAT_ALU: Record<string, number> = { '+': 0x81, '-': 0x82 }

/** Parse a computation (the part of type 2a/3a below bit 23), or null when `text` is not one. */
function computation(text: string): number | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, ' ')
  const reg = (name: string, kind: 'R' | 'F') => { const m = new RegExp('^' + kind + '(\\d{1,2})$').exec(name); return m && Number(m[1]) <= 15 ? Number(m[1]) : null }
  const alu = (op: number, n: number, x: number, y = 0) => (op << 12) | (n << 8) | (x << 4) | y
  const mul = (op: number, n: number, x: number, y: number) => (1 << 20) | alu(op, n, x, y)
  const shifter = (op: number, n: number, x: number, y: number) => (2 << 20) | alu(op, n, x, y)
  let m = /^COMP ?\(([RF]\d+), ?([RF]\d+)\)$/.exec(t)
  if (m) {
    const [x, y, f] = [reg(m[1], 'R') ?? reg(m[1], 'F'), reg(m[2], 'R') ?? reg(m[2], 'F'), m[1][0] === 'F']
    return x === null || y === null || m[1][0] !== m[2][0] ? null : alu(f ? 0x8a : 0x0a, 0, x, y)
  }
  m = /^([RF]\d+) ?= ?(.+)$/.exec(t)
  if (!m) return null
  const dest = m[1], rhs = m[2], float = dest[0] === 'F'
  const n = reg(dest, float ? 'F' : 'R')
  if (n === null) return null
  const kind = float ? 'F' : 'R'
  let r: RegExpExecArray | null
  if ((r = /^([RF]\d+) ?(\+|-|\*|AND|OR|XOR) ?([RF]\d+)( ?\(SSI\))?$/.exec(rhs))) {
    const x = reg(r[1], kind), y = reg(r[3], kind)
    if (x === null || y === null) return null
    if (r[2] === '*') return float ? (r[4] ? null : mul(0x30, n, x, y)) : (r[4] ? mul(0x70, n, x, y) : null)
    if (r[4]) return null
    const op = float ? FLOAT_ALU[r[2]] : ALU[r[2]]
    return op === undefined ? null : alu(op, n, x, y)
  }
  if ((r = /^(R\d+) ?(\+|-) ?1$/.exec(rhs)) && !float) { const x = reg(r[1], 'R'); return x === null ? null : alu(r[2] === '+' ? 0x29 : 0x2a, n, x) }
  if ((r = /^PASS ([RF]\d+)$/.exec(rhs))) { const x = reg(r[1], kind); return x === null ? null : alu(float ? 0xa1 : 0x21, n, x) }
  if ((r = /^-([RF]\d+)$/.exec(rhs))) { const x = reg(r[1], kind); return x === null ? null : alu(float ? 0xa2 : 0x22, n, x) }
  if ((r = /^ABS ([RF]\d+)$/.exec(rhs))) { const x = reg(r[1], kind); return x === null ? null : alu(float ? 0xb0 : 0x30, n, x) }
  if ((r = /^(MIN|MAX) ?\(([RF]\d+), ?([RF]\d+)\)$/.exec(rhs))) {
    const x = reg(r[2], kind), y = reg(r[3], kind)
    return x === null || y === null ? null : alu((float ? 0xe0 : 0x60) + (r[1] === 'MIN' ? 1 : 2), n, x, y)
  }
  if ((r = /^FLOAT (R\d+)$/.exec(rhs)) && float) { const x = reg(r[1], 'R'); return x === null ? null : alu(0xca, n, x) }
  if ((r = /^(RECIPS|RSQRTS) (F\d+)$/.exec(rhs)) && float) { const x = reg(r[2], 'F'); return x === null ? null : alu(r[1] === 'RECIPS' ? 0xc4 : 0xc5, n, x) }
  if ((r = /^FIX (F\d+)$/.exec(rhs)) && !float) { const x = reg(r[1], 'F'); return x === null ? null : alu(0xc9, n, x) }
  if ((r = /^(LSHIFT|ASHIFT) (R\d+) BY (R\d+)$/.exec(rhs)) && !float) {
    const x = reg(r[2], 'R'), y = reg(r[3], 'R')
    return x === null || y === null ? null : shifter(r[1] === 'LSHIFT' ? 0x00 : 0x04, n, x, y)
  }
  return null
}

const dag = (ureg: number) => ureg >= 0x10 && ureg < 0x50 ? ((ureg & 0xf) < 8 ? 1 : 2) : 0

/** Assemble `source`; throws with the line number on any error or broken rule. */
export function assembleSharc(source: string): SharcProgram {
  const symbols = new Map<string, number>()
  const items: Item[] = []
  let section: 'code' | 'data' | null = null
  let pc = 0, address = 0
  const pending: { line: number; text: string; first: number }[] = []
  const lines = source.split(/\r?\n/)
  // Pass 1: positions and labels. Instruction sizes never depend on label values.
  for (const [index, raw] of lines.entries()) {
    const line = index + 1
    let text = raw.replace(/(;|\/\/).*$/, '').trim()
    let label: RegExpExecArray | null
    while ((label = /^([A-Za-z_.$][\w.$]*):\s*/.exec(text))) {
      if (symbols.has(label[1])) throw new SourceError(line, 'label defined twice: ' + label[1])
      if (!section) throw new SourceError(line, 'label before .code or .data')
      symbols.set(label[1], section === 'code' ? pc : address)
      text = text.slice(label[0].length)
    }
    if (!text) continue
    const directive = /^\.(\w+)\s*(.*)$/.exec(text)
    if (directive) {
      const [, name, rest] = directive
      if (name === 'equ') {
        const m = /^([A-Za-z_.$][\w.$]*)\s*,\s*(.+)$/.exec(rest)
        if (!m) throw new SourceError(line, '.equ NAME, value')
        symbols.set(m[1], evaluate(m[2], symbols, line))
        continue
      }
      if (name === 'code' || name === 'data') {
        const at = evaluate(rest, symbols, line)
        if (at < L2_START || at >= L2_END || at % 4) throw new SourceError(line, 'a block starts at a word-aligned L2 loader byte address')
        section = name
        if (name === 'code') pc = sharcProgramCounter(at)
        else address = at
        continue
      }
      if (section !== 'data') throw new SourceError(line, `.${name} belongs in a .data block`)
      if (name === 'space') {
        // Zero words that are part of the block: memory the player owns is loaded with the program, never assumed.
        const bytes = evaluate(rest, symbols, line)
        if (!Number.isInteger(bytes) || bytes < 0 || bytes % 4) throw new SourceError(line, '.space takes a whole number of words, in bytes')
        for (let k = 0; k < bytes; k += 4) items.push({ kind: 'data', address: address + k, line, build: () => 0 })
        address += bytes
        continue
      }
      if (name === 'word' || name === 'float') {
        for (const part of rest.split(',')) {
          const expr = part.trim(), at = address
          items.push({ kind: 'data', address: at, line, build: labels => name === 'float' ? float32Bits(Number(expr)) : Number(u32(evaluate(expr, labels, line))) })
          address += 4
        }
        continue
      }
      throw new SourceError(line, 'unknown directive .' + name)
    }
    if (section !== 'code') throw new SourceError(line, 'instruction outside a .code block')
    const first = items.length
    for (const width of shape(text)) {
      items.push({ kind: 'code', pc, width, line, build: () => 0n })
      pc += width / 16
    }
    pending.push({ line, text, first })
  }
  // Pass 2: encode (a statement may be several instructions: CCALL, CRET).
  for (const { line, text, first } of pending) {
    const encoded = encode(text, line, (items[first] as Extract<Item, { kind: 'code' }>).pc)
    for (const [k, part] of encoded.entries()) {
      const item = items[first + k] as Extract<Item, { kind: 'code' }>
      if (part.width !== item.width) throw new Error(`line ${line}: internal size mismatch`)
      Object.assign(item, part)
    }
  }
  const code = items.filter((item): item is Extract<Item, { kind: 'code' }> => item.kind === 'code')
  checkRules(code, symbols)
  return { blocks: layout(items, symbols), symbols }
}

/** The widths of the instructions a statement assembles to (known before labels are). */
function shape(text: string): (16 | 32 | 48)[] {
  const t = text.toUpperCase().replace(/\s+/g, ' ')
  if (t === 'CCALL' || t.startsWith('CCALL ')) return [48, 48, 48]
  if (t === 'CRET') return [48, 48, 32, 48, 16]
  const m = /^(?:IF (?:NOT )?\w+ )?(\w+) ?= ?(\w+)$/.exec(t)
  if (m && universalRegister(m[1]) !== null && universalRegister(m[2]) !== null) return [32]
  return [48]
}

type Encoded = Partial<Extract<Item, { kind: 'code' }>>

function encode(text: string, line: number, pc: number): Encoded[] {
  const fail = (message = 'unsupported instruction') => { throw new SourceError(line, message + ': ' + text) }
  const t = text.replace(/\s+/g, ' ').trim()
  const upper = t.toUpperCase()
  const one = (width: 16 | 32 | 48, build: (labels: Map<string, number>) => bigint, extra: Encoded = {}): Encoded[] => [{ width, build, ...extra }]
  const expr = (e: string) => (labels: Map<string, number>) => evaluate(e, labels, line)
  if (upper === 'NOP') return one(48, () => 0n)
  if (upper === 'CRET') {
    // I12 = DM(M7, I6); NOP; RETURN; NOP; RFRAME -- the stock player's epilogue, as one unit.
    return [{ width: 48, build: () => type3(0, 6, 7, TRUE, false, 0x1c, 0) },
      { width: 48, build: () => 0n }, { width: 32, build: () => 0x083f343fn }, { width: 48, build: () => 0n }, { width: 16, build: () => 0x1901n }]
  }
  let m: RegExpExecArray | null
  if ((m = /^CCALL (.+)$/i.exec(t))) {
    const target = expr(m[1])
    return [
      { width: 48, build: labels => (0x1804n << 32n) | u32(target(labels)) },
      { width: 48, build: () => type3(1, 7, 7, TRUE, true, 0x02, 0) }, // DM(I7, M7) = R2: the old frame pointer
      { width: 48, build: () => (0x9n << 44n) | (7n << 41n) | (7n << 38n) | u32(pc + 9 - 1) }, // the return address - 1
    ]
  }
  if ((m = /^LCNTR ?= ?(.+?), ?DO (\S+) UNTIL LCE$/i.exec(t))) {
    const count = expr(m[1]), end = m[2]
    return one(48, labels => {
      const n = count(labels), last = labels.get(end)
      if (last === undefined) throw new SourceError(line, 'unknown loop end ' + end)
      if (!Number.isInteger(n) || n < 1 || n > 0xffff) throw new SourceError(line, 'loop count out of range')
      return (0x0cn << 40n) | (BigInt(n) << 24n) | (1n << 23n) | BigInt((last - pc) & 0x7fffff)
    }, { loopEnd: end })
  }
  let condition = TRUE
  let body = t
  if ((m = /^IF (NOT \w+|\w+) (.+)$/i.exec(t))) {
    const name = m[1].toUpperCase().replace(' ', '_')
    if (!(name in CONDITIONS)) fail('unknown condition ' + m[1])
    condition = CONDITIONS[name]
    body = m[2]
  }
  if ((m = /^(JUMP|CALL) (.+)$/i.exec(body))) {
    const target = expr(m[2]), call = m[1].toUpperCase() === 'CALL' ? 1n << 39n : 0n
    return one(48, labels => (0x06n << 40n) | call | (BigInt(condition) << 33n) | (u32(target(labels)) & 0xffffffn))
  }
  if (/^RTS$/i.test(body)) return one(48, () => (0x0an << 40n) | (BigInt(condition) << 33n))
  const compute = computation(body)
  if (compute !== null) return one(48, () => (0x01n << 40n) | (BigInt(condition) << 33n) | BigInt(compute))
  if (condition !== TRUE) {
    if ((m = /^(\w+) ?= ?(\w+)$/.exec(body)) && universalRegister(m[1]) !== null && universalRegister(m[2]) !== null) return move(m[1], m[2], condition)
    fail('a condition applies to a computation, a register move or a jump')
  }
  // compute, transfer
  let computePart = 0
  const split = /^(.+?), ?((?:[RFIMLB]\d+|\w+) ?= ?DM\(.+\)|DM\(.+\) ?= ?.+)$/i.exec(body)
  if (split && computation(split[1]) !== null) { computePart = computation(split[1])!; body = split[2] }
  if ((m = /^(\w+) ?= ?DM\((I\d+|M\d+), ?(M\d+|I\d+)\)$/i.exec(body))) return transfer(m[1], m[2], m[3], false, computePart)
  if ((m = /^DM\((I\d+|M\d+), ?(M\d+|I\d+)\) ?= ?(.+)$/i.exec(body))) {
    if (universalRegister(m[3]) !== null) return transfer(m[3], m[1], m[2], true, computePart)
    if (computePart) fail()
    const pair = indexPair(m[1], m[2])
    if (!pair.post) fail('DM(Mm, Ii) = immediate is not a type 16a form')
    const value = expr(m[3])
    return one(48, labels => (0x9n << 44n) | (BigInt(pair.i) << 41n) | (BigInt(pair.m) << 38n) | u32(value(labels)))
  }
  if (computePart) fail()
  if ((m = /^(\w+) ?= ?DM\((.+)\)$/i.exec(body)) && universalRegister(m[1]) !== null) {
    const ureg = universalRegister(m[1])!, at = expr(m[2])
    return one(48, labels => (0x10n << 40n) | (BigInt(ureg) << 32n) | u32(at(labels)))
  }
  if ((m = /^DM\((.+)\) ?= ?(\w+)$/i.exec(body)) && universalRegister(m[2]) !== null) {
    const ureg = universalRegister(m[2])!, at = expr(m[1])
    return one(48, labels => (0x11n << 40n) | (BigInt(ureg) << 32n) | u32(at(labels)))
  }
  if ((m = /^(\w+) ?= ?(\w+)$/.exec(body)) && universalRegister(m[1]) !== null && universalRegister(m[2]) !== null) return move(m[1], m[2], TRUE)
  if ((m = /^(\w+) ?= ?(.+)$/.exec(body)) && universalRegister(m[1]) !== null) {
    const ureg = universalRegister(m[1])!, value = m[2].trim()
    const literal = /^-?\d+\.\d*(e-?\d+)?$/i.test(value) ? float32Bits(Number(value)) : null
    const v = expr(value)
    return one(48, labels => (0x0fn << 40n) | (BigInt(ureg) << 32n) | (literal !== null ? BigInt(literal) : u32(v(labels))))
  }
  return fail()

  function indexPair(a: string, b: string) {
    const A = a.toUpperCase(), B = b.toUpperCase()
    const post = A[0] === 'I' && B[0] === 'M', pre = A[0] === 'M' && B[0] === 'I'
    if (!post && !pre) fail('a DAG access names one I and one M register')
    const i = Number((post ? A : B).slice(1)), mm = Number((post ? B : A).slice(1))
    if (i > 15 || mm > 15 || (i < 8) !== (mm < 8)) fail('I and M registers of one DAG')
    return { i: i & 7, m: mm & 7, post, dagOf: i < 8 ? 1 : 2, index: i }
  }
  function transfer(reg: string, a: string, b: string, write: boolean, computeBits: number): Encoded[] {
    const ureg = universalRegister(reg)
    if (ureg === null) fail('unknown register ' + reg)
    const pair = indexPair(a, b)
    if (pair.dagOf === 2) fail('this assembler encodes DAG1 (I0-I7) accesses only')
    return one(48, () => type3(pair.post ? 1 : 0, pair.i, pair.m, TRUE, write, ureg!, computeBits), write ? { store: { index: pair.index, ureg: ureg! } } : {})
  }
}

function type3(u: number, i: number, m: number, cond: number, write: boolean, ureg: number, compute: number): bigint {
  return (0b010n << 45n) | (BigInt(u) << 44n) | (BigInt(i) << 41n) | (BigInt(m) << 38n) | (BigInt(cond) << 33n) |
    (BigInt(write ? 1 : 0) << 31n) | (BigInt(ureg) << 23n) | BigInt(compute)
}

function move(dest: string, source: string, condition: number): Encoded[] {
  const s = universalRegister(source)!, d = universalRegister(dest)!
  const word = 0x7000003f | ((s >> 2) << 22) | (condition << 17) | (((s >> 1) & 1) << 16) | ((s & 1) << 15) | (d << 7)
  return [{ width: 32, build: () => BigInt(word >>> 0) }]
}

function checkRules(code: Extract<Item, { kind: 'code' }>[], symbols: Map<string, number>): void {
  for (const item of code) {
    if (item.store && dag(item.store.ureg) && dag(item.store.ureg) === (item.store.index < 8 ? 1 : 2)) {
      throw new SourceError(item.line, 'a DAG register stored through an index register of the same DAG')
    }
  }
  for (const [start, item] of code.entries()) {
    if (!item.loopEnd) continue
    const endPc = symbols.get(item.loopEnd)
    const endIndex = code.findIndex(entry => entry.pc === endPc)
    if (endIndex <= start) throw new SourceError(item.line, 'the loop end is not an instruction after DO')
    const short = code.slice(start + 1, endIndex + 1).slice(-11).find(entry => entry.width !== 48)
    if (short) throw new SourceError(short.line, 'a 16- or 32-bit instruction among the last 11 instructions of a hardware loop')
  }
}

function layout(items: Item[], symbols: Map<string, number>): SharcBlock[] {
  const pieces: SharcBlock[] = []
  for (const item of items) {
    if (item.kind === 'data') {
      const value = item.build(symbols) >>> 0
      pieces.push({ address: item.address, bytes: Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24), code: false })
      continue
    }
    const frame = item.build(symbols)
    const parcels = Array.from({ length: item.width / 16 }, (_, k) => Number((frame >> BigInt(item.width - 16 - 16 * k)) & 0xffffn))
    const address = L2_START + (item.pc - 0xb80000) * 2
    pieces.push({ address, bytes: Uint8Array.from(parcels.flatMap(p => [p & 255, p >>> 8])), code: true })
  }
  pieces.sort((a, b) => a.address - b.address)
  const blocks: SharcBlock[] = []
  for (const piece of pieces) {
    const last = blocks[blocks.length - 1]
    if (last && piece.address < last.address + last.bytes.length) throw new Error(`overlapping code or data at ${piece.address.toString(16)}`)
    if (last && piece.address === last.address + last.bytes.length && last.code === piece.code) {
      const joined = new Uint8Array(last.bytes.length + piece.bytes.length)
      joined.set(last.bytes); joined.set(piece.bytes, last.bytes.length)
      last.bytes = joined
    } else blocks.push({ ...piece })
  }
  // The loader places whole 32-bit words: pad a block that ends inside one (code ends on a 16-bit parcel).
  for (const [index, block] of blocks.entries()) {
    if (block.bytes.length % 4 === 0) continue
    const padded = new Uint8Array(block.bytes.length + 4 - block.bytes.length % 4)
    padded.set(block.bytes)
    if (blocks[index + 1] && blocks[index + 1].address < block.address + padded.length) throw new Error(`overlapping code or data at ${blocks[index + 1].address.toString(16)}`)
    block.bytes = padded
  }
  return blocks
}
