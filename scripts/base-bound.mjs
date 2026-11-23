// SPDX-License-Identifier: GPL-3.0-or-later
// Whether the base-bound Octatrack packages name the committed base. A package with `base: true` links against one exact
// base and names it as `requiredBase`; a base change gives the base a new identity (base-binding.json), and the site
// refuses a package that still names the old one. sdk/tests/test_base_bound.py and test_base_bound_trust.py prove the
// same and the bytes, but they run late in sdk:check. This compares the two committed files, so npm run check names the
// relink in its first stage, beside the base size (scripts/base-size.mjs).
//
//   node scripts/base-bound.mjs   Base-bound packages: 5 name the committed base 6d23e888
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGES = 'src/engine/assets/octatrack-module-packages.json'
export const BINDING = 'sdk/machines/octatrack/base-binding.json'
const FIX = 'relink them with npm run octatrack:module-packages -- --base-only (needs the ColdFire tools and the Elekloader checkout) and commit ' +
  PACKAGES + '; a package held back by lagsBehind keeps its bytes, so set its requiredBase to base-binding.json\'s identity by hand ' +
  '(docs/DEVELOPER_WORKFLOW.md, "Conflicts in Octatrack base and package assets")'

/** The line to print and what is wrong, from the committed package manifest and base binding. */
export function baseBoundReport({ packages, binding }) {
  const bound = packages.packages.filter(entry => entry.base), identity = binding.identity
  const stale = bound.filter(entry => entry.requiredBase !== identity)
  const named = entry => `${entry.id} ${entry.version} (${entry.requiredBase ? entry.requiredBase.slice(0, 8) : 'no requiredBase'})`
  return {
    line: `Base-bound packages: ${bound.length - stale.length} of ${bound.length} name the committed base ${identity.slice(0, 8)}`,
    problems: stale.length ? [`${stale.map(named).join(', ')} ${stale.length === 1 ? 'names' : 'name'} another base than the committed ${identity.slice(0, 8)}: ${FIX}.`] : [],
  }
}

const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
/** npm run check: the line, or an error naming every stale package and the fix. */
export function checkBaseBound(root) {
  const { line, problems } = baseBoundReport({ packages: readJson(root, PACKAGES), binding: readJson(root, BINDING) })
  if (problems.length) throw new Error(problems.join(' '))
  return line
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(checkBaseBound(fileURLToPath(new URL('..', import.meta.url)))) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
