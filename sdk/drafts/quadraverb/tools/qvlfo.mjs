#!/usr/bin/env node
// The Quadraverb's moving parts as parameters: swept delays, pitch shift, Leslie and VERB SHIFTER.
// Read by running its own firmware, then checked: a reconstruction from the parameters must give
// the same DSP program, byte for byte, as the firmware writes, tick after tick.
//   node qvlfo.mjs <rom> [program ...] [--seconds 10]
// The ROM never enters the repository. Where the firmware looks a curve up in a table (the pitch
// crossfade, the Leslie's depth against speed, VERB SHIFTER's two sweeps), this tool reads it from
// the ROM you pass, at run time, and also reports how close a simple formula comes.
//
// What the firmware does (QV 1.07, read from the disassembly; ../FIRMWARE.md, "Modulation"):
//   Timer 0 (16-bit mode, reloaded to 0xff06 at its vector 0x000b) interrupts every 250 machine cycles
//   plus the response time. Unless bit 2ah.0 is set (the main loop sets it while it rebuilds the DSP
//   program), the interrupt writes 1 to bytes 0x17f and 0x180 and jumps through internal RAM 0x60/0x61
//   to one handler per configuration. One run of a handler is a "tick" here.
//   Leslie and VERB SHIFTER reload the timer at their end (0xff80, 0xff64), so their ticks are longer.
// The gate and the triggered sweeps are not in the interrupt: the main loop runs them every 16 ticks
// from a 1-bit signal detector on the 8051's P3.2 pin, which the emulator holds high ("no signal").
// This tool applies the main loop's writes from the trace and prints each program's gate settings;
// ../FIRMWARE.md ("The gate") has the algorithm.
// Seconds are an assumption: a 12 MHz crystal (the MIDI baud rate needs it: timer 1 reload 0xff,
// SMOD 0), 1 us a machine cycle, the emulator's cycles per tick plus the 8051's 3-cycle interrupt
// response, and the DSP at 42 samples a millisecond (the firmware's own conversion of delay times).
import console from 'node:console';
import process from 'node:process';
import { Board, DSP_BYTES } from './machine.mjs';

const DISPATCH = 0x0643;            // JMP @A+DPTR to the handler
export const ASSUMED_RESPONSE = 3;  // machine cycles from timer overflow to the vector, which the emulator does not count
const SAMPLES_PER_MS = 42;          // the firmware's own figure

// ---- the LFO kinds --------------------------------------------------------------------------

// Triangle phase 0..0xffff, 8-bit rate on the low byte, reflected at both ends; flag H flips at the
// top, so H and the phase together make one cycle of four sweeps.
function stepTriangle8(s, r) {
  let h = s.P >> 8, l = s.P & 0xff;
  if (!s.D) {
    l += r;
    if (l > 0xff) {
      l &= 0xff; h = (h + 1) & 0xff;
      if (h === 0) { s.D = 1; s.H ^= 1; h = 0xff; l = (-l) & 0xff; if (l === 0) l = 0xff; }
    }
  } else {
    l -= r;
    if (l < 0) {
      l &= 0xff; h = (h - 1) & 0xff;
      if (h === 0xff) { s.D = 0; h = 0; l = (-l) & 0xff; if (l === 0) h = 1; }
    }
  }
  s.P = (h << 8) | l;
}

// Leslie rotors: a 16-bit rate; reflection is 0xffff - P at both ends; H flips at the top, B at the bottom.
function stepTriangle16(s, R) {
  if (!s.D) {
    let P = s.P + R;
    if (P > 0xffff) { s.D = 1; s.H ^= 1; P = 0xffff - (P & 0xffff); }
    s.P = P;
  } else {
    let P = s.P - R;
    if (P < 0) { s.D = 0; s.B ^= 1; P = 0xffff - (P & 0xffff); }
    s.P = P;
  }
}

// VERB SHIFTER: 8-bit rate, reflection to -P (two's complement) at both ends, H flips at the bottom.
function stepTriangleVS(s, r) {
  if (!s.D) {
    let P = s.P + r;
    if (P > 0xffff) { P = (-P) & 0xffff; s.D = 1; if (P === 0) P = 0xffff; }
    s.P = P;
  } else {
    let P = s.P - r;
    if (P < 0) { P = (-P) & 0xffff; s.D = 0; s.H ^= 1; }
    s.P = P;
  }
}

