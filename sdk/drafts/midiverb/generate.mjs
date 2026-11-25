#!/usr/bin/env node
// Midiverb program generator. Reads the Alesis Midiverb, Midiverb II and Midifex
// ROM dumps on the developer's computer (they never enter the repository) and
// writes programs.json: every program as delay lines relocated into the module's
// smaller ring, plus the checks that prove the relocation plays the same notes.
//
// Machine semantics follow Eric Brombaugh's MIT reverse engineering
// (github.com/emeb/MIDIVerb_RE) and the ROM layouts documented by thement
// (github.com/thement/midiverb_emulator). Owner waiver, 25 Nov 2026.
//
//   node generate.mjs --mv1 <rom> --mv2 <rom> --fex <rom> [--write] [--check]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'programs.json');
const DRAM = 0x4000;

export const ROMS = {
  MV1: { md5: '11a460c8e64d3325411bba0c11a2ae49', size: 16384, base: 0, programs: 63, shift: 2, first: 1 },
  FEX: { md5: 'f06003307a93ec09c637146ecaa17948', size: 16384, base: 0, programs: 63, shift: 2, first: 1 },
  MV2: { md5: 'd503f74c239917b9888f247f979509ec', size: 32768, base: 0x1c00, programs: 100, shift: 1, first: 0 },
};

// 128 steps of [op, address step]; op 0 sum-half, 1 load-half, 2 store, 3 store-inverted.
export function decode(bytes, shift) {
  return Array.from({ length: 128 }, (_, pc) => [
    bytes[(2 * pc - shift - 1) & 0xff] >> 6,
    ((bytes[(2 * pc - shift + 1) & 0xff] & 0x3f) << 8) | bytes[(2 * pc - shift) & 0xff],
  ]);
}

export function readRom(path, kind) {
  const rom = ROMS[kind];
  const bytes = readFileSync(path);
  const md5 = createHash('md5').update(bytes).digest('hex');
  if (bytes.length !== rom.size || md5 !== rom.md5) throw new Error(`${path}: not the ${kind} ROM (md5 ${md5})`);
  return Array.from({ length: rom.programs }, (_, i) =>
    decode(bytes.subarray(rom.base + 256 * i, rom.base + 256 * (i + 1)), rom.shift));
}

const i16 = (v) => (v << 16) >> 16;
const half = (v) => (v >> 1) + (v < 0 ? 1 : 0);

// The original machine, exactly: 16K words of DRAM, a 16-bit accumulator, outputs
// taken at steps 0x60 (right) and 0x70 (left), input written at step 0.
export function rawMachine(steps, size = DRAM, addrOf = null) {
  const dram = new Int16Array(size);
  let acc = 0, addr = 0, p = 0;
  return (input) => {
    let left = 0, right = 0;
    for (let pc = 0; pc < 128; pc++) {
      const [op, off] = steps[pc];
      const a = addrOf ? addrOf(p, pc) : addr;
      let data, next;
      if (op < 2) { data = dram[a]; next = (op === 0 ? acc : 0) + half(data); }
      else { data = op === 2 ? acc : i16(~acc); dram[a] = data; next = (op === 2 ? acc : 0) + half(data); }
      if (pc === 0x60) right = data;
      else if (pc === 0x70) left = data;
      else if (pc === 0) dram[a] = input;
      else acc = i16(next);
      addr = (addr + off) & (DRAM - 1);
    }
    p = (p + 1) % size;
    return [left, right];
  };
}

// Delay-line form: every DRAM access becomes (line, delay). A line is one writing
// step; a read takes the most recent write to its address. Returns the step
// positions, the per-sample pointer step and each step's line and delay.
const OUTPUT = (pc) => pc === 0x60 || pc === 0x70;

// Which reads matter: a read whose value is overwritten before any store or
// output uses it is dead, so its address may hold anything.
export function liveReads(steps) {
  const live = new Array(128).fill(false);
  let accLive = true; // the accumulator carries into the next sample: settle over two passes
  for (let pass = 0; pass < 2; pass++) {
    for (let pc = 127; pc >= 0; pc--) {
      const op = steps[pc][0];
      if (pc === 0) { live[pc] = false; continue; }          // input overwrites the step; acc passes through
      if (OUTPUT(pc)) { live[pc] = op < 2; if (op >= 2) accLive = true; continue; }
      if (op === 0) live[pc] = accLive;                        // acc += half(read)
      else if (op === 1) { live[pc] = accLive; accLive = false; } // acc = half(read)
      else accLive = true;                                     // stores use the accumulator
    }
  }
  return live;
}

