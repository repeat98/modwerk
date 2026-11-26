#!/usr/bin/env node
// Midiverb program generator. Reads the Alesis Midiverb, Midiverb II and Midifex
// ROM dumps on the developer's computer (they never enter the repository) and
// writes programs.json: every program as delay lines relocated into the module's
// smaller ring, plus the checks that prove the relocation plays the same notes.
//
// Machine semantics follow Eric Brombaugh's MIT reverse engineering
// (github.com/emeb/MIDIVerb_RE) and the ROM layouts documented by thement
// (github.com/thement/midiverb_emulator). The Midiverb II's chorus and flange LFOs are
// read from its own 8031 firmware, which --firmware runs (i8051.mjs). Owner waiver,
// 25 Nov 2026.
//
//   node generate.mjs --mv1 <rom> --mv2 <rom> --fex <rom> [--write] [--check]
//   node generate.mjs --mv2 <rom> --firmware [updates] [--states FILE]   (FILE: verify.py --lfo)

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
// paces the loop on the hardware is not read: in firmware.mjs the loop runs free, 257 to 506 machine cycles a pass).
// lfoStep and lfoPatch are checked against the firmware itself: `--firmware` runs its 8031 code (firmware.mjs) and
// compares every patched program byte and the LFOs' RAM, update by update. Read from its disassembly (26 Nov 2026):
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

// The LFO programs on the DSP. An LFO moves only addresses: steps 4-47 (49-92) sit w words lower in memory, w that
// LFO's integer part, and two reads in them (46, 47; 91, 92) take their places from the row of the interpolation
// table its fraction picks; every op stays. lfoForm reads that from lfoPatch itself (the positions at w = 0 and at
// w = 1, every row at w = 0) and holds it against lfoPatch on 3,000 other states. These programs span under 9,000
// words, so they run on the ring with their own addresses (no relocation): check() proves the ring plays what
// the original's 16K play, bit for bit.
const LFO_RAM = [{ frac: 0x56, int: 0x57, centre: 0x58, rate: 0x66, x: 0x4e, y: 0x50, bit: 5 },
  { frac: 0x53, int: 0x54, centre: 0x55, rate: 0x65, x: 0x4a, y: 0x4c, bit: 6 }];
const signed14 = (x) => (x >= 0x3000 ? x - DRAM : x); // every position of these programs lies in -1,129..8,013
function lfoPositions(lfo, w, row) {
  const ram = Uint8Array.from(lfo.ram), bytes = Uint8Array.from(lfo.page);
  LFO_RAM.forEach((L, l) => { ram[L.int] = w[l] & 0xff; ram[L.centre] = w[l] >> 8; ram[L.frac] = row[l] << 4; });
  const steps = decode(lfoPatch(lfo, ram, bytes), 1);
  let s = 0; const pos = [];
  for (const [, off] of steps) { pos.push(signed14(s)); s = (s + off) & (DRAM - 1); }
  if (s !== 1) throw new Error(`pointer moves ${s} per sample, expected 1`);
  return { steps, pos };
}
export function lfoForm(lfo) {
  const ref = lfoPositions(lfo, [0, 0], [0, 0]);
  const win = [0, 1].map((l) => { const p = lfoPositions(lfo, l ? [0, 1] : [1, 0], [0, 0]).pos; return ref.pos.map((x, pc) => p[pc] - x === -1); });
  const rows = [0, 1].map((l) => Array.from({ length: 16 }, (_, r) => lfoPositions(lfo, [0, 0], l ? [0, r] : [r, 0]).pos));
  const moves = rows.map((rs) => ref.pos.map((x, pc) => rs.some((p) => p[pc] !== x)));
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) % n; };
  for (let t = 0; t < 3000; t++) {
    const w = [rnd(1100), rnd(1100)], row = [rnd(16), rnd(16)], { steps, pos } = lfoPositions(lfo, w, row);
    pos.forEach((x, pc) => {
      const want = (moves[0][pc] ? rows[0][row[0]][pc] : moves[1][pc] ? rows[1][row[1]][pc] : ref.pos[pc])
        - (win[0][pc] ? w[0] : 0) - (win[1][pc] ? w[1] : 0);
      if (x !== want || steps[pc][0] !== ref.steps[pc][0]) throw new Error(`step ${pc} leaves the LFO form at w ${w}, row ${row}`);
    });
  }
  return { ref, win, rows, moves };
}
// The LFO's state after an update: each LFO's w and row.
const lfoNow = (ram) => ({ w: LFO_RAM.map((L) => ram[L.centre] * 256 + ram[L.int]), row: LFO_RAM.map((L) => ram[L.frac] >> 4) });

