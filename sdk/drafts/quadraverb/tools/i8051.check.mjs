#!/usr/bin/env node
// Self-check of the 8051 core on a few hand-assembled instructions: node i8051.check.mjs
import assert from 'node:assert/strict';
import console from 'node:console';
import { I8051 } from './i8051.mjs';

const run = (bytes, steps, xram = new Uint8Array(0x10000)) => {
  const code = new Uint8Array(0x10000); code.set(bytes);
  const cpu = new I8051(code, { xread: (a) => xram[a], xwrite: (a, v) => { xram[a] = v; } });
  for (let i = 0; i < steps; i++) cpu.step();
  return cpu;
};

// mov a,#0xf0; add a,#0x20 -> 0x10 with carry; addc a,#0 -> 0x11
let c = run([0x74, 0xf0, 0x24, 0x20, 0x34, 0x00], 3);
assert.equal(c.a, 0x11); assert.equal(c.cy, 0);
// mov a,#0x05; clr c; subb a,#0x07 -> 0xfe with borrow
c = run([0x74, 0x05, 0xc3, 0x94, 0x07], 3);
assert.equal(c.a, 0xfe); assert.equal(c.cy, 1);
// mov a,#200; mov b,#3; mul ab -> 600 = 0x0258
c = run([0x74, 200, 0x75, 0xf0, 3, 0xa4], 3);
assert.equal(c.a, 0x58); assert.equal(c.sfr[0xf0], 0x02);
// mov a,#100; mov b,#7; div ab -> 14 r 2
c = run([0x74, 100, 0x75, 0xf0, 7, 0x84], 3);
assert.equal(c.a, 14); assert.equal(c.sfr[0xf0], 2);
// mov r2,#3; inc a; djnz r2,-3: a counts the loop
c = run([0x7a, 0x03, 0x04, 0xda, 0xfd], 1 + 2 * 3);
assert.equal(c.a, 3); assert.equal(c.getR(2), 0);
// mov dptr,#0x1234; mov a,#0x5a; movx @dptr,a; clr a; movx a,@dptr
c = run([0x90, 0x12, 0x34, 0x74, 0x5a, 0xf0, 0xe4, 0xe0], 5);
assert.equal(c.a, 0x5a);
// mov dptr,#table; mov a,#1; movc a,@a+dptr (table at 0x10 = 7, 9)
const code = [0x90, 0x00, 0x10, 0x74, 0x01, 0x93]; code[0x10] = 7; code[0x11] = 9;
c = run(code, 3);
assert.equal(c.a, 9);
// lcall 0x0010; (at 0x10) mov a,#0x42; ret
const call = [0x12, 0x00, 0x10]; call[0x10] = 0x74; call[0x11] = 0x42; call[0x12] = 0x22;
c = run(call, 3);
assert.equal(c.a, 0x42); assert.equal(c.pc, 3); assert.equal(c.sfr[0x81], 7);
// setb 0x20.3 (bit 0x03); jb 0x03,+2 skips mov a,#1
c = run([0xd2, 0x03, 0x20, 0x03, 0x02, 0x74, 0x01, 0x74, 0x02], 3);
assert.equal(c.a, 0x02); assert.equal(c.iram[0x20], 0x08);

console.log('i8051: all checks pass');
