// A small 8051 core for running the Quadraverb's controller firmware on the developer's
// computer, so the generator can read the DSP programs the original code writes.
// External memory goes through the xread/xwrite hooks; ports P1 and P3 through pin().

const PSW = 0xd0, ACC = 0xe0, B = 0xf0, SP = 0x81, DPL = 0x82, DPH = 0x83;
const P0 = 0x80, P1 = 0x90, P2 = 0xa0, P3 = 0xb0, IE = 0xa8, IP = 0xb8;
const TCON = 0x88, TMOD = 0x89, TL0 = 0x8a, TL1 = 0x8b, TH0 = 0x8c, TH1 = 0x8d, SCON = 0x98;

// Machine cycles per opcode (1 unless listed).
const CYCLES = new Uint8Array(256).fill(1);
for (const op of [0x02, 0x10, 0x12, 0x20, 0x22, 0x30, 0x32, 0x40, 0x43, 0x50, 0x53, 0x60, 0x63, 0x70, 0x72, 0x73,
  0x75, 0x80, 0x82, 0x83, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x92, 0x93,
  0xa0, 0xa2, 0xa3, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf, 0xb0, 0xb4, 0xb5, 0xb6, 0xb7,
  0xb8, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xd0, 0xd5, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde,
  0xdf, 0xe0, 0xe2, 0xe3, 0xf0, 0xf2, 0xf3]) CYCLES[op] = 2;
for (let i = 0; i < 8; i++) { CYCLES[(i << 5) | 0x01] = 2; CYCLES[(i << 5) | 0x11] = 2; }
CYCLES[0x84] = 4; CYCLES[0xa4] = 4;

export class I8051 {
  constructor(code, { xread = () => 0xff, xwrite = () => {}, pin = () => 0xff } = {}) {
    this.code = code; this.xread = xread; this.xwrite = xwrite; this.pin = pin;
    this.iram = new Uint8Array(256); this.sfr = new Uint8Array(256);
    this.reset();
  }

  reset() {
    this.pc = 0; this.iram.fill(0); this.sfr.fill(0);
    this.sfr[SP] = 7; this.sfr[P0] = this.sfr[P1] = this.sfr[P2] = this.sfr[P3] = 0xff;
    this.cycles = 0; this.inIrq = []; this.serialIn = [];
  }

  // Direct addressing: below 0x80 internal RAM, above it the special function registers.
  rd(a) {
    if (a < 0x80) return this.iram[a];
    if (a === ACC) return this.sfr[ACC];
    if (a === P1 || a === P3) return this.sfr[a] & this.pin(a);
    if (a === 0x99) return this.sbufIn ?? 0;
    return this.sfr[a];
  }
  wr(a, v) {
    v &= 0xff;
    if (a < 0x80) this.iram[a] = v;
    else this.sfr[a] = v;
  }
  // Read-modify-write instructions read the port latch, not the pins.
  rdLatch(a) { return a < 0x80 ? this.iram[a] : this.sfr[a]; }

  get a() { return this.sfr[ACC]; }
  set a(v) { this.sfr[ACC] = v & 0xff; }
  get cy() { return this.sfr[PSW] >> 7; }
  set cy(v) { this.sfr[PSW] = (this.sfr[PSW] & 0x7f) | (v ? 0x80 : 0); }
  get dptr() { return (this.sfr[DPH] << 8) | this.sfr[DPL]; }
  set dptr(v) { this.sfr[DPH] = (v >> 8) & 0xff; this.sfr[DPL] = v & 0xff; }
  reg(n) { return ((this.sfr[PSW] >> 3) & 3) * 8 + n; }
  getR(n) { return this.iram[this.reg(n)]; }
  setR(n, v) { this.iram[this.reg(n)] = v & 0xff; }

