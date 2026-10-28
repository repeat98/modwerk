# SPDX-License-Identifier: GPL-3.0-or-later
"""ColdFire (ISA_C with EMAC) instruction classifier: Modwerk's own implementation.

Gives an instruction's length, an op class, flags and control flow with its static target, from the opword and the
extension words it needs, following the encodings of the ColdFire Family Programmer's Reference Manual. It is not a
disassembler. A word that is no ColdFire instruction decodes as a 2-byte 'illegal' (or 'linef' in line F), so a
linear sweep always moves on.
"""
from typing import NamedTuple, Optional

FPU, LINEF, ILLEGAL, PRIV, MOVEC, EMAC_OP, PCREL = 1, 2, 4, 8, 16, 32, 64
F_NONE, F_BCC, F_BRA, F_BSR, F_JMP, F_JSR, F_RTS, F_RTE, F_TRAP = range(9)

_FPU_SIZE = (4, 4, 12, 12, 2, 8, 1, 12)  # operand bytes by the FPU source format field: L S X P W D B X
_SIZE = (1, 2, 4)


class Insn(NamedTuple):
    length: int
    op: str
    flow: int = F_NONE
    target: Optional[int] = None
    flags: int = 0


class _Refused(Exception):
    """The word is not a ColdFire instruction."""


def _signed16(v):
    return v - 0x10000 if v & 0x8000 else v


def _ea(read16, mode, reg, imm, p):
    """(extension bytes, flags) of the effective address mode/reg whose extension starts at offset p.

    imm is the operand size when an immediate source is allowed, else None.
    """
    if mode < 5:
        return 0, 0
    if mode == 5:
        return 2, 0
    if mode == 6 or (mode == 7 and reg == 3):
        if read16(p) & 0x0100:
            raise _Refused  # a full extension word: 68020 only
        return 2, PCREL if mode == 7 else 0
    if reg == 0:
        return 2, 0
    if reg == 1:
        return 4, 0
    if reg == 2:
        return 2, PCREL
    if reg == 4 and imm is not None:
        return 4 if imm == 4 else 2, 0
    raise _Refused


def _single(read16, w, op, size, k=0, flags=0, imm=True, flow=F_NONE):
    """An instruction with its EA in the low six bits after k extension words of its own."""
    p = 2 + 2 * k
    n, f = _ea(read16, w >> 3 & 7, w & 7, size if imm else None, p)
    return Insn(p + n, op, flow, None, flags | f)


def _line0(read16, w, m, r):
    low = w & 0xFFF8
    if low in (0x0080, 0x0280, 0x0480, 0x0680, 0x0A80):
        return Insn(6, 'alu_imm')
    if low == 0x0C80:
        return Insn(6, 'cmpi')
    if low in (0x0C00, 0x0C40):
        return Insn(4, 'cmpi')
    if low in (0x00C0, 0x02C0, 0x04C0):
        return Insn(2, ('bitrev', 'byterev', 'ff1')[w >> 9 & 3])
    if w & 0xF100 == 0x0100:
        if m == 1:
            raise _Refused
        t = w >> 6 & 3
        return _single(read16, w, 'bchg' if t else 'btst', 4 if m == 0 else 1, imm=t == 0)
    if w & 0xFF00 == 0x0800:
        if m == 1 or (m == 7 and r >= 2):
            raise _Refused
        return _single(read16, w, 'bchgi' if w >> 6 & 3 else 'btsti', 4 if m == 0 else 1, k=1)
    raise _Refused


def _move(read16, w, m, r):
    size = (0, 1, 4, 2)[w >> 12]
    dm, dr = w >> 6 & 7, w >> 9 & 7
    if (dm == 1 and size == 1) or (dm == 7 and dr >= 2):
        raise _Refused
    sx, sf = _ea(read16, m, r, size, 2)
    dx, df = _ea(read16, dm, dr, None, 2 + sx)
    return Insn(2 + sx + dx, 'movea' if dm == 1 else 'move', F_NONE, None, sf | df)