export function lines(steps) {
  const pos = []; let s = 0;
  for (const [, off] of steps) { pos.push(s); s = (s + off) & (DRAM - 1); }
  if (s !== 1) throw new Error(`pointer moves ${s} per sample, expected 1`);
  const writes = steps.map(([op], pc) => pc).filter((pc) => pc === 0 || steps[pc][0] >= 2);
  const live = liveReads(steps);
  const access = steps.map(([op], pc) => {
    if (pc === 0 || op >= 2) return { line: pc, delay: 0 };
    if (!live[pc]) return { line: 0, delay: 0, dead: true };
    let best = null;
    for (const w of writes) {
      let d = (pos[w] - pos[pc]) & (DRAM - 1);
      if (d === 0 && w > pc) d = DRAM;
      // On a tie the later step wrote last.
      if (best === null || d < best.delay || (d === best.delay && w > best.line)) best = { line: w, delay: d };
    }
    return best;
  });
  const length = {};
  for (const w of writes) length[w] = 0;
  for (const a of access) length[a.line] = Math.max(length[a.line], a.delay);
  return { pos, access, length };
}

// Pack the lines head to tail into a ring of `size` words. A program whose lines
// need more than the ring has its longest line scaled down, the rest kept.
export function relocate(steps, size) {
  const { access, length } = lines(steps);
  const heads = Object.keys(length).map(Number).sort((a, b) => a - b);
  let need = heads.reduce((n, w) => n + length[w] + 1, 0);
  const scale = {};
  while (need > size) {
    const w = heads.reduce((a, b) => (length[b] > length[a] ? b : a));
    const cut = Math.min(need - size, length[w] - 1);
    scale[w] = (length[w] - cut) / length[w] * (scale[w] ?? 1);
    length[w] -= cut; need -= cut;
  }
  const head = {}; let at = 0;
  for (const w of heads) { at += length[w]; head[w] = at; at += 1; }
  const delays = access.map(({ line, delay }) =>
    scale[line] ? Math.min(length[line], Math.round(delay * scale[line])) : delay);
  return { head, line: access.map((a) => a.line), delays, used: need, trimmed: Object.keys(scale).length > 0 };
}

// The same machine with every access moved to its relocated line: bit-identical
// to rawMachine when nothing was trimmed.
export function relocatedMachine(steps, size) {
  const r = relocate(steps, size);
  return rawMachine(steps, size, (p, pc) => (p + r.head[r.line[pc]] - r.delays[pc] + size) % size);
}

// The DSP's program: at most one operation per step, addresses relative to the
// ring pointer. Every non-output read of the original halves the word it reads,
// so the DSP stores each word already halved (with the original's rounding) and
// a read becomes a plain add: the state stays bit-exact, and only the two
// output taps, which read a word whole, lose its lowest bit.
//   ['in', a]   word = half(input)
//   ['mac', a]  acc += word          ['ld', a]   acc = word
//   ['st', a]   word = half(acc), acc += word
//   ['stn', a]  word = half(~acc), acc = word
//   ['outR'|'outL', a]       output = 2 * word
//   ['stR'|'stL'|'stnR'|'stnL', a]  store as st/stn, output the stored value, acc kept
export function compile(steps, size) {
  const r = relocate(steps, size);
  const live = liveReads(steps);
  const at = (pc) => r.head[r.line[pc]] - r.delays[pc];
  const ops = [];
  for (let pc = 0; pc < 128; pc++) {
    const op = steps[pc][0];
    if (pc === 0) ops.push(['in', at(pc)]);
    else if (OUTPUT(pc)) {
      const side = pc === 0x60 ? 'R' : 'L';
      ops.push([op < 2 ? `out${side}` : `${op === 2 ? 'st' : 'stn'}${side}`, at(pc)]);
    } else if (op >= 2) ops.push([op === 2 ? 'st' : 'stn', at(pc)]);
    else if (live[pc]) ops.push([op === 0 ? 'mac' : 'ld', at(pc)]);
  }
  return ops;
}