// The swept shape, 0..0xffff, largest at P = 0: "parabolic" is 1 - p^2 (p = P/65536, as the firmware
// squares it in 8-bit pieces), "triangle" is 1 - p.
function shape(P, parabolic) {
  if (!parabolic) return 0xffff - P;
  const h = P >> 8, l = P & 0xff;
  return 0xffff - ((h * h + ((2 * h * l + ((l * l) >> 8)) >> 8)) & 0xffff);
}

// Displacement in 1/256 sample: shape times depth (depth = the peak in samples).
const displacement = (X, depth) => Math.floor((X * depth) / 256) & 0xffff;

// One interpolated tap pair: the near step reads centre +- n with weight 255 - f, the far step one
// sample further out with weight f. Sign +1 moves out above the centre, -1 below.
function pairWrites(w, near, far, centre, sign, disp) {
  const n = disp >> 8, f = disp & 0xff;
  const a = (centre + sign * n) & 0xffff, b = (a + sign) & 0xffff;
  w.push([near * 4, a & 0xff], [near * 4 + 1, a >> 8], [near * 4 + 2, 255 - f]);
  w.push([far * 4, b & 0xff], [far * 4 + 1, b >> 8], [far * 4 + 2, f]);
}

// Swept-tap layouts by handler. 'first' keeps the first step as the near one; 'lower' makes the near
// one the lower-numbered step when the sweep goes up and the higher one when it goes down.
const SWEEPS = {
  0x0e04: { name: 'reverb', pairs: (ptr) => [{ steps: [ptr >> 2, (ptr >> 2) + 1], offset: 0, sign: 1, near: 'first' }] },
  0x0bb0: { name: 'stereo', pairs: () => [{ steps: [0x13, 0x14], offset: 0, sign: 1, near: 'lower' }, { steps: [0x17, 0x18], offset: 0x200, sign: -1, near: 'lower' }] },
  0x0a3e: { name: 'stereo', pairs: () => [{ steps: [0x28, 0x29], offset: 0, sign: 1, near: 'lower' }, { steps: [0x2c, 0x2d], offset: 0x200, sign: -1, near: 'lower' }] },
};

function sweepModel(target, iram) {
  const lay = SWEEPS[target];
  const par = {
    kind: 'sweep', layout: lay.name, rate: iram[0x65], depth: iram[0x64], centre: (iram[0x62] << 8) | iram[0x63],
    parabolic: !((iram[0x29] >> 7) & 1), pairs: lay.pairs((iram[0x55] << 8) | iram[0x56]),
  };
  const st = { P: (iram[0x66] << 8) | iram[0x67], D: (iram[0x29] >> 5) & 1, H: (iram[0x29] >> 6) & 1 };
  return {
    par, st,
    periodTicks: (4 * 65536) / par.rate,
    tick(w) {
      stepTriangle8(st, par.rate);
      const disp = displacement(shape(st.P, par.parabolic), par.depth);
      const sgn = st.H ? -1 : 1;
      for (const p of par.pairs) {
        const s = sgn * p.sign, [lo, hi] = p.steps;
        const [near, far] = p.near === 'first' || s > 0 ? [lo, hi] : [hi, lo];
        pairWrites(w, near, far, (par.centre + p.offset) & 0xffff, s, disp);
      }
      w.push([0x17f, 1]);
    },
  };
}

