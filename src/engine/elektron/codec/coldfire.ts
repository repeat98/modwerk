// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's ColdFire ISA_C + EMAC instruction classifier: the length, op class, flags and control flow of
// one instruction, enough to keep a linear sweep in step. Not a disassembler. ../coldfire-isa.ts and
// coldfire-kit.ts pick a variant and export the public API.

export const FPU = 1, LINEF = 2, ILLEGAL = 4, PRIV = 8, MOVEC = 16, EMAC_OP = 32, PCREL = 64
export type Flow = 'none' | 'bcc' | 'bra' | 'bsr' | 'jmp' | 'jsr' | 'rts' | 'rte' | 'trap'
export type Instruction = { length: number; op: string; flags: number; flow: Flow; target?: number }
export type Read16 = (offset: number) => number
// ops: the kit names bitrev/byterev/ff1 and btsti/bchgi apart, Modwerk calls them bitop and btsti.
// fpuReadFailure: what an unreadable FPU EA extension word does: 'fallback' to linef, or 'shorten' the fpu length.
export type Variant = { ops: 'kit' | 'modwerk'; fpuReadFailure: 'fallback' | 'shorten' }

type Word = { w: number; m: number; r: number; read16: Read16; addr: number; v: Variant }
type Result = Instruction | null // null: no ColdFire instruction has this encoding

const ALU_IMM = [0x0080, 0x0280, 0x0480, 0x0680, 0x0a80]
const FP_SIZES = [4, 4, 12, 12, 2, 8, 1, 12]
const s16 = (x: number) => x << 16 >> 16

function result(length: number, op: string, flags = 0, flow: Flow = 'none', target?: number): Instruction {
  return target === undefined ? { length, op, flags, flow } : { length, op, flags, flow, target }
}

// Extension bytes of the effective address (m, r) whose extension starts at p, or -1 when ColdFire has
// no such mode. imm is the operand size of an allowed immediate, 0 when none is allowed. Indexed modes
// read their brief extension word: bit 8 marks the 68020 full format, which ColdFire lacks.
function eaBytes(read16: Read16, m: number, r: number, imm: number, p: number): number {
  if (m < 5) return 0
  if (m === 5) return 2
  if (m === 6 || r === 3) return read16(p) & 0x100 ? -1 : 2
  if (r === 0 || r === 2) return 2
  if (r === 1) return 4
  return r === 4 && imm ? (imm === 4 ? 4 : 2) : -1
}

// An instruction with its EA in the low six bits, after k extension words of its own.
function single(x: Word, op: string, size: number, k = 0, flags = 0, immOK = true, flow: Flow = 'none', target?: number): Result {
  const p = 2 + 2 * k, ea = eaBytes(x.read16, x.m, x.r, immOK ? size : 0, p)
  if (ea < 0) return null
  return result(p + ea, op, x.m === 7 && (x.r === 2 || x.r === 3) ? flags | PCREL : flags, flow, target)
}

function line0(x: Word): Result {
  const { w, m, r } = x, low = w & 0xfff8
  if (ALU_IMM.includes(low)) return result(6, 'alu_imm')
  if (low === 0x0c80) return result(6, 'cmpi')
  if (low === 0x0c00 || low === 0x0c40) return result(4, 'cmpi')
  if (low === 0x00c0 || low === 0x02c0 || low === 0x04c0) return result(2, x.v.ops === 'kit' ? ['bitrev', 'byterev', 'ff1'][w >> 9] : 'bitop')
  const kind = w >> 6 & 3
  if ((w & 0xf100) === 0x0100) return m === 1 ? null : single(x, kind ? 'bchg' : 'btst', m ? 1 : 4, 0, 0, !kind)
  if ((w & 0xff00) === 0x0800) {
    if (m === 1 || m === 7 && r >= 2) return null
    return single(x, kind && x.v.ops === 'kit' ? 'bchgi' : 'btsti', m ? 1 : 4, 1)
  }
  return null
}