// What the DSP computes: the original's 16-bit arithmetic on pre-halved words.
export function compiledMachine(ops, size) {
  const word = new Int16Array(size);
  let acc = 0, p = 0;
  const w = (a) => (p + a + size) % size;
  return (input) => {
    let left = 0, right = 0;
    for (const [kind, a] of ops) {
      const x = kind.startsWith('stn') ? i16(~acc) : acc;
      switch (kind) {
        case 'in': word[w(a)] = half(input); break;
        case 'mac': acc = i16(acc + word[w(a)]); break;
        case 'ld': acc = word[w(a)]; break;
        case 'st': word[w(a)] = half(x); acc = i16(x + word[w(a)]); break;
        case 'stn': word[w(a)] = half(x); acc = word[w(a)]; break;
        case 'outR': right = 2 * word[w(a)]; break;
        case 'outL': left = 2 * word[w(a)]; break;
        default: word[w(a)] = half(x); if (kind.endsWith('R')) right = x; else left = x; // st/stn at an output step
      }
    }
    p = (p + 1) % size;
    return [left, right];
  };
}

// Midiverb I's chart, program 1 on.
const MV1_NAMES = ['.2 SM BRT', '.2 SM WARM', '.2 MD BRT', '.3 SM BRT', '.3 SM WARM', '.4 MD BRT', '.4 MD WARM',
  '.6 SM BRT', '.6 MD WARM', '.6 MD DARK', '.8 SM BRT', '.8 LG WARM', '1.0 SM WARM', '1.0 MD WARM', '1.0 LG BRT',
  '1.2 MD WARM', '1.2 SM WARM', '1.2 SM BRT', '1.4 LG WARM', '1.4 LG DARK', '1.4 MD WARM', '1.6 SM DARK',
  '1.6 LG BRT', '1.6 MD BRT', '1.8 LG DARK', '1.8 LG BRT', '1.8 MD WARM', '2.0 LG BRT', '2.0 MD WARM',
  '2.0 LG WARM', '2.5 MD WARM', '2.5 LG BRT', '2.5 MD DARK', '2.8 SM BRT', '2.8 MD BRT', '3.0 LG BRT',
  '3.0 LG WARM', '3.0 MD DARK', '3.5 LG BRT', '3.5 MD WARM', '4.0 LG DARK', '4.0 MD BRT', '5 LG WARM',
  '8 LG BRT', '8 LG WARM', '10 LG BRT', '10 LG WARM', '16 LG DARK', '18 XL BRT', '20 XL DARK',
  'GATE 100', 'GATE 150', 'GATE 200', 'GATE 250', 'GATE 300', 'GATE 350', 'GATE 400', 'GATE 500', 'GATE 600',
  'REV 300', 'REV 400', 'REV 500', 'REV 600'];

// A program's full name for the message box popup.s shows: 19 characters at most.
export function fullName(label) {
  const size = { SM: 'SMALL', MD: 'MEDIUM', LG: 'LARGE', XL: 'XLARGE' }, tone = { BRT: 'BRIGHT', WARM: 'WARM', DARK: 'DARK' };
  const [a, b, c] = label.split(' ');
  const name = a === 'GATE' ? `GATED ${b}MS` : a === 'REV' ? `REVERSE ${b}MS` : `${a}S ${size[b]} ${tone[c]}`;
  if (name.length > 19) throw new Error(`${name}: longer than the message box's 19 characters`);
  return name;
}

// The first build, before the base can load programs on demand: 24 Midiverb I
// programs resident in the effect's own table (16 reverbs, 4 gated, 4 reverse).
// Each fits the base's one-slot cycle allowance (measured in dsp_host, at most
// 390 executed instructions a sample); the small rooms (.2-1.2 s, 420-512) wait
// for a faster engine.
export const TRIAL = [11, 21, 20, 23, 19, 25, 32, 34, 33, 36, 40, 42, 45, 47, 48, 49, 50, 52, 54, 58, 59, 60, 61, 62];

// One program as DSP words: units of [handler * 2][argument], ending with the
// end unit. A run of k reads is [0][k] then k ring offsets; every other
// operation is [handler * 2][ring offset], handlers in engine.asm's jump table
// order. The P table keeps each program as its word count, then its words; the
// engine copies them above the ring when PROG changes (256 words at most).
export const HANDLER = ['run', 'st', 'ld', 'stn', 'in', 'outR', 'outL', 'stR', 'stL', 'stnR', 'stnL', 'end'];
export const PROGRAM_WORDS = 256;
export function encode(ops) {
  const words = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i][0] === 'mac') {
      let j = i; while (j < ops.length && ops[j][0] === 'mac') j++;
      words.push(0, j - i, ...ops.slice(i, j).map(([, a]) => a));
      i = j;
    } else { words.push(2 * HANDLER.indexOf(ops[i][0]), ops[i][1]); i++; }
  }
  words.push(2 * HANDLER.indexOf('end'), 0);
  if (words.length > PROGRAM_WORDS) throw new Error(`a program of ${words.length} words passes the ${PROGRAM_WORDS}-word area`);
  return [words.length, ...words];
}