// Pitch shift: a 16-bit saw (rate signed); its high byte is the tap in the 256-sample window at 0x1800,
// the second tap sits half a window away, both interpolated by the low byte (steps 0x16 and 0x1a),
// crossfaded by steps 0x1b and 0x1c from a quarter-sine curve indexed by the distance from mid-window.
function pitchModel(iram, fade) {
  const R = (iram[0x5d] << 8) | iram[0x65];
  const par = { kind: 'pitch', rate: R >= 0x8000 ? R - 0x10000 : R, window: 0x1800 };
  const st = { P: (iram[0x66] << 8) | iram[0x67] };
  return {
    par, st,
    periodTicks: 65536 / Math.abs(par.rate || 1),
    tick(w) {
      st.P = (st.P + R) & 0xffff;
      const h = st.P >> 8, l = st.P & 0xff;
      const idx = (((h & 0x80) ? h : 0xff - h) << 1) & 0xff;
      w.push([0x1b * 4 + 2, fade(idx)], [0x1c * 4 + 2, fade(0xff - idx)]);
      const h2 = h ^ 0x80, h2p = h2 + 1, h1p = (h2p & 0xff) ^ 0x80;
      w.push([0x14 * 4, h], [0x18 * 4, h2], [0x19 * 4, h2p & 0xff], [0x15 * 4, h1p]);
      // the high bytes: one sample past the window's end counts into the next page, with a quirk:
      // the firmware tests the second tap's low byte for 0xff where 0x00 would be the wrap
      if (h2p > 0xff) w.push([0x15 * 4 + 1, 0x18], [0x19 * 4 + 1, 0x19]);
      else if (h1p === 0xff) w.push([0x15 * 4 + 1, 0x19], [0x19 * 4 + 1, 0x18]);
      else w.push([0x15 * 4 + 1, 0x18], [0x19 * 4 + 1, 0x18]);
      w.push([0x16 * 4 + 2, l], [0x1a * 4 + 2, l]);
    },
  };
}

// Leslie: two rotors, each a 16-bit triangle swept as 1 - p^2 into an interpolated pair (around 0x1900
// and 0x1b00) and, linearly, into two gains (amplitude modulation). Every 256 ticks each rotor's rate
// moves by a fixed step toward the target of the selected speed, and its depth follows the rate.
export const LESLIE_SPEEDS = {  // targets per rotor [rate, step every 256 ticks]; parameters of the code
  stop: [[0x0000, 6], [0x0000, 0x14]],
  slow: [[0x0058, 6], [0x006a, 0x32]],
  fast: [[0x0230, 9], [0x03da, 0x37]],
};

function leslieModel(iram, ram, depthCurve) {
  const speed = !(iram[0x2c] & 1) ? 'stop' : !((iram[0x2a] >> 4) & 1) ? 'slow' : 'fast';
  const par = { kind: 'leslie', speed, am: ram[0x662] };
  const r1 = { P: (iram[0x66] << 8) | iram[0x67], D: (iram[0x29] >> 5) & 1, H: (iram[0x29] >> 6) & 1, B: (iram[0x2a] >> 5) & 1,
    rate: (iram[0x5c] << 8) | iram[0x65], depth: iram[0x64] };
  const r2 = { P: (iram[0x57] << 8) | iram[0x58], D: (iram[0x2a] >> 2) & 1, H: (iram[0x2a] >> 3) & 1, B: (iram[0x2a] >> 6) & 1,
    rate: (iram[0x55] << 8) | iram[0x56], depth: iram[0x54] };
  const st = { count: ram[0x63c], r1, r2 };
  const rotors = [
    { s: r1, centre: 0x1900, steps: [0x0b, 0x0c], gains: [0x0f, 0x11], curve: 0 },
    { s: r2, centre: 0x1b00, steps: [0x13, 0x14], gains: [0x17, 0x19], curve: 1 },
  ];
  // the rate's slew toward the target, as the firmware clamps it. After a carry into the high byte,
  // rotor 2 checks the clamp again and rotor 1 does not.
  const slew = (s, [T, step], curve) => {
    if (s.rate === T) return;
    let hi = s.rate >> 8, lo = s.rate & 0xff;
    const Th = T >> 8, Tl = T & 0xff, recheck = curve === 1;
    if (T < s.rate) {
      lo -= step;
      let check = lo >= 0;
      if (lo < 0) { lo &= 0xff; if (Th === hi) lo = Tl; else { hi--; check = recheck; } }
      if (check && Th === hi && !(Tl < lo)) lo = Tl;
    } else {
      lo += step;
      let check = lo <= 0xff;
      if (lo > 0xff) { lo &= 0xff; if (Th === hi) lo = Tl; else { hi++; check = recheck; } }
      if (check && Th === hi && !(Tl >= lo)) lo = Tl;
    }
    s.rate = (hi << 8) | lo;
    s.depth = depthCurve(curve, (s.rate >> 6) & 0xff);
  };
  return {
    par, st,
    periodTicks: (4 * 65536) / (r1.rate || 1),
    periodTicks2: (4 * 65536) / (r2.rate || 1),
    tick(w) {
      st.count = (st.count + 1) & 0xff;
      if (st.count === 0) LESLIE_SPEEDS[speed].forEach((t, i) => slew(rotors[i].s, t, i));
      for (const ro of rotors) {
        const s = ro.s;
        stepTriangle16(s, s.rate);
        const disp = displacement(shape(s.P, true), s.depth);
        pairWrites(w, ro.steps[0], ro.steps[1], ro.centre, s.H ? -1 : 1, disp);
        const top = s.P >> 8, B = (top * par.am) >> 8;
        let R0 = (0x7f - par.am) & 0xff;
        if (!s.H) R0 = (R0 + ((0xff - top) >> 1)) & 0xff;
        const [g1, g2] = s.B ? [R0 - B, R0 + B] : [R0 + B, R0 - B];
        w.push([ro.gains[0] * 4 + 2, g1 & 0xff], [ro.gains[1] * 4 + 2, g2 & 0xff]);
      }
    },
  };
}

