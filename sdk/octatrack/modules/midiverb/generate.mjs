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

// The Midiverb II's chorus and flange programs (50-69). Its 8031 controller patches the running program from two
// LFOs, once a pass of its main loop (assumed one pass every 8 samples, the cadence thement's emulator uses; what
// paces the loop on the hardware is not read). Read from the firmware's disassembly (26 Nov 2026):
//   0x302 dispatches program p to the update routine named at 0x32a + 2(p - 50) and, on the first pass after a
//   program change, to the setup routine at 0x352 + 2(p - 50) instead (it sets rates, centre and the store op;
//   it does not patch). Updates: triangles 0x6df (ceiling 0x3fff), 0x75f (0x7fff), 0x7df (0xffff), entered at
//   0x6ca, 0x74a, 0x7ca by the triggered flanges (50, 53, 57), whose trigger input (0x60f) is never modelled here;
//   magic-circle sines 0x848 (clamp 0x7f), 0x929 (0x3f), 0xa0a (0x1f, the multiplier and output taken 2 bits over).
//   Then the patch at 0x61f writes program bytes 05/06 and 59-5e (LFO 1), 5f/60 and b3-b8 (LFO 2) from the
//   16-row table at 0x1b00, its row the LFO's fraction >> 4: step 3's address step becomes row - w and step 47's
//   row + w (w the LFO's integer part, centre * 256 + int), steps 45 and 46 the row's, steps 4 and 49 load, steps
//   48 and 93 store with the program's op. LFO 2 does the same at steps 48, 90-92 with the row's second half.
// Internal RAM, as the firmware names it: LFO 1 fraction 0x56, integer 0x57, centre 0x58, rate 0x66; LFO 2 0x53,
// 0x54, 0x55, 0x65; store op 0x52; triangle directions 0x20 bits 5 and 6; sine state 0x4e/0x4f (x) 0x50/0x51 (y)
// for LFO 1, 0x4a/0x4b and 0x4c/0x4d for LFO 2. A program starts from that RAM cleared but for its setup (the
// firmware keeps what the last program left; this module starts every program alike).
const LFO_ROM = { update: 0x32a, setup: 0x352, table: 0x1b00 };
const LFO_ROUTINE = {
  0x6ca: { kind: 'tri', ceiling: 0x3fff, trigger: true }, 0x6df: { kind: 'tri', ceiling: 0x3fff },
  0x74a: { kind: 'tri', ceiling: 0x7fff, trigger: true }, 0x75f: { kind: 'tri', ceiling: 0x7fff },
  0x7ca: { kind: 'tri', ceiling: 0xffff, trigger: true }, 0x7df: { kind: 'tri', ceiling: 0xffff },
  0x848: { kind: 'sine', clamp: 0x7f, shift: 0 }, 0x929: { kind: 'sine', clamp: 0x3f, shift: 0 },
  0xa0a: { kind: 'sine', clamp: 0x1f, shift: 2 },
};
export const LFO_PROGRAMS = { first: 50, last: 69 };
export const isLfo = (bank, number) => bank === 'MV2' && number >= LFO_PROGRAMS.first && number <= LFO_PROGRAMS.last;

// Every program's LFO, from the ROM: its update routine and what its setup routine writes (MOV direct,#imm and
// LJMPs, followed to the main loop at 0x17c).
export function readLfo(path) {
  const rom = readFileSync(path);
  const word = (a) => (rom[a] << 8) | rom[a + 1];
  const table = Uint8Array.from(rom.subarray(LFO_ROM.table, LFO_ROM.table + 256));
  const out = {};
  for (let p = LFO_PROGRAMS.first; p <= LFO_PROGRAMS.last; p++) {
    const routine = LFO_ROUTINE[word(LFO_ROM.update + 2 * (p - LFO_PROGRAMS.first))];
    if (!routine) throw new Error(`Midiverb II ${p}: an LFO routine this generator does not know`);
    const ram = new Uint8Array(128);
    for (let a = word(LFO_ROM.setup + 2 * (p - LFO_PROGRAMS.first)), n = 0; a !== 0x17c; n++) {
      if (n > 16) throw new Error(`Midiverb II ${p}: setup does not return to the main loop`);
      if (rom[a] === 0x75) { ram[rom[a + 1]] = rom[a + 2]; a += 3; }
      else if (rom[a] === 0x02) a = word(a + 1);
      else throw new Error(`Midiverb II ${p}: setup at 0x${a.toString(16)} is not MOV direct,#imm / LJMP`);
    }
    out[p] = { ...routine, ram, table, page: Uint8Array.from(rom.subarray(0x1c00 + 256 * p, 0x1c00 + 256 * (p + 1))) };
  }
  return out;
}

// The 8031's signed 8x8 multiply (0x0b5b): the high byte of a * r, a negative a complemented before and after.
const mul8 = (a, r) => (a & 0x80 ? ~(((~a & 0xff) * r) >> 8) & 0xff : (a * r) >> 8);
const sext8 = (b) => (b << 24) >> 24;