  bitAddr(b) { return b < 0x80 ? [0x20 + (b >> 3), b & 7] : [b & 0xf8, b & 7]; }
  getBit(b) { const [a, i] = this.bitAddr(b); return (this.rd(a) >> i) & 1; }
  setBit(b, v) {
    const [a, i] = this.bitAddr(b);
    const old = this.rdLatch(a);
    this.wr(a, v ? old | (1 << i) : old & ~(1 << i));
  }

  fetch() { const v = this.code[this.pc]; this.pc = (this.pc + 1) & 0xffff; return v; }
  rel(r) { this.pc = (this.pc + ((r << 24) >> 24)) & 0xffff; }
  push(v) { this.sfr[SP] = (this.sfr[SP] + 1) & 0xff; this.iram[this.sfr[SP]] = v & 0xff; }
  pop() { const v = this.iram[this.sfr[SP]]; this.sfr[SP] = (this.sfr[SP] - 1) & 0xff; return v; }
  call(target) { this.push(this.pc & 0xff); this.push(this.pc >> 8); this.pc = target; }

  add(v, carry) {
    const a = this.a, c = carry ? this.cy : 0, r = a + v + c;
    let psw = this.sfr[PSW] & 0x3b;
    if (r > 0xff) psw |= 0x80;
    if ((a & 0xf) + (v & 0xf) + c > 0xf) psw |= 0x40;
    if (~(a ^ v) & (a ^ r) & 0x80) psw |= 0x04;
    this.sfr[PSW] = psw; this.a = r;
  }
  subb(v) {
    const a = this.a, c = this.cy, r = a - v - c;
    let psw = this.sfr[PSW] & 0x3b;
    if (r < 0) psw |= 0x80;
    if ((a & 0xf) - (v & 0xf) - c < 0) psw |= 0x40;
    if ((a ^ v) & (a ^ r) & 0x80) psw |= 0x04;
    this.sfr[PSW] = psw; this.a = r;
  }
  // Source operand of the low-nibble 4-f column: #imm, dir, @R0, @R1, R0-R7.
  src(op) {
    const lo = op & 0xf;
    if (lo === 4) return this.fetch();
    if (lo === 5) return this.rd(this.fetch());
    if (lo === 6 || lo === 7) return this.iram[this.getR(lo - 6)];
    return this.getR(lo - 8);
  }
  // Destination of INC/DEC/MOV-style column ops (lo 5-f): dir, @Ri, Rn.
  loc(op, latch = false) {
    const lo = op & 0xf;
    if (lo === 5) { const d = this.fetch(); return [() => (latch ? this.rdLatch(d) : this.rd(d)), (v) => this.wr(d, v)]; }
    if (lo === 6 || lo === 7) { const i = this.getR(lo - 6); return [() => this.iram[i], (v) => { this.iram[i] = v & 0xff; }]; }
    const n = lo - 8; return [() => this.getR(n), (v) => this.setR(n, v)];
  }

  interrupt(vector, level) { this.call(vector); this.inIrq.push(level); }

  // Pending interrupt sources, highest priority first (IP bit set), then natural order.
  checkIrq() {
    const ie = this.sfr[IE];
    if (!(ie & 0x80)) return;
    const tcon = this.sfr[TCON], scon = this.sfr[SCON], ip = this.sfr[IP];
    const sources = [
      [0x01, tcon & 0x02, 0x03, () => { if (tcon & 0x01) this.sfr[TCON] &= ~0x02; }],
      [0x02, tcon & 0x20, 0x0b, () => { this.sfr[TCON] &= ~0x20; }],
      [0x04, tcon & 0x08, 0x13, () => { if (tcon & 0x04) this.sfr[TCON] &= ~0x08; }],
      [0x08, tcon & 0x80, 0x1b, () => { this.sfr[TCON] &= ~0x80; }],
      [0x10, scon & 0x03, 0x23, () => {}],
    ];
    const cur = this.inIrq.length ? this.inIrq[this.inIrq.length - 1] : -1;
    for (const level of [1, 0]) {
      if (cur >= level) continue;
      for (const [bit, pending, vector, ack] of sources) {
        if ((ie & bit) && pending && ((ip & bit) ? 1 : 0) === level) { ack(); this.interrupt(vector, level); return; }
      }
    }
  }

