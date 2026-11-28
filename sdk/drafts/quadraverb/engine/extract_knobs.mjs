// The live knobs' inputs (ENGINE.md, "Live knobs"): for each factory program, the DSP steps that DECAY, PRE-DELAY, the
// delay times and feedbacks write, how they write them, and the firmware's own words for every value; the sweep's speed
// and depth; the mix levels; and the curves that turn speed and depth into the LFO's rate and depth. All of it is read
// by running the firmware in the emulator (nothing is copied from the ROM), and all of it derives from the ROM: keep
// it outside the repository (~/.cache/modwerk-local/quadraverb/engine/knobs.json).
//   node extract_knobs.mjs <rom> <out.json> [program ...]
//
// A parameter's steps are the ones a recall with the record byte changed rewrites (at its lowest, middle and highest
// value), outside the LFO's moving steps. Its field (the address, or the coefficient) for every value comes from the
// edit page's own handler, as the original applies a turn; the recalls check whole steps at three values. A step must follow its formula at every value:
//   decay     coefficient round(1991 sin(pi v / 198))      feedback   coefficient 16 v
//   pre-delay, delay times   address = factory address + 42 (v - factory)
// otherwise the parameter is marked bad and the engine leaves it alone. The sweep's rate and depth come from a routine
// (0x76a6) run for every speed and depth: rate = R[s], depth = D[s][d / B] with B 1 or 3 (the flanges, whose sweep
// centre then moves with the depth).
import console from 'node:console';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { Board } from '../tools/machine.mjs';

const [ROM, OUT, ...picked] = process.argv.slice(2);
if (!ROM || !OUT) throw new Error('usage: node extract_knobs.mjs <rom> <out.json> [program ...]');
const EDIT = 0x0300, SENT = 0xfff0;
const decayC = (v) => Math.floor(1991 * Math.sin((Math.PI * v) / 198) + 0.5 + 1e-9);
const PARAMS = {
  decay: { off: 0x39, n: 1, lo: 0, hi: 99, h: { 0: 0x78e5, 1: 0x78e5, 4: 0x8295 }, c: decayC },
  predelay: { off: 0x37, n: 1, lo: 1, hi: 140, h: { 0: 0x79dc, 1: 0x79dc, 4: 0x838c } },
  dtimeL: { off: 0x2a, n: 2, lo: 1, h: { 0: 0x6e91, 1: 0x6e91, 2: 0x6e91, 3: 0x6e91 } },
  dtimeR: { off: 0x2d, n: 2, lo: 1, h: { 0: 0x6e91, 1: 0x6e91, 2: 0x6e91, 3: 0x6e91 } },
  fbL: { off: 0x2c, n: 1, lo: 0, hi: 99, h: { 0: 0x6e91, 1: 0x6e91, 2: 0x6e91, 3: 0x6e91 }, c: (v) => 16 * v },
  fbR: { off: 0x2f, n: 1, lo: 0, hi: 99, h: { 0: 0x6e91, 1: 0x6e91, 2: 0x6e91, 3: 0x6e91 }, c: (v) => 16 * v },
};
const DMAX = { 0: [800, 400, 400], 1: [800, 400, 400], 2: [1500, 750, 750], 3: [1500, 750, 750] };
const SWEEPS = [0x0bb0, 0x0a3e, 0x0e04];

const b = new Board(ROM).boot(), cpu = b.cpu;
const snap = () => b.dsp.slice(0, 0x180);
const word = (d, s) => [d[4 * s] | (d[4 * s + 1] << 8), (d[4 * s + 2] << 3) | (d[4 * s + 3] >> 5), d[4 * s + 3] & 0x1f];

// An 8051 routine run as LCALL from the main loop, to its RET; the interrupted context is put back.
function call(addr) {
  const sfr = cpu.sfr;
  while (cpu.inIrq.length) cpu.step();
  const keep = { pc: cpu.pc, sp: sfr[0x81], a: sfr[0xe0], bb: sfr[0xf0], dpl: sfr[0x82], dph: sfr[0x83], psw: sfr[0xd0],
    p2: sfr[0xa0], regs: cpu.iram.slice(0, 0x20), x77: cpu.iram[0x77] };
  cpu.push(SENT & 0xff); cpu.push(SENT >> 8); cpu.pc = addr;
  for (const end = cpu.cycles + 2_000_000; !(cpu.pc === SENT && sfr[0x81] === keep.sp);) {
    if (cpu.cycles > end) throw new Error(`routine ${addr.toString(16)} did not return`);
    cpu.step();
  }
  cpu.pc = keep.pc; sfr[0xe0] = keep.a; sfr[0xf0] = keep.bb; sfr[0x82] = keep.dpl; sfr[0x83] = keep.dph;
  sfr[0xd0] = keep.psw; sfr[0xa0] = keep.p2; cpu.iram.set(keep.regs, 0); cpu.iram[0x77] = keep.x77;
}
function moving() {   // the steps the timer interrupt rewrites
  const seen = new Set(), xw = b.xwrite.bind(b);
  b.xwrite = (a, v) => { if (a < 0x180 && cpu.inIrq.length) seen.add(a >> 2); xw(a, v); };
  try { b.run(200_000); } finally { b.xwrite = xw; }
  return seen;
}
const setRec = (r, P, v) => { if (P.n === 2) { r[P.off] = v >> 8; r[P.off + 1] = v & 0xff; } else r[P.off] = v; };
const getRec = (r, P) => (P.n === 2 ? (r[P.off] << 8) | r[P.off + 1] : r[P.off]);
const setEdit = (P, v) => setRec(b.ram.subarray(EDIT), P, v);