def _control(m, r):
    """Refuse the modes a control EA (lea, pea, jmp, jsr) cannot take."""
    if m in (0, 1, 3, 4) or (m == 7 and r == 4):
        raise _Refused


def _line4(read16, w, m, r, addr):
    hi, low = w & 0xFFC0, w & 0xFFF8
    if w & 0xF1C0 == 0x41C0:
        _control(m, r)
        return _single(read16, w, 'lea', 4, imm=False)
    if w == 0x40E7:
        if read16(2) != 0x46FC:
            raise _Refused
        read16(4)
        return Insn(6, 'stldsr', flags=PRIV)
    if low == 0x4080:
        return Insn(2, 'negx')
    if low == 0x40C0:
        return Insn(2, 'move_from_sr', flags=PRIV)
    if hi in (0x4200, 0x4240, 0x4280):
        if m == 1:
            raise _Refused
        return _single(read16, w, 'clr', _SIZE[w >> 6 & 3], imm=False)
    if low == 0x42C0:
        return Insn(2, 'move_from_ccr')
    if low == 0x4480:
        return Insn(2, 'neg')
    if hi in (0x44C0, 0x46C0):
        if not (m == 0 or (m == 7 and r == 4)):
            raise _Refused
        if hi == 0x44C0:
            return _single(read16, w, 'move_to_ccr', 2)
        if m:
            read16(2)
        return _single(read16, w, 'move_to_sr', 2, flags=PRIV)
    if low == 0x4680:
        return Insn(2, 'not')
    if low == 0x4840:
        return Insn(2, 'swap')
    if hi == 0x4840:
        _control(m, r)
        return _single(read16, w, 'pea', 4, imm=False)
    if low in (0x4880, 0x48C0):
        return Insn(2, 'ext')
    if hi in (0x48C0, 0x4CC0):
        if m not in (2, 5):
            raise _Refused
        read16(2)  # the register mask
        return _single(read16, w, 'movem', 4, k=1)
    if low == 0x49C0:
        return Insn(2, 'extb')
    if w == 0x4AC8:
        return Insn(2, 'halt', flags=PRIV)
    if w == 0x4ACC:
        return Insn(2, 'pulse')
    if w == 0x4AFC:
        return Insn(2, 'illegal', flags=ILLEGAL)
    if hi in (0x4A00, 0x4A40, 0x4A80):
        return _single(read16, w, 'tst', _SIZE[w >> 6 & 3])
    if hi == 0x4AC0:
        if m <= 1 or (m == 7 and r >= 2):
            raise _Refused
        return _single(read16, w, 'tas', 1)
    if hi in (0x4C00, 0x4C40):
        div = hi == 0x4C40
        if m in (1, 6) or (m == 7 and r in ((0, 1, 3, 4) if div else (0, 1, 3))):
            raise _Refused
        read16(2)  # the register word
        return _single(read16, w, 'div_l' if div else 'mul_l', 4, k=1)
    if low == 0x4C80:
        return Insn(2, 'sats')
    if w & 0xFFF0 == 0x4E40:
        return Insn(2, 'trap', F_TRAP)
    if low == 0x4E50:
        return Insn(4, 'link')
    if low == 0x4E58:
        return Insn(2, 'unlk')
    if low in (0x4E60, 0x4E68):
        return Insn(2, 'move_usp', flags=PRIV)
    if w == 0x4E71:
        return Insn(2, 'nop')
    if w == 0x4E72:
        read16(2)
        return Insn(4, 'stop', flags=PRIV)
    if w == 0x4E73:
        return Insn(2, 'rte', F_RTE, flags=PRIV)
    if w == 0x4E75:
        return Insn(2, 'rts', F_RTS)
    if w in (0x4E7A, 0x4E7B):
        read16(2)
        return Insn(4, 'movec', flags=PRIV | MOVEC)
    if hi in (0x4E80, 0x4EC0):
        _control(m, r)
        jsr = hi == 0x4E80
        ins = _single(read16, w, 'jsr' if jsr else 'jmp', 4, imm=False, flow=F_JSR if jsr else F_JMP)
        if m == 7 and r == 0:
            return ins._replace(target=_signed16(read16(2)) & 0xFFFFFFFF)
        if m == 7 and r == 1:
            return ins._replace(target=read16(2) << 16 | read16(4))
        if m == 7 and r == 2:
            return ins._replace(target=(addr + 2 + _signed16(read16(2))) & 0xFFFFFFFF)
        return ins
    raise _Refused