// One pass of the firmware's update routine on its internal RAM.
export function lfoStep(lfo, ram) {
  const L = [[0x56, 0x57, 0x66, 5, 0x4e, 0x50], [0x53, 0x54, 0x65, 6, 0x4a, 0x4c]];
  for (const [frac, int, rate, bit, x, y] of L) {
    const r = ram[rate];
    if (lfo.kind === 'tri') {
      let u = (ram[int] << 8) | ram[frac];
      if (ram[0x20] >> bit & 1) {
        u += r;
        if (u > lfo.ceiling) { u = lfo.ceiling; ram[0x20] &= ~(1 << bit); }
      } else {
        u -= r;
        if (u < 0) { u = 0; ram[0x20] |= 1 << bit; }
      }
      ram[frac] = u & 0xff; ram[int] = u >> 8;
      continue;
    }
    const get = (a) => (ram[a + 1] << 8) | ram[a];
    const put = (a, v) => {
      v &= 0xffff;
      if (v >> 8 === lfo.clamp) v = ((lfo.clamp - 1) << 8) | 0xff;
      else if (v >> 8 === (~lfo.clamp & 0xff)) v = ((~lfo.clamp + 1) & 0xff) << 8;
      ram[a] = v & 0xff; ram[a + 1] = v >> 8;
    };
    const top = (v) => ((v << lfo.shift) >> 8) & 0xff; // the byte the multiply takes
    put(y, get(y) + sext8(mul8(top(get(x)), r)));
    put(x, get(x) + sext8(~mul8(top(get(y)), r) & 0xff));
    const v = i16(get(x)) >> lfo.shift;
    ram[frac] = v & 0xff; ram[int] = ((v >> 8) & 0xff) ^ 0x80;
  }
}

// The patch routine (0x61f) on the 256 program bytes.
export function lfoPatch(lfo, ram, bytes) {
  const put = (row, frac, int, centre, b) => {
    const R = lfo.table.subarray(ram[frac] & 0xf0);
    let v = R[row] - ram[int]; bytes[b[0]] = v & 0xff;
    bytes[b[1]] = ((R[row + 1] - ram[centre] - (v < 0 ? 1 : 0)) & 0x3f) | 0x40;
    for (let i = 0; i < 4; i++) bytes[b[2] + i] = R[row + 2 + i];
    v = R[row + 6] + ram[int]; bytes[b[3]] = v & 0xff;
    bytes[b[4]] = ((R[row + 7] + ram[centre] + (v > 0xff ? 1 : 0)) & 0x3f) | ram[0x52];
  };
  put(0, 0x56, 0x57, 0x58, [0x05, 0x06, 0x59, 0x5d, 0x5e]);
  put(8, 0x53, 0x54, 0x55, [0x5f, 0x60, 0xb3, 0xb7, 0xb8]);
  return bytes;
}

export const LFO_EVERY = 8; // samples between two LFO updates (assumed: the original's cadence is not read)

// The original machine with its controller: the program's bytes patched once every LFO_EVERY samples, the first
// time before the first sample, then decoded and run as rawMachine runs a fixed program.
export function lfoMachine(lfo) {
  const ram = Uint8Array.from(lfo.ram), bytes = Uint8Array.from(lfo.page);
  const steps = decode(bytes, 1);
  const run = rawMachine(steps);
  let n = 0;
  return (input) => {
    if (n++ % LFO_EVERY === 0) {
      lfoStep(lfo, ram);
      lfoPatch(lfo, ram, bytes);
      decode(bytes, 1).forEach((s, pc) => { steps[pc] = s; });
    }
    return run(input);
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

// One program as streamed: a header ($8000 | N, N the words after it), the input's ring offset, the units, a
// checksum (the low 16 bits of the sum of every word before it, xor $a5a5). Every program starts with the input's
// store and a load (frame B stores the input and clears the accumulator, so the load is a read like any other) and
// ends with nothing left in the accumulator (it does not carry into the next sample).
// A unit is [handler word][k ring offsets to read][the operation's ring offset]: it adds k words to the accumulator,
// then does its operation. The handlers sit SLOT words apart from engine.asm's mvqJTAB in HANDLER's order, each with
// READS read pairs before its operation; the handler word is where the jump lands, k pairs before the operation:
// SLOT * index + 2 * (READS - k). 'run' only reads (no offset of its own: a run longer than READS before an
// operation), a 'c' handler clears the accumulator after its operation (the next step loads), 'end' has no reads
// and no offset (SLOT * index). Stores at an output step (stR, stL, stnR, stnL) have no handler: no program has one.
// The engine keeps the whole program above the ring (262 words at most).
export const HANDLER = ['run', 'st', 'stc', 'stn', 'stnc', 'outR', 'outRc', 'outL', 'outLc', 'end'];
export const SLOT = 24;
export const READS = 7;
export const PROGRAM_WORDS = 262;
const handler = (kind, k) => SLOT * HANDLER.indexOf(kind) + (kind === 'end' ? 0 : 2 * (READS - k));
export function encode(ops) {
  if (ops[0]?.[0] !== 'in' || ops[1]?.[0] !== 'ld') throw new Error('a program must start with the input and a load');
  const body = [ops[0][1]];
  let reads = [ops[1][1]];
  for (let i = 2; i < ops.length; i++) {
    const [kind, a] = ops[i];
    if (kind === 'mac') { reads.push(a); continue; }
    if (!['st', 'stn', 'outR', 'outL'].includes(kind)) throw new Error(`${kind} at step ${i}: the engine has no handler for it here`);
    while (reads.length > READS) { const r = reads.splice(0, READS); body.push(handler('run', r.length), ...r); }
    const clear = ops[i + 1]?.[0] === 'ld';
    body.push(handler(clear ? `${kind}c` : kind, reads.length), ...reads, a);
    reads = clear ? [ops[++i][1]] : [];
  }
  if (reads.length) throw new Error('reads after the last operation: the accumulator does not carry into the next sample');
  body.push(handler('end', 0));
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
