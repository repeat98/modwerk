// SPDX-License-Identifier: GPL-3.0-or-later
// Reproduce every current source-only release export; never read firmware.
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reproducesExport } from './package-elemod-recipe.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = process.argv[2]
if (!output || process.argv.length !== 3) throw new Error('Usage: verify-elemod-release-exports.mjs COMPILED_DIRECTORY')
const inventory = JSON.parse(await readFile(resolve(output, 'elemod-build.json'), 'utf8'))
let checked = 0
for (const entry of inventory.artifacts) {
  if (!/^(digitakt|digitone)$/.test(entry.machine) || !/^[a-z][a-z0-9-]*$/.test(entry.id) || !/^[\w.-]+$/.test(entry.version) || !/^\d+\.\d+$/.test(entry.release) || entry.path !== `${entry.machine}/${entry.id}/${entry.release}.json`) throw new Error('Invalid artifact identity')
  const path = resolve(root, 'sdk/imports/packages', entry.id, `${entry.id}-${entry.version}-os${entry.release}.elemod`)
  try { await access(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  const plan = JSON.parse(await readFile(resolve(output, entry.path), 'utf8'))
  if (plan.id !== entry.id || plan.machine !== entry.machine || plan.version !== entry.version || plan.release !== entry.release) throw new Error('Artifact identity differs from inventory')
  if (!reproducesExport(await readFile(path, 'utf8'), plan)) throw new Error('Committed release does not reproduce: ' + path)
  checked++
}
if (!checked) throw new Error('No committed source-only release exports checked')
console.log(`Reproduced ${checked} current source-only release exports.`)