function testSignal(n, seed = 1) {
  let x = seed; const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    const burst = i < n / 4 ? ((x >>> 16) & 0xfff) - 0x800 : 0;
    out[i] = (burst & ~1); // 13-bit input with the 12-bit converter's clear LSB
  }
  return out;
}

export function check(programs, size, samples = 48000) {
  const report = [];
  for (const [bank, list] of Object.entries(programs)) {
    list.forEach((steps, i) => {
      const r = relocate(steps, size);
      const ops = compile(steps, size);
      const a = rawMachine(steps), b = relocatedMachine(steps, size), c = compiledMachine(ops, size);
      let diff = 0, sig = 0, err = 0, out = 0;
      for (const x of testSignal(samples, i + 1)) {
        const [l1, r1] = a(x), [l2, r2] = b(x), [l3, r3] = c(x);
        diff = Math.max(diff, Math.abs(l1 - l2), Math.abs(r1 - r2));
        sig += l2 * l2 + r2 * r2; err += (l3 - l2) ** 2 + (r3 - r2) ** 2;
        out = Math.max(out, Math.abs(l3 - l2), Math.abs(r3 - r2));
      }
      const residual = sig ? 10 * Math.log10(Math.max(err, 1e-9) / sig) : -Infinity;
      report.push({ bank, index: i, used: r.used, trimmed: r.trimmed, diff, ops: ops.length, residual, out });
    });
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const size = Number(arg('--size') ?? 15614); // 15,870 below Sidechain's window, less the program area
  const programs = {};
  for (const kind of Object.keys(ROMS)) {
    const p = arg(`--${kind.toLowerCase()}`);
    if (p) programs[kind] = readRom(p, kind);
  }
  const report = check(programs, size, Number(arg('--samples') ?? 24000));
  const bad = report.filter((r) => !r.trimmed && r.diff !== 0);
  for (const kind of Object.keys(programs)) {
    const rows = report.filter((r) => r.bank === kind);
    console.log(`${kind}: ${rows.length} programs, ${rows.filter((r) => r.trimmed).length} trimmed to ${size} words, ` +
      `max words ${Math.max(...rows.map((r) => r.used))}, worst trimmed diff ${Math.max(0, ...rows.filter((r) => r.trimmed).map((r) => r.diff))}`);
  }
  const outWorst = Math.max(...report.map((r) => r.out));
  console.log(`DSP form: ops max ${Math.max(...report.map((r) => r.ops))}, mean ${(report.reduce((n, r) => n + r.ops, 0) / report.length).toFixed(1)}; ` +
    `largest output difference from the original ${outWorst} (output taps read a halved word)`);
  if (outWorst > 2) { console.error('the DSP form left the original arithmetic'); process.exit(1); }
  if (bad.length) { console.error('relocation changed untrimmed programs:', bad); process.exit(1); }
  console.log('untrimmed programs: bit-identical to the original machine');
  if (process.argv.includes('--write') && programs.MV1) {
    const pick = process.argv.includes('--all') ? programs.MV1.map((_, i) => i) : TRIAL;
    const trial = pick.map((i) => ({ bank: 'MV1', number: i + 1, label: MV1_NAMES[i],
      trimmed: relocate(programs.MV1[i], size).trimmed, words: encode(compile(programs.MV1[i], size)) }));
    if (!arg('--out')) {
      const popup = join(HERE, 'popup.s'), text = readFileSync(popup, 'utf8');
      const names = trial.map((t) => { const n = fullName(t.label); return `        .ascii  "${n}"\n        .space  ${20 - n.length}\n`; }).join('');
      writeFileSync(popup, text.replace(/(\| names begin\n)[\s\S]*(\| names end)/, `$1${names}$2`));
    }
    writeFileSync(arg('--out') ?? OUT, '{"size": ' + size + ', "programs": [\n' +
      trial.map((t) => JSON.stringify(t)).join(',\n') + '\n]}\n');
    console.log(`wrote ${arg('--out') ?? OUT}: ${trial.length} programs, ${trial.reduce((n, t) => n + t.words.length, 0)} words`);
  }
}