// VERB SHIFTER: an 8-bit triangle advanced twice a tick; its high byte picks a value from one of two
// curves (one per half cycle), which, scaled by depth, moves four coefficient pairs around fixed
// centres. Each pair gets the same magnitude with opposite signs.
const VS_PAIRS = [   // [scale, centre (16-bit signed), step of the first coefficient, second, op bits of the first]
  [0x30, 0x9240, 0x13, 0x15, 0x00], [0x5a, 0xa240, 0x16, 0x17, 0x0a],
  [0x90, 0xc990, 0x18, 0x19, 0x0a], [0xf0, 0xdf80, 0x1a, 0x1b, 0x0a],
];
const VS_SECOND_OPS = [0x06, 0x06, 0x06, 0x01];
const VS_SIGN_TURN = 0x99;   // on the second curve, the coefficients change sign where the phase reaches this

function shifterModel(iram, curves) {
  const par = { kind: 'shifter', rate: iram[0x65], depth: iram[0x64] };
  const st = { P: (iram[0x66] << 8) | iram[0x67], D: (iram[0x29] >> 5) & 1, H: (iram[0x29] >> 6) & 1, neg: (iram[0x2a] >> 4) & 1 };
  return {
    par, st,
    periodTicks: 65536 / par.rate,
    tick(w) {
      stepTriangleVS(st, par.rate); stepTriangleVS(st, par.rate);
      const h = st.P >> 8;
      if (st.H) st.neg = h < VS_SIGN_TURN ? 1 : 0;
      const v = curves(st.H, h);
      VS_PAIRS.forEach(([scale, centre, s1, s2, op1], i) => {
        const prod = v * ((scale * par.depth) >> 8);
        let s = (st.neg ? centre - prod : centre + prod) & 0xffff;
        const negative = s & 0x8000;
        if (negative) s = (-s) & 0xffff;
        const hi = ((s << 1) >> 8) & 0xff, lo = ((s << 1) & 0xe0) | (negative ? 0 : 0x10);
        w.push([s2 * 4 + 3, lo | VS_SECOND_OPS[i]], [s1 * 4 + 3, ((lo ^ 0x10) & 0xf0) | op1], [s2 * 4 + 2, hi], [s1 * 4 + 2, hi]);
      });
    },
  };
}

// ---- running the firmware tick by tick ----------------------------------------------------

function ticker(b) {
  const cpu = b.cpu;
  return () => {
    while (cpu.pc !== 0x000b) cpu.step();
    const depth = cpu.inIrq.length, start = cpu.cycles;
    let target = -1;
    while (cpu.inIrq.length >= depth) {
      if (cpu.pc === DISPATCH) target = (cpu.iram[0x60] << 8) | cpu.iram[0x61];
      cpu.step();
    }
    return { target, start };
  };
}

// Tables the firmware uses, read from the ROM passed in (never stored in the repository).
export function romCurves(rom) {
  return {
    fade: (i) => rom[0x2a74 + i],
    leslieDepth: (c, i) => rom[(c ? 0x064d : 0x0644) + i],
    shifter: (H, h) => rom[(H ? 0x99dd : 0x98dd) + h],
  };
}

// The formulas that stand in for the tables, for the module.
const formulas = {
  fade: (i) => Math.round(255 * Math.sin((Math.PI / 2) * (i / 255))),
};

