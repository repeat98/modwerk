import console from 'node:console';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
// Every factory program's 96 steps as JSON, for qvc_price.py.  node dumpall.mjs <rom> <out.json>
import { Board } from './machine.mjs';
import { decode } from './qv.mjs';
const [ROM, OUT = 'programs.json'] = process.argv.slice(2);
const b = new Board(ROM).boot();
const out = [];
for (let p = 0; p < 90; p++) {
  const d = decode(b.recall(p));
  out.push({ p, name: String.fromCharCode(...b.record(p).subarray(0x6a, 0x78)).replace(/\0/g, '').trim(), cfg: b.ram[0x392], steps: d });
}
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', out.length);
