// SPDX-License-Identifier: GPL-3.0-or-later
// npm run digi:link-all -- --machine digitakt|digitone [--core PATH.elemod] [--package PATH.elemod]... [--os VERSION] [--pairs] [--stock PATH]... [--json]
// Links every shipped module of a Digitakt mk1 or Digitone mk1 alone (and with --pairs, two at a time) against a core,
// the one a build picks today unless --core names another (src/engine/elekloader/digi-link-all.ts). Stockless unless
// --stock gives an owner's stock .syx for an OS; firmware is only read, never written or kept. --package puts a package file in
// place of the catalogue's packages of its id (a base's companions). Exits 1 on any failure.
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { failed, linkAll, MACHINES, summaryText, type Machine } from '../src/engine/elekloader/digi-link-all.ts'
import * as formats from '../src/engine/elektron/firmware-formats.ts'

const { values } = parseArgs({ options: {
  machine: { type: 'string' }, core: { type: 'string' }, os: { type: 'string' }, pairs: { type: 'boolean' },
  stock: { type: 'string', multiple: true }, package: { type: 'string', multiple: true }, json: { type: 'boolean' },
} })
if (!values.machine || !(values.machine in MACHINES)) {
  console.error('usage: npm run digi:link-all -- --machine digitakt|digitone [--core PATH.elemod] [--package PATH.elemod]... [--os VERSION] [--pairs] [--stock PATH]... [--json]')
  process.exit(2)
}
const machine = values.machine as Machine
const stock: Record<string, Uint8Array> = {}
for (const path of values.stock ?? []) {
  const [parsed, dev, rel] = await formats.load(new Uint8Array(readFileSync(path)))
  if (dev.key !== MACHINES[machine].key) throw new Error(`${path} is ${dev.name} OS ${rel.version}, not a ${MACHINES[machine].name} OS`)
  stock[rel.version] = formats.mainImage(parsed, dev)
}
const started = performance.now()
const result = linkAll({ machine, core: values.core, os: values.os, pairs: values.pairs, stock, packages: values.package })
process.stdout.write(values.json ? JSON.stringify(result, null, 2) + '\n' : summaryText(result))
console.error(`(${((performance.now() - started) / 1000).toFixed(1)} s)`)
process.exit(failed(result) ? 1 : 0)
