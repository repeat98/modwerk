#!/usr/bin/env node
// Checks the DSP model (qv.mjs) against programs whose behaviour is known, with your ROM:
//   node qv.check.mjs <rom>
// - the graphic EQ of 167 ms DELAY: flat at 0 dB; each band boosts and cuts 14 dB at its centre
// - the same program end to end: dry, then echoes 7015 samples apart with its feedback
// - SMALL ROOM's input diffuser (steps 0x13-0x22): an allpass chain, flat magnitude
// - the reverbs: finite, decaying, left and right at the same level
import console from 'node:console';
import process from 'node:process';
import { Board } from './machine.mjs';
import { QV, decode } from './qv.mjs';

const rom = process.argv[2];
if (!rom) {
  console.error('usage: node qv.check.mjs <rom>');
  process.exit(2);
}
const board = new Board(rom).boot();
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const db = (h, f) => {
  let re = 0, im = 0;
  const w = (2 * Math.PI * f) / 42000;
  for (let n = 0; n < h.length; n++) {
    re += h[n] * Math.cos(w * n);
    im -= h[n] * Math.sin(w * n);
  }
  return 20 * Math.log10(Math.hypot(re, im) + 1e-12);
};
const freqs = [];
for (let f = 12; f < 20000; f *= 1.06) freqs.push(f);
const spread = (d) => Math.max(...d) - Math.min(...d);
const N = 1 << 15;

// Graphic EQ: record bytes 0x01-0x0b are the band gains, 14 is 0 dB, one step is 1 dB.
// Its output is the accumulator after step 0x52.
{
  const rec = board.record(40), orig = rec.slice();
  const prog = (byte, v) => {
    rec.set(orig);
    if (byte >= 0) rec[byte] = v;
    const p = decode(board.recall(40));
    rec.set(orig);
    return p;
  };
  const response = (steps) => {
    const q = new QV(steps), h = new Float64Array(N);
    for (let n = 0; n < N; n++) q.sample(n ? 0 : 1, (i, A) => { if (i === 0x52) h[n] = A; });
    return h;
  };
  const flat = freqs.map((f) => db(response(prog(-1)), f));
  check(spread(flat) < 0.05, `graphic EQ at 0 dB: flat within ${spread(flat).toFixed(3)} dB`);
  [16, 32, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].forEach((c, band) => {
    for (const g of [28, 0]) {
      const h = response(prog(1 + band, g)), d = freqs.map((f, i) => db(h, f) - flat[i]);
      const ext = g ? Math.max(...d) : Math.min(...d), at = freqs[d.indexOf(ext)];
      check(Math.abs(Math.abs(ext) - 14) < 2 && Math.abs(Math.log2(at / c)) < 0.4,
        `EQ ${c} Hz ${g ? '+' : '-'}14 dB: ${ext.toFixed(1)} dB at ${at.toFixed(0)} Hz`);
    }
  });
  const q = new QV(prog(-1)), out = [];
  for (let n = 0; n < 30000; n++) out.push(q.sample(n ? 0 : 1)[0]);
  const ev = out.map((v, n) => [n, v]).filter(([, v]) => Math.abs(v) > 0.02);
  check(ev.length === 3 && ev[1][0] - ev[0][0] === 7015 && Math.abs(ev[2][1] / ev[1][1] - 0.2266) < 0.01,
    `167 ms DELAY end to end: ${ev.map(([n, v]) => `${n}:${v.toFixed(3)}`).join(' ')}`);
}

// SMALL ROOM's input diffuser alone: impulse into the accumulator before 0x13, read after 0x22.
{
  const q = new QV(decode(board.recall(10))), h = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    q.A = n ? 0 : 1;
    for (let i = 0x13; i <= 0x22; i++) q.step(i);
    h[n] = q.A;
    q.ptr = (q.ptr - 1) & 0xffff;
  }
  const d = freqs.filter((f) => f > 30).map((f) => db(h, f));
  check(spread(d) < 0.1, `SMALL ROOM diffuser is an allpass: flat within ${spread(d).toFixed(3)} dB`);
}

// Reverbs: impulse response for 6 s.
for (const p of [10, 11, 12, 13, 15, 17, 19, 20, 21, 66]) {
  const q = new QV(decode(board.recall(p)));
  let eL = 0, eR = 0, late = 0, finite = true;
  for (let n = 0; n < 42000 * 6; n++) {
    const [l, r] = q.sample(n ? 0 : 1);
    if (!(Math.abs(l) < 10 && Math.abs(r) < 10)) { finite = false; break; }
    eL += l * l;
    eR += r * r;
    if (n > 42000 * 5) late += l * l;
  }
  const lr = 10 * Math.log10(eL / eR);
  check(finite && Math.abs(lr) < 1 && late < eL * 1e-3,
    `program ${p}: finite, decays, L/R ${lr.toFixed(2)} dB, energy ${eL.toFixed(3)}`);
}

console.log(failed ? `${failed} failed` : 'all checks pass');
process.exit(failed ? 1 : 0);
