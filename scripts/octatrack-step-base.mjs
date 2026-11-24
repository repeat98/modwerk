// SPDX-License-Identifier: GPL-3.0-or-later
// The step base for the command line (docs/OCTATRACK_TWO_SLOT_BASE.md, "A base too big for the unit's stage"). A base
// stages the next base in RAM and takes only what its own stage holds (its upload capacity): 1.25 MiB on every base
// before 13 November 2026. The site installs a larger base in two updates, the step base first (base-step.ts); these
// give `npm run device -- boot` and `flash` the same route: a refusal that says so before anything is sent, and the
// step base's build folder (`npm run octatrack:base -- --stock OS.bin --step --out DIR`).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { STEP_ASSETS, STEP_DEFAULT_LAYOUT, STEP_IDENTITIES } from '../src/engine/elekloader/base-step.ts'

const assets = resolve(import.meta.dirname, '../src/engine/assets')

/** Why the base on the unit cannot stage `bytes` of `what` (its upload capacity), or undefined when it can. `flashed`: it is
 * the flashed base a RAM-booted one fell back to (device.mjs boot), after the image was already sent once. */
export function stageRefusal(what, bytes, capacity, flashed = false) {
  if (!capacity || bytes <= capacity) return undefined
  return `${what} is ${bytes} bytes, more than the ${capacity} the ${flashed ? 'flashed base the unit came back on' : 'running base'} stages: ` +
    `${flashed ? 'not sent to it' : 'nothing was sent'}. ${flashed ? 'Flash' : 'Install'} the step base first ` +
    '(npm run octatrack:base -- --stock OS.bin --step --out STEP-DIR, then npm run device -- boot STEP-DIR and flash STEP-DIR), ' +
    'then boot and flash this base from it (docs/OCTATRACK_TWO_SLOT_BASE.md).'
}

/** The step base's build folder from the user's own OS 1.40C: NOT_FLASH_CANDIDATE.bin, MAIN.raw and proofs.json with
 * its identity, as `npm run device -- boot` and `flash` read them. Refuses assets that drifted from their pins and a
 * build that is not the published step base. */
export async function writeStepBase(stockPath, out) {
  if (existsSync(out)) throw new Error(out + ' exists: give --out a new directory.')
  // Built from the user's own OS: never inside a checkout, as octatrack-base.mjs --out.
  let tracked = true
  try { execFileSync('git', ['-C', dirname(resolve(out)), 'rev-parse', '--show-toplevel'], { stdio: 'pipe' }) } catch { tracked = false }
  if (tracked) throw new Error('Save firmware outside every Git checkout.')
  // The builder only here: device.mjs imports stageRefusal on every command.
  const formats = await import('../vendor/elekloader/kit/src/formats.ts')
  const { sha } = await import('../vendor/elekloader/kit/src/bytes.ts')
  const { buildBase } = await import('../src/engine/elekloader/octatrack-base.ts')
  const text = readFileSync(join(assets, 'octatrack-base-step.elemod'), 'utf8')
  const fills = readFileSync(join(assets, 'octatrack-base-step-fills.json'), 'utf8')
  if (sha(new TextEncoder().encode(text)) !== STEP_ASSETS.package || sha(new TextEncoder().encode(fills)) !== STEP_ASSETS.fills)
    throw new Error('The step base assets differ from their pins (base-step.ts).')
  const stock = new Uint8Array(readFileSync(stockPath))
  const built = await buildBase(stock, text, JSON.parse(fills))
  if (built.base !== STEP_IDENTITIES[STEP_DEFAULT_LAYOUT]) throw new Error('The step base did not build as published: ' + built.base)
  const [, device] = await formats.load(stock)
  mkdirSync(out)  // new, so nothing is overwritten
  writeFileSync(join(out, 'NOT_FLASH_CANDIDATE.bin'), built.bin)
  writeFileSync(join(out, 'MAIN.raw'), formats.mainImage(formats.parse(built.bin, device), device))
  writeFileSync(join(out, 'proofs.json'), JSON.stringify({ configurationHash: built.base, step: true }, null, 2) + '\n')
  return built
}