function move(x: Word): Result {
  const { w, m, r, read16 } = x, size = [0, 1, 4, 2][w >> 12], dm = w >> 6 & 7, dr = w >> 9 & 7
  if (dm === 1 && size === 1 || dm === 7 && dr >= 2) return null
  const src = eaBytes(read16, m, r, size, 2)
  if (src < 0) return null
  const dst = eaBytes(read16, dm, dr, 0, 2 + src)
  if (dst < 0) return null
  return result(2 + src + dst, dm === 1 ? 'movea' : 'move', m === 7 && (r === 2 || r === 3) ? PCREL : 0)
}

// Control addressing: no Dn, An, (An)+, -(An) or immediate.
const control = (m: number, r: number) => !(m <= 1 || m === 3 || m === 4 || m === 7 && r === 4)

function jump(x: Word, op: 'jsr' | 'jmp'): Result {
  const { m, r, read16, addr } = x
  if (!control(m, r)) return null
  let target: number | undefined
  if (m === 7 && r === 0) target = s16(read16(2)) >>> 0
  else if (m === 7 && r === 1) target = (read16(2) << 16 | read16(4)) >>> 0
  else if (m === 7 && r === 2) target = addr + 2 + s16(read16(2)) >>> 0
  return single(x, op, 4, 0, 0, false, op, target)
}

function line4(x: Word): Result {
  const { w, m, r, read16 } = x, low = w & 0xfff8, mid = w & 0xffc0
  if ((w & 0xf1c0) === 0x41c0) return control(m, r) ? single(x, 'lea', 4, 0, 0, false) : null
  if (w === 0x40e7) return read16(2) === 0x46fc ? result(6, 'stldsr', PRIV) : null
  if (low === 0x4080) return result(2, 'negx')
  if (low === 0x40c0) return result(2, 'move_from_sr', PRIV)
  if (mid === 0x4200 || mid === 0x4240 || mid === 0x4280) return m === 1 ? null : single(x, 'clr', [1, 2, 4][w >> 6 & 3], 0, 0, false)
  if (low === 0x42c0) return result(2, 'move_from_ccr')
  if (low === 0x4480) return result(2, 'neg')
  if (mid === 0x44c0) return m === 0 || m === 7 && r === 4 ? single(x, 'move_to_ccr', 2) : null
  if (low === 0x4680) return result(2, 'not')
  if (mid === 0x46c0) return m === 0 || m === 7 && r === 4 ? single(x, 'move_to_sr', 2, 0, PRIV) : null
  if (low === 0x4840) return result(2, 'swap')
  if (mid === 0x4840) return control(m, r) ? single(x, 'pea', 4, 0, 0, false) : null
  if (low === 0x4880 || low === 0x48c0) return result(2, 'ext')
  if (mid === 0x48c0 || mid === 0x4cc0) return m === 2 || m === 5 ? single(x, 'movem', 4, 1) : null
  if (low === 0x49c0) return result(2, 'extb')
  if (w === 0x4ac8) return result(2, 'halt', PRIV)
  if (w === 0x4acc) return result(2, 'pulse')
  if (w === 0x4afc) return result(2, 'illegal', ILLEGAL)
  if (mid === 0x4a00 || mid === 0x4a40 || mid === 0x4a80) return single(x, 'tst', [1, 2, 4][w >> 6 & 3])
  if (mid === 0x4ac0) return m <= 1 || m === 7 && r >= 2 ? null : single(x, 'tas', 1)
  if (mid === 0x4c00) return m === 1 || m === 6 || m === 7 && (r <= 1 || r === 3) ? null : single(x, 'mul_l', 4, 1)
  if (mid === 0x4c40) return m === 1 || m === 6 || m === 7 && (r <= 1 || r === 3 || r === 4) ? null : single(x, 'div_l', 4, 1)
  if (low === 0x4c80) return result(2, 'sats')
  if ((w & 0xfff0) === 0x4e40) return result(2, 'trap', 0, 'trap')
  if (low === 0x4e50) return result(4, 'link')
  if (low === 0x4e58) return result(2, 'unlk')
  if (low === 0x4e60 || low === 0x4e68) return result(2, 'move_usp', PRIV)
  if (w === 0x4e71) return result(2, 'nop')
  if (w === 0x4e72) return result(4, 'stop', PRIV)
  if (w === 0x4e73) return result(2, 'rte', PRIV, 'rte')
  if (w === 0x4e75) return result(2, 'rts', 0, 'rts')
  if (w === 0x4e7a || w === 0x4e7b) return result(4, 'movec', PRIV | MOVEC)
  if (mid === 0x4e80) return jump(x, 'jsr')
  if (mid === 0x4ec0) return jump(x, 'jmp')
  return null
}

