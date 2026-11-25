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

/** Starts of an unconfirmed slot before the boot stub goes back to the other (slots.h SLOT_TRIES). */
const SLOT_TRIES = 2
/** What a RAM boot would cost a base update flashed into the newest slot and not yet confirmed (the SLOTS reply,
 * upload-usb.ts parseBaseSlots), or undefined when it costs nothing. Every restart, a RAM boot's soft reset included,
 * runs the boot stub, which spends one of that slot's starts (stub.c, slots.c slot_pick); the base confirms its slot
 * only after 15 s up from it with a computer connected (flash.c confirm). With its starts spent the unit goes back to
 * the previous base, UPDATE UNDONE: on 20 November 2026 a site update not yet confirmed was lost to a developer's
 * RAM boots. `wait`: the update itself is running, so it confirms itself while this computer talks to it. */
export function bootOverPendingUpdate(slots) {
  if (slots?.layout !== 'two') return undefined
  const [a, b] = slots.slots
  const n = a.whole && b.whole ? (b.generation > a.generation ? 1 : 0) : a.whole ? 0 : b.whole ? 1 : -1
  if (n < 0 || slots.slots[n].confirmed || slots.slots[n].tries > SLOT_TRIES) return undefined
  const slot = 'AB'[n], left = SLOT_TRIES - slots.slots[n].tries, override = ' To boot anyway, add --spend-tries.'
  if (slots.running === n) return { wait: true, refusal: `The base update in slot ${slot} runs but has not confirmed itself (15 s after its start, ` +
    `with a computer connected). A RAM boot now spends ${left ? `one of its ${left} start${left > 1 ? 's' : ''} left` : 'it: it has no start left'}, ` +
    `and with none left the Octatrack goes back to the previous base. Leave it on for a moment, then boot again.${override}` }
  if (!left) return { warning: `The base update in slot ${slot} has no start left, so whatever restarts next goes back to the previous base. ` +
    'Install it again from modwerk.app afterwards.' }
  return { refusal: `The base update in slot ${slot} is not confirmed yet (${SLOT_TRIES - left} of its ${SLOT_TRIES} starts used). Every restart, ` +
    'a RAM boot included, spends one, and with none left the Octatrack goes back to the previous base. Power-cycle it so the update ' +
    `starts from its slot, keep USB connected for 15 s (npm run device -- status then shows it confirmed), and boot again.${override}` }
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