// The original's arithmetic, its 16-bit words whole, on `size` words at the program's own addresses.
export function directMachine(lfo, size) {
  const { ref, win, rows, moves } = lfoForm(lfo), ram = Uint8Array.from(lfo.ram), ops = ref.steps.map(([op]) => op);
  const dram = new Int16Array(size);
  let acc = 0, p = 0, n = 0, pos = null;
  const machine = (input) => {
    if (n++ % LFO_EVERY === 0) {
      lfoStep(lfo, ram);
      const { w, row } = lfoNow(ram);
      pos = ref.pos.map((x, pc) => (moves[0][pc] ? rows[0][row[0]][pc] : moves[1][pc] ? rows[1][row[1]][pc] : x)
        - (win[0][pc] ? w[0] : 0) - (win[1][pc] ? w[1] : 0));
    }
    let left = 0, right = 0;
    for (let pc = 0; pc < 128; pc++) {
      const op = ops[pc], a = ((p + pos[pc]) % size + size) % size;
      let data, next;
      if (op < 2) { data = dram[a]; next = (op === 0 ? acc : 0) + half(data); }
      else { data = op === 2 ? acc : i16(~acc); dram[a] = data; next = (op === 2 ? acc : 0) + half(data); }
      if (pc === 0x60) right = data;
      else if (pc === 0x70) left = data;
      else if (pc === 0) dram[a] = input;
      else acc = i16(next);
    }
    p = (p + 1) % size;
    return [left, right];
  };
  machine.dram = dram;
  return machine;
}

// The DSP form of an LFO program, as compile's: each live access [kind, ring offset], with the LFO window it moves in
// (1, 2; 0 none) and, for a row's read, the 16 rows' ring offsets.
export function compileLfo(lfo, size) {
  const { ref, win, rows, moves } = lfoForm(lfo), live = liveReads(ref.steps), ring = (x) => ((x % size) + size) % size;
  const ops = [];
  for (let pc = 0; pc < 128; pc++) {
    const op = ref.steps[pc][0], l = moves[0][pc] ? 0 : moves[1][pc] ? 1 : -1;
    let kind;
    if (pc === 0) kind = 'in';
    else if (OUTPUT(pc)) { if (op >= 2) throw new Error('a store at an output step'); kind = pc === 0x60 ? 'outR' : 'outL'; }
    else if (op >= 2) kind = op === 2 ? 'st' : 'stn';
    else if (live[pc]) kind = op === 0 ? 'mac' : 'ld';
    else continue;
    const o = [kind, ring(ref.pos[pc])];
    o.win = win[0][pc] ? 1 : win[1][pc] ? 2 : 0;
    if (l >= 0) o.rows = rows[l].map((p) => ring(p[pc]));
    if ((kind === 'in' || kind.startsWith('out')) && (o.win || o.rows)) throw new Error(`${kind} moves with an LFO`);
    ops.push(o);
  }
  return ops;
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
export const HANDLER = ['run', 'st', 'stc', 'stn', 'stnc', 'outR', 'outRc', 'outL', 'outLc', 'end', 'tick', 'sh'];
export const SLOT = 24;
export const READS = 7;
export const PROGRAM_WORDS = 262;
const NO_READS = ['end', 'tick'];
const handler = (kind, k) => SLOT * HANDLER.indexOf(kind) + (NO_READS.includes(kind) ? 0 : 2 * (READS - k));
const checksum = (words) => (words.reduce((t, w) => (t + w) & 0xffff, 0) ^ 0xa5a5);
function program(body, what = 'a program') {
  const words = [0x8000 | (body.length + 1), ...body];
  if (words.some((w) => w < 0 || w > 0xffff)) throw new Error('a program word passes 16 bits: the stream carries 16');
  if (words.length + 1 > PROGRAM_WORDS) throw new Error(`${what} of ${words.length + 1} words passes the ${PROGRAM_WORDS}-word area`);
  return [...words, checksum(words)];
}
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
  return program(body);
}