function line5(x: Word): Result {
  const { w, m, r } = x
  if (w === 0x51fa) return result(4, 'tpf')
  if (w === 0x51fb) return result(6, 'tpf')
  if (w === 0x51fc) return result(2, 'tpf')
  if ((w & 0xf1c0) === 0x5080 || (w & 0xf1c0) === 0x5180) return m === 7 && r >= 2 ? null : single(x, 'addq', 4)
  if ((w & 0xf0f8) === 0x50c0) return result(2, 'scc')
  return null
}

function branch(x: Word): Result {
  const { w, read16, addr } = x, c = w >> 8 & 15, d = w & 0xff
  const [length, disp] = d === 0 ? [4, s16(read16(2))] : d === 0xff ? [6, read16(2) << 16 | read16(4)] : [2, d << 24 >> 24]
  const flow = c === 0 ? 'bra' : c === 1 ? 'bsr' : 'bcc'
  return result(length, flow, 0, flow, addr + 2 + disp >>> 0)
}

// Lines 8 (or, div), 9 (sub), C (and, mul) and D (add).
function arith(x: Word): Result {
  const { w, m, r } = x, line = w >> 12, o = w >> 6 & 7, logic = line === 8 || line === 0xc
  if (o === 2) return m === 1 && logic ? null : single(x, 'alu_ea_r', 4)
  if (o === 6 && !logic && m === 0) return result(2, 'addx')
  if (o === 6) return m <= 1 || m === 7 && r >= 2 ? null : single(x, 'alu_r_ea', 4)
  if (o === 7 && !logic) return single(x, 'alu_ea_r', 4)
  if ((o === 3 || o === 7) && logic) return m === 1 ? null : single(x, line === 8 ? 'div_w' : 'mul_w', 2)
  return null
}

// EMAC and mov3q. The patterns overlap, so order matters.
function lineA(x: Word): Result {
  const { w, m, r } = x
  if ((w & 0xf1c0) === 0xa140) return m === 7 && r >= 2 ? null : single(x, 'mov3q', 4)
  if ((w & 0xffc0) === 0xad00) return single(x, 'to_mask', 4)
  if ((w & 0xfbc0) === 0xab00) return single(x, 'to_accext', 4)
  if ((w & 0xffc0) === 0xa900) return single(x, 'to_macsr', 4)
  if ((w & 0xf9c0) === 0xa100) return single(x, 'to_acc', 4, 0, EMAC_OP)
  if (w === 0xa9c0) return result(2, 'macsr_ccr')
  if ((w & 0xfbf0) === 0xab80 || (w & 0xfff0) === 0xad80 || (w & 0xfff0) === 0xa980) return result(2, 'from_emac')
  // (move ACCx to ACCy, 0xa110 under 0xf1fe, is always caught by a row above)
  if ((w & 0xf9b0) === 0xa180) return result(2, 'from_acc')
  if ((w & 0xf100) === 0xa000) {
    if (!(w & 0x30)) return result(4, 'mac', EMAC_OP)
    return m >= 2 && m <= 5 ? single(x, 'mac', 4, 1, EMAC_OP) : null
  }
  return null
}

// cmp, cmpa, eor.
function lineB(x: Word): Result {
  const { w, m, r } = x, o = w >> 6 & 7
  if (o <= 2) return m === 1 && o === 0 ? null : single(x, 'alu_ea_r', [1, 2, 4][o])
  if (o === 3 || o === 7) return single(x, 'alu_ea_r', o === 3 ? 2 : 4)
  if (o === 6) return m === 1 || m === 7 && r >= 2 ? null : single(x, 'alu_r_ea', 4)
  return null
}

