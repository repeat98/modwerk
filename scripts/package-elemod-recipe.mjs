// SPDX-License-Identifier: GPL-3.0-or-later
// Export explicit, source-authored patch recipes without reading firmware.
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { explicitSite } from '../src/catalog/elemod-site-recipe.ts'
import { parseElemod } from '../src/engine/elektron/elemod.ts'

export function packageRecipe(plan) {
  if (plan.schemaVersion !== 1 || plan.derive || plan.stockResumes?.length || plan.stockRoutineBindings || plan.module.sites?.length) throw new Error('Only source-only, explicit patch recipes can be exported')
  const parsed = parseElemod(plan.module)
  if (parsed.format !== 2 || parsed.id !== plan.id || parsed.version !== plan.version || parsed.release.version !== plan.release || parsed.device.machine !== plan.machine) throw new Error('Recipe identity mismatch')
  const sites = plan.sites.map(site => {
    if (site.op === 'keep2') throw new Error('Stock-dependent operations must remain local: keep2')
    return explicitSite(site)
  })
  const module = { ...plan.module, sites }
  parseElemod(module)
  return module
}

export const exportText = recipe => JSON.stringify(recipe, null, 1) + '\n'

/**
 * Whether `committed` is the export of `plan`. An export published before the optional `resources.core` field existed keeps its
 * bytes, because hardware evidence binds their hash ("byte-identical to tested candidate"). A source rebuild reproduces such an
 * export when it differs only by that one added field. The field is metadata: the linked image does not change.
 */
export function reproducesExport(committed, plan) {
  const recipe = packageRecipe(plan)
  if (committed === exportText(recipe)) return true
  const { core, ...resources } = recipe.resources
  return core !== undefined && committed === exportText({ ...recipe, resources })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [recipe, output, mode] = process.argv.slice(2)
  if (!recipe || !output || process.argv.length > 5 || (mode && mode !== '--check')) throw new Error('Usage: node scripts/package-elemod-recipe.mjs RECIPE.json OUTPUT.elemod [--check]')
  const plan = JSON.parse(await readFile(recipe, 'utf8'))
  if (mode === '--check') {
    if (!reproducesExport(await readFile(output, 'utf8'), plan)) throw new Error('Committed package does not reproduce from source: ' + output)
  } else await writeFile(output, exportText(packageRecipe(plan)), { flag: 'wx' })
}