  // Timer 0 and 1 in modes 1 (16-bit) and 2 (8-bit auto-reload), counting machine cycles.
  timers(n) {
    const tmod = this.sfr[TMOD], tcon = this.sfr[TCON];
    for (const [run, mode, lo, hi, flag] of [[0x10, tmod & 3, TL0, TH0, 0x20], [0x40, (tmod >> 4) & 3, TL1, TH1, 0x80]]) {
      if (!(tcon & run)) continue;
      if (mode === 1) {
        let v = (this.sfr[hi] << 8 | this.sfr[lo]) + n;
        if (v > 0xffff) { this.sfr[TCON] |= flag; v &= 0xffff; }
        this.sfr[hi] = v >> 8; this.sfr[lo] = v & 0xff;
      } else if (mode === 2) {
        let v = this.sfr[lo] + n;
        while (v > 0xff) { this.sfr[TCON] |= flag; v = v - 0x100 + this.sfr[hi]; }
        this.sfr[lo] = v;
      }
    }
  }

  // Serial input: one byte at a time, when the firmware has read the last one.
  serial() {
    const scon = this.sfr[SCON];
    if (this.serialIn.length && (scon & 0x10) && !(scon & 0x01) && this.cycles >= (this.nextSerial ?? 0)) {
      this.sbufIn = this.serialIn.shift(); this.sfr[SCON] |= 0x01; this.nextSerial = this.cycles + 320;
    }
  }

  step() {
    const start = this.cycles;
    const op = this.fetch();
    this.cycles += CYCLES[op];
    const hi = op >> 4, lo = op & 0xf;
    if ((op & 0x1f) === 0x01) { const l = this.fetch(); this.pc = (this.pc & 0xf800) | ((op >> 5) << 8) | l; }
    else if ((op & 0x1f) === 0x11) { const l = this.fetch(); this.call((this.pc & 0xf800) | ((op >> 5) << 8) | l); }
    else if (lo >= 4 && hi >= 2 && hi <= 6) {
      const v = this.src(op);
      if (hi === 2) this.add(v, false);
      else if (hi === 3) this.add(v, true);
      else if (hi === 4) this.a = this.a | v;
      else if (hi === 5) this.a = this.a & v;
      else this.a = this.a ^ v;
    } else if (lo >= 4 && hi === 9) this.subb(this.src(op));
    else if (lo >= 8 && hi === 0) this.setR(lo - 8, this.getR(lo - 8) + 1);
    else if (lo >= 8 && hi === 1) this.setR(lo - 8, this.getR(lo - 8) - 1);
    else if (lo >= 8 && hi === 7) this.setR(lo - 8, this.fetch());
    else if (lo >= 8 && hi === 8) this.wr(this.fetch(), this.getR(lo - 8));
    else if (lo >= 8 && hi === 0xa) this.setR(lo - 8, this.rd(this.fetch()));
    else if (lo >= 8 && hi === 0xb) { const imm = this.fetch(), r = this.fetch(), v = this.getR(lo - 8); this.cy = v < imm; if (v !== imm) this.rel(r); }
    else if (lo >= 8 && hi === 0xc) { const v = this.getR(lo - 8); this.setR(lo - 8, this.a); this.a = v; }
    else if (lo >= 8 && hi === 0xd) { const r = this.fetch(), v = (this.getR(lo - 8) - 1) & 0xff; this.setR(lo - 8, v); if (v) this.rel(r); }
    else if (lo >= 8 && hi === 0xe) this.a = this.getR(lo - 8);
    else if (lo >= 8 && hi === 0xf) this.setR(lo - 8, this.a);
    else this.misc(op);
    if (this.cycles - start) this.timers(this.cycles - start);
    this.serial();
    this.checkIrq();
  }

