#!/usr/bin/env node
// The Midiverb II's chorus and flange LFOs (programs 50-69), read by running its own 8031 firmware.
//   node mv2lfo.mjs <midiverb2-rom>
// The ROM never enters the repository; pass your own 32K dump (md5 below).
//
// The board as the firmware uses it (from the disassembly, ../RESEARCH-2026-11-26.md):
//   0xff01 address latch, 0xff00 data: the DSP's 256-byte program RAM (MOVX @R0/@R1, P2 = 0xff)
//   0xff02/0xff03 display and key strobes; keys: row A P1.0 low, row B P3.1 low, columns P1.1-7
//   internal RAM 0x23: the program; loader 0x4ce; program change: 0x23 = p, LCALL 0x49c, main loop 0x17c
//   patch routine 0x61f, once per LFO update: LFO1 in 0x56 (fraction) 0x57/0x58 (words),
//   LFO2 in 0x53, 0x54/0x55; op byte 0x52; per-program rates in 0x66/0x65
// Periods are counted in LFO updates. Seconds assume one update every 8 samples at 23,437.5 Hz
// (thement's cadence; it reproduces his periods, but what paces the loop is not read yet).
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { I8051 } from './i8051.mjs';

const MD5 = 'd503f74c239917b9888f247f979509ec';
const UPDATES_PER_S = 23437.5 / 8;

export function board(romPath) {
  const rom32 = new Uint8Array(readFileSync(romPath));
  const md5 = createHash('md5').update(rom32).digest('hex');
  if (md5 !== MD5) throw new Error(`${romPath}: not the Midiverb II ROM (md5 ${md5})`);
  const code = new Uint8Array(0x10000);
  code.set(rom32, 0);
  code.set(rom32, 0x8000);
  const dsp = new Uint8Array(256);
  let latch = 0;
  const cpu = new I8051(code, {
    xread: () => 0xff,
    xwrite: (a, v) => { if (a === 0xff01) latch = v; else if (a === 0xff00) dsp[latch] = v; },
    pin: () => 0xff,
  });
  const run = (cycles) => { const end = cpu.cycles + cycles; while (cpu.cycles < end) cpu.step(); };
  // Select a program the way the firmware does, from the top of its main loop.
  const select = (p) => {
    while (cpu.pc !== 0x17c) cpu.step();
    cpu.iram[0x23] = p;
    cpu.call(0x49c);
  };
  return { cpu, dsp, run, select };
}

// Range, period (in updates) and shape of one LFO's samples, skipping the start.
function describe(v) {
  const w = v.slice(2000);
  const lo = Math.min(...w), hi = Math.max(...w), mid = (lo + hi) / 2, ups = [];
  for (let t = 1; t < w.length; t++) if (w[t - 1] < mid && w[t] >= mid) ups.push(t);
  const period = ups.length > 1 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : NaN;
  const outer = w.filter((x) => x < lo + 0.1 * (hi - lo) || x > hi - 0.1 * (hi - lo)).length / w.length;
  return { lo, hi, period, shape: outer < 0.3 ? 'triangle' : 'sine' };
}

export function measure(romPath, program, updates = 40000) {
  const b = board(romPath), cpu = b.cpu;
  b.run(1_500_000);
  b.select(program);
  const l1 = [], l2 = [];
  while (l1.length < updates) {
    cpu.step();
    if (cpu.pc === 0x61f) {
      const i = cpu.iram;
      l1.push((i[0x58] * 65536 + i[0x57] * 256 + i[0x56]) / 256);
      l2.push((i[0x55] * 65536 + i[0x54] * 256 + i[0x53]) / 256);
    }
  }
  return { program, rates: [cpu.iram[0x66], cpu.iram[0x65]], op: cpu.iram[0x52], lfo: [describe(l1), describe(l2)] };
}

if (process.argv[1] && process.argv[1].endsWith('mv2lfo.mjs')) {
  const rom = process.argv[2];
  if (!rom) { console.error('usage: node mv2lfo.mjs <midiverb2-rom>'); process.exit(2); }
  const f = (x) => `${x.shape} ${x.lo.toFixed(0)}-${x.hi.toFixed(0)} words, ${isNaN(x.period) ? '?' : x.period.toFixed(0)} updates = ${isNaN(x.period) ? '?' : (x.period / UPDATES_PER_S).toFixed(2)} s`;
  for (let p = 50; p <= 69; p++) {
    const r = measure(rom, p);
    console.log(`${p}: rates ${r.rates.join('/')}, op ${r.op.toString(16)} | LFO1 ${f(r.lfo[0])} | LFO2 ${f(r.lfo[1])}`);
  }
}
