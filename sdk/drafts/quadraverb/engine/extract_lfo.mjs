// The moving factory programs for the engine (ENGINE.md, "Modulation"): for each, the modulation's kind and
// parameters as tools/qvlfo.mjs reads them, the state it starts from, the DSP program at that tick, and the
// firmware's whole DSP program after every later tick (to hold the engine's model to, tick by tick).
//   node extract_lfo.mjs <rom> <out dir> [program ...] [--ticks N] [--signal]
// Writes <out dir>/lfo.json and <out dir>/ticks-<p>.bin.gz (N ticks x 384 bytes). Everything written is derived
// from the ROM (the programs, the pitch crossfade curve): keep it outside the repository
// (~/.cache/modwerk-local/quadraverb/engine/).
//
// Each program starts from a fresh boot and one recall, so its state is the one the firmware has when the program
// is the first recalled after power-up (a recall does not reset the phase: it runs on from the program before).
// The Leslies are run on until both rotors turn at the program's own speed: the speed bits come from MIDI
// (aftertouch, pitch bend, the sustain pedal), which the engine does not take, so it plays the default speed.
// Left out: the gated programs and the ones a signal onset restarts (both need a signal detector). With --signal the
// detector reads signal all the time (P3.2 held low): each gate stays open and no onset comes, so those programs run
// as their open, free-running form and are extracted too (VERB SHIFTER's coefficient sweep still is not).
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Board, DSP_BYTES } from '../tools/machine.mjs';
import { analyse, romCurves, LESLIE_SPEEDS, ASSUMED_RESPONSE } from '../tools/qvlfo.mjs';

export const GATED = [3, 23, 24, 25, 26, 27, 28, 29, 73, 86, 87];
export const ONSET = [28, 29, 31, 32, 88];

const args = process.argv.slice(2);
const ti = args.indexOf('--ticks');
const TICKS = ti >= 0 ? +args[ti + 1] : 16384;
if (ti >= 0) args.splice(ti, 2);
const si = args.indexOf('--signal');
const SIGNAL = si >= 0;
if (si >= 0) args.splice(si, 1);
const [ROM, OUT, ...picked] = args;
if (!ROM || !OUT) throw new Error('usage: node extract_lfo.mjs <rom> <out dir> [program ...] [--ticks N]');
mkdirSync(OUT, { recursive: true });
const raw = (d) => Array.from({ length: 96 }, (_, i) => ({ a: d[4 * i] | (d[4 * i + 1] << 8), c: (d[4 * i + 2] << 3) | (d[4 * i + 3] >> 5), op: d[4 * i + 3] & 0x1f }));

const leslieAtSpeed = (iram) => {
  const speed = !(iram[0x2c] & 1) ? 'stop' : !((iram[0x2a] >> 4) & 1) ? 'slow' : 'fast';
  const [[t1], [t2]] = LESLIE_SPEEDS[speed];
  return ((iram[0x5c] << 8) | iram[0x65]) === t1 && ((iram[0x55] << 8) | iram[0x56]) === t2;
};

const rows = [];
let fade = null;
const progs = picked.length ? picked.map(Number) : [...Array(90).keys()];
for (const p of progs) {
  if (!SIGNAL && (GATED.includes(p) || ONSET.includes(p))) continue;
  const b = new Board(ROM, { signal: SIGNAL }).boot();
  const curves = romCurves(b.rom);
  // a first look: is it moving, and which kind
  const look = analyse(b, p, 0.01, curves);
  if (!look.moved.length) continue;
  const kind = look.params.kind;
  if (!['sweep', 'pitch', 'leslie'].includes(kind)) { console.log(`${p}: ${kind}, left out`); continue; }
  const b2 = new Board(ROM, { signal: SIGNAL }).boot();
  const buf = Buffer.alloc(TICKS * DSP_BYTES);
  let n = 0;
  const seconds = (TICKS + 8) * (kind === 'leslie' ? 532e-6 : 256e-6);
  const r = analyse(b2, p, seconds, curves, {
    until: kind === 'leslie' ? leslieAtSpeed : null,
    onTick: (ran, dsp) => { if (n < TICKS) { buf.set(dsp.subarray(0, DSP_BYTES), n * DSP_BYTES); n++; } },
  });
  if (r.bad) throw new Error(`${p}: the reconstruction differs from the firmware at ${r.bad} ticks`);
  if (n < TICKS) throw new Error(`${p}: only ${n} ticks`);
  writeFileSync(`${OUT}/ticks-${p}.bin.gz`, gzipSync(buf));
  const st = r.start.state;
  rows.push({ p, name: r.name, kind, params: r.params, state: st, steps: raw(r.start.dsp), ticks: TICKS, signal: SIGNAL,
    cyclesPerTick: r.cyclesPerTick, tickUs: r.cyclesPerTick + ASSUMED_RESPONSE, moved: r.moved });
  if (kind === 'pitch' && !fade) fade = Array.from({ length: 256 }, (_, i) => curves.fade(i));
  console.log(`${p} ${r.name}: ${kind}, ${n} ticks recorded, ${r.cyclesPerTick.toFixed(2)} cycles a tick, moved ${r.moved.map((s) => s.toString(16)).join(' ')}`);
}
writeFileSync(`${OUT}/lfo.json`, JSON.stringify({ fade, programs: rows }));
console.log(`wrote ${rows.length} programs to ${OUT}/lfo.json`);