const name = (b, p) => String.fromCharCode(...b.record(p).subarray(0x6a, 0x78)).replace(/\0/g, ' ').trim();

// opts.until(iram): run ticks after the recall until it holds (the Leslie's rotors at their speed);
// opts.onTick(ran, dsp): called after every tick that ran with the firmware's DSP bytes.
export function analyse(b, p, seconds, curves, opts = {}) {
  const cpu = b.cpu, next = ticker(b);
  b.recall(p);
  next();                                   // start on a tick boundary
  for (let k = 0; opts.until && !opts.until(cpu.iram); k++) { if (k > 1e6) throw new Error('until: never'); next(); }
  const target = (cpu.iram[0x60] << 8) | cpu.iram[0x61];
  const iram = Uint8Array.from(cpu.iram), ram = b.ram;
  let model = null;
  if (SWEEPS[target]) model = sweepModel(target, iram);
  else if (target === 0x0d22) model = pitchModel(iram, curves.fade);
  else if (target === 0x0660) model = leslieModel(iram, ram, curves.leslieDepth);
  else if (target === 0x96ee) model = shifterModel(iram, curves.shifter);
  const params = model ? JSON.parse(JSON.stringify(model.par)) : { kind: target === 0x0d17 ? 'none' : `handler ${target.toString(16)}` };
  const start = { state: model ? JSON.parse(JSON.stringify(model.st)) : null, dsp: Array.from(b.dsp.subarray(0, DSP_BYTES)) };
  // the gate's settings (edit buffer 0x83xx), and whether a signal onset restarts the sweep
  const x = (a) => ram[a - 0x8000];
  const gate = x(0x83a3) ? { open: x(0x839b), closed: x(0x83a1), hold: x(0x833f) + 1, decay: x(0x8340),
    steps: x(0x839d), first: (0x100 + x(0x839e)) >> 2, second: (0x100 + x(0x839e) + x(0x839c)) >> 2 } : null;
  const trigger = !!x(0x83a4);
  // the shadow program: what the DSP should hold, from the reconstruction and the main loop's own writes
  const shadow = Uint8Array.from(b.dsp.subarray(0, DSP_BYTES + 1));
  const mainWrites = new Map();
  const xw = b.xwrite;
  b.xwrite = (a, v) => {
    if (a <= DSP_BYTES && cpu.inIrq.length === 0) { shadow[a] = v; const s = a >> 2; mainWrites.set(s, (mainWrites.get(s) ?? 0) + 1); }
    xw.call(b, a, v);
  };
  const end = cpu.cycles + seconds * 1e6;
  let ticks = 0, ran = 0, bad = 0, firstBad = null, cycles = 0, last = cpu.cycles;
  const moved = new Set();
  while (cpu.cycles < end) {
    const t = next();
    ticks++;
    if (t.target < 0) { last = t.start; continue; }      // skipped: 2ah.0 was set
    ran++; cycles += t.start - last; last = t.start;
    const w = [[0x17f, 1], [0x180, 1]];
    if (model) model.tick(w);
    for (const [a, v] of w) { if (shadow[a] !== v) moved.add(a >> 2); shadow[a] = v; }
    let diff = 0;
    for (let a = 0; a <= DSP_BYTES; a++) if (shadow[a] !== b.dsp[a]) diff++;
    if (diff) { bad++; if (!firstBad) firstBad = { tick: ran, bytes: diff }; shadow.set(b.dsp.subarray(0, DSP_BYTES + 1)); }
    if (opts.onTick) opts.onTick(ran, b.dsp, shadow);
  }
  b.xwrite = xw;
  moved.delete(0x5f); moved.delete(0x60);
  return { p, name: name(b, p), target, params, model, start, gate, trigger, ticks, ran, bad, firstBad,
    cyclesPerTick: ran > 1 ? cycles / (ran - 1) : NaN, moved: [...moved].sort((x, y) => x - y), mainWrites };
}

// How close the formulas come to the tables.
function formulaReport(rom) {
  const c = romCurves(rom);
  let worst = 0;
  for (let i = 0; i < 256; i++) worst = Math.max(worst, Math.abs(c.fade(i) - formulas.fade(i)));
  return `pitch crossfade: 255 sin(pi/2 i/255) is within ${worst} of the table (of 255)`;
}