def _line5(read16, w, m, r):
    if w in (0x51FA, 0x51FB, 0x51FC):
        return Insn((4, 6, 2)[w - 0x51FA], 'tpf')
    if w & 0xF1C0 in (0x5080, 0x5180):
        if m == 7 and r >= 2:
            raise _Refused
        return _single(read16, w, 'addq', 4)
    if w & 0xF0F8 == 0x50C0:
        return Insn(2, 'scc')
    raise _Refused


def _branch(read16, w, addr):
    d = w & 0xFF
    if d == 0:
        disp, length = _signed16(read16(2)), 4
    elif d == 0xFF:
        disp, length = read16(2) << 16 | read16(4), 6
        disp -= (disp & 0x80000000) << 1
    else:
        disp, length = d - 256 if d & 0x80 else d, 2
    c = w >> 8 & 15
    op, flow = ('bra', F_BRA) if c == 0 else ('bsr', F_BSR) if c == 1 else ('bcc', F_BCC)
    return Insn(length, op, flow, (addr + 2 + disp) & 0xFFFFFFFF)


def _arith(read16, w, m, r, line):
    """Lines 8, 9, C and D: or/sub/and/add, their address and extended forms, the word multiply and divide."""
    o = w >> 6 & 7
    adds = line in (9, 0xD)
    if o == 2:
        if m == 1 and not adds:
            raise _Refused
        return _single(read16, w, 'alu_ea_r', 4)
    if o == 6:
        if adds and m == 0:
            return Insn(2, 'addx')
        if m <= 1 or (m == 7 and r >= 2):
            raise _Refused
        return _single(read16, w, 'alu_r_ea', 4)
    if o == 7 and adds:
        return _single(read16, w, 'alu_ea_r', 4)
    if o in (3, 7) and not adds:
        if m == 1:
            raise _Refused
        return _single(read16, w, 'div_w' if line == 8 else 'mul_w', 2)
    raise _Refused


def _lineA(read16, w, m, r):
    """EMAC and mov3q; the patterns overlap, so the order matters."""
    hi = w & 0xFFC0
    if w & 0xF1C0 == 0xA140:
        if m == 7 and r >= 2:
            raise _Refused
        return _single(read16, w, 'mov3q', 4)
    if hi == 0xAD00:
        return _single(read16, w, 'to_mask', 4)
    if w & 0xFBC0 == 0xAB00:
        return _single(read16, w, 'to_accext', 4)
    if hi == 0xA900:
        return _single(read16, w, 'to_macsr', 4)
    if w & 0xF9C0 == 0xA100:
        return _single(read16, w, 'to_acc', 4, flags=EMAC_OP)
    if w == 0xA9C0:
        return Insn(2, 'macsr_ccr')
    if w & 0xFBF0 == 0xAB80 or w & 0xFFF0 in (0xAD80, 0xA980):
        return Insn(2, 'from_emac')
    # (the accumulator-to-accumulator move, w & 0xF1FE == 0xA110, is caught by the rows above)
    if w & 0xF9B0 == 0xA180:
        return Insn(2, 'from_acc')
    if w & 0xF100 == 0xA000:
        if not w & 0x30:
            return Insn(4, 'mac', flags=EMAC_OP)
        if m not in (2, 3, 4, 5):
            raise _Refused
        return _single(read16, w, 'mac', 4, k=1, flags=EMAC_OP)
    raise _Refused


