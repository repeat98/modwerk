#!/usr/bin/env node
// Print the DSP programs the Quadraverb firmware builds, or map record bytes to steps.
//
//   node dump.mjs <rom> <program> [<program> ...]   programs side by side
//   node dump.mjs <rom> --sweep <program>           which record bytes change which steps
//
// A step prints as: index, op (5 bits), delay address, coefficient (unsigned, /2048).
import console from 'node:console';
import process from 'node:process';
import { Board } from './machine.mjs';

export const coef = (c, o) => ((c << 3) | (o >> 5)) / 2048;
export const step = ([a, c, o], i) =>
  `${i.toString(16).padStart(2, '0')} ${(o & 0x1f).toString(2).padStart(5, '0')} ${a.toString(16).padStart(4, '0')} ${coef(c, o).toFixed(4)}`;

const [rom, ...args] = process.argv.slice(2);
if (!rom || !args.length) { console.error('usage: node dump.mjs <rom> <program...> | --sweep <program>'); process.exit(2); }
const b = new Board(rom).boot();

if (args[0] === '--sweep') {
  const p = +args[1], rec = b.record(p), orig = rec.slice(), base = b.recall(p);
  for (let off = 0; off < 0x6a; off++) {
    const changed = new Set();
    for (const delta of [1, -1, 10]) {
      rec.set(orig); rec[off] = (orig[off] + delta) & 0xff;
      b.recall(p).forEach((s, i) => { if (s.join() !== base[i].join()) changed.add(i); });
    }
    if (changed.size) console.log(`${off.toString(16).padStart(2, '0')}=${orig[off]}: ${[...changed].map((i) => i.toString(16)).join(',')}`);
  }
  rec.set(orig);
} else {
  const progs = args.map((p) => b.recall(+p));
  for (let i = 0; i < progs[0].length; i++) console.log(progs.map((pr) => step(pr[i], i)).join('  |  '));
}