// An LFO program: [header][input][tick][its LFO block, from r2] units [end] [LFO block] [checksum]. 'tick' runs the
// LFO update on the program's first sample and every LFO_EVERY after; 'sh' moves the ring pointer by its word, into
// a window (the update writes size - w there) and out of it (w). The block holds, for each LFO, [mode] [rate]
// [limit] [y0] [base] and the words the update writes, from r2: [sh in] [sh out] [row read] [row read], then the 16
// rows' two read offsets; after both LFOs, 3. Mode 0 is a triangle (limit: its ceiling), 1 a sine, 2 a sine read 2
// bits over (limit: the clamp << 8; y0 where its y starts). The engine keeps (position, rising) or (x, y - y0) for
// each, so every program starts from zeros (r7+$1c-$1f); w = base + (value >> 8), the row (value >> 4) & 15.
export function encodeLfo(lfo, ops) {
  if (ops[0]?.[0] !== 'in' || ops[1]?.[0] !== 'ld') throw new Error('a program must start with the input and a load');
  const body = [ops[0][1], handler('tick', 0), 0], sh = [[], []], rowAt = [[], []];
  let reads = [], win = 0, clear = true;
  const read = (o) => { if (o.rows) rowAt[o.win - 1].push(body.length); body.push(o[1]); };
  const unit = (kind, arg) => {
    while (reads.length > READS) { const r = reads.splice(0, READS); body.push(handler('run', r.length)); r.forEach(read); }
    body.push(handler(kind, reads.length)); reads.forEach(read); reads = [];
    body.push(arg);
  };
  for (let i = 1; i < ops.length; i++) {
    const o = ops[i], [kind] = o;
    if (o.win !== win) {                                   // the pointer moves before this access
      if (win) { unit('sh', 0); sh[win - 1][1] = body.length - 1; }
      if (o.win) { unit('sh', 0); sh[o.win - 1][0] = body.length - 1; }
      win = o.win;
    }
    if (kind === 'ld' && !clear) throw new Error('a load the step before did not clear for');
    if (kind === 'mac' || kind === 'ld') { reads.push(o); clear = false; continue; }
    if (!['st', 'stn', 'outR', 'outL'].includes(kind)) throw new Error(`${kind}: the engine has no handler for it here`);
    clear = ops[i + 1]?.[0] === 'ld';
    unit(clear ? `${kind}c` : kind, o[1]);
  }
  if (reads.length || win) throw new Error('reads after the last operation, or a window left open');
  body.push(handler('end', 0));
  body[2] = body.length;
  LFO_RAM.forEach((L, l) => {
    const rows = ops.filter((o) => o.rows && o.win === l + 1);
    if (rows.length !== 2 || rowAt[l].length !== 2 || sh[l].length !== 2) throw new Error(`LFO ${l + 1}: not two row reads in its window`);
    const centre = lfo.ram[L.centre], rate = lfo.ram[L.rate];
    if (lfo.kind === 'tri') {
      if (lfo.ram[L.int] || lfo.ram[L.frac] || (lfo.ram[0x20] >> L.bit & 1)) throw new Error('a triangle that does not start at 0, falling');
      body.push(0, rate, lfo.ceiling, 0, centre * 256);
    } else {
      const y0 = i16((lfo.ram[L.y + 1] << 8) | lfo.ram[L.y]);
      if (lfo.ram[L.x] || lfo.ram[L.x + 1] || y0 < 0) throw new Error('a sine that does not start at x = 0, y >= 0');
      body.push(lfo.shift ? 2 : 1, rate, lfo.clamp << 8, y0, centre * 256 + 128);
    }
    body.push(...sh[l], ...rowAt[l]);
    for (let r = 0; r < 16; r++) body.push(rows[0].rows[r], rows[1].rows[r]);
  });
  body.push(3);
  return program(body, 'an LFO program');
}

// The engine's LFO update on a program's words (r2 at words[1]) and its four state words: what engine.asm's mvqLFOU
// computes. A sine's step is the firmware's: the 8031's signed multiply (mul8) and its clamp, on whole integers.
const M8 = (t, r) => (t >= 0 ? (t * r) >> 8 : ~((~t * r) >> 8));
const clamp16 = (v, lim) => (v >= lim ? lim - 1 : v < -lim ? -lim : v);
export function lfoUpdate(words, state, size) {
  const w = (i) => words[1 + i];
  for (let at = w(2), l = 0; w(at) !== 3; at += 9 + 32, l++) {
    const mode = w(at), rate = w(at + 1), lim = w(at + 2), y0 = w(at + 3), base = w(at + 4);
    let value;
    if (mode === 0) {
      let u = state[2 * l], up = state[2 * l + 1];
      if (up) { u += rate; if (u > lim) { u = lim; up = 0; } } else { u -= rate; if (u < 0) { u = 0; up = 1; } }
      state[2 * l] = u; state[2 * l + 1] = up; value = u;
    } else {
      const s = mode === 2 ? 2 : 0;
      let x = state[2 * l], y = state[2 * l + 1] + y0;
      y = clamp16(y + M8((x << s) >> 8, rate), lim);
      x = clamp16(x + ~M8((y << s) >> 8, rate), lim);
      state[2 * l] = x; state[2 * l + 1] = y - y0; value = x >> s;
    }
    const ww = base + (value >> 8), row = (value >> 4) & 15;
    words[1 + w(at + 5)] = (size - ww) % size; words[1 + w(at + 6)] = ww;
    words[1 + w(at + 7)] = w(at + 9 + 2 * row); words[1 + w(at + 8)] = w(at + 10 + 2 * row);
  }
}