if (process.argv[1] && process.argv[1].endsWith('qvlfo.mjs')) {
  const args = process.argv.slice(2);
  const rom = args.shift();
  if (!rom) { console.error('usage: node qvlfo.mjs <rom> [program ...] [--seconds 10]'); process.exit(2); }
  let seconds = 10;
  const si = args.indexOf('--seconds');
  if (si >= 0) { seconds = +args[si + 1]; args.splice(si, 2); }
  const progs = args.length ? args.map(Number) : [...Array(90).keys()];
  const b = new Board(rom).boot();
  const curves = romCurves(b.rom);
  const hx = (x, n = 4) => x.toString(16).padStart(n, '0');
  let modulated = 0, exact = 0;
  for (const p of progs) {
    const r = analyse(b, p, seconds, curves);
    const tickMs = (r.cyclesPerTick + ASSUMED_RESPONSE) / 1000;
    const sec = (ticks) => ((ticks * tickMs) / 1000).toFixed(2);
    const P = r.params;
    let form;
    if (P.kind === 'sweep') {
      const pairs = P.pairs.map((q) => `${hx(q.steps[0], 2)}/${hx(q.steps[1], 2)} at ${hx((P.centre + q.offset) & 0xffff)} ${q.sign > 0 ? '+' : '-'}`).join(', ');
      form = `${P.layout} sweep, ${P.parabolic ? 'parabolic (sine-like)' : 'triangle'}, rate ${P.rate}, depth ${P.depth} samples, period ${r.model.periodTicks.toFixed(0)} ticks = ${sec(r.model.periodTicks)} s; pairs ${pairs}`;
    } else if (P.kind === 'pitch') {
      form = `pitch saw, rate ${P.rate}/256 sample a tick (${P.rate < 0 ? 'up' : 'down'}), window ${hx(P.window)}, ${r.model.periodTicks.toFixed(0)} ticks a window = ${sec(r.model.periodTicks)} s; taps 14/15 and 18/19, fractions 16/1a, crossfade 1b/1c`;
    } else if (P.kind === 'leslie') {
      const m = r.model.st;
      form = `leslie ${P.speed}, AM ${P.am}; rotor 1 (0b/0c at 1900, gains 0f/11) rate ${m.r1.rate} depth ${m.r1.depth}, rotor 2 (13/14 at 1b00, gains 17/19) rate ${m.r2.rate} depth ${m.r2.depth} (at the end); periods ${sec(r.model.periodTicks)} / ${sec(r.model.periodTicks2)} s at the start`;
    } else if (P.kind === 'shifter') {
      form = `shifter, rate ${P.rate} (twice a tick), depth ${P.depth}, period ${r.model.periodTicks.toFixed(0)} ticks = ${sec(r.model.periodTicks)} s; coefficient pairs 13/15 16/17 18/19 1a/1b`;
    } else form = P.kind;
    if (r.moved.length) modulated++;
    const ok = r.bad === 0;
    if (ok && r.moved.length) exact++;
    const main = [...r.mainWrites].map(([s, n]) => `${hx(s, 2)}x${n}`).join(' ');
    if (r.trigger) form += '; a signal onset restarts the sweep';
    if (r.gate) {
      const g = r.gate;
      form += `\n   gate: steps ${hx(g.first, 2)}.. and ${hx(g.second, 2)}.. (${g.steps} each), open ${g.open}/256, closed ${g.closed}/256, ` +
        `hold ${g.hold} windows, release x${(2 * g.decay + 57)}/256 a window`;
    }
    console.log(`${String(p).padStart(2)} ${r.name.padEnd(15)} ${form}`);
    console.log(`   check: ${r.ran}/${r.ticks} ticks ran (${r.cyclesPerTick.toFixed(1)} cycles, ~${(tickMs * SAMPLES_PER_MS).toFixed(2)} samples a tick assumed), ` +
      `steps moved ${r.moved.map((s) => hx(s, 2)).join(' ') || '-'}; ${ok ? 'every tick matches the firmware exactly' : `${r.bad} ticks differ (first at ${r.firstBad.tick}, ${r.firstBad.bytes} bytes)`}` +
      `${main ? `; main-loop writes to steps ${main}` : ''}`);
  }
  console.log(`\n${exact}/${modulated} modulated programs reconstructed exactly over ${seconds} s`);
  console.log(formulaReport(b.rom));
}
