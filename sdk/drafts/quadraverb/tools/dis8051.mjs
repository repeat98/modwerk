#!/usr/bin/env node
// A minimal 8051 disassembler, for reading controller firmware next to the emulator.
//   node dis8051.mjs <rom> <start hex> [<count>]
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';

const R = (n) => `R${n}`;
const T = new Array(256);
const set = (op, len, fmt) => { T[op] = [len, fmt]; };
// operand helpers: a=addr8 (direct), i=#imm8, r=rel, A16=addr16, b=bit, a11
for (let n = 0; n < 8; n++) {
  set(0x08 + n, 1, `INC ${R(n)}`); set(0x18 + n, 1, `DEC ${R(n)}`); set(0x28 + n, 1, `ADD A,${R(n)}`); set(0x38 + n, 1, `ADDC A,${R(n)}`);
  set(0x48 + n, 1, `ORL A,${R(n)}`); set(0x58 + n, 1, `ANL A,${R(n)}`); set(0x68 + n, 1, `XRL A,${R(n)}`); set(0x78 + n, 2, `MOV ${R(n)},#i`);
  set(0x88 + n, 2, `MOV d,${R(n)}`); set(0x98 + n, 1, `SUBB A,${R(n)}`); set(0xa8 + n, 2, `MOV ${R(n)},d`); set(0xb8 + n, 3, `CJNE ${R(n)},#i,r`);
  set(0xc8 + n, 1, `XCH A,${R(n)}`); set(0xd8 + n, 2, `DJNZ ${R(n)},r`); set(0xe8 + n, 1, `MOV A,${R(n)}`); set(0xf8 + n, 1, `MOV ${R(n)},A`);
}
for (let n = 0; n < 2; n++) {
  const r = `@R${n}`;
  set(0x06 + n, 1, `INC ${r}`); set(0x16 + n, 1, `DEC ${r}`); set(0x26 + n, 1, `ADD A,${r}`); set(0x36 + n, 1, `ADDC A,${r}`);
  set(0x46 + n, 1, `ORL A,${r}`); set(0x56 + n, 1, `ANL A,${r}`); set(0x66 + n, 1, `XRL A,${r}`); set(0x76 + n, 2, `MOV ${r},#i`);
  set(0x86 + n, 2, `MOV d,${r}`); set(0x96 + n, 1, `SUBB A,${r}`); set(0xa6 + n, 2, `MOV ${r},d`); set(0xb6 + n, 3, `CJNE ${r},#i,r`);
  set(0xc6 + n, 1, `XCH A,${r}`); set(0xd6 + n, 1, `XCHD A,${r}`); set(0xe6 + n, 1, `MOV A,${r}`); set(0xf6 + n, 1, `MOV ${r},A`);
  set(0xe2 + n, 1, `MOVX A,${r}`); set(0xf2 + n, 1, `MOVX ${r},A`);
}
for (let p = 0; p < 8; p++) { set(p * 0x20 + 0x01, 2, 'AJMP a11'); set(p * 0x20 + 0x11, 2, 'ACALL a11'); }
Object.entries({
  0x00: [1, 'NOP'], 0x02: [3, 'LJMP A16'], 0x03: [1, 'RR A'], 0x04: [1, 'INC A'], 0x05: [2, 'INC d'], 0x10: [3, 'JBC b,r'], 0x12: [3, 'LCALL A16'],
  0x13: [1, 'RRC A'], 0x14: [1, 'DEC A'], 0x15: [2, 'DEC d'], 0x20: [3, 'JB b,r'], 0x22: [1, 'RET'], 0x23: [1, 'RL A'], 0x24: [2, 'ADD A,#i'],
  0x25: [2, 'ADD A,d'], 0x30: [3, 'JNB b,r'], 0x32: [1, 'RETI'], 0x33: [1, 'RLC A'], 0x34: [2, 'ADDC A,#i'], 0x35: [2, 'ADDC A,d'],
  0x40: [2, 'JC r'], 0x42: [2, 'ORL d,A'], 0x43: [3, 'ORL d,#i'], 0x44: [2, 'ORL A,#i'], 0x45: [2, 'ORL A,d'], 0x50: [2, 'JNC r'],
  0x52: [2, 'ANL d,A'], 0x53: [3, 'ANL d,#i'], 0x54: [2, 'ANL A,#i'], 0x55: [2, 'ANL A,d'], 0x60: [2, 'JZ r'], 0x62: [2, 'XRL d,A'],
  0x63: [3, 'XRL d,#i'], 0x64: [2, 'XRL A,#i'], 0x65: [2, 'XRL A,d'], 0x70: [2, 'JNZ r'], 0x72: [2, 'ORL C,b'], 0x73: [1, 'JMP @A+DPTR'],
  0x74: [2, 'MOV A,#i'], 0x75: [3, 'MOV d,#i'], 0x80: [2, 'SJMP r'], 0x82: [2, 'ANL C,b'], 0x83: [1, 'MOVC A,@A+PC'], 0x84: [1, 'DIV AB'],
  0x85: [3, 'MOV dd,ds'], 0x90: [3, 'MOV DPTR,#I16'], 0x92: [2, 'MOV b,C'], 0x93: [1, 'MOVC A,@A+DPTR'], 0x94: [2, 'SUBB A,#i'],
  0x95: [2, 'SUBB A,d'], 0xa0: [2, 'ORL C,/b'], 0xa2: [2, 'MOV C,b'], 0xa3: [1, 'INC DPTR'], 0xa4: [1, 'MUL AB'], 0xb0: [2, 'ANL C,/b'],
  0xb2: [2, 'CPL b'], 0xb3: [1, 'CPL C'], 0xb4: [3, 'CJNE A,#i,r'], 0xb5: [3, 'CJNE A,d,r'], 0xc0: [2, 'PUSH d'], 0xc2: [2, 'CLR b'],
  0xc3: [1, 'CLR C'], 0xc4: [1, 'SWAP A'], 0xc5: [2, 'XCH A,d'], 0xd0: [2, 'POP d'], 0xd2: [2, 'SETB b'], 0xd3: [1, 'SETB C'],
  0xd4: [1, 'DA A'], 0xd5: [3, 'DJNZ d,r'], 0xe0: [1, 'MOVX A,@DPTR'], 0xe4: [1, 'CLR A'], 0xe5: [2, 'MOV A,d'], 0xf0: [1, 'MOVX @DPTR,A'],
  0xf4: [1, 'CPL A'], 0xf5: [2, 'MOV d,A'], 0xa5: [1, '???'],
}).forEach(([op, [l, f]]) => set(+op, l, f));