// The engine on a program's words, unit by unit, as verify.py's model runs them: what the DSP computes.
export function wordMachine(program, size) {
  const words = [...program], word = new Int16Array(size), state = [0, 0, 0, 0];
  let p = 0, count = 0;
  const machine = (input) => {
    let at = p, left = 0, right = 0, acc = 0, i = 2;
    const w = (off) => (at + off) % size;
    word[w(words[1])] = half(input);
    for (;;) {
      const h = words[i++], kind = HANDLER[Math.floor(h / SLOT)];
      if (kind === 'end') break;
      if (kind === 'tick') { if (--count <= 0) { lfoUpdate(words, state, size); count = LFO_EVERY; } i++; continue; }
      for (let k = READS - (h % SLOT) / 2; k > 0; k--) acc = i16(acc + word[w(words[i++])]);
      if (kind === 'run') continue;
      const a = words[i++], op = kind.endsWith('c') ? kind.slice(0, -1) : kind, x = op === 'stn' ? i16(~acc) : acc;
      if (op === 'st') { word[w(a)] = half(x); acc = i16(x + word[w(a)]); }
      else if (op === 'stn') { word[w(a)] = half(x); acc = word[w(a)]; }
      else if (op === 'outR') right = 2 * word[w(a)];
      else if (op === 'outL') left = 2 * word[w(a)];
      else at = (at + a) % size;                          // sh
      if (kind.endsWith('c')) acc = 0;
    }
    if (at !== p) throw new Error('the ring pointer did not come back');
    p = (p + 1) % size;
    return [left, right];
  };
  machine.word = word;
  return machine;
}

// Every program the stream carries: each bank in chart order, less Midiverb II's Defeat (0). Since the read-ladder
// engine (26 Nov 2026) every program fits; the dearest, Midiverb II #10, takes 316.5 executed instructions a sample
// (static.py). The chorus and flange programs (50-69) carry their LFOs (lfos: readLfo's).
export const BANKS = ['MV1', 'MV2', 'FEX'];
const FIRST = { MV1: 1, MV2: 0, FEX: 1 };
export function streamed(programs, lfos) {
  const out = [];
  for (const bank of BANKS) programs[bank].forEach((steps, i) => {
    const number = i + FIRST[bank];
    if (bank === 'MV2' && number === 0) return;
    out.push({ bank, number, steps, ...(isLfo(bank, number) ? { lfo: lfos[number] } : {}) });
  });
  return out;
}
export const programWords = (p, size) => (p.lfo ? encodeLfo(p.lfo, compileLfo(p.lfo, size)) : encode(compile(p.steps, size)));
// The message box holds 19 characters.
export function shortName(name) {
  const n = name.toUpperCase().replace('REGENERATED', 'REGEN').replace(/ SEC\b/, 'S').replace('  ', ' ').trim();
  return n.length > 19 ? n.slice(0, 19).trimEnd() : n;
}
// stream.h for the ColdFire: every streamed program's words (its count first), where each starts, each bank's
// first program and count, and the names stock's message box shows.
export function streamHeader(list, size, names) {
  const words = [], start = [];
  for (const p of list) { start.push(words.length); words.push(...programWords(p, size)); }
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
    const burst = i % 40000 < Math.min(n / 4, 10000) ? ((x >>> 16) & 0xfff) - 0x800 : 0;
    out[i] = (burst & ~1); // 13-bit input with the 12-bit converter's clear LSB
  }
  return out;
}