// The curves: every speed and depth through the routine, with depth divisors 1 and 3.
b.recall(4);
const rate = [], depth = [];
for (let s = 0; s < 99; s++) {
  const row = [];
  for (let d = 0; d < 99; d++) {
    b.ram[EDIT + 0x1d] = s; b.ram[EDIT + 0x1e] = d; cpu.sfr[0xf0] = 1;
    call(0x76a6);
    row.push(cpu.iram[0x64]);
    if (!d) rate.push(cpu.iram[0x65]);
  }
  depth.push(row);
}

const progs = picked.length ? picked.map(Number) : [...Array(90).keys()];
const out = { rate, depth, programs: [] };
for (const p of progs) {
  b.recall(p);
  const M = moving(), S0 = snap(), r = b.record(p), keep = r.slice(), cfg = b.ram[0x0392], type = b.ram[0x0332];
  const ir = cpu.iram, tgt = (ir[0x60] << 8) | ir[0x61];
  const row = { p, name: String.fromCharCode(...keep.subarray(0x6a, 0x78)).trim(), cfg, type, dtype: keep[0x27],
    delayLevel: keep[0x49], reverbLevel: keep[0x4a], params: {} };
  if (SWEEPS.includes(tgt)) {
    const s = keep[0x1d], d = keep[0x1e], dep = ir[0x64], centre = (ir[0x62] << 8) | ir[0x63];
    const B = [1, 3].find((k) => depth[Math.min(s, 98)][Math.floor(Math.min(d, 98) / k)] === dep);
    const centres = [];
    for (const dd of [0, 98]) { r.set(keep); r[0x1e] = dd; b.recall(p); centres.push([(ir[0x62] << 8) | ir[0x63], ir[0x64]]); }
    r.set(keep);
    const shift = centres.every(([c, k]) => c - k === centre - dep), fixed = centres.every(([c]) => c === centre);
    row.lfo = { s, d, rate: ir[0x65], depth: dep, centre, B: B ?? null, rateOk: rate[Math.min(s, 98)] === ir[0x65],
      centreOf: fixed ? 'fixed' : shift ? 'depth' : 'other', c0: centre - dep };
  }
  for (const [name, P] of Object.entries(PARAMS)) {
    if (!(cfg in P.h)) continue;
    const hi = P.hi ?? DMAX[cfg][keep[0x27]], f = getRec(keep, P);
    const steps = new Set(), probes = {};
    for (const v of [P.lo, Math.floor((P.lo + hi) / 2), hi]) {
      r.set(keep); setRec(r, P, v); b.recall(p);
      const d = snap();
      for (let s = 0; s < 96; s++) if (!M.has(s) && word(d, s).join() !== word(S0, s).join()) steps.add(s);
      probes[v] = d;
    }
    r.set(keep); b.recall(p);
    if (!steps.size) continue;
    const st = [...steps].sort((x, y) => x - y);
    const want = (s, v) => {
      const [a, c, op] = word(S0, s);
      return P.c ? [a, P.c(v), op] : [(a + 42 * (v - f)) & 0xffff, c, op];
    };
    let bad = null;
    for (const [v, d] of Object.entries(probes)) for (const s of st) if (!bad && word(d, s).join() !== want(s, +v).join()) bad = `recall at ${v}, step ${s.toString(16)}`;
    const values = {};
    const handler = P.h[cfg];
    for (let v = P.lo; v <= hi; v++) {
      setEdit(P, v); call(handler);
      const d = snap();
      const k = P.c ? 1 : 0;   // the page rewrites more than the recall does: only the field the parameter sets counts
      values[v] = st.map((s) => word(d, s)[k]);
      for (const s of st) if (!bad && word(d, s)[k] !== want(s, v)[k]) bad = `the page at ${v}, step ${s.toString(16)}`;
    }
    setEdit(P, f); call(handler); b.recall(p);
    let oracle = 'page';
    if (bad && bad.startsWith('the page')) {   // the page rewrites the step otherwise than a recall does: recalls decide
      console.error(`${p} ${name}: ${bad}; recalls instead`);
      bad = null; oracle = 'recall';
      for (const v of Object.keys(values)) delete values[v];
      const k = P.c ? 1 : 0;
      for (let v = P.lo; v <= hi; v = v === hi ? hi + 1 : Math.min(hi, v + 37)) {
        r.set(keep); setRec(r, P, v); b.recall(p);
        const d = snap();
        values[v] = st.map((s) => word(d, s)[k]);
        for (const s of st) if (!bad && word(d, s).join() !== want(s, v).join()) bad = `recall at ${v}, step ${s.toString(16)}`;
      }
      r.set(keep); b.recall(p);
    }
    row.params[name] = { steps: st, f, lo: P.lo, hi, bad, oracle, values };
    if (bad) console.error(`${p} ${name}: ${bad}`);
  }
  out.programs.push(row);
  process.stderr.write(`${p} `);
}
process.stderr.write('\n');
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT}: ${out.programs.length} programs`);
