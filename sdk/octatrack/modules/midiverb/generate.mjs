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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import console from 'node:console';
import process from 'node:process';

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
  const writes = steps.map((_, pc) => pc).filter((pc) => pc === 0 || steps[pc][0] >= 2);
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

// One program as streamed: a header ($8000 | N, N the words after it), the units, a checksum (the low 16 bits of
// the sum of every word before it, xor $a5a5). Units are [handler * SLOT][argument]: a run of k reads is [0][k] then
// k ring offsets; every other operation is [handler * SLOT][ring offset]: the handler's offset from engine.asm's
// mvqJTAB, where the handlers sit SLOT words apart in this order, so a unit's word is where it jumps.
// The engine keeps the whole program above the ring (262 words at most).
export const HANDLER = ['run', 'st', 'ld', 'stn', 'in', 'outR', 'outL', 'stR', 'stL', 'stnR', 'stnL', 'end'];
export const SLOT = 16;
export const PROGRAM_WORDS = 262;
export function encode(ops) {
  const body = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i][0] === 'mac') {
      let j = i; while (j < ops.length && ops[j][0] === 'mac') j++;
      body.push(0, j - i, ...ops.slice(i, j).map(([, a]) => a));
      i = j;
    } else { body.push(SLOT * HANDLER.indexOf(ops[i][0]), ops[i][1]); i++; }
  }
  body.push(SLOT * HANDLER.indexOf('end'), 0);
  const words = [0x8000 | (body.length + 1), ...body];
  if (words.length + 1 > PROGRAM_WORDS) throw new Error(`a program of ${words.length + 1} words passes the ${PROGRAM_WORDS}-word area`);
  return [...words, (words.reduce((t, w) => (t + w) & 0xffff, 0) ^ 0xa5a5)];
}

// Every program the stream carries: each bank in chart order, less Midiverb II's Defeat (0) and its 20 chorus and
// flange programs (50-69, which patch their own code from an LFO: not handled yet), less the 31 programs that cost
// more than 400 executed instructions a sample on the engine with direct dispatch (dsp_host, 25 Nov 2026: each
// streamed by its index at LEVL 127 and MIX 127, the worst of unsplit and split at frames 1 and 7). The base lets one
// instance declare at most 414; these cost 401 to 558.
export const OVER_BUDGET = {
  MV1: [9, 10, 11, 13],
  FEX: [12, 23, 34, 35],
  MV2: [1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 27, 30, 31, 32, 33, 34],
};
export const BANKS = ['MV1', 'MV2', 'FEX'];
const FIRST = { MV1: 1, MV2: 0, FEX: 1 };
export function streamed(programs) {
  const out = [];
  for (const bank of BANKS) programs[bank].forEach((steps, i) => {
    const number = i + FIRST[bank];
    if (bank === 'MV2' && (number === 0 || (number >= 50 && number <= 69))) return;
    if (OVER_BUDGET[bank].includes(number)) return;
    out.push({ bank, number, steps });
  });
  return out;
}
// The message box holds 19 characters.
export function shortName(name) {
  const n = name.toUpperCase().replace('REGENERATED', 'REGEN').replace(/ SEC\b/, 'S').replace('  ', ' ').trim();
  return n.length > 19 ? n.slice(0, 19).trimEnd() : n;
}
// stream.h for the ColdFire: every streamed program's words (its count first), where each starts, each bank's
// first program and count, and the names stock's message box shows.
export function streamHeader(list, size, names) {
  const words = [], start = [];
  for (const p of list) { start.push(words.length); words.push(...encode(compile(p.steps, size))); }
  if (words.some((w) => w > 0xffff)) throw new Error('a program word passes 16 bits: the stream carries 16');
  const first = BANKS.map((b) => list.findIndex((p) => p.bank === b)), count = BANKS.map((b) => list.filter((p) => p.bank === b).length);
  const name = (p) => shortName(names[p.bank][p.number - FIRST[p.bank]]);
  const rows = (arr, per) => arr.reduce((t, v, i) => t + (i % per ? ' ' : '\n    ') + v + ',', '');
  return `/* Generated by generate.mjs --write: the programs Midiverb streams (${list.length}). Ring ${size} words. */\n` +
    `#define MV_PROGRAMS ${list.length}\n` +
    `static const unsigned short mv_words[${words.length}] = {${rows(words, 16)}\n};\n` +
    `static const unsigned short mv_start[MV_PROGRAMS] = {${rows(start, 16)}\n};\n` +
    `static const unsigned char mv_bank_first[3] = {${first.join(', ')}}, mv_bank_count[3] = {${count.join(', ')}};\n` +
    `static const char mv_names[MV_PROGRAMS][20] = {${list.map((p, i) => (i % 4 ? ' ' : '\n    ') + JSON.stringify(name(p)) + ',').join('')}\n};\n`;
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

// stream.s, the unit manifest.py links: stream.c compiled for the ColdFire, then entry.s. --stream writes it,
// --stream --check exits 1 when it is stale. Needs m68k-elf-gcc; no ROM.
const CF_FLAGS = ['-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-common',
  '-fno-jump-tables', '-fno-asynchronous-unwind-tables', '-fno-ident', '-fomit-frame-pointer'];
function streamSource() {
  const asm = execFileSync('m68k-elf-gcc', [...CF_FLAGS, '-S', '-o', '-', join(HERE, 'stream.c')], { encoding: 'utf8' });
  return '| Generated by generate.mjs --stream from stream.c (and stream.h) and entry.s; edit those.\n' + asm + '\n' +
    readFileSync(join(HERE, 'entry.s'), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (process.argv.includes('--stream')) {
    const text = streamSource(), dest = join(HERE, 'stream.s');
    if (process.argv.includes('--check')) {
      if (!existsSync(dest) || readFileSync(dest, 'utf8') !== text) { console.error('stream.s is stale: node generate.mjs --stream'); process.exit(1); }
      console.log('stream.s matches stream.c, stream.h and entry.s');
    } else { writeFileSync(dest, text); console.log('wrote stream.s'); }
    process.exit(0);
  }
  const size = Number(arg('--size') ?? 15608); // 15,870 below Sidechain's window, less the 262-word program area
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
  if (process.argv.includes('--write') && programs.MV1 && programs.MV2 && programs.FEX) {
    const names = JSON.parse(readFileSync(join(HERE, 'names.json'), 'utf8'));
    const list = streamed(programs);
    writeFileSync(join(HERE, 'stream.h'), streamHeader(list, size, names));
    writeFileSync(OUT, '{"size": ' + size + ', "programs": [\n' + list.map((p) =>
      JSON.stringify({ bank: p.bank, number: p.number, words: encode(compile(p.steps, size)) })).join(',\n') + '\n]}\n');
    console.log(`wrote stream.h and programs.json: ${list.length} programs`);
  }
}
