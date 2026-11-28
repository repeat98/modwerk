// tools/qv.mjs's floating-point model of the original on one program of extract.mjs's output, for check_model.py:
// the input is a JSON list of samples (fractions of full scale), the output {left, right} the same length.
//   node float_ir.mjs <programs.json> <program> <input.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { QV } from '../tools/qv.mjs';

const [PROGS, P, IN, OUT] = process.argv.slice(2);
const row = JSON.parse(readFileSync(PROGS, 'utf8')).find((r) => r.p === Number(P));
const q = new QV(row.steps.map(({ a, c, op }) => ({ a, k: c / 2048, op })));
const left = [], right = [];
for (const x of JSON.parse(readFileSync(IN, 'utf8'))) {
  const [l, r] = q.sample(x);
  left.push(l);
  right.push(r);
}
writeFileSync(OUT, JSON.stringify({ left, right }));