// Every program: the original (a), the same in the ring (b: relocated, or for an LFO program at its own addresses)
// and the streamed words as the engine runs them (c). b must equal a where nothing was trimmed; c may differ from b
// by the output taps' lowest bit. An LFO program runs LFO_SAMPLES, a full period of its slowest LFO and more, and
// its ring must end holding exactly the halves of b's words.
export const LFO_SAMPLES = 200000;
export function check(programs, size, samples = 48000, lfos = null) {
  const report = [];
  for (const [bank, list] of Object.entries(programs)) {
    list.forEach((steps, i) => {
      const lfo = isLfo(bank, i) && lfos ? lfos[i] : null;
      if ((isLfo(bank, i) && !lfo) || (bank === 'MV2' && i === 0)) return; // Defeat is not streamed
      const r = lfo ? { used: 0, trimmed: false } : relocate(steps, size);
      const words = programWords({ steps, lfo }, size);
      const a = lfo ? lfoMachine(lfo) : rawMachine(steps), b = lfo ? directMachine(lfo, size) : relocatedMachine(steps, size);
      const c = wordMachine(words, size);
      let diff = 0, sig = 0, err = 0, out = 0;
      for (const x of testSignal(lfo ? LFO_SAMPLES : samples, i + 1)) {
        const [l1, r1] = a(x), [l2, r2] = b(x), [l3, r3] = c(x);
        diff = Math.max(diff, Math.abs(l1 - l2), Math.abs(r1 - r2));
        sig += l2 * l2 + r2 * r2; err += (l3 - l2) ** 2 + (r3 - r2) ** 2;
        out = Math.max(out, Math.abs(l3 - l2), Math.abs(r3 - r2));
      }
      if (lfo && b.dram.some((v, k) => half(v) !== c.word[k])) out = Infinity;
      const residual = sig ? 10 * Math.log10(Math.max(err, 1e-9) / sig) : -Infinity;
      report.push({ bank, index: i, used: r.used, trimmed: r.trimmed, diff, ops: words.length, residual, out, lfo: !!lfo });
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

// --firmware [updates]: lfoStep and lfoPatch against the Midiverb II's own 8031 code, run by i8051.mjs. Each LFO
// program is picked the firmware's way (0x23 = p, LCALL 0x49c) after its boot; at every entry to the patch routine
// (0x61f) the DSP's program RAM must hold the model's bytes from the update before, and the LFOs' RAM the model's.
// 14,000 updates: a full period of the slowest LFO (program 54, 13,100) and more. --states FILE writes, for verify.py
// --lfo, each update's LFO state as the engine keeps it, read from the firmware's RAM, and the eight words lfoUpdate
// writes into the program then.
const LFO_BYTES = [0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x65, 0x66];
function engineState(lfo, ram) {
  return LFO_RAM.flatMap((L) => (lfo.kind === 'tri'
    ? [(ram[L.int] << 8) | ram[L.frac], (ram[0x20] >> L.bit) & 1]
    : [i16((ram[L.x + 1] << 8) | ram[L.x]), i16((ram[L.y + 1] << 8) | ram[L.y]) - i16((lfo.ram[L.y + 1] << 8) | lfo.ram[L.y])]));
}
async function firmwareCheck(path, lfos, updates, size, statesFile) {
  const { I8051 } = await import('./i8051.mjs');
  const rom = readFileSync(path), code = new Uint8Array(0x10000);
  code.set(rom, 0); code.set(rom, 0x8000);
  const bad = [], gaps = [], out = {};
  for (const [p, lfo] of Object.entries(lfos)) {
    const dsp = new Uint8Array(256);
    let latch = 0, last = 0;
    const cpu = new I8051(code, { xwrite: (a, v) => { if (a === 0xff01) latch = v; else if (a === 0xff00) dsp[latch] = v; } });
    for (const end = 1_500_000; cpu.cycles < end;) cpu.step();
    while (cpu.pc !== 0x17c) cpu.step();
    cpu.iram[0x23] = Number(p); cpu.call(0x49c);
    const ram = Uint8Array.from(lfo.ram), bytes = Uint8Array.from(lfo.page);
    const words = encodeLfo(lfo, compileLfo(lfo, size)), state = [0, 0, 0, 0], w = (i) => words[1 + i];
    const at = [w(2), w(2) + 41], slots = at.flatMap((a) => [5, 6, 7, 8].map((j) => w(a + j)));
    const rec = out[p] = { states: [], words: [] };
    for (let n = 0; n <= updates && bad.length === 0;) {
      cpu.step();
      if (cpu.pc !== 0x61f) continue;
      if (n > 1) gaps.push(cpu.cycles - last);
      last = cpu.cycles;
      const k = dsp.findIndex((b, i) => b !== bytes[i]);
      if (k >= 0) bad.push(`Midiverb II ${p}, update ${n}: program byte 0x${k.toString(16)} is ${dsp[k]}, the model ${bytes[k]}`);
      if (n++ === updates) break;
      lfoStep(lfo, ram);
      const a = LFO_BYTES.find((x) => cpu.iram[x] !== ram[x]) ?? ((cpu.iram[0x20] ^ ram[0x20]) & 0x60 ? 0x20 : undefined);
      if (a !== undefined) bad.push(`Midiverb II ${p}, update ${n}: RAM 0x${a.toString(16)} is ${cpu.iram[a]}, the model ${ram[a]}`);
      lfoPatch(lfo, ram, bytes);
      lfoUpdate(words, state, size);
      rec.states.push(engineState(lfo, cpu.iram));
      rec.words.push(slots.map((i) => words[1 + i]));
      if (rec.states[n - 1].some((v, i) => v !== state[i])) bad.push(`Midiverb II ${p}, update ${n}: lfoUpdate's state ${state}, the firmware's ${rec.states[n - 1]}`);
    }
  }
  gaps.sort((x, y) => x - y);
  console.log(`firmware: ${Object.keys(lfos).length} LFO programs, ${updates} updates each: ` +
    (bad.length ? `${bad.length} differences` : 'every patched program byte, the LFOs\' RAM and lfoUpdate\'s state equal the firmware\'s') +
    `; its main loop runs free here, ${gaps[0]} to ${gaps[Math.floor(gaps.length * 0.999)]} machine cycles a pass ` +
    `(a rare one ${gaps[gaps.length - 1]}; what paces it on the unit is not read)`);
  if (statesFile) { writeFileSync(statesFile, JSON.stringify(out)); console.log(`wrote ${statesFile}`); }
  return bad;
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
  const lfos = programs.MV2 ? readLfo(arg('--mv2')) : null;
  if (process.argv.includes('--firmware')) {
    if (!lfos) { console.error('--firmware needs --mv2'); process.exit(2); }
    const n = Number(process.argv[process.argv.indexOf('--firmware') + 1]) || 14000;
    const bad = await firmwareCheck(arg('--mv2'), lfos, n, size, arg('--states'));
    if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
    process.exit(0);
  }
  const report = check(programs, size, Number(arg('--samples') ?? 24000), lfos);
  const bad = report.filter((r) => !r.trimmed && r.diff !== 0);
  for (const kind of Object.keys(programs)) {
    const rows = report.filter((r) => r.bank === kind && !r.lfo);
    console.log(`${kind}: ${rows.length} programs, ${rows.filter((r) => r.trimmed).length} trimmed to ${size} words, ` +
      `max words ${Math.max(...rows.map((r) => r.used))}, worst trimmed diff ${Math.max(0, ...rows.filter((r) => r.trimmed).map((r) => r.diff))}`);
  }
  const lfoRows = report.filter((r) => r.lfo);
  if (lfoRows.length) console.log(`MV2 chorus and flange: ${lfoRows.length} programs with their LFOs, ${LFO_SAMPLES} samples each, at their own addresses in the ring`);
  const outWorst = Math.max(...report.map((r) => r.out));
  console.log(`streamed words: at most ${Math.max(...report.map((r) => r.ops))} a program; ` +
    `largest output difference from the original ${outWorst} (output taps read a halved word)`);
  if (outWorst > 2) { console.error('the streamed words left the original arithmetic'); process.exit(1); }
  if (bad.length) { console.error('relocation changed untrimmed programs:', bad); process.exit(1); }
  console.log('untrimmed programs: bit-identical to the original machine' + (lfoRows.length ? ', LFO programs and their ring state included' : ''));
  if (process.argv.includes('--write') && programs.MV1 && programs.MV2 && programs.FEX) {
    const names = JSON.parse(readFileSync(join(HERE, 'names.json'), 'utf8'));
    const list = streamed(programs, lfos);
    writeFileSync(join(HERE, 'stream.h'), streamHeader(list, size, names));
    writeFileSync(OUT, '{"size": ' + size + ', "programs": [\n' + list.map((p) =>
      JSON.stringify({ bank: p.bank, number: p.number, words: programWords(p, size) })).join(',\n') + '\n]}\n');
    console.log(`wrote stream.h and programs.json: ${list.length} programs`);
  }
}