const SFR = { 0x80: 'P0', 0x81: 'SP', 0x82: 'DPL', 0x83: 'DPH', 0x87: 'PCON', 0x88: 'TCON', 0x89: 'TMOD', 0x8a: 'TL0', 0x8b: 'TL1', 0x8c: 'TH0', 0x8d: 'TH1',
  0x90: 'P1', 0x98: 'SCON', 0x99: 'SBUF', 0xa0: 'P2', 0xa8: 'IE', 0xb0: 'P3', 0xb8: 'IP', 0xd0: 'PSW', 0xe0: 'ACC', 0xf0: 'B' };
const dname = (d) => SFR[d] ?? `${d.toString(16).padStart(2, '0')}h`;
const bname = (b) => (b < 0x80 ? `${(0x20 + (b >> 3)).toString(16)}h.${b & 7}` : `${dname(b & 0xf8)}.${b & 7}`);

export function dis(code, pc) {
  const op = code[pc], [len, fmt] = T[op] ?? [1, `db ${op.toString(16)}`];
  const b1 = code[(pc + 1) & 0xffff], b2 = code[(pc + 2) & 0xffff];
  let s = fmt, k = 1;
  const next = () => code[(pc + k++) & 0xffff];
  s = s.replace(/A16|I16|a11|dd,ds|d|#i|r|b/g, (m) => {
    if (m === 'A16' || m === 'I16') { const v = (next() << 8) | next(); return v.toString(16).padStart(4, '0'); }
    if (m === 'a11') { const v = ((pc + 2) & 0xf800) | ((op & 0xe0) << 3) | next(); return v.toString(16).padStart(4, '0'); }
    if (m === 'dd,ds') { const src = next(), dst = next(); return `${dname(dst)},${dname(src)}`; }
    if (m === 'd') return dname(next());
    if (m === '#i') return '#' + next().toString(16).padStart(2, '0');
    if (m === 'b') return bname(next());
    if (m === 'r') { const rel = (next() << 24) >> 24; return ((pc + len + rel) & 0xffff).toString(16).padStart(4, '0'); }
    return m;
  });
  void b1; void b2;
  return [len, `${pc.toString(16).padStart(4, '0')}: ${[...Array(len)].map((_, i) => code[(pc + i) & 0xffff].toString(16).padStart(2, '0')).join(' ').padEnd(9)} ${s}`];
}

if (process.argv[1] && process.argv[1].endsWith('dis8051.mjs')) {
  const code = new Uint8Array(readFileSync(process.argv[2]));
  let pc = parseInt(process.argv[3], 16);
  const n = +(process.argv[4] ?? 40);
  for (let i = 0; i < n; i++) { const [len, line] = dis(code, pc); console.log(line); pc = (pc + len) & 0xffff; }
}