  misc(op) {
    switch (op) {
      case 0x00: break;
      case 0x02: { const h = this.fetch(), l = this.fetch(); this.pc = (h << 8) | l; break; }
      case 0x03: this.a = (this.a >> 1) | ((this.a & 1) << 7); break;
      case 0x04: this.a = this.a + 1; break;
      case 0x05: case 0x06: case 0x07: { const [g, s] = this.loc(op, true); s(g() + 1); break; }
      case 0x10: { const b = this.fetch(), r = this.fetch(); if (this.getBit(b)) { this.setBit(b, 0); this.rel(r); } break; }
      case 0x12: { const h = this.fetch(), l = this.fetch(); this.call((h << 8) | l); break; }
      case 0x13: { const c = this.cy; this.cy = this.a & 1; this.a = (this.a >> 1) | (c << 7); break; }
      case 0x14: this.a = this.a - 1; break;
      case 0x15: case 0x16: case 0x17: { const [g, s] = this.loc(op, true); s(g() - 1); break; }
      case 0x20: { const b = this.fetch(), r = this.fetch(); if (this.getBit(b)) this.rel(r); break; }
      case 0x22: { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; break; }
      case 0x23: this.a = (this.a << 1) | (this.a >> 7); break;
      case 0x30: { const b = this.fetch(), r = this.fetch(); if (!this.getBit(b)) this.rel(r); break; }
      case 0x32: { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; this.inIrq.pop(); break; }
      case 0x33: { const c = this.cy; this.cy = this.a >> 7; this.a = (this.a << 1) | c; break; }
      case 0x40: { const r = this.fetch(); if (this.cy) this.rel(r); break; }
      case 0x42: case 0x52: case 0x62: { const d = this.fetch(), v = this.rdLatch(d); this.wr(d, op === 0x42 ? v | this.a : op === 0x52 ? v & this.a : v ^ this.a); break; }
      case 0x43: case 0x53: case 0x63: { const d = this.fetch(), i = this.fetch(), v = this.rdLatch(d); this.wr(d, op === 0x43 ? v | i : op === 0x53 ? v & i : v ^ i); break; }
      case 0x50: { const r = this.fetch(); if (!this.cy) this.rel(r); break; }
      case 0x60: { const r = this.fetch(); if (!this.a) this.rel(r); break; }
      case 0x70: { const r = this.fetch(); if (this.a) this.rel(r); break; }
      case 0x72: this.cy = this.cy | this.getBit(this.fetch()); break;
      case 0x73: this.pc = (this.a + this.dptr) & 0xffff; break;
      case 0x74: this.a = this.fetch(); break;
      case 0x75: { const d = this.fetch(); this.wr(d, this.fetch()); break; }
      case 0x76: case 0x77: this.iram[this.getR(op - 0x76)] = this.fetch(); break;
      case 0x80: this.rel(this.fetch()); break;
      case 0x82: this.cy = this.cy & this.getBit(this.fetch()); break;
      case 0x83: this.a = this.code[(this.a + this.pc) & 0xffff]; break;
      case 0x84: { const a = this.a, b = this.sfr[B]; let psw = this.sfr[PSW] & 0x7b; if (!b) psw |= 0x04; else { this.a = (a / b) | 0; this.sfr[B] = a % b; } this.sfr[PSW] = psw; break; }
      case 0x85: { const s = this.fetch(), d = this.fetch(); this.wr(d, this.rd(s)); break; }
      case 0x86: case 0x87: { const v = this.iram[this.getR(op - 0x86)]; this.wr(this.fetch(), v); break; }
      case 0x90: { const h = this.fetch(), l = this.fetch(); this.dptr = (h << 8) | l; break; }
      case 0x92: this.setBit(this.fetch(), this.cy); break;
      case 0x93: this.a = this.code[(this.a + this.dptr) & 0xffff]; break;
      case 0xa0: this.cy = this.cy | (this.getBit(this.fetch()) ^ 1); break;
      case 0xa2: this.cy = this.getBit(this.fetch()); break;
      case 0xa3: this.dptr = (this.dptr + 1) & 0xffff; break;
      case 0xa4: { const r = this.a * this.sfr[B]; this.a = r; this.sfr[B] = r >> 8; this.sfr[PSW] = (this.sfr[PSW] & 0x7b) | (r > 0xff ? 0x04 : 0); break; }
      case 0xa6: case 0xa7: this.iram[this.getR(op - 0xa6)] = this.rd(this.fetch()); break;
      case 0xb0: this.cy = this.cy & (this.getBit(this.fetch()) ^ 1); break;
      case 0xb2: { const b = this.fetch(); const [a, i] = this.bitAddr(b); this.wr(a, this.rdLatch(a) ^ (1 << i)); break; }
      case 0xb3: this.cy = this.cy ^ 1; break;
      case 0xb4: case 0xb5: { const v = op === 0xb4 ? this.fetch() : this.rd(this.fetch()), r = this.fetch(); this.cy = this.a < v; if (this.a !== v) this.rel(r); break; }
      case 0xb6: case 0xb7: { const v = this.iram[this.getR(op - 0xb6)], i = this.fetch(), r = this.fetch(); this.cy = v < i; if (v !== i) this.rel(r); break; }
      case 0xc0: this.push(this.rd(this.fetch())); break;
      case 0xc2: this.setBit(this.fetch(), 0); break;
      case 0xc3: this.cy = 0; break;
      case 0xc4: this.a = (this.a << 4) | (this.a >> 4); break;
      case 0xc5: case 0xc6: case 0xc7: { const [g, s] = this.loc(op); const v = g(); s(this.a); this.a = v; break; }
      case 0xd0: this.wr(this.fetch(), this.pop()); break;
      case 0xd2: this.setBit(this.fetch(), 1); break;
      case 0xd3: this.cy = 1; break;
      case 0xd4: {
        let a = this.a, c = this.cy;
        if ((a & 0xf) > 9 || (this.sfr[PSW] & 0x40)) { a += 6; if (a > 0xff) c = 1; }
        if ((a >> 4) > 9 || c) { a += 0x60; if (a > 0xff) c = 1; }
        this.a = a; this.cy = c; break;
      }
      case 0xd5: { const d = this.fetch(), r = this.fetch(), v = (this.rdLatch(d) - 1) & 0xff; this.wr(d, v); if (v) this.rel(r); break; }
      case 0xd6: case 0xd7: { const i = this.getR(op - 0xd6), v = this.iram[i]; this.iram[i] = (v & 0xf0) | (this.a & 0xf); this.a = (this.a & 0xf0) | (v & 0xf); break; }
      case 0xe0: this.a = this.xread(this.dptr); break;
      case 0xe2: case 0xe3: this.a = this.xread((this.sfr[P2] << 8) | this.getR(op - 0xe2)); break;
      case 0xe4: this.a = 0; break;
      case 0xe5: this.a = this.rd(this.fetch()); break;
      case 0xe6: case 0xe7: this.a = this.iram[this.getR(op - 0xe6)]; break;
      case 0xf0: this.xwrite(this.dptr, this.a); break;
      case 0xf2: case 0xf3: this.xwrite((this.sfr[P2] << 8) | this.getR(op - 0xf2), this.a); break;
      case 0xf4: this.a = ~this.a; break;
      case 0xf5: this.wr(this.fetch(), this.a); break;
      case 0xf6: case 0xf7: this.iram[this.getR(op - 0xf6)] = this.a; break;
      default: throw new Error(`8051: opcode 0x${op.toString(16)} at 0x${((this.pc - 1) & 0xffff).toString(16)}`);
    }
  }
}

// The parity flag follows A after every instruction that reads it; computed on demand.
Object.defineProperty(I8051.prototype, 'psw', {
  get() { let a = this.sfr[ACC], p = 0; while (a) { p ^= a & 1; a >>= 1; } return (this.sfr[PSW] & 0xfe) | p; },
});