def _lineB(read16, w, m, r):
    o = w >> 6 & 7
    if o <= 2:
        if m == 1 and o == 0:
            raise _Refused
        return _single(read16, w, 'alu_ea_r', _SIZE[o])
    if o in (3, 7):
        return _single(read16, w, 'alu_ea_r', 2 if o == 3 else 4)
    if o == 6:
        if m == 1 or (m == 7 and r >= 2):
            raise _Refused
        return _single(read16, w, 'alu_r_ea', 4)
    raise _Refused


def _fpu_length(read16, w, m, r):
    """Only keeps a linear sweep in step: the MCF5441x has no FPU."""
    if w & 0xFF80 == 0xF280:
        return 6 if w & 0x40 else 4  # FBcc
    if w & 0xFF80 == 0xF300:
        try:
            return 2 + _ea(read16, m, r, None, 2)[0]  # FSAVE, FRESTORE
        except _Refused:
            return 2
    e = read16(2)
    size = _FPU_SIZE[e >> 10 & 7] if e & 0x4000 else 0
    if e & 0x8000:
        size = 4
    if size and m == 7 and r == 4:
        return 4 + max(size, 2)
    if (m or r) and e & 0xC000:
        try:
            return 4 + _ea(read16, m, r, size or 4, 4)[0]
        except _Refused:
            return 4
    return 4


def _lineF(read16, w, m, r):
    if w & 0xFF38 == 0xF428:
        return Insn(2, 'cpushl' if w >> 6 & 3 else 'intouch', flags=PRIV)
    if w & 0xFFC0 == 0xFBC0:
        if read16(2) != 0x0003:
            raise _Refused
        return _single(read16, w, 'wdebug', 4, k=1, flags=PRIV, imm=False)
    if w & 0xFF00 == 0xFB00:
        return _single(read16, w, 'wddata', _SIZE[w >> 6 & 3], imm=False)
    if 0xF200 <= w < 0xF400:
        return Insn(_fpu_length(read16, w, m, r), 'fpu', flags=FPU)
    return Insn(2, 'linef', flags=LINEF)


def decode(read16, addr=0):
    """Decode the instruction whose words read16(0), read16(2), ... returns; addr is its address, for targets."""
    try:
        w = read16(0)
        line, m, r = w >> 12, w >> 3 & 7, w & 7
        if line == 0:
            return _line0(read16, w, m, r)
        if line <= 3:
            return _move(read16, w, m, r)
        if line == 4:
            return _line4(read16, w, m, r, addr)
        if line == 5:
            return _line5(read16, w, m, r)
        if line == 6:
            return _branch(read16, w, addr)
        if line == 7:
            if w & 0x100:
                return _single(read16, w, 'mvsz', 1 if w >> 6 & 1 == 0 else 2)
            return Insn(2, 'moveq')
        if line in (8, 9, 0xC, 0xD):
            return _arith(read16, w, m, r, line)
        if line == 0xA:
            return _lineA(read16, w, m, r)
        if line == 0xB:
            return _lineB(read16, w, m, r)
        if line == 0xE:
            if w & 0xD0 == 0x80:
                return Insn(2, 'shift')
            raise _Refused
        return _lineF(read16, w, m, r)
    except (_Refused, IndexError):
        w = read16(0)
        if w >> 12 == 0xF:
            return Insn(2, 'linef', flags=FPU if 0xF200 <= w < 0xF400 else LINEF)
        return Insn(2, 'illegal', flags=ILLEGAL)


def reader(data, base=0):
    """addr -> read16 over data loaded at base: read16(offset) is the big-endian word at addr + offset."""
    def at(addr):
        def read16(offset):
            i = addr - base + offset
            return data[i] << 8 | data[i + 1]
        return read16
    return at


def disassemble_lengths(data, base, start, end):
    """Yield (addr, Insn) linearly from start while addr < end."""
    at = reader(data, base)
    pc = start
    while pc < end:
        ins = decode(at(pc), pc)
        yield pc, ins
        pc += ins.length