// The MCF5441x has no FPU: the length only keeps a linear sweep in step.
function fpuLength(x: Word): number {
  const { w, m, r, read16 } = x
  if ((w & 0xff80) === 0xf280) return w & 0x40 ? 6 : 4
  const ea = (imm: number, p: number) => {
    try { return eaBytes(read16, m, r, imm, p) } catch (e) { if (x.v.fpuReadFailure === 'shorten') return -1; throw e }
  }
  if ((w & 0xff80) === 0xf300) { const n = ea(0, 2); return n < 0 ? 2 : 2 + n }
  const e = read16(2), sz = e & 0x8000 ? 4 : e & 0x4000 ? FP_SIZES[e >> 10 & 7] : 0
  if (sz && m === 7 && r === 4) return 4 + Math.max(sz, 2)
  if ((m || r) && e & 0xc000) { const n = ea(sz, 4); return n < 0 ? 4 : 4 + n }
  return 4
}

function lineF(x: Word): Result {
  const { w, read16 } = x
  if ((w & 0xff38) === 0xf428) return result(2, w & 0xc0 ? 'cpushl' : 'intouch', PRIV)
  if ((w & 0xffc0) === 0xfbc0) return read16(2) === 0x0003 ? single(x, 'wdebug', 4, 1, PRIV, false) : null
  if ((w & 0xff00) === 0xfb00) return single(x, 'wddata', [1, 2, 4][w >> 6 & 3], 0, 0, false)
  if (w >> 9 === 0x79) return result(fpuLength(x), 'fpu', FPU)
  return result(2, 'linef', LINEF)
}

function classify(x: Word): Result {
  switch (x.w >> 12) {
    case 0: return line0(x)
    case 1: case 2: case 3: return move(x)
    case 4: return line4(x)
    case 5: return line5(x)
    case 6: return branch(x)
    case 7: return x.w & 0x100 ? single(x, 'mvsz', x.w & 0x40 ? 2 : 1) : result(2, 'moveq')
    case 0xa: return lineA(x)
    case 0xb: return lineB(x)
    case 0xe: return (x.w & 0xd0) === 0x80 ? result(2, 'shift') : null
    case 0xf: return lineF(x)
    default: return arith(x)
  }
}

// Anything without an encoding, or whose extension word lies outside the image, is one illegal word
// (or an unimplemented line F word). If even the opword cannot be read, that error propagates.
function fallback(read16: Read16): Instruction {
  const w = read16(0)
  if (w >> 12 !== 0xf) return result(2, 'illegal', ILLEGAL)
  return result(2, 'linef', w >> 9 === 0x79 ? FPU : LINEF)
}

export function decode(v: Variant, read16: Read16, addr: number): Instruction {
  let ins: Result
  try {
    const w = read16(0)
    ins = classify({ w, m: w >> 3 & 7, r: w & 7, read16, addr, v })
  } catch (e) {
    if (!(e instanceof RangeError)) throw e
    ins = null
  }
  return ins ?? fallback(read16)
}

export function readerAt(data: Uint8Array, base: number): (addr: number) => Read16 {
  return addr => offset => {
    const i = addr - base + offset
    if (i < 0 || i + 1 >= data.length) throw new RangeError('read outside the image')
    return data[i] << 8 | data[i + 1]
  }
}

const hex8 = (x: number) => x.toString(16).padStart(8, '0')

// Whether [addr, addr + n) holds whole instructions, and whether linear sweeps started 32 to
// 30 + 2 * sweeps bytes earlier (stopping at the image's base) all land on addr.
export function wholeInstructions(v: Variant, image: Uint8Array, base: number, addr: number, n: number, sweeps = 32): { ok: boolean; note: string } {
  const at = readerAt(image, base)
  let pc = addr
  while (pc < addr + n) {
    const ins = decode(v, at(pc), pc)
    if (ins.flags & (ILLEGAL | LINEF | FPU)) return { ok: false, note: `0x${hex8(pc)} does not decode` }
    pc += ins.length
  }
  if (pc !== addr + n) return { ok: false, note: `ends mid-instruction (0x${hex8(pc)})` }
  let swept = 0, landed = 0
  for (let k = 16; k < 16 + sweeps; k++) {
    let pc = addr - 2 * k
    if (pc < base) break
    while (pc < addr) pc += decode(v, at(pc), pc).length
    swept++
    if (pc === addr) landed++
  }
  return landed === swept ? { ok: true, note: 'whole instructions' } : { ok: false, note: `only ${landed} of ${swept} sweeps land on the start` }
}
