// Every factory program as the DSP holds it once the firmware has settled, with integer coefficients, for the
// engine's generator (qvgen.py). A program counts as static when 30 snapshots 0.2 s apart are identical (no sweep,
// pitch shift or Leslie moves its addresses or coefficients).
//   node extract.mjs <rom> <out.json>
// The output is derived from the ROM: keep it outside the repository (~/.cache/modwerk-local/quadraverb/engine/).
import { writeFileSync } from 'node:fs';
import { Board } from '../tools/machine.mjs';

const [ROM, OUT] = process.argv.slice(2);
if (!ROM || !OUT) throw new Error('usage: node extract.mjs <rom> <out.json>');
const raw = (prog) => prog.map(([a, c, o]) => ({ a, c: (c << 3) | (o >> 5), op: o & 0x1f }));
const b = new Board(ROM).boot();
const out = [];
for (let p = 0; p < 90; p++) {
  b.recall(p);
  const first = JSON.stringify(b.program());
  let moving = 0;
  for (let t = 0; t < 30; t++) {
    b.run(200_000);
    if (JSON.stringify(b.program()) !== first) moving++;
  }
  const name = String.fromCharCode(...b.record(p).subarray(0x6a, 0x78)).replace(/\0/g, '').trim();
  out.push({ p, name, static: moving === 0, steps: raw(JSON.parse(first)) });
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${out.length} programs, ${out.filter((r) => r.static).length} static`);
